/**
 * API client functions for the SiteScope backend.
 */
import type {
  IsochroneResult,
  AmenitiesByCategory,
  GeminiAnalysis,
  AccessibilityScore,
  CatchmentStats,
} from '../../types';

const BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(options?.headers ?? {}),
    },
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
    throw new Error(body.error || body.message || `Request failed: ${res.status}`);
  }

  return res.json();
}

// ─── Geocoding ──────────────────────────────────────────────────────────────

export interface GeocodingResult {
  place_id: number;
  display_name: string;
  lat: string;
  lon: string;
  type: string;
  address: Record<string, string>;
}

export async function searchLocation(query: string): Promise<GeocodingResult[]> {
  return apiFetch<GeocodingResult[]>(`/api/geocode/search?q=${encodeURIComponent(query)}`);
}

export async function reverseGeocode(lat: number, lon: number): Promise<{ display_name: string }> {
  return apiFetch(`/api/geocode/reverse?lat=${lat}&lon=${lon}`);
}

// ─── Isochrones ─────────────────────────────────────────────────────────────

export interface FetchIsochronesOptions {
  allowFallback?: boolean;
  signal?: AbortSignal;
}

export async function fetchIsochrones(
  lat: number,
  lng: number,
  options?: FetchIsochronesOptions,
): Promise<IsochroneResult> {
  return apiFetch<IsochroneResult>('/api/isochrones', {
    method: 'POST',
    body: JSON.stringify({
      latitude: lat,
      longitude: lng,
      allowFallback: options?.allowFallback ?? false,
    }),
    signal: options?.signal,
  });
}

// ─── Amenities ──────────────────────────────────────────────────────────────

export interface AmenitiesResponse {
  categories: AmenitiesByCategory;
  totalElements: number;
  dataSource: string;
  attribution: string;
  timestamp: string;
}

export async function fetchAmenities(
  bbox: [number, number, number, number],
): Promise<AmenitiesResponse> {
  return apiFetch<AmenitiesResponse>('/api/amenities', {
    method: 'POST',
    body: JSON.stringify({ bbox }),
  });
}

// ─── Gemini ─────────────────────────────────────────────────────────────────

export interface GeminiPayload {
  siteData: {
    coordinates: { lat: number; lng: number };
    label: string;
    accessibilityScore: number;
    scoreComponents: any[];
    catchments: CatchmentStats[];
    amenityCounts: Partial<Record<string, number>>;
    amenityDiversity: Record<string, number>;
    gaps: string[];
    dataCompleteness: number;
    isochroneType: string;
  };
}

export async function fetchGeminiAnalysis(payload: GeminiPayload): Promise<{ analysis: GeminiAnalysis }> {
  return apiFetch<{ analysis: GeminiAnalysis }>('/api/gemini/analyse', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}
