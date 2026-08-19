import dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import cors from 'cors';
import path from 'path';

// Import db first to initialize tables and seed admin
import './db';

import adminRouter from './routes/admin';
import verifyRouter from './routes/verify';

const app = express();
const PORT = Number(process.env.PORT) || 3001;

// Middleware
app.use(cors({
  origin: process.env.SERVER_URL || '*',
  credentials: true,
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Log all requests
app.use((req, _res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  next();
});

// API routes
app.use('/api/admin', adminRouter);
app.use('/api/verify', verifyRouter);

// Serve admin UI (static HTML)
app.use(express.static(path.join(__dirname, '..', 'public')));

// Catch-all — serve index.html for any non-API route
app.get('*', (_req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`\n🔑 RetailPOS License Server running on http://localhost:${PORT}`);
  console.log(`   Admin UI: http://localhost:${PORT}`);
  console.log(`   Verify endpoint: http://localhost:${PORT}/api/verify\n`);
});

export default app;
