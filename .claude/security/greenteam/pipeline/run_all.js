#!/usr/bin/env node
/**
 * run_all.js — orchestrate every greenteam scanner.
 *
 * Runs each scanner against the target, collects findings, applies the
 * refinement pass (re-frames findings with corrected tooling flags), and
 * emits:
 *   - deliverables/greenteam_findings.json  (machine-readable)
 *   - deliverables/per-scanner/<scanner>.json  (raw output from each)
 *
 * Usage:
 *   node pipeline/run_all.js --target <path>
 *   node pipeline/run_all.js --target <path> --round 1
 *   node pipeline/run_all.js --target <path> --round 2
 *   node pipeline/run_all.js --target <path> --skip madge_scan,semgrep_scan
 *
 * Then run scripts/report_generator.js to produce MD + HTML.
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
let ROUND = 'all';
let SKIP = new Set();
let VERBOSE = false;
let OUT_OVERRIDE = null;
for (let i = 0; i < argv.length; i++) {
  if (argv[i] === '--target') TARGET = path.resolve(argv[++i]);
  else if (argv[i] === '--round') ROUND = argv[++i];
  else if (argv[i] === '--skip') argv[++i].split(',').forEach(s => SKIP.add(s.trim()));
  else if (argv[i] === '--verbose' || argv[i] === '-v') VERBOSE = true;
  else if (argv[i] === '--out-dir') OUT_OVERRIDE = path.resolve(argv[++i]);
}

if (!fs.existsSync(TARGET)) {
  console.error(`greenteam: target ${TARGET} does not exist`);
  process.exit(2);
}

// Outputs land in the TARGET tree so the harness stays pristine across runs.
// Convention: <target>/.ai/greenteam/. Override with --out-dir.
const DELIVERABLES = OUT_OVERRIDE || path.join(TARGET, '.ai', 'greenteam');
const PER_SCANNER = path.join(DELIVERABLES, 'per-scanner');
fs.mkdirSync(PER_SCANNER, { recursive: true });

// ─── Scanner registry ───────────────────────────────────────────────────────
// rounds: which rounds the scanner contributes to
// optional: scanner is best-effort; missing tooling is OK
const SCANNERS = [
  // Round 1 — static and dependency hygiene
  { id: 'npm_audit_scan',           rounds: [1], optional: false },
  { id: 'secret_scan',              rounds: [1], optional: false },
  { id: 'dangerous_patterns_scan',  rounds: [1], optional: false },
  { id: 'license_scan',             rounds: [1], optional: true },
  { id: 'depcheck_scan',            rounds: [1], optional: true },
  { id: 'madge_scan',               rounds: [1], optional: true },
  { id: 'prettier_check',           rounds: [1], optional: false },
  { id: 'govulncheck_scan',         rounds: [1], optional: true },
  { id: 'redocly_scan',             rounds: [1], optional: true },
  { id: 'gitignore_audit',          rounds: [1], optional: false },
  { id: 'migration_sequence_scan',  rounds: [1], optional: false },
  { id: 'env_default_audit',        rounds: [1], optional: false },
  { id: 'api_base_url_audit',       rounds: [1], optional: false },
  { id: 'go_toolchain_audit',       rounds: [1], optional: false },
  { id: 'eslint_config_audit',      rounds: [1, 2], optional: false },
  { id: 'broken_file_deps_scan',    rounds: [1], optional: false },
  { id: 'golangci_audit',           rounds: [1], optional: false },
  { id: 'websocket_audit',          rounds: [1], optional: false },
  { id: 'osv_scan',                 rounds: [1], optional: false },
  { id: 'java_patterns_scan',       rounds: [1], optional: false },
  { id: 'python_patterns_scan',     rounds: [1], optional: false },
  { id: 'semgrep_scan',             rounds: [1], optional: true },

  // Round 2 — test execution, coverage, CI, runtime
  { id: 'vue_tsc_scan',             rounds: [2], optional: true },
  { id: 'eslint_scan',              rounds: [2], optional: true },
  { id: 'vitest_coverage_scan',     rounds: [2], optional: true },
  { id: 'go_test_coverage_scan',    rounds: [2], optional: true },
  { id: 'integration_test_enum',    rounds: [2], optional: false },
  { id: 'go_test_bypass_audit',     rounds: [2], optional: false },
  { id: 'ci_pipeline_audit',        rounds: [2], optional: false },
  { id: 'console_log_scan',         rounds: [2], optional: false },
];

function shouldRun(s) {
  if (SKIP.has(s.id)) return false;
  if (ROUND === 'all') return true;
  const r = parseInt(ROUND, 10);
  return s.rounds.includes(r);
}

// ─── Execute scanners ───────────────────────────────────────────────────────
const allFindings = [];
const errors = [];

for (const s of SCANNERS) {
  if (!shouldRun(s)) continue;
  const scriptPath = path.join(SCRIPTS, `${s.id}.js`);
  if (!fs.existsSync(scriptPath)) {
    if (!s.optional) errors.push(`MISSING scanner script: ${s.id}.js`);
    continue;
  }
  const outFile = path.join(PER_SCANNER, `${s.id}.json`);
  if (VERBOSE) process.stderr.write(`greenteam: running ${s.id}…\n`);
  const r = spawnSync('node', [scriptPath, '--target', TARGET, '--out', outFile], {
    encoding: 'utf8', timeout: 600_000,
  });
  if (r.status !== 0) {
    const msg = (r.stderr || r.stdout || '').slice(0, 400).trim();
    if (s.optional) {
      if (VERBOSE) process.stderr.write(`greenteam: ${s.id} skipped — ${msg}\n`);
    } else {
      errors.push(`scanner ${s.id} failed: ${msg}`);
    }
    continue;
  }
  let findings;
  try { findings = JSON.parse(fs.readFileSync(outFile, 'utf8')); } catch { findings = []; }
  if (!Array.isArray(findings)) findings = [];
  allFindings.push(...findings);
  if (VERBOSE) process.stderr.write(`greenteam: ${s.id} → ${findings.length} finding(s)\n`);
}

// ─── Refinement pass ────────────────────────────────────────────────────────
// Re-run scanners that benefit from corrected flags or contextual analysis,
// then patch findings (downgrade severity, add "by-design" status) when the
// refined evidence supersedes the initial.
const refinementPath = path.join(SCRIPTS, 'refinement_pass.js');
if (fs.existsSync(refinementPath) && (ROUND === 'all' || ROUND === '2')) {
  if (VERBOSE) process.stderr.write(`greenteam: running refinement pass…\n`);
  const inFile = path.join(PER_SCANNER, '_pre_refinement.json');
  fs.writeFileSync(inFile, JSON.stringify(allFindings, null, 2));
  const r = spawnSync('node', [refinementPath, '--target', TARGET, '--in', inFile, '--out', inFile + '.out'], {
    encoding: 'utf8', timeout: 600_000,
  });
  if (r.status === 0 && fs.existsSync(inFile + '.out')) {
    try {
      const refined = JSON.parse(fs.readFileSync(inFile + '.out', 'utf8'));
      if (Array.isArray(refined)) {
        allFindings.length = 0;
        allFindings.push(...refined);
      }
    } catch {}
  }
}

// ─── Globally re-stamp IDs so per-scanner collisions are resolved ──────────
// Each scanner allocates IDs locally, so two scanners can both emit
// G-R1-DEP-001. Re-walk and re-stamp keyed on (round, category).
{
  const counters = {};
  for (const f of allFindings) {
    const key = `R${f.round}-${f.category}`;
    counters[key] = (counters[key] || 0) + 1;
    f.id = `G-${key}-${String(counters[key]).padStart(3, '0')}`;
  }
}

// ─── Emit final deliverable ─────────────────────────────────────────────────
const out = deliverable(allFindings, {
  target: path.relative(process.cwd(), TARGET) || '.',
  rounds: ROUND === 'all' ? [1, 2] : [parseInt(ROUND, 10)],
});

const outPath = path.join(DELIVERABLES, 'greenteam_findings.json');
fs.writeFileSync(outPath, JSON.stringify(out, null, 2));

console.log(`greenteam: ${allFindings.length} finding(s) written to ${path.relative(process.cwd(), outPath)}`);
console.log('  severity:', JSON.stringify(out.summary.bySeverity));
console.log('  category:', JSON.stringify(out.summary.byCategory));

if (errors.length) {
  console.error('greenteam: scanner errors:');
  for (const e of errors) console.error(`  ✘ ${e}`);
  process.exit(1);
}
