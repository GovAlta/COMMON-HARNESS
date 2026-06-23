# Skill 04: Database

> Set up PostgreSQL with connection pooling, a sequential migration system, schema conventions, parameterized models, and transaction helpers.

### PostgreSQL Version Requirement

This skill requires **PostgreSQL 15+** (recommended **17+** per `standards/02-security.md`). Verify at startup:

```typescript
const { rows } = await pool.query('SHOW server_version_num');
const version = parseInt(rows[0].server_version_num, 10);
if (version < 150000) {
  throw new Error(`PostgreSQL 15+ required, found version ${version}`);
}
```

## Database Configuration: `config/database.ts`

```typescript
import { Pool, PoolClient, QueryResult } from 'pg';
import { env } from './environment';
import { logger } from '../utils/logger';

export const pool = new Pool({
  connectionString: env.DATABASE_URL,
  max: env.DB_POOL_MAX,                           // Default: 20
  idleTimeoutMillis: env.DB_IDLE_TIMEOUT_MS,       // Default: 30000
  connectionTimeoutMillis: env.DB_CONNECTION_TIMEOUT_MS, // Default: 5000
  statement_timeout: env.DB_STATEMENT_TIMEOUT_MS,  // Default: 30000
  ssl: env.DATABASE_URL.includes('sslmode=require')
    ? { rejectUnauthorized: false }
    : undefined,
});

pool.on('error', (err) => {
  logger.error('Unexpected pool error', { error: err.message });
});

export async function testConnection(): Promise<boolean> {
  try {
    const client = await pool.connect();
    await client.query('SELECT 1');
    client.release();
    return true;
  } catch {
    return false;
  }
}

export async function closePool(): Promise<void> {
  await pool.end();
}
```

## Transaction Helper

Wraps multiple queries in a transaction. Automatically rolls back on error and releases the client back to the pool.

```typescript
export async function withTransaction<T>(
  fn: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
```

Usage:

```typescript
import { withTransaction } from '../config/database';

const result = await withTransaction(async (client) => {
  const user = await client.query(
    'INSERT INTO user_account (user_email_address, user_display_name, sso_provider_name) VALUES ($1, $2, $3) RETURNING *',
    [email, displayName, provider],
  );
  await client.query(
    'INSERT INTO audit_log (audit_table_name, audit_record_id, audit_action, audit_new_data) VALUES ($1, $2, $3, $4)',
    ['user_account', user.rows[0].pk_user_account, 'CREATE', JSON.stringify(user.rows[0])],
  );
  return user.rows[0];
});
```

## Migration System

### Migration Runner: `scripts/migrate.ts`

Migrations are TypeScript files in `server/migrations/` executed sequentially. The system tracks applied migrations in a `schema_migrations` table.

```typescript
import fs from 'fs';
import path from 'path';
import { pool } from '../src/config/database';
import { logger } from '../src/utils/logger';

const MIGRATIONS_DIR = path.resolve(__dirname, '..', 'migrations');

async function ensureMigrationsTable(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id SERIAL PRIMARY KEY,
      name VARCHAR(255) NOT NULL UNIQUE,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
}

async function getAppliedMigrations(): Promise<string[]> {
  const result = await pool.query('SELECT name FROM schema_migrations ORDER BY name');
  return result.rows.map((row) => row.name);
}

async function runMigrations(): Promise<void> {
  await ensureMigrationsTable();
  const applied = await getAppliedMigrations();

  const files = fs.readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.ts'))
    .sort();

  let count = 0;
  for (const file of files) {
    if (applied.includes(file)) continue;

    logger.info(`Running migration: ${file}`);
    const migration = require(path.join(MIGRATIONS_DIR, file));

    await pool.query('BEGIN');
    try {
      await migration.up(pool);
      await pool.query('INSERT INTO schema_migrations (name) VALUES ($1)', [file]);
      await pool.query('COMMIT');
      count++;
      logger.info(`Applied migration: ${file}`);
    } catch (error) {
      await pool.query('ROLLBACK');
      logger.error(`Migration failed: ${file}`, { error });
      throw error;
    }
  }

  if (count === 0) {
    logger.info('No pending migrations');
  } else {
    logger.info(`Applied ${count} migration(s)`);
  }
}

runMigrations()
  .then(() => process.exit(0))
  .catch(() => process.exit(1));
```

### Migration File Naming

```
server/migrations/
  001_foundation.ts
  002_user_account.ts
  003_refresh_token.ts
  004_audit_log.ts
  005_resource_item.ts
  ...
```

### Migration File Format

Each migration exports an `up` function that receives the database pool:

```typescript
import { Pool } from 'pg';

export async function up(pool: Pool): Promise<void> {
  await pool.query(`
    CREATE TABLE example (
      pk_example UUID DEFAULT gen_random_uuid() PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TRIGGER set_updated_at
      BEFORE UPDATE ON example
      FOR EACH ROW EXECUTE FUNCTION set_updated_at();
  `);
}
```

> **Standards alignment note:** `standards/01-architecture.md` describes numbered SQL file migrations (`001_create_users.sql`, `002_add_audit_log.sql`). Both patterns are valid; use SQL files for pure schema changes and TypeScript migrations when data transformations or complex logic are required.

## Schema Conventions

### Foundation Migration: Extensions and Auto-Update Trigger

Every project starts with this migration. It enables UUID generation and creates the reusable `set_updated_at` trigger function.

```typescript
import { Pool } from 'pg';

export async function up(pool: Pool): Promise<void> {
  await pool.query(`
    CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
    CREATE EXTENSION IF NOT EXISTS "pgcrypto";

    CREATE OR REPLACE FUNCTION set_updated_at()
    RETURNS TRIGGER AS $$
    BEGIN
      NEW.updated_at = NOW();
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;
  `);
}
```

### User Account Table

```sql
CREATE TABLE user_account (
  pk_user_account UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_email_address VARCHAR(255) NOT NULL UNIQUE,
  user_display_name VARCHAR(255) NOT NULL,
  sso_provider_name VARCHAR(50) NOT NULL,
  google_id VARCHAR(255),
  microsoft_id VARCHAR(255),
  user_role_name VARCHAR(20) NOT NULL DEFAULT 'user'
    CHECK (user_role_name IN ('user', 'admin')),
  avatar_url TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  is_deleted BOOLEAN NOT NULL DEFAULT false,
  deleted_at TIMESTAMPTZ,
  last_login_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON user_account
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
```

### Refresh Token Table

```sql
CREATE TABLE refresh_token (
  pk_refresh_token UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  fk_refresh_token_user_account UUID NOT NULL REFERENCES user_account(pk_user_account),
  token_hash_value VARCHAR(64) NOT NULL UNIQUE,
  token_expires_at TIMESTAMPTZ NOT NULL,
  token_revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_refresh_token_hash
  ON refresh_token (token_hash_value) WHERE token_revoked_at IS NULL;
```

### Audit Log Table

```sql
CREATE TABLE audit_log (
  pk_audit_log UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  audit_table_name VARCHAR(100) NOT NULL,
  audit_record_id UUID,
  audit_action VARCHAR(50) NOT NULL,
  audit_old_data JSONB,
  audit_new_data JSONB,
  audit_user_id UUID,
  audit_ip_address INET,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_audit_log_table_record ON audit_log (audit_table_name, audit_record_id);
CREATE INDEX idx_audit_log_user ON audit_log (audit_user_id);
```

## Design Principles

| Convention | Pattern |
|---|---|
| **Primary keys** | UUID via `gen_random_uuid()`, prefixed `pk_table_name` |
| **Foreign keys** | Prefixed `fk_child_parent` (e.g., `fk_refresh_token_user_account`) |
| **Timestamps** | Always `TIMESTAMPTZ` with `DEFAULT NOW()` |
| **Auto-update** | Every table with `updated_at` gets a `set_updated_at` trigger |
| **Soft deletes** | `is_deleted BOOLEAN DEFAULT false` + `deleted_at TIMESTAMPTZ` |
| **Enums** | `CHECK` constraints instead of PostgreSQL `ENUM` type (easier to modify) |
| **Flexible data** | `JSONB` for tags, metadata, form schemas, submission data |
| **Indexes** | On FK columns, status columns, and frequently filtered fields |
| **Partial indexes** | Use `WHERE` clauses to index only active records (e.g., non-revoked tokens) |

## Model Pattern: Parameterized SQL Only

**Never use string interpolation for SQL queries.** Always use parameterized queries (`$1`, `$2`, ...) to prevent SQL injection.

### Basic Model: `models/user.model.ts`

```typescript
import { pool } from '../config/database';

export interface UserAccount {
  pk_user_account: string;
  user_email_address: string;
  user_display_name: string;
  sso_provider_name: string;
  google_id: string | null;
  microsoft_id: string | null;
  user_role_name: string;
  avatar_url: string | null;
  is_active: boolean;
  is_deleted: boolean;
  deleted_at: Date | null;
  last_login_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

export async function findById(id: string): Promise<UserAccount | null> {
  const result = await pool.query<UserAccount>(
    'SELECT * FROM user_account WHERE pk_user_account = $1 AND is_deleted = false',
    [id],
  );
  return result.rows[0] || null;
}

export async function findByEmail(email: string): Promise<UserAccount | null> {
  const result = await pool.query<UserAccount>(
    'SELECT * FROM user_account WHERE user_email_address = $1 AND is_deleted = false',
    [email],
  );
  return result.rows[0] || null;
}

export async function create(data: {
  email: string;
  displayName: string;
  ssoProvider: string;
  providerId: string;
  avatarUrl?: string;
}): Promise<UserAccount> {
  const providerColumn = data.ssoProvider === 'google' ? 'google_id' : 'microsoft_id';
  const result = await pool.query<UserAccount>(
    `INSERT INTO user_account (
      user_email_address, user_display_name, sso_provider_name, ${providerColumn}, avatar_url
    ) VALUES ($1, $2, $3, $4, $5) RETURNING *`,
    [data.email, data.displayName, data.ssoProvider, data.providerId, data.avatarUrl || null],
  );
  return result.rows[0];
}

export async function updateLastLogin(id: string): Promise<void> {
  await pool.query(
    'UPDATE user_account SET last_login_at = NOW() WHERE pk_user_account = $1',
    [id],
  );
}

export async function softDelete(id: string): Promise<void> {
  await pool.query(
    'UPDATE user_account SET is_deleted = true, deleted_at = NOW() WHERE pk_user_account = $1',
    [id],
  );
}
```

### Refresh Token Model: `models/refresh-token.model.ts`

```typescript
import { pool } from '../config/database';

export async function create(
  userId: string,
  tokenHash: string,
  expiresAt: Date,
): Promise<void> {
  await pool.query(
    `INSERT INTO refresh_token (fk_refresh_token_user_account, token_hash_value, token_expires_at)
     VALUES ($1, $2, $3)`,
    [userId, tokenHash, expiresAt],
  );
}

export async function findByHash(tokenHash: string) {
  const result = await pool.query(
    `SELECT * FROM refresh_token
     WHERE token_hash_value = $1
       AND token_revoked_at IS NULL
       AND token_expires_at > NOW()`,
    [tokenHash],
  );
  return result.rows[0] || null;
}

export async function revoke(tokenHash: string): Promise<void> {
  await pool.query(
    'UPDATE refresh_token SET token_revoked_at = NOW() WHERE token_hash_value = $1',
    [tokenHash],
  );
}

export async function revokeAllForUser(userId: string): Promise<void> {
  await pool.query(
    `UPDATE refresh_token SET token_revoked_at = NOW()
     WHERE fk_refresh_token_user_account = $1 AND token_revoked_at IS NULL`,
    [userId],
  );
}
```

## Error Mapping for PostgreSQL Error Codes

Map database-level errors to user-friendly messages. This is used by the global error handler (see Skill 02).

```typescript
const DB_ERROR_MESSAGES: Record<string, string> = {
  '23505': 'A record with that value already exists',          // unique_violation
  '23503': 'Referenced record does not exist',                 // foreign_key_violation
  '23502': 'A required field is missing',                      // not_null_violation
  '23514': 'Value does not meet validation requirements',      // check_violation
  '22P02': 'Invalid input format',                             // invalid_text_representation
  '22003': 'Numeric value out of range',                       // numeric_value_out_of_range
  '42P01': 'Internal configuration error',                     // undefined_table
  '42703': 'Internal configuration error',                     // undefined_column
  '40P01': 'Please retry your request',                        // deadlock_detected
  '57014': 'Request timed out',                                // query_canceled
};
```

## Seed Data Script: `scripts/seed.ts`

Inserts sample data for development. Uses `ON CONFLICT DO NOTHING` to be safely re-runnable.

```typescript
import { pool } from '../src/config/database';
import { logger } from '../src/utils/logger';

async function seed(): Promise<void> {
  logger.info('Seeding database...');

  // Seed admin user
  await pool.query(`
    INSERT INTO user_account (
      user_email_address, user_display_name, sso_provider_name, user_role_name
    ) VALUES
      ('admin@example.com', 'Admin User', 'google', 'admin'),
      ('user@example.com', 'Test User', 'google', 'user')
    ON CONFLICT (user_email_address) DO NOTHING
  `);

  // Seed example data (customize for your domain)
  // await pool.query(`
  //   INSERT INTO resource_item (resource_title, resource_category, resource_status, resource_content)
  //   VALUES
  //     ('Getting Started Guide', 'guide', 'published', 'Welcome to the platform...'),
  //     ('System Policy v1', 'policy', 'published', 'This policy governs...')
  //   ON CONFLICT DO NOTHING
  // `);

  logger.info('Seed complete');
}

seed()
  .then(() => process.exit(0))
  .catch((err) => {
    logger.error('Seed failed', { error: err.message });
    process.exit(1);
  });
```

## Migration CLI Script

Add to `server/package.json` scripts:

```json
{
  "scripts": {
    "db:migrate": "tsx scripts/migrate.ts",
    "db:seed": "tsx scripts/seed.ts"
  }
}
```

Run from the monorepo root:

```bash
npm run db:migrate    # Apply pending migrations
npm run db:seed       # Insert development seed data
```
