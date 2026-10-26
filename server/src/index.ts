import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { geocodeRouter } from './routes/geocode';
import { isochronesRouter } from './routes/isochrones';
import { amenitiesRouter } from './routes/amenities';
import { geminiRouter } from './routes/gemini';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors({ origin: ['http://localhost:5173', 'http://localhost:4173'] }));
app.use(express.json({ limit: '2mb' }));

// Health check
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// API routes
app.use('/api/geocode', geocodeRouter);
app.use('/api/isochrones', isochronesRouter);
app.use('/api/amenities', amenitiesRouter);
app.use('/api/gemini', geminiRouter);

// Error handler
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('[Server Error]', err.message);
  res.status(500).json({ error: 'Internal server error', message: err.message });
});

app.listen(PORT, () => {
  console.log(`SiteScope API server running on http://localhost:${PORT}`);
});

export default app;
