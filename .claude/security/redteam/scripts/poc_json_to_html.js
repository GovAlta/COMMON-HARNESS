#!/usr/bin/env node
/**
 * Converts a PoC testing report JSON file (POC-EXECUTION-AGENT schema)
 * into a self-contained, human-readable HTML artifact.
 *
 * Usage:
 *   node poc_json_to_html.js <input.json> [output.html]
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

const MET_COLORS = {
  'Satisfied':       ['badge-green', 'Satisfied'],
  'Partial':         ['badge-yellow', 'Partial'],
  'Not reached':     ['badge-gray', 'Not Reached'],
  'Not applicable':  ['badge-gray', 'N/A'],
};

function sevBadge(severity) {
  const s = severity.toUpperCase();
  const [dark, light, accent] = SEVERITY_COLORS[s] || ['#334155', '#e2e8f0', '#64748b'];
  return `<span class="badge" style="background:${light};color:${dark};border:1px solid ${accent}">${esc(s)}</span>`;
}

function metBadge(metStatus) {
  for (const [key, [cls, label]] of Object.entries(MET_COLORS)) {
    if (metStatus.startsWith(key)) {
      return `<span class="badge ${cls}">${esc(metStatus)}</span>`;
    }
  }
  return `<span class="badge badge-gray">${esc(metStatus)}</span>`;
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
  return `
    <section class="card meta-card">
      <h2>Report Metadata</h2>
      <table class="meta-table">
        <tr><td class="label">Target</td><td><code>${esc(meta.target)}</code></td></tr>
        <tr><td class="label">Run ID</td><td><code>${esc(meta.run_id)}</code></td></tr>
        <tr><td class="label">Date</td><td>${esc(meta.date)}</td></tr>
        <tr><td class="label">Assessor</td><td>${esc(meta.assessor)}</td></tr>
      </table>
    </section>`;
}

function buildExecutiveSummary(es) {
  const risk = (es.overall_risk_rating || 'UNKNOWN').toUpperCase();
  const stats = es.key_statistics || {};
  const sev = stats.severity_breakdown || {};

  // Top findings
  let findingsHtml = '';
  for (const f of (es.top_findings || [])) {
    const refs = (f.ref_poc_ids || []).join(', ');
    findingsHtml += `
        <div class="finding-item">
          <div class="finding-header">
            ${sevBadge(f.severity || 'MEDIUM')}
            <strong>${esc(f.name)}</strong>
            <span class="poc-refs">${esc(refs)}</span>
          </div>
          <p>${esc(f.description)}</p>
        </div>`;
  }

  // Critical chains
  let chainsHtml = '';
  for (const chain of (es.critical_attack_chains || [])) {
    chainsHtml += `<li class="chain-summary">${esc(chain)}</li>`;
  }

  // Remediation priorities
  let prioritiesHtml = '';
  for (const p of (es.immediate_remediation_priorities || [])) {
    prioritiesHtml += `<li>${esc(p)}</li>`;
  }

  return `
    <section class="card exec-summary">
      <h2>Executive Summary</h2>
      <div class="risk-banner risk-${risk.toLowerCase()}">
        <span class="risk-label">Overall Risk Rating</span>
        <span class="risk-value">${esc(risk)}</span>
      </div>
      <p class="scope">${esc(es.assessment_scope)}</p>

      <div class="stats-grid">
        <div class="stat-box">
          <div class="stat-num">${stats.vulnerabilities_tested || 0}</div>
          <div class="stat-label">Tested</div>
        </div>
        <div class="stat-box">
          <div class="stat-num">${stats.confirmed_exploitable || 0}</div>
          <div class="stat-label">Exploitable</div>
        </div>
        <div class="stat-box">
          <div class="stat-num">${stats.code_confirmed || 0}</div>
          <div class="stat-label">Code Confirmed</div>
        </div>
        <div class="stat-box">
          <div class="stat-num">${stats.not_exploitable || 0}</div>
          <div class="stat-label">Not Exploitable</div>
        </div>
      </div>

      <div class="sev-bar">
        <span class="sev-count crit">${sev.critical || 0} Critical</span>
        <span class="sev-count high">${sev.high || 0} High</span>
        <span class="sev-count med">${sev.medium || 0} Medium</span>
        <span class="sev-count low">${sev.low || 0} Low</span>
      </div>

      <div class="subsection">
        <h3>Top Findings</h3>
        ${findingsHtml}
      </div>

      <div class="subsection">
        <h3>Critical Attack Chains</h3>
        <ol class="chain-list">${chainsHtml}</ol>
      </div>

      <div class="subsection">
        <h3>Immediate Remediation Priorities</h3>
        <ol class="priority-list">${prioritiesHtml}</ol>
      </div>
    </section>`;
}

function buildCommonVariables(cv) {
  if (!cv || Object.keys(cv).length === 0) return '';
  let rows = '';
  for (const [key, val] of Object.entries(cv)) {
    rows += `<tr><td><code>${esc(key)}</code></td><td><code>${esc(val)}</code></td></tr>`;
  }
  return `
    <section class="card">
      <h2>Common Variables</h2>
      <table class="data-table">
        <thead><tr><th>Variable</th><th>Value</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </section>`;
}

function buildChainingRegister(cr) {
  if (!cr || !cr.length) return '';
  let rows = '';
  for (const item of cr) {
    const enables = (item.enables || []).join(', ');
    const chainedIcon = item.chained ? '&#10003;' : '&#10007;';
    const chainedCls = item.chained ? 'mitigated' : 'not-mitigated';
    rows += `
        <tr>
          <td><code>${esc(item.extracted_by)}</code></td>
          <td>${esc(item.data_type)}</td>
          <td class="value-cell"><code>${esc(item.value)}</code></td>
          <td><code>${esc(enables)}</code></td>
          <td class="center"><span class="${chainedCls}">${chainedIcon}</span></td>
        </tr>`;
  }
  return `
    <section class="card">
      <h2>Chaining Register</h2>
      <table class="data-table">
        <thead><tr>
          <th>Extracted By</th><th>Data Type</th><th>Value</th><th>Enables</th><th>Chained</th>
        </tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </section>`;
}

function buildPocEntry(entry) {
  const pocId = entry.poc_id || '';
  const severity = entry.severity || 'MEDIUM';
  const title = entry.title || '';

  // Source / Sink
  const src = entry.source || {};
  const snk = entry.sink || {};

  function codeRef(obj, label) {
    if (!obj || Object.keys(obj).length === 0) return '';
    const fp = obj.file_path || 'N/A';
    const lines = obj.lines || '';
    const code = obj.code || '';
    return `
        <div class="code-ref">
          <span class="ref-label">${label}</span>
          <code class="ref-path">${esc(fp)}:${esc(lines)}</code>
          <pre><code>${esc(code)}</code></pre>
        </div>`;
  }

  // PoC Commands
  let cmdsHtml = '';
  const cmds = entry.poc_commands || [];
  for (let i = 0; i < cmds.length; i++) {
    const cmd = cmds[i];
    const result = cmd.execution_result || {};
    const status = result.status_code;
    const statusStr = status ? `HTTP ${status}` : 'N/A';
    let statusCls = '';
    if (status) {
      if (status >= 200 && status < 300) statusCls = 'status-ok';
      else if (status >= 400 && status < 500) statusCls = 'status-client-err';
      else if (status >= 500) statusCls = 'status-server-err';
    }
    cmdsHtml += `
        <div class="poc-cmd">
          <div class="cmd-header">
            <span class="cmd-num">Command ${i + 1}</span>
            <span class="cmd-label">${esc(cmd.label)}</span>
            <span class="cmd-status ${statusCls}">${esc(statusStr)}</span>
          </div>
          <pre class="cmd"><code>${esc(cmd.command)}</code></pre>
          <div class="cmd-result">
            <div class="result-label">Response</div>
            <pre><code>${esc(result.response_body || '')}</code></pre>
          </div>
        </div>`;
  }

  // Analysis markers
  let markersHtml = '';
  const analysis = entry.analysis || {};
  for (const marker of (analysis.markers || [])) {
    markersHtml += `<li>${esc(marker)}</li>`;
  }

  const confirmed = analysis.confirmed || false;
  const confirmedBadge = confirmed
    ? '<span class="badge badge-green">Confirmed</span>'
    : '<span class="badge badge-gray">Unconfirmed</span>';

  // Chaining artifacts
  const artifacts = entry.chaining_artifacts || [];
  let artifactsHtml = '';
  if (artifacts.length) {
    const chips = artifacts.map(a => `<code class="artifact-chip">${esc(a)}</code>`).join(' ');
    artifactsHtml = `<div class="subsection"><h3>Chaining Artifacts</h3><div>${chips}</div></div>`;
  }

  return `
    <section class="card entry" id="${esc(pocId)}">
      <div class="entry-header entry-header-${severity.toLowerCase()}">
        <h2>${esc(pocId)} \u2014 ${esc(title)}</h2>
        <div class="tags">
          ${sevBadge(severity)}
          ${confirmedBadge}
          ${metBadge(entry.met_status || '')}
        </div>
      </div>

      <div class="entry-body">
        <div class="subsection">
          <h3>Vulnerability</h3>
          <p>${esc(entry.vulnerability)}</p>
        </div>

        <div class="subsection">
          <h3>Source &amp; Sink</h3>
          ${codeRef(src, 'Source')}
          ${codeRef(snk, 'Sink')}
        </div>

        <div class="subsection">
          <h3>PoC Commands</h3>
          ${cmdsHtml}
        </div>

        <div class="subsection">
          <h3>Analysis</h3>
          <div class="analysis-header">${confirmedBadge} Exploitability: ${sevBadge(analysis.exploitability || severity)}</div>
          <ul class="marker-list">${markersHtml}</ul>
        </div>

        <div class="subsection">
          <h3>Why It Works</h3>
          <p>${esc(entry.why_it_works)}</p>
        </div>

        ${artifactsHtml}
      </div>
    </section>`;
}

function buildChainEntry(chain) {
  const chainId = chain.chain_id || '';
  const severity = chain.severity || 'HIGH';
  const title = chain.title || '';

  const prereqs = (chain.prerequisites || []).join(', ');

  let stepsHtml = '';
  for (const step of (chain.steps || [])) {
    stepsHtml += `
        <div class="chain-step">
          <span class="step-num">Step ${step.step}</span>
          <span class="step-desc">${esc(step.description)}</span>
          <span class="step-output">&rarr; ${esc(step.output)}</span>
        </div>`;
  }

  const script = chain.compound_script || '';
  const result = chain.execution_result || '';

  return `
    <section class="card entry" id="${esc(chainId)}">
      <div class="entry-header entry-header-${severity.toLowerCase()}">
        <h2>${esc(chainId)} \u2014 ${esc(title)}</h2>
        <div class="tags">${sevBadge(severity)}</div>
      </div>

      <div class="entry-body">
        <div class="subsection">
          <h3>Summary</h3>
          <p>${esc(chain.summary)}</p>
        </div>

        <div class="subsection">
          <h3>Prerequisites</h3>
          <div><code>${esc(prereqs)}</code></div>
        </div>

        <div class="subsection">
          <h3>Steps</h3>
          ${stepsHtml}
        </div>

        <div class="subsection">
          <h3>Compound Script</h3>
          <pre class="cmd"><code>${esc(script)}</code></pre>
        </div>

        <div class="subsection">
          <h3>Execution Result</h3>
          <pre><code>${esc(result)}</code></pre>
        </div>

        <div class="subsection">
          <h3>Analysis</h3>
          <p>${esc(chain.analysis)}</p>
        </div>
      </div>
    </section>`;
}

function buildSummaryMatrix(matrix) {
  if (!matrix || !matrix.length) return '';
  let rows = '';
  for (const item of matrix) {
    const sev = item.severity || 'MEDIUM';
    const executedIcon = item.executed ? '&#10003;' : '&#10007;';
    const executedCls = item.executed ? 'mitigated' : 'not-mitigated';
    rows += `
        <tr>
          <td><a href="#${esc(item.poc_id)}">${esc(item.poc_id)}</a></td>
          <td>${esc(item.vulnerability)}</td>
          <td class="center">${sevBadge(sev)}</td>
          <td class="center">${esc(item.effort)}</td>
          <td><code>${esc(item.vector)}</code></td>
          <td class="center"><span class="${executedCls}">${executedIcon}</span></td>
          <td>${metBadge(item.met_status || '')}</td>
        </tr>`;
  }
  return `
    <section class="card">
      <h2>Summary Matrix</h2>
      <div class="table-scroll">
        <table class="data-table">
          <thead><tr>
            <th>PoC ID</th><th>Vulnerability</th><th>Severity</th><th>Effort</th><th>Vector</th><th>Executed</th><th>MET Status</th>
          </tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    </section>`;
}

function buildNotExploitable(ne) {
  if (!ne || !ne.length) return '';
  let rows = '';
  for (const item of ne) {
    rows += `
        <tr>
          <td><strong>${esc(item.finding)}</strong></td>
          <td>${esc(item.source)}</td>
          <td>${esc(item.blocker)}</td>
          <td>${metBadge(item.met_status || '')}</td>
        </tr>`;
  }
  return `
    <section class="card">
      <h2>Not Exploitable / Not Applicable</h2>
      <table class="data-table">
        <thead><tr><th>Finding</th><th>Source</th><th>Blocker</th><th>MET Status</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </section>`;
}

function buildFinalSummary(fs) {
  if (!fs) return '';
  const sev = fs.severity_breakdown || {};
  return `
    <section class="card meta-card">
      <h2>Final Summary</h2>
      <div class="stats-grid">
        <div class="stat-box"><div class="stat-num">${fs.total_vulnerabilities_analyzed || 0}</div><div class="stat-label">Analyzed</div></div>
        <div class="stat-box"><div class="stat-num">${fs.pocs_generated || 0}</div><div class="stat-label">PoCs Generated</div></div>
        <div class="stat-box"><div class="stat-num">${fs.executed_safely || 0}</div><div class="stat-label">Executed Safely</div></div>
        <div class="stat-box"><div class="stat-num">${fs.chains_executed || 0}</div><div class="stat-label">Chains Executed</div></div>
      </div>
      <div class="sev-bar" style="margin-top:12px;">
        <span class="sev-count crit">${sev.critical || 0} Critical</span>
        <span class="sev-count high">${sev.high || 0} High</span>
        <span class="sev-count med">${sev.medium || 0} Medium</span>
        <span class="sev-count low">${sev.low || 0} Low</span>
      </div>
      <table class="meta-table" style="margin-top:12px;">
        <tr><td class="label">MET Satisfied</td><td>${fs.met_satisfied || 0}</td></tr>
        <tr><td class="label">MET Partial</td><td>${fs.met_partial || 0}</td></tr>
        <tr><td class="label">MET Blocked</td><td>${fs.met_blocked || 0}</td></tr>
        <tr><td class="label">Variants Created</td><td>${fs.variants_created || 0}</td></tr>
        <tr><td class="label">Chaining Register Entries</td><td>${fs.chaining_register_entries || 0}</td></tr>
        <tr><td class="label">Code Confirmed</td><td>${fs.code_confirmed || 0}</td></tr>
        <tr><td class="label">Not Applicable</td><td>${fs.not_applicable || 0}</td></tr>
      </table>
    </section>`;
}

function buildToc(pocEntries, chainEntries) {
  let links = '';
  for (const e of pocEntries) {
    const sev = (e.severity || 'MEDIUM').toUpperCase();
    const [, , accent] = SEVERITY_COLORS[sev] || ['#334155', '#e2e8f0', '#64748b'];
    const dot = `<span class="toc-dot" style="background:${accent}"></span>`;
    links += `<a href="#${esc(e.poc_id)}">${dot}${esc(e.poc_id)} \u2014 ${esc(e.title)}</a>\n`;
  }
  if (chainEntries && chainEntries.length) {
    links += '<div class="toc-divider"></div>';
    for (const c of chainEntries) {
      const sev = (c.severity || 'HIGH').toUpperCase();
      const [, , accent] = SEVERITY_COLORS[sev] || ['#334155', '#e2e8f0', '#64748b'];
      const dot = `<span class="toc-dot" style="background:${accent}"></span>`;
      links += `<a href="#${esc(c.chain_id)}">${dot}${esc(c.chain_id)} \u2014 ${esc(c.title)}</a>\n`;
    }
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
.container { max-width: 1200px; margin: 0 auto; padding: 24px 20px; }
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
.meta-table .label { color: var(--text-muted); white-space: nowrap; width: 200px; font-weight: 600; }
.data-table { width: 100%; border-collapse: collapse; margin: 8px 0; }
.data-table th { background: var(--surface2); color: var(--text-muted); font-size: 0.8rem; text-transform: uppercase; letter-spacing: 0.05em; padding: 8px 12px; text-align: left; }
.data-table td { padding: 8px 12px; border-top: 1px solid var(--border); vertical-align: top; }
.center { text-align: center; }
.table-scroll { overflow-x: auto; }
.value-cell { max-width: 350px; word-break: break-all; }

/* Badges */
.badge { display: inline-block; padding: 2px 10px; border-radius: 9999px; font-size: 0.75rem; font-weight: 700; letter-spacing: 0.03em; vertical-align: middle; }
.badge-green { background: #166534; color: #bbf7d0; border: 1px solid #22c55e; }
.badge-yellow { background: #78350f; color: #fef08a; border: 1px solid #ca8a04; }
.badge-gray { background: #374151; color: #d1d5db; border: 1px solid #6b7280; }
.sev-count { display: inline-block; padding: 2px 8px; border-radius: 4px; font-weight: 600; font-size: 0.85rem; margin-right: 6px; }
.sev-count.crit { background: #7f1d1d; color: #fecaca; }
.sev-count.high { background: #7c2d12; color: #fed7aa; }
.sev-count.med  { background: #78350f; color: #fef08a; }
.sev-count.low  { background: #14532d; color: #bbf7d0; }
.sev-bar { margin-top: 4px; }

/* Risk banner */
.risk-banner {
  display: flex; align-items: center; gap: 16px;
  padding: 12px 20px; border-radius: 6px; margin-bottom: 16px;
}
.risk-label { font-size: 0.85rem; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; opacity: 0.8; }
.risk-value { font-size: 1.5rem; font-weight: 800; }
.risk-critical { background: rgba(239,68,68,0.15); border: 1px solid var(--red); color: #fca5a5; }
.risk-high { background: rgba(249,115,22,0.15); border: 1px solid var(--orange); color: #fed7aa; }
.risk-medium { background: rgba(234,179,8,0.15); border: 1px solid var(--yellow); color: #fef08a; }
.risk-low { background: rgba(34,197,94,0.15); border: 1px solid var(--green); color: #bbf7d0; }

/* Stats grid */
.stats-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(120px, 1fr)); gap: 12px; margin: 16px 0; }
.stat-box { background: var(--surface2); border-radius: 6px; padding: 12px; text-align: center; }
.stat-num { font-size: 1.75rem; font-weight: 800; color: var(--accent); }
.stat-label { font-size: 0.75rem; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.05em; }

/* Scope */
.scope { color: var(--text-muted); font-size: 0.95rem; margin-bottom: 12px; }

/* Finding items */
.finding-item { border: 1px solid var(--border); border-radius: 6px; padding: 12px 16px; margin-bottom: 10px; }
.finding-header { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; margin-bottom: 6px; }
.finding-item p { margin: 0; font-size: 0.9rem; color: var(--text-muted); }
.poc-refs { color: var(--accent); font-size: 0.85rem; font-family: monospace; }

/* Chain / priority lists */
.chain-list li, .priority-list li { margin-bottom: 8px; font-size: 0.9rem; }

/* Entry */
.entry-header { padding: 16px 20px; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 8px; }
.entry-header h2 { color: var(--text); margin: 0; }
.entry-header-critical { border-left: 4px solid var(--red); background: rgba(239,68,68,0.08); }
.entry-header-high     { border-left: 4px solid var(--orange); background: rgba(249,115,22,0.08); }
.entry-header-medium   { border-left: 4px solid var(--yellow); background: rgba(234,179,8,0.08); }
.entry-header-low      { border-left: 4px solid var(--green); background: rgba(34,197,94,0.08); }
.entry-body { padding: 0 20px 20px; }
.subsection { margin-top: 16px; }
.tags { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }

/* Code references */
.code-ref { border: 1px solid var(--border); border-radius: 6px; padding: 10px 14px; margin-bottom: 10px; }
.ref-label { font-size: 0.75rem; font-weight: 700; text-transform: uppercase; color: var(--text-muted); margin-right: 10px; }
.ref-path { background: var(--surface2); padding: 2px 8px; border-radius: 4px; font-size: 0.85rem; }

/* Code / Commands */
pre { background: #0d1117; border: 1px solid var(--border); border-radius: 6px; padding: 12px 16px; overflow-x: auto; font-size: 0.82rem; line-height: 1.5; margin: 8px 0; }
code { font-family: 'Cascadia Code', 'Fira Code', 'JetBrains Mono', monospace; font-size: 0.85em; }
.cmd { background: #000; border: 1px solid #333; }
.poc-cmd { border: 1px solid var(--border); border-radius: 6px; margin-bottom: 12px; overflow: hidden; }
.cmd-header { background: var(--surface2); padding: 8px 16px; display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
.cmd-num { font-weight: 700; font-size: 0.85rem; }
.cmd-label { font-size: 0.85rem; color: var(--text-muted); flex: 1; }
.cmd-status { font-size: 0.8rem; font-weight: 700; padding: 2px 10px; border-radius: 4px; }
.status-ok { background: #14532d; color: #bbf7d0; }
.status-client-err { background: #78350f; color: #fef08a; }
.status-server-err { background: #7f1d1d; color: #fecaca; }
.cmd-result { padding: 0 12px 12px; }
.result-label { font-size: 0.75rem; font-weight: 700; text-transform: uppercase; color: var(--text-muted); margin: 8px 0 4px; }

/* Analysis */
.analysis-header { display: flex; align-items: center; gap: 10px; margin-bottom: 8px; }
.marker-list { margin: 0; padding-left: 20px; }
.marker-list li { font-size: 0.9rem; margin-bottom: 4px; }

/* Artifacts */
.artifact-chip { background: var(--surface2); padding: 3px 10px; border-radius: 4px; margin-right: 6px; font-size: 0.85rem; display: inline-block; margin-bottom: 4px; }

/* Chain steps */
.chain-step { display: flex; align-items: flex-start; gap: 10px; padding: 8px 0; border-bottom: 1px solid var(--border); flex-wrap: wrap; }
.chain-step:last-child { border-bottom: none; }
.step-num { font-weight: 700; min-width: 60px; color: var(--accent); }
.step-desc { flex: 1; min-width: 200px; }
.step-output { color: var(--text-muted); font-style: italic; font-size: 0.9rem; }

/* Coverage */
.mitigated     { color: var(--green); font-size: 1.2rem; font-weight: 700; }
.not-mitigated { color: var(--red); font-size: 1.2rem; font-weight: 700; }

/* TOC */
.toc { background: var(--surface); border: 1px solid var(--border); border-radius: 8px; padding: 16px 20px; margin-bottom: 20px; }
.toc h3 { margin-bottom: 8px; }
.toc a { display: block; color: var(--text); text-decoration: none; padding: 4px 0; font-size: 0.9rem; transition: color 0.15s; }
.toc a:hover { color: var(--accent); }
.toc-dot { display: inline-block; width: 8px; height: 8px; border-radius: 50%; margin-right: 8px; vertical-align: middle; }
.toc-divider { border-top: 1px solid var(--border); margin: 8px 0; }

/* Print */
@media print {
  body { background: #fff; color: #1a1a1a; }
  .card { border: 1px solid #ccc; break-inside: avoid; }
  pre { background: #f5f5f5; border: 1px solid #ddd; }
  .entry-header-critical, .entry-header-high, .entry-header-medium, .entry-header-low { background: none; }
  .risk-banner { background: none !important; }
}
`;

function generateHtml(data) {
  const report = data.poc_report || data;
  const meta = report.metadata || {};
  const es = report.executive_summary || {};
  const cv = report.common_variables || {};
  const cr = report.chaining_register || [];
  const pocEntries = report.poc_entries || [];
  const chainEntries = report.chain_entries || [];
  const matrix = report.summary_matrix || [];
  const ne = report.not_exploitable || [];
  const fs = report.final_summary || {};

  const title = `PoC Testing Report \u2014 ${meta.target || 'Unknown'}`;

  const pocsHtml = pocEntries.map(e => buildPocEntry(e)).join('\n');
  const chainsHtml = chainEntries.map(c => buildChainEntry(c)).join('\n');

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
      <h1>PoC Testing Report</h1>
      <p>${esc(meta.target || '')} &middot; ${esc(meta.date || '')} &middot; ${esc(meta.assessor || '')}</p>
    </div>

    ${buildMetadata(meta)}
    ${buildExecutiveSummary(es)}
    ${buildToc(pocEntries, chainEntries)}
    ${buildCommonVariables(cv)}
    ${buildChainingRegister(cr)}

    <h2 style="color:#38bdf8;margin:32px 0 16px;font-size:1.4rem;">PoC Entries</h2>
    ${pocsHtml}

    <h2 style="color:#38bdf8;margin:32px 0 16px;font-size:1.4rem;">Attack Chains</h2>
    ${chainsHtml}

    ${buildSummaryMatrix(matrix)}
    ${buildNotExploitable(ne)}
    ${buildFinalSummary(fs)}

    <footer style="text-align:center;color:var(--text-muted);padding:24px 0;font-size:0.8rem;">
      PoC Testing Report generated by PoC Development &amp; Execution Agent
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
