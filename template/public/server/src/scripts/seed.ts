import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import pg from 'pg';

// Load .env from project root
dotenv.config({ path: path.resolve(process.cwd(), '..', '.env') });
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const { Pool } = pg;

async function seed(): Promise<void> {
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
    const seedsDir = path.resolve(process.cwd(), 'seeds');

    if (!fs.existsSync(seedsDir)) {
      console.log('No seeds directory found. Creating it...');
      fs.mkdirSync(seedsDir, { recursive: true });
      console.log('Seeds directory created. Add .sql files to seeds/ to populate data.');
      return;
    }

    const files = fs.readdirSync(seedsDir)
      .filter((f: string) => f.endsWith('.sql'))
      .sort();

    if (files.length === 0) {
      console.log('No seed files found in seeds/.');
      return;
    }

    for (const file of files) {
      const filePath = path.join(seedsDir, file);
      const sql = fs.readFileSync(filePath, 'utf-8');
      console.log(`  [seed] ${file}`);
      await pool.query(sql);
    }

    console.log(`Successfully executed ${files.length} seed file(s).`);
  } catch (error) {
    console.error('Seeding failed:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

console.log('Running database seeds...');
seed();
