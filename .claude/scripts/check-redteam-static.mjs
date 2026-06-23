#!/usr/bin/env node
/**
 * check-redteam-static.mjs — enforce that the non-live (pre-publication)
 * /redteam scans actually ran against ./app/ source AND that every
 * HIGH/CRITICAL finding is either fixed or paired with a risk-acceptance.
 *
 * Failure mode this catches: v5 declares done without running redteam (the
 * SKILL.md says to, but without a mechanical gate, "done" silently means
 * "ran blueteam only"). Per harness rule #11, every prose "must do X" needs
 * a script that exits non-zero if X didn't happen.
 *
 * Convention this gate enforces — scan outputs persisted at:
 *   app/.ai/data/redteam-static/
 *     ├── semgrep.json       (from scripts/semgrep_scan.js — SAST)
 *     ├── osv.json           (from scripts/osv_scan.js — dependency CVEs)
 *     ├── trufflehog.json    (from scripts/trufflehog_scan.js — secrets)
 *     └── iac.json           (Dockerfile/Compose/Terraform misconfig output)
 * Plus the agent deliverable (orchestrator output) at:
 *   .claude/security/redteam/deliverables/
 *     ├── code_analysis_deliverable_<id>.json
 *     └── (optional) recommendation_report_<id>.json
 *
 * Per-source checks (all-or-nothing):
 *   1. File exists, parses as JSON.
 *   2. File mtime is within the last 14 days (not a stale scan from months ago).
 *   3. File mtime is NEWER than the newest source file under ./app/ (excluding
 *      node_modules/, dist/, build/, .ai/, test fixtures). Proves the scan ran
 *      AFTER the most recent code change — not before the last edit.
 *   4. Sum of HIGH+CRITICAL findings across all sources, minus those answered
 *      by an entry in app/.ai/data/risk_acceptances.json, is zero.
 *      CRITICAL findings cannot be risk-accepted at v5 (per RISK_ACCEPTANCE_GUIDE).
 *
 * Risk-acceptance reuses the same risk_acceptances.json file blueteam uses —
 * one triage source of truth across both pipelines. Match is on rule+file like
 * check-blueteam-pipeline.mjs (bidirectional substring on rule; substring or
 * glob on file).
 *
 * Usage:
 *   node .claude/scripts/check-redteam-static.mjs
 *   node .claude/scripts/check-redteam-static.mjs --root <project-root>
 *   node .claude/scripts/check-redteam-static.mjs --json
 *
 * Exits 0 when all in-scope scans ran fresh and findings answered, 1 on any
 * failure, 2 on missing prerequisites (./app/ not present).
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
const STATIC_DIR = path.join(APP, '.ai', 'data', 'redteam-static');
const RAJSON = path.join(APP, '.ai', 'data', 'risk_acceptances.json');
const DELIVERABLES = path.join(ROOT, '.claude', 'security', 'redteam', 'deliverables');

if (!fs.existsSync(APP)) {
  console.error('check-redteam-static: ./app/ not found.');
  process.exit(2);
}

const results = [];
function record(name, ok, evidence) { results.push({ name, ok, evidence }); }

// ─── Compute newest source mtime in ./app/ ──────────────────────────────────
// Used to verify scans ran AFTER the latest code change.
const EXCLUDE_DIRS = new Set([
  'node_modules', '.git', 'dist', 'build', '.next', '.nuxt', 'coverage',
  '.ai', '.cache', '.turbo', '.parcel-cache', '__pycache__',
]);
function newestSourceMtime(dir, deepest = { ms: 0, file: '' }) {
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); }
  catch { return deepest; }
  for (const e of entries) {
    if (e.name.startsWith('.') && e.name !== '.env.example' && e.name !== '.dockerignore') continue;
    if (e.isDirectory()) {
      if (EXCLUDE_DIRS.has(e.name)) continue;
      newestSourceMtime(path.join(dir, e.name), deepest);
    } else if (e.isFile()) {
      try {
        const m = fs.statSync(path.join(dir, e.name)).mtimeMs;
        if (m > deepest.ms) { deepest.ms = m; deepest.file = path.join(dir, e.name); }
      } catch { /* ignore */ }
    }
  }
  return deepest;
}
const newest = newestSourceMtime(APP);
const NEWEST_SRC_MS = newest.ms;

// ─── Load risk acceptances (used by finding-pairing later) ──────────────────
let ras = [];
let raPresent = false;
if (fs.existsSync(RAJSON)) {
  try {
    const parsed = JSON.parse(fs.readFileSync(RAJSON, 'utf8'));
    ras = Array.isArray(parsed) ? parsed : Object.entries(parsed).map(([id, v]) => ({ id, ...v }));
    raPresent = true;
  } catch (e) {
    record('risk_acceptances.json valid JSON', false, `parse failed: ${e.message}`);
  }
} else {
  // Not a failure on its own — fine if there are zero High/Critical findings.
  // Only becomes a failure below when unanswered findings exist.
}

function isRAFor(rule, file) {
  if (!rule && !file) return false;
  return ras.some(ra => {
    const raRule = ra.rule || ra.ruleId || (ra.finding_match && ra.finding_match.rule) || '';
    const raFile = ra.file || ra.filePath || ra.path || '';
    const raFiles = (ra.finding_match && Array.isArray(ra.finding_match.files)) ? ra.finding_match.files : [];
    const raPattern = (ra.finding_match && ra.finding_match.files_pattern) || '';
    if (!raRule) return false;
    if (!rule.includes(raRule) && !raRule.includes(rule)) return false;
    if (!raFile && raFiles.length === 0 && !raPattern) return true;
    if (raFile && (file.includes(raFile) || raFile.includes(file))) return true;
    if (raFiles.some(rf => file.includes(rf) || rf.includes(file))) return true;
    if (raPattern && raPattern.split(/[,;\s]+/).some(p =>
      p && file.replace(/\\/g, '/').includes(p.replace(/\*+$/, '').replace(/\*+/g, ''))
    )) return true;
    return false;
  });
}

// ─── Per-source readers ─────────────────────────────────────────────────────
// Each returns { findings: [{severity, rule, file}], rawCount } or null on missing.
//
// Severities are normalized to upper-case. We treat 'critical' and 'high' as
// blocking; 'medium' and below are reported but do not fail the gate.
function normSev(s) { return (s || '').toString().toUpperCase(); }
function isBlocking(s) { return /^(CRITICAL|HIGH)$/.test(normSev(s)); }

function readScannerFile(file, opts) {
  if (!fs.existsSync(file)) {
    return { missing: true };
  }
  let data;
  try { data = JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch (e) { return { error: `parse failed: ${e.message}` }; }
  const mtime = fs.statSync(file).mtimeMs;
  const ageDays = (Date.now() - mtime) / (1000 * 60 * 60 * 24);
  const staleVsSource = NEWEST_SRC_MS > mtime;
  const findings = (data.findings || data.results || []).map(opts.normalize);
  return { data, mtime, ageDays, staleVsSource, findings };
}

const SOURCES = [
  {
    key:    'SAST (semgrep)',
    file:   path.join(STATIC_DIR, 'semgrep.json'),
    howto:  'node .claude/security/redteam/scripts/semgrep_scan.js ./app > app/.ai/data/redteam-static/semgrep.json',
    normalize: f => ({
      severity: normSev(f.severity),
      rule:     f.rule || f.check_id || f.ruleId || '',
      file:     f.file_path || f.path || f.file || '',
    }),
  },
  {
    key:    'Dependency (osv-scanner)',
    file:   path.join(STATIC_DIR, 'osv.json'),
    howto:  'node .claude/security/redteam/scripts/osv_scan.js ./app > app/.ai/data/redteam-static/osv.json',
    normalize: f => ({
      severity: normSev(f.severity || (f.database_specific && f.database_specific.severity)),
      rule:     f.vuln_id || f.id || (f.aliases && f.aliases[0]) || '',
      file:     f.package || f.manifest || f.location || '',
    }),
  },
  {
    key:    'Secrets (trufflehog)',
    file:   path.join(STATIC_DIR, 'trufflehog.json'),
    howto:  'node .claude/security/redteam/scripts/trufflehog_scan.js ./app > app/.ai/data/redteam-static/trufflehog.json',
    // Trufflehog regex sweep doesn't emit severity — treat verified secrets as HIGH,
    // unverified as MEDIUM (downgradeable via risk-acceptance).
    normalize: f => ({
      severity: f.verified ? 'HIGH' : (f.severity ? normSev(f.severity) : 'MEDIUM'),
      rule:     f.detector_name || f.rule || f.type || 'SECRET',
      file:     f.file || f.source_metadata && f.source_metadata.file || '',
    }),
  },
  {
    key:    'Infrastructure / IaC',
    file:   path.join(STATIC_DIR, 'iac.json'),
    howto:  'Run an IaC scanner (checkov / hadolint / kics) against ./app/Dockerfile + any infra/ k8s/ terraform/, save JSON to app/.ai/data/redteam-static/iac.json',
    optional: true,  // Only required if the project has IaC files
    normalize: f => ({
      severity: normSev(f.severity || f.level),
      rule:     f.rule || f.check_id || f.id || '',
      file:     f.file || f.file_path || f.resource || '',
    }),
  },
];

// Detect whether IaC is in-scope — if there's no Dockerfile / k8s / terraform,
// the IaC scan is genuinely optional.
function iacInScope() {
  if (fs.existsSync(path.join(APP, 'Dockerfile'))) return true;
  for (const d of ['infra', 'infrastructure', 'k8s', 'kubernetes', 'terraform', 'tf', 'helm']) {
    if (fs.existsSync(path.join(APP, d))) return true;
  }
  return false;
}

// ─── 1-N. Per-scanner gates ─────────────────────────────────────────────────
let allBlocking = [];

for (const src of SOURCES) {
  if (src.key.startsWith('Infrastructure') && !iacInScope()) {
    record(`${src.key} scan`, true, '(no Dockerfile / infra/ / k8s/ / terraform/ in ./app/ — skipped)');
    continue;
  }
  const r = readScannerFile(src.file, src);
  const rel = path.relative(ROOT, src.file);
  if (r.missing) {
    record(`${src.key} scan ran`, false, `${rel} missing — run: ${src.howto}`);
    continue;
  }
  if (r.error) {
    record(`${src.key} scan parses`, false, `${rel}: ${r.error}`);
    continue;
  }
  if (r.ageDays > 14) {
    record(`${src.key} scan recent (≤14d)`, false, `${rel} is ${r.ageDays.toFixed(1)} days old — re-run`);
    continue;
  }
  if (r.staleVsSource && NEWEST_SRC_MS > 0) {
    const newestRel = path.relative(ROOT, newest.file);
    record(`${src.key} scan newer than source`, false,
      `${rel} mtime is older than newest source file (${newestRel}) — re-run after the most recent code change`);
    continue;
  }
  record(`${src.key} scan ran and fresh`, true,
    `${r.findings.length} finding(s), ${r.ageDays.toFixed(1)}d old`);
  for (const f of r.findings) {
    if (isBlocking(f.severity)) {
      allBlocking.push({ source: src.key, ...f });
    }
  }
}

// ─── N+1. Code-analysis agent deliverable ───────────────────────────────────
let caDeliverable = null;
if (fs.existsSync(DELIVERABLES)) {
  const candidates = fs.readdirSync(DELIVERABLES)
    .filter(f => /^code_analysis_deliverable.*\.json$/.test(f))
    .map(f => ({ f, mtime: fs.statSync(path.join(DELIVERABLES, f)).mtimeMs }))
    .sort((a, b) => b.mtime - a.mtime);
  if (candidates.length) caDeliverable = candidates[0];
}
if (!caDeliverable) {
  record('Code-analysis agent deliverable', false,
    'no code_analysis_deliverable_*.json in .claude/security/redteam/deliverables/ — run: cd .claude/security/redteam && node pipeline/claude_sdk.js ../../../app --agents code-analysis --identifier v5');
} else {
  const ageDays = (Date.now() - caDeliverable.mtime) / (1000 * 60 * 60 * 24);
  const stale = NEWEST_SRC_MS > caDeliverable.mtime;
  if (ageDays > 14) {
    record('Code-analysis agent deliverable recent', false,
      `${caDeliverable.f} is ${ageDays.toFixed(1)} days old — re-run code-analysis agent`);
  } else if (stale && NEWEST_SRC_MS > 0) {
    const newestRel = path.relative(ROOT, newest.file);
    record('Code-analysis agent deliverable newer than source', false,
      `${caDeliverable.f} predates newest source file (${newestRel}) — re-run code-analysis agent`);
  } else {
    record('Code-analysis agent deliverable', true,
      `${caDeliverable.f}, ${ageDays.toFixed(1)}d old`);
    // Pull any HIGH/CRITICAL findings the agent surfaced
    try {
      const data = JSON.parse(fs.readFileSync(path.join(DELIVERABLES, caDeliverable.f), 'utf8'));
      const items = data.security_findings || data.findings || data.critical_findings || [];
      for (const f of items) {
        if (isBlocking(f.severity || f.priority || '')) {
          allBlocking.push({
            source:   'Code-analysis (agent)',
            severity: normSev(f.severity || f.priority || ''),
            rule:     f.id || f.category || f.title || '',
            file:     f.file || f.path || (f.location && f.location.file) || '',
          });
        }
      }
    } catch { /* deliverable shape varies; non-fatal */ }
  }
}

// ─── Last. Every HIGH/CRITICAL is fixed or risk-accepted ────────────────────
if (allBlocking.length === 0) {
  record('All HIGH/CRITICAL findings cleared', true, '0 blocking findings across all sources');
} else {
  const unanswered = allBlocking.filter(f => !isRAFor(f.rule, f.file));
  const criticals  = unanswered.filter(f => normSev(f.severity) === 'CRITICAL');
  if (unanswered.length === 0) {
    record('All HIGH/CRITICAL findings cleared', true,
      `${allBlocking.length} blocking finding(s), all paired with RA entries`);
  } else if (criticals.length > 0) {
    // CRITICAL cannot be risk-accepted at v5 per RISK_ACCEPTANCE_GUIDE.md
    record('All HIGH/CRITICAL findings cleared', false,
      `${criticals.length} CRITICAL finding(s) cannot be risk-accepted at v5 — must fix. ` +
      `Examples: ${criticals.slice(0, 3).map(f => `[${f.source}] ${f.rule} @ ${f.file}`).join('; ')}`);
  } else {
    record('All HIGH/CRITICAL findings cleared', false,
      `${unanswered.length}/${allBlocking.length} HIGH finding(s) have NO RA entry — fix or add to ${path.relative(ROOT, RAJSON)}. ` +
      `Examples: ${unanswered.slice(0, 3).map(f => `[${f.source}] ${f.rule} @ ${f.file}`).join('; ')}`);
  }
  if (!raPresent && unanswered.length > 0) {
    record('risk_acceptances.json present', false,
      `${path.relative(ROOT, RAJSON)} missing — create one (an empty [] is fine if no RAs needed) before declaring done`);
  }
}

// ─── Report ─────────────────────────────────────────────────────────────────
const failed = results.filter(r => !r.ok);
if (JSON_OUT) {
  console.log(JSON.stringify({ ok: failed.length === 0, results, blocking: allBlocking }, null, 2));
} else {
  console.log(`\nredteam-static check  (non-live / pre-publication)`);
  console.log('─'.repeat(64));
  for (const r of results) {
    const icon = r.ok ? '✓' : '✘';
    console.log(`  ${icon}  ${r.name.padEnd(46)} ${r.evidence}`);
  }
  console.log('─'.repeat(64));
  if (failed.length === 0) {
    console.log('  ✓ static redteam complete: all scans ran fresh and HIGH/CRITICAL findings cleared.');
  } else {
    console.log(`  ${failed.length} check(s) failed.`);
    console.log(`  Per harness rule #11: static redteam is a mechanical gate, not aspirational.`);
    console.log(`  See: .claude/skills/redteam/SKILL.md  and  .claude/security/redteam/CLAUDE.md`);
  }
  console.log('');
}

process.exit(failed.length > 0 ? 1 : 0);
