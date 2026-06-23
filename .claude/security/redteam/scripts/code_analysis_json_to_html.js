#!/usr/bin/env node
/**
 * Converts a Code Analysis JSON deliverable (CODE-ANALYSIS-AGENT schema)
 * into a self-contained, human-readable HTML artifact.
 *
 * Usage:
 *   node code_analysis_json_to_html.js <input.json> [output.html]
 *
 * If output.html is omitted, it defaults to the input filename with .html extension.
 */

import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ── Helpers ────────────────────────────────────────────────────────

const RISK_COLORS = {
  critical: ['#7f1d1d', '#fecaca', '#dc2626'],
  high:     ['#7c2d12', '#fed7aa', '#ea580c'],
  medium:   ['#78350f', '#fef08a', '#ca8a04'],
  low:      ['#14532d', '#bbf7d0', '#16a34a'],
  info:     ['#1e293b', '#e2e8f0', '#64748b'],
};

function esc(text) {
  if (text == null) return '';
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;');
}

function riskBadge(level) {
  const lv = level.toLowerCase();
  const [dark, light, accent] = RISK_COLORS[lv] || ['#1e293b', '#e2e8f0', '#64748b'];
  return `<span class="badge" style="background:${light};color:${dark};border:1px solid ${accent}">${esc(level.toUpperCase())}</span>`;
}

function boolBadge(val, trueLabel = 'Yes', falseLabel = 'No') {
  if (val) {
    return `<span class="badge badge-green">${trueLabel}</span>`;
  }
  return `<span class="badge badge-red">${falseLabel}</span>`;
}

function nl2p(text) {
  if (!text) return '';
  let paragraphs = text.split('\n\n').map(p => p.trim()).filter(Boolean);
  if (paragraphs.length === 0) {
    paragraphs = [text.trim()];
  }
  return paragraphs.map(p => `<p>${esc(p)}</p>`).join('\n');
}

// ── Section builders ──────────────────────────────────────────────

function buildMetadata(meta) {
  if (!meta) return '';
  let rows = '';
  for (const [key, val] of Object.entries(meta)) {
    rows += `<tr><td class="label">${esc(key)}</td><td><code>${esc(val)}</code></td></tr>`;
  }
  return `
    <section class="card meta-card">
      <h2>Report Metadata</h2>
      <table class="meta-table">
        ${rows}
      </table>
    </section>`;
}

function buildExecutiveSummary(summary) {
  if (!summary) return '';
  return `
    <section class="card padded">
      <h2>1. Executive Summary</h2>
      <div class="narrative">${nl2p(summary)}</div>
    </section>`;
}

function buildTechnologyStack(ts) {
  if (!ts) return '';

  const langs = ts.languages || [];
  const fws = ts.frameworks || [];
  const arch = ts.architectural_pattern || '';
  const components = ts.critical_security_components || [];

  const langChips = langs.map(l => `<span class="chip">${esc(l)}</span>`).join(' ');
  const fwChips = fws.map(f => `<span class="chip chip-fw">${esc(f)}</span>`).join(' ');
  const compItems = components.map(c => `<li><code>${esc(c)}</code></li>`).join('\n');

  return `
    <section class="card padded">
      <h2>2. Architecture &amp; Technology Stack</h2>
      <div class="subsection">
        <h3>Languages</h3>
        <div class="chip-row">${langChips}</div>
      </div>
      <div class="subsection">
        <h3>Frameworks &amp; Libraries</h3>
        <div class="chip-row">${fwChips}</div>
      </div>
      <div class="subsection">
        <h3>Architectural Pattern</h3>
        <p>${esc(arch)}</p>
      </div>
      <div class="subsection">
        <h3>Critical Security Components</h3>
        <ul class="component-list">${compItems}</ul>
      </div>
    </section>`;
}

function buildAuthentication(auth) {
  if (!auth) return '';

  const mechs = auth.mechanisms || [];
  const endpoints = auth.auth_endpoints || [];
  const sessionLoc = auth.session_config_location || '';
  const analysis = auth.analysis || '';

  const mechItems = mechs.map(m => `<li>${esc(m)}</li>`).join('\n');
  const epItems = endpoints.map(e => `<li><code>${esc(e)}</code></li>`).join('\n');

  return `
    <section class="card padded">
      <h2>3. Authentication &amp; Authorization</h2>
      <div class="two-col">
        <div class="subsection">
          <h3>Mechanisms</h3>
          <ul>${mechItems}</ul>
        </div>
        <div class="subsection">
          <h3>Auth Endpoints</h3>
          <ul class="endpoint-list">${epItems}</ul>
        </div>
      </div>
      <div class="subsection">
        <h3>Session Config Location</h3>
        <code class="block-code">${esc(sessionLoc)}</code>
      </div>
      <div class="subsection">
        <h3>Analysis</h3>
        <div class="narrative">${nl2p(analysis)}</div>
      </div>
    </section>`;
}

function buildDataSecurity(text) {
  if (!text) return '';
  return `
    <section class="card padded">
      <h2>4. Data Security &amp; Storage</h2>
      <div class="narrative">${nl2p(text)}</div>
    </section>`;
}

function buildAttackSurface(surface) {
  if (!surface) return '';

  const entryPoints = surface.entry_points || [];
  const unauth = surface.unauthenticated_endpoints || [];

  // Entry points table
  let epRows = '';
  for (const ep of entryPoints) {
    const risk = ep.risk_level || 'info';
    const authIcon = ep.auth_required ? '&#128274;' : '&#128275;';
    epRows += `
        <tr>
          <td><code>${esc(ep.method || '')}</code></td>
          <td><code>${esc(ep.path || '')}</code></td>
          <td class="center">${authIcon}</td>
          <td class="center">${riskBadge(risk)}</td>
          <td class="notes-cell">${esc(ep.notes || '')}</td>
        </tr>`;
  }

  // Unauthenticated endpoint cards
  let unauthHtml = '';
  for (const ue of unauth) {
    const abuseItems = (ue.abuse_scenarios || []).map(s => `<li>${esc(s)}</li>`).join('\n');
    unauthHtml += `
        <div class="unauth-card">
          <div class="unauth-header">
            <code>${esc(ue.method || '')} ${esc(ue.path || '')}</code>
          </div>
          <div class="unauth-body">
            <div class="unauth-field">
              <span class="field-label">Privileged Operation</span>
              <p>${esc(ue.privileged_operation || '')}</p>
            </div>
            <div class="unauth-field">
              <span class="field-label">Credentials Used</span>
              <p>${esc(ue.credentials_used || '')}</p>
            </div>
            <div class="unauth-field">
              <span class="field-label">Abuse Scenarios</span>
              <ul class="abuse-list">${abuseItems}</ul>
            </div>
          </div>
        </div>`;
  }

  return `
    <section class="card">
      <div class="padded">
        <h2>5. Attack Surface Analysis</h2>
        <div class="stat-inline">
          <span class="stat-box-sm">${entryPoints.length} entry points</span>
          <span class="stat-box-sm warn">${unauth.length} unauthenticated</span>
        </div>
      </div>
      <div class="table-scroll">
        <table class="data-table">
          <thead><tr>
            <th>Method</th><th>Path</th><th class="center">Auth</th><th class="center">Risk</th><th>Notes</th>
          </tr></thead>
          <tbody>${epRows}</tbody>
        </table>
      </div>
      <div class="padded">
        <div class="subsection">
          <h3>Unauthenticated Endpoint Risk Assessment</h3>
          ${unauthHtml}
        </div>
      </div>
    </section>`;
}

function buildInfrastructure(text) {
  if (!text) return '';
  return `
    <section class="card padded">
      <h2>6. Infrastructure &amp; Operational Security</h2>
      <div class="narrative">${nl2p(text)}</div>
    </section>`;
}

function buildCodebaseOverview(text) {
  if (!text) return '';
  return `
    <section class="card padded">
      <h2>7. Codebase Overview</h2>
      <div class="narrative">${nl2p(text)}</div>
    </section>`;
}

function buildCriticalFilePaths(cfp) {
  if (!cfp) return '';

  const CATEGORY_LABELS = {
    configuration: 'Configuration',
    authentication_authorization: 'Authentication & Authorization',
    api_routing: 'API & Routing',
    data_models_db: 'Data Models & DB',
    dependency_manifests: 'Dependency Manifests',
    sensitive_data_secrets: 'Sensitive Data & Secrets',
    middleware_validation: 'Middleware & Validation',
    logging_monitoring: 'Logging & Monitoring',
    infrastructure_deployment: 'Infrastructure & Deployment',
  };

  let total = 0;
  let sectionsHtml = '';

  for (const [key, label] of Object.entries(CATEGORY_LABELS)) {
    const paths = cfp[key] || [];
    if (!paths.length) continue;
    total += paths.length;
    const items = paths.map(p => `<li><code>${esc(p)}</code></li>`).join('\n');
    sectionsHtml += `
        <div class="file-category">
          <h3>${esc(label)} <span class="count">(${paths.length})</span></h3>
          <ul class="file-list">${items}</ul>
        </div>`;
  }

  // Also render any extra keys not in the predefined list
  for (const [key, paths] of Object.entries(cfp)) {
    if (key in CATEGORY_LABELS || !Array.isArray(paths) || !paths.length) continue;
    total += paths.length;
    const label = key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
    const items = paths.map(p => `<li><code>${esc(p)}</code></li>`).join('\n');
    sectionsHtml += `
        <div class="file-category">
          <h3>${esc(label)} <span class="count">(${paths.length})</span></h3>
          <ul class="file-list">${items}</ul>
        </div>`;
  }

  return `
    <section class="card padded">
      <h2>8. Critical File Paths <span class="count">(${total} total)</span></h2>
      <div class="file-grid">${sectionsHtml}</div>
    </section>`;
}

function buildXssSinks(sinks) {
  if (!sinks || !sinks.length) {
    return `
    <section class="card padded">
      <h2>9. XSS Sinks</h2>
      <p class="empty-note">No XSS sinks identified.</p>
    </section>`;
  }

  const CONTEXT_COLORS = {
    html_body:      ['#dc2626', '#7f1d1d', '#fecaca'],
    html_attribute: ['#ea580c', '#7c2d12', '#fed7aa'],
    javascript:     ['#ca8a04', '#78350f', '#fef08a'],
    css:            ['#8b5cf6', '#4c1d95', '#ddd6fe'],
    url:            ['#0ea5e9', '#0c4a6e', '#bae6fd'],
  };

  let rows = '';
  for (const s of sinks) {
    const ctx = s.context || '';
    const [accent, bg, fg] = CONTEXT_COLORS[ctx] || ['#64748b', '#1e293b', '#e2e8f0'];
    const ctxBadge = `<span class="badge" style="background:${bg};color:${fg};border:1px solid ${accent}">${esc(ctx)}</span>`;
    const line = s.line_number || '';
    const loc = `${esc(s.file_path || '')}${line ? ':' + line : ''}`;
    rows += `
        <tr>
          <td><code class="file-ref">${loc}</code></td>
          <td><code>${esc(s.sink_type || '')}</code></td>
          <td class="center">${ctxBadge}</td>
          <td class="notes-cell">${esc(s.description || '')}</td>
        </tr>`;
  }

  return `
    <section class="card">
      <div class="padded">
        <h2>9. XSS Sinks <span class="count">(${sinks.length})</span></h2>
      </div>
      <div class="table-scroll">
        <table class="data-table">
          <thead><tr>
            <th>Location</th><th>Sink Type</th><th class="center">Context</th><th>Description</th>
          </tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    </section>`;
}

function buildSsrfSinks(sinks) {
  if (!sinks || !sinks.length) {
    return `
    <section class="card padded">
      <h2>10. SSRF Sinks</h2>
      <p class="empty-note">No SSRF sinks identified.</p>
    </section>`;
  }

  let rows = '';
  for (const s of sinks) {
    const cat = s.category || 'other';
    const catBadge = `<span class="badge badge-blue">${esc(cat)}</span>`;
    const line = s.line_number || '';
    const loc = `${esc(s.file_path || '')}${line ? ':' + line : ''}`;
    rows += `
        <tr>
          <td><code class="file-ref">${loc}</code></td>
          <td class="center">${catBadge}</td>
          <td class="notes-cell">${esc(s.description || '')}</td>
        </tr>`;
  }

  return `
    <section class="card">
      <div class="padded">
        <h2>10. SSRF Sinks <span class="count">(${sinks.length})</span></h2>
      </div>
      <div class="table-scroll">
        <table class="data-table">
          <thead><tr>
            <th>Location</th><th class="center">Category</th><th>Description</th>
          </tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    </section>`;
}

function buildToc(data) {
  const surface = data.attack_surface || {};
  const epCount = (surface.entry_points || []).length;
  const unauthCount = (surface.unauthenticated_endpoints || []).length;
  const xssCount = (data.xss_sinks || []).length;
  const ssrfCount = (data.ssrf_sinks || []).length;

  const cfp = data.critical_file_paths || {};
  let fileCount = 0;
  for (const v of Object.values(cfp)) {
    if (Array.isArray(v)) fileCount += v.length;
  }

  return `
    <nav class="toc">
      <h3>Contents</h3>
      <a href="#sec-exec">1. Executive Summary</a>
      <a href="#sec-tech">2. Architecture & Technology Stack</a>
      <a href="#sec-auth">3. Authentication & Authorization</a>
      <a href="#sec-data">4. Data Security & Storage</a>
      <a href="#sec-attack">5. Attack Surface <span class="toc-count">${epCount} endpoints, ${unauthCount} unauth</span></a>
      <a href="#sec-infra">6. Infrastructure & Operational Security</a>
      <a href="#sec-codebase">7. Codebase Overview</a>
      <a href="#sec-files">8. Critical File Paths <span class="toc-count">${fileCount} files</span></a>
      <a href="#sec-xss">9. XSS Sinks <span class="toc-count">${xssCount}</span></a>
      <a href="#sec-ssrf">10. SSRF Sinks <span class="toc-count">${ssrfCount}</span></a>
    </nav>`;
}

// ── CSS ────────────────────────────────────────────────────────────

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
  --purple: #8b5cf6;
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
h3 { font-size: 0.85rem; margin: 0 0 8px 0; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.05em; }
p { margin: 0 0 10px 0; }
ul { margin: 0 0 10px 0; padding-left: 20px; }
li { margin-bottom: 4px; font-size: 0.9rem; }
.header { padding: 32px 0 16px; border-bottom: 1px solid var(--border); margin-bottom: 24px; }
.header p { margin: 4px 0; color: var(--text-muted); }

/* Cards */
.card {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 8px;
  margin-bottom: 20px;
  overflow: hidden;
}
.padded { padding: 20px; }
.meta-card { padding: 20px; }
.meta-card h2 { padding: 0; }

/* Tables */
.meta-table { width: 100%; border-collapse: collapse; }
.meta-table td { padding: 6px 12px; vertical-align: top; }
.meta-table .label { color: var(--text-muted); white-space: nowrap; width: 200px; font-weight: 600; text-transform: capitalize; }
.data-table { width: 100%; border-collapse: collapse; }
.data-table th { background: var(--surface2); color: var(--text-muted); font-size: 0.8rem; text-transform: uppercase; letter-spacing: 0.05em; padding: 8px 12px; text-align: left; position: sticky; top: 0; }
.data-table td { padding: 8px 12px; border-top: 1px solid var(--border); vertical-align: top; font-size: 0.9rem; }
.center { text-align: center; }
.table-scroll { overflow-x: auto; }
.notes-cell { max-width: 450px; font-size: 0.85rem; color: var(--text-muted); }

/* Badges */
.badge { display: inline-block; padding: 2px 10px; border-radius: 9999px; font-size: 0.75rem; font-weight: 700; letter-spacing: 0.03em; vertical-align: middle; white-space: nowrap; }
.badge-green { background: #166534; color: #bbf7d0; border: 1px solid #22c55e; }
.badge-red { background: #7f1d1d; color: #fecaca; border: 1px solid #dc2626; }
.badge-yellow { background: #78350f; color: #fef08a; border: 1px solid #ca8a04; }
.badge-gray { background: #374151; color: #d1d5db; border: 1px solid #6b7280; }
.badge-blue { background: #0c4a6e; color: #bae6fd; border: 1px solid #0ea5e9; }

/* Chips */
.chip-row { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 8px; }
.chip { display: inline-block; background: var(--surface2); border: 1px solid var(--border); padding: 4px 12px; border-radius: 6px; font-size: 0.85rem; font-family: monospace; }
.chip-fw { border-color: var(--accent); color: var(--accent); }

/* Narrative text */
.narrative p { font-size: 0.92rem; line-height: 1.7; margin-bottom: 12px; }

/* Block code */
.block-code { display: block; background: #0d1117; border: 1px solid var(--border); border-radius: 6px; padding: 10px 14px; font-size: 0.85rem; line-height: 1.5; margin: 6px 0; white-space: pre-wrap; word-break: break-word; }
code { font-family: 'Cascadia Code', 'Fira Code', 'JetBrains Mono', monospace; font-size: 0.85em; }

/* Subsections */
.subsection { margin-top: 16px; }
.two-col { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
@media (max-width: 768px) { .two-col { grid-template-columns: 1fr; } }

/* Component list */
.component-list li { margin-bottom: 6px; }
.component-list code { background: var(--surface2); padding: 2px 6px; border-radius: 3px; font-size: 0.82rem; }

/* Endpoint list */
.endpoint-list code { background: #0d1117; padding: 2px 8px; border-radius: 4px; }

/* Stat boxes */
.stat-inline { display: flex; gap: 10px; margin-bottom: 12px; }
.stat-box-sm { display: inline-block; background: var(--surface2); border: 1px solid var(--border); padding: 4px 14px; border-radius: 6px; font-weight: 700; font-size: 0.9rem; }
.stat-box-sm.warn { border-color: var(--orange); color: var(--orange); }

/* Unauth cards */
.unauth-card { border: 1px solid var(--orange); border-radius: 6px; margin-bottom: 14px; overflow: hidden; }
.unauth-header { background: rgba(249,115,22,0.1); padding: 10px 16px; font-size: 0.95rem; font-weight: 700; border-bottom: 1px solid rgba(249,115,22,0.3); }
.unauth-body { padding: 12px 16px; }
.unauth-field { margin-bottom: 10px; }
.field-label { display: block; font-size: 0.75rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; color: var(--text-muted); margin-bottom: 4px; }
.abuse-list li { color: var(--orange); font-size: 0.88rem; margin-bottom: 6px; }

/* File path grid */
.file-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(350px, 1fr)); gap: 16px; }
.file-category { background: var(--surface2); border-radius: 6px; padding: 14px; }
.file-category h3 { margin-bottom: 8px; }
.file-list { padding-left: 16px; margin: 0; }
.file-list li { margin-bottom: 3px; font-size: 0.85rem; }
.file-list code { font-size: 0.82rem; }
.file-ref { background: var(--surface2); padding: 2px 6px; border-radius: 3px; word-break: break-all; }
.count { font-weight: 400; font-size: 0.85rem; color: var(--text-muted); }

/* Empty note */
.empty-note { color: var(--text-muted); font-style: italic; }

/* TOC */
.toc { background: var(--surface); border: 1px solid var(--border); border-radius: 8px; padding: 16px 20px; margin-bottom: 20px; }
.toc h3 { margin-bottom: 8px; }
.toc a { display: block; color: var(--text); text-decoration: none; padding: 4px 0; font-size: 0.9rem; transition: color 0.15s; }
.toc a:hover { color: var(--accent); }
.toc-count { color: var(--text-muted); font-size: 0.8rem; margin-left: 6px; }

/* Print */
@media print {
  body { background: #fff; color: #1a1a1a; }
  .card { border: 1px solid #ccc; break-inside: avoid; }
  .block-code { background: #f5f5f5; border: 1px solid #ddd; }
  .chip { background: #f0f0f0; border: 1px solid #ccc; color: #1a1a1a; }
  .chip-fw { border-color: #0369a1; color: #0369a1; }
  .unauth-card { border-color: #c2410c; }
  .unauth-header { background: #fff7ed; }
  .file-category { background: #f8fafc; }
}
`;

// ── Main HTML assembly ─────────────────────────────────────────────

function generateHtml(data) {
  const meta = data.metadata || {};
  const target = meta.target || data.target || 'Unknown';

  const title = `Code Analysis — ${target}`;
  const subtitleParts = [];
  if (meta.run_identifier) subtitleParts.push(meta.run_identifier);
  if (meta.timestamp) subtitleParts.push(meta.timestamp);
  if (meta.analyst) subtitleParts.push(meta.analyst);
  const subtitle = subtitleParts.map(s => esc(s)).join(' &middot; ');

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
      <h1>Code Analysis Report</h1>
      <p>${esc(target)}</p>
      <p>${subtitle}</p>
    </div>

    ${buildMetadata(meta)}
    ${buildToc(data)}

    <div id="sec-exec">${buildExecutiveSummary(data.executive_summary || '')}</div>
    <div id="sec-tech">${buildTechnologyStack(data.technology_stack || {})}</div>
    <div id="sec-auth">${buildAuthentication(data.authentication || {})}</div>
    <div id="sec-data">${buildDataSecurity(data.data_security || '')}</div>
    <div id="sec-attack">${buildAttackSurface(data.attack_surface || {})}</div>
    <div id="sec-infra">${buildInfrastructure(data.infrastructure_security || '')}</div>
    <div id="sec-codebase">${buildCodebaseOverview(data.codebase_overview || '')}</div>
    <div id="sec-files">${buildCriticalFilePaths(data.critical_file_paths || {})}</div>
    <div id="sec-xss">${buildXssSinks(data.xss_sinks || [])}</div>
    <div id="sec-ssrf">${buildSsrfSinks(data.ssrf_sinks || [])}</div>

    <footer style="text-align:center;color:var(--text-muted);padding:24px 0;font-size:0.8rem;">
      Code Analysis Report generated by Code Analysis Agent
    </footer>
  </div>
</body>
</html>`;
}

// ── CLI ────────────────────────────────────────────────────────────

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
