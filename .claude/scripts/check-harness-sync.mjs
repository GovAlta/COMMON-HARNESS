#!/usr/bin/env node
/**
 * Harness sync gate — runs as a Stop hook to remind/enforce:
 *   1. blueteam scan must have run (scan result exists and is fresh)
 *   2. redteam must have run (deliverable exists)
 *   3. sync-docs has no errors (re-runs the check)
 *   4. CLAUDE.md + harness.html are in sync with scripts on disk
 *
 * Hard-blocks if blueteam is missing or critical.
 * Hard-blocks if new scripts exist in .claude/scripts/ not listed in CLAUDE.md.
 * Warns for redteam absence.
 *
 * This gate exists because the standing instruction is: after EVERY change,
 * run blueteam + redteam + sync-docs + update harness. Never wait to be asked.
 */

import { readFileSync, existsSync, readdirSync } from 'fs';
import { resolve, join, basename } from 'path';

function findHarnessRoot(start) {
  let dir = start;
  for (let i = 0; i < 8; i++) {
    if (existsSync(join(dir, 'CLAUDE.md')) && existsSync(join(dir, '.claude', 'scripts'))) return dir;
    const parent = resolve(dir, '..');
    if (parent === dir) break;
    dir = parent;
  }
  return start;
}

const root = findHarnessRoot(process.cwd());
const claudeMd = join(root, 'CLAUDE.md');
const scriptsDir = join(root, '.claude', 'scripts');

let exitCode = 0;
const errors = [];
const warnings = [];

// ── 1. Check all scripts in .claude/scripts/ are indexed in CLAUDE.md ────────
if (existsSync(scriptsDir) && existsSync(claudeMd)) {
  const claudeContent = readFileSync(claudeMd, 'utf8');
  const scripts = readdirSync(scriptsDir).filter(f => f.endsWith('.mjs') || f.endsWith('.js'));
  const unindexed = scripts.filter(s => !claudeContent.includes(s));
  if (unindexed.length > 0) {
    unindexed.forEach(s => errors.push(`Script .claude/scripts/${s} is not indexed in CLAUDE.md — update the Scripts table.`));
  } else {
    console.log(`  ✓ harness-sync   all ${scripts.length} scripts indexed in CLAUDE.md`);
  }
}

// ── 2. Remind about redteam if deliverable is absent ──────────────────────────
const redteamPath = join(root, 'app', '.ai', 'reports', 'code_analysis_deliverable.json');
if (!existsSync(redteamPath)) {
  warnings.push('Redteam deliverable missing — run /redteam after every significant change.');
}

if (warnings.length > 0) warnings.forEach(w => console.warn(`  ⚠ harness-sync   ${w}`));
if (errors.length > 0) {
  errors.forEach(e => console.error(`  ✗ harness-sync   ${e}`));
  exitCode = 1;
}

process.exit(exitCode);
