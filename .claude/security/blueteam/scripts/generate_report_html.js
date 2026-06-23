#!/usr/bin/env node
/**
 * generate_report_html.js — Security Report HTML Generator
 *
 * Converts .ai/blueteam/reports/*.md files to styled .html using the Security Assessment
 * BlueTeam CSS template. Handles section wrapping, severity badge injection,
 * and optional Mermaid diagram rendering.
 *
 * Usage (run from the repository root, or use --repo-root):
 *     node <path>/scripts/generate_report_html.js
 *     node <path>/scripts/generate_report_html.js --file .ai/blueteam/reports/threat_model.md
 *     node <path>/scripts/generate_report_html.js --repo-root /path/to/repo
 *
 * Dependencies:
 *     npm install marked
 *
 * Optional — Mermaid diagram rendering (renders diagrams as inline SVG):
 *     npm install -g @mermaid-js/mermaid-cli    (provides 'mmdc' command)
 */

import { readFileSync, writeFileSync, existsSync, readdirSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync, execFileSync } from 'node:child_process';
import os from 'node:os';
import { marked } from 'marked';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ---------------------------------------------------------------------------
// Report CSS (sourced from ai_html_report_template.md)
// ---------------------------------------------------------------------------
const _CSS =
  ':root{' +
  '--brand-blue:#003366;--brand-blue-med:#005eb8;--brand-gold:#FFBA35;' +
  '--critical:#c0392b;--high:#d35400;--medium:#c4960b;--low:#2471a3;' +
  '--pass:#1e8449;--assumed:#6c757d;--border:#dee2e6;--bg-page:#f4f6f8;' +
  '--bg-card:#ffffff;--text:#212529;--code-bg:#1e2733;--code-fg:#e8eaf0}' +
  '*{box-sizing:border-box;margin:0;padding:0}' +
  "body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto," +
  "'Helvetica Neue',Arial,sans-serif;font-size:14px;color:var(--text);" +
  'background:var(--bg-page);line-height:1.6}' +
  '.repo-strip{height:12px}' +
  '.rpt-header{background:var(--brand-blue);color:#fff;padding:16px 40px 20px;' +
  'display:flex;justify-content:space-between;align-items:flex-end}' +
  '.rpt-header .brand{font-size:11px;opacity:.65;text-transform:uppercase;' +
  'letter-spacing:.09em;margin-bottom:8px}' +
  '.rpt-header h1{font-size:26px;font-weight:700;line-height:1.15;margin-bottom:5px}' +
  '.rpt-header .report-type{font-size:12px;opacity:.70;text-transform:uppercase;letter-spacing:.07em}' +
  '.rpt-header .meta{text-align:right;font-size:12px;opacity:.88;line-height:2.0}' +
  ".repo-badge{display:inline-block;padding:2px 10px;border-radius:10px;font-size:11px;" +
  "font-family:'Cascadia Code','Consolas','Courier New',monospace;font-weight:600;color:#fff}" +
  '.gold-bar{height:4px;background:var(--brand-gold)}' +
  '.container{max-width:1360px;margin:28px auto;padding:0 20px}' +
  'section{background:var(--bg-card);border-radius:6px;border:1px solid ' +
  'var(--border);padding:24px 28px;margin-bottom:18px}' +
  'h2{font-size:17px;color:var(--brand-blue);border-bottom:2px solid ' +
  'var(--brand-blue);padding-bottom:6px;margin-bottom:16px}' +
  'h3{font-size:15px;margin:18px 0 8px;font-weight:600;color:#222}' +
  'h4{font-size:14px;margin:14px 0 6px;font-weight:600;color:#444}' +
  'p{margin:8px 0}ul,ol{margin:8px 0 8px 24px}li{margin:3px 0}' +
  'a{color:var(--brand-blue-med)}strong{font-weight:600}' +
  'hr{border:none;border-top:1px solid var(--border);margin:16px 0}' +
  '.badge{display:inline-block;padding:2px 8px;border-radius:3px;' +
  'font-size:11px;font-weight:700;text-transform:uppercase;' +
  'letter-spacing:.04em;white-space:nowrap}' +
  '.badge-critical{background:var(--critical);color:#fff}' +
  '.badge-fail{background:var(--critical);color:#fff}' +
  '.badge-high{background:var(--high);color:#fff}' +
  '.badge-medium{background:var(--medium);color:#fff}' +
  '.badge-low{background:var(--low);color:#fff}' +
  '.badge-pass,.badge-compliant{background:var(--pass);color:#fff}' +
  '.badge-assumed{background:var(--assumed);color:#fff}' +
  'table{width:100%;border-collapse:collapse;margin:12px 0;font-size:13px}' +
  'th{background:var(--brand-blue);color:#fff;padding:8px 12px;' +
  'text-align:left;font-weight:600}' +
  'td{padding:7px 12px;border-bottom:1px solid var(--border);vertical-align:top}' +
  'tr:nth-child(even) td{background:#f8f9fa}' +
  'tr:hover td{background:#eef3fb}' +
  "pre{background:var(--code-bg);color:var(--code-fg);border-radius:5px;" +
  "padding:14px 16px;overflow-x:auto;font-family:'Cascadia Code','Fira Code'," +
  "'Consolas',monospace;font-size:12.5px;line-height:1.5;margin:10px 0}" +
  "code{background:#e9ecef;color:#b03060;padding:1px 5px;border-radius:3px;" +
  "font-family:'Cascadia Code','Fira Code','Consolas',monospace;font-size:12.5px}" +
  'pre code{background:none;color:inherit;padding:0}' +
  'blockquote{border-left:4px solid var(--brand-blue);background:#f0f4fb;' +
  'padding:10px 16px;margin:10px 0;border-radius:0 4px 4px 0}' +
  'blockquote p{margin:0}' +
  '.finding-card{border-left:5px solid var(--border);padding:14px 18px;' +
  'margin:16px 0;border-radius:0 4px 4px 0;background:#fdfdfd}' +
  '.finding-card.critical{border-color:var(--critical)}' +
  '.finding-card.high{border-color:var(--high)}' +
  '.finding-card.medium{border-color:var(--medium)}' +
  '.finding-card.low{border-color:var(--low)}' +
  '.status-banner{border-radius:8px;padding:18px 22px;margin-bottom:20px;' +
  'display:flex;align-items:flex-start;gap:16px}' +
  '.status-banner .sb-icon{font-size:32px;line-height:1;flex-shrink:0;margin-top:2px}' +
  '.status-banner .sb-body{flex:1}' +
  '.status-banner .sb-title{font-size:17px;font-weight:700;margin-bottom:4px}' +
  '.status-banner .sb-detail{font-size:13px;line-height:1.5}' +
  '.status-banner .sb-action{font-size:12px;margin-top:8px}' +
  '.sb-critical{background:#fdf1f1;border:2px solid var(--critical)}' +
  '.sb-critical .sb-icon,.sb-critical .sb-title{color:var(--critical)}' +
  '.sb-critical .sb-detail{color:#721c24}' +
  '.sb-high{background:#fff4ee;border:2px solid var(--high)}' +
  '.sb-high .sb-icon,.sb-high .sb-title{color:var(--high)}' +
  '.sb-high .sb-detail{color:#7c2d12}' +
  '.sb-medium{background:#fffbeb;border:2px solid var(--medium)}' +
  '.sb-medium .sb-icon,.sb-medium .sb-title{color:#92400e}' +
  '.sb-medium .sb-detail{color:#78350f}' +
  '.sb-pass{background:#d4edda;border:2px solid var(--pass)}' +
  '.sb-pass .sb-icon,.sb-pass .sb-title{color:var(--pass)}' +
  '.sb-pass .sb-detail{color:#155724}' +
  '.sb-info{background:#f8f9fa;border:2px solid var(--assumed)}' +
  '.sb-info .sb-icon,.sb-info .sb-title{color:var(--assumed)}' +
  '.sb-info .sb-detail{color:#555}' +
  '.scope-callout{background:#fff8e1;border:1px solid #e6ab00;' +
  'border-left:4px solid #e6ab00;border-radius:4px;padding:10px 16px;' +
  'margin:0 0 18px;font-size:12px;color:#4a3200;line-height:1.5}' +
  '.scope-callout strong{color:#3d2600}' +
  ".redacted-chip{display:inline-block;background:#fff0f0;border:1px solid #f5c6c6;" +
  "color:#9b1c1c;font-family:'Cascadia Code','Fira Code','Consolas',monospace;" +
  'font-size:11px;padding:1px 5px;border-radius:3px;font-weight:600}' +
  '.diagram-container{margin:16px 0}' +
  '.diagram-container svg{display:block;margin:0 auto;max-width:100%;' +
  'height:auto;overflow:visible}' +
  '.diagram-container .mermaid{background:#fff;padding:12px;border-radius:4px;' +
  'border:1px solid var(--border);overflow-x:auto}' +
  '.diagram-source summary{font-size:11px;color:#6c757d;cursor:pointer;' +
  'user-select:none;padding:2px 4px}' +
  '.diagram-source pre{margin-top:4px;font-size:11px}' +
  // CC-1 — Show fix expandable block
  'details.finding-detail{margin-top:8px}' +
  'details.finding-detail>summary{font-size:12px;color:var(--brand-blue-med);' +
  'cursor:pointer;user-select:none;padding:2px 4px}' +
  'details.finding-detail>summary::-webkit-details-marker{display:none}' +
  'details.finding-detail>summary:hover{text-decoration:underline}' +
  'details.finding-detail>pre{margin-top:6px;font-size:12px}' +
  'details.finding-detail.verification-detail{border:1px solid #d9e8fa;' +
  'border-radius:4px;padding:8px 10px;background:#f7fbff}' +
  '.vt-meta{display:flex;gap:6px;align-items:center;flex-wrap:wrap;margin:4px 0 6px}' +
  '.vt-pill{display:inline-block;padding:1px 6px;border-radius:3px;font-size:10px;' +
  'font-weight:700;text-transform:uppercase;letter-spacing:.04em}' +
  '.vt-pill-safe-readonly{background:#e8f4fd;color:#1a4a6e}' +
  '.vt-pill-safe-authz{background:#fffbeb;color:#7a5800}' +
  '.vt-pill-destructive{background:#fde8e8;color:#7b0000}' +
  '.vt-pill-status-passed{background:#d4edda;color:#155724}' +
  '.vt-pill-status-failed{background:#fdf1f1;color:#721c24}' +
  '.vt-pill-status-not-tested,.vt-pill-status-not-applicable{background:#e9ecef;color:#495057}' +
  '.vt-label{font-size:11px;color:#555;font-weight:600;margin-top:6px}' +
  '.vt-text{font-size:12px;color:#333;line-height:1.45;margin:2px 0}' +
  '.vt-list{margin:4px 0 4px 18px;font-size:12px;color:#333}' +
  // U1 — sidebar layout
  '.page-layout{display:flex;align-items:flex-start;gap:0}' +
  '.toc-sidebar{width:210px;flex-shrink:0;position:sticky;top:20px;' +
  'max-height:calc(100vh - 40px);overflow-y:auto;background:var(--bg-card);' +
  'border:1px solid var(--border);border-radius:6px;padding:12px 0;' +
  'margin-right:18px;align-self:flex-start}' +
  '.toc-header{display:block;font-size:11px;font-weight:700;' +
  'text-transform:uppercase;letter-spacing:.07em;color:var(--brand-blue);' +
  'padding:0 14px 8px;border-bottom:1px solid var(--border);margin-bottom:6px}' +
  '.toc-sidebar a{display:block;padding:4px 14px;font-size:12px;' +
  'color:var(--text);text-decoration:none;border-left:2px solid transparent;' +
  'line-height:1.4;transition:background .12s,border-color .12s}' +
  '.toc-sidebar a:hover,.toc-sidebar a.toc-active{background:#f0f4fb;' +
  'color:var(--brand-blue);border-left-color:var(--brand-blue)}' +
  '.toc-sidebar a.toc-h3{padding-left:22px;font-size:11px;color:#555}' +
  '.main-content{flex:1;min-width:0}' +
  // U2 — severity summary bar
  '.severity-bar{display:flex;align-items:center;gap:6px;flex-wrap:wrap;' +
  'margin-bottom:14px;padding:10px 14px;background:#f8f9fa;' +
  'border:1px solid var(--border);border-radius:6px}' +
  '.sev-group{display:inline-flex;align-items:center;gap:6px;flex-wrap:wrap}' +
  '.sev-group-label{font-size:11px;font-weight:700;color:#6c757d;' +
  'text-transform:uppercase;letter-spacing:.05em;white-space:nowrap}' +
  '.sev-divider{color:#ced4da;font-size:16px;font-weight:300;padding:0 2px}' +
  '.sev-chip{display:inline-flex;align-items:center;gap:4px;padding:4px 10px;' +
  'border-radius:12px;font-size:12px;font-weight:600;white-space:nowrap}' +
  '.sev-chip .sev-count{font-size:15px;font-weight:700;line-height:1}' +
  '.sev-chip.sev-critical{background:#fdf1f1;color:var(--critical);' +
  'border:1px solid var(--critical)}' +
  '.sev-chip.sev-high{background:#fff4ee;color:var(--high);' +
  'border:1px solid var(--high)}' +
  '.sev-chip.sev-medium{background:#fffbeb;color:#92400e;' +
  'border:1px solid var(--medium)}' +
  '.sev-chip.sev-low{background:#eff6ff;color:var(--low);' +
  'border:1px solid var(--low)}' +
  '.sev-chip.sev-pass{background:#d4edda;color:var(--pass);' +
  'border:1px solid var(--pass)}' +
  '.sev-chip.sev-fail{background:#fdf1f1;color:var(--critical);' +
  'border:1px solid var(--critical)}' +
  '.sev-chip.sev-assumed{background:#f8f9fa;color:var(--assumed);' +
  'border:1px solid var(--assumed)}' +
  // U3 / UT-2 — row coloring
  'tr.row-fail td{background:#fdf1f1!important}' +
  'tr.row-warn td{background:#fff4ee!important}' +
  'tr.row-pass td{background:#f0faf3!important}' +
  'tr.row-medium td{background:#fffbeb!important}' +
  'tr.row-low td{background:#eff6ff!important}' +
  'tr.row-skip td{background:#f8f9fa!important}' +
  'tr.row-fail:hover td,tr.row-warn:hover td,tr.row-pass:hover td' +
  '{filter:brightness(.97)}' +
  // UT-3 — bug documented badge
  '.badge-bug{background:#fff3cd;color:#7c4a00;border:1px solid #e6ab00;' +
  'font-size:10px;padding:1px 6px;border-radius:3px;font-weight:600;' +
  'display:inline-block;margin-left:6px;white-space:nowrap}' +
  // U4 — back to top
  '#back-to-top{position:fixed;bottom:24px;right:24px;background:var(--brand-blue);' +
  'color:#fff;border:none;border-radius:50%;width:40px;height:40px;' +
  'font-size:20px;line-height:1;cursor:pointer;display:none;align-items:center;' +
  'justify-content:center;box-shadow:0 2px 8px rgba(0,0,0,.3);z-index:200}' +
  '#back-to-top:hover{background:var(--brand-blue-med)}' +
  // Pass 2 — chart / visualization styles
  '.chart-box{background:#f8f9fa;border:1px solid var(--border);border-radius:6px;' +
  'padding:14px 18px;margin:14px 0}' +
  '.chart-title{font-size:13px;font-weight:700;color:var(--brand-blue);margin-bottom:10px}' +
  '.hbar-row{display:flex;align-items:center;gap:10px;margin:5px 0}' +
  '.hbar-label{width:175px;font-size:12px;flex-shrink:0;text-align:right;color:#444}' +
  '.hbar-track{flex:1;background:#dee2e6;border-radius:3px;height:16px;overflow:hidden}' +
  '.hbar-fill{height:100%;border-radius:3px}' +
  '.hbar-count{min-width:26px;font-size:12px;font-weight:600;text-align:right;color:#555}' +
  '.attck-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(165px,1fr));' +
  'gap:6px;margin:10px 0}' +
  '.attck-cell{border-radius:4px;padding:8px 10px;font-size:12px}' +
  '.attck-cell .tac-name{font-weight:600;display:block}' +
  '.attck-cell .tac-id{font-size:10px;opacity:.8;display:block;margin-top:1px}' +
  '.attck-cell .tac-count{font-size:14px;font-weight:700;display:inline-block;margin-top:3px}' +
  '.attck-cell .tac-status{font-size:11px;margin-left:5px}' +
  '.attck-covered{background:#d4edda;border:1px solid #b7dfbf;color:#155724}' +
  '.attck-partial{background:#fffbeb;border:1px solid #fde68a;color:#92400e}' +
  '.attck-gap{background:#f8f9fa;border:1px solid var(--border);color:#6c757d}' +
  // responsive / print
  '@media print{.toc-sidebar{display:none}.page-layout{display:block}}' +
  '@media(max-width:900px){.page-layout{flex-direction:column}' +
  '.toc-sidebar{width:100%;position:static;margin-right:0;margin-bottom:14px}}' +
  '.rpt-footer{text-align:center;font-size:11px;color:#6c757d;' +
  'padding:18px 40px;border-top:1px solid var(--border);' +
  'background:#f4f6f8;margin-top:10px}' +
  '@media print{body{background:#fff;font-size:11px}' +
  '.rpt-header,th{-webkit-print-color-adjust:exact;print-color-adjust:exact}' +
  'section{break-inside:avoid;border:none;padding:12px 0}' +
  '.gold-bar{-webkit-print-color-adjust:exact;print-color-adjust:exact}}' +
  '@media(max-width:768px){.rpt-header{flex-direction:column;gap:10px}' +
  '.rpt-header .meta{text-align:left}.container{padding:0 12px}}';

// ---------------------------------------------------------------------------
// HTML escaping helper
// ---------------------------------------------------------------------------
function _esc(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ---------------------------------------------------------------------------
// Repository identity helpers
// ---------------------------------------------------------------------------
const _REPO_COLOUR_PALETTE = [
  '#0e6655', '#6c3483', '#1a5276', '#7d6608', '#784212',
  '#1b2631', '#4a235a', '#0b5345', '#922b21', '#1f618d',
];

function _repoColour(repoName) {
  let sum = 0;
  for (const c of repoName) sum += c.charCodeAt(0);
  return _REPO_COLOUR_PALETTE[sum % _REPO_COLOUR_PALETTE.length];
}

function _prettifyRepoName(repoName) {
  return repoName
    .replace(/_/g, '-')
    .split('-')
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

function _repoIdentity(repoRoot) {
  const result = { repo_name: path.basename(repoRoot), branch: '', sha: '' };
  try {
    const top = execSync('git rev-parse --show-toplevel', { cwd: repoRoot, stdio: ['pipe', 'pipe', 'pipe'] }).toString().trim();
    result.repo_name = path.basename(top);
  } catch { /* ignore */ }
  try {
    result.branch = execSync('git rev-parse --abbrev-ref HEAD', { cwd: repoRoot, stdio: ['pipe', 'pipe', 'pipe'] }).toString().trim();
  } catch { /* ignore */ }
  try {
    result.sha = execSync('git rev-parse --short HEAD', { cwd: repoRoot, stdio: ['pipe', 'pipe', 'pipe'] }).toString().trim();
  } catch { /* ignore */ }
  result.colour = _repoColour(result.repo_name);
  return result;
}

// ---------------------------------------------------------------------------
// Page template
// ---------------------------------------------------------------------------
function _pageTemplate(vars) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${vars.app_name} \u2014 ${vars.title} \u2014 Security Assessment</title>
  <style>${vars.css}</style>
</head>
<body>
${vars.repo_strip}
<div class="rpt-header">
  <div>
    <div class="brand">Security Assessment \u2014 Cybersecurity</div>
    <h1>${vars.app_name}</h1>
    <div class="report-type">${vars.title}</div>
  </div>
  <div class="meta">
    <div>${vars.repo_badge}</div>
    <div>Generated: ${vars.gen_date}</div>
${vars.branch_sha_line}    <div>${vars.classification}</div>
  </div>
</div>
<div class="gold-bar"></div>
<div class="container">
<div class="page-layout">
${vars.sidebar_nav}<div class="main-content">
<div class="scope-callout">&#9432; <strong>Code Review Scope</strong> &mdash; Findings are based on static analysis of source code, configuration, and documentation. Environmental controls (WAF, network firewall, IdP-level authentication, endpoint protection, storage encryption) are partially assumed per the Environment Baseline but not independently verified. Some findings may already be mitigated by controls not visible in this review &mdash; confirm with your operations or security team.</div>
${vars.severity_bar}${vars.body}
</div>
</div>
</div>
<div class="rpt-footer">
  Security Assessment &nbsp;|&nbsp; Generated: ${vars.gen_date} &nbsp;|&nbsp; ${vars.classification}
</div>
<button id="back-to-top" title="Back to top" onclick="window.scrollTo({top:0,behavior:'smooth'})">&#8679;</button>
<script>
(function(){
  var btn = document.getElementById('back-to-top');
  window.addEventListener('scroll', function(){
    btn.style.display = window.scrollY > 220 ? 'flex' : 'none';
    var hs = document.querySelectorAll('h2[id], h3[id]');
    var links = document.querySelectorAll('.toc-sidebar a');
    var cur = '';
    hs.forEach(function(h){ if (h.getBoundingClientRect().top <= 90) cur = h.id; });
    links.forEach(function(a){ a.classList.toggle('toc-active', a.getAttribute('href') === '#' + cur); });
  });
})();
</script>
${vars.mermaid_scripts}</body>
</html>`;
}

// ---------------------------------------------------------------------------
// Badge replacement patterns
// ---------------------------------------------------------------------------
const _BADGE_SUBS = [
  [/\bNOT APPLICABLE\b/g, '<span class="badge badge-assumed">Not Applicable</span>'],
  [/\bNOT VERIFIABLE\b/g, '<span class="badge badge-assumed">Not Verifiable</span>'],
  [/\bNON-COMPLIANT\b/g, '<span class="badge badge-fail">Non-Compliant</span>'],
  [/\bNon-compliant\b/g, '<span class="badge badge-fail">Non-Compliant</span>'],
  [/\bPARTIAL COMPLIANT\b/g, '<span class="badge badge-assumed">Partial Compliant</span>'],
  [/\bASSUMED COMPLIANT\b/g, '<span class="badge badge-assumed">Assumed Compliant</span>'],
  [/\bAssumed Compliant\b/g, '<span class="badge badge-assumed">Assumed Compliant</span>'],
  [/\bAssumed compliant\b/g, '<span class="badge badge-assumed">Assumed Compliant</span>'],
  [/\bCOMPLIANT\b/g, '<span class="badge badge-pass">Compliant</span>'],
  [/(?<!Assumed )\bCompliant\b/g, '<span class="badge badge-pass">Compliant</span>'],
  [/\bCritical\b/g, '<span class="badge badge-critical">Critical</span>'],
  [/\bHigh\b/g, '<span class="badge badge-high">High</span>'],
  [/\bMedium\b/g, '<span class="badge badge-medium">Medium</span>'],
  [/\bLow\b/g, '<span class="badge badge-low">Low</span>'],
  [/\bFAIL\b/g, '<span class="badge badge-fail">FAIL</span>'],
  [/\bFail\b/g, '<span class="badge badge-fail">Fail</span>'],
  [/\bPASS\b/g, '<span class="badge badge-pass">PASS</span>'],
  [/\bPass\b/g, '<span class="badge badge-pass">Pass</span>'],
  [/\bSkip\b/g, '<span class="badge badge-assumed">Skip</span>'],
  [/\bSKIP\b/g, '<span class="badge badge-assumed">SKIP</span>'],
  [/\bWaived\b/g, '<span class="badge badge-assumed">Waived</span>'],
  [/\bWAIVED\b/g, '<span class="badge badge-assumed">WAIVED</span>'],
  [/\bN\/A\b/g, '<span class="badge badge-assumed">N/A</span>'],
];

// Build single-pass combined regex
let _BADGE_COMBINED = null;
function _applyBadgeSubs(text) {
  if (!_BADGE_COMBINED) {
    const patterns = _BADGE_SUBS.map(([p], i) => `(?<g${i}>${p.source})`);
    let flags = 'g';
    // Check if any pattern uses lookbehind — need 'u' flag for some engines
    _BADGE_COMBINED = new RegExp(patterns.join('|'), flags);
  }
  const replacements = _BADGE_SUBS.map(([, r]) => r);
  return text.replace(_BADGE_COMBINED, function () {
    const m = arguments;
    const fullMatch = m[0];
    // arguments: match, group1, group2, ..., offset, string, groups
    const groups = m[m.length - 1]; // named groups object
    if (groups) {
      for (let i = 0; i < replacements.length; i++) {
        if (groups[`g${i}`] !== undefined) return replacements[i];
      }
    }
    return fullMatch;
  });
}

// ---------------------------------------------------------------------------
// Metadata extraction
// ---------------------------------------------------------------------------
function _extractTitle(md) {
  const m = md.match(/^#\s+(.+)$/m);
  return m ? m[1].trim() : 'Security Report';
}

function _extractMeta(md) {
  const meta = {
    app_name: '\u2014',
    classification: 'OFFICIAL',
    gen_date: new Date().toISOString().slice(0, 10),
  };
  const pats = [
    /(?:Application|System|App)(?:\s+Name)?:\*\*\s*(.+)/i,
    /\*\*(?:Application|System):\*\*\s*(.+)/i,
    /^\*\*App(?:lication)?:\*\*\s*(.+)/im,
    /application:\s*(.+)/i,
  ];
  for (const pat of pats) {
    const m = md.match(pat);
    if (m) {
      meta.app_name = m[1].replace(/[\s*]+$/, '').trim();
      break;
    }
  }
  const upper = md.toUpperCase();
  for (const cls of ['PROTECTED B', 'PROTECTED A', 'CONFIDENTIAL', 'PUBLIC']) {
    if (upper.includes(cls)) {
      meta.classification = cls.split(' ').map(w => w.charAt(0) + w.slice(1).toLowerCase()).join(' ');
      break;
    }
  }
  const dm = md.match(/\*\*Date:\*\*\s*(\d{4}-\d{2}-\d{2})/);
  if (dm) meta.gen_date = dm[1];
  return meta;
}

// ---------------------------------------------------------------------------
// Mermaid rendering
// ---------------------------------------------------------------------------
let _mmdcChecked = null;

function _mmdcAvailable() {
  if (_mmdcChecked === null) {
    try {
      execSync('mmdc --version', { stdio: ['pipe', 'pipe', 'pipe'], timeout: 5000 });
      _mmdcChecked = true;
    } catch {
      _mmdcChecked = false;
    }
  }
  return _mmdcChecked;
}

function _sanitizeMermaidV11(source) {
  return source.replace(/\|([^|\r\n]+)\|/g, (_, inner) => '|' + inner.replace(/\\n/g, ' ') + '|');
}

function _mermaidCdnBlock(source) {
  const esc = _esc(source);
  return (
    '<figure class="diagram-container">' +
    `<div class="mermaid">${esc}</div>` +
    '<details class="diagram-source"><summary>Diagram source (Mermaid)</summary>' +
    `<pre><code>${esc}</code></pre></details></figure>`
  );
}

function _renderMermaid(source, idx, tmpDir) {
  source = _sanitizeMermaidV11(source);
  if (!_mmdcAvailable()) return _mermaidCdnBlock(source);
  const srcF = path.join(tmpDir, `d${idx}.mmd`);
  const svgF = path.join(tmpDir, `d${idx}.svg`);
  writeFileSync(srcF, source, 'utf-8');
  try {
    execSync(`mmdc -i "${srcF}" -o "${svgF}" --backgroundColor transparent`, {
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: 30000,
    });
    let svg = readFileSync(svgF, 'utf-8');
    svg = svg.replace(/<\?xml[^>]+\?>\s*/g, '');
    const esc = _esc(source);
    return (
      `<figure class="diagram-container">${svg}` +
      '<details class="diagram-source"><summary>Diagram source (Mermaid)</summary>' +
      `<pre><code>${esc}</code></pre></details></figure>`
    );
  } catch {
    return _mermaidCdnBlock(source);
  }
}

// ---------------------------------------------------------------------------
// HTML post-processing
// ---------------------------------------------------------------------------
function _extractMermaidBlocks(md) {
  const placeholders = {};
  let counter = 0;
  const processed = md.replace(/```mermaid\n(.*?)```/gs, (_, src) => {
    const key = `MERMAIDPLACEHOLDER${counter}`;
    placeholders[key] = src;
    counter++;
    return key;
  });
  return [processed, placeholders];
}

function _injectBadgesInTables(html) {
  return html.replace(/<td>(?:(?!<td>).)*?<\/td>/gs, m => _applyBadgeSubs(m));
}

function _injectBadgesInProse(html) {
  for (const tag of ['h3', 'h4', 'p', 'li']) {
    const re = new RegExp(`<${tag}>.*?</${tag}>`, 'gs');
    html = html.replace(re, m => _applyBadgeSubs(m));
  }
  return html;
}

function _wrapH2Sections(html) {
  const chunks = html.split(/(?=<h2[\s>])/);
  if (chunks.length <= 1) return `<section>\n${html}\n</section>`;
  const parts = [];
  let openSection = false;
  for (const chunk of chunks) {
    if (!chunk.trim()) continue;
    if (chunk.trimStart().startsWith('<h2')) {
      if (openSection) parts.push('</section>\n');
      parts.push('<section>\n');
      openSection = true;
    }
    parts.push(chunk);
  }
  if (openSection) parts.push('\n</section>');
  return parts.join('');
}

function _inferSeverityFromContext(context) {
  const upper = context.slice(0, 300).toUpperCase();
  if (upper.includes('CRITICAL')) return 'critical';
  if (upper.includes('HIGH')) return 'high';
  if (upper.includes('MEDIUM')) return 'medium';
  if (upper.includes('LOW')) return 'low';
  return '';
}

function _renderRedactedChips(html) {
  return html.replace(/\[REDACTED-([A-Z0-9\-]+)\]/g, (_, id) =>
    `<span class="redacted-chip">[REDACTED-${id}]</span>`);
}

// ---------------------------------------------------------------------------
// Pass 1 usability functions
// ---------------------------------------------------------------------------
function _buildSidebar(html) {
  const headings = [];
  const re = /<(h[23])[^>]*\bid="([^"]+)"[^>]*>(.*?)<\/h[23]>/gs;
  let m;
  while ((m = re.exec(html)) !== null) {
    headings.push([m[1], m[2], m[3]]);
  }
  if (!headings.length) return '';
  const h3Count = headings.filter(([h]) => h === 'h3').length;
  const showH3 = h3Count <= 20;
  const parts = [];
  for (const [level, hid, raw] of headings) {
    if (level === 'h3' && !showH3) continue;
    const text = raw.replace(/<[^>]+>/g, '').trim();
    const cls = level === 'h3' ? ' class="toc-h3"' : '';
    parts.push(`<a href="#${hid}"${cls}>${_esc(text)}</a>`);
  }
  return parts.join('\n');
}

function _annotateChipSourceTables(html) {
  return html.replace(
    /(<!--\s*chip-source\s*-->)([\s\S]*?)(<table(?:[^>]*)?>)/gi,
    (_, comment, between, tagOpen) =>
      comment + between + tagOpen.slice(0, -1) + ' data-chip-source="true">',
  );
}

function _buildSeverityBar(html) {
  const counts = { critical: 0, high: 0, medium: 0, low: 0, pass: 0, fail: 0, assumed: 0 };
  let chipSourceTables = [];
  const csRe = /<table\b[^>]*data-chip-source="true"[^>]*>.*?<\/table>/gs;
  let cm;
  while ((cm = csRe.exec(html)) !== null) chipSourceTables.push(cm[0]);

  let tablesToCount;
  if (chipSourceTables.length) {
    tablesToCount = chipSourceTables;
  } else {
    tablesToCount = [];
    const tableRe = /<table\b[^>]*>.*?<\/table>/gs;
    let tm;
    while ((tm = tableRe.exec(html)) !== null) {
      const firstRow = tm[0].match(/<tr>(.*?)<\/tr>/s);
      if (!firstRow) continue;
      const colCount = (firstRow[1].match(/<t[hd][^>]*>/g) || []).length;
      if (colCount < 3) continue;
      tablesToCount.push(tm[0]);
    }
  }

  for (const tbl of tablesToCount) {
    const cellRe = /<td>(.*?)<\/td>/gs;
    let cell;
    while ((cell = cellRe.exec(tbl)) !== null) {
      for (const sev of Object.keys(counts)) {
        if (cell[1].includes(`badge-${sev}`)) counts[sev]++;
      }
    }
  }

  if (!Object.values(counts).some(v => v > 0)) return '';

  function chip(sev, label) {
    return (
      `<span class="sev-chip sev-${sev}">` +
      `<span class="sev-count">${counts[sev]}</span>` +
      `&thinsp;${label}</span>`
    );
  }

  const verdictChips = [];
  if (counts.fail) verdictChips.push(chip('fail', 'Failed'));
  if (counts.pass) verdictChips.push(chip('pass', 'Pass / Compliant'));
  if (counts.assumed) verdictChips.push(chip('assumed', 'Assumed / N/A'));

  const riskChips = [];
  for (const [sev, label] of [['critical', 'Critical'], ['high', 'High'], ['medium', 'Medium'], ['low', 'Low']]) {
    if (counts[sev]) riskChips.push(chip(sev, label));
  }

  const parts = [];
  if (verdictChips.length) {
    parts.push(
      '<span class="sev-group-label">Verdicts:</span>' +
      '<span class="sev-group">' + verdictChips.join('') + '</span>',
    );
  }
  if (riskChips.length) {
    if (parts.length) parts.push('<span class="sev-divider">|</span>');
    parts.push(
      '<span class="sev-group-label">Risk level:</span>' +
      '<span class="sev-group">' + riskChips.join('') + '</span>',
    );
  }
  return '<div class="severity-bar">' + parts.join('') + '</div>';
}

function _colorTableRows(html) {
  return html.replace(/<tr>.*?<\/tr>/gs, row => {
    if (!row.includes('<td')) return row;
    if (row.includes('badge-critical') || row.includes('badge-fail'))
      return row.replace('<tr>', '<tr class="row-fail">', 1);
    if (row.includes('badge-high'))
      return row.replace('<tr>', '<tr class="row-warn">', 1);
    if (row.includes('badge-pass'))
      return row.replace('<tr>', '<tr class="row-pass">', 1);
    if (row.includes('badge-medium'))
      return row.replace('<tr>', '<tr class="row-medium">', 1);
    if (row.includes('badge-low'))
      return row.replace('<tr>', '<tr class="row-low">', 1);
    if (row.includes('badge-assumed'))
      return row.replace('<tr>', '<tr class="row-skip">', 1);
    return row;
  });
}

function _injectTestBadges(html) {
  const triggers = ['DOCUMENTS BUG', 'documents bug', 'KNOWN GAP', 'known gap'];
  return html.replace(/<tr>.*?<\/tr>/gs, row => {
    if (!row.includes('<td')) return row;
    if (!triggers.some(p => row.includes(p))) return row;
    let badge;
    if (row.includes('badge-critical')) badge = '<span class="badge-bug">Bug Documented</span>';
    else if (row.includes('badge-assumed')) badge = '<span class="badge-bug">Gap Documented</span>';
    else return row;
    const pos = row.lastIndexOf('</td>');
    if (pos === -1) return row;
    return row.slice(0, pos) + ' ' + badge + row.slice(pos);
  });
}

function _injectDrScoreBars(html) {
  return html.replace(/<table>.*?<\/table>/gs, tbl => {
    const thTexts = (tbl.match(/<th[^>]*>(.*?)<\/th>/gs) || [])
      .map(h => h.replace(/<[^>]+>/g, '').trim());
    if (!['Score', 'Max', '%'].every(s => thTexts.includes(s))) return tbl;
    const pctIdx = thTexts.indexOf('%');
    return tbl.replace(/<tr>.*?<\/tr>/gs, row => {
      if (!row.includes('<td')) return row;
      const cells = [...row.matchAll(/<td>(.*?)<\/td>/gs)];
      if (cells.length <= pctIdx) return row;
      const pctRaw = cells[pctIdx][1].replace(/<[^>]+>/g, '').trim().replace(/%$/, '');
      const pct = parseFloat(pctRaw);
      if (isNaN(pct)) return row;
      const color = pct < 30 ? '#c0392b' : pct < 50 ? '#d35400' : pct < 75 ? '#c4960b' : '#1e8449';
      const bar =
        `<div style="margin-top:3px;height:6px;background:#e9ecef;border-radius:3px;overflow:hidden">` +
        `<div style="height:100%;width:${Math.round(pct)}%;background:${color};border-radius:3px"></div></div>`;
      let counter = 0;
      return row.replace(/<td>(.*?)<\/td>/gs, (cm, inner) => {
        counter++;
        if (counter === pctIdx + 1) {
          const plain = inner.replace(/<[^>]+>/g, '').trim();
          return `<td><strong>${plain}</strong>${bar}</td>`;
        }
        return cm;
      });
    });
  });
}

function _injectCoverageBars(html) {
  const PCT_RE = /\((\d+(?:\.\d+)?)%\)/;
  const FRAC_RE = /(\d+\s*\/\s*\d+)/;
  function pctColor(p) {
    return p < 30 ? '#c0392b' : p < 50 ? '#d35400' : p < 75 ? '#c4960b' : '#1e8449';
  }
  return html.replace(/<table>.*?<\/table>/gs, tbl => {
    const thTexts = (tbl.match(/<th[^>]*>(.*?)<\/th>/gs) || [])
      .map(h => h.replace(/<[^>]+>/g, '').trim());
    const thSet = new Set(thTexts);

    // Main dashboard table -> 2-card layout
    if (thSet.has('Pre-Existing Coverage') && thSet.has('With Generated Tests Adopted')) {
      const data = {};
      const rowRe = /<tr>(.*?)<\/tr>/gs;
      let rm;
      while ((rm = rowRe.exec(tbl)) !== null) {
        const row = rm[1];
        if (!row.includes('<td')) continue;
        const cells = [...row.matchAll(/<td>(.*?)<\/td>/gs)].map(c => c[1]);
        if (cells.length < 3) continue;
        const key = cells[0].replace(/<[^>]+>/g, '').trim();
        const preVal = cells[1].replace(/<[^>]+>/g, '').trim();
        const postVal = cells[2].replace(/<[^>]+>/g, '').trim();
        data[key] = [preVal, postVal];
      }
      const preStr = (data['Controls Covered'] || ['\u2014', '\u2014'])[0];
      const postStr = (data['Controls Covered'] || ['\u2014', '\u2014'])[1];
      const gainStr = (data['Coverage Gain'] || ['\u2014', '\u2014'])[1];
      const preTests = (data['Security Tests'] || ['\u2014', '\u2014'])[0];
      const postTests = (data['Security Tests'] || ['\u2014', '\u2014'])[1];

      let m2;
      const prePct = (m2 = PCT_RE.exec(preStr)) ? parseFloat(m2[1]) : 0;
      const postPct = (m2 = PCT_RE.exec(postStr)) ? parseFloat(m2[1]) : 0;
      const preFrac = (m2 = FRAC_RE.exec(preStr)) ? m2[1].replace(/ /g, '') : preStr;
      const postFrac = (m2 = FRAC_RE.exec(postStr)) ? m2[1].replace(/ /g, '') : postStr;
      const preC = pctColor(prePct);
      const postC = pctColor(postPct);
      const cardStyle = 'flex:1;border:1px solid #dee2e6;border-radius:8px;padding:20px;background:#fafafa';
      const labelStyle = 'font-size:12px;font-weight:600;text-transform:uppercase;color:#6c757d;letter-spacing:.05em;margin-bottom:8px';
      const barTrack = 'margin-top:10px;height:8px;background:#e9ecef;border-radius:4px;overflow:hidden';
      return (
        `<div style="display:flex;gap:16px;margin:16px 0">` +
        `<div style="${cardStyle}">` +
        `<div style="${labelStyle}">Pre-Existing Coverage</div>` +
        `<div style="font-size:40px;font-weight:700;color:${preC};line-height:1">${Math.round(prePct)}%</div>` +
        `<div style="font-size:14px;color:#495057;margin-top:4px">${preFrac} controls</div>` +
        `<div style="${barTrack}"><div style="height:100%;width:${Math.round(prePct)}%;background:${preC};border-radius:4px"></div></div>` +
        `<div style="font-size:12px;color:#6c757d;margin-top:8px">${preTests}</div></div>` +
        `<div style="${cardStyle}">` +
        `<div style="${labelStyle}">With Generated Tests Adopted</div>` +
        `<div style="font-size:40px;font-weight:700;color:${postC};line-height:1">${Math.round(postPct)}%</div>` +
        `<div style="font-size:14px;color:#495057;margin-top:4px">${postFrac} controls</div>` +
        `<div style="${barTrack}"><div style="height:100%;width:${Math.round(postPct)}%;background:${postC};border-radius:4px"></div></div>` +
        `<div style="font-size:12px;color:#6c757d;margin-top:8px">${postTests} &nbsp;&middot;&nbsp; ${gainStr}</div></div></div>`
      );
    }

    // Per-stack table -> inline % bars
    if (thSet.has('Pre-Existing') && thSet.has('With Generated Tests')) {
      return tbl.replace(/<tr>.*?<\/tr>/gs, row => {
        if (!row.includes('<td')) return row;
        return row.replace(/<td>(.*?)<\/td>/gs, (cm, inner) => {
          const pctMatch = PCT_RE.exec(inner.replace(/<[^>]+>/g, ''));
          if (!pctMatch) return cm;
          const pct = parseFloat(pctMatch[1]);
          const color = pctColor(pct);
          const bar =
            `<div style="margin-top:3px;height:6px;background:#e9ecef;border-radius:3px;overflow:hidden">` +
            `<div style="height:100%;width:${Math.round(pct)}%;background:${color};border-radius:3px"></div></div>`;
          return `<td>${inner}${bar}</td>`;
        });
      });
    }
    return tbl;
  });
}

// ---------------------------------------------------------------------------
// Pass 2 — chart injection functions
// ---------------------------------------------------------------------------
function _injectDreadBars(html) {
  return html.replace(/<table>.*?<\/table>/gs, tbl => {
    const thTexts = (tbl.match(/<th[^>]*>(.*?)<\/th>/gs) || [])
      .map(h => h.replace(/<[^>]+>/g, '').trim());
    if (!thTexts.includes('DREAD')) return tbl;
    const di = thTexts.indexOf('DREAD');
    return tbl.replace(/<tr>.*?<\/tr>/gs, row => {
      if (!row.includes('<td')) return row;
      const cells = [...row.matchAll(/<td>(.*?)<\/td>/gs)];
      if (cells.length <= di) return row;
      const cm = cells[di];
      const raw = cm[1].replace(/<[^>]+>/g, '').trim();
      const dm = raw.match(/^(\d+(?:\.\d+)?)\/(\d+)/);
      if (!dm) return row;
      const score = parseFloat(dm[1]);
      const maxv = parseFloat(dm[2]);
      const pct = maxv ? score / maxv * 100 : 0;
      const color = pct >= 80 ? '#c0392b' : pct >= 60 ? '#d35400' : pct >= 40 ? '#c4960b' : '#2471a3';
      const bar =
        `<div style="margin-top:3px;height:5px;background:#e9ecef;border-radius:3px;overflow:hidden">` +
        `<div style="height:100%;width:${Math.round(pct)}%;background:${color};border-radius:3px"></div></div>`;
      const newCell = `<td><strong>${raw}</strong>${bar}</td>`;
      return row.slice(0, cm.index) + newCell + row.slice(cm.index + cm[0].length);
    });
  });
}

function _injectAttckHeatmap(html) {
  return html.replace(/<table>.*?<\/table>/gs, tbl => {
    const thTexts = (tbl.match(/<th[^>]*>(.*?)<\/th>/gs) || [])
      .map(h => h.replace(/<[^>]+>/g, '').trim());
    if (!thTexts.some(t => t.includes('ATT'))) return tbl;
    if (!thTexts.some(t => t.includes('Coverage'))) return tbl;

    const tacI = thTexts.findIndex(t => t.includes('ATT') || t.toLowerCase().includes('tactic')) || 0;
    const idI = thTexts.findIndex(t => t.toUpperCase() === 'ID') || 1;
    const covI = thTexts.findIndex(t => t.includes('Coverage')) || 2;
    const cntI = thTexts.findIndex(t => t.includes('Finding') || t.includes('Count')) || 3;

    let cellsHtml = '';
    const rowRe = /<tr>.*?<\/tr>/gs;
    let rm;
    while ((rm = rowRe.exec(tbl)) !== null) {
      const row = rm[0];
      if (!row.includes('<td')) continue;
      const cells = [...row.matchAll(/<td>(.*?)<\/td>/gs)]
        .map(c => c[1].replace(/<[^>]+>/g, '').trim());
      if (!cells.length) continue;
      const tacName = cells[tacI] || '';
      const tacId = cells[idI] || '';
      const covText = cells[covI] || '';
      const count = cells[cntI] || '0';
      const covLower = covText.toLowerCase();
      let css, icon;
      if (covLower.includes('gap') || count.trim() === '0') {
        css = 'attck-gap'; icon = '\u2717';
      } else if (covLower.includes('partial')) {
        css = 'attck-partial'; icon = '\u25B3';
      } else {
        css = 'attck-covered'; icon = '\u2713';
      }
      cellsHtml += (
        `<div class="attck-cell ${css}">` +
        `<span class="tac-name">${_esc(tacName)}</span>` +
        `<span class="tac-id">${_esc(tacId)}</span>` +
        `<span class="tac-count">${_esc(count)}</span>` +
        `<span class="tac-status">${icon}</span></div>`
      );
    }
    if (!cellsHtml) return tbl;
    const grid =
      '<div class="chart-box">' +
      '<div class="chart-title">ATT&amp;CK Tactic Coverage</div>' +
      `<div class="attck-grid">${cellsHtml}</div>` +
      '<p style="font-size:11px;color:#6c757d;margin-top:8px">' +
      '<span class="attck-covered" style="padding:1px 6px;border-radius:3px;border:1px solid;font-size:11px">\u2713 Covered</span>&nbsp;' +
      '<span class="attck-partial" style="padding:1px 6px;border-radius:3px;border:1px solid;font-size:11px">\u25B3 Partial</span>&nbsp;' +
      '<span class="attck-gap" style="padding:1px 6px;border-radius:3px;border:1px solid;font-size:11px">\u2717 Gap</span>' +
      '</p></div>';
    return grid + tbl;
  });
}

function _injectTestSummaryBar(html) {
  return html.replace(/<pre>.*?<\/pre>/gs, block => {
    const inner = block.replace(/<[^>]+>/g, '');
    if (!inner.includes('Total:') || !inner.includes('Passed:')) return block;
    const _n = pat => { const mm = inner.match(pat); return mm ? parseInt(mm[1]) : 0; };
    const total = _n(/Total:\s*(\d+)/);
    const passed = _n(/Passed:\s*(\d+)/);
    const failed = _n(/Failed:\s*(\d+)/);
    const skipped = _n(/Skipped:\s*(\d+)/);
    if (!total) return block;
    const segs = (
      (passed ? `<div style="flex:${(passed / total * 100).toFixed(1)};background:#1e8449" title="Pass: ${passed}"></div>` : '') +
      (failed ? `<div style="flex:${(failed / total * 100).toFixed(1)};background:#c0392b" title="Fail: ${failed}"></div>` : '') +
      (skipped ? `<div style="flex:${(skipped / total * 100).toFixed(1)};background:#6c757d" title="Skip: ${skipped}"></div>` : '')
    );
    const _dot = (color, label, n) => n ?
      `<span><span style="display:inline-block;width:10px;height:10px;background:${color};border-radius:2px;margin-right:4px;vertical-align:middle"></span>${label}: ${n}</span>` : '';
    const legend = [_dot('#1e8449', 'Pass', passed), _dot('#c0392b', 'Fail', failed), _dot('#6c757d', 'Skip', skipped)]
      .filter(Boolean).join(' &nbsp; ');
    const chart =
      '<div class="chart-box">' +
      `<div class="chart-title">Test Results \u2014 ${total} total</div>` +
      `<div style="display:flex;height:22px;border-radius:4px;overflow:hidden;background:#dee2e6;margin-bottom:8px">${segs}</div>` +
      `<div style="display:flex;gap:12px;flex-wrap:wrap;font-size:12px">${legend}</div></div>`;
    return chart + block;
  });
}

function _injectStrideChart(html) {
  const STRIDE_ORDER = [
    ['Spoofing', '#e74c3c'],
    ['Tampering', '#d35400'],
    ['Repudiation', '#8e44ad'],
    ['Information Disclosure', '#2471a3'],
    ['Denial of Service', '#2ecc71'],
    ['Elevation of Privilege', '#c0392b'],
  ];
  return html.replace(/<section>.*?<\/section>/gs, sec => {
    const h2M = sec.match(/<h2[^>]*>(.*?)<\/h2>/s);
    if (!h2M) return sec;
    if (!h2M[1].replace(/<[^>]+>/g, '').toUpperCase().includes('STRIDE')) return sec;
    const counts = {};
    for (const [cat] of STRIDE_ORDER) {
      const pat = new RegExp('<h3[^>]*>' + cat.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '</h3>(.*?)(?=<h3|</section>|$)', 'si');
      const hm = pat.exec(sec);
      counts[cat] = hm ? ([...hm[1].matchAll(/<tr[^>]*>.*?<\/tr>/gs)].filter(r => r[0].includes('<td')).length) : 0;
    }
    if (!Object.values(counts).some(v => v > 0)) return sec;
    const maxN = Math.max(...Object.values(counts)) || 1;
    const bars = STRIDE_ORDER.map(([cat, color]) =>
      `<div class="hbar-row">` +
      `<div class="hbar-label">${cat}</div>` +
      `<div class="hbar-track">` +
      `<div class="hbar-fill" style="width:${Math.round((counts[cat] || 0) / maxN * 100)}%;background:${color}"></div></div>` +
      `<span class="hbar-count">${counts[cat] || 0}</span></div>`
    ).join('');
    const chart = `<div class="chart-box"><div class="chart-title">STRIDE Threat Distribution</div>${bars}</div>`;
    const pos = h2M.index + h2M[0].length;
    return sec.slice(0, pos) + '\n' + chart + sec.slice(pos);
  });
}

function _injectAsvsCharts(html) {
  const chapterResults = [];
  const re = /<strong>Chapter\s+(V\d+[^:]*?)\s+result:\s*(\d+)\/(\d+)[^<]*<\/strong>/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    chapterResults.push([m[1].trim(), parseInt(m[2]), parseInt(m[3])]);
  }
  if (!chapterResults.length) return html;
  const totalPass = chapterResults.reduce((s, [, p]) => s + p, 0);
  const totalReq = chapterResults.reduce((s, [, , t]) => s + t, 0);
  const totalFail = totalReq - totalPass;
  const overallPct = totalReq ? totalPass / totalReq * 100 : 0;
  const bars = chapterResults.filter(([, , t]) => t > 0).map(([ch, p, t]) =>
    `<div class="hbar-row">` +
    `<div class="hbar-label" style="width:48px">${_esc(ch)}</div>` +
    `<div class="hbar-track"><div style="display:flex;height:100%;border-radius:3px;overflow:hidden">` +
    `<div style="flex:${(p / t * 100).toFixed(1)};background:#1e8449" title="Pass: ${p}"></div>` +
    `<div style="flex:${((t - p) / t * 100).toFixed(1)};background:#c0392b" title="Fail: ${t - p}"></div>` +
    `</div></div><span class="hbar-count">${p}/${t}</span></div>`
  ).join('');
  const chart =
    '<div class="chart-box"><div class="chart-title">' +
    `ASVS Chapter Compliance \u2014 ${totalPass}/${totalReq} requirements pass (${Math.round(overallPct)}%)</div>` +
    '<div style="font-size:11px;color:#555;margin-bottom:8px">' +
    '<span style="display:inline-block;width:10px;height:10px;background:#1e8449;border-radius:2px;margin-right:3px;vertical-align:middle"></span>Pass &nbsp;' +
    '<span style="display:inline-block;width:10px;height:10px;background:#c0392b;border-radius:2px;margin-right:3px;vertical-align:middle"></span>Fail</div>' +
    `${bars}</div>`;

  return html.replace(/<section>.*?<\/section>/gs, sec => {
    const h2M = sec.match(/<h2[^>]*>(.*?)<\/h2>/s);
    if (!h2M) return sec;
    if (!h2M[1].replace(/<[^>]+>/g, '').toLowerCase().includes('executive summary')) return sec;
    return sec + '\n' + chart;
  });
}

function _injectCasDomainChart(html) {
  const STATUS_CSS = {
    'non-compliant-critical': ['#fdf1f1', '#c0392b', '#721c24'],
    'non-compliant-high': ['#fff4ee', '#d35400', '#7c2d12'],
    'non-compliant-medium': ['#fffbeb', '#c4960b', '#92400e'],
    'assumed-compliant': ['#f8f9fa', '#6c757d', '#555555'],
    'compliant': ['#d4edda', '#1e8449', '#155724'],
  };
  const STATUS_ICON = {
    'non-compliant-critical': '\u2717', 'non-compliant-high': '\u2717',
    'non-compliant-medium': '\u2717', 'assumed-compliant': '~', 'compliant': '\u2713',
  };

  const sections = [];
  const h3Re = /<h3[^>]*>([A-Z]+-\d+[^<]*)<\/h3>(.*?)(?=<h3[^>]*>[A-Z]+-\d+|<\/section>|$)/gs;
  let h3M;
  while ((h3M = h3Re.exec(html)) !== null) {
    const rule = h3M[1].replace(/<[^>]+>/g, '').trim();
    const contentUp = h3M[2].replace(/<[^>]+>/g, '').toUpperCase();
    let status;
    if (contentUp.includes('NON-COMPLIANT')) {
      status = contentUp.slice(0, 250).includes('CRITICAL') ? 'non-compliant-critical' :
        contentUp.slice(0, 250).includes('HIGH') ? 'non-compliant-high' : 'non-compliant-medium';
    } else if (contentUp.includes('ASSUMED COMPLIANT') || contentUp.slice(0, 120).includes('ASSUMED')) {
      status = 'assumed-compliant';
    } else if (contentUp.includes('COMPLIANT')) {
      status = 'compliant';
    } else continue;
    sections.push([rule, status]);
  }
  if (!sections.length) return html;

  const cards = sections.map(([rule, st]) => {
    const [bg, bdr, txt] = STATUS_CSS[st] || ['#f8f9fa', '#dee2e6', '#444'];
    const short = rule.includes(':') ? rule.split(':')[0].trim() : rule.slice(0, 20);
    return (
      `<div style="background:${bg};border:1px solid ${bdr};border-radius:4px;` +
      `padding:8px 6px;font-size:11px;color:${txt};text-align:center;word-break:break-word">` +
      `<div style="font-size:14px;font-weight:700">${STATUS_ICON[st]}</div>` +
      `<div style="font-weight:600;margin-top:2px">${_esc(short)}</div></div>`
    );
  }).join('');
  const nc = sections.filter(([, s]) => s.startsWith('non-compliant')).length;
  const ok = sections.length - nc;
  const chart =
    '<div class="chart-box"><div class="chart-title">' +
    `CAS Domain Status \u2014 ${nc} Non-Compliant &middot; ${ok} Compliant/Assumed</div>` +
    `<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(96px,1fr));gap:6px;margin-top:8px">${cards}</div>` +
    '<p style="font-size:11px;color:#6c757d;margin-top:8px">\u2717 Non-Compliant &nbsp; ~ Assumed Compliant &nbsp; \u2713 Compliant</p></div>';

  return html.replace(/<section>.*?<\/section>/gs, sec => {
    const h2M = sec.match(/<h2[^>]*>(.*?)<\/h2>/s);
    if (!h2M) return sec;
    const h2Text = h2M[1].replace(/<[^>]+>/g, '').toLowerCase();
    if (!h2Text.includes('compliance') && !h2Text.includes('cas')) return sec;
    const pos = h2M.index + h2M[0].length;
    return sec.slice(0, pos) + '\n' + chart + sec.slice(pos);
  });
}

function _injectDrRadar(html) {
  const dimData = [];
  const tableRe = /<table>.*?<\/table>/gs;
  let tm;
  while ((tm = tableRe.exec(html)) !== null) {
    const tbl = tm[0];
    const thTexts = (tbl.match(/<th[^>]*>(.*?)<\/th>/gs) || [])
      .map(h => h.replace(/<[^>]+>/g, '').trim());
    if (!thTexts.includes('Score') || !thTexts.includes('Max')) continue;
    const scoreI = thTexts.indexOf('Score');
    const maxI = thTexts.indexOf('Max');
    const dimI = thTexts.findIndex(t => t.includes('Dimension')) ?? 0;
    const rowRe = /<tr[^>]*>.*?<\/tr>/gs;
    let rm;
    while ((rm = rowRe.exec(tbl)) !== null) {
      const row = rm[0];
      if (!row.includes('<td')) continue;
      const cells = [...row.matchAll(/<td>(.*?)<\/td>/gs)]
        .map(c => c[1].replace(/<[^>]+>/g, '').trim());
      if (cells.length <= Math.max(dimI, scoreI, maxI)) continue;
      const dimName = cells[dimI];
      if (dimName.toLowerCase().includes('total') || !dimName) continue;
      const scoreVal = parseFloat((cells[scoreI].split(/\s/)[0]).replace(/[^\d.]/g, '') || '0');
      const maxVal = parseFloat((cells[maxI].split(/\s/)[0]).replace(/[^\d.]/g, '') || '20');
      if (isNaN(scoreVal) || isNaN(maxVal)) continue;
      dimData.push([dimName, scoreVal, maxVal]);
    }
    if (dimData.length) break;
  }
  if (dimData.length < 3) return html;

  const W = 280, H = 270, cx = 140, cy = 138, r = 95;
  const n = dimData.length;
  const angles = Array.from({ length: n }, (_, i) => Math.PI * (-0.5 + 2 * i / n));
  const rings = [0.25, 0.5, 0.75, 1.0].map(p =>
    `<polygon points="${angles.map(a => `${(cx + r * p * Math.cos(a)).toFixed(1)},${(cy + r * p * Math.sin(a)).toFixed(1)}`).join(' ')}" fill="none" stroke="#dee2e6" stroke-width="1"/>`
  ).join('');
  const axes = angles.map(a =>
    `<line x1="${cx}" y1="${cy}" x2="${(cx + r * Math.cos(a)).toFixed(1)}" y2="${(cy + r * Math.sin(a)).toFixed(1)}" stroke="#dee2e6" stroke-width="1"/>`
  ).join('');
  const valPts = dimData.map(([, s, mv], i) =>
    `${(cx + r * (s / mv) * Math.cos(angles[i])).toFixed(1)},${(cy + r * (s / mv) * Math.sin(angles[i])).toFixed(1)}`
  ).join(' ');
  const polygon = `<polygon points="${valPts}" fill="#003366" fill-opacity="0.18" stroke="#003366" stroke-width="2"/>`;
  const dots = dimData.map(([, s, mv], i) =>
    `<circle cx="${(cx + r * (s / mv) * Math.cos(angles[i])).toFixed(1)}" cy="${(cy + r * (s / mv) * Math.sin(angles[i])).toFixed(1)}" r="4" fill="#003366"/>`
  ).join('');

  let labels = '';
  for (let i = 0; i < dimData.length; i++) {
    const [name, score, maxV] = dimData[i];
    const lx = cx + (r + 24) * Math.cos(angles[i]);
    const ly = cy + (r + 24) * Math.sin(angles[i]);
    const short = name.replace('Implementation', 'Impl.').replace('Resilience', 'Resil.').replace('Infrastructure', 'Infra.');
    const words = short.split(/\s+/);
    const lineH = 12;
    const y0 = ly - (words.length - 1) * lineH / 2;
    for (let j = 0; j < words.length; j++) {
      labels += `<text x="${lx.toFixed(1)}" y="${(y0 + j * lineH).toFixed(1)}" text-anchor="middle" font-size="9" fill="#444">${_esc(words[j])}</text>`;
    }
    labels += `<text x="${lx.toFixed(1)}" y="${(y0 + words.length * lineH).toFixed(1)}" text-anchor="middle" font-size="9" fill="#003366" font-weight="bold">${Math.round(score)}/${Math.round(maxV)}</text>`;
  }

  const svg = `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" style="display:block;margin:0 auto;max-width:100%">${rings}${axes}${polygon}${dots}${labels}</svg>`;
  const chart = `<div class="chart-box" style="text-align:center"><div class="chart-title">DR Resilience Dimensions</div>${svg}</div>`;

  return html.replace(/<section>.*?<\/section>/gs, sec => {
    const h2M = sec.match(/<h2[^>]*>(.*?)<\/h2>/s);
    if (h2M) {
      const h2Text = h2M[1].replace(/<[^>]+>/g, '').toLowerCase();
      if (!['resilience', 'scorecard', 'assessment', 'summary'].some(kw => h2Text.includes(kw))) return sec;
    }
    const tblM = sec.match(/<table>.*?<\/table>/s);
    if (!tblM) return sec;
    const tblText = tblM[0].replace(/<[^>]+>/g, '');
    if (!tblText.includes('Score') || !tblText.includes('Max')) return sec;
    return sec.slice(0, tblM.index + tblM[0].length) + '\n' + chart + sec.slice(tblM.index + tblM[0].length);
  });
}

// ---------------------------------------------------------------------------
// CC-1 — Show fix injection
// ---------------------------------------------------------------------------
const _CC_REF_RE = /(<p><strong>Change\s+ID:<\/strong>\s*(CC-\d+)[^<]*<code>[^<]*code_changes[^<]*<\/code><\/p>)/gi;

function _loadCodeChanges(repoRoot) {
  const ccPath = path.join(repoRoot, '.ai', 'blueteam', 'data', 'code_changes.json');
  if (!existsSync(ccPath)) return {};
  try {
    const data = JSON.parse(readFileSync(ccPath, 'utf-8'));
    let entries;
    if (typeof data === 'object' && !Array.isArray(data)) {
      entries = data.changes || data.entries || [];
    } else if (Array.isArray(data)) {
      entries = data;
    } else {
      entries = [];
    }
    const map = {};
    for (const e of entries) {
      if (e && typeof e === 'object' && e.id) map[e.id] = e;
    }
    return map;
  } catch { return {}; }
}

function _loadVerificationTests(repoRoot) {
  const vtPath = path.join(repoRoot, '.ai', 'blueteam', 'data', 'verification_tests.json');
  if (!existsSync(vtPath)) return {};
  try {
    const data = JSON.parse(readFileSync(vtPath, 'utf-8'));
    const entries = (typeof data === 'object' && !Array.isArray(data)) ? (data.tests || []) : [];
    const out = {};
    for (const item of entries) {
      if (!item || typeof item !== 'object') continue;
      const fid = String(item.finding_id || '').trim().toUpperCase();
      if (!fid) continue;
      if (!out[fid]) out[fid] = [];
      out[fid].push(item);
    }
    return out;
  } catch { return {}; }
}

function _injectShowFix(html, ccMap) {
  if (!ccMap || !Object.keys(ccMap).length) return html;
  return html.replace(_CC_REF_RE, (_, fullPara, ccId) => {
    const entry = ccMap[ccId.toUpperCase()] || {};
    const code = (entry.replacement_code || '').trim();
    if (!code) return fullPara;
    const escaped = _esc(code);
    return fullPara + '\n' +
      '<details class="finding-detail">' +
      `<summary>&#9654;&nbsp;Show fix (${ccId})</summary>` +
      `<pre><code>${escaped}</code></pre></details>`;
  });
}

const _FINDING_H3_RE = /(<h3[^>]*>\s*(?:<[^>]+>\s*)*([A-Z][A-Z0-9]*(?:-[A-Z0-9]+)*-\d+)\b[^<]*<\/h3>)/gi;

function _injectVerificationBlocks(html, vtMap) {
  if (!vtMap || !Object.keys(vtMap).length) return html;
  function _statusCss(status) {
    const s = status.trim().toLowerCase().replace(/_/g, '-');
    return ['passed', 'failed', 'not-tested', 'not-applicable'].includes(s) ? s : 'not-tested';
  }
  function _renderTest(entry) {
    const title = _esc(String(entry.title || 'Verification Test').trim() || 'Verification Test');
    let safety = String(entry.safety_level || 'safe-readonly').trim().toLowerCase().replace(/_/g, '-');
    if (!['safe-readonly', 'safe-authz', 'destructive'].includes(safety)) safety = 'safe-readonly';
    const status = _statusCss(String(entry.validation_status || 'not-tested'));
    const statusLabel = status.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
    let preconditions = entry.preconditions || [];
    if (!Array.isArray(preconditions)) preconditions = [String(preconditions)];
    const preHtml = preconditions.filter(p => String(p).trim()).map(p => `<li>${_esc(String(p))}</li>`).join('');
    let evidence = entry.evidence_to_capture || [];
    if (!Array.isArray(evidence)) evidence = [String(evidence)];
    const evidenceHtml = evidence.filter(e => String(e).trim()).map(e => `<li>${_esc(String(e))}</li>`).join('');
    const command = _esc(String(entry.command_template || '').trim());
    const expectedVuln = _esc(String(entry.expected_vulnerable_result || '').trim());
    const expectedMitigated = _esc(String(entry.expected_mitigated_result || '').trim());
    return (
      '<details class="finding-detail verification-detail">' +
      `<summary>&#9654;&nbsp;${title}</summary>` +
      '<div class="vt-meta">' +
      `<span class="vt-pill vt-pill-${safety}">${_esc(safety.toUpperCase())}</span>` +
      `<span class="vt-pill vt-pill-status-${status}">${_esc(statusLabel)}</span></div>` +
      (preHtml ? `<div class="vt-label">Preconditions</div><ul class="vt-list">${preHtml}</ul>` : '') +
      (command ? `<div class="vt-label">Command Template</div><pre><code>${command}</code></pre>` : '') +
      (expectedVuln ? `<div class="vt-label">Expected Vulnerable Result</div><div class="vt-text">${expectedVuln}</div>` : '') +
      (expectedMitigated ? `<div class="vt-label">Expected Mitigated Result</div><div class="vt-text">${expectedMitigated}</div>` : '') +
      (evidenceHtml ? `<div class="vt-label">Evidence to Capture</div><ul class="vt-list">${evidenceHtml}</ul>` : '') +
      '</details>'
    );
  }
  return html.replace(_FINDING_H3_RE, (_, headingHtml, fid) => {
    const entries = vtMap[fid.toUpperCase()] || [];
    if (!entries.length) return headingHtml;
    return headingHtml + '\n' + entries.map(e => _renderTest(e)).join('');
  });
}

function _wrapFindingCards(html) {
  const headingRe = /(<h3[^>]*>(?:FINDING|CC|SR|KC|T|CAS|ASVS|DR|DRG|DRR|VULN|SECRET)-\d+[^<]*<\/h3>)/gi;
  const parts = html.split(headingRe);
  if (parts.length <= 1) return html;
  const result = [parts[0]];
  let i = 1;
  while (i < parts.length) {
    const heading = parts[i];
    const content = i + 1 < parts.length ? parts[i + 1] : '';
    const secMatch = content.match(/(?=<\/section>)/);
    let inside, outside;
    if (secMatch) {
      inside = content.slice(0, secMatch.index);
      outside = content.slice(secMatch.index);
    } else {
      inside = content;
      outside = '';
    }
    const severity = _inferSeverityFromContext(inside);
    const cls = ` class="finding-card${severity ? ' ' + severity : ''}"`;
    result.push(`<div${cls}>${heading}${inside}</div>`);
    result.push(outside);
    i += 2;
  }
  return result.join('');
}

// ---------------------------------------------------------------------------
// Main conversion
// ---------------------------------------------------------------------------
function convert(mdPath, tmpDir, ccMap, vtMap, repoIdentity) {
  const src = readFileSync(mdPath, 'utf-8');
  const title = _extractTitle(src);
  const meta = _extractMeta(src);
  const rid = repoIdentity || {};
  if (meta.app_name === '\u2014' && rid.repo_name) {
    meta.app_name = _prettifyRepoName(rid.repo_name);
  }
  const colour = rid.colour || '#003366';
  const repoNameRaw = rid.repo_name || '';
  const branch = rid.branch || '';
  const sha = rid.sha || '';
  const repoStrip = repoNameRaw ? `<div class="repo-strip" style="background:${colour};"></div>` : '';
  const repoBadge = repoNameRaw ? `<span class="repo-badge" style="background:${colour};">${_esc(repoNameRaw)}</span>` : '';
  const branchShaLine = (branch && sha) ? `    <div>${_esc(branch)} &middot; ${_esc(sha)}</div>\n` : '';

  let bodyMd = src.replace(/^#\s+.+$\n?/m, '');
  const [processedMd, mermaidBlocks] = _extractMermaidBlocks(bodyMd);

  let bodyHtml = marked.parse(processedMd);

  let needsCdn = Object.keys(mermaidBlocks).length > 0 && !_mmdcAvailable();
  for (const [idx, [key, source]] of Object.entries(Object.entries(mermaidBlocks))) {
    bodyHtml = bodyHtml.replace(key, _renderMermaid(source, parseInt(idx), tmpDir));
  }

  // Post-process pipeline
  bodyHtml = _injectBadgesInTables(bodyHtml);
  bodyHtml = _injectDrScoreBars(bodyHtml);
  bodyHtml = _injectCoverageBars(bodyHtml);
  bodyHtml = _injectTestBadges(bodyHtml);
  bodyHtml = _injectDreadBars(bodyHtml);
  bodyHtml = _injectAttckHeatmap(bodyHtml);
  bodyHtml = _colorTableRows(bodyHtml);
  bodyHtml = _wrapH2Sections(bodyHtml);
  bodyHtml = _wrapFindingCards(bodyHtml);
  bodyHtml = _injectShowFix(bodyHtml, ccMap || {});
  bodyHtml = _injectVerificationBlocks(bodyHtml, vtMap || {});
  bodyHtml = _renderRedactedChips(bodyHtml);
  bodyHtml = _injectTestSummaryBar(bodyHtml);
  bodyHtml = _injectStrideChart(bodyHtml);
  bodyHtml = _injectAsvsCharts(bodyHtml);
  bodyHtml = _injectCasDomainChart(bodyHtml);
  bodyHtml = _injectDrRadar(bodyHtml);
  bodyHtml = _injectBadgesInProse(bodyHtml);
  bodyHtml = _annotateChipSourceTables(bodyHtml);

  const severityBar = _buildSeverityBar(bodyHtml);
  const tocLinks = _buildSidebar(bodyHtml);
  let sidebarNav = '';
  if (tocLinks) {
    sidebarNav = '<nav class="toc-sidebar"><span class="toc-header">Contents</span>' + tocLinks + '</nav>\n';
  }

  let mermaidScripts = '';
  if (needsCdn) {
    mermaidScripts =
      '<script type="module">\n' +
      'import mermaid from "https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.esm.min.mjs";\n' +
      'mermaid.initialize({startOnLoad:true,theme:"neutral",securityLevel:"loose"});\n' +
      '</script>\n';
  }

  const page = _pageTemplate({
    title: _esc(title),
    css: _CSS,
    app_name: _esc(meta.app_name),
    gen_date: meta.gen_date,
    classification: _esc(meta.classification),
    repo_strip: repoStrip,
    repo_badge: repoBadge,
    branch_sha_line: branchShaLine,
    body: bodyHtml,
    severity_bar: severityBar,
    sidebar_nav: sidebarNav,
    mermaid_scripts: mermaidScripts,
  });

  const outPath = mdPath.replace(/\.md$/, '.html');
  writeFileSync(outPath, page, 'utf-8');
  console.log(`  OK  ${path.basename(outPath)}`);
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------
function main() {
  const args = process.argv.slice(2);
  let repoRoot = '.';
  let singleFile = null;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--repo-root' && i + 1 < args.length) {
      repoRoot = args[++i];
    } else if (args[i] === '--file' && i + 1 < args.length) {
      singleFile = args[++i];
    }
  }

  const repo = path.resolve(repoRoot);
  const reportsDir = path.join(repo, '.ai', 'blueteam', 'reports');

  if (!existsSync(reportsDir)) {
    process.stderr.write(`ERROR: ${reportsDir} does not exist.\n`);
    process.exit(1);
  }

  let files;
  if (singleFile) {
    files = [path.resolve(singleFile)];
  } else {
    files = readdirSync(reportsDir)
      .filter(f => f.endsWith('.md') && f !== 'security_overview.md')
      .sort()
      .map(f => path.join(reportsDir, f));
  }

  if (!files.length) {
    console.log('No .md files found to convert.');
    return;
  }

  const rid = _repoIdentity(repo);
  console.log(`  Repo: ${rid.repo_name}  branch: ${rid.branch || '\u2014'}  sha: ${rid.sha || '\u2014'}`);

  const ccMap = _loadCodeChanges(repo);
  if (Object.keys(ccMap).length) {
    console.log(`  Loaded ${Object.keys(ccMap).length} code change(s) from code_changes.json \u2014 Show fix enabled`);
  } else {
    console.log('  code_changes.json not found \u2014 Show fix blocks will be skipped');
  }

  const vtMap = _loadVerificationTests(repo);
  if (Object.keys(vtMap).length) {
    console.log(`  Loaded verification tests for ${Object.keys(vtMap).length} finding id(s)`);
  } else {
    console.log('  verification_tests.json not found \u2014 Verification blocks will be skipped');
  }

  const tmpDir = path.join(os.tmpdir(), `security-report-html-${process.pid}`);
  mkdirSync(tmpDir, { recursive: true });

  let ok = 0;
  let errors = 0;
  for (const mdFile of files) {
    if (!existsSync(mdFile)) {
      console.log(`  SKIP  ${mdFile} (not found)`);
      continue;
    }
    try {
      convert(mdFile, tmpDir, ccMap, vtMap, rid);
      ok++;
    } catch (exc) {
      console.log(`  ERROR  ${path.basename(mdFile)}: ${exc.message}`);
      errors++;
    }
  }
  console.log(`\nDone. ${ok} converted, ${errors} error(s).`);
}

main();
