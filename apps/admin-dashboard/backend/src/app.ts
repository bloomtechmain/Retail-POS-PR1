import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import routes from './routes';
import { errorHandler, notFound } from './middleware/error';
import { runMigrations } from './config/migrate';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5001;
const isProduction = process.env.NODE_ENV === 'production';

app.disable('etag');
app.use('/api', (_req, res, next) => {
  res.set('Cache-Control', 'no-store');
  next();
});

app.use(cors({
  origin: process.env.FRONTEND_URL || (isProduction ? '*' : 'http://localhost:5191'),
  credentials: true,
}));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.use('/api', routes);

app.use(notFound);
app.use(errorHandler);

const start = async () => {
  await runMigrations();
  app.listen(PORT, () => {
    console.log(`\n🔧 Admin Dashboard API running on port ${PORT}`);
    console.log(`   Mode: ${isProduction ? 'Production' : 'Development'}`);
    console.log(`   Health: http://localhost:${PORT}/health\n`);
  });
};

start().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});

export default app;
