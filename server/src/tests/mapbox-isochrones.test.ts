/**
 * Comprehensive test suite for Mapbox Isochrone API integration.
 * Tests request construction, coordinate ordering, GeoJSON parsing,
 * error handling, token validation, and approximate fallback behavior.
 * Uses mocked HTTP responses to ensure no live Mapbox token is required.
 */
import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import express from 'express';
import { isochronesRouter, generateFallbackCircles } from '../routes/isochrones';

// Mock GeoJSON response mimicking Mapbox Isochrone API
const mockMapboxResponse = {
  type: 'FeatureCollection',
  features: [
    {
      type: 'Feature',
      properties: {
        contour: 15,
        color: '#16B8AD',
        metric: 'time',
      },
      geometry: {
        type: 'Polygon',
        coordinates: [
          [
            [13.37, 52.50],
            [13.39, 52.50],
            [13.39, 52.52],
            [13.37, 52.52],
            [13.37, 52.50],
          ],
        ],
      },
    },
    {
      type: 'Feature',
      properties: {
        contour: 10,
        color: '#16B8AD',
        metric: 'time',
      },
      geometry: {
        type: 'Polygon',
        coordinates: [
          [
            [13.375, 52.505],
            [13.385, 52.505],
            [13.385, 52.515],
            [13.375, 52.515],
            [13.375, 52.505],
          ],
        ],
      },
    },
    {
      type: 'Feature',
      properties: {
        contour: 5,
        color: '#16B8AD',
        metric: 'time',
      },
      geometry: {
        type: 'Polygon',
        coordinates: [
          [
            [13.378, 52.508],
            [13.382, 52.508],
            [13.382, 52.512],
            [13.378, 52.512],
            [13.378, 52.508],
          ],
        ],
      },
    },
  ],
};

function createTestApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/isochrones', isochronesRouter);
  return app;
}

describe('Mapbox Isochrone API Integration', () => {
  let originalToken: string | undefined;
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalToken = process.env.MAPBOX_ACCESS_TOKEN;
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    process.env.MAPBOX_ACCESS_TOKEN = originalToken;
    globalThis.fetch = originalFetch;
  });

  it('1. Coordinate validation: rejects invalid coordinates with 400', async () => {
    const app = createTestApp();
    const server = app.listen(0);
    const port = (server.address() as any).port;

    try {
      // Latitude out of bounds (> 85.05)
      const res = await originalFetch(`http://localhost:${port}/api/isochrones`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ longitude: 13.38, latitude: 95.0 }),
      });

      assert.strictEqual(res.status, 400);
      const data: any = await res.json();
      assert.strictEqual(data.code, 'INVALID_COORDINATES');
      assert.match(data.error, /latitude between -85\.05 and 85\.05/);
    } finally {
      server.close();
    }
  });

  it('2. Coordinate ordering & Request construction: calls Mapbox with longitude,latitude', async () => {
    process.env.MAPBOX_ACCESS_TOKEN = 'pk.test_mock_token_12345';

    let requestedUrl = '';
    globalThis.fetch = (async (url: string | URL, options?: any) => {
      const urlStr = url.toString();
      if (urlStr.includes('api.mapbox.com')) {
        requestedUrl = urlStr;
        return {
          ok: true,
          status: 200,
          json: async () => mockMapboxResponse,
        } as any;
      }
      return originalFetch(url, options);
    }) as any;

    const app = createTestApp();
    const server = app.listen(0);
    const port = (server.address() as any).port;

    const targetLng = 13.3777;
    const targetLat = 52.5098;

    try {
      const res = await originalFetch(`http://localhost:${port}/api/isochrones`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ longitude: targetLng, latitude: targetLat }),
      });

      assert.strictEqual(res.status, 200);
      const data: any = await res.json();

      // Verify coordinate ordering: longitude must precede latitude
      const expectedCoordPath = `/mapbox/walking/${encodeURIComponent(targetLng)},${encodeURIComponent(targetLat)}`;
      assert.ok(requestedUrl.includes(expectedCoordPath), `URL does not contain longitude,latitude in order: ${requestedUrl}`);

      // Verify required Mapbox query parameters
      assert.ok(requestedUrl.includes('contours_minutes=5%2C10%2C15') || requestedUrl.includes('contours_minutes=5,10,15'));
      assert.ok(requestedUrl.includes('polygons=true'));
      assert.ok(requestedUrl.includes('access_token=pk.test_mock_token_12345'));

      // Verify response envelope and parsing
      assert.strictEqual(data.type, 'isochrone');
      assert.strictEqual(data.provider, 'mapbox');
      assert.strictEqual(data.geojson.features.length, 3);

      // Verify normalized properties
      const fiveMin = data.geojson.features.find((f: any) => f.properties.minutes === 5);
      assert.ok(fiveMin, '5-minute contour feature missing');
      assert.strictEqual(fiveMin.properties.contour, 5);
      assert.strictEqual(fiveMin.properties.value, 300);
      assert.strictEqual(fiveMin.properties.isFallback, false);

      const tenMin = data.geojson.features.find((f: any) => f.properties.minutes === 10);
      assert.ok(tenMin, '10-minute contour feature missing');
      assert.strictEqual(tenMin.properties.value, 600);

      const fifteenMin = data.geojson.features.find((f: any) => f.properties.minutes === 15);
      assert.ok(fifteenMin, '15-minute contour feature missing');
      assert.strictEqual(fifteenMin.properties.value, 900);
    } finally {
      server.close();
    }
  });

  it('3. Token validation: returns 401 when MAPBOX_ACCESS_TOKEN is missing without fallback', async () => {
    delete process.env.MAPBOX_ACCESS_TOKEN;

    const app = createTestApp();
    const server = app.listen(0);
    const port = (server.address() as any).port;

    try {
      const res = await originalFetch(`http://localhost:${port}/api/isochrones`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ longitude: 13.38, latitude: 52.51 }),
      });

      assert.strictEqual(res.status, 401);
      const data: any = await res.json();
      assert.strictEqual(data.code, 'MISSING_MAPBOX_TOKEN');
      assert.match(data.error, /Mapbox access token is not configured/);
      assert.strictEqual(data.allowFallbackAvailable, true);
    } finally {
      server.close();
    }
  });

  it('4. Fallback resilience: returns explicit approximate buffer when allowFallback: true', async () => {
    delete process.env.MAPBOX_ACCESS_TOKEN;

    const app = createTestApp();
    const server = app.listen(0);
    const port = (server.address() as any).port;

    try {
      const res = await originalFetch(`http://localhost:${port}/api/isochrones`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ longitude: 13.38, latitude: 52.51, allowFallback: true }),
      });

      assert.strictEqual(res.status, 200);
      const data: any = await res.json();
      assert.strictEqual(data.type, 'fallback');
      assert.strictEqual(data.provider, 'approximate');
      assert.match(data.message, /approximate geometric buffer/);
      assert.strictEqual(data.geojson.features.length, 3);
      assert.strictEqual(data.geojson.features[0].properties.isFallback, true);
      assert.match(data.geojson.features[0].properties.label, /\(approx\.\)/);
    } finally {
      server.close();
    }
  });

  it('5. Mapbox error handling: maps 401, 403, 429, and 422 to clear user-facing errors', async () => {
    process.env.MAPBOX_ACCESS_TOKEN = 'pk.invalid_token';

    const testErrors = [
      { status: 401, expectedCode: 'MAPBOX_AUTH_ERROR', expectedStatus: 502 },
      { status: 403, expectedCode: 'MAPBOX_FORBIDDEN', expectedStatus: 502 },
      { status: 429, expectedCode: 'MAPBOX_RATE_LIMIT', expectedStatus: 429 },
      { status: 422, expectedCode: 'MAPBOX_UNROUTABLE', expectedStatus: 502 },
    ];

    const app = createTestApp();
    const server = app.listen(0);
    const port = (server.address() as any).port;

    try {
      for (const tc of testErrors) {
        globalThis.fetch = (async (url: string | URL, options?: any) => {
          const urlStr = url.toString();
          if (urlStr.includes('api.mapbox.com')) {
            return {
              ok: false,
              status: tc.status,
              text: async () => 'Mapbox error description',
            } as any;
          }
          return originalFetch(url, options);
        }) as any;

        const res = await originalFetch(`http://localhost:${port}/api/isochrones`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ longitude: 13.38, latitude: 52.51 }),
        });

        assert.strictEqual(res.status, tc.expectedStatus);
        const data: any = await res.json();
        assert.strictEqual(data.code, tc.expectedCode);
        assert.strictEqual(data.allowFallbackAvailable, true);
      }
    } finally {
      server.close();
    }
  });

  it('6. Fallback circle generator: produces 3 valid polygon features with correct minute tags', () => {
    const fallback = generateFallbackCircles(13.38, 52.51);
    assert.strictEqual(fallback.type, 'FeatureCollection');
    assert.strictEqual(fallback.features.length, 3);

    const minutes = fallback.features.map((f: any) => f.properties.minutes);
    assert.deepStrictEqual(minutes, [5, 10, 15]);

    fallback.features.forEach((f: any) => {
      assert.strictEqual(f.geometry.type, 'Polygon');
      assert.ok(f.geometry.coordinates[0].length > 30, 'Polygon should have circular approximation points');
      assert.strictEqual(f.properties.isFallback, true);
    });
  });
});
