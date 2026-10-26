import { Router, Request, Response } from 'express';

const router = Router();

// Nominatim geocoding - forward geocode
router.get('/search', async (req: Request, res: Response) => {
  const { q } = req.query;
  if (!q || typeof q !== 'string') {
    return res.status(400).json({ error: 'Query parameter "q" is required' });
  }

  try {
    const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&format=json&limit=5&addressdetails=1`;
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'SiteScope/1.0 (architecture-research-tool)',
        'Accept': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`Nominatim responded with ${response.status}`);
    }

    const data = await response.json();
    return res.json(data);
  } catch (err: any) {
    console.error('[Geocode] Error:', err.message);
    return res.status(502).json({ error: 'Geocoding service unavailable', details: err.message });
  }
});

// Reverse geocode
router.get('/reverse', async (req: Request, res: Response) => {
  const { lat, lon } = req.query;
  if (!lat || !lon) {
    return res.status(400).json({ error: 'lat and lon parameters are required' });
  }

  try {
    const url = `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json&addressdetails=1`;
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'SiteScope/1.0 (architecture-research-tool)',
        'Accept': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`Nominatim responded with ${response.status}`);
    }

    const data = await response.json();
    return res.json(data);
  } catch (err: any) {
    console.error('[ReverseGeocode] Error:', err.message);
    return res.status(502).json({ error: 'Reverse geocoding service unavailable', details: err.message });
  }
});

export { router as geocodeRouter };
