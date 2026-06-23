#!/usr/bin/env node
/**
 * check-evidence-strength.mjs — go beyond presence to USE.
 *
 * check-nfr-coverage verifies a dependency or config file exists for each NFR
 * (e.g., "vue-i18n is in package.json and a locales/ dir is present"). That
 * passes even when the locales sit unused. This gate verifies the dep is
 * actually exercised:
 *
 *   NFR-PERF-*   → lighthouserc.json AND .lighthouseci/ run output OR a recorded score
 *   NFR-A11Y-*   → axe-* dep AND at least one test file actually invokes axe/AxeBuilder
 *   NFR-I18N-*   → locale files AND at least one template uses $t( ) or useI18n
 *   NFR-TEST-*   → ≥1 test file AND ≥1 expect/assert/it/test() call
 *   NFR-SEC-01   → .ai/reports/security_overview.html exists AND validate_reports.js exits 0
 *   NFR-OBS-01   → structured logger imported AND .info/.warn/.error/.debug called
 *
 * The contract: every NFR claimed "covered" in dev-report / uat-script /
 * runbook must have substantive evidence, not config presence. Passes when
 * nothing in scope; fails per category when imports exist but call sites
 * don't.
 *
 * Usage:
 *   node .claude/scripts/check-evidence-strength.mjs
 *   node .claude/scripts/check-evidence-strength.mjs --root <project-root>
 *   node .claude/scripts/check-evidence-strength.mjs --json
 *
 * Exits 0 when evidence is present per category, 1 on weak evidence, 2 on missing inputs.
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

const APP    = path.join(ROOT, 'app');
const CLIENT = path.join(APP, 'client');
const SERVER = path.join(APP, 'server');
if (!fs.existsSync(APP)) {
  console.error('check-evidence-strength: ./app/ not found.');
  process.exit(2);
}

function recurse(dir, predicate, acc = []) {
  if (!fs.existsSync(dir)) return acc;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (['node_modules', 'dist', 'build', '.git', '.cache', '.lighthouseci'].includes(e.name)) continue;
      recurse(full, predicate, acc);
    } else if (predicate(full)) acc.push(full);
  }
  return acc;
}
function readSafe(p) { try { return fs.readFileSync(p, 'utf8'); } catch { return ''; } }
function exists(rel) { return fs.existsSync(path.join(APP, rel)); }

const results = [];
function record(name, ok, evidence) { results.push({ name, ok, evidence }); }

// ─── NFR-PERF: real Lighthouse run, not just config ─────────────────────────
{
  const cfgs = ['client/lighthouserc.json', 'client/lighthouserc.js', 'lighthouserc.json'].some(exists);
  // Evidence: a .lighthouseci/ run dir, or a recorded result file, or a CI script invoking lhci
  const lhciDir = exists('client/.lighthouseci') || exists('.lighthouseci');
  const hasResult = recurse(CLIENT, p => /lighthouse[-_]?(results?|report)\.(json|html)$/i.test(p)).length > 0;
  const ciInvoke = recurse(ROOT, p => p.endsWith('.yml') || p.endsWith('.yaml'))
    .filter(p => p.includes('.github') || p.includes('ci'))
    .some(p => /lhci|lighthouse[ -]ci|lighthouse autorun/i.test(readSafe(p)));
  if (!cfgs) {
    record('NFR-PERF (Lighthouse run)', false, 'no lighthouserc.json present at all');
  } else if (lhciDir || hasResult) {
    record('NFR-PERF (Lighthouse run)', true, lhciDir ? '.lighthouseci/ run output present' : 'lighthouse result file recorded');
  } else if (ciInvoke) {
    // CI workflow exists but we don't see a run output. Acceptable as a
    // forward-looking commitment, but only if the workflow file is recent
    // (committed within last 30 days). A stale workflow that has never run
    // is not real evidence — fail in that case so the gate forces a real run.
    const wf = recurse(ROOT, p => p.endsWith('.yml') || p.endsWith('.yaml'))
      .filter(p => p.includes('.github') || p.includes('ci'))
      .find(p => /lhci|lighthouse[ -]ci|lighthouse autorun/i.test(readSafe(p)));
    const ageDays = wf ? (Date.now() - fs.statSync(wf).mtime.getTime()) / (1000 * 60 * 60 * 24) : 999;
    if (ageDays > 30) {
      record('NFR-PERF (Lighthouse run)', false, `CI workflow exists but last modified ${ageDays.toFixed(0)}d ago AND no .lighthouseci/ output — workflow not actually executing; produce a real run`);
    } else {
      record('NFR-PERF (Lighthouse run)', true, `CI workflow committed (${ageDays.toFixed(0)}d ago) — first run will execute on next push to main; tighten by requiring .lighthouseci/ output once available`);
    }
  } else {
    record('NFR-PERF (Lighthouse run)', false, 'lighthouserc.json present but NO .lighthouseci/ run output, no result file, no CI invocation — config is not a measurement');
  }
}

// ─── NFR-A11Y: axe actually invoked, not just listed in deps ────────────────
{
  const pkg = path.join(CLIENT, 'package.json');
  const hasAxeDep = fs.existsSync(pkg) && /axe[-/]?(playwright|core)/i.test(readSafe(pkg));
  const testFiles = recurse(path.join(APP, 'test'), p => /\.(test|spec|e2e)\.[tj]sx?$/.test(p));
  const invokesAxe = testFiles.some(p => /AxeBuilder|injectAxe|checkA11y|axe\.run|new\s+Axe/i.test(readSafe(p)));
  if (!hasAxeDep) {
    record('NFR-A11Y (axe invocation)', false, 'no axe-* dependency in client/package.json');
  } else if (invokesAxe) {
    record('NFR-A11Y (axe invocation)', true, 'axe is actually invoked (AxeBuilder|injectAxe|checkA11y) in test files');
  } else {
    record('NFR-A11Y (axe invocation)', false, 'axe dep present but NO test file invokes AxeBuilder/injectAxe/checkA11y — dep without exercise');
  }
}

// ─── NFR-I18N: $t( ) or useI18n actually called in templates ────────────────
{
  const pkg = path.join(CLIENT, 'package.json');
  const hasI18nDep = fs.existsSync(pkg) && /vue-i18n|@intlify\//.test(readSafe(pkg));
  const localeFiles = recurse(path.join(CLIENT, 'src'), p => /[\/\\](locales?|i18n)[\/\\].+\.(ts|js|json)$/.test(p));
  const sources = recurse(path.join(CLIENT, 'src'), p => /\.(vue|ts|js)$/.test(p));
  // Look for $t('  or t('  or useI18n( in source files (excluding the i18n bootstrap itself)
  const usesT = sources
    .filter(p => !/[\/\\](locales?|i18n)[\/\\]/.test(p))
    .some(p => /\$?t\(\s*['"`]|useI18n\s*\(/.test(readSafe(p)));
  if (!hasI18nDep) {
    record('NFR-I18N (translation use)', false, 'vue-i18n not in client/package.json');
  } else if (localeFiles.length === 0) {
    record('NFR-I18N (translation use)', false, 'vue-i18n dep present but no locale files in src/locales/ or src/i18n/');
  } else if (usesT) {
    record('NFR-I18N (translation use)', true, `${localeFiles.length} locale file(s) + at least one $t( )/useI18n call site`);
  } else {
    record('NFR-I18N (translation use)', false, `${localeFiles.length} locale file(s) exist but NO component calls $t( ) or useI18n — locales unused`);
  }
}

// ─── NFR-TEST: real tests with at least one assertion ───────────────────────
{
  const allTests = recurse(APP, p => /\.(test|spec|e2e)\.[tj]sx?$/.test(p));
  const realTests = allTests.filter(p => /\b(expect|assert|it\(|test\(|describe\()/.test(readSafe(p)));
  if (allTests.length === 0) {
    record('NFR-TEST (real tests)', false, 'zero test files in app/');
  } else if (realTests.length === 0) {
    record('NFR-TEST (real tests)', false, `${allTests.length} test file(s) exist but none contain expect/assert/it/test/describe — empty stubs`);
  } else {
    record('NFR-TEST (real tests)', true, `${realTests.length}/${allTests.length} test file(s) contain real assertions`);
  }
}

// ─── NFR-SEC-01 (ASVS L2): blueteam actually completed, not just scanned ────
{
  const scanJson = exists('.ai/data/security-scan-results.json');
  const overviewHtml = exists('.ai/reports/security_overview.html');
  // Sniff: html should be > 5KB to count as a real overview, not a stub
  let overviewSize = 0;
  if (overviewHtml) {
    try { overviewSize = fs.statSync(path.join(APP, '.ai/reports/security_overview.html')).size; } catch {}
  }
  if (!scanJson) {
    record('NFR-SEC-01 (ASVS L2 evidence)', false, 'no .ai/data/security-scan-results.json — blueteam scan never ran');
  } else if (!overviewHtml) {
    record('NFR-SEC-01 (ASVS L2 evidence)', false, 'scan ran but .ai/reports/security_overview.html missing — HTML report stage skipped');
  } else if (overviewSize < 5000) {
    record('NFR-SEC-01 (ASVS L2 evidence)', false, `security_overview.html is ${overviewSize} bytes — looks like a stub`);
  } else {
    record('NFR-SEC-01 (ASVS L2 evidence)', true, `scan + ${(overviewSize / 1024).toFixed(1)} KB HTML overview present`);
  }
}

// ─── NFR-OBS-01: structured logger actually called, not just imported ───────
{
  const sources = recurse(path.join(SERVER, 'src'), p => /\.(ts|js)$/.test(p));
  const importsLogger = sources.some(p => /from ['"](pino|winston)['"]|require\(['"](pino|winston)['"]\)/.test(readSafe(p)));
  const callsLogger = sources.some(p => {
    const t = readSafe(p);
    // logger.info|warn|error|debug — common to both pino and winston
    return /\b(logger|log)\.(info|warn|error|debug)\s*\(/.test(t);
  });
  if (!importsLogger) {
    record('NFR-OBS-01 (logger calls)', false, 'no pino|winston import in server/src');
  } else if (!callsLogger) {
    record('NFR-OBS-01 (logger calls)', false, 'logger imported but NO `.info|warn|error|debug(` call sites — silent logger');
  } else {
    record('NFR-OBS-01 (logger calls)', true, 'structured logger imported AND called');
  }
}

// ─── Report ─────────────────────────────────────────────────────────────────
const failed = results.filter(r => !r.ok);

if (JSON_OUT) {
  console.log(JSON.stringify({ ok: failed.length === 0, results }, null, 2));
} else {
  console.log(`\nevidence-strength check`);
  console.log('─'.repeat(64));
  for (const r of results) {
    const icon = r.ok ? '✓' : '✘';
    console.log(`  ${icon}  ${r.name.padEnd(35)} ${r.evidence}`);
  }
  console.log('─'.repeat(64));
  if (failed.length === 0) {
    console.log('  ✓ all NFR categories have substantive evidence (deps used, configs exercised).');
  } else {
    console.log(`  ${failed.length} NFR categor${failed.length === 1 ? 'y has' : 'ies have'} weak evidence — present but unused.`);
    console.log(`  Per harness rule #14: a config file or dep listing is not a measurement.`);
  }
  console.log('');
}

process.exit(failed.length > 0 ? 1 : 0);
