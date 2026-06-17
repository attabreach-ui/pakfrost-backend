import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { env } from './config/env';
import { logger } from './utils/logger';
import { errorHandler } from './middleware/errorHandler.middleware';

// ── Route imports ───────────────────────────────────────────────────────────
import authRoutes        from './modules/auth/auth.routes';
import usersRoutes       from './modules/users/users.routes';
import customersRoutes   from './modules/customers/customers.routes';
import productsRoutes    from './modules/products/products.routes';
import driversRoutes     from './modules/drivers/drivers.routes';
import vehiclesRoutes    from './modules/vehicles/vehicles.routes';
import stockRoutes       from './modules/stock/stock.routes';
import palletsRoutes     from './modules/pallets/pallets.routes';
import movementsRoutes   from './modules/movements/movements.routes';
import temperatureRoutes from './modules/temperature/temperature.routes';
import reportsRoutes     from './modules/reports/reports.routes';

const app = express();

// ── Security middleware ─────────────────────────────────────────────────────
app.use(helmet());
app.use(cors({
  origin:      env.CORS_ORIGIN,
  credentials: true,
  methods:     ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

// ── Global rate limiter ─────────────────────────────────────────────────────
app.use(rateLimit({
  windowMs: env.RATE_LIMIT_WINDOW_MS,
  max:      env.RATE_LIMIT_MAX,
  standardHeaders: true,
  legacyHeaders:   false,
  message: { success: false, message: 'Too many requests, please try again later.' },
}));

// ── Body parser ─────────────────────────────────────────────────────────────
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// ── Request logger ──────────────────────────────────────────────────────────
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => logger.http(req.method, req.path, res.statusCode, Date.now() - start));
  next();
});

// ── Health check ────────────────────────────────────────────────────────────
app.get('/health', (_req, res) => {
  res.json({
    success: true,
    message: 'PAKFROST WMS API is running',
    environment: env.NODE_ENV,
    timestamp: new Date().toISOString(),
  });
});

// ── API Routes ──────────────────────────────────────────────────────────────
const API = '/api/v1';
app.use(`${API}/auth`,        authRoutes);
app.use(`${API}/users`,       usersRoutes);
app.use(`${API}/customers`,   customersRoutes);
app.use(`${API}/products`,    productsRoutes);
app.use(`${API}/drivers`,     driversRoutes);
app.use(`${API}/vehicles`,    vehiclesRoutes);
app.use(`${API}/stock`,       stockRoutes);
app.use(`${API}/pallets`,     palletsRoutes);
app.use(`${API}/movements`,   movementsRoutes);
app.use(`${API}/temperature`, temperatureRoutes);
app.use(`${API}/reports`,     reportsRoutes);

// ── 404 handler ─────────────────────────────────────────────────────────────
app.use((_req, res) => {
  res.status(404).json({ success: false, message: 'Route not found' });
});

// ── Global error handler (MUST be last) ────────────────────────────────────
app.use(errorHandler);

// ── Start server ────────────────────────────────────────────────────────────
app.listen(env.PORT, () => {
  logger.info(`🚀 PAKFROST API running on port ${env.PORT} [${env.NODE_ENV}]`);
  logger.info(`📋 Health: http://localhost:${env.PORT}/health`);
  logger.info(`🗄️  API Base: http://localhost:${env.PORT}${API}`);
});

export default app;
