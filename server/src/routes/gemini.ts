import { Router, Request, Response } from 'express';
import { GoogleGenerativeAI, SchemaType } from '@google/generative-ai';

const router = Router();

// Gemini response schema
const RESPONSE_SCHEMA = {
  type: SchemaType.OBJECT,
  properties: {
    accessibility_interpretation: { type: SchemaType.STRING },
    key_strengths: {
      type: SchemaType.ARRAY,
      items: { type: SchemaType.STRING },
    },
    key_gaps: {
      type: SchemaType.ARRAY,
      items: { type: SchemaType.STRING },
    },
    confidence_explanation: { type: SchemaType.STRING },
    data_limitations: { type: SchemaType.STRING },
    typology_recommendations: {
      type: SchemaType.ARRAY,
      items: {
        type: SchemaType.OBJECT,
        properties: {
          typology: { type: SchemaType.STRING },
          suitability_score: { type: SchemaType.NUMBER },
          evidence: {
            type: SchemaType.ARRAY,
            items: { type: SchemaType.STRING },
          },
          advantages: {
            type: SchemaType.ARRAY,
            items: { type: SchemaType.STRING },
          },
          limitations: {
            type: SchemaType.ARRAY,
            items: { type: SchemaType.STRING },
          },
          missing_information: {
            type: SchemaType.ARRAY,
            items: { type: SchemaType.STRING },
          },
          recommendation_summary: { type: SchemaType.STRING },
        },
        required: ['typology', 'suitability_score', 'evidence', 'advantages', 'limitations', 'missing_information', 'recommendation_summary'],
      },
    },
  },
  required: ['accessibility_interpretation', 'key_strengths', 'key_gaps', 'confidence_explanation', 'data_limitations', 'typology_recommendations'],
};

router.post('/analyse', async (req: Request, res: Response) => {
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey || apiKey === 'your_gemini_api_key_here') {
    return res.status(503).json({
      error: 'Gemini API key not configured',
      message: 'Add your GEMINI_API_KEY to server/.env to enable AI analysis.',
    });
  }

  const { siteData } = req.body;
  if (!siteData) {
    return res.status(400).json({ error: 'siteData is required' });
  }

  // Validate minimal required fields
  const { coordinates, label, accessibilityScore, catchments, amenityCounts, gaps } = siteData;
  if (!coordinates || !label || accessibilityScore === undefined) {
    return res.status(400).json({ error: 'siteData must include coordinates, label, and accessibilityScore' });
  }

  try {
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({
      model: 'gemini-1.5-pro',
      generationConfig: {
        responseMimeType: 'application/json',
        responseSchema: RESPONSE_SCHEMA as any,
        temperature: 0.3,
        maxOutputTokens: 4096,
      },
    });

    const prompt = buildPrompt(siteData);

    const result = await model.generateContent(prompt);
    const text = result.response.text();

    // Parse and validate
    let parsed: any;
    try {
      parsed = JSON.parse(text);
    } catch {
      console.error('[Gemini] Invalid JSON response:', text.substring(0, 500));
      return res.status(502).json({ error: 'AI returned an unreadable response. Please retry.' });
    }

    // Validate top-level keys
    const required = ['accessibility_interpretation', 'key_strengths', 'key_gaps', 'typology_recommendations'];
    for (const key of required) {
      if (!parsed[key]) {
        return res.status(502).json({ error: `AI response missing required field: ${key}` });
      }
    }

    // Limit to top 3 typologies
    if (Array.isArray(parsed.typology_recommendations)) {
      parsed.typology_recommendations = parsed.typology_recommendations.slice(0, 3);
    }

    return res.json({ analysis: parsed });
  } catch (err: any) {
    console.error('[Gemini] API error:', err.message);

    if (err.message?.includes('quota') || err.message?.includes('429')) {
      return res.status(429).json({ error: 'AI quota exceeded. Please try again later.' });
    }
    if (err.message?.includes('API_KEY_INVALID') || err.message?.includes('401')) {
      return res.status(401).json({ error: 'Invalid Gemini API key. Check your server/.env file.' });
    }

    return res.status(502).json({ error: 'AI analysis failed. Please retry.', details: err.message });
  }
});

function buildPrompt(siteData: any): string {
  const {
    coordinates,
    label,
    accessibilityScore,
    scoreComponents,
    catchments,
    amenityCounts,
    amenityDiversity,
    gaps,
    dataCompleteness,
    isochroneType,
  } = siteData;

  return `You are an urban analysis assistant supporting an architectural pre-design research tool called SiteScope.

Your role is to INTERPRET evidence from a deterministic geospatial analysis and recommend building typologies. You must NOT invent amenities, population statistics, land values, or make zoning or regulatory claims. Distinguish evidence-backed findings from hypotheses.

=== SITE CONTEXT ===
Location: ${label}
Coordinates: ${coordinates.lat.toFixed(5)}°N, ${coordinates.lng.toFixed(5)}°E
Catchment type: ${isochroneType === 'isochrone' ? 'Actual walking-network isochrones' : 'Approximate circular buffers (routing data unavailable)'}

=== ACCESSIBILITY SCORE ===
Overall: ${accessibilityScore}/100

Score Components (weighted):
${JSON.stringify(scoreComponents, null, 2)}

=== AMENITY COUNTS BY CATCHMENT ===
${JSON.stringify(catchments, null, 2)}

=== AMENITY DIVERSITY ===
${JSON.stringify(amenityDiversity, null, 2)}

=== IDENTIFIED SERVICE GAPS ===
${gaps && gaps.length > 0 ? gaps.join('\n') : 'No critical gaps identified based on available data.'}

=== DATA COMPLETENESS ===
${JSON.stringify(dataCompleteness, null, 2)}

=== YOUR TASK ===
1. Write an evidence-based accessibility interpretation (2-4 sentences).
2. List 3–5 key strengths of this location's accessibility profile.
3. List 3–5 key gaps or deficiencies.
4. Recommend exactly 3 building typologies from: Residential, Mixed-use, Commercial/Office, Retail and Daily Services, Educational/Institutional, Healthcare, Community and Recreation.
5. For each typology: provide a suitability_score (0–100) grounded in the measured data, list evidence points, advantages, limitations, and what additional information is needed.
6. Explain your confidence level honestly — note what the data cannot tell us.
7. Acknowledge that amenity counts alone do not establish demand, feasibility, profitability, or regulatory compliance.

CRITICAL CONSTRAINTS:
- Do not claim a facility is absent if the data source might simply be incomplete.
- Do not infer population density, land value, or development demand from amenity counts alone.
- Present recommendations as initial planning hypotheses, not architectural or investment decisions.
- Keep each typology's suitability_score consistent with the component scores provided.`;
}

export { router as geminiRouter };
