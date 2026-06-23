import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { z } from 'zod';

// Load .env — try the server directory first, then the parent (app root).
// Works whether started via "cd server && npm run dev" or "cd app && npm run start".
dotenv.config({ path: path.resolve(process.cwd(), '.env') });
dotenv.config({ path: path.resolve(process.cwd(), '..', '.env') });

const envSchema = z.object({
  PORT: z.coerce.number().default(3000),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  CORS_ORIGIN: z.string().default('http://localhost:5173'),
  API_BASE_URL: z.string().optional(),
  DB_POOL_MAX: z.coerce.number().default(20),
  DB_IDLE_TIMEOUT_MS: z.coerce.number().default(30000),
  DB_CONNECTION_TIMEOUT_MS: z.coerce.number().default(5000),
  DB_STATEMENT_TIMEOUT_MS: z.coerce.number().default(30000),
  JWT_PRIVATE_KEY: z.string().optional(),
  JWT_PUBLIC_KEY: z.string().optional(),
  JWT_REFRESH_PRIVATE_KEY: z.string().optional(),
  JWT_REFRESH_PUBLIC_KEY: z.string().optional(),
  JWT_ACCESS_EXPIRES_IN: z.string().default('15m'),
  JWT_REFRESH_EXPIRES_IN: z.string().default('7d'),
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  MICROSOFT_CLIENT_ID: z.string().optional(),
  MICROSOFT_CLIENT_SECRET: z.string().optional(),
  MICROSOFT_TENANT_ID: z.string().optional(),
  OPENAI_API_KEY: z.string().optional(),
  AI_PROVIDER: z.string().default('openai'),
  AI_API_KEY: z.string().optional(),
  AI_MODEL: z.string().default('gpt-4o-mini'),
  AI_MAX_TOKENS: z.coerce.number().default(1024),
  SERVE_CLIENT: z.string().optional().default('false'),
  CSRF_SECRET: z.string().min(32).default('dev-csrf-secret-change-in-production-00'),
  // Rate limiting — all configurable via .env
  RATE_LIMIT_API_MAX: z.coerce.number().default(200),
  RATE_LIMIT_API_WINDOW_MS: z.coerce.number().default(15 * 60 * 1000), // 15 minutes
  RATE_LIMIT_AUTH_MAX: z.coerce.number().default(30),
  RATE_LIMIT_AUTH_WINDOW_MS: z.coerce.number().default(15 * 60 * 1000), // 15 minutes
  RATE_LIMIT_AI_MAX: z.coerce.number().default(60),
  RATE_LIMIT_AI_WINDOW_MS: z.coerce.number().default(60 * 60 * 1000), // 1 hour
  // Broadcast — tighter than the general API bucket because each broadcast
  // fans out to every active user (N DB inserts + N SSE writes). Default
  // 60 per hour per IP; tune via env when your operational pattern justifies.
  RATE_LIMIT_BROADCAST_MAX: z.coerce.number().default(60),
  RATE_LIMIT_BROADCAST_WINDOW_MS: z.coerce.number().default(60 * 60 * 1000), // 1 hour
  // Request body size limits
  BODY_LIMIT_JSON: z.string().default('1mb'),
  BODY_LIMIT_URLENCODED: z.string().default('1mb'),
  // Graceful shutdown timeout (ms)
  SHUTDOWN_TIMEOUT_MS: z.coerce.number().default(30000),
  // File-upload extension points (no-op defaults — see services/file-scanner.ts + services/file-store.ts).
  FILE_SCANNER: z.string().default('noop'),
  FILE_STORE: z.string().default('database'),
  // Protected B column-level encryption (opt-in via migration 020_optional_pgcrypto.sql).
  // When migration is enabled, this MUST be set to a 256-bit base64-encoded key from secrets manager.
  PGCRYPTO_DATA_KEY: z.string().optional(),
  // Rate-limit backing store. Unset = in-memory (single-instance only). Set
  // REDIS_URL to a Redis connection string to enable cross-instance rate limits
  // via rate-limit-redis (see middleware/rate-limit.ts).
  REDIS_URL: z.string().optional(),
  // AI prompt egress — set 'strict' to redact emails / phone numbers / common
  // secrets from user prompts before forwarding to the LLM provider. 'off'
  // is the dev default. 'strict' is recommended in production.
  AI_REDACTION_MODE: z.enum(['off', 'strict']).default('off'),
}).refine((data) => {
  if (data.NODE_ENV === 'production') {
    // Accept PEM keys via env vars (production deployment with Key Vault / secrets manager)
    const envKeys = [data.JWT_PRIVATE_KEY, data.JWT_PUBLIC_KEY, data.JWT_REFRESH_PRIVATE_KEY, data.JWT_REFRESH_PUBLIC_KEY];
    if (envKeys.every((k) => k && k.startsWith('-----BEGIN'))) return true;

    // Also accept PEM files in server/keys/ (local production testing after npm run generate-keys)
    const keysDir = path.resolve(__dirname, '..', '..', 'keys');
    const keyFiles = ['jwt-private.pem', 'jwt-public.pem', 'jwt-refresh-private.pem', 'jwt-refresh-public.pem'];
    return keyFiles.every((f) => fs.existsSync(path.join(keysDir, f)));
  }
  return true;
}, {
  message: 'JWT PEM keys are required in production. Provide them as env vars (JWT_PRIVATE_KEY, etc.) or generate key files: npm run generate-keys',
}).refine((data) => {
  // Fail fast if a production deploy is still using the in-source dev CSRF_SECRET.
  // The default literal is fine for `npm run dev` but must never reach production.
  if (data.NODE_ENV === 'production' && data.CSRF_SECRET === 'dev-csrf-secret-change-in-production-00') {
    return false;
  }
  return true;
}, {
  message: 'CSRF_SECRET must be overridden in production. Generate a strong value (e.g. `node -e "console.log(require(\'crypto\').randomBytes(48).toString(\'base64url\'))"`) and inject it via env or Key Vault.',
}).refine((data) => {
  // Microsoft tenant MUST NOT be the multi-tenant placeholders in production.
  // Setting MICROSOFT_TENANT_ID to 'common', 'organizations', or 'consumers'
  // accepts ANY Microsoft account globally — a Critical IDPV-001 violation
  // for any app processing organizational/Protected B data. Only single-tenant
  // GUIDs (or single-tenant verified domains) are permitted in production.
  if (data.NODE_ENV !== 'production') return true;
  if (!data.MICROSOFT_TENANT_ID) return true; // SSO disabled — fine
  const forbidden = new Set(['common', 'organizations', 'consumers']);
  return !forbidden.has(data.MICROSOFT_TENANT_ID.trim().toLowerCase());
}, {
  message: "MICROSOFT_TENANT_ID must be a specific tenant GUID or verified domain in production. Multi-tenant values ('common', 'organizations', 'consumers') accept any Microsoft account in the world and violate IDPV-001. Set a single-tenant GUID or leave MICROSOFT_TENANT_ID unset to disable Microsoft SSO.",
}).refine((data) => {
  // pgcrypto column-level encryption is opt-in via migration
  // 020_optional_pgcrypto.sql. When that file is renamed from .example, the
  // migration runner picks it up and the encrypt_field() / decrypt_field()
  // calls require PGCRYPTO_DATA_KEY. Fail fast if the migration is active
  // but the key is missing or shorter than 32 bytes base64 (== 24 chars).
  const migrationsDir = path.resolve(__dirname, '..', '..', 'migrations');
  const pgcryptoActive = fs.existsSync(path.join(migrationsDir, '020_optional_pgcrypto.sql'));
  if (!pgcryptoActive) return true;
  if (!data.PGCRYPTO_DATA_KEY) return false;
  // base64-encoded 32 bytes is 44 chars (with padding). Accept >= 32 to allow base64url variants.
  return data.PGCRYPTO_DATA_KEY.length >= 32;
}, {
  message: "Migration 020_optional_pgcrypto.sql is active but PGCRYPTO_DATA_KEY is missing or too short. Generate a 32-byte key (`node -e \"console.log(require('crypto').randomBytes(32).toString('base64'))\"`) and inject via env / Key Vault.",
});

export type EnvConfig = z.infer<typeof envSchema>;

function loadEnvironment(): EnvConfig {
  const parsed = envSchema.safeParse(process.env);

  if (!parsed.success) {
    const errors = parsed.error.flatten();
    const fieldMessages = Object.entries(errors.fieldErrors)
      .map(([field, msgs]) => `  ${field}: ${(msgs || []).join(', ')}`)
      .join('\n');
    const formMessages = errors.formErrors.length > 0
      ? '\n  ' + errors.formErrors.join('\n  ')
      : '';
    throw new Error(`Environment validation failed:\n${fieldMessages}${formMessages}`);
  }

  return parsed.data;
}

export const env = loadEnvironment();

export function validateStartupKeys(): void {
  const jwtKeys = [env.JWT_PRIVATE_KEY, env.JWT_PUBLIC_KEY, env.JWT_REFRESH_PRIVATE_KEY, env.JWT_REFRESH_PUBLIC_KEY];
  const envPresent = jwtKeys.every((k) => k && k.startsWith('-----BEGIN'));

  // In dev we also accept PEM files in server/keys/ (created by `npm run generate-keys`).
  // The startup warning previously fired even when files were present because it only
  // looked at env vars — leaving developers hunting a phantom misconfiguration.
  const keysDir = path.resolve(__dirname, '..', '..', 'keys');
  const keyFiles = ['jwt-private.pem', 'jwt-public.pem', 'jwt-refresh-private.pem', 'jwt-refresh-public.pem'];
  const filesPresent = keyFiles.every((f) => fs.existsSync(path.join(keysDir, f)));

  if (env.NODE_ENV !== 'production' && !envPresent && !filesPresent) {
    console.warn(
      '[WARN] JWT PEM keys are missing. Generate them with: npm run generate-keys'
    );
  }
}
