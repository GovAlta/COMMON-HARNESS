#!/usr/bin/env node
/**
 * check-external-deps.mjs — fail fast at /phase2-planning if any external
 * dependency listed in /v1 requirements.md is unconfirmed.
 *
 * Catches the "Microsoft tenant blocker" class of failure: /v1 should have
 * surfaced "external deps that block must-have FRs" in §9. /v2 should have
 * refused to plan around dependencies that aren't confirmed available.
 *
 * Looks for a "## External Dependencies" or "External Dependencies" subsection
 * in requirements.md (added by the post-audit /v1 SKILL.md update).
 *
 * The format expected:
 *   | Dep | Required for FR(s) | Owner | Status | ETA / Confirmed |
 *   |-----|--------------------|-------|--------|-----------------|
 *   | Microsoft tenant for SSO | FR-017 | Project sponsor | unconfirmed | — |
 *   | Render Postgres | M1 onwards | User | confirmed | DB string in .env |
 *
 * Status values: `confirmed` (good), `unconfirmed` / `pending` / `blocked` (bad).
 *
 * Usage:
 *   node .claude/scripts/check-external-deps.mjs
 *   node .claude/scripts/check-external-deps.mjs --json
 *
 * Exits 0 if all deps confirmed, 1 if any unconfirmed/pending/blocked.
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

const REQUIREMENTS = path.join(ROOT, 'phases', 'phase1-requirements', 'output', 'requirements.md');
if (!fs.existsSync(REQUIREMENTS)) {
  console.error('check-external-deps: requirements.md not found at phases/phase1-requirements/output/');
  process.exit(2);
}

const text = fs.readFileSync(REQUIREMENTS, 'utf8');

// Find a section heading containing "external dependencies" (case-insensitive)
const lines = text.split(/\r?\n/);
let inSection = false;
let sectionLines = [];
for (let i = 0; i < lines.length; i++) {
  const h = lines[i].match(/^#{1,6}\s+(.+)$/);
  if (h) {
    if (inSection) break; // hit next heading; stop collecting
    if (/external\s+dependenc/i.test(h[1])) inSection = true;
  } else if (inSection) {
    sectionLines.push(lines[i]);
  }
}

if (!inSection || sectionLines.length === 0) {
  console.log('\nexternal-dependency check');
  console.log('─'.repeat(64));
  console.log('  ✘ requirements.md has NO "External Dependencies" section.');
  console.log('  Per harness rule #10 (no silent deferrals), every requirements doc');
  console.log('  must explicitly enumerate external deps that block must-have FRs.');
  console.log('  Add a section listing each dep + its status (confirmed / unconfirmed).');
  console.log('');
  process.exit(1);
}

// Parse the table inside the section
const deps = [];
for (const line of sectionLines) {
  const m = line.match(/^\|\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|\s*([^|]*?)\s*\|/);
  if (!m) continue;
  // Skip header + separator rows
  const [, dep, frs, owner, status] = m;
  if (/^[\s|:-]+$/.test(line)) continue;
  if (/^Dep(s|endency)?$/i.test(dep) && /Required\s*for/i.test(frs)) continue;
  deps.push({
    dependency: dep.trim(),
    blocksFRs:  frs.trim(),
    owner:      owner.trim(),
    status:     status.trim().toLowerCase(),
    note:       (m[5] || '').trim(),
  });
}

// `confirmed` and `confirmed-as-deferrable` both unblock /phase2-planning.
// `confirmed-as-deferrable` means: the dep is acknowledged but its absence
// at build-time does not block the FRs (e.g. SSO deferred via local auth fallback,
// GitHub commits deferred for development-only runs). The dep is captured for
// audit but not blocking.
const isOK = d => /^confirmed$/i.test(d.status) || /^confirmed[\s-]+as[\s-]+deferrable$/i.test(d.status);
const unconfirmed = deps.filter(d => !isOK(d));
const confirmed   = deps.filter(d =>  isOK(d));

if (JSON_OUT) {
  console.log(JSON.stringify({
    ok: unconfirmed.length === 0,
    totalDeps: deps.length,
    confirmed: confirmed.length,
    unconfirmed,
  }, null, 2));
} else {
  console.log('\nexternal-dependency check');
  console.log('─'.repeat(64));
  console.log(`  parsed: ${deps.length} dependency rows`);
  console.log(`  ✓ confirmed:   ${confirmed.length}`);
  console.log(`  ✘ unconfirmed: ${unconfirmed.length}`);
  console.log('─'.repeat(64));
  for (const d of confirmed) {
    console.log(`  ✓  ${d.dependency.padEnd(28)} blocks=${d.blocksFRs}   owner=${d.owner}`);
  }
  for (const d of unconfirmed) {
    console.log(`  ✘  ${d.dependency.padEnd(28)} status=${d.status}   blocks=${d.blocksFRs}   owner=${d.owner}`);
    if (d.note) console.log(`      note: ${d.note}`);
  }
  console.log('');
  if (unconfirmed.length) {
    console.log('  /phase2-planning MUST NOT proceed until every dep is confirmed.');
    console.log('  If a dep cannot be confirmed in time, the FR(s) it blocks must be');
    console.log('  scope-cut (downgraded from must to should/wont) BEFORE /phase2-planning,');
    console.log('  not silently dropped during /phase5-development.');
  }
}
process.exit(unconfirmed.length > 0 ? 1 : 0);
