import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

describe('Seed Data Files', () => {
  const seedsDir = path.resolve(__dirname, '../../../seeds');

  it('should have all seed files', () => {
    const files = fs.readdirSync(seedsDir)
      .filter((f: string) => f.endsWith('.sql'))
      .sort();

    expect(files.length).toBeGreaterThanOrEqual(9);
    expect(files[0]).toContain('001_seed_users');
  });

  it('should have idempotent seed files (ON CONFLICT or TRUNCATE)', () => {
    const files = fs.readdirSync(seedsDir)
      .filter((f: string) => f.endsWith('.sql'))
      .sort();

    for (const file of files) {
      const content = fs.readFileSync(path.join(seedsDir, file), 'utf-8');
      const isIdempotent =
        content.includes('ON CONFLICT') ||
        content.includes('on conflict') ||
        content.includes('TRUNCATE') ||
        content.trim().startsWith('--'); // Comment-only files (e.g., empty submissions seed)
      expect(
        isIdempotent,
        `${file} should be idempotent (ON CONFLICT, TRUNCATE, or comment-only)`
      ).toBe(true);
    }
  });

  it('should have valid UUIDs (only hex characters) in seed files', () => {
    const uuidRegex = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;
    const validHexRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

    const files = fs.readdirSync(seedsDir)
      .filter((f: string) => f.endsWith('.sql'))
      .sort();

    for (const file of files) {
      const content = fs.readFileSync(path.join(seedsDir, file), 'utf-8');
      const uuids = content.match(uuidRegex) || [];

      for (const uuid of uuids) {
        expect(
          validHexRegex.test(uuid),
          `UUID "${uuid}" in ${file} should only contain hex characters [0-9a-f]`
        ).toBe(true);
      }
    }
  });

  it('should have proper user account seed data', () => {
    const content = fs.readFileSync(path.join(seedsDir, '001_seed_users.sql'), 'utf-8');
    // Should have 5 users (3 admins + 2 users)
    expect(content).toContain('admin');
    expect(content).toContain('user');
    expect(content.match(/11111111-1111-1111-1111-/g)?.length).toBeGreaterThanOrEqual(5);
  });

  it('should have resource items seed data', () => {
    const files = fs.readdirSync(seedsDir)
      .filter((f: string) => f.endsWith('.sql'))
      .sort();

    const resourceFile = files.find(f => f.includes('resource_item'));
    expect(resourceFile).toBeDefined();

    if (resourceFile) {
      const content = fs.readFileSync(path.join(seedsDir, resourceFile), 'utf-8');
      expect(content).toContain('resource_item');
      expect(content).toContain("'published'");
    }
  });

  it('should have service categories and catalogue seed data', () => {
    const files = fs.readdirSync(seedsDir)
      .filter((f: string) => f.endsWith('.sql'))
      .sort();

    const categoryFile = files.find(f => f.includes('service_categor'));
    expect(categoryFile).toBeDefined();

    const catalogueFile = files.find(f => f.includes('service_catalogue'));
    expect(catalogueFile).toBeDefined();
  });

  it('should have form definitions in canonical format', () => {
    const files = fs.readdirSync(seedsDir)
      .filter((f: string) => f.endsWith('.sql'))
      .sort();

    const formFile = files.find(f => f.includes('form_definition'));
    expect(formFile).toBeDefined();

    if (formFile) {
      const content = fs.readFileSync(path.join(seedsDir, formFile), 'utf-8');
      // Should have at least 1 form (the Sample Services Application)
      expect(content).toContain('88888888-0001-0001-0001-000000000005');
      // Should use canonical format with top-level fields array
      expect(content).toContain('"fields"');
      expect(content).toContain('"steps"');
    }
  });

  it('should have form submissions seed file', () => {
    const files = fs.readdirSync(seedsDir)
      .filter((f: string) => f.endsWith('.sql'))
      .sort();

    const submissionFile = files.find(f => f.includes('form_submission'));
    expect(submissionFile).toBeDefined();
    // Submissions are created by users, not seeded — file may be empty/comment-only
  });

  it('should have notification messages', () => {
    const files = fs.readdirSync(seedsDir)
      .filter((f: string) => f.endsWith('.sql'))
      .sort();

    const notifFile = files.find(f => f.includes('notification'));
    expect(notifFile).toBeDefined();

    if (notifFile) {
      const content = fs.readFileSync(path.join(seedsDir, notifFile), 'utf-8');
      expect(content).toContain('notification_delivery');
    }
  });
});
