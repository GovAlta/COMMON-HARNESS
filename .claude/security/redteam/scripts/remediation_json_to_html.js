#!/usr/bin/env node
/**
 * Converts a remediation report JSON file (RECOMMENDATION-AGENT schema)
 * into a self-contained, human-readable HTML artifact.
 *
 * Usage:
 *   node remediation_json_to_html.js <input.json> [output.html]
 *
 * If output.html is omitted, it defaults to the input filename with .html extension.
 */

import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ── Severity helpers ────────────────────────────────────────────────

const SEVERITY_COLORS = {
  CRITICAL: ['#7f1d1d', '#fecaca', '#dc2626'],
  HIGH:     ['#7c2d12', '#fed7aa', '#ea580c'],
  MEDIUM:   ['#78350f', '#fef08a', '#ca8a04'],
  LOW:      ['#14532d', '#bbf7d0', '#16a34a'],
};

function sevBadge(severity) {
  const s = severity.toUpperCase();
  const [dark, light, accent] = SEVERITY_COLORS[s] || ['#334155', '#e2e8f0', '#64748b'];
  return `<span class="badge" style="background:${light};color:${dark};border:1px solid ${accent}">${esc(s)}</span>`;
}

function boolBadge(val, trueLabel, falseLabel) {
  if (val) {
    return `<span class="badge badge-green">${trueLabel}</span>`;
  }
  return `<span class="badge badge-gray">${falseLabel}</span>`;
}

function esc(text) {
  if (text == null) return '';
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;');
}

// ── Section builders ────────────────────────────────────────────────

function buildMetadata(meta) {
  const sb = meta.severity_breakdown || {};
  return `
    <section class="card meta-card">
      <h2>Report Metadata</h2>
      <table class="meta-table">
        <tr><td class="label">Source PoC Report</td><td><code>${esc(meta.source_poc_report)}</code></td></tr>
        <tr><td class="label">Source Code Analysis</td><td><code>${esc(meta.source_code_analysis_report || 'N/A')}</code></td></tr>
        <tr><td class="label">Generated</td><td>${esc(meta.generated)}</td></tr>
        <tr><td class="label">Total Entries</td><td>${esc(meta.total_entries)}</td></tr>
        <tr><td class="label">Severity Breakdown</td>
            <td>
              <span class="sev-count crit">${sb.critical || 0} Critical</span>
              <span class="sev-count high">${sb.high || 0} High</span>
              <span class="sev-count med">${sb.medium || 0} Medium</span>
              <span class="sev-count low">${sb.low || 0} Low</span>
            </td>
        </tr>
      </table>
    </section>`;
}

function buildPriorityOrder(order) {
  let rows = '';
  for (let i = 0; i < order.length; i++) {
    const item = order[i];
    const deploy = (item.deploy_together_with || []).join(', ') || '\u2014';
    rows += `
        <tr>
          <td class="center">${i + 1}</td>
          <td><code>${esc(item.rem_id)}</code></td>
          <td>${esc(item.rationale)}</td>
          <td><code>${esc(deploy)}</code></td>
        </tr>`;
  }
  return `
    <section class="card">
      <h2>Priority Implementation Order</h2>
      <table class="data-table">
        <thead><tr>
          <th>#</th><th>REM ID</th><th>Rationale</th><th>Deploy Together With</th>
        </tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </section>`;
}

function buildCodeBlock(code, lang = '') {
  return `<pre><code class="lang-${esc(lang)}">${esc(code)}</code></pre>`;
}

function buildEntry(entry) {
  const remId = entry.rem_id;
  const severity = entry.severity || 'MEDIUM';
  const title = entry.title || '';

  // Tags row
  let tags = sevBadge(severity);
  if (entry.quick_win) {
    tags += ' <span class="badge badge-blue">Quick Win</span>';
  }
  tags += ' ' + boolBadge(entry.verified || false, 'Verified', 'Unverified');

  // Related PoCs
  const pocChips = (entry.related_poc_ids || []).map(p => `<code class="poc-chip">${esc(p)}</code>`).join(' ');

  // Affected files
  let afRows = '';
  for (const af of (entry.affected_files || [])) {
    afRows += `<tr><td><code>${esc(af.file_path)}</code></td><td class="center">${esc(af.lines)}</td><td class="center">${esc(af.role)}</td></tr>`;
  }

  // Recommended changes
  let changesHtml = '';
  for (const ch of (entry.recommended_changes || [])) {
    changesHtml += `
        <div class="change-block">
          <div class="change-header">
            <code>${esc(ch.file_path)}</code>
            <span class="line-range">Lines ${esc(ch.line_start)}\u2013${esc(ch.line_end)}</span>
          </div>
          <div class="diff-container">
            <div class="diff-panel diff-remove">
              <div class="diff-label">Current Code</div>
              ${buildCodeBlock(ch.current_code || '', ch.language || '')}
            </div>
            <div class="diff-panel diff-add">
              <div class="diff-label">Replacement Code</div>
              ${buildCodeBlock(ch.replacement_code || '', ch.language || '')}
            </div>
          </div>
          <p class="explanation"><strong>Explanation:</strong> ${esc(ch.explanation)}</p>
        </div>`;
  }

  // Verification steps
  let vsteps = '';
  for (const vs of (entry.verification_steps || [])) {
    const typeCls = vs.type === 'negative' ? 'neg' : 'pos';
    const typeLabel = vs.type === 'negative' ? 'Attack blocked' : 'Legitimate use';
    vsteps += `
        <div class="vstep vstep-${typeCls}">
          <div class="vstep-header">
            <span class="vstep-num">Step ${vs.step}</span>
            <span class="vstep-type vstep-type-${typeCls}">${typeLabel}</span>
          </div>
          <p>${esc(vs.description)}</p>
          <pre class="cmd"><code>${esc(vs.command)}</code></pre>
          <p class="expected"><strong>Expected:</strong> ${esc(vs.expected_result)}</p>
        </div>`;
  }

  // Impact assessment
  const ia = entry.impact_assessment || {};
  const chains = (ia.attack_chains_broken || []).join(', ') || '\u2014';
  const deps = (ia.dependencies || []).join(', ') || 'None';
  const rollback = (ia.rollback_risk || 'low').toUpperCase();
  const rollbackCls = { LOW: 'low', MEDIUM: 'med', HIGH: 'high' }[rollback] || 'low';

  return `
    <section class="card entry" id="${esc(remId)}">
      <div class="entry-header entry-header-${severity.toLowerCase()}">
        <h2>${esc(remId)} \u2014 ${esc(title)}</h2>
        <div class="tags">${tags}</div>
      </div>

      <div class="entry-body">
        <div class="subsection">
          <h3>Related PoCs</h3>
          <div>${pocChips}</div>
        </div>

        <div class="subsection">
          <h3>Root Cause</h3>
          <p>${esc(entry.root_cause)}</p>
        </div>

        <div class="subsection">
          <h3>Affected Files</h3>
          <table class="data-table">
            <thead><tr><th>File Path</th><th>Lines</th><th>Role</th></tr></thead>
            <tbody>${afRows}</tbody>
          </table>
        </div>

        <div class="subsection">
          <h3>Recommended Changes</h3>
          ${changesHtml}
        </div>

        <div class="subsection">
          <h3>Verification Steps</h3>
          ${vsteps}
        </div>

        <div class="subsection">
          <h3>Impact Assessment</h3>
          <table class="meta-table">
            <tr><td class="label">Attack Chains Broken</td><td>${esc(chains)}</td></tr>
            <tr><td class="label">Functional Impact</td><td>${esc(ia.functional_impact)}</td></tr>
            <tr><td class="label">Rollback Risk</td>
                <td><span class="rollback rollback-${rollbackCls}">${rollback}</span></td></tr>
            <tr><td class="label">Dependencies</td><td><code>${esc(deps)}</code></td></tr>
          </table>
        </div>
      </div>
    </section>`;
}

function buildEnvVars(env) {
  if (!env) return '';
  let rows = '';
  for (const v of (env.required_variables || [])) {
    const related = (v.related_rem_ids || []).join(', ') || '\u2014';
    rows += `
        <tr>
          <td><code>${esc(v.variable)}</code></td>
          <td><code class="val-bad">${esc(v.current_default)}</code></td>
          <td><code class="val-good">${esc(v.required_value)}</code></td>
          <td><code>${esc(related)}</code></td>
        </tr>`;
  }
  let genCmd = '';
  for (const v of (env.required_variables || [])) {
    if (v.generation_command) {
      genCmd += `<pre class="cmd"><code>${esc(v.generation_command)}</code></pre>`;
    }
  }
  return `
    <section class="card env-card" id="${esc(env.rem_id || 'REM-BONUS')}">
      <div class="entry-header entry-header-high">
        <h2>${esc(env.rem_id || 'REM-BONUS')} \u2014 ${esc(env.title || 'Environment Variable Configuration')}</h2>
        <div class="tags">${sevBadge(env.severity || 'HIGH')}</div>
      </div>
      <div class="entry-body">
        <p>${esc(env.description)}</p>
        <table class="data-table">
          <thead><tr><th>Variable</th><th>Current Default</th><th>Required Value</th><th>Related REMs</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
        ${genCmd}
      </div>
    </section>`;
}

function buildCoverageMatrix(matrix) {
  let rows = '';
  for (const item of matrix) {
    const mitigated = item.fully_mitigated || false;
    const icon = mitigated ? '&#10003;' : '&#10007;';
    const iconCls = mitigated ? 'mitigated' : 'not-mitigated';
    const brokenBy = (item.broken_by || []).join(', ');
    const gaps = item.gaps ? esc(item.gaps) : '\u2014';
    rows += `
        <tr>
          <td>${esc(item.attack_chain)}</td>
          <td><code>${esc(brokenBy)}</code></td>
          <td class="center"><span class="${iconCls}">${icon}</span></td>
          <td>${gaps}</td>
        </tr>`;
  }
  return `
    <section class="card">
      <h2>Attack Chain Coverage Matrix</h2>
      <table class="data-table">
        <thead><tr><th>Attack Chain</th><th>Broken By</th><th>Mitigated</th><th>Gaps</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </section>`;
}

function buildToc(entries, env) {
  let links = '';
  for (const e of entries) {
    const sev = (e.severity || 'MEDIUM').toUpperCase();
    const [, , accent] = SEVERITY_COLORS[sev] || ['#334155', '#e2e8f0', '#64748b'];
    const dot = `<span class="toc-dot" style="background:${accent}"></span>`;
    links += `<a href="#${esc(e.rem_id)}">${dot}${esc(e.rem_id)} \u2014 ${esc(e.title)}</a>\n`;
  }
  if (env) {
    links += `<a href="#${esc(env.rem_id || 'REM-BONUS')}"><span class="toc-dot" style="background:#ea580c"></span>${esc(env.rem_id || 'REM-BONUS')} \u2014 ${esc(env.title)}</a>\n`;
  }
  return `<nav class="toc"><h3>Jump to Entry</h3>${links}</nav>`;
}

// ── Main HTML assembly ──────────────────────────────────────────────

const CSS = `
:root {
  --bg: #0f172a;
  --surface: #1e293b;
  --surface2: #334155;
  --border: #475569;
  --text: #e2e8f0;
  --text-muted: #94a3b8;
  --accent: #38bdf8;
  --red: #ef4444;
  --green: #22c55e;
  --orange: #f97316;
  --yellow: #eab308;
}
*, *::before, *::after { box-sizing: border-box; }
body {
  font-family: 'Segoe UI', system-ui, -apple-system, sans-serif;
  background: var(--bg);
  color: var(--text);
  margin: 0;
  padding: 0;
  line-height: 1.6;
}
.container { max-width: 1100px; margin: 0 auto; padding: 24px 20px; }
h1 { font-size: 1.75rem; margin: 0 0 4px 0; }
h2 { font-size: 1.25rem; margin: 0 0 12px 0; color: var(--accent); }
h3 { font-size: 1rem; margin: 0 0 8px 0; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.05em; font-size: 0.8rem; }
.header { padding: 32px 0 16px; border-bottom: 1px solid var(--border); margin-bottom: 24px; }
.header p { margin: 4px 0; color: var(--text-muted); }
.card {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 8px;
  margin-bottom: 20px;
  overflow: hidden;
}
.card > h2 { padding: 16px 20px 0; }
.meta-card { padding: 20px; }
.meta-card h2 { padding: 0; }

/* Tables */
.meta-table { width: 100%; border-collapse: collapse; }
.meta-table td { padding: 6px 12px; vertical-align: top; }
.meta-table .label { color: var(--text-muted); white-space: nowrap; width: 180px; font-weight: 600; }
.data-table { width: 100%; border-collapse: collapse; margin: 8px 0; }
.data-table th { background: var(--surface2); color: var(--text-muted); font-size: 0.8rem; text-transform: uppercase; letter-spacing: 0.05em; padding: 8px 12px; text-align: left; }
.data-table td { padding: 8px 12px; border-top: 1px solid var(--border); }
.center { text-align: center; }

/* Badges */
.badge { display: inline-block; padding: 2px 10px; border-radius: 9999px; font-size: 0.75rem; font-weight: 700; letter-spacing: 0.03em; vertical-align: middle; }
.badge-green { background: #166534; color: #bbf7d0; border: 1px solid #22c55e; }
.badge-gray { background: #374151; color: #d1d5db; border: 1px solid #6b7280; }
.badge-blue { background: #1e3a5f; color: #93c5fd; border: 1px solid #3b82f6; }
.sev-count { display: inline-block; padding: 2px 8px; border-radius: 4px; font-weight: 600; font-size: 0.85rem; margin-right: 6px; }
.sev-count.crit { background: #7f1d1d; color: #fecaca; }
.sev-count.high { background: #7c2d12; color: #fed7aa; }
.sev-count.med  { background: #78350f; color: #fef08a; }
.sev-count.low  { background: #14532d; color: #bbf7d0; }

/* Entry */
.entry-header { padding: 16px 20px; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 8px; }
.entry-header h2 { color: var(--text); margin: 0; }
.entry-header-critical { border-left: 4px solid var(--red); background: rgba(239,68,68,0.08); }
.entry-header-high     { border-left: 4px solid var(--orange); background: rgba(249,115,22,0.08); }
.entry-header-medium   { border-left: 4px solid var(--yellow); background: rgba(234,179,8,0.08); }
.entry-header-low      { border-left: 4px solid var(--green); background: rgba(34,197,94,0.08); }
.entry-body { padding: 0 20px 20px; }
.subsection { margin-top: 16px; }
.poc-chip { background: var(--surface2); padding: 2px 8px; border-radius: 4px; margin-right: 4px; font-size: 0.85rem; }

/* Code / Diff */
pre { background: #0d1117; border: 1px solid var(--border); border-radius: 6px; padding: 12px 16px; overflow-x: auto; font-size: 0.82rem; line-height: 1.5; margin: 8px 0; }
code { font-family: 'Cascadia Code', 'Fira Code', 'JetBrains Mono', monospace; font-size: 0.85em; }
.change-block { margin-bottom: 20px; border: 1px solid var(--border); border-radius: 6px; }
.change-header { background: var(--surface2); padding: 8px 16px; display: flex; justify-content: space-between; align-items: center; }
.line-range { color: var(--text-muted); font-size: 0.85rem; }
.diff-container { display: grid; grid-template-columns: 1fr 1fr; gap: 0; }
@media (max-width: 900px) { .diff-container { grid-template-columns: 1fr; } }
.diff-panel { padding: 12px; min-width: 0; overflow: hidden; }
.diff-panel pre { overflow-x: auto; max-width: 100%; }
.diff-remove { background: rgba(239,68,68,0.04); border-right: 1px solid var(--border); }
.diff-add    { background: rgba(34,197,94,0.04); }
.diff-label  { font-size: 0.75rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 4px; color: var(--text-muted); }
.diff-remove .diff-label { color: #f87171; }
.diff-add .diff-label    { color: #4ade80; }
.explanation { padding: 12px 16px; margin: 0; border-top: 1px solid var(--border); font-size: 0.9rem; color: var(--text-muted); }

/* Verification steps */
.vstep { border: 1px solid var(--border); border-radius: 6px; padding: 12px 16px; margin-bottom: 10px; }
.vstep-neg { border-left: 3px solid var(--red); }
.vstep-pos { border-left: 3px solid var(--green); }
.vstep-header { display: flex; align-items: center; gap: 10px; margin-bottom: 6px; }
.vstep-num { font-weight: 700; }
.vstep-type { font-size: 0.75rem; font-weight: 600; padding: 1px 8px; border-radius: 4px; }
.vstep-type-neg { background: #7f1d1d; color: #fca5a5; }
.vstep-type-pos { background: #14532d; color: #86efac; }
.cmd { background: #000; border: 1px solid #333; }
.expected { font-size: 0.9rem; color: var(--text-muted); margin: 4px 0 0; }

/* Impact */
.rollback { padding: 2px 10px; border-radius: 4px; font-weight: 700; font-size: 0.8rem; }
.rollback-low  { background: #14532d; color: #bbf7d0; }
.rollback-med  { background: #78350f; color: #fef08a; }
.rollback-high { background: #7f1d1d; color: #fecaca; }

/* Coverage matrix */
.mitigated     { color: var(--green); font-size: 1.2rem; font-weight: 700; }
.not-mitigated { color: var(--red); font-size: 1.2rem; font-weight: 700; }

/* Env vars */
.val-bad  { color: #f87171; }
.val-good { color: #4ade80; }
.env-card .entry-body { padding-top: 12px; }

/* TOC */
.toc { background: var(--surface); border: 1px solid var(--border); border-radius: 8px; padding: 16px 20px; margin-bottom: 20px; }
.toc h3 { margin-bottom: 8px; }
.toc a { display: block; color: var(--text); text-decoration: none; padding: 4px 0; font-size: 0.9rem; transition: color 0.15s; }
.toc a:hover { color: var(--accent); }
.toc-dot { display: inline-block; width: 8px; height: 8px; border-radius: 50%; margin-right: 8px; vertical-align: middle; }

/* Print */
@media print {
  body { background: #fff; color: #1a1a1a; }
  .card { border: 1px solid #ccc; break-inside: avoid; }
  pre { background: #f5f5f5; border: 1px solid #ddd; }
  .entry-header-critical, .entry-header-high, .entry-header-medium, .entry-header-low { background: none; }
  .diff-remove { background: #fff0f0; }
  .diff-add { background: #f0fff0; }
}
`;

function generateHtml(data) {
  const report = data.remediation_report || data;
  const meta = report.metadata || {};
  const priority = report.priority_implementation_order || [];
  const entries = report.remediation_entries || [];
  const envVars = report.environment_variable_fixes || {};
  const coverage = report.attack_chain_coverage_matrix || [];

  const title = `Remediation Report \u2014 ${meta.source_poc_report || 'Unknown'}`;

  const entriesHtml = entries.map(e => buildEntry(e)).join('\n');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${esc(title)}</title>
  <style>${CSS}</style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>Remediation Report</h1>
      <p>${esc(meta.source_poc_report || '')} &middot; Generated ${esc(meta.generated || '')}</p>
    </div>

    ${buildMetadata(meta)}
    ${buildToc(entries, envVars)}
    ${buildPriorityOrder(priority)}
    ${entriesHtml}
    ${buildEnvVars(envVars)}
    ${buildCoverageMatrix(coverage)}

    <footer style="text-align:center;color:var(--text-muted);padding:24px 0;font-size:0.8rem;">
      Remediation Report generated by Security Remediation Agent
    </footer>
  </div>
</body>
</html>`;
}

// ── CLI ─────────────────────────────────────────────────────────────

async function main() {
  if (process.argv.length < 3) {
    process.stderr.write(`Usage: ${process.argv[1]} <input.json> [output.html]\n`);
    process.exit(1);
  }

  const inputPath = process.argv[2];
  const outputPath = process.argv[3] || inputPath.replace(/\.json$/i, '.html');

  let raw;
  try {
    raw = await readFile(inputPath, 'utf-8');
  } catch (err) {
    process.stderr.write(`Error: ${inputPath} not found\n`);
    process.exit(1);
  }

  const data = JSON.parse(raw);
  const html = generateHtml(data);
  await writeFile(outputPath, html, 'utf-8');
  console.log(`HTML report written to: ${outputPath}`);
}

main();
