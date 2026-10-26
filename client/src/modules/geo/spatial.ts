/**
 * Geospatial utilities for point-in-polygon and bounding box operations.
 * Uses Turf.js for robust geometry calculations.
 */
import * as turf from '@turf/turf';
import type { AmenityFeature, AmenitiesByCategory, CatchmentStats, AmenityCategory } from '../../types';

/**
 * Compute which amenities fall within each isochrone ring.
 * Uses the GeoJSON polygons from the isochrone/fallback response.
 */
export function computeCatchmentStats(
  amenities: AmenitiesByCategory,
  isochroneFeatures: GeoJSON.Feature[],
): CatchmentStats[] {
  // Sort features by contour/minutes/value (ascending) to get 5 < 10 < 15
  const sorted = [...isochroneFeatures].sort((a, b) => {
    const av = (a.properties?.contour ?? a.properties?.minutes ?? a.properties?.value ?? 0) as number;
    const bv = (b.properties?.contour ?? b.properties?.minutes ?? b.properties?.value ?? 0) as number;
    return av - bv;
  });

  const allAmenities: AmenityFeature[] = (Object.values(amenities) as AmenityFeature[][]).flat();

  return sorted.map((feature, idx) => {
    const minutes = (feature.properties?.minutes ?? feature.properties?.contour ?? [5, 10, 15][idx]) as 5 | 10 | 15;
    const polygon = feature.geometry as GeoJSON.Polygon | GeoJSON.MultiPolygon;

    const byCategory: Partial<Record<AmenityCategory, number>> = {};
    let total = 0;

    for (const amenity of allAmenities) {
      const pt = turf.point([amenity.lon, amenity.lat]);
      const inside = turf.booleanPointInPolygon(pt, polygon as any);
      if (inside) {
        byCategory[amenity.category] = (byCategory[amenity.category] ?? 0) + 1;
        total++;
      }
    }

    const categoriesPresent = Object.values(byCategory).filter((v) => (v ?? 0) > 0).length;
    const diversityScore = Math.round((categoriesPresent / 8) * 100);

    return { minutes, totalAmenities: total, byCategory, diversityScore };
  });
}

/**
 * Compute bounding box for the largest (15-min) isochrone with a small buffer.
 */
export function getIsochroneBBox(features: GeoJSON.Feature[]): [number, number, number, number] | null {
  if (!features.length) return null;

  try {
    const collection = turf.featureCollection(features);
    const bbox = turf.bbox(collection);
    const buffered = turf.bboxPolygon(bbox);
    const bufferedResult = turf.buffer(buffered, 0.2, { units: 'kilometers' });
    if (!bufferedResult) return bbox as [number, number, number, number];
    const bufferedBbox = turf.bbox(bufferedResult);
    return bufferedBbox as [number, number, number, number];
  } catch {
    return null;
  }
}
