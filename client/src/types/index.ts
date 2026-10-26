// Core geographic types
export interface LatLng {
  lat: number;
  lng: number;
}

export interface Site {
  coordinates: LatLng;
  label: string;
  address?: string;
}

// Amenity categories
export type AmenityCategory =
  | 'education'
  | 'healthcare'
  | 'transport'
  | 'grocery'
  | 'food'
  | 'parks'
  | 'civic'
  | 'employment';

export interface AmenityFeature {
  id: number;
  type: string;
  lat: number;
  lon: number;
  name: string | null;
  category: AmenityCategory;
  tags: Record<string, string | undefined>;
}

export type AmenitiesByCategory = Record<AmenityCategory, AmenityFeature[]>;

// Isochrone data
export type IsochroneType = 'isochrone' | 'fallback';

export interface IsochroneResult {
  type: IsochroneType;
  provider?: 'mapbox' | 'approximate';
  message?: string;
  geojson: GeoJSON.FeatureCollection;
}

// Catchment stats (computed after we know which amenities fall within each ring)
export interface CatchmentStats {
  minutes: 5 | 10 | 15;
  totalAmenities: number;
  byCategory: Partial<Record<AmenityCategory, number>>;
  diversityScore: number; // 0-100
}

// Scoring engine types
export interface ScoreComponent {
  key: string;
  label: string;
  weight: number;
  rawScore: number; // 0–100 normalised
  weightedScore: number;
  measurement: string;
  explanation: string;
  dataAvailable: boolean;
}

export interface AccessibilityScore {
  overall: number;
  components: ScoreComponent[];
  gaps: string[];
  dataCompleteness: number; // 0–1
}

// Gemini typology recommendation
export interface TypologyRecommendation {
  typology: string;
  suitability_score: number;
  evidence: string[];
  advantages: string[];
  limitations: string[];
  missing_information: string[];
  recommendation_summary: string;
}

export interface GeminiAnalysis {
  accessibility_interpretation: string;
  key_strengths: string[];
  key_gaps: string[];
  confidence_explanation: string;
  data_limitations: string;
  typology_recommendations: TypologyRecommendation[];
}

// App state
export type AppView = 'map' | 'analysis' | 'recommendations';
export type Theme = 'light' | 'dark';

export interface AppState {
  site: Site | null;
  isochrones: IsochroneResult | null;
  amenities: AmenitiesByCategory | null;
  catchmentStats: CatchmentStats[] | null;
  accessibilityScore: AccessibilityScore | null;
  geminiAnalysis: GeminiAnalysis | null;
  activeCategories: Set<AmenityCategory>;
  activeCatchments: Set<5 | 10 | 15>;
  view: AppView;
  theme: Theme;
  loading: {
    isochrones: boolean;
    amenities: boolean;
    gemini: boolean;
  };
  errors: {
    isochrones?: string;
    amenities?: string;
    gemini?: string;
  };
}

// Category metadata
export interface CategoryMeta {
  key: AmenityCategory;
  label: string;
  icon: string;
  color: string;
}

export const CATEGORY_META: CategoryMeta[] = [
  { key: 'education', label: 'Education', icon: '🎓', color: '#4A90E2' },
  { key: 'healthcare', label: 'Healthcare', icon: '🏥', color: '#E74C3C' },
  { key: 'transport', label: 'Public Transport', icon: '🚌', color: '#9B59B6' },
  { key: 'grocery', label: 'Grocery & Retail', icon: '🛒', color: '#27AE60' },
  { key: 'food', label: 'Food & Dining', icon: '🍽️', color: '#F39C12' },
  { key: 'parks', label: 'Parks & Recreation', icon: '🌳', color: '#1ABC9C' },
  { key: 'civic', label: 'Civic & Community', icon: '🏛️', color: '#E67E22' },
  { key: 'employment', label: 'Employment', icon: '🏢', color: '#34495E' },
];

export const ALL_CATEGORIES: AmenityCategory[] = CATEGORY_META.map((c) => c.key);
