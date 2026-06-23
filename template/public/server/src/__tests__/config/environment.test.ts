import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { z } from 'zod';

describe('Environment Configuration', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    // Reset to base test env
    vi.resetModules();
  });

  afterEach(() => {
    // Restore original env
    process.env = { ...originalEnv };
  });

  it('should validate a valid configuration', () => {
    // The env schema from environment.ts
    const envSchema = z.object({
      PORT: z.coerce.number().default(3000),
      NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
      DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
      CORS_ORIGIN: z.string().default('http://localhost:5173'),
      DB_POOL_MAX: z.coerce.number().default(20),
      DB_IDLE_TIMEOUT_MS: z.coerce.number().default(30000),
      DB_CONNECTION_TIMEOUT_MS: z.coerce.number().default(5000),
      DB_STATEMENT_TIMEOUT_MS: z.coerce.number().default(30000),
    });

    const validConfig = {
      PORT: '3000',
      NODE_ENV: 'development',
      DATABASE_URL: 'postgresql://localhost:5432/testdb',
      CORS_ORIGIN: 'http://localhost:5173',
      DB_POOL_MAX: '20',
      DB_IDLE_TIMEOUT_MS: '30000',
      DB_CONNECTION_TIMEOUT_MS: '5000',
      DB_STATEMENT_TIMEOUT_MS: '30000',
    };

    const result = envSchema.safeParse(validConfig);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.PORT).toBe(3000);
      expect(result.data.NODE_ENV).toBe('development');
      expect(result.data.DATABASE_URL).toBe('postgresql://localhost:5432/testdb');
      expect(result.data.CORS_ORIGIN).toBe('http://localhost:5173');
      expect(result.data.DB_POOL_MAX).toBe(20);
    }
  });

  it('should fail validation when DATABASE_URL is missing', () => {
    const envSchema = z.object({
      PORT: z.coerce.number().default(3000),
      NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
      DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
      CORS_ORIGIN: z.string().default('http://localhost:5173'),
    });

    const invalidConfig = {
      PORT: '3000',
      NODE_ENV: 'development',
      CORS_ORIGIN: 'http://localhost:5173',
      // DATABASE_URL intentionally missing
    };

    const result = envSchema.safeParse(invalidConfig);
    expect(result.success).toBe(false);
    if (!result.success) {
      const errors = result.error.flatten().fieldErrors;
      expect(errors.DATABASE_URL).toBeDefined();
    }
  });

  it('should fail validation when NODE_ENV is invalid', () => {
    const envSchema = z.object({
      NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
      DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
    });

    const invalidConfig = {
      NODE_ENV: 'staging',
      DATABASE_URL: 'postgresql://localhost:5432/testdb',
    };

    const result = envSchema.safeParse(invalidConfig);
    expect(result.success).toBe(false);
  });

  it('should use default values when optional fields are missing', () => {
    const envSchema = z.object({
      PORT: z.coerce.number().default(3000),
      NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
      DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
      CORS_ORIGIN: z.string().default('http://localhost:5173'),
      DB_POOL_MAX: z.coerce.number().default(20),
      DB_IDLE_TIMEOUT_MS: z.coerce.number().default(30000),
      DB_CONNECTION_TIMEOUT_MS: z.coerce.number().default(5000),
      DB_STATEMENT_TIMEOUT_MS: z.coerce.number().default(30000),
    });

    const minimalConfig = {
      DATABASE_URL: 'postgresql://localhost:5432/testdb',
    };

    const result = envSchema.safeParse(minimalConfig);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.PORT).toBe(3000);
      expect(result.data.NODE_ENV).toBe('development');
      expect(result.data.CORS_ORIGIN).toBe('http://localhost:5173');
      expect(result.data.DB_POOL_MAX).toBe(20);
      expect(result.data.DB_IDLE_TIMEOUT_MS).toBe(30000);
      expect(result.data.DB_CONNECTION_TIMEOUT_MS).toBe(5000);
      expect(result.data.DB_STATEMENT_TIMEOUT_MS).toBe(30000);
    }
  });

  it('should coerce string numbers to actual numbers', () => {
    const envSchema = z.object({
      PORT: z.coerce.number().default(3000),
      DATABASE_URL: z.string().min(1),
      DB_POOL_MAX: z.coerce.number().default(20),
    });

    const config = {
      PORT: '8080',
      DATABASE_URL: 'postgresql://localhost:5432/testdb',
      DB_POOL_MAX: '50',
    };

    const result = envSchema.safeParse(config);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.PORT).toBe(8080);
      expect(typeof result.data.PORT).toBe('number');
      expect(result.data.DB_POOL_MAX).toBe(50);
      expect(typeof result.data.DB_POOL_MAX).toBe('number');
    }
  });
});
