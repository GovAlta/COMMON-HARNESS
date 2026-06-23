#!/usr/bin/env node
/**
 * check-blueteam-pipeline.mjs — enforce that the full security pipeline ran.
 *
 * Failure mode this gate catches: `security-pipeline.js` runs (so we have
 * `security-scan-results.json`), but `generate_overview_html.js` +
 * `validate_reports.js` never run (so we have no HTML overview, no triage,
 * no risk-acceptance review). Each lifecycle phase defers blueteam to the
 * next, and phase8 marks it "DEFERRED" before deploy. The harness forbids this.
 *
 * What it checks (all-or-nothing):
 *   1. .ai/data/security-scan-results.json exists AND is valid JSON AND
 *      its mtime is within the last 7 days (i.e., scan is recent, not stale)
 *   2. .ai/reports/security_overview.html exists AND > 5 KB (not stub)
 *   3. .ai/data/risk_acceptances.json exists (may be empty array; missing = fail)
 *   4. Every CRITICAL or HIGH finding in security-scan-results.json is paired
 *      with an RA-NNN entry in risk_acceptances.json by file+rule (or by an
 *      explicit blanket entry that names the rule)
 *   5. validate_reports.js exits 0 (no broken/missing report links)
 *
 * Usage:
 *   node .claude/scripts/check-blueteam-pipeline.mjs
 *   node .claude/scripts/check-blueteam-pipeline.mjs --root <project-root>
 *   node .claude/scripts/check-blueteam-pipeline.mjs --json
 *
 * Exits 0 when pipeline complete + all findings answered, 1 on incomplete, 2 on missing inputs.
 */

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const argv = process.argv.slice(2);
let ROOT = process.cwd();
let JSON_OUT = false;
for (let i = 0; i < argv.length; i++) {
  if (argv[i] === '--root') ROOT = path.resolve(argv[++i]);
  else if (argv[i] === '--json') JSON_OUT = true;
}

const APP    = path.join(ROOT, 'app');
const SCAN   = path.join(APP, '.ai', 'data', 'security-scan-results.json');
const OVHTML = path.join(APP, '.ai', 'reports', 'security_overview.html');
const RAJSON = path.join(APP, '.ai', 'data', 'risk_acceptances.json');
const VALIDATOR = path.join(ROOT, '.claude', 'security', 'blueteam', 'scripts', 'validate_reports.js');

if (!fs.existsSync(APP)) {
  console.error('check-blueteam-pipeline: ./app/ not found.');
  process.exit(2);
}

const results = [];
function record(name, ok, evidence) { results.push({ name, ok, evidence }); }

// ─── 1. Scan output ─────────────────────────────────────────────────────────
let scan = null;
if (!fs.existsSync(SCAN)) {
  record('Scan ran', false, `${path.relative(ROOT, SCAN)} missing — run security-pipeline.js --all`);
} else {
  try {
    scan = JSON.parse(fs.readFileSync(SCAN, 'utf8'));
    const ageMs = Date.now() - fs.statSync(SCAN).mtime.getTime();
    const ageDays = ageMs / (1000 * 60 * 60 * 24);
    if (ageDays > 7) {
      record('Scan recent (≤7 days)', false, `scan is ${ageDays.toFixed(1)} days old — re-run security-pipeline.js`);
    } else {
      record('Scan recent (≤7 days)', true, `scan is ${ageDays.toFixed(1)} days old`);
    }
  } catch (e) {
    record('Scan output valid JSON', false, `parse failed: ${e.message}`);
  }
}

// ─── 2. HTML overview ───────────────────────────────────────────────────────
if (!fs.existsSync(OVHTML)) {
  record('HTML overview generated', false, `${path.relative(ROOT, OVHTML)} missing — run generate_overview_html.js`);
} else {
  const size = fs.statSync(OVHTML).size;
  if (size < 5000) {
    record('HTML overview generated', false, `${path.relative(ROOT, OVHTML)} is ${size} B — looks like a stub`);
  } else {
    record('HTML overview generated', true, `${(size / 1024).toFixed(1)} KB`);
  }
  // Verdict-shape check — the overview generator marks each assessment as
  // "Not Assessed" when the underlying JSON for that assessment is missing or
  // unlinked. A stub set of files will produce an HTML that is the right size
  // but says "Not Assessed" for every row — which is what happened pre-fix.
  // Fail the gate when more than 1 assessment row reads "Not Assessed". We
  // tolerate up to 1 because per-project some assessments are legitimately
  // out of scope (e.g., NoCode tools have no Security Architecture).
  const html = fs.readFileSync(OVHTML, 'utf8');
  const tableMatch = html.match(/<h3>Assessment Verdicts<\/h3>([\s\S]+?)<\/table>/);
  const tableHtml = tableMatch ? tableMatch[1] : html;
  const notAssessed = (tableHtml.match(/Not Assessed|Not Run/gi) || []).length;
  if (notAssessed > 1) {
    record('Assessment verdicts populated', false, `${notAssessed} "Not Assessed" rows in the verdict table — most assessment skills did not produce data the overview generator could read. Either run the assessment skills, or populate .ai/data/{code_changes,security_requirements,security_architecture,kill_chains,dr_resilience_assessment}.json with the right shape and re-run generate_overview_html.js.`);
  } else if (notAssessed === 1) {
    record('Assessment verdicts populated', true, `1 row "Not Assessed" — tolerated (some assessments may be out of scope)`);
  } else {
    record('Assessment verdicts populated', true, 'every assessment row has a real verdict');
  }
}

// ─── 3. Risk-acceptance file ────────────────────────────────────────────────
let ras = null;
if (!fs.existsSync(RAJSON)) {
  record('Risk-acceptance file present', false, `${path.relative(ROOT, RAJSON)} missing — even an empty [] counts; create one before declaring done`);
} else {
  try {
    ras = JSON.parse(fs.readFileSync(RAJSON, 'utf8'));
    record('Risk-acceptance file present', true, `${Array.isArray(ras) ? ras.length : Object.keys(ras).length} entries`);
  } catch (e) {
    record('Risk-acceptance file valid JSON', false, `parse failed: ${e.message}`);
  }
}

// ─── 4. Every Critical/High has an RA pairing ───────────────────────────────
if (scan && ras) {
  // Try several plausible shapes for findings list
  const findings = Array.isArray(scan)
    ? scan
    : (scan.findings || scan.results || scan.issues || []);
  const sevField = f => (f.severity || f.level || '').toString().toUpperCase();
  const isCrit = f => /CRITICAL|HIGH/.test(sevField(f));
  const crits = findings.filter(isCrit);

  // RA entries are flexible:
  //   [{ id: 'RA-001', rule: '@secretlint/...', file: '...', rationale: '...' }, ...]
  //   OR with nested finding_match: { id: 'RA-001', finding_match: { rule, files: [...] } }
  //   OR keyed object: { 'RA-001': { rule, file, rationale }, ... }
  const raList = Array.isArray(ras) ? ras : Object.entries(ras).map(([id, v]) => ({ id, ...v }));
  function isRAFor(f) {
    // The scan-results "rule" may live in title (security-pipeline.js shape),
    // ruleId / rule / message (other shapes). Probe all common fields.
    const rule = f.ruleId || f.rule || f.message || f.title || f.id || '';
    const file = (f.location && f.location.file) || f.file || f.filePath || f.affected_component || '';
    return raList.some(ra => {
      // RA rule field may be top-level OR inside finding_match
      const raRule = ra.rule || ra.ruleId || (ra.finding_match && ra.finding_match.rule) || '';
      // RA file may be a single string OR an array (finding_match.files) OR a glob (files_pattern)
      const raFile = ra.file || ra.filePath || ra.path || '';
      const raFiles = (ra.finding_match && Array.isArray(ra.finding_match.files)) ? ra.finding_match.files : [];
      const raPattern = (ra.finding_match && ra.finding_match.files_pattern) || '';
      if (!raRule) return false;
      // Rule match: bidirectional substring (the scan rule names are sometimes shorter or wrapped)
      if (!rule.includes(raRule) && !raRule.includes(rule)) return false;
      // File match: blanket if no file constraints declared
      if (!raFile && raFiles.length === 0 && !raPattern) return true;
      if (raFile && (file.includes(raFile) || raFile.includes(file))) return true;
      if (raFiles.some(rf => file.includes(rf) || rf.includes(file))) return true;
      // files_pattern is a glob hint ("app/client/src/**, ..."); accept if file has any of the listed roots
      if (raPattern && raPattern.split(/[,;\s]+/).some(p => p && file.replace(/\\/g, '/').includes(p.replace(/\*+$/, '').replace(/\*+/g, '')))) return true;
      return false;
    });
  }

  const unanswered = crits.filter(f => !isRAFor(f));
  if (crits.length === 0) {
    record('All Critical/High findings answered', true, '0 critical/high findings');
  } else if (unanswered.length === 0) {
    record('All Critical/High findings answered', true, `${crits.length} findings, all paired with RA entries`);
  } else {
    record('All Critical/High findings answered', false,
      `${unanswered.length}/${crits.length} critical/high findings have NO RA entry — must triage or accept`);
  }
}

// ─── 5. validate_reports.js exits 0 ─────────────────────────────────────────
if (fs.existsSync(VALIDATOR)) {
  const r = spawnSync('node', [VALIDATOR, '--repo-root', APP], { encoding: 'utf8' });
  if (r.status === 0) {
    record('validate_reports.js passes', true, 'all reports validate');
  } else {
    const head = ((r.stdout || '') + (r.stderr || '')).split('\n').slice(0, 3).join(' | ');
    record('validate_reports.js passes', false, `exit ${r.status}: ${head}`);
  }
} else {
  record('validate_reports.js passes', true, '(validator not present — skipped)');
}

// ─── Report ─────────────────────────────────────────────────────────────────
const failed = results.filter(r => !r.ok);
if (JSON_OUT) {
  console.log(JSON.stringify({ ok: failed.length === 0, results }, null, 2));
} else {
  console.log(`\nblueteam-pipeline check`);
  console.log('─'.repeat(64));
  for (const r of results) {
    const icon = r.ok ? '✓' : '✘';
    console.log(`  ${icon}  ${r.name.padEnd(38)} ${r.evidence}`);
  }
  console.log('─'.repeat(64));
  if (failed.length === 0) {
    console.log('  ✓ blueteam pipeline complete: scan + HTML + RA + validator all green.');
  } else {
    console.log(`  ${failed.length} pipeline stage(s) incomplete.`);
    console.log(`  Per harness rule #13: scan + HTML + triage + risk-acceptance is all-or-nothing.`);
    console.log(`  Run: node .claude/security/blueteam/scripts/security-pipeline.js --repo-root ./app --all`);
    console.log(`       node .claude/security/blueteam/scripts/generate_overview_html.js --repo-root ./app`);
    console.log(`       node .claude/security/blueteam/scripts/validate_reports.js --repo-root ./app`);
  }
  console.log('');
}

process.exit(failed.length > 0 ? 1 : 0);
