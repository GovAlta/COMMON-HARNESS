#!/usr/bin/env node
/**
 * generate_overview_html.js — consolidated RedTeam overview SPA.
 *
 * Reads every JSON deliverable + scanner output under <target>/.ai/redteam/
 * and produces a single self-contained tabbed HTML report at
 * <target>/.ai/redteam/redteam_overview.html.
 *
 * Tabs (only rendered when source JSON is present):
 *   - Summary             — aggregate severity counts + skill roll-up
 *   - Recon               — recon_deliverable*.json
 *   - Code Analysis       — code_analysis_deliverable*.json
 *   - Dependency          — dependency_analysis_deliverable*.json
 *   - SAST                — sast_analysis_deliverable*.json
 *   - Secrets             — secrets_analysis_deliverable*.json
 *   - Infrastructure      — infrastructure_analysis_deliverable*.json
 *   - PoC                 — poc_deliverable*.json
 *   - Remediation         — remediation_report*.json
 *   - Scanners            — osv_*.json, trufflehog.json, semgrep.json,
 *                            nmap.json, whatweb.json, zap.json
 *   - Sources             — index of every input file + its size
 *
 * Usage:
 *   node scripts/generate_overview_html.js --repo-root <target>
 *
 * Output: <target>/.ai/redteam/redteam_overview.html (always overwrites)
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ── CLI ─────────────────────────────────────────────────────────────
const argv = process.argv.slice(2);
let repoRoot = null;
for (let i = 0; i < argv.length; i++) {
  if (argv[i] === '--repo-root') repoRoot = path.resolve(argv[++i]);
}
if (!repoRoot) {
  console.error('Usage: generate_overview_html.js --repo-root <target>');
  process.exit(2);
}
const inDir = path.join(repoRoot, '.ai', 'redteam');
if (!fs.existsSync(inDir)) {
  console.error(`generate_overview_html: ${inDir} does not exist. Run the redteam pipeline first.`);
  process.exit(2);
}
const outPath = path.join(inDir, 'redteam_overview.html');

// ── Severity helpers (mirror recon_json_to_html.js palette) ────────
const SEVERITY_COLORS = {
  CRITICAL:      ['#7f1d1d', '#fecaca', '#dc2626'],
  HIGH:          ['#7c2d12', '#fed7aa', '#ea580c'],
  MEDIUM:        ['#78350f', '#fef08a', '#ca8a04'],
  LOW:           ['#14532d', '#bbf7d0', '#16a34a'],
  INFO:          ['#1e3a5f', '#bfdbfe', '#3b82f6'],
};
function normSeverity(s) {
  if (!s) return 'INFO';
  const u = String(s).toUpperCase();
  if (u.includes('CRIT')) return 'CRITICAL';
  if (u.includes('HIGH')) return 'HIGH';
  if (u.includes('MED'))  return 'MEDIUM';
  if (u.includes('LOW'))  return 'LOW';
  return 'INFO';
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
function sevBadge(severity) {
  const s = normSeverity(severity);
  const [dark, light, accent] = SEVERITY_COLORS[s];
  return `<span class="badge" style="background:${light};color:${dark};border:1px solid ${accent}">${esc(s)}</span>`;
}

// ── Read every JSON under .ai/redteam/ ─────────────────────────────
function readJson(name) {
  const full = path.join(inDir, name);
  if (!fs.existsSync(full)) return null;
  try { return JSON.parse(fs.readFileSync(full, 'utf8')); }
  catch (e) { return { _parse_error: String(e), _file: name }; }
}
function findFirst(pattern) {
  const files = fs.readdirSync(inDir).filter(f => pattern.test(f) && f.endsWith('.json'));
  return files.length ? { name: files[0], data: readJson(files[0]) } : null;
}
function findAll(pattern) {
  return fs.readdirSync(inDir)
    .filter(f => pattern.test(f) && f.endsWith('.json'))
    .map(f => ({ name: f, data: readJson(f) }));
}

const recon          = findFirst(/^recon_deliverable/);
const codeAnalysis   = findFirst(/^code_analysis_deliverable/);
const dependency     = findFirst(/^dependency_analysis_deliverable/);
const sast           = findFirst(/^sast_analysis_deliverable/);
const secrets        = findFirst(/^secrets_analysis_deliverable/);
const infrastructure = findFirst(/^infrastructure_analysis_deliverable/);
const poc            = findFirst(/^poc_deliverable/);
const remediation    = findFirst(/^remediation_report/);
const osvScans       = findAll(/^osv(_|\.)/);
const trufflehog     = findFirst(/^trufflehog/);
const semgrep        = findFirst(/^semgrep/);
const nmap           = findFirst(/^nmap/);
const whatweb        = findFirst(/^whatweb/);
const zap            = findFirst(/^zap/);

// ── Severity aggregation ───────────────────────────────────────────
const totals = { CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0, INFO: 0 };
const bySource = {};
function bumpFromList(source, list, defaultSev) {
  if (!Array.isArray(list)) return;
  bySource[source] = bySource[source] || { CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0, INFO: 0 };
  for (const f of list) {
    const s = normSeverity(f && (f.severity || f.priority || defaultSev) || defaultSev);
    totals[s]++;
    bySource[source][s]++;
  }
}
function bumpSkill(source, doc, lowDefault = 'LOW') {
  if (!doc) return;
  bumpFromList(source, doc.critical_and_high_findings, 'HIGH');
  bumpFromList(source, doc.medium_findings, 'MEDIUM');
  // low_findings_summary may be an array OR a single summary object
  if (Array.isArray(doc.low_findings_summary)) {
    bumpFromList(source, doc.low_findings_summary, lowDefault);
  } else if (doc.low_findings_summary && typeof doc.low_findings_summary === 'object') {
    bySource[source] = bySource[source] || { CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0, INFO: 0 };
    bySource[source].LOW++;
    totals.LOW++;
  }
}
bumpSkill('SAST',           sast?.data);
bumpSkill('Secrets',        secrets?.data);
bumpSkill('Dependency',     dependency?.data);
bumpSkill('Infrastructure', infrastructure?.data);

// Recon findings live under recon_deliverable.findings (array) per the schema
if (recon?.data?.findings && Array.isArray(recon.data.findings)) {
  bumpFromList('Recon', recon.data.findings, 'INFO');
}

// Code analysis: counts come from xss_sinks, ssrf_sinks, auth, attack_surface (heuristic)
if (codeAnalysis?.data) {
  const ca = codeAnalysis.data;
  const xss = Array.isArray(ca.xss_sinks) ? ca.xss_sinks.length : 0;
  const ssrf = Array.isArray(ca.ssrf_sinks) ? ca.ssrf_sinks.length : 0;
  if (xss || ssrf) {
    bySource['Code Analysis'] = { CRITICAL: 0, HIGH: 0, MEDIUM: xss + ssrf, LOW: 0, INFO: 0 };
    totals.MEDIUM += xss + ssrf;
  }
}

// PoC: each executed PoC with confirmed: true is HIGH-or-CRITICAL by definition
if (poc?.data?.poc_report?.pocs && Array.isArray(poc.data.poc_report.pocs)) {
  for (const p of poc.data.poc_report.pocs) {
    const s = normSeverity(p.severity || (p.confirmed ? 'HIGH' : 'INFO'));
    totals[s]++;
    bySource['PoC'] = bySource['PoC'] || { CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0, INFO: 0 };
    bySource['PoC'][s]++;
  }
}

// Trufflehog findings
if (trufflehog?.data?.findings && Array.isArray(trufflehog.data.findings)) {
  for (const f of trufflehog.data.findings) {
    const s = normSeverity(f.severity || 'MEDIUM');
    totals[s]++;
    bySource['TruffleHog'] = bySource['TruffleHog'] || { CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0, INFO: 0 };
    bySource['TruffleHog'][s]++;
  }
}

// OSV findings (each scope)
let osvTotal = 0;
for (const o of osvScans) {
  const n = (o.data?.findings || []).length;
  osvTotal += n;
  for (const f of (o.data?.findings || [])) {
    const s = normSeverity(f.severity || 'HIGH');
    totals[s]++;
    bySource['OSV'] = bySource['OSV'] || { CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0, INFO: 0 };
    bySource['OSV'][s]++;
  }
}

// ── HTML rendering helpers ─────────────────────────────────────────
function renderTabButtons(tabs) {
  return tabs.map((t, i) => `<button class="tab ${i === 0 ? 'active' : ''}" data-tab="${t.id}">${esc(t.label)}${t.count != null ? ` <span class="chip">${t.count}</span>` : ''}</button>`).join('');
}
function renderSummaryTab() {
  const grand = Object.values(totals).reduce((a, b) => a + b, 0);
  const sevCells = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'INFO']
    .map(s => `<div class="sev-card sev-${s.toLowerCase()}"><div class="sev-n">${totals[s]}</div><div class="sev-l">${s}</div></div>`).join('');
  const sourceRows = Object.entries(bySource)
    .sort((a, b) => (b[1].CRITICAL + b[1].HIGH) - (a[1].CRITICAL + a[1].HIGH))
    .map(([src, c]) => `<tr><td>${esc(src)}</td><td>${c.CRITICAL}</td><td>${c.HIGH}</td><td>${c.MEDIUM}</td><td>${c.LOW}</td><td>${c.INFO}</td><td><strong>${c.CRITICAL + c.HIGH + c.MEDIUM + c.LOW + c.INFO}</strong></td></tr>`).join('');
  return `
    <h2>RedTeam Assessment — Consolidated Overview</h2>
    <p class="meta">Total findings: <strong>${grand}</strong> across ${Object.keys(bySource).length} sources.</p>
    <div class="sev-grid">${sevCells}</div>
    <h3>Findings by source</h3>
    <table class="data">
      <thead><tr><th>Source</th><th>Critical</th><th>High</th><th>Medium</th><th>Low</th><th>Info</th><th>Total</th></tr></thead>
      <tbody>${sourceRows || '<tr><td colspan="7" class="empty">No findings recorded.</td></tr>'}</tbody>
    </table>`;
}
function renderListSection(title, items, render) {
  if (!Array.isArray(items) || items.length === 0) {
    return `<h3>${esc(title)}</h3><p class="empty">No items.</p>`;
  }
  return `<h3>${esc(title)} <span class="chip">${items.length}</span></h3>
    <div class="items">${items.map(render).join('')}</div>`;
}
function renderFinding(f) {
  const sev = sevBadge(f.severity || f.priority || 'INFO');
  const title = f.title || f.finding_id || f.id || '(untitled)';
  const file = f.file || f.location?.file || f.affected_component || '';
  const line = f.line || f.location?.line || '';
  const desc = f.description || f.summary || f.detail || '';
  const rec = f.recommendation || f.remediation || '';
  return `<div class="finding">
    <div class="finding-head">${sev} <strong>${esc(title)}</strong></div>
    ${file ? `<div class="finding-loc"><code>${esc(file)}${line ? ':' + esc(line) : ''}</code></div>` : ''}
    ${desc ? `<div class="finding-body">${esc(desc)}</div>` : ''}
    ${rec ? `<div class="finding-rec"><strong>Remediation:</strong> ${esc(rec)}</div>` : ''}
  </div>`;
}
function skillTabBody(label, source, htmlPair) {
  if (!source) return `<p class="empty">No ${esc(label)} deliverable found.</p>`;
  const doc = source.data;
  if (doc?._parse_error) return `<p class="empty">Failed to parse <code>${esc(source.name)}</code>: ${esc(doc._parse_error)}</p>`;
  const ch = renderListSection('Critical / High', doc.critical_and_high_findings, renderFinding);
  const m = renderListSection('Medium', doc.medium_findings, renderFinding);
  const l = Array.isArray(doc.low_findings_summary)
    ? renderListSection('Low', doc.low_findings_summary, renderFinding)
    : doc.low_findings_summary
      ? `<h3>Low</h3><div class="finding"><div class="finding-body">${esc(typeof doc.low_findings_summary === 'string' ? doc.low_findings_summary : JSON.stringify(doc.low_findings_summary))}</div></div>`
      : '';
  return `
    <div class="src-link"><strong>Source:</strong> <code>${esc(source.name)}</code>${htmlPair ? ` &middot; <a href="./${esc(htmlPair)}">full HTML report</a>` : ''}</div>
    ${renderExecSummary(doc.executive_summary)}
    ${ch}
    ${m}
    ${l}`;
}
function reconBody() {
  if (!recon) return `<p class="empty">No recon deliverable found.</p>`;
  const d = recon.data;
  const findings = Array.isArray(d.findings) ? d.findings : [];
  const ports = Array.isArray(d.ports) ? d.ports : [];
  const tls = d.tls_analysis;
  return `
    <div class="src-link"><strong>Source:</strong> <code>${esc(recon.name)}</code> &middot; <a href="./recon_deliverable.html">full HTML report</a></div>
    ${renderExecSummary(d.executive_summary)}
    ${renderListSection('Findings', findings, renderFinding)}
    ${ports.length ? `<h3>Open ports</h3><ul>${ports.map(p => `<li><code>${esc(p.port || p)}</code> ${esc(p.service || '')}</li>`).join('')}</ul>` : ''}
    ${tls ? `<h3>TLS</h3><pre>${esc(JSON.stringify(tls, null, 2)).slice(0, 4000)}</pre>` : ''}`;
}
function codeAnalysisBody() {
  if (!codeAnalysis) return `<p class="empty">No code analysis deliverable found.</p>`;
  const d = codeAnalysis.data;
  return `
    <div class="src-link"><strong>Source:</strong> <code>${esc(codeAnalysis.name)}</code> &middot; <a href="./code_analysis_deliverable.html">full HTML report</a></div>
    ${renderExecSummary(d.executive_summary)}
    ${renderListSection('XSS sinks', d.xss_sinks, renderFinding)}
    ${renderListSection('SSRF sinks', d.ssrf_sinks, renderFinding)}
    ${renderListSection('Critical file paths', d.critical_file_paths, item => {
      const text = typeof item === 'string' ? item : (item?.path || item?.file || JSON.stringify(item));
      return `<div class="finding"><div class="finding-loc"><code>${esc(text)}</code></div></div>`;
    })}`;
}
/**
 * Render an executive_summary value safely — strings render as a paragraph,
 * objects render as a structured panel (overall_risk_rating + scope + stats +
 * top_findings if present).
 */
function renderExecSummary(value) {
  if (!value) return '';
  if (typeof value === 'string') return `<h3>Executive summary</h3><p>${esc(value)}</p>`;
  if (typeof value !== 'object') return `<h3>Executive summary</h3><p>${esc(String(value))}</p>`;
  const parts = [`<h3>Executive summary</h3>`];
  if (value.overall_risk_rating) {
    parts.push(`<p><strong>Overall risk:</strong> ${sevBadge(value.overall_risk_rating)}</p>`);
  }
  if (typeof value.assessment_scope === 'string') {
    parts.push(`<p>${esc(value.assessment_scope)}</p>`);
  }
  const stats = value.key_statistics;
  if (stats && typeof stats === 'object') {
    const cells = [];
    for (const [k, v] of Object.entries(stats)) {
      if (typeof v === 'object' && v !== null) continue; // breakdown handled below
      cells.push(`<div class="sev-card"><div class="sev-n">${esc(String(v))}</div><div class="sev-l">${esc(k.replace(/_/g, ' '))}</div></div>`);
    }
    if (cells.length) parts.push(`<div class="sev-grid" style="grid-template-columns:repeat(${Math.min(cells.length, 5)},1fr)">${cells.join('')}</div>`);
    if (stats.severity_breakdown && typeof stats.severity_breakdown === 'object') {
      const sevRows = Object.entries(stats.severity_breakdown)
        .map(([k, v]) => `<tr><td>${sevBadge(k)}</td><td>${esc(String(v))}</td></tr>`).join('');
      parts.push(`<table class="data"><thead><tr><th>Severity</th><th>Count</th></tr></thead><tbody>${sevRows}</tbody></table>`);
    }
  }
  if (Array.isArray(value.top_findings) && value.top_findings.length) {
    parts.push(renderListSection('Top findings', value.top_findings, f => `<div class="finding">
      <div class="finding-head">${sevBadge(f.severity || 'INFO')} <strong>${esc(f.name || f.title || '(finding)')}</strong></div>
      ${f.description ? `<div class="finding-body">${esc(f.description)}</div>` : ''}
    </div>`));
  }
  return parts.join('\n');
}

/**
 * Format a {file_path, lines, code} reference as an inline code locator
 * with an optional collapsed code block. Tolerates plain strings.
 */
function renderCodeRef(ref, label) {
  if (!ref) return '';
  if (typeof ref === 'string') return `<div class="finding-loc">${label ? `<strong>${esc(label)}:</strong> ` : ''}<code>${esc(ref)}</code></div>`;
  if (typeof ref !== 'object') return '';
  const file = ref.file_path || ref.file || '';
  const lines = ref.lines || ref.line || '';
  const code = ref.code;
  const loc = file ? `<code>${esc(file)}${lines ? ':' + esc(lines) : ''}</code>` : '';
  return `${loc ? `<div class="finding-loc">${label ? `<strong>${esc(label)}:</strong> ` : ''}${loc}</div>` : ''}${code ? `<details><summary>${label ? esc(label) + ' code' : 'Code'}</summary><pre>${esc(typeof code === 'string' ? code : JSON.stringify(code, null, 2)).slice(0, 6000)}</pre></details>` : ''}`;
}

/**
 * Render the structured "analysis" block on a PoC entry — typically
 * {confirmed: bool, markers: string[], mitigations?: string[]}.
 */
function renderAnalysisBlock(analysis) {
  if (!analysis) return '';
  if (typeof analysis === 'string') return `<div class="finding-body">${esc(analysis)}</div>`;
  if (typeof analysis !== 'object') return '';
  const conf = typeof analysis.confirmed === 'boolean' ? `<div class="finding-loc">${analysis.confirmed ? '<span class="chip chip-confirmed">CONFIRMED</span>' : '<span class="chip">NOT CONFIRMED</span>'}</div>` : '';
  const markers = Array.isArray(analysis.markers) && analysis.markers.length
    ? `<div class="finding-body"><strong>Markers:</strong><ul>${analysis.markers.map(m => `<li>${esc(typeof m === 'string' ? m : JSON.stringify(m))}</li>`).join('')}</ul></div>` : '';
  const mit = Array.isArray(analysis.mitigations) && analysis.mitigations.length
    ? `<div class="finding-body"><strong>Mitigations observed:</strong><ul>${analysis.mitigations.map(m => `<li>${esc(typeof m === 'string' ? m : JSON.stringify(m))}</li>`).join('')}</ul></div>` : '';
  return `${conf}${markers}${mit}`;
}

function pocBody() {
  if (!poc) return `<p class="empty">No PoC deliverable found.</p>`;
  const r = poc.data?.poc_report || {};
  const entries = Array.isArray(r.poc_entries) ? r.poc_entries : (Array.isArray(r.pocs) ? r.pocs : []);
  const chains = Array.isArray(r.chain_entries) ? r.chain_entries : [];
  const notExploitable = Array.isArray(r.not_exploitable) ? r.not_exploitable : [];
  return `
    <div class="src-link"><strong>Source:</strong> <code>${esc(poc.name)}</code> &middot; <a href="./poc_deliverable.html">full HTML report</a></div>
    ${renderExecSummary(r.executive_summary)}
    ${renderListSection('PoC entries', entries, p => {
      const sev = sevBadge(p.severity || 'INFO');
      const status = p.met_status || (p.confirmed ? 'CONFIRMED' : '');
      const statusChip = /confirm|exploit/i.test(status)
        ? `<span class="chip chip-confirmed">${esc(status)}</span>`
        : status ? `<span class="chip">${esc(status)}</span>` : '';
      const vuln = typeof p.vulnerability === 'string' ? p.vulnerability : (p.description || '');
      // Prefer the plain-string `why_it_works` for the body; render the
      // structured `analysis` block separately if present.
      const why = typeof p.why_it_works === 'string' ? p.why_it_works : '';
      const cmds = p.poc_commands;
      const cmdBlock = cmds
        ? `<details><summary>PoC commands</summary><pre>${esc(typeof cmds === 'string' ? cmds : JSON.stringify(cmds, null, 2)).slice(0, 8000)}</pre></details>`
        : '';
      return `<div class="finding">
        <div class="finding-head">${sev} ${statusChip} <strong>${esc(p.poc_id ? p.poc_id + ' — ' : '')}${esc(p.title || '(poc)')}</strong></div>
        ${renderCodeRef(p.source, 'Source')}
        ${renderCodeRef(p.sink, 'Sink')}
        ${vuln ? `<div class="finding-body">${esc(vuln)}</div>` : ''}
        ${why ? `<div class="finding-rec"><strong>Why it works:</strong> ${esc(why)}</div>` : ''}
        ${renderAnalysisBlock(p.analysis)}
        ${cmdBlock}
      </div>`;
    })}
    ${renderListSection('Attack chains', chains, c => {
      const summary = typeof c.summary === 'string' ? c.summary : (typeof c.description === 'string' ? c.description : '');
      const steps = Array.isArray(c.steps) ? c.steps : [];
      const stepsList = steps.length
        ? `<ol class="chain-steps">${steps.map(s => `<li>${esc(s.description || s.title || JSON.stringify(s))}${s.output ? ` <small style="color:#475569">→ ${esc(s.output)}</small>` : ''}</li>`).join('')}</ol>`
        : '';
      const exec = c.execution_result;
      const execBlock = exec
        ? `<details><summary>Execution result</summary><pre>${esc(typeof exec === 'string' ? exec : JSON.stringify(exec, null, 2)).slice(0, 6000)}</pre></details>`
        : '';
      return `<div class="finding">
        <div class="finding-head">${sevBadge(c.severity || 'HIGH')} <strong>${esc(c.chain_id ? c.chain_id + ' — ' : '')}${esc(c.title || '(chain)')}</strong></div>
        ${summary ? `<div class="finding-body">${esc(summary)}</div>` : ''}
        ${stepsList}
        ${renderAnalysisBlock(c.analysis)}
        ${execBlock}
      </div>`;
    })}
    ${renderListSection('Not exploitable', notExploitable, n => `<div class="finding">
      <div class="finding-head">${sevBadge('INFO')} <strong>${esc(n.title || n.poc_id || '(not exploitable)')}</strong></div>
      ${typeof n.reason === 'string' ? `<div class="finding-body">${esc(n.reason)}</div>` : ''}
      ${typeof n.evidence === 'string' ? `<div class="finding-rec">${esc(n.evidence)}</div>` : ''}
    </div>`)}
    ${r.final_summary && typeof r.final_summary === 'string' ? `<h3>Final summary</h3><p>${esc(r.final_summary)}</p>` : ''}`;
}

function renderAffectedFiles(files) {
  if (!Array.isArray(files) || files.length === 0) return '';
  return `<div class="finding-loc"><strong>Files:</strong> ${files.map(f => {
    if (typeof f === 'string') return `<code>${esc(f)}</code>`;
    const fp = f.file_path || f.path || '';
    const ln = f.lines || f.line || '';
    const role = f.role ? ` <span class="chip">${esc(f.role)}</span>` : '';
    return fp ? `<code>${esc(fp)}${ln ? ':' + esc(ln) : ''}</code>${role}` : `<code>${esc(JSON.stringify(f))}</code>`;
  }).join(' ')}</div>`;
}

function renderRecommendedChanges(changes) {
  if (!changes) return '';
  if (typeof changes === 'string') return `<div class="finding-rec"><strong>Recommended changes:</strong> ${esc(changes)}</div>`;
  if (!Array.isArray(changes)) return '';
  if (changes.length === 0) return '';
  return `<details open><summary><strong>Recommended changes</strong> (${changes.length})</summary>${changes.map(ch => {
    const file = ch.file_path || ch.file || '';
    const ls = ch.line_start || ch.line || '';
    const le = ch.line_end || ls;
    const range = ls ? (ls === le ? ':' + esc(ls) : ':' + esc(ls) + '-' + esc(le)) : '';
    const lang = ch.language ? ` <span class="chip">${esc(ch.language)}</span>` : '';
    const expl = ch.explanation ? `<div class="finding-body">${esc(ch.explanation)}</div>` : '';
    const current = ch.current_code != null ? `<pre style="background:#7f1d1d">${esc(ch.current_code).slice(0, 3000)}</pre>` : '';
    const replacement = ch.replacement_code != null ? `<pre style="background:#14532d">${esc(ch.replacement_code).slice(0, 3000)}</pre>` : '';
    return `<div class="finding">
      ${file ? `<div class="finding-loc"><code>${esc(file)}${range}</code>${lang}</div>` : ''}
      ${expl}
      ${current ? `<div class="finding-body"><strong>Current:</strong></div>${current}` : ''}
      ${replacement ? `<div class="finding-body"><strong>Replace with:</strong></div>${replacement}` : ''}
    </div>`;
  }).join('')}</details>`;
}

function renderImpact(impact) {
  if (!impact || typeof impact !== 'object') return '';
  const rows = Object.entries(impact).map(([k, v]) => {
    const label = esc(k.replace(/_/g, ' '));
    const value = Array.isArray(v) ? v.map(x => `<code>${esc(typeof x === 'string' ? x : JSON.stringify(x))}</code>`).join(' ')
      : typeof v === 'string' ? esc(v)
      : esc(JSON.stringify(v));
    return `<tr><td>${label}</td><td>${value}</td></tr>`;
  }).join('');
  return `<details><summary>Impact assessment</summary><table class="data"><tbody>${rows}</tbody></table></details>`;
}

function renderVerificationSteps(verify) {
  if (!verify) return '';
  if (typeof verify === 'string') return `<details><summary>Verification steps</summary><p>${esc(verify)}</p></details>`;
  if (!Array.isArray(verify)) return `<details><summary>Verification steps</summary><pre>${esc(JSON.stringify(verify, null, 2)).slice(0, 4000)}</pre></details>`;
  return `<details><summary>Verification steps (${verify.length})</summary><ol>${verify.map(s => {
    if (typeof s === 'string') return `<li>${esc(s)}</li>`;
    const desc = s.description || s.step || s.title || '';
    const expected = s.expected || s.expected_result || '';
    return `<li>${esc(typeof desc === 'string' ? desc : JSON.stringify(desc))}${expected ? ` <small style="color:#475569">→ ${esc(typeof expected === 'string' ? expected : JSON.stringify(expected))}</small>` : ''}</li>`;
  }).join('')}</ol></details>`;
}

function remediationBody() {
  if (!remediation) return `<p class="empty">No remediation report found.</p>`;
  const r = remediation.data?.remediation_report || {};
  // Schema uses `remediation_entries`; tolerate older shapes too.
  const items = Array.isArray(r.remediation_entries)
    ? r.remediation_entries
    : (Array.isArray(r.recommendations) ? r.recommendations : (Array.isArray(r.items) ? r.items : []));
  const priorityOrder = Array.isArray(r.priority_implementation_order) ? r.priority_implementation_order : [];
  return `
    <div class="src-link"><strong>Source:</strong> <code>${esc(remediation.name)}</code> &middot; <a href="./remediation_report.html">full HTML report</a></div>
    ${renderExecSummary(r.executive_summary)}
    ${priorityOrder.length ? `<h3>Priority order</h3><ol>${priorityOrder.map(p => `<li>${esc(typeof p === 'string' ? p : (p.title || p.rem_id || JSON.stringify(p)))}</li>`).join('')}</ol>` : ''}
    ${renderListSection('Remediation entries', items, it => {
      const sev = sevBadge(it.severity || it.priority || 'MEDIUM');
      const id = it.rem_id || it.id || '';
      const quickWin = it.quick_win ? '<span class="chip" style="background:#bbf7d0;color:#14532d">QUICK WIN</span>' : '';
      const verified = it.verified ? '<span class="chip chip-confirmed">VERIFIED</span>' : '';
      const root = typeof it.root_cause === 'string' ? it.root_cause : (typeof it.description === 'string' ? it.description : '');
      const relPocs = Array.isArray(it.related_poc_ids) ? it.related_poc_ids : [];
      return `<div class="finding">
        <div class="finding-head">${sev} ${quickWin} ${verified} <strong>${esc(id ? id + ' — ' : '')}${esc(it.title || '(remediation)')}</strong></div>
        ${relPocs.length ? `<div class="finding-loc"><strong>Addresses:</strong> ${relPocs.map(p => `<code>${esc(p)}</code>`).join(' ')}</div>` : ''}
        ${renderAffectedFiles(it.affected_files)}
        ${root ? `<div class="finding-body">${esc(root)}</div>` : ''}
        ${renderRecommendedChanges(it.recommended_changes || it.fix)}
        ${renderVerificationSteps(it.verification_steps)}
        ${renderImpact(it.impact_assessment)}
      </div>`;
    })}`;
}
function scannersBody() {
  const rows = [];
  for (const o of osvScans) {
    rows.push({ name: o.name, status: 'ran', count: (o.data?.findings || []).length, info: `${o.data?.packages_scanned || 0} packages, manifest ${o.data?.manifest_used || ''}` });
  }
  if (trufflehog) rows.push({ name: trufflehog.name, status: 'ran', count: trufflehog.data?.total_findings ?? (trufflehog.data?.findings || []).length, info: `${trufflehog.data?.files_scanned || 0} files scanned` });
  if (semgrep) rows.push({ name: semgrep.name, status: semgrep.data?.status || 'ran', count: semgrep.data?.total_findings ?? (semgrep.data?.findings || []).length, info: (semgrep.data?.install_instructions || []).join(' / ') || '' });
  if (nmap) rows.push({ name: nmap.name, status: nmap.data?.status || 'ran', count: (nmap.data?.ports || []).length, info: `target ${nmap.data?.target || ''}` });
  if (whatweb) rows.push({ name: whatweb.name, status: whatweb.data?.error ? 'failed' : 'ran', count: 0, info: whatweb.data?.error || '' });
  if (zap) rows.push({ name: zap.name, status: zap.data?.status || 'ran', count: 0, info: zap.data?.instructions ? 'manual_run_required' : '' });
  const trs = rows.map(r => `<tr><td><code>${esc(r.name)}</code></td><td>${esc(r.status)}</td><td>${r.count}</td><td>${esc(r.info)}</td></tr>`).join('');
  return `<table class="data">
    <thead><tr><th>File</th><th>Status</th><th>Findings</th><th>Notes</th></tr></thead>
    <tbody>${trs || '<tr><td colspan="4" class="empty">No scanner outputs.</td></tr>'}</tbody></table>`;
}
function sourcesBody() {
  const files = fs.readdirSync(inDir).filter(f => f !== 'redteam_overview.html').sort();
  const trs = files.map(f => {
    const stat = fs.statSync(path.join(inDir, f));
    const isHtml = f.endsWith('.html');
    return `<tr><td>${isHtml ? `<a href="./${esc(f)}">${esc(f)}</a>` : `<code>${esc(f)}</code>`}</td><td>${stat.size.toLocaleString()} B</td><td>${stat.mtime.toISOString()}</td></tr>`;
  }).join('');
  return `<table class="data">
    <thead><tr><th>File</th><th>Size</th><th>Modified</th></tr></thead>
    <tbody>${trs}</tbody></table>`;
}

// ── Compose tabs ───────────────────────────────────────────────────
const tabs = [
  { id: 'summary',     label: 'Summary',     body: renderSummaryTab() },
];
if (recon)          tabs.push({ id: 'recon',          label: 'Recon',          body: reconBody() });
if (codeAnalysis)   tabs.push({ id: 'code',           label: 'Code Analysis',  body: codeAnalysisBody() });
if (dependency)     tabs.push({ id: 'dependency',     label: 'Dependency',     body: skillTabBody('Dependency', dependency, null) });
if (sast)           tabs.push({ id: 'sast',           label: 'SAST',           body: skillTabBody('SAST', sast, null) });
if (secrets)        tabs.push({ id: 'secrets',        label: 'Secrets',        body: skillTabBody('Secrets', secrets, null) });
if (infrastructure) tabs.push({ id: 'infrastructure', label: 'Infrastructure', body: skillTabBody('Infrastructure', infrastructure, null) });
if (poc)            tabs.push({ id: 'poc',            label: 'PoC',            body: pocBody() });
if (remediation)    tabs.push({ id: 'remediation',    label: 'Remediation',    body: remediationBody() });
tabs.push({ id: 'scanners', label: 'Scanners', body: scannersBody() });
tabs.push({ id: 'sources',  label: 'Sources',  body: sourcesBody() });

// ── Final HTML ─────────────────────────────────────────────────────
const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>RedTeam Overview</title>
<style>
  :root { color-scheme: light; }
  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; margin: 0; background: #f8fafc; color: #0f172a; }
  header { background: #0f172a; color: #f1f5f9; padding: 18px 24px; }
  header h1 { margin: 0; font-size: 18px; font-weight: 600; }
  header .meta { font-size: 12px; opacity: 0.75; margin-top: 4px; }
  .tabs { display: flex; flex-wrap: wrap; gap: 4px; background: #e2e8f0; padding: 6px; border-bottom: 1px solid #cbd5e1; position: sticky; top: 0; z-index: 10; }
  .tab { background: #f1f5f9; border: 1px solid transparent; padding: 6px 12px; border-radius: 6px; cursor: pointer; font-size: 13px; color: #334155; }
  .tab:hover { background: #ffffff; }
  .tab.active { background: #ffffff; border-color: #cbd5e1; color: #0f172a; font-weight: 600; }
  .tab .chip { background: #0f172a; color: #fff; font-size: 11px; padding: 1px 6px; border-radius: 999px; margin-left: 6px; }
  main { max-width: 1100px; margin: 24px auto; padding: 0 24px 64px; }
  .panel { display: none; }
  .panel.active { display: block; }
  h2 { margin-top: 0; font-size: 22px; }
  h3 { margin-top: 28px; font-size: 16px; color: #334155; border-bottom: 1px solid #e2e8f0; padding-bottom: 4px; }
  p.meta { color: #475569; font-size: 13px; }
  .sev-grid { display: grid; grid-template-columns: repeat(5, 1fr); gap: 8px; margin: 16px 0; }
  .sev-card { background: #fff; border: 1px solid #e2e8f0; border-radius: 8px; padding: 12px; text-align: center; }
  .sev-card .sev-n { font-size: 28px; font-weight: 700; }
  .sev-card .sev-l { font-size: 11px; letter-spacing: 0.08em; text-transform: uppercase; color: #64748b; margin-top: 4px; }
  .sev-critical .sev-n { color: #dc2626; }
  .sev-high     .sev-n { color: #ea580c; }
  .sev-medium   .sev-n { color: #ca8a04; }
  .sev-low      .sev-n { color: #16a34a; }
  .sev-info     .sev-n { color: #3b82f6; }
  table.data { width: 100%; border-collapse: collapse; margin: 12px 0; background: #fff; border: 1px solid #e2e8f0; border-radius: 8px; overflow: hidden; }
  table.data th, table.data td { padding: 8px 12px; text-align: left; font-size: 13px; border-bottom: 1px solid #f1f5f9; }
  table.data th { background: #f8fafc; font-weight: 600; color: #334155; }
  table.data td:not(:first-child) { font-variant-numeric: tabular-nums; }
  .badge { display: inline-block; font-size: 11px; padding: 2px 8px; border-radius: 999px; font-weight: 600; letter-spacing: 0.04em; }
  .chip { background: #e2e8f0; color: #334155; font-size: 11px; padding: 1px 8px; border-radius: 999px; }
  .chip-confirmed { background: #fecaca; color: #7f1d1d; }
  .items { display: grid; gap: 8px; }
  .finding { background: #fff; border: 1px solid #e2e8f0; border-radius: 8px; padding: 12px; }
  .finding-head { display: flex; gap: 8px; align-items: center; font-size: 14px; }
  .finding-loc { font-size: 12px; color: #475569; margin-top: 4px; }
  .finding-body { font-size: 13px; margin-top: 6px; line-height: 1.5; }
  .finding-rec { font-size: 13px; margin-top: 6px; padding: 6px 8px; background: #fef9c3; border-left: 3px solid #ca8a04; border-radius: 4px; }
  .src-link { font-size: 12px; color: #475569; margin-bottom: 8px; }
  .empty { color: #94a3b8; font-size: 13px; font-style: italic; }
  code { background: #f1f5f9; padding: 1px 4px; border-radius: 3px; font-size: 12px; }
  pre { background: #0f172a; color: #f1f5f9; padding: 12px; border-radius: 6px; overflow-x: auto; font-size: 11px; white-space: pre-wrap; word-break: break-word; }
  .chain-steps li { margin: 4px 0; font-size: 13px; }
  details summary { cursor: pointer; font-size: 12px; color: #475569; margin-top: 4px; }
  a { color: #2563eb; text-decoration: none; }
  a:hover { text-decoration: underline; }
</style>
</head>
<body>
<header>
  <h1>RedTeam Overview</h1>
  <div class="meta">Generated ${esc(new Date().toISOString())} &middot; ${esc(repoRoot)}</div>
</header>
<nav class="tabs">${renderTabButtons(tabs.map(t => ({ id: t.id, label: t.label, count: t.id === 'summary' ? null : undefined })))}</nav>
<main>
${tabs.map((t, i) => `<section class="panel ${i === 0 ? 'active' : ''}" id="panel-${t.id}">${t.body}</section>`).join('')}
</main>
<script>
  document.querySelectorAll('.tab').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById('panel-' + btn.dataset.tab).classList.add('active');
    });
  });
</script>
</body>
</html>`;

fs.writeFileSync(outPath, html, 'utf8');
console.log(`generate_overview_html: wrote ${path.relative(process.cwd(), outPath)} (${tabs.length} tabs)`);
