import { Router, Request, Response } from 'express';

const router = Router();

const MAPBOX_ISOCHRONE_BASE = 'https://api.mapbox.com/isochrone/v1/mapbox/walking';

interface IsochroneRequestBody {
  longitude?: number;
  latitude?: number;
  allowFallback?: boolean;
}

/**
 * Validates coordinate bounds for Mapbox Web Mercator projection.
 */
function isValidCoordinates(lng: any, lat: any): boolean {
  if (typeof lng !== 'number' || typeof lat !== 'number') return false;
  if (!Number.isFinite(lng) || !Number.isFinite(lat)) return false;
  if (lng < -180 || lng > 180) return false;
  if (lat < -85.05112878 || lat > 85.05112878) return false;
  return true;
}

router.post('/', async (req: Request<{}, {}, IsochroneRequestBody>, res: Response) => {
  const { longitude, latitude, allowFallback = false } = req.body;

  // 1. Validate coordinates
  if (!isValidCoordinates(longitude, latitude)) {
    return res.status(400).json({
      error: 'Invalid coordinates: longitude must be between -180 and 180, and latitude between -85.05 and 85.05.',
      code: 'INVALID_COORDINATES',
    });
  }

  const lng = longitude as number;
  const lat = latitude as number;

  // 2. Validate Mapbox access token
  const token = process.env.MAPBOX_ACCESS_TOKEN?.trim();
  const isMissingToken = !token || token === 'your_mapbox_access_token_here';

  if (isMissingToken) {
    if (allowFallback) {
      return res.status(200).json({
        type: 'fallback',
        provider: 'approximate',
        message: 'Mapbox access token is not configured. Showing approximate geometric buffer (non-network based).',
        geojson: generateFallbackCircles(lng, lat),
      });
    }

    return res.status(401).json({
      error: 'Mapbox access token is not configured. Please set MAPBOX_ACCESS_TOKEN in server/.env.',
      code: 'MISSING_MAPBOX_TOKEN',
      allowFallbackAvailable: true,
    });
  }

  // 3. Request walking isochrones from Mapbox (longitude,latitude order)
  try {
    const url = new URL(`${MAPBOX_ISOCHRONE_BASE}/${encodeURIComponent(lng)},${encodeURIComponent(lat)}`);
    url.searchParams.set('contours_minutes', '5,10,15');
    url.searchParams.set('polygons', 'true');
    url.searchParams.set('contours_colors', '16B8AD,16B8AD,16B8AD');
    url.searchParams.set('denoise', '1');
    url.searchParams.set('generalize', '0');
    url.searchParams.set('access_token', token);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000);

    let response: globalThis.Response;
    try {
      response = await fetch(url.toString(), {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'SiteScope/1.0 (Architecture Accessibility Intelligence)',
        },
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeoutId);
    }

    // 4. Handle HTTP error codes
    if (!response.ok) {
      const status = response.status;
      let userMessage = `Mapbox API returned status ${status}.`;
      let errorCode = 'MAPBOX_ERROR';

      if (status === 401) {
        userMessage = 'Invalid Mapbox access token. Please verify MAPBOX_ACCESS_TOKEN in server/.env.';
        errorCode = 'MAPBOX_AUTH_ERROR';
      } else if (status === 403) {
        userMessage = 'Mapbox access forbidden. Please check account permissions or token scopes.';
        errorCode = 'MAPBOX_FORBIDDEN';
      } else if (status === 429) {
        userMessage = 'Mapbox rate limit reached. Please wait a moment and try again.';
        errorCode = 'MAPBOX_RATE_LIMIT';
      } else if (status === 422) {
        userMessage = 'Mapbox could not generate walking isochrones for this location (unroutable location or no pedestrian pathways).';
        errorCode = 'MAPBOX_UNROUTABLE';
      }

      console.error(`[Isochrones] Mapbox API error (${status}): ${errorCode}`);

      if (allowFallback) {
        return res.status(200).json({
          type: 'fallback',
          provider: 'approximate',
          message: `${userMessage} Showing approximate geometric buffer (non-network based).`,
          geojson: generateFallbackCircles(lng, lat),
        });
      }

      return res.status(status === 429 ? 429 : 502).json({
        error: userMessage,
        code: errorCode,
        status,
        allowFallbackAvailable: true,
      });
    }

    // 5. Parse and validate GeoJSON
    const data: any = await response.json();
    if (!data || data.type !== 'FeatureCollection' || !Array.isArray(data.features) || data.features.length === 0) {
      if (allowFallback) {
        return res.status(200).json({
          type: 'fallback',
          provider: 'approximate',
          message: 'Received empty isochrone response from Mapbox. Showing approximate geometric buffer.',
          geojson: generateFallbackCircles(lng, lat),
        });
      }
      return res.status(502).json({
        error: 'Mapbox returned an empty or invalid isochrone response.',
        code: 'MAPBOX_MALFORMED_RESPONSE',
        allowFallbackAvailable: true,
      });
    }

    // 6. Normalize features: ensure contour, minutes, value, label, and order
    // Order features so larger catchments (15) are at the base, and smaller (5) on top
    const normalizedFeatures = data.features.map((feat: any) => {
      const minutes = Number(feat.properties?.contour ?? 0);
      return {
        ...feat,
        properties: {
          ...feat.properties,
          minutes,
          contour: minutes,
          value: minutes * 60, // in seconds for backwards compatibility
          label: `${minutes} min walk`,
          isFallback: false,
        },
      };
    });

    // Sort ascending by minutes: [5, 10, 15]
    normalizedFeatures.sort((a: any, b: any) => (a.properties.minutes - b.properties.minutes));

    return res.json({
      type: 'isochrone',
      provider: 'mapbox',
      geojson: {
        type: 'FeatureCollection',
        features: normalizedFeatures,
      },
    });
  } catch (err: any) {
    const isTimeout = err.name === 'AbortError';
    const message = isTimeout
      ? 'Mapbox API request timed out (8s). Please check your internet connection.'
      : 'Could not connect to Mapbox API routing service.';

    console.error(`[Isochrones] Network/fetch error: ${err.message}`);

    if (allowFallback) {
      return res.status(200).json({
        type: 'fallback',
        provider: 'approximate',
        message: `${message} Showing approximate geometric buffer (non-network based).`,
        geojson: generateFallbackCircles(lng, lat),
      });
    }

    return res.status(504).json({
      error: message,
      code: isTimeout ? 'MAPBOX_TIMEOUT' : 'MAPBOX_NETWORK_ERROR',
      allowFallbackAvailable: true,
    });
  }
});

/**
 * Generate circular GeoJSON features as an explicit approximate fallback.
 * Approximate walking radii: 5min ≈ 400m, 10min ≈ 800m, 15min ≈ 1200m (at 4.8 km/h).
 * Explicitly tagged with isFallback = true and label = 'X min (approx.)'.
 */
export function generateFallbackCircles(lng: number, lat: number) {
  const radii = [400, 800, 1200]; // metres
  const minutes = [5, 10, 15];
  const features = radii.map((radius, i) => ({
    type: 'Feature',
    properties: {
      value: minutes[i] * 60,
      contour: minutes[i],
      minutes: minutes[i],
      label: `${minutes[i]} min (approx.)`,
      isFallback: true,
    },
    geometry: createCircle(lng, lat, radius),
  }));

  return {
    type: 'FeatureCollection',
    features,
  };
}

function createCircle(lng: number, lat: number, radiusMeters: number) {
  const points = 64;
  const coords: number[][] = [];
  const earthRadius = 6371000;
  const latRad = (lat * Math.PI) / 180;

  for (let i = 0; i <= points; i++) {
    const angle = (i * 2 * Math.PI) / points;
    const dx = radiusMeters * Math.cos(angle);
    const dy = radiusMeters * Math.sin(angle);
    const newLat = lat + (dy / earthRadius) * (180 / Math.PI);
    const newLng = lng + (dx / (earthRadius * Math.cos(latRad))) * (180 / Math.PI);
    coords.push([newLng, newLat]);
  }

  return { type: 'Polygon', coordinates: [coords] };
}

export { router as isochronesRouter };
