import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import pg from 'pg';

// Load .env from project root
dotenv.config({ path: path.resolve(process.cwd(), '..', '.env') });
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const { Pool } = pg;

async function migrate(): Promise<void> {
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
    // Drop old schema_migration table if it has wrong schema and recreate
    const { rows: columns } = await pool.query(`
      SELECT column_name FROM information_schema.columns 
      WHERE table_name = 'schema_migration'
    `);
    const columnNames = columns.map((c: { column_name: string }) => c.column_name);
    
    if (columnNames.length > 0 && !columnNames.includes('filename')) {
      console.log('  [info] Recreating schema_migration table with correct schema...');
      await pool.query('DROP TABLE IF EXISTS schema_migration');
    }

    // Create schema_migration tracking table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS schema_migration (
        id SERIAL PRIMARY KEY,
        filename VARCHAR(255) NOT NULL UNIQUE,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    // Read migration files from migrations directory
    const migrationsDir = path.resolve(process.cwd(), 'migrations');
    if (!fs.existsSync(migrationsDir)) {
      console.log('No migrations directory found.');
      await pool.end();
      return;
    }

    const files = fs.readdirSync(migrationsDir)
      .filter((f: string) => f.endsWith('.sql') && !f.includes('.rollback.'))
      .sort();

    // Clean up stale entries in schema_migration that reference files no longer on disk
    const fileSet = new Set(files);
    const { rows: applied } = await pool.query(
      'SELECT filename FROM schema_migration ORDER BY filename'
    );
    for (const row of applied) {
      if (!fileSet.has(row.filename)) {
        console.log(`  [clean] ${row.filename} (removed from disk)`);
        await pool.query('DELETE FROM schema_migration WHERE filename = $1', [row.filename]);
      }
    }

    // Get currently applied migrations (after cleanup)
    const { rows: currentApplied } = await pool.query(
      'SELECT filename FROM schema_migration ORDER BY filename'
    );
    const appliedSet = new Set(currentApplied.map((r: { filename: string }) => r.filename));

    if (files.length === 0) {
      console.log('No migration files found.');
      await pool.end();
      return;
    }

    let migrationsRun = 0;

    for (const file of files) {
      if (appliedSet.has(file)) {
        console.log(`  [skip] ${file} (already applied)`);
        continue;
      }

      const filePath = path.join(migrationsDir, file);
      const sql = fs.readFileSync(filePath, 'utf-8');

      console.log(`  [run]  ${file}`);
      await pool.query(sql);
      await pool.query(
        'INSERT INTO schema_migration (filename) VALUES ($1)',
        [file]
      );
      migrationsRun++;
    }

    if (migrationsRun === 0) {
      console.log('All migrations already applied.');
    } else {
      console.log(`Successfully applied ${migrationsRun} migration(s).`);
    }
  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

console.log('Running database migrations...');
migrate();
