import dotenv from 'dotenv';
import path from 'path';
import { z } from 'zod';

dotenv.config({ path: path.resolve(__dirname, '../../../.env') });

const ConfigSchema = z.object({
  PORT: z.coerce.number().default(4000),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  DATABASE_URL: z.string().default('postgresql://postgres:postgres@localhost:5432/medlens?schema=public'),
  JWT_SECRET: z.string().default('medlens-dev-jwt-secret-key-change-in-prod'),
  JWT_REFRESH_SECRET: z.string().default('medlens-dev-jwt-refresh-secret-key-change-in-prod'),
  APP_ENCRYPTION_KEY: z.string().default('0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef'),
  ANTHROPIC_API_KEY: z.string().optional().default(''),
  STORAGE_DRIVER: z.enum(['local', 's3']).default('local'),
  LOCAL_UPLOAD_DIR: z.string().default('./uploads'),
  FRONTEND_URL: z.string().default('*'),
});

export const config = ConfigSchema.parse(process.env);
