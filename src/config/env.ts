import { z } from 'zod';
import dotenv from 'dotenv';

dotenv.config();

const envSchema = z.object({
  DATABASE_URL:            z.string().url('DATABASE_URL must be a valid URL'),
  JWT_ACCESS_SECRET:       z.string().min(32, 'JWT_ACCESS_SECRET must be at least 32 characters'),
  JWT_REFRESH_SECRET:      z.string().min(32, 'JWT_REFRESH_SECRET must be at least 32 characters'),
  JWT_ACCESS_EXPIRY:       z.string().default('15m'),
  JWT_REFRESH_EXPIRY:      z.string().default('7d'),
  PORT:                    z.string().default('3001').transform(Number),
  NODE_ENV:                z.enum(['development', 'production', 'test']).default('development'),
  CORS_ORIGIN:             z.string().default('http://localhost:5173'),
  RATE_LIMIT_WINDOW_MS:    z.string().default('900000').transform(Number),
  RATE_LIMIT_MAX:          z.string().default('100').transform(Number),
  LOGIN_RATE_LIMIT_MAX:    z.string().default('10').transform(Number),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('❌  Invalid environment variables:');
  parsed.error.issues.forEach(issue => {
    console.error(`    ${issue.path.join('.')} — ${issue.message}`);
  });
  process.exit(1);
}

export const env = parsed.data;
