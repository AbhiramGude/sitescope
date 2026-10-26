import { Router, Request, Response } from 'express';

const router = Router();

// Overpass API endpoint
const OVERPASS_URL = 'https://overpass-api.de/api/interpreter';

// Category query definitions
const AMENITY_QUERIES: Record<string, string> = {
  education: `
    node["amenity"~"school|college|university|kindergarten|library"]({{bbox}});
    way["amenity"~"school|college|university|kindergarten|library"]({{bbox}});
  `,
  healthcare: `
    node["amenity"~"hospital|clinic|doctors|pharmacy|dentist|health_centre"]({{bbox}});
    way["amenity"~"hospital|clinic|doctors|pharmacy|dentist|health_centre"]({{bbox}});
  `,
  transport: `
    node["highway"="bus_stop"]({{bbox}});
    node["amenity"~"bus_station|ferry_terminal"]({{bbox}});
    node["railway"~"station|halt|subway_entrance|tram_stop"]({{bbox}});
    relation["route"~"bus|tram|subway|rail"]["public_transport"="stop_area"]({{bbox}});
  `,
  grocery: `
    node["shop"~"supermarket|convenience|greengrocer|butcher|bakery|deli|farm"]({{bbox}});
    way["shop"~"supermarket|convenience|greengrocer|butcher|bakery|deli|farm"]({{bbox}});
  `,
  food: `
    node["amenity"~"restaurant|cafe|fast_food|bar|pub|food_court"]({{bbox}});
    way["amenity"~"restaurant|cafe|fast_food|bar|pub|food_court"]({{bbox}});
  `,
  parks: `
    node["leisure"~"park|playground|sports_centre|pitch|garden|nature_reserve"]({{bbox}});
    way["leisure"~"park|playground|sports_centre|pitch|garden|nature_reserve"]({{bbox}});
    node["landuse"~"recreation_ground|grass"]({{bbox}});
  `,
  civic: `
    node["amenity"~"community_centre|townhall|post_office|police|fire_station|courthouse|place_of_worship|social_facility"]({{bbox}});
    way["amenity"~"community_centre|townhall|post_office|police|fire_station|courthouse|place_of_worship|social_facility"]({{bbox}});
  `,
  employment: `
    node["office"~"yes|company|government|financial|insurance|real_estate|telecommunication"]({{bbox}});
    way["office"~"yes|company|government|financial|insurance|real_estate|telecommunication"]({{bbox}});
    node["building"~"commercial|office"]({{bbox}});
    way["building"~"commercial|office"]({{bbox}});
    node["amenity"="bank"]({{bbox}});
  `,
};

router.post('/', async (req: Request, res: Response) => {
  const { bbox, categories } = req.body;

  // bbox: [minLon, minLat, maxLon, maxLat]
  if (!bbox || !Array.isArray(bbox) || bbox.length !== 4) {
    return res.status(400).json({ error: 'bbox array [minLon, minLat, maxLon, maxLat] is required' });
  }

  const requestedCats: string[] = Array.isArray(categories)
    ? categories
    : Object.keys(AMENITY_QUERIES);

  const [minLon, minLat, maxLon, maxLat] = bbox;
  const bboxStr = `${minLat},${minLon},${maxLat},${maxLon}`;

  // Build combined Overpass QL query
  const queryParts = requestedCats
    .filter((cat) => AMENITY_QUERIES[cat])
    .map((cat) => AMENITY_QUERIES[cat].replace(/\{\{bbox\}\}/g, bboxStr))
    .join('\n');

  const query = `[out:json][timeout:25];\n(\n${queryParts});\nout center body;`;

  const OVERPASS_ENDPOINTS = [
    'https://overpass-api.de/api/interpreter',
    'https://overpass.kumi.systems/api/interpreter',
    'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
  ];

  try {
    let response: any = null;
    let lastError = '';

    for (const endpoint of OVERPASS_ENDPOINTS) {
      try {
        const res = await fetch(endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'User-Agent': 'SiteScope/1.0 (Architecture Accessibility Intelligence; research@sitescope.app)',
            'Accept': 'application/json',
          },
          body: `data=${encodeURIComponent(query)}`,
        });

        if (res.ok) {
          response = res;
          break;
        } else {
          lastError = `${res.status} from ${endpoint}`;
          console.warn(`[Amenities] ${endpoint} returned ${res.status}`);
        }
      } catch (err: any) {
        lastError = err.message;
        console.warn(`[Amenities] Failed to reach ${endpoint}:`, err.message);
      }
    }

    if (!response) {
      console.error('[Amenities] All Overpass endpoints failed. Last error:', lastError);
      return res.status(502).json({ error: 'Amenity data service temporarily unavailable', details: lastError });
    }

    const data: any = await response.json();
    const elements = data.elements || [];

    // Categorize elements
    const categorized: Record<string, any[]> = {};
    requestedCats.forEach((cat) => { categorized[cat] = []; });

    for (const el of elements) {
      const tags = el.tags || {};
      const lat = el.lat ?? el.center?.lat;
      const lon = el.lon ?? el.center?.lon;
      if (!lat || !lon) continue;

      const amenity = tags.amenity || '';
      const shop = tags.shop || '';
      const leisure = tags.leisure || '';
      const office = tags.office || '';
      const highway = tags.highway || '';
      const railway = tags.railway || '';
      const building = tags.building || '';

      const feature = {
        id: el.id,
        type: el.type,
        lat,
        lon,
        name: tags.name || tags['name:en'] || null,
        tags: {
          amenity: amenity || undefined,
          shop: shop || undefined,
          leisure: leisure || undefined,
          office: office || undefined,
          highway: highway || undefined,
          railway: railway || undefined,
        },
      };

      // Categorize
      if (/school|college|university|kindergarten|library/.test(amenity)) {
        categorized.education?.push({ ...feature, category: 'education' });
      } else if (/hospital|clinic|doctors|pharmacy|dentist|health_centre/.test(amenity)) {
        categorized.healthcare?.push({ ...feature, category: 'healthcare' });
      } else if (highway === 'bus_stop' || /bus_station|ferry_terminal/.test(amenity) || /station|halt|subway_entrance|tram_stop/.test(railway)) {
        categorized.transport?.push({ ...feature, category: 'transport' });
      } else if (/supermarket|convenience|greengrocer|butcher|bakery|deli|farm/.test(shop)) {
        categorized.grocery?.push({ ...feature, category: 'grocery' });
      } else if (/restaurant|cafe|fast_food|bar|pub|food_court/.test(amenity)) {
        categorized.food?.push({ ...feature, category: 'food' });
      } else if (/park|playground|sports_centre|pitch|garden|nature_reserve|recreation_ground/.test(leisure)) {
        categorized.parks?.push({ ...feature, category: 'parks' });
      } else if (/community_centre|townhall|post_office|police|fire_station|courthouse|place_of_worship|social_facility/.test(amenity)) {
        categorized.civic?.push({ ...feature, category: 'civic' });
      } else if (office || /commercial|office/.test(building) || amenity === 'bank') {
        categorized.employment?.push({ ...feature, category: 'employment' });
      }
    }

    // Deduplicate by id within each category
    for (const cat of Object.keys(categorized)) {
      const seen = new Set<number>();
      categorized[cat] = categorized[cat].filter((f) => {
        if (seen.has(f.id)) return false;
        seen.add(f.id);
        return true;
      });
    }

    return res.json({
      categories: categorized,
      totalElements: elements.length,
      dataSource: 'OpenStreetMap via Overpass API',
      attribution: '© OpenStreetMap contributors',
      timestamp: new Date().toISOString(),
    });
  } catch (err: any) {
    console.error('[Amenities] Network error:', err.message);
    return res.status(502).json({ error: 'Could not retrieve amenity data', details: err.message });
  }
});

export { router as amenitiesRouter };
