import pg from 'pg';
import { env } from './environment';
import logger from '../utils/logger';

const { Pool } = pg;

export const pool = new Pool({
  connectionString: env.DATABASE_URL,
  max: env.DB_POOL_MAX,
  idleTimeoutMillis: env.DB_IDLE_TIMEOUT_MS,
  connectionTimeoutMillis: env.DB_CONNECTION_TIMEOUT_MS,
  statement_timeout: env.DB_STATEMENT_TIMEOUT_MS,
  // Required for remote PostgreSQL with SSL
  ssl: env.DATABASE_URL.includes('sslmode=require') || env.DATABASE_URL.includes('render.com')
    ? { rejectUnauthorized: false }
    : undefined,
});

// Log pool errors (don't crash the process)
pool.on('error', (err: Error) => {
  logger.error('Unexpected pool error', { error: err.message });
});

export async function testConnection(): Promise<boolean> {
  try {
    const client = await pool.connect();
    await client.query('SELECT 1');
    client.release();
    return true;
  } catch (error) {
    logger.error('Database connection test failed', { error: (error as Error).message });
    return false;
  }
}

export async function closePool(): Promise<void> {
  await pool.end();
}
