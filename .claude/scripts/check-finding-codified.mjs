#!/usr/bin/env node
/**
 * check-finding-codified.mjs — Stop gate
 *
 * After any redteam or blueteam finding is fixed, the fix PRINCIPLE must be
 * codified in .claude/standards/02-security.md before the session can close.
 *
 * How it works:
 *   1. Reads the latest redteam PoC report (poc_testing_MAC001.json) and
 *      blueteam scan results (security-scan-results.json).
 *   2. For every CRITICAL or HIGH finding, checks that its ID or a keyword
 *      from its title appears in 02-security.md.
 *   3. Hard-blocks if any CRITICAL/HIGH finding has no corresponding entry.
 *
 * This gate enforces the standing rule:
 *   "Every fixed security finding must produce a harness standard entry
 *    so the same class of mistake can never recur."
 */

import { readFileSync, existsSync } from 'fs';
import { resolve, join } from 'path';

function findRoot(start) {
  let dir = start;
  for (let i = 0; i < 8; i++) {
    if (existsSync(join(dir, 'CLAUDE.md')) && existsSync(join(dir, '.claude'))) return dir;
    const parent = resolve(dir, '..');
    if (parent === dir) break;
    dir = parent;
  }
  return start;
}

const root = findRoot(process.cwd());
const standardPath = join(root, '.claude', 'standards', '02-security.md');
const pocPath = join(root, 'app', '.ai', 'reports', 'poc_testing_MAC001.json');
const blueteamPath = join(root, 'app', '.ai', 'data', 'security-scan-results.json');

let exitCode = 0;
const errors = [];

if (!existsSync(standardPath)) {
  console.warn('  ⚠ finding-codified  02-security.md not found — skipping check');
  process.exit(0);
}

const standard = readFileSync(standardPath, 'utf8').toLowerCase();

// ── Check redteam PoC findings ─────────────────────────────────────────────
if (existsSync(pocPath)) {
  let poc;
  try { poc = JSON.parse(readFileSync(pocPath, 'utf8')); } catch { poc = null; }

  const findings = poc?.findings ?? poc?.pocs ?? poc?.exploits ?? [];
  const critical = findings.filter(f =>
    ['critical', 'high'].includes((f.severity ?? f.risk_level ?? '').toLowerCase())
  );

  for (const f of critical) {
    const id = (f.id ?? f.poc_id ?? '').toLowerCase();
    const title = (f.title ?? f.name ?? f.vulnerability ?? '').toLowerCase();
    // Check by ID or first 3 significant words of title
    const keywords = [id, ...title.split(/\s+/).filter(w => w.length > 4).slice(0, 3)];
    const codified = keywords.some(kw => kw && standard.includes(kw));
    if (!codified) {
      errors.push(
        `Redteam finding "${f.title ?? f.id}" (${f.severity ?? f.risk_level}) is not codified in 02-security.md — ` +
        `add a rule/section so this class of issue can never recur.`
      );
    }
  }

  if (critical.length > 0 && errors.length === 0) {
    console.log(`  ✓ finding-codified  all ${critical.length} CRITICAL/HIGH redteam finding(s) codified in standard`);
  }
} else {
  console.log('  ✓ finding-codified  no redteam PoC report found — skipping PoC check');
}

// ── Check blueteam deterministic scan ─────────────────────────────────────
if (existsSync(blueteamPath)) {
  let scan;
  try { scan = JSON.parse(readFileSync(blueteamPath, 'utf8')); } catch { scan = null; }

  const findings = scan?.findings ?? [];
  const critical = findings.filter(f =>
    ['critical', 'high'].includes((f.severity ?? '').toLowerCase())
  );

  for (const f of critical) {
    const title = (f.title ?? f.name ?? f.check ?? '').toLowerCase();
    const keywords = title.split(/\s+/).filter(w => w.length > 4).slice(0, 3);
    const codified = keywords.some(kw => kw && standard.includes(kw));
    if (!codified) {
      errors.push(
        `Blueteam finding "${f.title ?? f.name}" (${f.severity}) is not codified in 02-security.md — ` +
        `add a rule/section so this class of issue can never recur.`
      );
    }
  }
}

if (errors.length > 0) {
  errors.forEach(e => console.error(`  ✗ finding-codified  ${e}`));
  exitCode = 1;
}

process.exit(exitCode);
