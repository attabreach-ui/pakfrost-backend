import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { env } from '../../config/env';
import { authenticate } from '../../middleware/auth.middleware';
import { validate } from '../../middleware/validate.middleware';
import { loginSchema, refreshSchema } from './auth.schema';
import * as authController from './auth.controller';

const router = Router();

// Strict rate limit on login only
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max:      env?.LOGIN_RATE_LIMIT_MAX ?? 10,
  message:  { success: false, message: 'Too many login attempts. Try again after 15 minutes.' },
  standardHeaders: true,
  legacyHeaders:   false,
});

// Public routes (no auth required)
router.post('/login',   loginLimiter, validate(loginSchema),   authController.login);
router.post('/refresh', validate(refreshSchema),                authController.refresh);

// Protected routes (auth required)
router.post('/logout', authenticate, authController.logout);
router.get( '/me',     authenticate, authController.me);

export default router;
