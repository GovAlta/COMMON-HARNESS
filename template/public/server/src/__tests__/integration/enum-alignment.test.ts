import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

/**
 * Enum / CHECK-constraint alignment tests.
 *
 * These tests catch the class of bug where a Postgres CHECK constraint, a
 * TypeScript union, a Zod validator, and a client dropdown drift out of sync.
 *
 * That happened once already: migration 014 shipped a notification-type CHECK
 * with one set of values; the Zod validator and the admin UI shipped a
 * different set; admins picking certain dropdown options got 23514 CHECK
 * violations at INSERT time, surfaced as a confusing 422. Tests that mock
 * `pg.Pool` (which is almost every test in this codebase) couldn't catch it
 * because the CHECK only fires against a real Postgres.
 *
 * The fix is a regex against the migration source — we read the CHECK clause
 * directly from the SQL file and assert that every value the validator
 * accepts is in the CHECK set. Cheap, deterministic, zero infrastructure.
 */

const MIGRATIONS = path.resolve(__dirname, '..', '..', '..', 'migrations');

/**
 * Pull every quoted string out of a `CHECK (col IN (…))` clause for the
 * named constraint. Returns the de-duplicated set of allowed values.
 *
 * The migration sequence may DROP + re-ADD the same named constraint across
 * multiple files. We walk all migrations in order and keep only the LAST
 * definition we see — which is what Postgres has at runtime.
 */
function loadCheckSet(constraintName: string): Set<string> {
  const files = fs
    .readdirSync(MIGRATIONS)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  let lastSet: Set<string> | null = null;
  // Constraint may be declared inline:  `CONSTRAINT <name> CHECK (col IN ('a', 'b'))`
  // or out-of-line:                     `ADD CONSTRAINT <name> CHECK (col IN ('a', 'b'))`
  const inline = new RegExp(
    `CONSTRAINT\\s+${constraintName}\\s+CHECK\\s*\\([^)]*IN\\s*\\(([^)]+)\\)\\s*\\)`,
    'i'
  );
  const altered = new RegExp(
    `ADD\\s+CONSTRAINT\\s+${constraintName}\\s+CHECK\\s*\\(\\s*[^()]*IN\\s*\\(([^)]+)\\)\\s*\\)`,
    'i'
  );

  for (const f of files) {
    // Strip SQL line comments (`-- to end of line`) and trailing whitespace
    // before regex matching. Without this, multi-line CHECK clauses with
    // inline rationale comments break the comma split (the entire comment
    // line ends up inside the captured group).
    const sql = fs
      .readFileSync(path.join(MIGRATIONS, f), 'utf8')
      .replace(/--[^\n]*/g, '');
    const m = sql.match(inline) || sql.match(altered);
    if (m) {
      // Extract single-quoted literals from the IN list. A regex on the
      // capture is more forgiving than comma-splitting + trimming, since the
      // capture may still contain stray whitespace, newlines, or trailing
      // commas if the CHECK is multi-line.
      const values = (m[1].match(/'([^']*)'/g) || []).map((s) => s.slice(1, -1));
      if (values.length > 0) lastSet = new Set(values);
    }
  }

  if (!lastSet) {
    throw new Error(
      `No CHECK constraint named '${constraintName}' found in any migration. ` +
      `Update the constraint name in the test, or fix the migration.`
    );
  }
  return lastSet;
}

describe('Enum alignment — DB CHECK ↔ Zod ↔ TypeScript', () => {
  it('notification_message: every validator-accepted type satisfies the DB CHECK', async () => {
    const dbAllowed = loadCheckSet('ck_notification_message_type');

    // Pull the Zod enum dynamically so the test follows code changes.
    const { broadcastNotificationSchema } = await import('../../validators/admin.validator');
    const typeSchema = (broadcastNotificationSchema.body as unknown as {
      shape: { type: { options: readonly string[] } };
    }).shape.type;
    const validatorAccepts = new Set(typeSchema.options);

    const missingFromDb = [...validatorAccepts].filter((v) => !dbAllowed.has(v));
    expect(missingFromDb, `Zod broadcast validator accepts types that the DB
CHECK constraint will reject at INSERT time. Either widen the CHECK in a new
migration, or narrow the Zod enum. Offenders: ${missingFromDb.join(', ')}`).toEqual([]);
  });

  it('user_account: every role in ROLE_HIERARCHY satisfies the DB CHECK', async () => {
    const dbAllowed = loadCheckSet('ck_user_account_role');
    const { ROLE_HIERARCHY } = await import('../../middleware/authorize');
    const missing = ROLE_HIERARCHY.filter((r) => !dbAllowed.has(r));
    expect(missing, `Role(s) in ROLE_HIERARCHY missing from the DB CHECK
constraint — adding them in middleware/authorize.ts alone leaks a 23514 the
first time an admin assigns the new role. Offenders: ${missing.join(', ')}`).toEqual([]);
  });

  it('resource_item: every status the public controller may serve is in the DB CHECK', async () => {
    const dbAllowed = loadCheckSet('ck_resource_item_status');
    // Mirror the application-level set; if a new status is added, this test
    // forces an update to the migration first.
    const appUses = new Set(['published', 'draft', 'archived']);
    const missing = [...appUses].filter((s) => !dbAllowed.has(s));
    expect(missing, `Resource status(es) used in the app are missing from
the DB CHECK constraint. Add them in a migration before shipping. Offenders:
${missing.join(', ')}`).toEqual([]);
  });
});
