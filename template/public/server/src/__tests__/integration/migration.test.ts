import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

describe('Migration Files', () => {
  const migrationsDir = path.resolve(__dirname, '../../../migrations');

  it('should have all migration files', () => {
    const files = fs.readdirSync(migrationsDir)
      .filter((f: string) => f.endsWith('.sql'))
      .sort();

    expect(files.length).toBeGreaterThanOrEqual(17);
  });

  it('should have idempotent migrations (CREATE TABLE IF NOT EXISTS)', () => {
    const files = fs.readdirSync(migrationsDir)
      .filter((f: string) => f.endsWith('.sql'))
      .sort();

    for (const file of files) {
      const content = fs.readFileSync(path.join(migrationsDir, file), 'utf-8');
      // Table creation files should use IF NOT EXISTS
      if (content.includes('CREATE TABLE')) {
        expect(
          content.includes('IF NOT EXISTS'),
          `${file} should use CREATE TABLE IF NOT EXISTS for idempotency`
        ).toBe(true);
      }
      // Index creation should use IF NOT EXISTS
      if (content.includes('CREATE INDEX') && !content.includes('CREATE OR REPLACE')) {
        expect(
          content.includes('IF NOT EXISTS'),
          `${file} should use CREATE INDEX IF NOT EXISTS for idempotency`
        ).toBe(true);
      }
    }
  });

  it('should have migrations in sequential order', () => {
    const files = fs.readdirSync(migrationsDir)
      .filter((f: string) => f.endsWith('.sql'))
      .sort();

    for (let i = 0; i < files.length - 1; i++) {
      const currentNum = parseInt(files[i].split('_')[0]);
      const nextNum = parseInt(files[i + 1].split('_')[0]);
      expect(nextNum).toBeGreaterThan(currentNum);
    }
  });

  it('should have database extensions migration first', () => {
    const files = fs.readdirSync(migrationsDir)
      .filter((f: string) => f.endsWith('.sql'))
      .sort();

    expect(files[0]).toContain('extensions');
  });

  it('should have all required tables across migrations', () => {
    const files = fs.readdirSync(migrationsDir)
      .filter((f: string) => f.endsWith('.sql'))
      .sort();

    const allContent = files.map(f =>
      fs.readFileSync(path.join(migrationsDir, f), 'utf-8')
    ).join('\n');

    const requiredTables = [
      'user_account',
      'refresh_token',
      'audit_log',
      'resource_item',
      'resource_update',
      'service_location',
      'service_category',
      'service_catalogue',
      'form_definition',
      'form_submission',
      'file_attachment',
      'notification_subscription',
      'notification_message',
      'notification_delivery',
      'ai_conversation',
      'ai_message',
    ];

    for (const table of requiredTables) {
      expect(
        allContent.includes(`CREATE TABLE IF NOT EXISTS ${table}`),
        `Missing migration for table: ${table}`
      ).toBe(true);
    }
  });

  it('should use UUID primary keys', () => {
    const files = fs.readdirSync(migrationsDir)
      .filter((f: string) => f.endsWith('.sql'))
      .sort();

    // Skip extensions migration
    for (let i = 1; i < files.length; i++) {
      const content = fs.readFileSync(path.join(migrationsDir, files[i]), 'utf-8');
      if (content.includes('CREATE TABLE IF NOT EXISTS')) {
        expect(
          content.includes('UUID') && content.includes('PRIMARY KEY'),
          `${files[i]} should use UUID primary keys`
        ).toBe(true);
      }
    }
  });

  it('should have updated_at triggers', () => {
    const files = fs.readdirSync(migrationsDir)
      .filter((f: string) => f.endsWith('.sql'))
      .sort();

    // Check table-creating migrations (skip extensions and index-only files)
    for (const file of files) {
      const content = fs.readFileSync(path.join(migrationsDir, file), 'utf-8');
      if (content.includes('CREATE TABLE IF NOT EXISTS') && content.includes('updated_at')) {
        expect(
          content.includes('set_updated_at()') || content.includes('trg_'),
          `${file} should have updated_at trigger`
        ).toBe(true);
      }
    }
  });
});
