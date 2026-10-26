# SiteScope — Architecture Accessibility Intelligence

**Prototype 1** — A functional, responsive web application for pre-design site intelligence.

## What It Does

SiteScope evaluates a site's urban accessibility by:
1. Generating 5-, 10-, and 15-minute walking catchments (validated pedestrian network isochrones via **Mapbox Isochrone API**, or explicitly labelled geometric buffer fallback)
2. Discovering and categorising nearby amenities via OpenStreetMap/Overpass API
3. Calculating a transparent, deterministic **Site Accessibility Score** (0–100)
4. Using **Google Gemini** to interpret the analysis and recommend the three most suitable **building typologies**
5. Exporting a print-ready site intelligence report (PDF export)

---

## Quick Start

### Prerequisites
- Node.js 18+ (tested on Node 20)
- API keys (see below)

### 1. Install dependencies

```bash
# Client
cd client
npm install

# Server
cd ../server
npm install
```

### 2. Configure API keys

Copy `.env.example` to `.env` in the `server/` directory and fill in your keys:

```bash
cd server
copy .env.example .env   # Windows (or cp .env.example .env on macOS/Linux)
# then edit .env with your keys
```

**Required env vars:**
```env
GEMINI_API_KEY=your_gemini_api_key_here
MAPBOX_ACCESS_TOKEN=your_mapbox_access_token_here
PORT=3001
NODE_ENV=development
```

> ⚠️ **Security Notice:** Never commit your `.env` file or expose your `MAPBOX_ACCESS_TOKEN` in the frontend source code, client environment variables, browser bundles, or Git. All Mapbox API calls are proxied securely through the backend.

### 3. Run the Automated Tests

Verify the Mapbox Isochrone integration:

```bash
cd server
npm test
```

### 4. Start the servers

Open **two terminal windows**:

**Terminal 1 — Backend:**
```bash
cd server
npm run dev
# Server runs on http://localhost:3001
```

**Terminal 2 — Frontend:**
```bash
cd client
npm run dev
# App runs on http://localhost:5173
```

Then open [http://localhost:5173](http://localhost:5173) in your browser.

---

## API Keys

### Mapbox Isochrone API (Walking Isochrones)
1. Sign up for a free account at [https://account.mapbox.com/](https://account.mapbox.com/)
2. Navigate to your Account Dashboard → **Access tokens**
3. Copy your Default public token (starts with `pk.`) or create a dedicated token
4. Add to `server/.env` as `MAPBOX_ACCESS_TOKEN=pk....`

**Free tier & limits:**
- **100,000 requests/month** included in the free tier
- Generates true pedestrian network walking catchments for 5-, 10-, and 15-minute contours
- Rate limits: 300 requests/minute on standard accounts

> **Resilience & Fallback:** If `MAPBOX_ACCESS_TOKEN` is missing or the routing service is temporarily unreachable, SiteScope displays a clear configuration alert with a "Retry Routing" action and an option to generate an **approximate geometric catchment**. The approximate buffer is explicitly badged and visually distinguished from validated walking network isochrones.

### Google Gemini API
1. Visit [https://ai.google.dev/](https://ai.google.dev/)
2. Click "Get API key" in Google AI Studio
3. Create a new API key
4. Add to `server/.env` as `GEMINI_API_KEY=...`

> **Note:** The app works without a Gemini key — you can still get full accessibility scores and catchment analysis. AI recommendations are disabled.

---

## Architecture

```
prototype 1/
├── client/                   # React + TypeScript + Vite (frontend)
│   └── src/
│       ├── components/       # MapView, ScorePanel, GeminiPanel, CatchmentComparison
│       ├── modules/
│       │   ├── api/          # Backend API client (with AbortController cancellation)
│       │   ├── geo/          # Turf.js spatial calculations
│       │   ├── scoring/      # Deterministic accessibility scoring engine
│       │   └── report/       # Print-ready report generator
│       └── types/            # TypeScript interfaces
└── server/                   # Node.js + Express (backend)
    └── src/
        ├── routes/
        │   ├── geocode.ts    # Nominatim geocoding proxy
        │   ├── isochrones.ts # Mapbox Isochrone API proxy + explicit fallback
        │   ├── amenities.ts  # Overpass API proxy + categorisation
        │   └── gemini.ts     # Google Gemini integration
        └── tests/
            └── mapbox-isochrones.test.ts  # Integration test suite
```

## Data Sources & Attribution

| Source | Purpose | Terms |
|--------|---------|-------|
| Mapbox Isochrone API | 5, 10, 15-min walking isochrones | Free: 100,000 req/month |
| OpenStreetMap via Overpass API | Amenity data | © OpenStreetMap contributors (ODbL) |
| Nominatim | Geocoding | Usage policy: 1 req/s max |
| Google Gemini | AI interpretation | Per Google AI terms |
| Stadia Maps (dark basemap) | Dark tile layer | Free tier available |

## Accessibility Score Weights

| Dimension | Weight |
|-----------|--------|
| Amenity Diversity | 25% |
| Essential Services (education + healthcare) | 25% |
| Public Transport Access | 20% |
| Daily Needs (grocery + food) | 15% |
| Parks & Recreation | 10% |
| Civic & Community | 5% |

> These are **provisional prototype weights**, not scientifically validated standards. The 15-minute catchment is used as the primary assessment area.

---

## Disclaimer

This is a prototype research tool. Scores are based on OpenStreetMap data availability and prototype weights. They do not constitute:
- Validated planning standards
- Regulatory or zoning guidance
- Architectural or engineering recommendations
- Investment or feasibility analysis

Absence of an amenity in the data does not confirm its absence in reality.

---

## Development & Testing

```bash
# Run server test suite
cd server && npm test

# Type-check client
cd client && npx tsc --noEmit

# Production build check
cd client && npm run build
cd server && npm run build
```

## Supported Building Typologies

Residential · Mixed-use · Commercial/Office · Retail and Daily Services · Educational/Institutional · Healthcare · Community and Recreation
