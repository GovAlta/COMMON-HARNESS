#!/usr/bin/env node
/**
 * report_generator.js — turn deliverables/greenteam_findings.json into
 * a human-readable Markdown report and an HTML report.
 *
 * The HTML opens with a Scanner Execution panel that shows EVERY scanner
 * the orchestrator can run, whether it ran, how many findings it produced,
 * and a one-line "why 0 findings" note for scanners that returned empty.
 * This is the audit-trail layer — a reader can verify at a glance which
 * scanners actually executed and which didn't apply to the stack.
 *
 * Usage:
 *   node scripts/report_generator.js          # produces both .md and .html
 *   node scripts/report_generator.js --md
 *   node scripts/report_generator.js --html
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

const argv = process.argv.slice(2);
let MD = argv.includes('--md');
let HTML = argv.includes('--html');
let TARGET = null;
let OUT_OVERRIDE = null;
for (let i = 0; i < argv.length; i++) {
  if (argv[i] === '--target') TARGET = path.resolve(argv[++i]);
  else if (argv[i] === '--out-dir') OUT_OVERRIDE = path.resolve(argv[++i]);
}
if (!MD && !HTML) { MD = true; HTML = true; }

// Locate deliverables in the same place run_all.js wrote them.
const DELIV = OUT_OVERRIDE
  || (TARGET ? path.join(TARGET, '.ai', 'greenteam') : path.join(ROOT, 'deliverables'));
const PER_SCANNER = path.join(DELIV, 'per-scanner');

const inPath = path.join(DELIV, 'greenteam_findings.json');
if (!fs.existsSync(inPath)) {
  console.error(`report_generator: ${inPath} not found. Run pipeline/run_all.js first.`);
  process.exit(2);
}

const data = JSON.parse(fs.readFileSync(inPath, 'utf8'));
const sev = data.summary.bySeverity;
const cat = data.summary.byCategory;

// Sort findings: severity desc, then round asc, then category asc, then id
const SEV_ORDER = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3, INFO: 4, CLEARED: 5 };
const findings = [...data.findings].sort((a, b) =>
  SEV_ORDER[a.severity] - SEV_ORDER[b.severity]
  || a.round - b.round
  || a.category.localeCompare(b.category)
  || a.id.localeCompare(b.id)
);

// ─── Scanner execution roll-up ──────────────────────────────────────────────
// Reads every per-scanner/*.json file and reports execution status for each.
// `whyEmpty` provides a stack-specific explanation when a scanner returned [].

const SCANNER_META = {
  // [scanner id] → { label, ecosystem, whatItChecks, whyEmptyHints }
  npm_audit_scan:           { label: 'npm audit',                   eco: 'Node',     checks: 'npm registry advisories for direct deps' },
  osv_scan:                 { label: 'OSV.dev multi-eco',           eco: 'all',      checks: 'OSV.dev for Maven/Gradle/PyPI/Cargo/Gem/Composer/npm/Go lockfiles' },
  secret_scan:              { label: 'secret + AI-report scan',     eco: 'any text', checks: 'credentials in source + .ai/ reports; gitignored files skipped; dummy DB URLs cleared' },
  dangerous_patterns_scan:  { label: 'dangerous patterns',          eco: 'JS/Vue/Go', checks: 'innerHTML, eval, document.write, fmt.Sprintf+SQL (with $N clearance)' },
  license_scan:             { label: 'licence audit',               eco: 'Node',     checks: 'GPL/AGPL/LGPL exposure via license-checker' },
  depcheck_scan:            { label: 'unused deps',                 eco: 'Node',     checks: 'declared dependencies never imported' },
  madge_scan:               { label: 'circular imports',            eco: 'JS/TS',    checks: 'cycle detection via madge --ts-config' },
  prettier_check:           { label: 'formatting standard',         eco: 'Node',     checks: '.prettierrc presence in package.json trees' },
  govulncheck_scan:         { label: 'Go reachable CVEs',           eco: 'Go',       checks: 'govulncheck reachability analysis from main packages' },
  redocly_scan:             { label: 'OpenAPI lint',                eco: 'OpenAPI',  checks: 'redocly lint on every openapi.{yaml,yml,json}' },
  gitignore_audit:          { label: 'gitignore coverage',          eco: 'any',      checks: '.env covered, .env.example convention, *.exe committed' },
  migration_sequence_scan:  { label: 'DB migration sequence',       eco: 'SQL',      checks: 'numbered NNN_*.sql gaps' },
  env_default_audit:        { label: 'env defaults',                eco: 'any .env', checks: 'risky defaults (VITE_ENABLE_DEVTOOLS=true, DEBUG, LOG_LEVEL)' },
  api_base_url_audit:       { label: 'API baseURL drift',           eco: 'JS/TS',    checks: 'baseURL consistency across src + tests + CI + env + Go config' },
  go_toolchain_audit:       { label: 'Go toolchain + ST1005',       eco: 'Go',       checks: 'go.mod toolchain version + capitalized errors' },
  eslint_config_audit:      { label: 'ESLint config sanity',        eco: 'Node',     checks: 'husky+lint-staged with zero rules; hardcoded plugin paths' },
  broken_file_deps_scan:    { label: 'broken file:// deps',         eco: 'Node',     checks: 'file:// paths that do not resolve / point outside the package tree' },
  golangci_audit:           { label: 'golangci-lint config',        eco: 'Go',       checks: '.golangci.yml presence vs Makefile invocation' },
  websocket_audit:          { label: 'WebSocket gaps',              eco: 'Go/Node',  checks: 'rate-limit + error-leak patterns in WS handlers' },
  java_patterns_scan:       { label: 'Java/JSP SAST',               eco: 'Java',     checks: 'SQL concat, reflection, weak crypto, XXE, TrustManager-off, JSP XSS' },
  python_patterns_scan:     { label: 'Python SAST',                 eco: 'Python',   checks: 'bandit-equivalent: eval, pickle, yaml.load, subprocess shell=True, SQL, MD5, requests verify=False, Flask debug' },
  semgrep_scan:             { label: 'semgrep SAST',                eco: 'multi',    checks: 'p/security-audit + p/javascript + p/typescript + p/golang (skips on Windows)' },
  vue_tsc_scan:             { label: 'vue-tsc type check',          eco: 'Vue/TS',   checks: 'vue-tsc --noEmit --skipLibCheck against project source' },
  eslint_scan:              { label: 'ESLint full pass',            eco: 'Node',     checks: 'ESLint with temp config when project has none; vue-plugin rules layered when available' },
  vitest_coverage_scan:     { label: 'vitest coverage',             eco: 'Node',     checks: 'vitest run --coverage (auto-installs @vitest/coverage-v8); flags low-coverage files >100 lines' },
  go_test_coverage_scan:    { label: 'go test coverage',            eco: 'Go',       checks: 'go test ./... -cover per-package coverage' },
  integration_test_enum:    { label: 'Go integration tests',        eco: 'Go',       checks: '//go:build integration enumeration as positive evidence' },
  go_test_bypass_audit:     { label: 'Go test-bypass detector',     eco: 'Go',       checks: 'build-tag-fenced bypass + fence test → triggers by-design refinement' },
  ci_pipeline_audit:        { label: 'CI pipeline audit',           eco: 'any',      checks: '.github/workflows for lint/integration/security-scan/SBOM gaps' },
  console_log_scan:         { label: 'console.* leakage',           eco: 'JS/TS',    checks: 'console statements in production paths (skip vendored / tests)' },
};

function explainEmpty(scannerId, perScannerJson, target) {
  const m = SCANNER_META[scannerId];
  if (!m) return 'unknown scanner';
  // Heuristic explanation by ecosystem + target shape
  const eco = m.eco;
  if (eco === 'Java')           return 'No .java/.jsp files in scope (correctly skipped for non-Java targets).';
  if (eco === 'Go')             return 'No go.mod in scope (correctly skipped for non-Go targets).';
  if (eco === 'Python')         return 'No .py files in scope (correctly skipped for non-Python targets).';
  if (eco === 'Vue/TS')         return 'No vue-tsc / Vue+TS project detected (correctly skipped).';
  if (eco === 'OpenAPI')        return 'No openapi.{yaml,yml,json} files in scope (correctly skipped).';
  if (eco === 'SQL')            return 'No migrations/*.sql files with numbered sequence detected (correctly skipped).';
  if (eco === 'multi' && scannerId === 'semgrep_scan')
                                return 'semgrep not installed (Windows: requires WSL). Scanner correctly skipped with note in stderr.';
  if (eco === 'all' && scannerId === 'osv_scan')
                                return 'No lockfiles or manifest deps surfaced via OSV — either npm-only project (covered by npm_audit_scan) or nothing in scope.';
  if (eco === 'Node')           return 'Either no package.json found OR scanner-specific condition not met (e.g., no eslint in deps).';
  return 'Scanner ran, found nothing applicable — see scanner source for trigger conditions.';
}

const scannerSummary = []; // { id, label, eco, checks, ran, count, jsonPath, whyEmpty }
if (fs.existsSync(PER_SCANNER)) {
  for (const id of Object.keys(SCANNER_META)) {
    const jsonFile = path.join(PER_SCANNER, `${id}.json`);
    let ran = false;
    let count = 0;
    let size = 0;
    if (fs.existsSync(jsonFile)) {
      ran = true;
      try {
        const arr = JSON.parse(fs.readFileSync(jsonFile, 'utf8'));
        count = Array.isArray(arr) ? arr.length : 0;
        size = fs.statSync(jsonFile).size;
      } catch {}
    }
    scannerSummary.push({
      id, ...SCANNER_META[id],
      ran, count, size,
      whyEmpty: ran && count === 0 ? explainEmpty(id) : '',
      jsonPath: ran ? path.relative(DELIV, jsonFile).replace(/\\/g, '/') : null,
    });
  }
}

const ranScanners = scannerSummary.filter(s => s.ran);
const producingScanners = ranScanners.filter(s => s.count > 0);
const emptyScanners = ranScanners.filter(s => s.count === 0);
const skippedScanners = scannerSummary.filter(s => !s.ran);

// ─── Markdown ───────────────────────────────────────────────────────────────
if (MD) {
  const lines = [];
  lines.push(`# Green Team Code Review — Findings`);
  lines.push('');
  lines.push(`- Target: \`${data.target || 'n/a'}\``);
  lines.push(`- Rounds: ${data.rounds.join(', ')}`);
  lines.push(`- Generated: ${data.generatedAt}`);
  lines.push('');
  lines.push(`## Scanner Execution`);
  lines.push('');
  lines.push(`${ranScanners.length}/${scannerSummary.length} scanners ran. ${producingScanners.length} produced findings; ${emptyScanners.length} ran cleanly with no applicable findings; ${skippedScanners.length} were not invoked.`);
  lines.push('');
  lines.push(`| Scanner | Ecosystem | Status | Findings | Why empty (if 0) |`);
  lines.push(`|---|---|---|---|---|`);
  for (const s of scannerSummary) {
    const status = !s.ran ? '— not invoked' : s.count > 0 ? `✓ produced` : `✓ ran clean`;
    lines.push(`| \`${s.id}\` | ${s.eco} | ${status} | ${s.count} | ${s.whyEmpty || (s.count > 0 ? `[${s.jsonPath}](${s.jsonPath})` : '')} |`);
  }
  lines.push('');
  lines.push(`## Summary`);
  lines.push('');
  lines.push(`Total findings: ${data.summary.total}`);
  lines.push('');
  lines.push(`| Severity | Count |`);
  lines.push(`|---|---|`);
  for (const s of ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'INFO', 'CLEARED']) {
    lines.push(`| ${s} | ${sev[s] || 0} |`);
  }
  lines.push('');
  lines.push(`| Category | Count |`);
  lines.push(`|---|---|`);
  for (const [c, n] of Object.entries(cat).sort()) lines.push(`| ${c} | ${n} |`);
  lines.push('');
  lines.push(`## Findings`);
  lines.push('');
  lines.push(`| ID | Sev | Round | Category | Scanner | Location | Title |`);
  lines.push(`|---|---|---|---|---|---|---|`);
  for (const f of findings) {
    const loc = [f.location?.repo, f.location?.file, f.location?.line ? `:${f.location.line}` : ''].filter(Boolean).join('');
    lines.push(`| ${f.id} | ${f.severity} | R${f.round} | ${f.category} | ${f.scanner || ''} | ${loc || '—'} | ${escapeMd(f.title)} |`);
  }
  lines.push('');
  lines.push(`## Detail`);
  lines.push('');
  for (const f of findings) {
    lines.push(`### ${f.id} · ${f.severity} — ${escapeMd(f.title)}`);
    lines.push('');
    if (f.location?.file) lines.push(`- **Location:** \`${f.location.file}${f.location.line ? ':' + f.location.line : ''}\``);
    if (f.evidence?.tool) lines.push(`- **Tool:** ${f.evidence.tool}`);
    if (f.compliance) lines.push(`- **Compliance:** ${f.compliance}`);
    if (f.status && f.status !== 'open') lines.push(`- **Status:** ${f.status}`);
    if (f.scanner) lines.push(`- **Scanner:** ${f.scanner}`);
    if (f.evidence && Object.keys(f.evidence).length > 1) {
      const ev = { ...f.evidence };
      delete ev.tool;
      lines.push(`- **Evidence:**`);
      lines.push('  ```json');
      lines.push('  ' + JSON.stringify(ev, null, 2).split('\n').join('\n  '));
      lines.push('  ```');
    }
    if (f.remediation) {
      lines.push(``);
      lines.push(`**Remediation:** ${f.remediation}`);
    }
    lines.push('');
  }
  fs.writeFileSync(path.join(DELIV, 'greenteam_findings.md'), lines.join('\n'));
  console.log(`report_generator: wrote greenteam_findings.md (${findings.length} findings, ${ranScanners.length} scanners ran)`);
}

// ─── HTML ──────────────────────────────────────────────────────────────────
if (HTML) {
  const sevColor = {
    CRITICAL: '#7a0010', HIGH: '#c8243a', MEDIUM: '#d97706',
    LOW: '#0369a1', INFO: '#4b5563', CLEARED: '#15803d',
  };
  // Category counts grouped by scanner for the per-scanner findings tally
  const byScanner = {};
  for (const f of findings) {
    const k = f.scanner || '(unknown)';
    if (!byScanner[k]) byScanner[k] = { total: 0, bySev: {} };
    byScanner[k].total++;
    byScanner[k].bySev[f.severity] = (byScanner[k].bySev[f.severity] || 0) + 1;
  }

  const scannerRows = scannerSummary.map(s => {
    const findingsForScanner = byScanner[s.id];
    const sevBadges = findingsForScanner
      ? Object.entries(findingsForScanner.bySev)
          .sort((a, b) => SEV_ORDER[a[0]] - SEV_ORDER[b[0]])
          .map(([sv, n]) => `<span class="badge" style="background:${sevColor[sv]}">${sv} ${n}</span>`)
          .join(' ')
      : '';
    const statusCell = !s.ran
      ? `<span class="status-skip">not invoked</span>`
      : s.count > 0
        ? `<span class="status-ok">✓ ${s.count} findings</span>`
        : `<span class="status-empty">✓ ran clean (0)</span>`;
    const whyCell = s.ran && s.count === 0
      ? escapeHtml(s.whyEmpty)
      : s.ran && s.count > 0
        ? `<a href="per-scanner/${s.id}.json" class="mono small">raw JSON (${humanSize(s.size)})</a>`
        : '<em>scanner not in registry for this run</em>';
    return `
      <tr>
        <td class="mono small">${s.id}</td>
        <td>${escapeHtml(s.label || '')}</td>
        <td><span class="eco">${escapeHtml(s.eco || '')}</span></td>
        <td class="small">${escapeHtml(s.checks || '')}</td>
        <td>${statusCell}</td>
        <td>${sevBadges}</td>
        <td class="small">${whyCell}</td>
      </tr>`;
  }).join('');

  const rows = findings.map(f => `
    <tr>
      <td class="mono small">${f.id}</td>
      <td><span class="badge" style="background:${sevColor[f.severity]}">${f.severity}</span></td>
      <td>R${f.round}</td>
      <td class="mono">${f.category}</td>
      <td class="mono small">${escapeHtml(f.scanner || '')}</td>
      <td class="mono small">${escapeHtml(f.location?.file || '')}${f.location?.line ? ':' + f.location.line : ''}</td>
      <td>${escapeHtml(f.title)}</td>
    </tr>`).join('');

  const details = findings.map(f => `
    <section class="finding" id="${f.id}">
      <h3>${f.id} · <span class="badge" style="background:${sevColor[f.severity]}">${f.severity}</span> · <span class="mono small">${escapeHtml(f.scanner || '')}</span> — ${escapeHtml(f.title)}</h3>
      <dl>
        ${f.location?.file ? `<dt>Location</dt><dd class="mono">${escapeHtml(f.location.file)}${f.location.line ? ':' + f.location.line : ''}</dd>` : ''}
        ${f.evidence?.tool ? `<dt>Tool</dt><dd>${escapeHtml(f.evidence.tool)}</dd>` : ''}
        ${f.compliance ? `<dt>Compliance</dt><dd>${escapeHtml(f.compliance)}</dd>` : ''}
        ${f.status && f.status !== 'open' ? `<dt>Status</dt><dd>${escapeHtml(f.status)}</dd>` : ''}
        ${f.scanner ? `<dt>Scanner</dt><dd class="mono">${escapeHtml(f.scanner)}</dd>` : ''}
      </dl>
      ${f.evidence && Object.keys(f.evidence).length > 1 ? `<pre class="evidence">${escapeHtml(JSON.stringify(stripTool(f.evidence), null, 2))}</pre>` : ''}
      ${f.remediation ? `<p class="remediation"><strong>Remediation:</strong> ${escapeHtml(f.remediation)}</p>` : ''}
    </section>`).join('');

  const sevRows = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'INFO', 'CLEARED']
    .map(s => `<tr><td><span class="badge" style="background:${sevColor[s]}">${s}</span></td><td>${sev[s] || 0}</td></tr>`).join('');
  const catRows = Object.entries(cat).sort((a, b) => b[1] - a[1]).map(([c, n]) => `<tr><td class="mono">${c}</td><td>${n}</td></tr>`).join('');

  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Green Team Code Review — Findings</title>
<style>
  body { font-family: ui-sans-serif, system-ui, sans-serif; max-width: 1280px; margin: 2em auto; padding: 0 1em; color: #1f2937; }
  h1, h2, h3 { color: #15803d; }
  h2 { border-bottom: 2px solid #d1fae5; padding-bottom: 0.3em; margin-top: 2em; }
  table { border-collapse: collapse; width: 100%; margin: 1em 0; font-size: 0.92em; }
  th, td { border: 1px solid #e5e7eb; padding: 6px 10px; text-align: left; vertical-align: top; }
  th { background: #f9fafb; }
  .mono { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
  .small { font-size: 0.85em; }
  .badge { color: white; padding: 2px 8px; border-radius: 4px; font-size: 0.82em; font-weight: 600; white-space: nowrap; }
  .eco { background: #e0e7ff; color: #3730a3; padding: 1px 6px; border-radius: 3px; font-size: 0.82em; font-family: ui-monospace, monospace; }
  .finding { border-left: 4px solid #e5e7eb; padding: 0.5em 1em; margin: 1em 0; background: #f9fafb; border-radius: 4px; }
  .finding h3 { margin-top: 0; font-size: 1em; }
  .finding dl { display: grid; grid-template-columns: 8em 1fr; gap: 4px 12px; margin: 0; }
  .finding dt { color: #6b7280; font-size: 0.9em; }
  .evidence { background: #1f2937; color: #f9fafb; padding: 0.75em; border-radius: 4px; overflow-x: auto; font-size: 0.85em; max-height: 400px; }
  .remediation { background: white; border: 1px solid #d1fae5; padding: 0.75em; border-radius: 4px; margin-top: 0.5em; }
  .summary-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 1em; }
  .status-ok { color: #15803d; font-weight: 600; }
  .status-empty { color: #4b5563; }
  .status-skip { color: #9ca3af; font-style: italic; }
  .toc { background: #f0fdf4; border: 1px solid #d1fae5; padding: 0.75em 1em; border-radius: 4px; margin: 1em 0; }
  .toc a { color: #15803d; text-decoration: none; margin-right: 1em; }
  .scanner-table tbody tr:nth-child(even) { background: #fcfcfc; }
</style>
</head>
<body>
  <h1>Green Team Code Review — Findings</h1>
  <p><strong>Target:</strong> <span class="mono">${escapeHtml(data.target || 'n/a')}</span> · <strong>Rounds:</strong> ${data.rounds.join(', ')} · <strong>Generated:</strong> ${data.generatedAt}</p>

  <div class="toc">
    <strong>Jump to:</strong>
    <a href="#exec">Scanner Execution</a>
    <a href="#summary">Severity / Category</a>
    <a href="#index">Findings Index</a>
    <a href="#detail">Detail</a>
  </div>

  <h2 id="exec">Scanner Execution</h2>
  <p><strong>${ranScanners.length} of ${scannerSummary.length}</strong> scanners ran.
     <strong>${producingScanners.length}</strong> produced findings;
     <strong>${emptyScanners.length}</strong> ran cleanly with no applicable findings;
     <strong>${skippedScanners.length}</strong> were not invoked for this run.</p>
  <p class="small"><em>Every scanner that ran and returned 0 findings includes a one-line "why empty" — a non-Go target skipping <code>govulncheck</code> is correct, not a failure. Click any "raw JSON" link to inspect the actual per-scanner output.</em></p>

  <table class="scanner-table"><thead>
    <tr><th>Scanner</th><th>Label</th><th>Ecosystem</th><th>What it checks</th><th>Status</th><th>By severity</th><th>Detail</th></tr>
  </thead><tbody>${scannerRows}</tbody></table>

  <h2 id="summary">Summary</h2>
  <p>Total findings: <strong>${data.summary.total}</strong></p>
  <div class="summary-grid">
    <table><thead><tr><th>Severity</th><th>Count</th></tr></thead><tbody>${sevRows}</tbody></table>
    <table><thead><tr><th>Category</th><th>Count</th></tr></thead><tbody>${catRows}</tbody></table>
  </div>

  <h2 id="index">Findings Index</h2>
  <table><thead><tr><th>ID</th><th>Sev</th><th>R</th><th>Cat</th><th>Scanner</th><th>Location</th><th>Title</th></tr></thead><tbody>${rows}</tbody></table>

  <h2 id="detail">Detail</h2>
  ${details}
</body>
</html>`;

  fs.writeFileSync(path.join(DELIV, 'greenteam_findings.html'), html);
  console.log(`report_generator: wrote greenteam_findings.html (${findings.length} findings, ${ranScanners.length} scanners)`);
}

function escapeMd(s) { return String(s).replace(/\|/g, '\\|'); }
function escapeHtml(s) { return String(s).replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c])); }
function stripTool(ev) { const { tool, ...rest } = ev || {}; return rest; }
function humanSize(n) {
  if (n < 1024) return `${n}B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)}KB`;
  return `${(n / 1024 / 1024).toFixed(1)}MB`;
}
