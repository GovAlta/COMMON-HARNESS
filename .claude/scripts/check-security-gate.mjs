#!/usr/bin/env node
/**
 * Security gate — runs as a Stop hook to block conversation end if:
 *   1. The deterministic blueteam scan has CRITICAL findings
 *   2. The scan result file is stale (>24 hours old)
 *   3. The scan result file is missing entirely
 *
 * Does NOT re-run the full blueteam pipeline (too slow for a hook).
 * Instead reads the last saved scan result from .ai/data/security-scan-results.json.
 *
 * Warns (non-blocking) if redteam code analysis deliverable is absent, since
 * redteam is required before each release but is too long-running for a Stop hook.
 */

import { readFileSync, existsSync, statSync } from 'fs';
import { resolve, join } from 'path';

const STALE_HOURS = 24;
const CRITICAL_BLOCK = true;

function findProjectRoot(start) {
  let dir = start;
  for (let i = 0; i < 8; i++) {
    if (existsSync(join(dir, 'app')) && existsSync(join(dir, '.claude'))) return dir;
    const parent = resolve(dir, '..');
    if (parent === dir) break;
    dir = parent;
  }
  return start;
}

const root = findProjectRoot(process.cwd());
const scanResultPath = join(root, 'app', '.ai', 'data', 'security-scan-results.json');
const redteamPath = join(root, 'app', '.ai', 'reports', 'code_analysis_deliverable_MAC001.json');

let exitCode = 0;
const errors = [];
const warnings = [];

// ── 1. Scan result file must exist ──────────────────────────────────────────
if (!existsSync(scanResultPath)) {
  errors.push('Blueteam scan result missing — run /blueteam before ending this session.');
} else {
  // ── 2. Scan result must not be stale ──────────────────────────────────────
  const mtime = statSync(scanResultPath).mtime;
  const ageHours = (Date.now() - mtime.getTime()) / (1000 * 60 * 60);
  if (ageHours > STALE_HOURS) {
    errors.push(`Blueteam scan is ${Math.floor(ageHours)}h old (limit: ${STALE_HOURS}h) — re-run /blueteam.`);
  }

  // ── 3. No CRITICAL findings ────────────────────────────────────────────────
  try {
    const scan = JSON.parse(readFileSync(scanResultPath, 'utf8'));
    const criticalCount = scan?.summary?.critical ?? scan?.CRITICAL ?? 0;
    if (criticalCount > 0) {
      errors.push(`Blueteam scan has ${criticalCount} CRITICAL finding(s) — must be resolved before closing.`);
    } else {
      console.log(`  ✓ security-gate  blueteam scan: 0 critical findings (${Math.round(ageHours * 60)}min old)`);
    }
  } catch {
    errors.push('Could not parse security-scan-results.json — re-run /blueteam.');
  }
}

// ── 4. Redteam presence check (warn only — too long to mandate per session) ──
if (!existsSync(redteamPath)) {
  warnings.push('Redteam code analysis not found — run /redteam before /phase8-deployment.');
} else {
  console.log('  ✓ security-gate  redteam code analysis present');
}

if (warnings.length > 0) {
  warnings.forEach(w => console.warn(`  ⚠ security-gate  ${w}`));
}

if (errors.length > 0) {
  errors.forEach(e => console.error(`  ✗ security-gate  ${e}`));
  exitCode = 1;
}

process.exit(exitCode);
