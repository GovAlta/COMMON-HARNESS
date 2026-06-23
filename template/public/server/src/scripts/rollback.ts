import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import pg from 'pg';

// Load .env from project root
dotenv.config({ path: path.resolve(process.cwd(), '..', '.env') });
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const { Pool } = pg;

async function rollback(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error('DATABASE_URL environment variable is required');
    process.exit(1);
  }

  const pool = new Pool({
    connectionString: databaseUrl,
    ssl: databaseUrl.includes('sslmode=require') || databaseUrl.includes('render.com')
      ? { rejectUnauthorized: false }
      : undefined,
  });

  try {
    // Check if schema_migration table exists
    const { rows: tableExists } = await pool.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables
        WHERE table_name = 'schema_migration'
      ) AS exists;
    `);

    if (!tableExists[0]?.exists) {
      console.log('No migrations have been applied yet.');
      await pool.end();
      return;
    }

    // Get the last applied migration
    const { rows } = await pool.query(
      'SELECT id, filename FROM schema_migration ORDER BY filename DESC LIMIT 1'
    );

    if (rows.length === 0) {
      console.log('No migrations to rollback.');
      await pool.end();
      return;
    }

    const lastMigration = rows[0];
    console.log(`Rolling back: ${lastMigration.filename}`);

    // Check for a corresponding rollback file
    const migrationsDir = path.resolve(process.cwd(), 'migrations');
    const rollbackFile = path.join(migrationsDir, lastMigration.filename.replace('.sql', '.rollback.sql'));

    if (fs.existsSync(rollbackFile)) {
      const sql = fs.readFileSync(rollbackFile, 'utf-8');
      await pool.query(sql);
    } else {
      console.log(`  No rollback file found for ${lastMigration.filename}. Removing from tracking only.`);
    }

    // Remove from tracking table
    await pool.query('DELETE FROM schema_migration WHERE id = $1', [lastMigration.id]);
    console.log(`Successfully rolled back: ${lastMigration.filename}`);
  } catch (error) {
    console.error('Rollback failed:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

console.log('Rolling back last migration...');
rollback();
