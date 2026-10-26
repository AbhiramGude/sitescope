/**
 * Accessibility Scoring Engine
 * Deterministic, transparent scoring system with configurable weights.
 * All weights are provisional prototype values, not scientifically validated standards.
 */

import type {
  AmenityFeature,
  AmenitiesByCategory,
  CatchmentStats,
  AccessibilityScore,
  ScoreComponent,
} from '../../types';

// Configurable weights (must sum to 1.0)
const WEIGHTS = {
  amenityDiversity: 0.25,
  essentialServices: 0.25,
  publicTransport: 0.20,
  dailyNeeds: 0.15,
  parksRecreation: 0.10,
  civicCommunity: 0.05,
} as const;

// Thresholds for normalisation (15-min catchment primary)
const THRESHOLDS = {
  // Amenity diversity: # unique categories with at least 1 amenity (out of 8)
  diversityMax: 8,

  // Essential services: combined education + healthcare in 15 min
  essentialMax: 20,

  // Transport: stops within 10 min
  transportMax: 15,

  // Daily needs: grocery + food within 10 min
  dailyMax: 20,

  // Parks: leisure within 15 min
  parksMax: 10,

  // Civic: community facilities within 15 min
  civicMax: 8,
};

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

function normalise(value: number, max: number): number {
  if (max === 0) return 0;
  return clamp01(value / max);
}

export function computeAccessibilityScore(
  amenities: AmenitiesByCategory,
  catchmentStats: CatchmentStats[],
): AccessibilityScore {
  const stats15 = catchmentStats.find((s) => s.minutes === 15);
  const stats10 = catchmentStats.find((s) => s.minutes === 10);
  const stats5 = catchmentStats.find((s) => s.minutes === 5);

  const by15 = stats15?.byCategory ?? {};
  const by10 = stats10?.byCategory ?? {};

  // Count available data categories
  const allCats = Object.values(amenities) as AmenityFeature[][];
  const availableCats = allCats.filter((arr) => arr.length > 0).length;
  const dataCompleteness = availableCats / 8;

  // ─── 1. Amenity Diversity (25%) ─────────────────────────────────────────
  const diversityCount = Object.entries(by15).filter(([, v]) => (v ?? 0) > 0).length;
  const diversityRaw = normalise(diversityCount, THRESHOLDS.diversityMax) * 100;

  const diversity: ScoreComponent = {
    key: 'amenityDiversity',
    label: 'Amenity Diversity',
    weight: WEIGHTS.amenityDiversity,
    rawScore: diversityRaw,
    weightedScore: diversityRaw * WEIGHTS.amenityDiversity,
    measurement: `${diversityCount} of 8 categories present within 15-min catchment`,
    explanation: 'Measures how many different types of amenities are present nearby, reflecting overall neighbourhood completeness.',
    dataAvailable: true,
  };

  // ─── 2. Essential Services (25%) ─────────────────────────────────────────
  const education15 = by15.education ?? 0;
  const healthcare15 = by15.healthcare ?? 0;
  const essentialTotal = education15 + healthcare15;
  const essentialRaw = normalise(essentialTotal, THRESHOLDS.essentialMax) * 100;
  const essentialAvail = amenities.education.length + amenities.healthcare.length > 0;

  const essential: ScoreComponent = {
    key: 'essentialServices',
    label: 'Essential Services',
    weight: WEIGHTS.essentialServices,
    rawScore: essentialRaw,
    weightedScore: essentialRaw * WEIGHTS.essentialServices,
    measurement: `${education15} education + ${healthcare15} healthcare within 15 min`,
    explanation: 'Schools, hospitals, clinics, and pharmacies accessible within a 15-minute walk.',
    dataAvailable: essentialAvail,
  };

  // ─── 3. Public Transport (20%) ────────────────────────────────────────────
  const transport10 = by10.transport ?? 0;
  const transportRaw = normalise(transport10, THRESHOLDS.transportMax) * 100;
  const transportAvail = amenities.transport.length >= 0; // always attempt

  const transport: ScoreComponent = {
    key: 'publicTransport',
    label: 'Public Transport Access',
    weight: WEIGHTS.publicTransport,
    rawScore: transportRaw,
    weightedScore: transportRaw * WEIGHTS.publicTransport,
    measurement: `${transport10} stops/stations within 10-min walk`,
    explanation: 'Number of bus stops, rail stations, and transit nodes reachable within 10 minutes.',
    dataAvailable: transportAvail,
  };

  // ─── 4. Daily Needs (15%) ─────────────────────────────────────────────────
  const grocery10 = by10.grocery ?? 0;
  const food10 = by10.food ?? 0;
  const dailyTotal = grocery10 + food10;
  const dailyRaw = normalise(dailyTotal, THRESHOLDS.dailyMax) * 100;
  const dailyAvail = amenities.grocery.length + amenities.food.length > 0;

  const daily: ScoreComponent = {
    key: 'dailyNeeds',
    label: 'Daily Needs Accessibility',
    weight: WEIGHTS.dailyNeeds,
    rawScore: dailyRaw,
    weightedScore: dailyRaw * WEIGHTS.dailyNeeds,
    measurement: `${grocery10} grocery + ${food10} food within 10 min`,
    explanation: 'Supermarkets, convenience stores, cafés, and restaurants accessible for daily errands.',
    dataAvailable: dailyAvail,
  };

  // ─── 5. Parks & Recreation (10%) ──────────────────────────────────────────
  const parks15 = by15.parks ?? 0;
  const parksRaw = normalise(parks15, THRESHOLDS.parksMax) * 100;
  const parksAvail = amenities.parks.length > 0;

  const parks: ScoreComponent = {
    key: 'parksRecreation',
    label: 'Parks & Recreation',
    weight: WEIGHTS.parksRecreation,
    rawScore: parksRaw,
    weightedScore: parksRaw * WEIGHTS.parksRecreation,
    measurement: `${parks15} parks/leisure within 15 min`,
    explanation: 'Public parks, playgrounds, sports facilities, and green spaces for recreation.',
    dataAvailable: parksAvail,
  };

  // ─── 6. Civic & Community (5%) ────────────────────────────────────────────
  const civic15 = by15.civic ?? 0;
  const civicRaw = normalise(civic15, THRESHOLDS.civicMax) * 100;
  const civicAvail = amenities.civic.length > 0;

  const civic: ScoreComponent = {
    key: 'civicCommunity',
    label: 'Civic & Community',
    weight: WEIGHTS.civicCommunity,
    rawScore: civicRaw,
    weightedScore: civicRaw * WEIGHTS.civicCommunity,
    measurement: `${civic15} civic facilities within 15 min`,
    explanation: 'Community centres, town halls, post offices, places of worship, and social services.',
    dataAvailable: civicAvail,
  };

  const components = [diversity, essential, transport, daily, parks, civic];
  const overall = Math.round(components.reduce((sum, c) => sum + c.weightedScore, 0));

  // Identify gaps
  const gaps: string[] = [];
  if (education15 === 0) gaps.push('No educational facilities recorded within 15-min walk');
  if (healthcare15 === 0) gaps.push('No healthcare facilities recorded within 15-min walk');
  if (transport10 === 0) gaps.push('No public transport stops recorded within 10-min walk');
  if (grocery10 === 0) gaps.push('No grocery or food shops recorded within 10-min walk');
  if (parks15 === 0) gaps.push('No parks or recreational spaces recorded within 15-min walk');
  if (civic15 === 0) gaps.push('No civic or community facilities recorded within 15-min walk');
  if (!essentialAvail || !dailyAvail) {
    gaps.push('Some data categories may be incomplete — gaps may reflect data limitations rather than actual absence');
  }

  return {
    overall,
    components,
    gaps,
    dataCompleteness,
  };
}

/**
 * Compute suitability scores for building typologies.
 * Uses a deterministic model based on measured data.
 */
export function computeTypologySuitability(
  score: AccessibilityScore,
  catchmentStats: CatchmentStats[],
  amenities: AmenitiesByCategory,
): Record<string, number> {
  const c = score.components;
  const getScore = (key: string) => c.find((x) => x.key === key)?.rawScore ?? 0;

  const diversity = getScore('amenityDiversity');
  const essential = getScore('essentialServices');
  const transport = getScore('publicTransport');
  const daily = getScore('dailyNeeds');
  const parksRec = getScore('parksRecreation');
  const civic = getScore('civicCommunity');

  const stats15 = catchmentStats.find((s) => s.minutes === 15);
  const employment15 = stats15?.byCategory.employment ?? 0;
  const employmentScore = Math.min(100, (employment15 / 15) * 100);

  return {
    Residential: Math.round(0.25 * daily + 0.25 * essential + 0.25 * parksRec + 0.25 * transport),
    'Mixed-use': Math.round(0.3 * diversity + 0.25 * transport + 0.25 * employmentScore + 0.2 * daily),
    'Commercial/Office': Math.round(0.4 * transport + 0.3 * employmentScore + 0.3 * daily),
    'Retail and Daily Services': Math.round(0.4 * transport + 0.3 * diversity + 0.3 * daily),
    'Educational/Institutional': Math.round(0.35 * transport + 0.35 * essential + 0.3 * civic),
    Healthcare: Math.round(0.4 * transport + 0.3 * essential + 0.3 * diversity),
    'Community and Recreation': Math.round(0.35 * civic + 0.35 * parksRec + 0.3 * transport),
  };
}
