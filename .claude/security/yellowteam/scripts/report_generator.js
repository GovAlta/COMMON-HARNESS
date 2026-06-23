#!/usr/bin/env node
/**
 * report_generator.js — turn deliverables/yellowteam_findings.json into
 * the "AI Smells Report" (Markdown + HTML).
 *
 * Structure (both formats):
 *   1. Scanner Execution panel (which rule scanners ran, finding counts)
 *   2. Summary (severity + by-rule + worst-offender files)
 *   3. Findings by file (so a writer can fix one file at a time)
 *   4. Findings by rule (so a reviewer can study a single class)
 *   5. Detail per finding (with quote + rewrite + why)
 *
 * Usage:
 *   node scripts/report_generator.js          # both .md and .html
 *   node scripts/report_generator.js --md
 *   node scripts/report_generator.js --html
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { RULES } from '../pipeline/output_schemas.js';

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

const DELIV = OUT_OVERRIDE
  || (TARGET ? path.join(TARGET, '.ai', 'yellowteam') : path.join(ROOT, 'deliverables'));
const PER_SCANNER = path.join(DELIV, 'per-scanner');

const inPath = path.join(DELIV, 'yellowteam_findings.json');
if (!fs.existsSync(inPath)) {
  console.error(`report_generator: ${inPath} not found. Run pipeline/run_all.js first.`);
  process.exit(2);
}

const data = JSON.parse(fs.readFileSync(inPath, 'utf8'));

// ─── Scanner execution roll-up ──────────────────────────────────────────────
const scannerSummary = []; // { id, rule, ran, count, size }
if (fs.existsSync(PER_SCANNER)) {
  const files = fs.readdirSync(PER_SCANNER).filter(f => /^rule\d+/.test(f)).sort();
  for (const f of files) {
    const full = path.join(PER_SCANNER, f);
    const id = f.replace(/\.json$/, '');
    const ruleMatch = id.match(/^rule(\d+)/);
    const rule = ruleMatch ? parseInt(ruleMatch[1], 10) : null;
    let count = 0;
    let size = 0;
    let ran = true;
    try {
      const arr = JSON.parse(fs.readFileSync(full, 'utf8'));
      count = Array.isArray(arr) ? arr.length : 0;
      size = fs.statSync(full).size;
    } catch { ran = false; }
    scannerSummary.push({ id, rule, rule_name: rule ? RULES[rule]?.name : null, ran, count, size });
  }
}

const sevOrder = { HIGH: 0, MEDIUM: 1, LOW: 2, INFO: 3 };
const findings = [...data.findings].sort((a, b) =>
  sevOrder[a.severity] - sevOrder[b.severity]
  || a.rule - b.rule
  || (a.location?.file || '').localeCompare(b.location?.file || '')
  || (a.location?.line || 0) - (b.location?.line || 0)
);

// Group by file
const byFile = new Map();
for (const f of findings) {
  const fl = f.location?.file || '(unknown)';
  if (!byFile.has(fl)) byFile.set(fl, []);
  byFile.get(fl).push(f);
}
const filesSorted = [...byFile.entries()].sort((a, b) => b[1].length - a[1].length);

// ─── Markdown ───────────────────────────────────────────────────────────────
if (MD) {
  const lines = [];
  lines.push(`# AI Smells Report — Yellow Team`);
  lines.push('');
  lines.push(`- Target: \`${data.target || 'n/a'}\``);
  lines.push(`- Generated: ${data.generatedAt}`);
  lines.push(`- Total findings: **${data.summary.total}**`);
  lines.push('');

  lines.push(`## Scanner Execution`);
  lines.push('');
  lines.push(`| Scanner | Rule | Status | Findings |`);
  lines.push(`|---|---|---|---|`);
  for (const s of scannerSummary) {
    const status = s.ran ? (s.count > 0 ? `✓ produced` : `✓ ran clean`) : '— not invoked';
    lines.push(`| \`${s.id}\` | ${s.rule_name || ''} | ${status} | ${s.count} |`);
  }
  lines.push('');

  lines.push(`## Summary`);
  lines.push('');
  lines.push(`| Severity | Count |`);
  lines.push(`|---|---|`);
  for (const sv of ['HIGH', 'MEDIUM', 'LOW', 'INFO']) {
    lines.push(`| ${sv} | ${data.summary.bySeverity[sv] || 0} |`);
  }
  lines.push('');
  lines.push(`| Rule | Count |`);
  lines.push(`|---|---|`);
  for (const [r, n] of Object.entries(data.summary.byRule).sort()) {
    lines.push(`| ${r} | ${n} |`);
  }
  lines.push('');

  lines.push(`### Worst-offender files`);
  lines.push('');
  lines.push(`| File | Total findings |`);
  lines.push(`|---|---|`);
  for (const [file, arr] of filesSorted.slice(0, 20)) {
    lines.push(`| \`${file}\` | ${arr.length} |`);
  }
  lines.push('');

  lines.push(`## Findings by file`);
  lines.push('');
  for (const [file, arr] of filesSorted) {
    lines.push(`### \`${file}\` (${arr.length})`);
    lines.push('');
    for (const f of arr) {
      lines.push(`- **${f.id}** · ${f.severity} · rule ${f.rule} (${f.rule_name}) · line ${f.location?.line || '?'}`);
      lines.push(`  - Match: \`${escapeMd(f.match.slice(0, 120))}\``);
      lines.push(`  - Quote: > ${escapeMd(f.quote.slice(0, 200))}`);
      if (f.rewrite) lines.push(`  - Fix: ${escapeMd(f.rewrite)}`);
    }
    lines.push('');
  }

  fs.writeFileSync(path.join(DELIV, 'yellowteam_findings.md'), lines.join('\n'));
  console.log(`report_generator: wrote yellowteam_findings.md (${findings.length} findings, ${scannerSummary.length} scanners)`);
}

// ─── HTML ──────────────────────────────────────────────────────────────────
if (HTML) {
  const sevColor = { HIGH: '#c8243a', MEDIUM: '#d97706', LOW: '#0369a1', INFO: '#4b5563' };

  const scannerRows = scannerSummary.map(s => {
    const status = !s.ran ? `<span class="status-skip">not invoked</span>`
      : s.count > 0 ? `<span class="status-ok">✓ ${s.count} findings</span>`
      : `<span class="status-empty">✓ ran clean (0)</span>`;
    return `<tr><td class="mono small">${s.id}</td><td>${s.rule_name || ''}</td><td>${status}</td><td><a href="per-scanner/${s.id}.json" class="mono small">${humanSize(s.size)}</a></td></tr>`;
  }).join('');

  const sevRows = ['HIGH', 'MEDIUM', 'LOW', 'INFO']
    .map(s => `<tr><td><span class="badge" style="background:${sevColor[s]}">${s}</span></td><td>${data.summary.bySeverity[s] || 0}</td></tr>`).join('');
  const ruleRows = Object.entries(data.summary.byRule).sort().map(([r, n]) => `<tr><td class="mono">${escapeHtml(r)}</td><td>${n}</td></tr>`).join('');

  const fileRows = filesSorted.slice(0, 30).map(([file, arr]) =>
    `<tr><td class="mono small"><a href="#file-${cssId(file)}">${escapeHtml(file)}</a></td><td>${arr.length}</td></tr>`
  ).join('');

  const fileSections = filesSorted.map(([file, arr]) => {
    const items = arr.map(f => `
      <div class="finding">
        <div class="finding-head">
          <span class="mono small">${f.id}</span>
          <span class="badge" style="background:${sevColor[f.severity]}">${f.severity}</span>
          <span class="mono small">rule ${f.rule} · ${escapeHtml(f.rule_name)}</span>
          <span class="mono small">line ${f.location?.line || '?'}</span>
        </div>
        <div class="finding-body">
          <div><strong>Match:</strong> <code>${escapeHtml(f.match.slice(0, 240))}</code></div>
          <blockquote>${escapeHtml(f.quote.slice(0, 300))}</blockquote>
          ${f.rewrite ? `<div class="rewrite"><strong>Rewrite:</strong> ${escapeHtml(f.rewrite)}</div>` : ''}
          ${f.why ? `<div class="why"><strong>Why:</strong> ${escapeHtml(f.why)}</div>` : ''}
        </div>
      </div>`).join('');
    return `<section id="file-${cssId(file)}" class="file-section"><h3 class="mono">${escapeHtml(file)} <span class="small">(${arr.length})</span></h3>${items}</section>`;
  }).join('');

  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>AI Smells Report — Yellow Team</title>
<style>
  body { font-family: ui-sans-serif, system-ui, sans-serif; max-width: 1280px; margin: 2em auto; padding: 0 1em; color: #1f2937; }
  h1, h2, h3 { color: #b45309; }
  h2 { border-bottom: 2px solid #fef3c7; padding-bottom: 0.3em; margin-top: 2em; }
  table { border-collapse: collapse; width: 100%; margin: 1em 0; font-size: 0.92em; }
  th, td { border: 1px solid #e5e7eb; padding: 6px 10px; text-align: left; vertical-align: top; }
  th { background: #f9fafb; }
  .mono { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
  .small { font-size: 0.85em; }
  .badge { color: white; padding: 2px 8px; border-radius: 4px; font-size: 0.82em; font-weight: 600; }
  .toc { background: #fffbeb; border: 1px solid #fde68a; padding: 0.75em 1em; border-radius: 4px; margin: 1em 0; }
  .toc a { color: #b45309; text-decoration: none; margin-right: 1em; }
  .file-section { margin: 1.5em 0; border-left: 4px solid #fde68a; padding: 0.5em 1em; background: #fffbeb; }
  .finding { background: white; border: 1px solid #fde68a; padding: 0.75em; margin: 0.5em 0; border-radius: 4px; }
  .finding-head { display: flex; gap: 0.75em; align-items: center; margin-bottom: 0.5em; flex-wrap: wrap; }
  .finding-body { font-size: 0.95em; }
  .finding-body blockquote { margin: 0.3em 0; padding: 0.3em 0.75em; border-left: 3px solid #fde68a; color: #4b5563; font-style: italic; }
  .finding-body code { background: #f3f4f6; padding: 1px 4px; border-radius: 3px; font-size: 0.9em; }
  .rewrite { margin-top: 0.5em; padding: 0.5em; background: #ecfdf5; border-radius: 3px; }
  .why { margin-top: 0.3em; padding: 0.4em; background: #f9fafb; border-radius: 3px; font-size: 0.9em; }
  .status-ok { color: #15803d; font-weight: 600; }
  .status-empty { color: #4b5563; }
  .status-skip { color: #9ca3af; font-style: italic; }
  .summary-grid { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 1em; }
</style>
</head>
<body>
  <h1>AI Smells Report — Yellow Team</h1>
  <p><strong>Target:</strong> <span class="mono">${escapeHtml(data.target || 'n/a')}</span> · <strong>Generated:</strong> ${data.generatedAt} · <strong>Total findings:</strong> ${data.summary.total}</p>

  <div class="toc">
    <strong>Jump to:</strong>
    <a href="#exec">Scanner Execution</a>
    <a href="#summary">Summary</a>
    <a href="#worst">Worst-offender files</a>
    <a href="#detail">Detail by file</a>
  </div>

  <h2 id="exec">Scanner Execution</h2>
  <table><thead><tr><th>Scanner</th><th>Rule</th><th>Status</th><th>Raw JSON</th></tr></thead><tbody>${scannerRows}</tbody></table>

  <h2 id="summary">Summary</h2>
  <div class="summary-grid">
    <table><thead><tr><th>Severity</th><th>Count</th></tr></thead><tbody>${sevRows}</tbody></table>
    <table><thead><tr><th>Rule</th><th>Count</th></tr></thead><tbody>${ruleRows}</tbody></table>
    <div></div>
  </div>

  <h2 id="worst">Worst-offender files</h2>
  <table><thead><tr><th>File</th><th>Findings</th></tr></thead><tbody>${fileRows}</tbody></table>

  <h2 id="detail">Detail by file</h2>
  ${fileSections || '<p><em>No findings to display.</em></p>'}
</body>
</html>`;

  fs.writeFileSync(path.join(DELIV, 'yellowteam_findings.html'), html);
  console.log(`report_generator: wrote yellowteam_findings.html (${findings.length} findings, ${scannerSummary.length} scanners)`);
}

function escapeMd(s) { return String(s).replace(/\|/g, '\\|'); }
function escapeHtml(s) { return String(s).replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c])); }
function cssId(s) { return String(s).replace(/[^a-zA-Z0-9]+/g, '-'); }
function humanSize(n) {
  if (n < 1024) return `${n}B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)}KB`;
  return `${(n / 1024 / 1024).toFixed(1)}MB`;
}
