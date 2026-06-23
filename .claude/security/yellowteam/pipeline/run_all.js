#!/usr/bin/env node
/**
 * run_all.js — orchestrate every yellowteam rule scanner.
 *
 * Walks scripts/rule*.js, runs each against the target, aggregates findings,
 * re-stamps IDs to ensure global uniqueness, and emits:
 *   - deliverables/yellowteam_findings.json   (canonical)
 *   - deliverables/per-scanner/<rule>.json    (raw per-scanner)
 *
 * Usage:
 *   node pipeline/run_all.js --target <path>
 *   node pipeline/run_all.js --target <path> --scope prose
 *   node pipeline/run_all.js --target <path> --skip rule07,rule10
 *
 * Then: node scripts/report_generator.js
 */

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { deliverable } from './output_schemas.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FRAMEWORK_ROOT = path.resolve(__dirname, '..');
const SCRIPTS = path.join(FRAMEWORK_ROOT, 'scripts');

const argv = process.argv.slice(2);
let TARGET = process.cwd();
let SKIP = new Set();
let VERBOSE = false;
let SCOPE = 'all';
let OUT_OVERRIDE = null;
for (let i = 0; i < argv.length; i++) {
  if (argv[i] === '--target') TARGET = path.resolve(argv[++i]);
  else if (argv[i] === '--skip') argv[++i].split(',').forEach(s => SKIP.add(s.trim()));
  else if (argv[i] === '--verbose' || argv[i] === '-v') VERBOSE = true;
  else if (argv[i] === '--scope') SCOPE = argv[++i];
  else if (argv[i] === '--out-dir') OUT_OVERRIDE = path.resolve(argv[++i]);
}

if (!fs.existsSync(TARGET)) {
  console.error(`yellowteam: target ${TARGET} does not exist`);
  process.exit(2);
}

// Outputs land in the TARGET tree so the harness stays pristine across runs.
// Convention: <target>/.ai/yellowteam/. Override with --out-dir.
const DELIVERABLES = OUT_OVERRIDE || path.join(TARGET, '.ai', 'yellowteam');
const PER_SCANNER = path.join(DELIVERABLES, 'per-scanner');
fs.mkdirSync(PER_SCANNER, { recursive: true });

// ─── Auto-discover rule scanners ───────────────────────────────────────────
const scannerFiles = fs.readdirSync(SCRIPTS)
  .filter(f => /^rule\d+_/.test(f) && f.endsWith('.js'))
  .sort();

const allFindings = [];
const errors = [];

for (const sFile of scannerFiles) {
  const id = path.basename(sFile, '.js');
  if (SKIP.has(id)) continue;
  const scriptPath = path.join(SCRIPTS, sFile);
  const outFile = path.join(PER_SCANNER, `${id}.json`);
  if (VERBOSE) process.stderr.write(`yellowteam: running ${id}…\n`);
  const r = spawnSync('node', [scriptPath, '--target', TARGET, '--out', outFile, '--scope', SCOPE], {
    encoding: 'utf8', timeout: 600_000, maxBuffer: 64 * 1024 * 1024,
  });
  if (r.status !== 0) {
    const msg = (r.stderr || r.stdout || '').slice(0, 400).trim();
    errors.push(`${id} failed: ${msg}`);
    continue;
  }
  let findings = [];
  try { findings = JSON.parse(fs.readFileSync(outFile, 'utf8')); } catch {}
  if (!Array.isArray(findings)) findings = [];
  allFindings.push(...findings);
  if (VERBOSE) process.stderr.write(`yellowteam: ${id} → ${findings.length} finding(s)\n`);
}

// ─── Globally re-stamp IDs ──────────────────────────────────────────────────
{
  const counters = {};
  for (const f of allFindings) {
    const key = `R${String(f.rule).padStart(2, '0')}`;
    counters[key] = (counters[key] || 0) + 1;
    f.id = `Y-${key}-${String(counters[key]).padStart(3, '0')}`;
  }
}

// ─── Emit canonical deliverable ─────────────────────────────────────────────
const out = deliverable(allFindings, {
  target: path.relative(process.cwd(), TARGET) || '.',
});
const outPath = path.join(DELIVERABLES, 'yellowteam_findings.json');
fs.writeFileSync(outPath, JSON.stringify(out, null, 2));

console.log(`yellowteam: ${allFindings.length} finding(s) written to ${path.relative(process.cwd(), outPath)}`);
console.log('  severity:', JSON.stringify(out.summary.bySeverity));
console.log('  by rule (top 6):', Object.entries(out.summary.byRule).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([k, v]) => `${k}=${v}`).join(', '));

if (errors.length) {
  console.error('yellowteam: scanner errors:');
  for (const e of errors) console.error(`  ✘ ${e}`);
  process.exit(1);
}
