import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

const WEAK_SECRETS = new Set([
  'dev-only-session-secret-change-me',
  'change-me-to-a-long-random-secret',
  'local-dev-session-secret-store-ops',
  'secret',
  'changeme',
]);

function isValidTimeZone(tz: string): boolean {
  try {
    Intl.DateTimeFormat(undefined, { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

function parseTrustProxy(val: string | undefined): boolean | number | string {
  if (!val || val === 'false') return false;
  if (val === 'true') return true;
  const num = Number(val);
  if (Number.isInteger(num) && num >= 0) return num;
  return val;
}

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3001),
  DATABASE_PATH: z.string().trim().min(1).optional(),
  DB_PATH: z.string().trim().min(1).optional(),
  SESSION_SECRET: z.string().optional(),
  CORS_ORIGINS: z.string().default('http://localhost:5173,http://localhost:3001'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).optional(),
  RATE_LIMIT_MAX: z.coerce.number().int().min(1).default(300),
  LOGIN_RATE_LIMIT_MAX: z.coerce.number().int().min(1).default(20),
  COOKIE_SECURE: z
    .enum(['true', 'false'])
    .optional()
    .transform((v) => (v === undefined ? undefined : v === 'true')),
  ALLOW_DEMO_USERS: z
    .enum(['true', 'false'])
    .optional()
    .transform((v) => v === 'true'),
  BACKUP_RETENTION: z.coerce.number().int().min(1).max(100).default(7),
  TRUST_PROXY: z.string().trim().optional(),
  STORE_TIMEZONE: z
    .string()
    .trim()
    .default('UTC')
    .refine(
      isValidTimeZone,
      'STORE_TIMEZONE must be a valid IANA timezone (e.g. UTC, America/New_York).'
    ),
});

export interface AppConfig {
  nodeEnv: 'development' | 'test' | 'production';
  port: number;
  databasePath: string;
  sessionSecret: string;
  corsOrigins: string[];
  logLevel: string;
  rateLimitMax: number;
  loginRateLimitMax: number;
  cookieSecure: boolean;
  allowDemoUsers: boolean;
  backupRetention: number;
  trustProxy: boolean | number | string;
  storeTimezone: string;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const parsed = envSchema.parse(env);
  const isTest = parsed.NODE_ENV === 'test' || Boolean(env.VITEST);

  const sessionSecret = parsed.SESSION_SECRET ?? 'dev-only-session-secret-change-me';
  if (parsed.NODE_ENV === 'production') {
    if (
      !parsed.SESSION_SECRET ||
      parsed.SESSION_SECRET.length < 32 ||
      WEAK_SECRETS.has(parsed.SESSION_SECRET)
    ) {
      throw new Error(
        'FATAL: SESSION_SECRET must be set to a strong random string (>= 32 chars) in production.'
      );
    }
  }

  return {
    nodeEnv: parsed.NODE_ENV,
    port: parsed.PORT,
    databasePath: parsed.DB_PATH || parsed.DATABASE_PATH || './data/store_ops.db',
    sessionSecret,
    corsOrigins: parsed.CORS_ORIGINS.split(',')
      .map((o) => o.trim())
      .filter(Boolean),
    logLevel: parsed.LOG_LEVEL ?? (isTest ? 'silent' : 'info'),
    rateLimitMax: parsed.RATE_LIMIT_MAX,
    loginRateLimitMax: parsed.LOGIN_RATE_LIMIT_MAX,
    cookieSecure: parsed.COOKIE_SECURE ?? parsed.NODE_ENV === 'production',
    allowDemoUsers: parsed.ALLOW_DEMO_USERS ?? false,
    backupRetention: parsed.BACKUP_RETENTION,
    trustProxy: parseTrustProxy(parsed.TRUST_PROXY),
    storeTimezone: parsed.STORE_TIMEZONE,
  };
}

export const config = loadConfig();
