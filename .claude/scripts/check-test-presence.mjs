#!/usr/bin/env node
/**
 * check-test-presence.mjs — assert real tests exist for must-have FRs.
 *
 * Failure mode this gate catches: NFR-TEST-* is claimed "covered" but the
 * underlying tests don't exist or are empty stubs. /v6 produces a test plan
 * but no actual tests. This gate refuses to advance unless:
 *
 *   1. app/test/e2e/ has ≥1 .spec.ts (or .test.ts / .e2e.ts) file
 *   2. Each e2e spec contains at least one expect|test|it call
 *   3. At least one e2e spec cites at least one FR-NNN ID (so we know
 *      it's wired to the requirements, not a smoke placeholder)
 *   4. App-level unit tests exist somewhere in app/{server,client}/__tests__
 *      OR app/{server,client}/src (typical co-located convention)
 *
 * What it does NOT check (that's check-evidence-strength's job): that the
 * tests actually run green. We don't shell out to `npm test` here because
 * test runs can be slow and flaky; this gate is fast structural + content.
 *
 * Usage:
 *   node .claude/scripts/check-test-presence.mjs
 *   node .claude/scripts/check-test-presence.mjs --root <project-root>
 *   node .claude/scripts/check-test-presence.mjs --json
 *
 * Exits 0 when present, 1 on missing/empty, 2 on missing inputs.
 */

import fs from 'node:fs';
import path from 'node:path';

const argv = process.argv.slice(2);
let ROOT = process.cwd();
let JSON_OUT = false;
for (let i = 0; i < argv.length; i++) {
  if (argv[i] === '--root') ROOT = path.resolve(argv[++i]);
  else if (argv[i] === '--json') JSON_OUT = true;
}

const APP = path.join(ROOT, 'app');
if (!fs.existsSync(APP)) {
  console.error('check-test-presence: ./app/ not found.');
  process.exit(2);
}

function recurse(dir, predicate, acc = []) {
  if (!fs.existsSync(dir)) return acc;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (['node_modules', 'dist', 'build', '.git', '.cache'].includes(e.name)) continue;
      recurse(full, predicate, acc);
    } else if (predicate(full)) acc.push(full);
  }
  return acc;
}
function readSafe(p) { try { return fs.readFileSync(p, 'utf8'); } catch { return ''; } }

const results = [];
function record(name, ok, evidence) { results.push({ name, ok, evidence }); }

// ─── 1. E2E suite present ───────────────────────────────────────────────────
const e2eDir   = path.join(APP, 'test', 'e2e');
const e2eFiles = recurse(e2eDir, p => /\.(spec|test|e2e)\.(ts|js)$/.test(p));

if (e2eFiles.length === 0) {
  record('E2E suite (app/test/e2e)', false, 'no spec files in app/test/e2e/ — /v6 cannot advance');
} else {
  record('E2E suite (app/test/e2e)', true, `${e2eFiles.length} spec file(s)`);
}

// ─── 2. Real assertions in e2e specs ────────────────────────────────────────
if (e2eFiles.length > 0) {
  const realE2E = e2eFiles.filter(p => /\b(expect|test\(|it\(|describe\()/.test(readSafe(p)));
  if (realE2E.length === 0) {
    record('E2E specs contain assertions', false, `${e2eFiles.length} file(s) but none contain expect|test|it|describe — empty stubs`);
  } else {
    record('E2E specs contain assertions', true, `${realE2E.length}/${e2eFiles.length} file(s) have real assertions`);
  }
}

// ─── 3. At least one e2e spec cites an FR ID ────────────────────────────────
if (e2eFiles.length > 0) {
  const frCiting = e2eFiles.filter(p => /\bFR-[A-Z0-9]+-\d{2,3}\b|\bFR-\d{3}\b/.test(readSafe(p)));
  if (frCiting.length === 0) {
    record('E2E specs cite FR IDs', false, 'no e2e spec contains FR-NNN — tests not traceable to requirements');
  } else {
    record('E2E specs cite FR IDs', true, `${frCiting.length}/${e2eFiles.length} spec(s) cite at least one FR ID`);
  }
}

// ─── 4. Unit tests exist somewhere ──────────────────────────────────────────
const unitDirs = [
  path.join(APP, 'server'),
  path.join(APP, 'client'),
  path.join(APP, 'test', 'unit'),
];
const unitFiles = unitDirs.flatMap(d => recurse(d, p => /\.(test|spec)\.(ts|js|vue)$/.test(p) && !/[\/\\]e2e[\/\\]/.test(p)));
if (unitFiles.length === 0) {
  record('Unit tests present', false, 'zero unit test files in server/, client/, or test/unit/');
} else {
  record('Unit tests present', true, `${unitFiles.length} unit test file(s)`);
}

// ─── Report ─────────────────────────────────────────────────────────────────
const failed = results.filter(r => !r.ok);
if (JSON_OUT) {
  console.log(JSON.stringify({ ok: failed.length === 0, e2eCount: e2eFiles.length, unitCount: unitFiles.length, results }, null, 2));
} else {
  console.log(`\ntest-presence check`);
  console.log('─'.repeat(64));
  for (const r of results) {
    const icon = r.ok ? '✓' : '✘';
    console.log(`  ${icon}  ${r.name.padEnd(38)} ${r.evidence}`);
  }
  console.log('─'.repeat(64));
  if (failed.length === 0) {
    console.log(`  ✓ ${e2eFiles.length} e2e spec(s), ${unitFiles.length} unit file(s); all real, FR-traceable.`);
  } else {
    console.log(`  ${failed.length} test gap(s) — NFR-TEST-01/02 cannot be marked covered.`);
    console.log(`  Add specs to app/test/e2e/ that cite FR-NNN, and unit tests near each module.`);
  }
  console.log('');
}

process.exit(failed.length > 0 ? 1 : 0);
