import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import dotenv from 'dotenv';
import path from 'path';
import routes from './routes';
import { errorHandler, notFound } from './middleware/error';
import { runMigrations } from './config/migrate';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;
const isElectron  = process.env.ELECTRON_APP === '1';
const isProduction = process.env.NODE_ENV === 'production';

// ── Security & middleware ───────────────────────────────────────────────────
app.use(helmet({ contentSecurityPolicy: false }));

app.use(cors({
  origin: isElectron
    ? `http://localhost:${PORT}`
    : (process.env.FRONTEND_URL || (isProduction ? '*' : 'http://localhost:5173')),
  credentials: true,
}));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

if (process.env.NODE_ENV !== 'test') {
  app.use(morgan('dev'));
}

// ── Health check ────────────────────────────────────────────────────────────
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ── API routes ──────────────────────────────────────────────────────────────
app.use('/api', routes);

// ── Static frontend ─────────────────────────────────────────────────────────
// Served by backend in two cases:
//   1. Electron packaged app  (ELECTRON_APP=1, path set by main.js via FRONTEND_DIST)
//   2. Railway / production   (NODE_ENV=production, path relative to this file)
if (isElectron || isProduction) {
  const frontendDist = process.env.FRONTEND_DIST
    || path.join(__dirname, '..', '..', 'frontend', 'dist');
  app.use(express.static(frontendDist));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api')) return next();
    res.sendFile(path.join(frontendDist, 'index.html'));
  });
}

// ── Error handling ──────────────────────────────────────────────────────────
app.use(notFound);
app.use(errorHandler);

// ── Start ───────────────────────────────────────────────────────────────────
const start = async () => {
  // Auto-migrate on Railway/production only.
  // Electron handles its own migrations in main.js.
  if (!isElectron && isProduction) {
    await runMigrations();
  }

  app.listen(PORT, () => {
    console.log(`\n🚀 RetailPOS API running on port ${PORT}`);
    console.log(`   Mode: ${isElectron ? 'Electron' : (isProduction ? 'Production' : 'Development')}`);
    console.log(`   Health: http://localhost:${PORT}/health\n`);
  });
};

start().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});

export default app;
