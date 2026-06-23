#!/usr/bin/env node
/**
 * generate_overview_html.js — Security Assessment Overview HTML Generator
 *
 * Reads all .ai/blueteam/data/*.json artifacts produced by BlueTeam security assessment
 * skills and generates .ai/blueteam/reports/security_overview.html — a multi-tab
 * single-page application (SPA) covering:
 *
 *   Dashboard · Remediation Plan · Common Issues · Attack Chains ·
 *   Threat Model · ASVS · Compliance · Resiliency & DR · Tool Scans
 *
 * Usage (run from the repository root, or use --repo-root):
 *     node <path>/scripts/generate_overview_html.js
 *     node <path>/scripts/generate_overview_html.js --repo-root /path/to/repo
 *
 * Dependencies: Node.js standard library only (no third-party packages required).
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ---------------------------------------------------------------------------
// HTML escaping helper
// ---------------------------------------------------------------------------
function _h(s) {
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
  return repoName.replace(/_/g, '-').split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
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
// Data loading
// ---------------------------------------------------------------------------
function _loadJson(fp) {
  if (!existsSync(fp)) return null;
  try {
    return JSON.parse(readFileSync(fp, 'utf-8'));
  } catch (exc) {
    console.log(`  WARN  Could not parse ${path.basename(fp)}: ${exc.message}`);
    return null;
  }
}

function _loadYamlAppname(fp) {
  if (!existsSync(fp)) return '\u2014';
  const text = readFileSync(fp, 'utf-8');
  for (const line of text.split('\n')) {
    const stripped = line.trim();
    if (stripped.toLowerCase().startsWith('application:')) {
      return stripped.split(':').slice(1).join(':').trim().replace(/^["']|["']$/g, '');
    }
  }
  return '\u2014';
}

function _loadYamlClassification(fp) {
  if (!existsSync(fp)) return ['', ''];
  const FIELDS = [
    'overall_classification', 'system_classification',
    'security_classification', 'classification', 'sensitivity_classification',
  ];
  const text = readFileSync(fp, 'utf-8');
  for (const line of text.split('\n')) {
    const stripped = line.trim();
    for (const field of FIELDS) {
      if (stripped.toLowerCase().startsWith(field + ':')) {
        const val = stripped.split(':').slice(1).join(':').trim().replace(/^["']|["']$/g, '').toLowerCase();
        if (val.includes('public')) return ['public', 'Public'];
        if (val.includes('protected_c') || val.includes('protected c') || val === 'c') return ['c', 'Protected C'];
        if (val.includes('protected_b') || val.includes('protected b') || val === 'b') return ['b', 'Protected B'];
        if (val.includes('protected_a') || val.includes('protected a') || val === 'a') return ['a', 'Protected A'];
      }
    }
  }
  return ['', ''];
}

function _loadYamlClassStores(fp) {
  if (!existsSync(fp)) return [];
  const text = readFileSync(fp, 'utf-8');
  const m = text.match(/^data_stores:\n(.*?)^(?:data_elements:|security_recommendations:)/ms);
  if (!m) return [];
  const block = m[1];
  const stores = [];
  const chunks = block.split(/(?=^\s{2}-\s+name:)/m);
  for (const chunk of chunks) {
    const trimmed = chunk.trim();
    if (!trimmed || !trimmed.startsWith('-')) continue;
    const nameM = trimmed.match(/^-\s+name:\s+"?([^"\n]+)"?/m);
    const clsM = trimmed.match(/sensitivity_classification:\s+"?([^"\n]+)"?/);
    const typeM = trimmed.match(/type:\s+"?([^"\n]+)"?/);
    const descM = trimmed.match(/description:\s*>\s*\n((?:[ \t]+\S[^\n]*\n?)+)/);
    const name = nameM ? nameM[1].trim() : '';
    const cls = clsM ? clsM[1].trim() : '';
    const type_ = typeM ? typeM[1].trim() : '';
    let desc = '';
    if (descM) {
      desc = descM[1].split('\n').map(ln => ln.trim()).filter(Boolean).join(' ');
      if (desc.length > 120) {
        const end = desc.indexOf('. ', 80);
        desc = end > 0 ? desc.slice(0, end + 1) : desc.slice(0, 120) + '\u2026';
      }
    }
    if (name) stores.push({ name, classification: cls, type: type_, description: desc });
  }
  return stores;
}

function _readUtStats(reportsDir) {
  const mdPath = path.join(reportsDir, 'security_unit_test_coverage.md');
  if (!existsSync(mdPath)) return null;
  let text;
  try { text = readFileSync(mdPath, 'utf-8'); } catch { return null; }
  const m = text.match(
    /\|\s*\*{0,2}Controls Covered\*{0,2}\s*\|\s*(\d+)\s*\/\s*(\d+)\s*\((\d+)%\)\s*\|\s*(\d+)\s*\/\s*(\d+)\s*\((\d+)%\)/
  );
  if (!m) return null;
  const preCovered = parseInt(m[1]);
  const inScope = parseInt(m[2]);
  const prePct = parseInt(m[3]);
  const postCovered = parseInt(m[4]);
  const postPct = parseInt(m[6]);
  const m2 = text.match(/(\d+)\s+infrastructure-only/);
  const infraExcluded = m2 ? parseInt(m2[1]) : 0;
  const m3 = text.match(/\|\s*\*{0,2}Security Tests\*{0,2}\s*\|\s*(\d+)\s+pre-existing\s*\|\s*\+(\d+)\s+tests/);
  const preTests = m3 ? parseInt(m3[1]) : 0;
  const newTests = m3 ? parseInt(m3[2]) : 0;
  const stacks = [];
  const psM = text.match(/\*\*Per Stack:\*\*(.*?)(?:\n---|\Z)/s);
  if (psM) {
    const smRe = /\|\s*([A-Za-z][^|]*?)\s*\|\s*(\d+)\s*\|[^|]*?\((\d+)%\)[^|]*?\|[^|]*?\((\d+)%\)/g;
    let sm;
    while ((sm = smRe.exec(psM[1])) !== null) {
      stacks.push({ name: sm[1].trim(), in_scope: parseInt(sm[2]), pre_pct: parseInt(sm[3]), post_pct: parseInt(sm[4]), run_status: null });
    }
  }
  const execM = text.match(/## Executive Summary(.*?)(?:^##|\Z)/ms);
  if (execM) {
    const runMap = {};
    const rmRe = /\|\s*([A-Za-z][^|*]+?)\s*\|(?:[^|]*\|){5}\s*(PASS|FAIL|NOT RUN)\b/g;
    let rm;
    while ((rm = rmRe.exec(execM[1])) !== null) {
      runMap[rm[1].trim().toLowerCase().split(/\s/)[0]] = rm[2].trim();
    }
    for (const s of stacks) {
      s.run_status = runMap[s.name.toLowerCase().split(/\s/)[0]] || '\u2014';
    }
  }
  return { pre_pct: prePct, post_pct: postPct, in_scope: inScope, infra_excluded: infraExcluded, pre_covered: preCovered, post_covered: postCovered, pre_tests: preTests, new_tests: newTests, stacks };
}

function loadArtifacts(dataDir) {
  const aiDir = path.dirname(dataDir);
  return {
    cc: _loadJson(path.join(dataDir, 'code_changes.json')),
    sr: _loadJson(path.join(dataDir, 'security_requirements.json')),
    vt: _loadJson(path.join(dataDir, 'verification_tests.json')),
    kc: _loadJson(path.join(dataDir, 'kill_chains.json')),
    dr: _loadJson(path.join(dataDir, 'dr_resilience_assessment.json')),
    scans: _loadJson(path.join(dataDir, 'security-scan-results.json')),
    app_name: _loadYamlAppname(path.join(aiDir, 'data', 'security-classification.yaml')),
    class_stores: _loadYamlClassStores(path.join(aiDir, 'data', 'security-classification-details.yaml')),
    topology: _loadJson(path.join(dataDir, 'app_topology.json')),
    classification: _loadYamlClassification(path.join(dataDir, 'security-classification.yaml')),
    ra: _loadJson(path.join(dataDir, 'risk_acceptances.json')),
    sa: _loadJson(path.join(dataDir, 'security_architecture.json')),
  };
}

// ---------------------------------------------------------------------------
// Statistics and verdicts
// ---------------------------------------------------------------------------
const _SEV_ORDER = { critical: 0, high: 1, medium: 2, low: 3, info: 4 };
const _PRI_ORDER = { critical: 0, high: 1, medium: 2, low: 3 };
const _P_SCALE_MAP = { p0: 'critical', p1: 'high', p2: 'medium', p3: 'low' };

function _normSev(val) {
  const v = String(val).toLowerCase().trim();
  return _P_SCALE_MAP[v] || v;
}

function _countBySev(items, field = 'priority') {
  const c = { critical: 0, high: 0, medium: 0, low: 0 };
  for (const item of items) {
    const val = item[field] || item.severity || item.priority || '';
    const k = _normSev(val);
    if (k in c) c[k]++;
  }
  return c;
}

function _multiSource(item) {
  const srcs = new Set((item.sources || []).map(s => s.assessment || ''));
  return srcs.size >= 2;
}

function _buildKcIndexes(kcItems) {
  const elevationMap = {};
  const participationMap = {};
  for (const chain of kcItems) {
    const kid = chain.id || '';
    // Canonical field: participating_code_change_ids. Tolerant fallback: walk
    // attack_path[].finding_refs[] AND chain_breaking_fix.cc_id AND
    // priority_elevations[].artifact_id for any CC-NNN ids. Older agent
    // outputs embedded these in narrative rather than a flat index.
    let ccIds = chain.participating_code_change_ids;
    if (!Array.isArray(ccIds) || ccIds.length === 0) {
      const set = new Set();
      for (const step of (chain.attack_path || [])) {
        for (const ref of (step.finding_refs || [])) {
          if (ref.finding_id && ref.finding_id.startsWith('CC-')) set.add(ref.finding_id);
        }
      }
      if (chain.chain_breaking_fix?.cc_id) set.add(chain.chain_breaking_fix.cc_id);
      for (const elev of (chain.priority_elevations || [])) {
        if (elev.artifact_id && elev.artifact_id.startsWith('CC-')) set.add(elev.artifact_id);
      }
      ccIds = [...set].sort();
    }
    for (const ccId of ccIds) {
      if (!participationMap[ccId]) participationMap[ccId] = [];
      participationMap[ccId].push(kid);
    }
    for (const elev of (chain.priority_elevations || [])) {
      const aid = elev.artifact_id || '';
      if (!aid) continue;
      if (!elevationMap[aid]) {
        elevationMap[aid] = { elevated_from: elev.previous_priority || '', elevated_to: elev.elevated_to || '', chain_ids: [] };
      }
      elevationMap[aid].chain_ids.push(kid);
    }
  }
  return [elevationMap, participationMap];
}

function computeStats(art) {
  const ccRaw = art.cc || {};
  const ccItems = ccRaw.changes || ccRaw.entries || ccRaw.items || [];
  const srRaw = art.sr || {};
  const srItems = srRaw.requirements || srRaw.entries || srRaw.items || [];
  const vtItems = (art.vt || {}).tests || (art.vt || {}).items || [];
  // Top-level key: canonical is `chains`. Tolerant fallback: `kill_chains`
  // (some agents name it after the file). Empty array if neither present.
  const kcItems = (art.kc || {}).chains || (art.kc || {}).kill_chains || [];
  const drGaps = (art.dr || {}).gaps || [];
  const scanFinds = (art.scans || {}).findings || [];

  const ccCounts = _countBySev(ccItems);
  const srCounts = _countBySev(srItems);
  const kcSev = _countBySev(kcItems, 'severity');
  const drCounts = _countBySev(drGaps, 'severity');
  const scanCounts = _countBySev(scanFinds, 'severity');

  const assessmentsRun = new Set();
  for (const src of [art.cc || {}, art.sr || {}]) {
    for (const a of (src.generated_by_assessments || [])) assessmentsRun.add(a);
  }
  if (art.kc) assessmentsRun.add('kill_chain_aggregator');
  if (art.dr) assessmentsRun.add('dr_resilience_analysis');
  if (art.scans) assessmentsRun.add('cybersecurity_tool_use');
  if (art.vt) for (const a of ((art.vt || {}).generated_by_assessments || [])) assessmentsRun.add(a);

  const vtCounts = { 'not-tested': 0, passed: 0, failed: 0, 'not-applicable': 0 };
  for (const t of vtItems) {
    let status = String(t.validation_status || 'not-tested').trim().toLowerCase().replace(/_/g, '-');
    if (!(status in vtCounts)) status = 'not-tested';
    vtCounts[status]++;
  }

  const commonCc = ccItems.filter(i => _multiSource(i));
  const commonSr = srItems.filter(i => _multiSource(i));
  const [elevationMap, participationMap] = _buildKcIndexes(kcItems);

  function _ccSortKey(item) {
    const cid = item.id || '';
    const chainCount = (participationMap[cid] || []).length;
    const multi = _multiSource(item) ? 1 : 0;
    const sev = _PRI_ORDER[_normSev(item.priority || item.severity || 'low')] ?? 99;
    return [-chainCount, -multi, sev, cid];
  }
  const sortedCc = [...ccItems].sort((a, b) => {
    const ka = _ccSortKey(a);
    const kb = _ccSortKey(b);
    for (let i = 0; i < ka.length; i++) {
      if (ka[i] < kb[i]) return -1;
      if (ka[i] > kb[i]) return 1;
    }
    return 0;
  });
  const ccPriorityOrder = {};
  sortedCc.forEach((item, idx) => { ccPriorityOrder[item.id] = idx + 1; });

  return {
    cc_items: ccItems, sr_items: srItems, kc_items: kcItems,
    dr_gaps: drGaps, dr_recs: (art.dr || {}).recommendations || [],
    scan_finds: scanFinds, vt_items: vtItems,
    cc_counts: ccCounts, sr_counts: srCounts, kc_sev: kcSev,
    dr_counts: drCounts, scan_counts: scanCounts, vt_counts: vtCounts,
    assessments_run: assessmentsRun,
    common_cc: commonCc, common_sr: commonSr,
    total_cc: ccItems.length, total_sr: srItems.length,
    total_kc: kcItems.length, total_dr: drGaps.length,
    total_scans: scanFinds.length, total_vtests: vtItems.length,
    dr_score: (art.dr || {}).overall_score ?? null,
    dr_rating: (art.dr || {}).overall_rating ?? null,
    dr_dims: (art.dr || {}).dimensions || [],
    elevation_map: elevationMap, participation_map: participationMap,
    cc_priority_order: ccPriorityOrder,
    class_stores: art.class_stores || [],
    topology: art.topology || null,
  };
}

function computeVerdicts(st, art) {
  const cc = st.cc_items;
  const sr = st.sr_items;
  const allFindings = [...cc, ...sr];

  function maxPri(items) {
    if (!items.length) return null;
    let best = null;
    let bestRank = 99;
    for (const i of items) {
      const v = _normSev(i.priority || i.severity || 'low');
      const rank = _PRI_ORDER[v] ?? 99;
      if (rank < bestRank) { bestRank = rank; best = v; }
    }
    return best;
  }

  let mp = maxPri(allFindings);
  if (!mp) {
    for (const s of ['critical', 'high', 'medium', 'low']) {
      if ((st.scan_counts[s] || 0) > 0) { mp = s; break; }
    }
  }
  const overallRisk = (mp || 'informational').charAt(0).toUpperCase() + (mp || 'informational').slice(1);

  const hasSecret = st.scan_finds.some(f => f.type === 'secret');
  const hasCritScan = st.scan_counts.critical > 0;
  const hasAuthBypass = allFindings.some(i => {
    if (_normSev(i.priority || i.severity || '') !== 'critical') return false;
    const text = ((i.title || '') + ' ' + (i.description || '')).toLowerCase();
    return ['unauthenticated', 'no authentication', 'authentication bypass', 'without credentials', 'jwt bypass', 'skip auth'].some(kw => text.includes(kw));
  });
  const kcItems = st.kc_items;
  const firstTacticInit = kcItems.some(kc => {
    const ap = kc.attack_path || [];
    if (!ap.length) return false;
    const first = ap[0];
    const tactic = String(first.att_ck_tactic || first.tactic || '');
    return tactic.startsWith('TA0001') && kc.severity === 'critical';
  });

  let exploit;
  if (hasSecret || hasCritScan || hasAuthBypass || firstTacticInit) {
    exploit = 'trivially_exploitable';
  } else if (kcItems.some(kc => ['critical', 'high'].includes(kc.severity))) {
    exploit = 'readily_exploitable';
  } else if (kcItems.length || allFindings.some(i => ['critical', 'high'].includes(_normSev(i.priority || i.severity || '')))) {
    exploit = 'capability_required';
  } else {
    exploit = 'advanced_capability_required';
  }

  const exploitLabels = {
    trivially_exploitable: ['Trivially Exploitable', 'sb-critical', '&#9888;'],
    readily_exploitable: ['Readily Exploitable', 'sb-high', '&#9888;'],
    capability_required: ['Capability Required', 'sb-medium', '&#9679;'],
    advanced_capability_required: ['Advanced Capability Required', 'sb-pass', '&#10003;'],
  };
  const [exploitLabel, exploitCss, exploitIcon] = exploitLabels[exploit];

  function asvsVerdict() {
    if (!st.assessments_run.has('asvs_level2_security_assessment')) return ['Not Assessed', 'sb-info'];
    const items = allFindings.filter(i => (i.sources || []).some(s => s.assessment === 'asvs_level2_security_assessment'));
    if (!items.length) return ['Pass', 'sb-pass'];
    const mp2 = maxPri(items);
    return ['critical', 'high'].includes(mp2) ? ['Fail', 'sb-critical'] : ['Conditional Pass', 'sb-medium'];
  }
  function tmVerdict() {
    if (!st.assessments_run.has('threat_model')) return ['Not Assessed', 'sb-info'];
    const items = allFindings.filter(i => (i.sources || []).some(s => s.assessment === 'threat_model'));
    if (!items.length) return ['No Active Threats', 'sb-pass'];
    const mp2 = maxPri(items);
    if (mp2 === 'critical') return ['Critical Exposure', 'sb-critical'];
    if (mp2 === 'high') return ['Elevated Exposure', 'sb-high'];
    return ['Manageable Exposure', 'sb-medium'];
  }
  function casVerdict() {
    if (!st.assessments_run.has('cybersecurity_architecture_standard_compliance')) return ['Not Assessed', 'sb-info'];
    const items = allFindings.filter(i => (i.sources || []).some(s => s.assessment === 'cybersecurity_architecture_standard_compliance'));
    if (!items.length) return ['Compliant', 'sb-pass'];
    const mp2 = maxPri(items);
    return ['critical', 'high'].includes(mp2) ? ['Non-Compliant', 'sb-critical'] : ['Conditionally Compliant', 'sb-medium'];
  }
  function kcVerdict() {
    if (!kcItems.length) return [st.assessments_run.has('kill_chain_aggregator') ? 'No Attack Chains' : 'Not Assessed', 'sb-info'];
    if (kcItems.some(kc => kc.severity === 'critical')) return ['Critical Attack Paths Present', 'sb-critical'];
    if (kcItems.some(kc => kc.severity === 'high')) return ['Active Attack Paths', 'sb-high'];
    return ['Limited Attack Paths', 'sb-medium'];
  }
  function drVerdict() {
    if (!art.dr) return ['Not Assessed', 'sb-info'];
    const score = st.dr_score || 0;
    if (st.dr_gaps.some(g => g.severity === 'critical') || score < 30) return ['Resilience Critical', 'sb-critical'];
    if (st.dr_gaps.some(g => g.severity === 'high') || score < 50) return ['Resilience At Risk', 'sb-high'];
    if (score < 85) return ['Resilience Needs Improvement', 'sb-medium'];
    return ['Resilience Mature', 'sb-pass'];
  }
  function scanVerdict() {
    if (!art.scans) return ['Not Assessed', 'sb-info'];
    if (st.scan_counts.critical > 0) return ['Critically Exposed', 'sb-critical'];
    if (st.scan_counts.high > 0 || st.scan_finds.some(f => f.type === 'secret')) return ['Vulnerable', 'sb-high'];
    if (st.scan_counts.medium > 0 || st.scan_counts.low > 0) return ['Low Exposure', 'sb-medium'];
    return ['Clean', 'sb-pass'];
  }
  function saVerdict() {
    const sa = art.sa;
    if (!sa) return ['Not Assessed', 'sb-info'];
    const openGaps = (sa.gaps || []).filter(g => (g.status || 'open') !== 'risk_accepted');
    if (!openGaps.length) return ['Aligned', 'sb-pass'];
    const sevs = new Set(openGaps.map(g => g.severity || 'Low'));
    if (sevs.has('Critical')) return ['Critical Gaps', 'sb-critical'];
    if (sevs.has('High')) return ['High-Severity Gaps', 'sb-high'];
    return ['Gaps Identified', 'sb-medium'];
  }

  return {
    overall_risk: overallRisk, exploit, exploit_label: exploitLabel,
    exploit_css: exploitCss, exploit_icon: exploitIcon,
    asvs: asvsVerdict(), tm: tmVerdict(), cas: casVerdict(),
    kc: kcVerdict(), dr: drVerdict(), scans: scanVerdict(), sa: saVerdict(),
  };
}

// ---------------------------------------------------------------------------
// HTML helpers
// ---------------------------------------------------------------------------
const _SEV_CSS = { critical: 'critical', high: 'high', medium: 'medium', low: 'low', info: 'low' };
const _PRI_CSS = { critical: 'critical', high: 'high', medium: 'medium', low: 'low' };
const _ASSESS_SHORT = {
  threat_model: 'TM', asvs_level2_security_assessment: 'ASVS',
  cybersecurity_architecture_standard_compliance: 'CAS',
  dr_resilience_analysis: 'DR', kill_chain_aggregator: 'KC',
};
const _SB_TO_BADGE = {
  'sb-critical': 'critical', 'sb-high': 'high', 'sb-medium': 'medium',
  'sb-pass': 'pass', 'sb-info': 'assumed',
};
const _ASSESSMENT_DESCRIPTIONS = {
  threat_model: 'STRIDE/DREAD analysis of attacker capabilities, trust boundaries, and data-at-risk.',
  asvs_level2_security_assessment: 'OWASP Application Security Verification Standard (ASVS) Level 2 \u2014 application-layer security controls for systems handling sensitive data.',
  cybersecurity_architecture_standard_compliance: 'Cybersecurity Architecture Standard (CAS) \u2014 mandatory policy conformance for all applications.',
};

function badge(text, css) {
  if (!css) css = _SEV_CSS[text.toLowerCase()] || 'low';
  const t = text.charAt(0).toUpperCase() + text.slice(1).toLowerCase();
  return `<span class="badge badge-${css}">${_h(t)}</span>`;
}

function verdictBanner(text, css, detail) {
  const icon = css.includes('critical') ? '&#9888;' : (css.includes('pass') ? '&#10003;' : '&#9679;');
  return (
    `<div class="status-banner ${css}"><div class="sb-icon">${icon}</div><div class="sb-body">` +
    `<div class="sb-title">${_h(text)}</div>` +
    (detail ? `<div class="sb-detail">${detail}</div>` : '') +
    '</div></div>'
  );
}

function filterBar(containerId, types) {
  const sevs = ['Critical', 'High', 'Medium', 'Low'];
  const btns = sevs.map(s =>
    `<button class="filter-btn" onclick="filterSev('${containerId}','${s.toLowerCase()}')">${badge(s)}</button>`
  ).join(' ');
  const reset = `<button class="filter-btn" onclick="filterSev('${containerId}','all')">Show All</button>`;
  let typeBtns = '';
  if (types && types.length) {
    typeBtns = types.map(t =>
      `<button class="filter-btn" onclick="filterType('${containerId}','${t}')">${_h(t.charAt(0).toUpperCase() + t.slice(1))}</button>`
    ).join(' ');
  }
  return `<div class="filter-bar">${btns} ${reset}` + (typeBtns ? ` &nbsp;|&nbsp; ${typeBtns}` : '') + '</div>';
}

function chip(label, css) {
  return `<span class="chip chip-${css}">${_h(label)}</span>`;
}

function sourceChips(sources) {
  const cssMap = {
    threat_model: 'threat-model', asvs_level2_security_assessment: 'asvs',
    cybersecurity_architecture_standard_compliance: 'cas', dr_resilience_analysis: 'dr',
    'security-scan-results': 'scans',
  };
  const labelsMap = {
    threat_model: 'Threat Model', asvs_level2_security_assessment: 'ASVS',
    cybersecurity_architecture_standard_compliance: 'CAS', dr_resilience_analysis: 'DR',
    'security-scan-results': 'Tool Scans',
  };
  const seen = new Set();
  const result = [];
  for (const s of sources) {
    const a = s.assessment || '';
    if (!seen.has(a)) {
      seen.add(a);
      result.push(chip(labelsMap[a] || a, cssMap[a] || 'unknown'));
    }
  }
  return result.join(' ');
}

function findingCard(item, opts = {}) {
  const { show_sources = true, body_field = 'description', elevation_info, chain_ids, priority_num } = opts;
  const fid = _h(item.id || '');
  const title = _h(item.title || '');
  const pri = (item.priority || item.severity || 'low').toLowerCase();
  const css = _PRI_CSS[pri] || 'low';
  const desc = _h(item[body_field] || item.description || '');
  const srcs = show_sources ? sourceChips(item.sources || []) : '';
  const reqIds = item.related_requirement_ids || [];
  let reqHtml = '';
  if (reqIds.length) {
    const links = reqIds.map(r => `<a href="security_requirements.html#${_h(r)}" class="xref-link">${_h(r)}</a>`).join(' ');
    reqHtml = `<span class="xref-refs">&#128204;&nbsp;${links}</span>`;
  }
  const ccIds = item.related_code_change_ids || [];
  let ccRefHtml = '';
  if (ccIds.length) {
    const links = ccIds.map(c => `<a href="code_changes.html#${_h(c)}" class="xref-link">${_h(c)}</a>`).join(' ');
    ccRefHtml = `<span class="xref-refs">&#128204;&nbsp;${links}</span>`;
  }
  const numHtml = priority_num != null ? `<span class="priority-num">${priority_num}</span>` : '';
  let elevHtml = '';
  if (elevation_info) {
    const chainRefs = (elevation_info.chain_ids || []).map(c => `<span class="kc-link">${_h(c)}</span>`).join(' ');
    const prev = _h((elevation_info.elevated_from || '').charAt(0).toUpperCase() + (elevation_info.elevated_from || '').slice(1));
    elevHtml = `<div class="elevated-badge">&#8679; Elevated from ${prev} &mdash; participates in ${chainRefs}</div>`;
  }
  let chainHtml = '';
  if (chain_ids && chain_ids.length) {
    const refs = chain_ids.map(c => `<span class="kc-link">${_h(c)}</span>`).join(' ');
    chainHtml = `<div class="chain-breaks">Breaks: ${refs}</div>`;
  }
  let fileRefHtml = '';
  const fp = item.file_path || '';
  if (fp) {
    fileRefHtml = `<div class="file-ref"><code>${_h(fp)}</code></div>`;
    const additional = ((item.scope_check || {}).additional_paths_to_verify || []).slice(0, 4);
    if (additional.length) {
      fileRefHtml += `<div class="file-ref-extra">Also check: ${additional.map(p => `<code>${_h(p)}</code>`).join(' ')}</div>`;
    }
  }
  let currHtml = '';
  if (item.current_code_summary) {
    currHtml = `<details class="finding-detail"><summary>&#9654; Current code</summary><pre><code>${_h(item.current_code_summary)}</code></pre></details>`;
  }
  let codeHtml = '';
  if (item.replacement_code) {
    codeHtml = `<details class="finding-detail"><summary>&#9654; Show fix</summary><pre><code>${_h(item.replacement_code)}</code></pre></details>`;
  }
  let critHtml = '';
  const criteria = item.acceptance_criteria || [];
  if (criteria.length) {
    critHtml = `<details class="finding-detail"><summary>&#9654; Acceptance criteria (${criteria.length})</summary><ul>${criteria.map(c => `<li>${_h(c)}</li>`).join('')}</ul></details>`;
  }
  return (
    `<div class="finding-card ${css}" data-sev="${css}" id="${fid}">` +
    `${numHtml}<strong>${fid}</strong> ${badge(pri.charAt(0).toUpperCase() + pri.slice(1), css)} ${srcs}` +
    (reqHtml ? ` ${reqHtml}` : '') + (ccRefHtml ? ` ${ccRefHtml}` : '') +
    `<br><strong>${title}</strong>` + fileRefHtml +
    (desc ? `<p style="margin-top:6px">${desc}</p>` : '') +
    elevHtml + chainHtml + currHtml + codeHtml + critHtml + '</div>'
  );
}

function scanCard(item) {
  const fid = _h(item.id || '');
  const sev = (item.severity || 'LOW').toUpperCase();
  const css = _SEV_CSS[sev.toLowerCase()] || 'low';
  const title = _h(item.title || '');
  const comp = _h(item.component || item.file || '');
  const cvss = item.cvss || item.cvss_score;
  const ftype = _h((item.type || 'vulnerability').replace(/-/g, '\u2011'));
  const rawSources = item.sources || [];
  const tools = rawSources.map(s => _h(typeof s === 'string' ? s : (s.tool || ''))).join(', ');
  const cvssStr = cvss ? ` &nbsp; CVSS ${cvss}` : '';
  return (
    `<div class="finding-card ${css}" data-sev="${css}" data-type="${item.type || 'vulnerability'}">` +
    `<strong>${fid}</strong> ${badge(sev.charAt(0) + sev.slice(1).toLowerCase(), css)} ` +
    `<span class="badge badge-assumed">${ftype}</span>` +
    `<br><strong>${title}</strong>` +
    (comp ? `<br><code>${comp}</code>` : '') +
    `<br><small style="color:#6c757d">${tools}${cvssStr}</small></div>`
  );
}

function kcCard(kc) {
  const kid = _h(kc.id || '');
  const sev = (kc.severity || 'high').toLowerCase();
  const css = _SEV_CSS[sev] || 'high';
  const title = _h(kc.title || '');
  const scope = kc.scope || '';
  const scopeLabel = scope === 'cross_domain' ? 'Cross-Domain' : 'Single Assessment';
  const steps = kc.attack_path || [];
  const fix = kc.chain_breaking_fix || {};
  const fixText = _h(fix.description || '');
  const fixCcs = (fix.related_code_change_ids || []).join(', ');
  let stepsHtml = '';
  for (const s of steps) {
    const tactic = _h(s.att_ck_tactic || s.tactic || '');
    const action = _h(s.attacker_action || s.description || '');
    const stepN = s.step || '';
    stepsHtml += `<div class="kc-step"><span class="kc-step-num">${stepN}</span><div><strong style="color:#6c757d;font-size:11px">${tactic}</strong><br>${action}</div></div>`;
  }
  const aiVariant = (kc.ai_enabled_variant || '').trim();
  let aiHtml = '';
  if (aiVariant && aiVariant.toUpperCase() !== 'N/A') {
    aiHtml = `<details class="finding-detail" style="margin-top:8px"><summary>&#9654; AI-enabled attack variant</summary><p style="font-size:12px;color:#555;margin-top:6px">${_h(aiVariant)}</p></details>`;
  }
  return (
    `<div class="kc-card ${css}"><div class="kc-header"><strong>${kid}</strong> ${badge(sev.charAt(0).toUpperCase() + sev.slice(1), css)} ` +
    `<span class="badge badge-assumed">${scopeLabel}</span><br><strong style="font-size:15px">${title}</strong></div>` +
    `<div class="kc-steps">${stepsHtml}</div>` +
    (fixText ? `<div class="kc-fix"><strong>Chain Breaker:</strong> ${fixText}` + (fixCcs ? ` <code style="font-size:11px">${_h(fixCcs)}</code>` : '') + '</div>' : '') +
    aiHtml + '</div>'
  );
}

function drBar(label, score, maxScore) {
  const pct = maxScore ? Math.round(score / maxScore * 100) : 0;
  const color = pct < 30 ? '#c0392b' : pct < 50 ? '#d35400' : pct < 75 ? '#c4960b' : '#1e8449';
  return (
    `<div style="margin:8px 0"><div style="display:flex;justify-content:space-between;font-size:13px">` +
    `<span>${_h(label.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()))}</span>` +
    `<span>${score}/${maxScore}</span></div>` +
    `<div style="background:#dee2e6;border-radius:3px;height:10px;margin-top:3px">` +
    `<div style="background:${color};width:${pct}%;height:10px;border-radius:3px"></div></div></div>`
  );
}

// ---------------------------------------------------------------------------
// Chart helpers (overview-specific)
// ---------------------------------------------------------------------------
const _TACTIC_ORDER = [
  'TA0001', 'TA0002', 'TA0003', 'TA0004', 'TA0005',
  'TA0006', 'TA0007', 'TA0008', 'TA0009', 'TA0010',
  'TA0011', 'TA0040', 'TA0042', 'TA0043',
];
const _SEV_TACTIC_CSS = { critical: 'tactic-critical', high: 'tactic-high', medium: 'tactic-medium', low: 'tactic-low' };

function _buildKcTacticGrid(kcItems) {
  if (!kcItems.length) return '';
  const tacticMap = {};
  for (const chain of kcItems) {
    const chainSev = (chain.severity || 'low').toLowerCase();
    for (const step of (chain.attack_path || [])) {
      const raw = (step.att_ck_tactic || step.tactic || '').trim();
      if (!raw) continue;
      const parts = raw.split(' ', 2);
      const tid = parts[0].startsWith('TA') ? parts[0] : '';
      const name = parts.length > 1 ? parts[1] : parts[0];
      const key = tid || name;
      if (!tacticMap[key]) tacticMap[key] = { name, tid, max_sev: chainSev, count: 0 };
      else if ((_SEV_ORDER[chainSev] ?? 4) < (_SEV_ORDER[tacticMap[key].max_sev] ?? 4)) tacticMap[key].max_sev = chainSev;
      tacticMap[key].count++;
    }
  }
  if (!Object.keys(tacticMap).length) return '';
  const sortedKeys = Object.keys(tacticMap).sort((a, b) => {
    const ai = _TACTIC_ORDER.indexOf(tacticMap[a].tid);
    const bi = _TACTIC_ORDER.indexOf(tacticMap[b].tid);
    return (ai >= 0 ? ai : 99) - (bi >= 0 ? bi : 99) || a.localeCompare(b);
  });
  let cells = '';
  for (const key of sortedKeys) {
    const t = tacticMap[key];
    const css = _SEV_TACTIC_CSS[t.max_sev] || 'tactic-low';
    const tidHtml = t.tid ? `<span style="font-weight:700;font-size:11px">${_h(t.tid)}</span> ` : '';
    cells += `<div class="tactic-cell ${css}">${tidHtml}${_h(t.name)}<br><span style="font-size:10px;opacity:.75">${t.count} chain step${t.count !== 1 ? 's' : ''}</span></div>`;
  }
  return (
    '<div class="context-panel tactic-grid-box"><div class="context-panel-title tactic-grid-title">Tactics Active in Kill Chains</div>' +
    `<div class="tactic-grid">${cells}</div>` +
    '<p class="tactic-grid-note">Cells show ATT&amp;CK tactics referenced in kill chain steps, coloured by the highest-severity chain that uses each tactic. This is not a full coverage assessment \u2014 see the Attack Chains report for explicitly assessed coverage gaps (e.g.\u00a0TA0007, TA0008).</p></div>'
  );
}

function _buildDataClassificationTable(stores) {
  if (!stores || !stores.length) return '';
  const clsColor = { 'protected b': 'var(--high)', 'protected a': 'var(--medium)' };
  let rows = '';
  for (const s of stores) {
    const cls = s.classification || '';
    const color = clsColor[cls.toLowerCase()] || 'var(--assumed)';
    rows += `<tr><td><strong>${_h(s.name)}</strong>` +
      (s.type ? `<br><span style="font-size:11px;color:#888">${_h(s.type)}</span>` : '') +
      `</td><td><span style="font-weight:600;color:${color}">${_h(cls)}</span></td>` +
      `<td style="font-size:12px;color:#555">${_h(s.description || '')}</td></tr>`;
  }
  return (
    '<div class="context-panel data-class-box"><div class="context-panel-title data-class-title">Application Decomposition \u2014 Protected Data Stores</div>' +
    '<table class="data-class-table"><thead><tr><th>Data Store</th><th>Classification</th><th>Contains</th></tr></thead>' +
    `<tbody>${rows}</tbody></table>` +
    '<p class="data-class-note">Identity provider: Keycloak realm (CCDS) \u2014 Protected A (user accounts &amp; roles). Full application component diagram (auth-api, finrep-api, sc-api, Azure Functions) is in the detailed Threat Model report.</p></div>'
  );
}

function _buildDfdSvg(ccItems, topology, detail = false) {
  if (!topology) return '';
  const zonesCfg = topology.zones || [];
  const compsCfg = topology.components || [];
  const connsCfg = topology.connections || [];
  const W = topology.canvas_width || 660;
  const frags = {};
  for (const c of compsCfg) if (c.cc_path_fragment) frags[c.id] = c.cc_path_fragment;
  const rank = { critical: 0, high: 1, medium: 2, low: 3, pass: 99 };
  const compSt = {};
  for (const c of compsCfg) compSt[c.id] = c.status || 'pass';
  for (const item of ccItems) {
    const fp = (item.file_path || '').replace(/\\/g, '/');
    const pri = (item.priority || 'low').toLowerCase();
    for (const [cid, frag] of Object.entries(frags)) {
      if (fp.includes(frag) && (rank[pri] ?? 99) < (rank[compSt[cid] || 'pass'] ?? 99)) compSt[cid] = pri;
    }
  }
  const bc = { critical: '#c0392b', high: '#d35400', medium: '#c4960b', low: '#2471a3', pass: '#2d8a55' };
  const bg = { critical: '#fdf2f2', high: '#fef8f2', medium: '#fffdf0', low: '#f0f6fd', pass: '#f9f9f9' };
  const bw = { critical: 2.5, high: 2.5, medium: 1.5, low: 1.5, pass: 1.5 };
  const MARGIN = 10, ZONE_PT = 26, ZONE_PB = 10, ROW_H = 65, BOX_H = 48, BOX_W = 155, BOX_GAP = 10, ZONE_GAP = 12, LEGEND_H = 20;
  const zoneRowMap = {};
  for (const c of compsCfg) {
    const zid = c.zone, row = c.row || 0;
    if (!zoneRowMap[zid]) zoneRowMap[zid] = {};
    if (!zoneRowMap[zid][row]) zoneRowMap[zid][row] = [];
    zoneRowMap[zid][row].push(c.id);
  }
  const zoneY = {}, zoneH = {};
  let curY = MARGIN;
  for (const z of zonesCfg) {
    const rows = zoneRowMap[z.id] || {};
    const nRows = Object.keys(rows).length ? Math.max(...Object.keys(rows).map(Number)) + 1 : 0;
    const zh = ZONE_PT + nRows * ROW_H + ZONE_PB;
    zoneY[z.id] = curY; zoneH[z.id] = zh; curY += zh + ZONE_GAP;
  }
  const H = curY - ZONE_GAP + LEGEND_H + 6;
  const availW = W - 2 * MARGIN;
  const compPos = {};
  for (const z of zonesCfg) {
    const rows = zoneRowMap[z.id] || {};
    for (const [rowIdx, cids] of Object.entries(rows)) {
      const n = cids.length;
      const totalW = n * BOX_W + (n - 1) * BOX_GAP;
      const startX = MARGIN + (availW - totalW) / 2;
      const rowTop = zoneY[z.id] + ZONE_PT + parseInt(rowIdx) * ROW_H + (ROW_H - BOX_H) / 2;
      cids.forEach((cid, i) => { compPos[cid] = [startX + i * (BOX_W + BOX_GAP), rowTop, BOX_W, BOX_H]; });
    }
  }
  const cx = k => compPos[k][0] + compPos[k][2] / 2;
  const botF = k => compPos[k][1] + compPos[k][3];
  const topF = k => compPos[k][1];

  function arrow(x1, y1, x2, y2, warn, lbl) {
    const color = warn ? '#c0392b' : '#8a9ab0';
    const marker = warn ? 'aw' : 'an';
    const dash = warn ? ' stroke-dasharray="5,3"' : '';
    const dx = x2 - x1, dy = y2 - y1;
    const dist = Math.hypot(dx, dy) || 1;
    const tx = x2 - 6 * dx / dist, ty = y2 - 6 * dy / dist;
    let out = `<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${tx.toFixed(1)}" y2="${ty.toFixed(1)}" stroke="${color}" stroke-width="1.5"${dash} marker-end="url(#${marker})"/>`;
    if (lbl && detail) {
      const bx_ = (x1 + x2) / 2, by_ = (y1 + y2) / 2;
      const bwl = lbl.length * 5.6 + 10;
      out += `<rect x="${bx_.toFixed(1)}" y="${(by_ - 11).toFixed(1)}" width="${Math.round(bwl)}" height="14" rx="2" fill="white" fill-opacity="0.9"/>`;
      out += `<text x="${(bx_ + 4).toFixed(1)}" y="${by_.toFixed(1)}" font-size="9.5" fill="${color}" font-family="sans-serif">${_h(lbl)}</text>`;
    }
    return out;
  }

  const svgDefs = '<defs><marker id="an" markerWidth="8" markerHeight="7" refX="6" refY="3.5" orient="auto"><polygon points="0 0, 8 3.5, 0 7" fill="#8a9ab0"/></marker><marker id="aw" markerWidth="8" markerHeight="7" refX="6" refY="3.5" orient="auto"><polygon points="0 0, 8 3.5, 0 7" fill="#c0392b"/></marker></defs>';
  let svgZones = '';
  for (const z of zonesCfg) {
    const zx = MARGIN, zy = zoneY[z.id], zw = W - 2 * MARGIN, zh = zoneH[z.id];
    svgZones += `<rect x="${zx}" y="${zy}" width="${zw}" height="${zh}" rx="8" fill="${z.fill || z.color || '#eee'}" stroke="#b0b8c8" stroke-width="1.5"/>`;
    svgZones += `<text x="${zx + 12}" y="${zy + 17}" font-size="11" font-weight="600" fill="${z.label_color || '#333'}" font-family="sans-serif">${_h(z.label)}</text>`;
  }
  let svgArrows = '';
  for (const conn of connsCfg) {
    if (!(conn.from in compPos) || !(conn.to in compPos)) continue;
    if (conn.detail_only && !detail) continue;
    svgArrows += arrow(cx(conn.from) + (conn.from_dx || 0), botF(conn.from), cx(conn.to) + (conn.to_dx || 0), topF(conn.to), conn.warning || false, detail ? (conn.label || '') : '');
  }
  let svgBoxes = '';
  for (const c of compsCfg) {
    if (!(c.id in compPos)) continue;
    const [bx, by, bw_, bh] = compPos[c.id];
    const stVal = compSt[c.id] || 'pass';
    const midY = by + bh / 2;
    const textY = c.sublabel ? midY - 6 : midY + 4;
    svgBoxes += `<rect x="${bx.toFixed(1)}" y="${by.toFixed(1)}" width="${bw_.toFixed(1)}" height="${bh.toFixed(1)}" rx="5" fill="${bg[stVal]}" stroke="${bc[stVal]}" stroke-width="${bw[stVal]}"/>`;
    svgBoxes += `<text x="${(bx + bw_ / 2).toFixed(1)}" y="${textY.toFixed(1)}" text-anchor="middle" font-size="11.5" font-weight="600" fill="#1a1a2e" font-family="sans-serif">${_h(c.label)}</text>`;
    if (c.sublabel) svgBoxes += `<text x="${(bx + bw_ / 2).toFixed(1)}" y="${(textY + 14).toFixed(1)}" text-anchor="middle" font-size="9.5" fill="#556" font-family="sans-serif">${_h(c.sublabel)}</text>`;
  }
  let svgLegend = '';
  const legendItems = [[bc.critical, bw.critical, 'Critical finding'], [bc.high, bw.high, 'High finding'], [bc.pass, bw.pass, 'No active findings']];
  let lx0 = MARGIN + 8;
  const ly0 = H - 8;
  svgLegend += `<text x="${lx0}" y="${ly0}" font-size="10" fill="#666" font-family="sans-serif" font-weight="600">Border: </text>`;
  lx0 += 44;
  for (const [lbc, lbwt, llbl] of legendItems) {
    svgLegend += `<rect x="${lx0}" y="${ly0 - 9}" width="22" height="12" rx="3" fill="none" stroke="${lbc}" stroke-width="${lbwt}"/>`;
    svgLegend += `<text x="${lx0 + 26}" y="${ly0}" font-size="10" fill="#666" font-family="sans-serif">${_h(llbl)}</text>`;
    lx0 += 115;
  }
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" style="max-width:100%;height:auto;display:block;margin:0 auto">${svgDefs}${svgZones}${svgArrows}${svgBoxes}${svgLegend}</svg>`;
  const note = 'Border colour shows the highest-severity active finding for each service, derived from current code changes. ';
  return `<div class="context-panel dfd-box"><div class="context-panel-title dfd-title">Application Architecture \u2014 Data Flow Diagram</div>${svg}<p class="dfd-note">${_h(note)}Full narrative analysis in the <a href="threat_model.html">Threat Model report</a>.</p></div>`;
}

function _buildDrRadarSvg(dims, score) {
  if (!dims || !dims.length) return '';
  const n = dims.length;
  const cxV = 160, cyV = 155, r = 110;
  const w = 320 + 80, h = 310 + 60;
  const pt = (angle, radius) => [cxV + radius * Math.cos(angle), cyV + radius * Math.sin(angle)];
  const angles = Array.from({ length: n }, (_, i) => Math.PI * (-0.5 + 2 * i / n));
  let gridSvg = '';
  for (const pct of [0.25, 0.5, 0.75, 1.0]) {
    gridSvg += `<polygon points="${angles.map(a => { const [x, y] = pt(a, r * pct); return `${x.toFixed(1)},${y.toFixed(1)}`; }).join(' ')}" fill="none" stroke="#dee2e6" stroke-width="1"/>`;
  }
  let spokesSvg = '';
  for (const a of angles) { const [x2, y2] = pt(a, r); spokesSvg += `<line x1="${cxV}" y1="${cyV}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" stroke="#dee2e6" stroke-width="1"/>`; }
  const valPts = dims.map((dim, i) => { const ms = dim.max_score || 20; const pctV = Math.max(0, Math.min(1, (dim.score || 0) / ms)); return pt(angles[i], r * pctV); });
  const valStr = valPts.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
  const valueSvg = `<polygon points="${valStr}" fill="rgba(0,83,179,0.18)" stroke="#0053b3" stroke-width="2"/>`;
  const dotSvg = valPts.map(([x, y]) => `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="4" fill="#0053b3"/>`).join('');
  let labelSvg = '';
  for (let i = 0; i < dims.length; i++) {
    const dim = dims[i];
    const raw = dim.score || 0;
    const ms = dim.max_score || 20;
    let lbl = (dim.label || dim.key || '').replace(/_/g, ' ');
    if (lbl.length > 18) lbl = lbl.slice(0, 16) + '\u2026';
    const [lx, ly] = pt(angles[i], r + 22);
    const anchor = lx < cxV - 10 ? 'end' : lx > cxV + 10 ? 'start' : 'middle';
    labelSvg += `<text x="${lx.toFixed(1)}" y="${ly.toFixed(1)}" text-anchor="${anchor}" font-size="11" fill="#444">${_h(lbl)}</text>`;
    labelSvg += `<text x="${lx.toFixed(1)}" y="${(ly + 13).toFixed(1)}" text-anchor="${anchor}" font-size="10" fill="#888">${raw}/${ms}</text>`;
  }
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" style="max-width:100%;height:auto">${gridSvg}${spokesSvg}${valueSvg}${dotSvg}${labelSvg}</svg>`;
  return `<div class="context-panel dr-radar-box"><div class="context-panel-title dr-radar-title">Resilience Dimensions \u2014 Radar View</div>${svg}</div>`;
}

// ---------------------------------------------------------------------------
// Tab content builders
// ---------------------------------------------------------------------------
function _reportLink(filename, label) {
  return `<p style="margin:0 0 14px"><a href="${filename}" style="font-size:13px;color:var(--brand-blue-med)">&#128196; View full ${label} report &rarr;</a></p>`;
}

const _RA_HOWTO_HTML = `<details style="margin:16px 0;border:1px solid var(--border);border-radius:4px">
  <summary style="padding:8px 12px;cursor:pointer;font-weight:600;font-size:13px;background:#f8f9fa;border-radius:4px;list-style:none;user-select:none">&#9432;&nbsp; How to accept a risk instead of fixing it</summary>
  <div style="padding:12px 16px;font-size:13px;line-height:1.7">
    <p style="margin:0 0 10px">When a finding is a known, accepted risk rather than something to fix, record it in the risk acceptance register so it is tracked rather than silently suppressed.</p>
    <p style="margin:0 0 6px"><strong>Step 1 \u2014 Add an inline marker in the source file</strong> (immediately above the flagged line):</p>
    <pre style="background:var(--code-bg);color:var(--code-fg);padding:8px 12px;border-radius:3px;font-size:12px;overflow-x:auto;margin:0 0 10px"><code>// RISK_ACCEPTED: RA-001</code></pre>
    <p style="margin:0 0 10px;font-size:12px;color:#6c757d">Use the comment style for your language: <code>//</code> (JS/TS), <code>#</code> (Python/Ruby), <code>--</code> (SQL), <code>/* ... */</code> (CSS/C).</p>
    <p style="margin:0 0 6px"><strong>Step 2 \u2014 Add an entry to <code>.ai/blueteam/data/risk_acceptances.json</code></strong>:</p>
    <pre style="background:var(--code-bg);color:var(--code-fg);padding:8px 12px;border-radius:3px;font-size:12px;overflow-x:auto;margin:0 0 10px"><code>{"id":"RA-001","finding_id":"CC-042","title":"Short description","rationale":"Why accepted","accepted_by":"name@gov.ab.ca","expiry_date":"YYYY-MM-DD","severity_at_acceptance":"medium","status":"active"}</code></pre>
    <p style="margin:0 0 6px"><strong>&#9888;&nbsp; Non-suppressible findings</strong> \u2014 the following finding types cannot be risk-accepted regardless of justification:</p>
    <ul style="margin:0 0 10px;padding-left:20px"><li>Hardcoded secrets</li><li>Authentication bypass</li><li>Exposure of PHN, SIN, medical/mental health diagnoses, or bank/credit card numbers</li><li>Bulk extraction of Protected B data</li><li>Backdoor routes or privilege escalation via client-controlled input</li><li>Critical DR gaps</li></ul>
    <p style="margin:0;font-size:12px;color:#6c757d">See <code>RISK_ACCEPTANCE_GUIDE.md</code> in the BlueTeam directory for the full register schema.</p>
  </div>
</details>`;

function _tabDashboard(st, verd, art, appName, genDate) {
  const riskCss = _PRI_CSS[verd.overall_risk.toLowerCase()] || 'low';
  const exploitDetail = {
    trivially_exploitable: 'Exposed secrets and/or critical CVEs are reachable without authentication.',
    readily_exploitable: `${st.cc_counts.critical + st.cc_counts.high} critical/high findings; ${st.kc_items.filter(k => ['critical', 'high'].includes(k.severity)).length} high-severity attack chain(s).`,
    capability_required: `Exploitation requires chaining ${st.kc_items.length} kill chain(s) with ${st.cc_counts.critical} critical finding(s).`,
    advanced_capability_required: 'No critical or high findings and no kill chains identified.',
  }[verd.exploit];

  const [classifKey, classifLabel] = art.classification || ['', ''];
  let classifCardHtml = '';
  if (classifKey) {
    const clsColorMap = { a: 'var(--medium)', b: 'var(--high)', c: 'var(--critical)' };
    const clsColor = classifKey === 'public' ? 'var(--pass)' : (clsColorMap[classifKey] || 'var(--brand-blue)');
    const inner = classifKey === 'public'
      ? `<div style="font-size:20px;font-weight:800;color:${clsColor};line-height:1;margin-bottom:2px">Public</div>`
      : `<div style="font-size:13px;font-weight:700;color:${clsColor};letter-spacing:.03em;line-height:1;margin-bottom:3px">Protected</div><div style="font-size:42px;font-weight:800;color:${clsColor};line-height:1;margin-bottom:2px">${_h(classifKey.toUpperCase())}</div>`;
    classifCardHtml = `<a class="metric-card" href="security-classification.html" title="${_h(classifLabel)}">${inner}<div class="metric-lbl">Classification</div></a>`;
  }

  const sa = art.sa;
  const saOpenGaps = (sa ? (sa.gaps || []) : []).filter(g => (g.status || 'open') !== 'risk_accepted');
  const saGapCss = (() => {
    const sorted = [...saOpenGaps].sort((a, b) => ({ Critical: 0, High: 1, Medium: 2, Low: 3 }[a.severity || 'Low'] || 4) - ({ Critical: 0, High: 1, Medium: 2, Low: 3 }[b.severity || 'Low'] || 4));
    for (const g of sorted) {
      const m = { Critical: 'critical', High: 'high', Medium: 'medium' }[g.severity];
      if (m) return m;
    }
    return (sa && !saOpenGaps.length) ? 'pass' : '';
  })();
  const saVal = saOpenGaps.length ? `${saOpenGaps.length} gap${saOpenGaps.length !== 1 ? 's' : ''}` : (sa ? 'Aligned' : 'N/A');

  const metrics = [
    ['Overall Risk', verd.overall_risk, riskCss, 'threat_model.html'],
    ['ASVS Level 2', { Pass: 'Pass', Fail: 'Fail', 'Conditional Pass': 'Cond.', 'Not Assessed': 'N/A' }[verd.asvs[0]] || 'N/A', _SB_TO_BADGE[verd.asvs[1]] || '', st.assessments_run.has('asvs_level2_security_assessment') ? '#panel-asvs' : ''],
    ['CAS', { Compliant: 'Pass', 'Non-Compliant': 'Fail', 'Conditionally Compliant': 'Cond.', 'Not Assessed': 'N/A' }[verd.cas[0]] || 'N/A', _SB_TO_BADGE[verd.cas[1]] || '', st.assessments_run.has('cybersecurity_architecture_standard_compliance') ? '#panel-cas' : ''],
    ['Architecture', saVal, saGapCss, sa ? '#panel-security-arch' : ''],
    ['Code Changes', String(st.total_cc), '', '#panel-remediation'],
    ['Security Reqs', String(st.total_sr), '', 'asvs_level2_security_assessment.html'],
    ['Common Findings', String(st.common_cc.length + st.common_sr.length), '', '#panel-common'],
    ['Kill Chains', art.kc ? String(st.total_kc) : 'N/A', '', art.kc ? 'cross_domain_kill_chains.html' : ''],
    ['DR Score', st.dr_score != null ? `${st.dr_score}/100` : 'N/A', '', st.dr_score != null ? 'dr_resilience_assessment.html' : ''],
    ['Scan Findings', art.scans ? String(st.total_scans) : 'N/A', '', art.scans ? '#panel-scans' : ''],
    ['Verification Tests', art.vt ? String(st.total_vtests) : 'N/A', '', art.vt ? 'threat_model.html' : ''],
    ['Unit Test Cvg', art.ut_stats ? `${art.ut_stats.pre_pct}%` : 'N/A', art.ut_stats ? (art.ut_stats.pre_pct < 30 ? 'critical' : art.ut_stats.pre_pct < 50 ? 'high' : art.ut_stats.pre_pct < 75 ? 'medium' : '') : '', art.ut_stats ? 'security_unit_test_coverage.html' : ''],
  ];

  function mcard(label, val, css, link) {
    const inner = `<div class="metric-val${css ? ' badge badge-' + css : ''}">${val}</div><div class="metric-lbl">${label}</div>`;
    if (!link) return `<div class="metric-card">${inner}</div>`;
    if (link.startsWith('#')) {
      const tab = link.slice(1);
      return `<a class="metric-card" href="${link}" onclick="event.preventDefault();switchTab('${tab}')">${inner}</a>`;
    }
    return `<a class="metric-card" href="${link}">${inner}</a>`;
  }

  const metricCards = classifCardHtml + metrics.map(([l, v, c, lnk]) => mcard(l, v, c, lnk)).join('');

  // Assessment verdict table
  const assessVerdictData = [
    ['threat_model', 'Threat Model', verd.tm],
    ['asvs_level2_security_assessment', 'OWASP ASVS Level 2', verd.asvs],
    ['cybersecurity_architecture_standard_compliance', 'CAS Compliance', verd.cas],
    ['security_architecture_design', 'Security Architecture', verd.sa],
    ['kill_chain_aggregator', 'Kill Chain Analysis', verd.kc],
    ['dr_resilience_analysis', 'Resiliency &amp; DR', verd.dr],
    ['cybersecurity_tool_use', 'Security Tool Scans', verd.scans],
  ];
  let assessRows = '';
  for (const [key, label, [vText, vCss]] of assessVerdictData) {
    const run = st.assessments_run.has(key) || (key === 'security_architecture_design' && !!sa);
    const verdictCell = run
      ? `<span class="badge badge-${_SB_TO_BADGE[vCss] || 'assumed'}">${_h(vText)}</span>`
      : '<span class="badge badge-assumed">Not Run</span>';
    assessRows += `<tr><td><strong>${label}</strong></td><td>${verdictCell}</td></tr>`;
  }
  const assessTable = `<table class="assess-table"><thead><tr><th>Assessment</th><th>Verdict</th></tr></thead><tbody>${assessRows}</tbody></table>`;

  // Top Actions
  const topActions = [...st.cc_items].sort((a, b) => {
    const ac = (st.participation_map[a.id || ''] || []).length;
    const bc2 = (st.participation_map[b.id || ''] || []).length;
    if (bc2 !== ac) return bc2 - ac;
    const am = _multiSource(a) ? 1 : 0;
    const bm = _multiSource(b) ? 1 : 0;
    if (bm !== am) return bm - am;
    return (_PRI_ORDER[(a.priority || 'low')] ?? 99) - (_PRI_ORDER[(b.priority || 'low')] ?? 99);
  }).slice(0, 5);

  let actionItemsHtml = '';
  topActions.forEach((item, idx) => {
    const cid = item.id || '';
    const title = item.title || '';
    const pri = item.priority || 'low';
    const chains = st.participation_map[cid] || [];
    let chainDetail = '';
    if (chains.length) {
      const refs = chains.slice(0, 3).map(c => `<span class="kc-link">${_h(c)}</span>`).join(' ');
      chainDetail = ` &mdash; breaks ${chains.length} attack chain(s): ${refs}`;
    }
    actionItemsHtml += `<div class="action-item"><div class="action-num">${idx + 1}</div><div class="action-text"><strong>${_h(title)}</strong> ${badge(pri.charAt(0).toUpperCase() + pri.slice(1), _PRI_CSS[pri] || 'low')}<br><small style="color:#6c757d"><code>${_h(cid)}</code>${chainDetail}</small></div></div>`;
  });
  if (!actionItemsHtml) actionItemsHtml = '<p>No code changes identified.</p>';

  // Severity Distribution table
  const sevTable = `<table><thead><tr><th>Category</th><th>Critical</th><th>High</th><th>Medium</th><th>Low</th><th>Total</th></tr></thead><tbody>` +
    `<tr><td>Code Changes (CC)</td><td>${st.cc_counts.critical}</td><td>${st.cc_counts.high}</td><td>${st.cc_counts.medium}</td><td>${st.cc_counts.low}</td><td>${st.total_cc}</td></tr>` +
    `<tr><td>Security Requirements (SR)</td><td>${st.sr_counts.critical}</td><td>${st.sr_counts.high}</td><td>${st.sr_counts.medium}</td><td>${st.sr_counts.low}</td><td>${st.total_sr}</td></tr>` +
    `<tr><td>Kill Chains</td><td>${st.kc_sev.critical}</td><td>${st.kc_sev.high}</td><td>${st.kc_sev.medium}</td><td>${st.kc_sev.low}</td><td>${st.total_kc}</td></tr>` +
    `<tr><td>DR Gaps</td><td>${st.dr_counts.critical}</td><td>${st.dr_counts.high}</td><td>${st.dr_counts.medium}</td><td>${st.dr_counts.low}</td><td>${st.total_dr}</td></tr>` +
    `<tr><td>Scan Findings</td><td>${st.scan_counts.critical}</td><td>${st.scan_counts.high}</td><td>${st.scan_counts.medium}</td><td>${st.scan_counts.low}</td><td>${st.total_scans}</td></tr></tbody></table>`;

  const vtTotal = st.total_vtests;
  const vtTested = st.vt_counts.passed + st.vt_counts.failed + st.vt_counts['not-applicable'];
  const vtCov = vtTotal ? Math.round(vtTested * 100 / vtTotal) : 0;
  const vtTable = `<table><thead><tr><th>Verification Status</th><th>Count</th></tr></thead><tbody>` +
    `<tr><td>Not Tested</td><td>${st.vt_counts['not-tested']}</td></tr>` +
    `<tr><td>Passed</td><td>${st.vt_counts.passed}</td></tr>` +
    `<tr><td>Failed</td><td>${st.vt_counts.failed}</td></tr>` +
    `<tr><td>Not Applicable</td><td>${st.vt_counts['not-applicable']}</td></tr>` +
    `<tr><td><strong>Coverage (tested or N/A)</strong></td><td><strong>${vtCov}%</strong></td></tr></tbody></table>`;

  const dfdCompact = _buildDfdSvg(st.cc_items, st.topology, false);

  return `<div class="metric-grid">${metricCards}</div>${verdictBanner(verd.exploit_label, verd.exploit_css, exploitDetail)}<h3>Assessment Verdicts</h3>${assessTable}<h3>Top Actions</h3><p style="font-size:12px;color:#6c757d;margin-bottom:6px">Highest-impact code changes ordered by attack chain disruption. See the <strong>Remediation Plan</strong> tab for the full prioritised list.</p>${actionItemsHtml}<h3>Severity Distribution</h3>${sevTable}<h3>Verification Coverage</h3><p style="font-size:12px;color:#6c757d;margin-bottom:6px">Overview shows status only.</p>${vtTable}<h3>Application Architecture</h3>${dfdCompact}`;
}

function _remedSummaryTable(items, ccPriorityOrder) {
  const rows = items.map((item, idx) => {
    const cid = _h(item.id || '');
    const fpRaw = item.file_path || '';
    const fname = _h(fpRaw.includes('/') ? fpRaw.split('/').pop() : fpRaw) || '\u2014';
    const fpFull = _h(fpRaw) || '\u2014';
    const lr = _h(String(item.line_reference || '\u2014'));
    const ct = _h(item.change_type || '\u2014');
    const pri = item.priority || 'low';
    const priBadge = badge(pri.charAt(0).toUpperCase() + pri.slice(1), _PRI_CSS[pri] || 'low');
    const reqIds = item.related_requirement_ids || [];
    const reqLinks = reqIds.map(r => `<a href="security_requirements.html#${_h(r)}">${_h(r)}</a>`).join(' ') || '\u2014';
    return `<tr><td style="color:#888;width:28px">${idx + 1}</td><td><a href="#${cid}">${cid}</a></td><td title="${fpFull}"><code>${fname}</code></td><td style="color:#888">${lr}</td><td style="color:#555">${ct}</td><td>${priBadge}</td><td>${reqLinks}</td></tr>`;
  }).join('');
  return `<table class="remed-summary"><thead><tr><th>#</th><th>ID</th><th>File</th><th>Line</th><th>Type</th><th>Priority</th><th>Requirements</th></tr></thead><tbody>${rows}</tbody></table>`;
}

function _fileHotspotTable(items, participationMap) {
  if (!items.length) return '';
  const byFile = {};
  for (const item of items) {
    const fp = (item.file_path || '').trim() || '\u2014';
    if (!byFile[fp]) byFile[fp] = [];
    byFile[fp].push(item);
  }
  const sortedFiles = Object.entries(byFile).sort(([, a], [, b]) => {
    if (b.length !== a.length) return b.length - a.length;
    const aMin = Math.min(...a.map(i => _SEV_ORDER[_normSev(i.priority || 'low')] ?? 3));
    const bMin = Math.min(...b.map(i => _SEV_ORDER[_normSev(i.priority || 'low')] ?? 3));
    return aMin - bMin;
  });
  const rows = sortedFiles.map(([fp, fileItems]) => {
    const count = fileItems.length;
    const fname = fp.includes('/') && fp !== '\u2014' ? fp.split('/').pop() : fp;
    const topRank = Math.min(...fileItems.map(i => _SEV_ORDER[_normSev(i.priority || 'low')] ?? 3));
    const topPriNames = ['critical', 'high', 'medium', 'low'];
    const topPri = topPriNames[topRank] || 'low';
    const assessments = [...new Set(fileItems.flatMap(i => (i.sources || []).filter(s => s.assessment).map(s => _ASSESS_SHORT[s.assessment] || s.assessment.slice(0, 4).toUpperCase())))].sort();
    const assessHtml = assessments.map(a => `<span class="hotspot-assess">${_h(a)}</span>`).join(' ') || '\u2014';
    const ctCounts = {};
    fileItems.forEach(i => { const ct = (i.change_type || 'fix').toLowerCase(); ctCounts[ct] = (ctCounts[ct] || 0) + 1; });
    const ctHtml = Object.entries(ctCounts).sort().map(([ct, n]) => `<span class="hotspot-ct">${_h(ct)}&thinsp;\u00d7${n}</span>`).join(' ');
    const chainIdSet = new Set();
    fileItems.forEach(i => (participationMap[i.id || ''] || []).forEach(c => chainIdSet.add(c)));
    const chainCell = chainIdSet.size ? String(chainIdSet.size) : '\u2014';
    const ccLinks = fileItems.map(i => `<a href="#${_h(i.id || '')}">${_h(i.id || '')}</a>`).join(' ');
    const countCss = count > 1 ? 'hotspot-count hotspot-count-multi' : 'hotspot-count';
    return `<tr><td title="${_h(fp)}"><code class="hotspot-fname">${_h(fname)}</code></td><td style="text-align:center"><span class="${countCss}">${count}</span></td><td>${badge(topPri.charAt(0).toUpperCase() + topPri.slice(1), _PRI_CSS[topPri] || 'low')}</td><td>${assessHtml}</td><td>${ctHtml}</td><td style="text-align:center;color:#555">${chainCell}</td><td class="hotspot-cc-links">${ccLinks}</td></tr>`;
  }).join('');
  return `<table class="hotspot-table"><thead><tr><th>File</th><th>Findings</th><th>Worst Priority</th><th>Assessments</th><th>Change Types</th><th>Kill Chains</th><th>Changes</th></tr></thead><tbody>${rows}</tbody></table>`;
}

function _tabRemediation(st) {
  if (!st.cc_items.length) return '<p>No code change entries found.</p>';
  const items = [...st.cc_items].sort((a, b) => (st.cc_priority_order[a.id] || 999) - (st.cc_priority_order[b.id] || 999));
  const summaryTable = _remedSummaryTable(items, st.cc_priority_order);
  const cards = items.map(i => findingCard(i, { priority_num: st.cc_priority_order[i.id], elevation_info: st.elevation_map[i.id], chain_ids: st.participation_map[i.id] })).join('');
  const ccLink = st.cc_html_exists ? _reportLink('code_changes.html', 'Code Changes') : '';
  const hotspotTable = _fileHotspotTable(items, st.participation_map);
  return `${ccLink}${_reportLink('security_requirements.html', 'Security Requirements')}<p style="font-size:12px;color:#6c757d;margin-bottom:10px">&#9432; Ordered by remediation impact: fixes that break the most attack chains appear first.</p><h3 style="margin:14px 0 6px;font-size:14px">Quick Reference</h3>${summaryTable}<h3 style="margin:14px 0 6px;font-size:14px">File Hotspots</h3><p style="font-size:12px;color:#6c757d;margin:0 0 8px">&#9432; Files ranked by number of security findings.</p>${hotspotTable}${_RA_HOWTO_HTML}<h3 style="margin:14px 0 6px;font-size:14px">Detailed Changes</h3>${filterBar('remed-list')}<div id="remed-list">${cards}</div>`;
}

function _tabCommon(st) {
  const items = [...st.common_cc, ...st.common_sr].sort((a, b) => (_PRI_ORDER[a.priority || 'low'] ?? 99) - (_PRI_ORDER[b.priority || 'low'] ?? 99) || (a.id || '').localeCompare(b.id || ''));
  if (!items.length) return '<p>No findings confirmed by multiple assessments.</p>';
  const cards = items.map(i => {
    if ((i.id || '').startsWith('CC-')) return findingCard(i, { elevation_info: st.elevation_map[i.id], chain_ids: st.participation_map[i.id] });
    return findingCard(i);
  }).join('');
  return `<p>These ${items.length} finding(s) were independently identified by two or more assessments.</p>${filterBar('common-list')}<div id="common-list">${cards}</div>`;
}

function _tabChains(st, verd) {
  if (!st.kc_items.length) return '<p>No kill chain data available.</p>';
  const [v, css] = verd.kc;
  const tacticGrid = _buildKcTacticGrid(st.kc_items);
  const cards = [...st.kc_items].sort((a, b) => (_SEV_ORDER[a.severity || 'low'] ?? 3) - (_SEV_ORDER[b.severity || 'low'] ?? 3)).map(kc => kcCard(kc)).join('');
  return `${verdictBanner(v, css, `${st.kc_items.length} attack chain(s) identified.`)}${_reportLink('cross_domain_kill_chains.html', 'Attack Chains')}${tacticGrid}${cards}`;
}

function commonIssueStub(item, opts = {}) {
  const { elevation_info, chain_ids } = opts;
  const fid = _h(item.id || '');
  const title = _h(item.title || '');
  const pri = (item.priority || item.severity || 'low').toLowerCase();
  const css = _PRI_CSS[pri] || 'low';
  const srcs = sourceChips(item.sources || []);
  const fp = item.file_path || '';
  const fileRef = fp ? ` &nbsp;<code style="font-size:11px;color:#6c757d">${_h(fp)}</code>` : '';
  const commonLink = '<a class="stub-common-link" href="#" onclick="switchTab(\'panel-common\');return false;">&#8599;&nbsp;Common Issue</a>';
  const desc = _h(item.description || '');
  const code = item.replacement_code || '';
  const codeHtml = code ? `<details class="finding-detail"><summary>&#9654; Show fix</summary><pre><code>${_h(code)}</code></pre></details>` : '';
  const criteria = item.acceptance_criteria || [];
  const critHtml = criteria.length ? `<details class="finding-detail"><summary>&#9654; Acceptance criteria (${criteria.length})</summary><ul>${criteria.map(c => `<li>${_h(c)}</li>`).join('')}</ul></details>` : '';
  let elevHtml = '';
  if (elevation_info) {
    const chainRefs = (elevation_info.chain_ids || []).map(c => `<span class="kc-link">${_h(c)}</span>`).join(' ');
    elevHtml = `<div class="elevated-badge">&#8679; Elevated from ${_h((elevation_info.elevated_from || '').charAt(0).toUpperCase() + (elevation_info.elevated_from || '').slice(1))} &mdash; participates in ${chainRefs}</div>`;
  }
  let chainHtml = '';
  if (chain_ids && chain_ids.length) {
    chainHtml = `<div class="chain-breaks">Breaks: ${chain_ids.map(c => `<span class="kc-link">${_h(c)}</span>`).join(' ')}</div>`;
  }
  const detailParts = [desc ? `<p style="margin:6px 0 4px">${desc}</p>` : '', elevHtml, chainHtml, codeHtml, critHtml].filter(Boolean).join('');
  const detailHtml = detailParts ? `<details class="stub-detail"><summary>&#9654; Show full detail</summary><div class="stub-detail-body">${detailParts}</div></details>` : '';
  return `<div class="finding-stub ${css}" data-sev="${css}"><strong>${fid}</strong> ${badge(pri.charAt(0).toUpperCase() + pri.slice(1), css)} ${srcs}${commonLink}<br><strong>${title}</strong>${fileRef}${detailHtml}</div>`;
}

function _tabSkill(st, verd, assessmentKey, label, verdictTuple, reportFilename) {
  const allItems = [...st.cc_items, ...st.sr_items]
    .filter(i => (i.sources || []).some(s => s.assessment === assessmentKey))
    .sort((a, b) => (_PRI_ORDER[a.priority || 'low'] ?? 99) - (_PRI_ORDER[b.priority || 'low'] ?? 99));
  const [v, css] = verdictTuple;
  const link = reportFilename ? _reportLink(reportFilename, label) : '';
  const description = _ASSESSMENT_DESCRIPTIONS[assessmentKey] || '';
  const descHtml = description ? `<p style="color:#555;font-size:12px;margin:-6px 0 14px">${description}</p>` : '';
  if (!st.assessments_run.has(assessmentKey)) return `<p>${label} assessment has not been run for this repository.</p>`;
  if (!allItems.length) return `${verdictBanner(v, css)}${link}${descHtml}<p>No findings for this assessment.</p>`;

  const exclusive = allItems.filter(i => !_multiSource(i));
  const common = allItems.filter(i => _multiSource(i));
  const ccAll = allItems.filter(i => (i.id || '').startsWith('CC-'));
  const exclusiveCc = exclusive.filter(i => (i.id || '').startsWith('CC-'));
  const commonCc = common.filter(i => (i.id || '').startsWith('CC-'));
  const containerId = assessmentKey.replace(/_/g, '-').slice(0, 30);

  let classTable = '';
  let dfdDetail = '';
  if (assessmentKey === 'threat_model') {
    dfdDetail = _buildDfdSvg(st.cc_items, st.topology, true);
    classTable = _buildDataClassificationTable(st.class_stores || []);
  }

  const note = `<p class="stub-section-header">${exclusiveCc.length} code change(s) specific to this assessment` +
    (commonCc.length ? ` &nbsp;&middot;&nbsp; ${commonCc.length} also on <a href="#" onclick="switchTab('panel-common');return false;">Common Issues</a> tab (stubs below)` : '') + '</p>';

  const exclCards = exclusive.map(i => {
    if ((i.id || '').startsWith('CC-')) return findingCard(i, { elevation_info: st.elevation_map[i.id], chain_ids: st.participation_map[i.id] });
    return findingCard(i);
  }).join('');
  let stubSection = '';
  if (commonCc.length) {
    const stubCards = commonCc.map(i => commonIssueStub(i, { elevation_info: st.elevation_map[i.id], chain_ids: st.participation_map[i.id] })).join('');
    stubSection = `<p class="stub-section-header">&#9660;&nbsp;Also confirmed by other assessments \u2014 <a href="#" onclick="switchTab('panel-common');return false;">see Common Issues tab</a></p><div id="${containerId}-stubs">${stubCards}</div>`;
  }

  const srCount = allItems.filter(i => (i.id || '').startsWith('SR-')).length;
  const bannerText = srCount
    ? `${ccAll.length} code change(s) and ${srCount} security requirement(s) from ${label} assessment.`
    : `${ccAll.length} code change(s) from ${label} assessment.`;

  return `${verdictBanner(v, css, bannerText)}${link}${descHtml}${dfdDetail}${classTable}${note}${filterBar(containerId)}<div id="${containerId}">${exclCards}</div>${stubSection}`;
}

function _tabDr(st, verd, art) {
  if (!art.dr) return '<p>DR Resilience assessment has not been run for this repository.</p>';
  const [v, css] = verd.dr;
  const score = st.dr_score || 0;
  let bandColor, bandLabel;
  if (score < 30) { bandColor = 'var(--critical)'; bandLabel = 'Critical \u2014 immediate action required'; }
  else if (score < 50) { bandColor = 'var(--high)'; bandLabel = 'High Risk \u2014 significant gaps present'; }
  else if (score < 75) { bandColor = 'var(--medium)'; bandLabel = 'Needs Improvement'; }
  else { bandColor = 'var(--pass)'; bandLabel = 'Mature'; }
  const bandHtml = `<span class="dr-band" style="background:${bandColor}">${bandLabel}</span>`;
  const scoreLine = `<p style="font-size:13px;margin:10px 0 4px"><strong>Score: ${score}/100</strong>${bandHtml}</p><p style="font-size:12px;color:#6c757d;margin-bottom:12px">Bands: 0\u201329 Critical &middot; 30\u201349 High Risk &middot; 50\u201374 Needs Improvement &middot; 75\u2013100 Mature</p>`;
  const dims = st.dr_dims;
  let bars = '';
  if (Array.isArray(dims)) {
    bars = dims.map(d => drBar(d.label || d.key || '', d.score || 0, d.max_score || 20)).join('');
  } else if (dims && typeof dims === 'object') {
    bars = Object.entries(dims).map(([k, v2]) => drBar(k, v2.score || 0, v2.max_score || 20)).join('');
  }
  const gaps = [...st.dr_gaps].sort((a, b) => (_SEV_ORDER[a.severity || 'low'] ?? 3) - (_SEV_ORDER[b.severity || 'low'] ?? 3));
  const recs = [...st.dr_recs].sort((a, b) => parseInt((a.priority || 'p4').replace('p', '')) - parseInt((b.priority || 'p4').replace('p', '')));
  const gapRows = gaps.map(g => `<tr><td><strong>${_h(g.id || '')}</strong></td><td>${badge((g.severity || '').charAt(0).toUpperCase() + (g.severity || '').slice(1), _SEV_CSS[(g.severity || '').toLowerCase()] || 'low')}</td><td>${_h(g.title || '')}</td></tr>`).join('');
  const recRows = recs.map(r => `<tr><td><strong>${_h(r.id || '')}</strong></td><td><span class="badge badge-assumed">${_h(r.priority || '')}</span></td><td>${_h(r.title || '')}</td><td style="font-size:12px">${_h(r.description || '')}</td></tr>`).join('');
  const dimsArr = Array.isArray(dims) ? dims : (dims ? Object.values(dims) : []);
  const radar = _buildDrRadarSvg(dimsArr, score);
  return `${verdictBanner(v, css, `Overall resilience score: ${score}/100.`)}${_reportLink('dr_resilience_assessment.html', 'Resiliency &amp; DR')}${scoreLine}${radar}<h3>Dimension Scores</h3>${bars}<h3>Potential Gaps</h3><table><thead><tr><th>ID</th><th>Severity</th><th>Gap</th></tr></thead><tbody>${gapRows}</tbody></table><h3>Recommendations</h3><table><thead><tr><th>ID</th><th>Priority</th><th>Title</th><th>Description</th></tr></thead><tbody>${recRows}</tbody></table>`;
}

function _tabScans(st, verd, art) {
  if (!art.scans) return '<p>Security tool scans have not been run.</p>';
  const [v, css] = verd.scans;
  const finds = [...st.scan_finds].sort((a, b) => (_SEV_ORDER[(a.severity || 'LOW').toLowerCase()] ?? 3) - (_SEV_ORDER[(b.severity || 'LOW').toLowerCase()] ?? 3));
  const meta = art.scans.metadata || {};
  const tools = (meta.tools || []).map(t => `${t.name || ''} ${t.version || ''}`.trim()).join(', ');
  const scanDate = meta.scan_date || '';
  const cards = finds.map(f => scanCard(f)).join('');
  return `${verdictBanner(v, css, `${finds.length} finding(s) from: ${tools || 'see scan metadata'}. Scan date: ${scanDate || 'see scan metadata'}.`)}${filterBar('scans-list', ['vulnerability', 'secret', 'misconfiguration', 'sast'])}<div id="scans-list">${cards}</div>`;
}

function _tabSecurityReqs(st, art) {
  const srItems = [...st.sr_items].sort((a, b) => (_PRI_ORDER[a.priority || 'low'] ?? 99) - (_PRI_ORDER[b.priority || 'low'] ?? 99) || (a.id || '').localeCompare(b.id || ''));
  if (!srItems.length) {
    if (!st.assessments_run.size) return '<p>No security assessments have been run for this repository.</p>';
    return '<p>No security requirements identified.</p>';
  }
  let mp = null, mpRank = 99;
  for (const i of srItems) { const v = _normSev(i.priority || 'low'); const r = _PRI_ORDER[v] ?? 99; if (r < mpRank) { mpRank = r; mp = v; } }
  let v, css;
  if (mp === 'critical') { v = 'Critical Requirements Pending'; css = 'sb-critical'; }
  else if (mp === 'high') { v = 'High Priority Requirements'; css = 'sb-high'; }
  else if (mp === 'medium') { v = 'Medium Priority Requirements'; css = 'sb-medium'; }
  else { v = 'Low Priority Requirements'; css = 'sb-pass'; }
  const detail = `${srItems.length} security requirement(s) identified across ${st.assessments_run.size} completed assessment(s).`;
  const cards = srItems.map(i => findingCard(i)).join('');
  return `${verdictBanner(v, css, detail)}${_reportLink('security_requirements.html', 'Security Requirements')}<p style="font-size:12px;color:#6c757d;margin-bottom:10px">All SR-NNN items across all completed assessments, sorted by priority.</p>${filterBar('sr-list')}<div id="sr-list">${cards}</div>`;
}

function _raTable(title, items, highlight = false) {
  const rowStyle = highlight ? ' style="background:#fff3cd"' : '';
  const rows = items.map(a => {
    const raId = _h(a.id || '');
    const ref = a.finding_reference || {};
    const finding = _h(ref.finding_id || ref.asvs_requirement || ref.cas_rule || ref.tool || '\u2014');
    const assess = _h(ref.assessment || '\u2014');
    const sev = (a.severity_at_acceptance || 'low').toLowerCase();
    const byVal = a.accepted_by;
    const byStr = typeof byVal === 'object' ? `${byVal.name || ''} (${byVal.role || ''})`.replace(/ \(\)$/, '') : String(byVal || '');
    const reviewDate = _h(a.review_date || '\u2014');
    const controlsRaw = a.compensating_controls || [];
    const controls = controlsRaw.map(c => _h(typeof c === 'string' ? c : (c.description || String(c)))).join('; ') || '\u2014';
    return `<tr${rowStyle}><td style="padding:5px 8px;white-space:nowrap"><code>${raId}</code></td><td style="padding:5px 8px">${badge(sev.charAt(0).toUpperCase() + sev.slice(1), _PRI_CSS[sev] || 'low')}</td><td style="padding:5px 8px">${finding}</td><td style="padding:5px 8px;font-size:12px">${assess}</td><td style="padding:5px 8px;font-size:12px">${_h(byStr)}</td><td style="padding:5px 8px;font-size:12px;white-space:nowrap">${reviewDate}</td><td style="padding:5px 8px;font-size:12px">${controls}</td></tr>`;
  }).join('');
  const th = 'style="padding:6px 8px;border-bottom:2px solid #dee2e6;background:#f4f6f8;text-align:left"';
  return `<h3 style="margin:18px 0 6px;font-size:14px">${_h(title)}</h3><div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse;font-size:13px"><thead><tr><th ${th}>ID</th><th ${th}>Severity</th><th ${th}>Finding</th><th ${th}>Assessment</th><th ${th}>Accepted By</th><th ${th}>Review Date</th><th ${th}>Compensating Controls</th></tr></thead><tbody>${rows}</tbody></table></div>`;
}

function _tabRiskRegister(art) {
  const raData = art.ra;
  if (!raData) return `<p>No risk acceptance register found.</p>${_RA_HOWTO_HTML}`;
  const acceptances = raData.acceptances || [];
  if (!acceptances.length) return `<p>Risk acceptance register is present but contains no entries.</p>${_RA_HOWTO_HTML}`;
  const active = acceptances.filter(a => a.status === 'active');
  const pending = acceptances.filter(a => a.status === 'pending');
  const expired = acceptances.filter(a => a.status === 'expired');
  const withdrawn = acceptances.filter(a => a.status === 'withdrawn');
  const hasHighCrit = active.some(a => ['critical', 'high'].includes((a.severity_at_acceptance || '').toLowerCase()));
  let v, css;
  if (expired.length) { v = `${expired.length} Expired Acceptance(s) \u2014 Review Required`; css = 'sb-critical'; }
  else if (hasHighCrit) { v = `${active.length} Active Acceptance(s) \u2014 High/Critical Present`; css = 'sb-high'; }
  else if (active.length) { v = `${active.length} Active Risk Acceptance(s)`; css = 'sb-medium'; }
  else { v = 'No Active Risk Acceptances'; css = 'sb-pass'; }
  const detail = `${active.length} active \u00b7 ${pending.length} pending \u00b7 ${expired.length} expired \u00b7 ${withdrawn.length} withdrawn`;
  const parts = [verdictBanner(v, css, detail)];
  if (active.length) parts.push(_raTable('Active Accepted Risks', active));
  if (expired.length) parts.push(_raTable('Expired Acceptances \u2014 Action Required', expired, true));
  if (pending.length) parts.push(_raTable('Pending Acceptances', pending));
  if (withdrawn.length) parts.push(_raTable('Withdrawn Acceptances', withdrawn));
  parts.push(_RA_HOWTO_HTML);
  return parts.join('\n');
}

function _tabSecurityArch(art) {
  const sa = art.sa;
  if (!sa) return '<p>Security architecture analysis has not been run for this repository.</p>';
  const PROFILE_LABELS = { internal: 'Profile A \u2014 Internal Staff', public: 'Profile B \u2014 Public Citizen', dual: 'Profile C \u2014 Dual Portal', custom: 'Custom', unknown: 'Unknown' };
  const CATEGORIES = ['authentication', 'authorization_model', 'data_protection', 'perimeter', 'logging', 'api_architecture', 'profile'];
  const SEVS = ['Critical', 'High', 'Medium', 'Low'];
  const profile = sa.profile || 'unknown';
  const profileLabel = PROFILE_LABELS[profile] || _h(profile);
  const gaps = sa.gaps || [];
  const profileHtml = `<div class="finding-card"><h3>${_h(profileLabel)}</h3>${sa.mode ? `<p><strong>Mode:</strong> ${_h(sa.mode)}</p>` : ''}${sa.profile_basis ? `<p><em>${_h(sa.profile_basis)}</em></p>` : ''}</div>`;
  let gapsSection;
  if (!gaps.length) {
    gapsSection = '<p>No architectural gaps identified.</p>';
  } else {
    const dist = {};
    for (const cat of CATEGORIES) { dist[cat] = {}; for (const sev of SEVS) dist[cat][sev] = []; }
    for (const g of gaps) {
      const cat = g.category || '';
      const sev = g.severity || '';
      if (dist[cat] && SEVS.includes(sev)) dist[cat][sev].push(String(g.id || ''));
    }
    const colTotals = {};
    for (const sev of SEVS) colTotals[sev] = CATEGORIES.reduce((s, cat) => s + dist[cat][sev].length, 0);
    const grandTotal = SEVS.reduce((s, sev) => s + colTotals[sev], 0);
    let distRows = '';
    for (const cat of CATEGORIES) {
      const rowTotal = SEVS.reduce((s, sev) => s + dist[cat][sev].length, 0);
      const cells = SEVS.map(sev => dist[cat][sev].length ? `<td>${dist[cat][sev].map(i => `<code>${_h(i)}</code>`).join(', ')}</td>` : '<td>\u2014</td>').join('');
      distRows += `<tr><td>${_h(cat.replace(/_/g, '\u00a0'))}</td>${cells}<td><strong>${rowTotal}</strong></td></tr>`;
    }
    distRows += `<tr><td><strong>Total</strong></td>${SEVS.map(sev => `<td><strong>${colTotals[sev]}</strong></td>`).join('')}<td><strong>${grandTotal}</strong></td></tr>`;
    const distHtml = `<h3>Gap Severity Distribution</h3><table><thead><tr><th>Category</th>${SEVS.map(s => `<th>${badge(s)}</th>`).join('')}<th>Total</th></tr></thead><tbody>${distRows}</tbody></table>`;
    const detailRows = gaps.map(g => `<tr><td><code>${_h(String(g.id || ''))}</code></td><td>${badge(String(g.severity || ''))}</td><td>${_h(String(g.category || '').replace(/_/g, '\u00a0'))}</td><td>${_h(String(g.title || ''))}</td></tr>`).join('');
    const detailHtml = `<h3>Gap Details (${gaps.length})</h3><table><thead><tr><th>ID</th><th>Severity</th><th>Category</th><th>Title</th></tr></thead><tbody>${detailRows}</tbody></table>`;
    gapsSection = distHtml + '\n' + detailHtml;
  }
  return `${_reportLink('security_architecture.html', 'Security Architecture Report')}\n${profileHtml}\n${gapsSection}`;
}

function _tabUnitTests(art) {
  const ut = art.ut_stats;
  if (!ut) return '<p>Security unit test coverage assessment has not been run for this repository.</p>';
  const prePct = ut.pre_pct;
  const postPct = ut.post_pct;
  let vText, vCss, vDetail;
  if (prePct < 30) { vText = `${prePct}% pre-existing security test coverage \u2014 critical gap`; vCss = 'sb-critical'; vDetail = `${ut.new_tests} regression guardrails generated. Adopt them to reach ${postPct}% coverage.`; }
  else if (prePct < 50) { vText = `${prePct}% pre-existing security test coverage \u2014 high risk`; vCss = 'sb-high'; vDetail = `${ut.new_tests} additional tests generated. Adopt them to reach ${postPct}% coverage.`; }
  else if (prePct < 75) { vText = `${prePct}% pre-existing security test coverage \u2014 partial coverage`; vCss = 'sb-medium'; vDetail = `${ut.new_tests} additional tests generated.`; }
  else { vText = `${prePct}% pre-existing security test coverage \u2014 good baseline`; vCss = 'sb-pass'; vDetail = `${ut.new_tests} additional tests generated for further hardening.`; }
  function covBar(label, pct) {
    const color = pct < 30 ? '#c0392b' : pct < 50 ? '#d35400' : pct < 75 ? '#c4960b' : '#1e8449';
    return `<div style="margin:8px 0"><div style="display:flex;justify-content:space-between;font-size:13px"><span>${_h(label)}</span><span style="color:${color};font-weight:700">${pct}%</span></div><div style="background:#dee2e6;border-radius:3px;height:10px;margin-top:3px"><div style="background:${color};width:${pct}%;height:10px;border-radius:3px"></div></div></div>`;
  }
  const bars = covBar('Pre-Existing Coverage (committed tests)', prePct) + covBar('With Generated Tests Adopted', postPct);
  const summaryLine = `<p style="font-size:13px;margin:10px 0 4px"><strong>${ut.in_scope}</strong> testable controls in scope &middot; <strong>${ut.infra_excluded}</strong> infrastructure-only excluded &middot; <strong>${ut.pre_tests}</strong> pre-existing security tests &middot; <strong>+${ut.new_tests}</strong> tests generated</p>`;
  function pctBadge(pct) { const css = pct < 30 ? 'critical' : pct < 50 ? 'high' : pct < 75 ? 'medium' : 'pass'; return `<span class="badge badge-${css}">${pct}%</span>`; }
  function runBadge(status) { const s = (status || '\u2014').trim(); const su = s.toUpperCase(); if (su === 'PASS') return '<span class="badge badge-pass">Pass</span>'; if (su === 'FAIL') return '<span class="badge badge-critical">Fail</span>'; if (su.startsWith('NOT RUN')) return '<span class="badge badge-assumed">Not Run</span>'; return `<span style="color:#6c757d">${_h(s)}</span>`; }
  const stackRows = (ut.stacks || []).map(s => `<tr><td>${_h(s.name)}</td><td style="text-align:center">${s.in_scope}</td><td>${pctBadge(s.pre_pct)}</td><td>${pctBadge(s.post_pct)}</td><td>${runBadge(s.run_status)}</td></tr>`).join('');
  const stackSection = stackRows ? `<h3>Per Stack</h3><table><thead><tr><th>Stack</th><th>Controls In Scope</th><th>Pre-Existing</th><th>With Generated Tests</th><th>Run Status</th></tr></thead><tbody>${stackRows}</tbody></table>` : '';
  return `${verdictBanner(vText, vCss, vDetail)}\n${_reportLink('security_unit_test_coverage.html', 'Unit Test Coverage')}\n<h3>Coverage</h3>\n${bars}<p style="font-size:12px;color:#6c757d;margin:4px 0 4px">Bands: 0\u201329 Critical &middot; 30\u201349 High Risk &middot; 50\u201374 Partial &middot; 75\u2013100 Good</p>${summaryLine}${stackSection}`;
}

// ---------------------------------------------------------------------------
// SPA CSS and JS constants
// ---------------------------------------------------------------------------
// Due to size, _SPA_CSS and _SPA_JS are defined inline in buildSpa below
// (they match the Python source exactly).

function _renderRedactedChips(html) {
  return html.replace(/\[REDACTED-([A-Z0-9\-]+)\]/g, (_, id) =>
    `<span class="redacted-chip">[REDACTED-${id}]</span>`);
}

// ---------------------------------------------------------------------------
// SPA assembly
// ---------------------------------------------------------------------------
function buildSpa(art, st, verd, appName, genDate, opts = {}) {
  const { repo_name = '', branch = '', sha = '', repo_colour = '#003366' } = opts;

  const tabs = [
    ['panel-dashboard', 'Dashboard'],
    ['panel-remediation', 'Remediation Plan'],
    ['panel-common', 'Common Issues'],
    ['panel-chains', 'Attack Chains'],
    ['panel-threat-model', 'Threat Model'],
    ['panel-asvs', 'ASVS'],
    ['panel-cas', 'Compliance'],
    ['panel-dr', 'Resiliency &amp; DR'],
    ['panel-scans', 'Tool Scans'],
    ['panel-security-reqs', 'Security Reqs'],
  ];
  if (art.sa) {
    const tmIdx = tabs.findIndex(([tid]) => tid === 'panel-threat-model');
    tabs.splice(tmIdx >= 0 ? tmIdx : 4, 0, ['panel-security-arch', 'Security Arch']);
  }
  if (art.ut_stats) {
    tabs.splice(tabs.length - 1, 0, ['panel-unit-tests', 'Unit Tests']);
  }
  if (art.ra) {
    tabs.push(['panel-risk-register', 'Risk Register']);
  }

  const tabButtons = tabs.map(([tid, lbl]) =>
    `<button class="tab-btn" data-tab="${tid}" onclick="switchTab('${tid}')">${lbl}</button>`
  ).join('\n    ');

  const contents = {
    'panel-dashboard': _tabDashboard(st, verd, art, appName, genDate),
    'panel-remediation': _tabRemediation(st),
    'panel-common': _tabCommon(st),
    'panel-chains': _tabChains(st, verd),
    'panel-threat-model': _tabSkill(st, verd, 'threat_model', 'Threat Model', verd.tm, 'threat_model.html'),
    'panel-asvs': _tabSkill(st, verd, 'asvs_level2_security_assessment', 'ASVS Level 2', verd.asvs, 'asvs_level2_security_assessment.html'),
    'panel-cas': _tabSkill(st, verd, 'cybersecurity_architecture_standard_compliance', 'CAS', verd.cas, 'cybersecurity_architecture_standard_compliance.html'),
    'panel-dr': _tabDr(st, verd, art),
    'panel-scans': _tabScans(st, verd, art),
    'panel-security-reqs': _tabSecurityReqs(st, art),
  };
  if (art.sa) contents['panel-security-arch'] = _tabSecurityArch(art);
  if (art.ut_stats) contents['panel-unit-tests'] = _tabUnitTests(art);
  if (art.ra) contents['panel-risk-register'] = _tabRiskRegister(art);

  const panels = tabs.map(([tid, lbl]) =>
    `<div class="tab-panel" id="${tid}">\n<h2>${lbl}</h2>\n${contents[tid]}\n</div>`
  ).join('\n');

  const repoStrip = repo_name ? `<div class="repo-strip" style="background:${_h(repo_colour)};"></div>` : '';
  const repoBadge = repo_name ? `<span class="repo-badge" style="background:${_h(repo_colour)};">${_h(repo_name)}</span>` : '';
  const branchShaLine = (branch && sha) ? `    <div>${_h(branch)} &middot; ${_h(sha)}</div>\n` : '';

  // _SPA_CSS is loaded from file-inline to keep this file manageable
  // For exact match with Python, we embed the full CSS string
  const SPA_CSS = readFileSync(path.join(__dirname, 'generate_overview_html.js'), 'utf-8').length > 0 ? _getSpaCSS() : '';

  const SPA_JS = `
  function switchTab(id) {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
    document.getElementById(id).classList.add('active');
    document.querySelector('[data-tab="' + id + '"]').classList.add('active');
    sessionStorage.setItem('activeTab', id);
  }
  function filterSev(containerId, sev) {
    const el = document.getElementById(containerId);
    if (!el) return;
    el.querySelectorAll('.finding-card,.kc-card,.finding-stub').forEach(c => {
      c.classList.toggle('hidden', sev !== 'all' && c.dataset.sev !== sev);
    });
  }
  function filterType(containerId, type) {
    const el = document.getElementById(containerId);
    if (!el) return;
    el.querySelectorAll('.finding-card').forEach(c => {
      c.classList.toggle('hidden', c.dataset.type !== type);
    });
  }
  function dismissScopeNotice() {
    document.querySelector('.scope-notice')?.classList.add('hidden');
    sessionStorage.setItem('scopeDismissed', '1');
  }
  (function() {
    if (sessionStorage.getItem('scopeDismissed')) {
      document.querySelector('.scope-notice')?.classList.add('hidden');
    }
    var saved = sessionStorage.getItem('activeTab');
    if (saved && document.getElementById(saved)) switchTab(saved);
    else switchTab('panel-dashboard');
  })();`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${_h(appName)} \u2014 Security Assessment Overview \u2014 Security Assessment</title>
  <style>${SPA_CSS}</style>
</head>
<body>
${repoStrip}
<div class="rpt-header">
  <div>
    <div class="brand">Security Assessment \u2014 Cybersecurity</div>
    <h1>${_h(appName)}</h1>
    <div class="report-type">Security Assessment Overview</div>
  </div>
  <div class="meta">
    <div>${repoBadge}</div>
    <div>Generated: ${genDate}</div>
${branchShaLine}    <div>PROTECTED B</div>
  </div>
</div>
<div class="gold-bar"></div>
<div class="scope-notice">
  <span class="sn-text">&#9432; <strong>Code Review Scope</strong> \u2014 Findings are based on static
  analysis of source code, configuration, and documentation. Environmental controls are partially assumed
  per the Environment Baseline but not independently verified. Confirm with your operations or
  security team before closing any finding.</span>
  <button class="sn-dismiss" onclick="dismissScopeNotice()">Dismiss</button>
</div>
<nav class="tab-nav">
    ${tabButtons}
</nav>
${panels}
<div class="rpt-footer">
  Security Assessment \u2014 Cybersecurity Assessment &nbsp;|&nbsp;
  Generated: ${genDate} &nbsp;|&nbsp; Protected B
</div>
<script>${SPA_JS}</script>
</body>
</html>`;
}

// Full _SPA_CSS as a function (matches Python _SPA_CSS constant exactly)
function _getSpaCSS() {
  return `:root{--brand-blue:#003366;--brand-blue-med:#005eb8;--brand-gold:#FFBA35;--critical:#c0392b;--high:#d35400;--medium:#c4960b;--low:#2471a3;--pass:#1e8449;--assumed:#6c757d;--border:#dee2e6;--bg-page:#f4f6f8;--bg-card:#ffffff;--text:#212529;--code-bg:#1e2733;--code-fg:#e8eaf0}*{box-sizing:border-box;margin:0;padding:0}body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Helvetica Neue",Arial,sans-serif;font-size:14px;color:var(--text);background:var(--bg-page);line-height:1.6}.repo-strip{height:12px}.rpt-header{background:var(--brand-blue);color:#fff;padding:16px 40px 20px;display:flex;justify-content:space-between;align-items:flex-end}.rpt-header .brand{font-size:11px;opacity:.65;text-transform:uppercase;letter-spacing:.09em;margin-bottom:8px}.rpt-header h1{font-size:26px;font-weight:700;line-height:1.15;margin-bottom:5px}.rpt-header .report-type{font-size:12px;opacity:.70;text-transform:uppercase;letter-spacing:.07em}.rpt-header .meta{text-align:right;font-size:12px;opacity:.88;line-height:2.0}.repo-badge{display:inline-block;padding:2px 10px;border-radius:10px;font-size:11px;font-family:"Cascadia Code","Consolas","Courier New",monospace;font-weight:600;color:#fff}.gold-bar{height:4px;background:var(--brand-gold)}.scope-notice{background:#fff8e1;border-bottom:2px solid #e6ab00;padding:9px 20px;font-size:12px;color:#4a3200;display:flex;align-items:center;gap:12px}.scope-notice.hidden{display:none}.scope-notice .sn-text{flex:1;line-height:1.5}.scope-notice .sn-dismiss{background:none;border:1px solid #c9950a;border-radius:3px;padding:2px 8px;font-size:11px;color:#4a3200;cursor:pointer}.tab-nav{display:flex;background:var(--brand-blue);border-bottom:3px solid var(--brand-gold);overflow-x:auto;padding:0 16px}.tab-btn{padding:11px 16px;border:none;background:none;color:rgba(255,255,255,.75);cursor:pointer;font-size:13px;font-weight:500;white-space:nowrap;border-bottom:3px solid transparent;margin-bottom:-3px;transition:all .15s}.tab-btn:hover{color:#fff;background:rgba(255,255,255,.08)}.tab-btn.active{color:#fff;border-bottom-color:var(--brand-gold)}.tab-panel{display:none;padding:24px 28px;max-width:1100px;margin:0 auto}.tab-panel.active{display:block}h2{font-size:17px;color:var(--brand-blue);border-bottom:2px solid var(--brand-blue);padding-bottom:6px;margin:0 0 16px}h3{font-size:15px;margin:18px 0 8px;font-weight:600;color:#222}h4{font-size:14px;margin:12px 0 6px;font-weight:600;color:#444}p{margin:8px 0}ul,ol{margin:8px 0 8px 24px}li{margin:3px 0}a{color:var(--brand-blue-med)}strong{font-weight:600}hr{border:none;border-top:1px solid var(--border);margin:16px 0}.badge{display:inline-block;padding:2px 8px;border-radius:3px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.04em;white-space:nowrap}.badge-critical{background:var(--critical);color:#fff}.badge-high{background:var(--high);color:#fff}.badge-medium{background:var(--medium);color:#fff}.badge-low{background:var(--low);color:#fff}.badge-pass,.badge-compliant{background:var(--pass);color:#fff}.badge-assumed{background:var(--assumed);color:#fff}table{width:100%;border-collapse:collapse;margin:12px 0;font-size:13px}th{background:var(--brand-blue);color:#fff;padding:8px 12px;text-align:left;font-weight:600}td{padding:7px 12px;border-bottom:1px solid var(--border);vertical-align:top}tr:nth-child(even) td{background:#f8f9fa}tr:hover td{background:#eef3fb}pre{background:var(--code-bg);color:var(--code-fg);border-radius:5px;padding:14px 16px;overflow-x:auto;font-family:"Cascadia Code","Consolas",monospace;font-size:12.5px;line-height:1.5;margin:10px 0}code{background:#e9ecef;color:#b03060;padding:1px 5px;border-radius:3px;font-family:"Cascadia Code","Consolas",monospace;font-size:12.5px}pre code{background:none;color:inherit;padding:0}blockquote{border-left:4px solid var(--brand-blue);background:#f0f4fb;padding:10px 16px;margin:10px 0;border-radius:0 4px 4px 0}blockquote p{margin:0}.finding-card{border-left:5px solid var(--border);padding:12px 16px;margin:10px 0;border-radius:0 4px 4px 0;background:#fdfdfd}.finding-card.critical{border-color:var(--critical)}.finding-card.high{border-color:var(--high)}.finding-card.medium{border-color:var(--medium)}.finding-card.low{border-color:var(--low)}.finding-card.hidden{display:none}.status-banner{border-radius:8px;padding:14px 18px;margin-bottom:16px;display:flex;align-items:flex-start;gap:14px}.status-banner .sb-icon{font-size:28px;line-height:1;flex-shrink:0;margin-top:2px}.status-banner .sb-body{flex:1}.status-banner .sb-title{font-size:16px;font-weight:700;margin-bottom:3px}.status-banner .sb-detail{font-size:13px;line-height:1.5}.sb-critical{background:#fdf1f1;border:2px solid var(--critical)}.sb-critical .sb-icon,.sb-critical .sb-title{color:var(--critical)}.sb-critical .sb-detail{color:#721c24}.sb-high{background:#fff4ee;border:2px solid var(--high)}.sb-high .sb-icon,.sb-high .sb-title{color:var(--high)}.sb-high .sb-detail{color:#7c2d12}.sb-medium{background:#fffbeb;border:2px solid var(--medium)}.sb-medium .sb-icon,.sb-medium .sb-title{color:#92400e}.sb-medium .sb-detail{color:#78350f}.sb-pass{background:#d4edda;border:2px solid var(--pass)}.sb-pass .sb-icon,.sb-pass .sb-title{color:var(--pass)}.sb-pass .sb-detail{color:#155724}.sb-info{background:#f8f9fa;border:2px solid var(--assumed)}.sb-info .sb-icon,.sb-info .sb-title{color:var(--assumed)}.sb-info .sb-detail{color:#555}.filter-bar{margin:12px 0;display:flex;flex-wrap:wrap;gap:6px;align-items:center}.filter-btn{border:1px solid var(--border);background:#fff;padding:4px 10px;border-radius:3px;font-size:12px;cursor:pointer}.filter-btn:hover{background:#eef3fb}.metric-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:12px;margin-bottom:20px}.metric-card{background:var(--bg-card);border:1px solid var(--border);border-radius:6px;padding:14px;text-align:center}a.metric-card{color:inherit;text-decoration:none;display:block;transition:border-color .15s,box-shadow .15s}a.metric-card:hover{border-color:var(--brand-blue-med);box-shadow:0 2px 8px rgba(0,53,102,.18);text-decoration:none}a.metric-card::after{content:"\u2197";display:block;font-size:10px;color:var(--brand-blue-med);margin-top:4px;opacity:0;transition:opacity .15s}a.metric-card:hover::after{opacity:1}.metric-val{font-size:22px;font-weight:700;color:var(--brand-blue)}.metric-lbl{font-size:11px;color:#6c757d;margin-top:4px;text-transform:uppercase}.chip{display:inline-block;padding:2px 7px;border-radius:10px;font-size:11px;font-weight:600;margin:1px}.chip-threat-model{background:#dbeafe;color:#1e40af}.chip-asvs{background:#dcfce7;color:#166534}.chip-cas{background:#fef9c3;color:#854d0e}.chip-dr{background:#cffafe;color:#155e75}.chip-scans{background:#f3e8ff;color:#6b21a8}.chip-unknown{background:#f1f5f9;color:#475569}.redacted-chip{display:inline-block;background:#fff0f0;border:1px solid #f5c6c6;color:#9b1c1c;font-family:"Cascadia Code","Consolas",monospace;font-size:11px;padding:1px 5px;border-radius:3px;font-weight:600}.priority-num{display:inline-block;background:var(--brand-blue);color:#fff;border-radius:50%;width:22px;height:22px;text-align:center;line-height:22px;font-size:11px;font-weight:700;margin-right:6px;vertical-align:middle}.elevated-badge{display:inline-block;background:#fff0f0;border:1px solid #f5c6c6;color:#9b1c1c;font-size:11px;padding:3px 8px;border-radius:3px;font-weight:600;margin-top:5px}.chain-breaks{font-size:11px;color:#6c757d;margin-top:3px}.kc-link{font-size:11px;background:#dbeafe;color:#1e40af;padding:1px 5px;border-radius:3px;font-weight:600;margin:1px;display:inline-block}details.finding-detail{margin-top:8px}details.finding-detail>summary{font-size:12px;color:var(--brand-blue-med);cursor:pointer;user-select:none;list-style:none}details.finding-detail>summary::-webkit-details-marker{display:none}details.finding-detail>summary:hover{text-decoration:underline}details.finding-detail>pre{margin-top:6px}details.finding-detail>ul{margin:6px 0 4px 18px}details.finding-detail>ul>li{font-size:12px;color:#444;margin:3px 0;line-height:1.5}.dr-band{display:inline-block;padding:2px 10px;border-radius:4px;font-size:12px;font-weight:600;color:#fff;margin-left:8px}.action-item{display:flex;align-items:flex-start;gap:10px;padding:10px 14px;background:#fff;border:1px solid var(--border);border-radius:4px;margin:6px 0;border-left:4px solid var(--brand-blue)}.action-num{background:var(--brand-blue);color:#fff;border-radius:50%;min-width:24px;height:24px;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;flex-shrink:0;margin-top:2px}.action-text{flex:1;font-size:13px}.assess-table{width:auto;min-width:380px}.file-ref{margin:4px 0 3px;font-size:12px;color:#555}.file-ref code{background:#f0f4fb;color:#2c5f8a;font-size:11px;padding:2px 7px;border-radius:3px;border:1px solid #c8d8ee;font-family:"Cascadia Code","Consolas",monospace}.file-ref-extra{font-size:11px;color:#888;margin-top:2px}.file-ref-extra code{font-size:10px;background:#f8f9fa;color:#555;padding:1px 4px;border-radius:2px;border:1px solid #ddd;font-family:"Cascadia Code","Consolas",monospace}.assess-table td{padding:5px 12px}.xref-refs{font-size:11px;color:#555;margin-left:6px}.xref-link{color:var(--brand-blue-med);text-decoration:none;background:#eef4fb;padding:1px 5px;border-radius:3px;border:1px solid #c8d8ee;font-size:11px;font-weight:600;margin:1px;display:inline-block}.xref-link:hover{text-decoration:underline}.remed-summary{width:100%;border-collapse:collapse;font-size:13px;margin:10px 0 20px}.remed-summary th,.remed-summary td{text-align:left;padding:6px 9px;border-bottom:1px solid #e8e8e8}.remed-summary th{background:#f5f7fa;font-weight:600;font-size:12px;color:#333}.remed-summary tr:hover td{background:#f9fbff}.remed-summary a{color:var(--brand-blue-med);text-decoration:none;font-weight:600}.remed-summary a:hover{text-decoration:underline}.remed-summary code{font-size:11px;background:#f0f4fb;color:#2c5f8a;padding:1px 5px;border-radius:3px;font-family:"Cascadia Code","Consolas",monospace}.hotspot-table{width:100%;border-collapse:collapse;font-size:13px;margin:10px 0 20px}.hotspot-table th,.hotspot-table td{text-align:left;padding:6px 9px;border-bottom:1px solid #e8e8e8}.hotspot-table th{background:#f5f7fa;font-weight:600;font-size:12px;color:#333}.hotspot-table tr:hover td{background:#f9fbff}.hotspot-fname{font-size:11px;background:#f0f4fb;color:#2c5f8a;padding:2px 6px;border-radius:3px;font-family:"Cascadia Code","Consolas",monospace;border:1px solid #c8d8ee}.hotspot-count{display:inline-block;min-width:22px;height:22px;border-radius:11px;text-align:center;line-height:22px;font-size:12px;font-weight:700;background:#e9ecef;color:#495057}.hotspot-count-multi{background:#343a40;color:#fff}.hotspot-assess{display:inline-block;font-size:10px;font-weight:700;background:#e8f4ff;color:#1a5a8a;padding:2px 5px;border-radius:3px;border:1px solid #c0d8f0;margin:1px}.hotspot-ct{display:inline-block;font-size:10px;background:#f5f5f8;color:#555;padding:1px 5px;border-radius:3px;border:1px solid #dde;margin:1px}.hotspot-cc-links a{color:var(--brand-blue-med);text-decoration:none;font-weight:600;font-size:12px;margin-right:4px}.hotspot-cc-links a:hover{text-decoration:underline}.kc-card{background:var(--bg-card);border:1px solid var(--border);border-radius:6px;padding:16px;margin:12px 0}.kc-card.critical{border-left:4px solid var(--critical)}.kc-card.high{border-left:4px solid var(--high)}.kc-header{margin-bottom:12px}.kc-steps{border-left:2px solid var(--border);padding-left:14px;margin:12px 0}.kc-step{display:flex;gap:10px;margin:8px 0;font-size:13px}.kc-step-num{background:var(--brand-blue);color:#fff;border-radius:50%;width:22px;height:22px;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;flex-shrink:0}.kc-fix{background:#f0fdf4;border:1px solid #bbf7d0;border-radius:4px;padding:8px 12px;margin-top:10px;font-size:13px}.context-panel{background:#fff;border:1px solid #c5cedb;border-top:3px solid var(--brand-blue);border-radius:0 0 6px 6px;box-shadow:0 2px 6px rgba(0,0,0,0.07);padding:14px 18px;margin:0 0 18px}.context-panel-title{font-size:13px;font-weight:700;color:var(--brand-blue);border-bottom:1px solid #e9ecef;padding-bottom:8px;margin-bottom:12px}.tactic-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:6px;margin:8px 0}.tactic-cell{border-radius:4px;padding:8px 10px;font-size:12px;border:1px solid transparent}.tactic-critical{background:#fde8e8;border-color:#f5c6c6;color:#7b0000}.tactic-high{background:#fef3e2;border-color:#fcd9a0;color:#7a3800}.tactic-medium{background:#fffbeb;border-color:#fde68a;color:#7a5800}.tactic-low{background:#e8f4fd;border-color:#b8d8f0;color:#1a4a6e}.tactic-grid-note{font-size:11px;color:#6c757d;margin-top:8px;font-style:italic}.data-class-table{width:100%;border-collapse:collapse;font-size:13px}.data-class-table th{background:var(--brand-blue);color:#fff;padding:7px 12px;text-align:left;font-weight:600;font-size:12px}.data-class-table td{padding:7px 12px;border-bottom:1px solid var(--border);vertical-align:top}.data-class-table tr:last-child td{border-bottom:none}.data-class-table tr:hover td{background:#f0f4fb}.data-class-note{font-size:11px;color:#6c757d;margin-top:8px;font-style:italic}.dr-radar-box{text-align:center}.dr-radar-title{font-size:13px;font-weight:700;color:var(--brand-blue);border-bottom:1px solid #e9ecef;padding-bottom:8px;margin-bottom:12px;text-align:left}.dfd-note{font-size:11px;color:#6c757d;margin-top:8px;font-style:italic}.dfd-note a{color:var(--brand-blue-med)}.rpt-footer{text-align:center;font-size:11px;color:#6c757d;padding:16px 40px;border-top:1px solid var(--border);background:#f4f6f8;margin-top:10px}@media print{body{background:#fff}.rpt-header,.tab-nav{display:none}.tab-panel{display:block!important;padding:8px 0}}@media(max-width:768px){.rpt-header{flex-direction:column;gap:8px}.rpt-header .meta{text-align:left}.tab-btn{padding:10px 10px;font-size:12px}}.finding-stub{border-left:3px solid var(--border);padding:8px 14px;margin:6px 0;border-radius:0 4px 4px 0;background:#f8f9fa;font-size:13px}.finding-stub.critical{border-color:var(--critical)}.finding-stub.high{border-color:var(--high)}.finding-stub.medium{border-color:var(--medium)}.finding-stub.low{border-color:var(--low)}.finding-stub.hidden{display:none}.stub-common-link{font-size:11px;font-weight:600;color:var(--brand-blue-med);text-decoration:none;margin-left:8px;text-transform:uppercase;letter-spacing:.04em}.stub-common-link:hover{text-decoration:underline}details.stub-detail{margin-top:6px}details.stub-detail>summary{font-size:12px;color:var(--brand-blue-med);cursor:pointer;user-select:none;list-style:none}details.stub-detail>summary::-webkit-details-marker{display:none}details.stub-detail>summary:hover{text-decoration:underline}.stub-detail-body{margin-top:8px;padding-top:8px;border-top:1px solid #e9ecef}.stub-section-header{margin-top:16px;padding:8px 0 4px;border-top:1px solid var(--border);font-size:12px;color:#6c757d}`;
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------
function main() {
  const args = process.argv.slice(2);
  let repoRoot = '.';
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--repo-root' && i + 1 < args.length) repoRoot = args[++i];
  }

  const repo = path.resolve(repoRoot);
  const dataDir = path.join(repo, '.ai', 'blueteam', 'data');
  const reportsDir = path.join(repo, '.ai', 'blueteam', 'reports');

  if (!existsSync(dataDir)) {
    process.stderr.write(`ERROR: ${dataDir} does not exist.\n`);
    process.exit(1);
  }
  mkdirSync(reportsDir, { recursive: true });

  console.log('Loading artifacts...');
  const art = loadArtifacts(dataDir);
  art.ut_stats = _readUtStats(reportsDir);

  if (!art.cc && !art.sr && !art.dr && !art.scans) {
    process.stderr.write('ERROR: No assessment artifacts found in .ai/blueteam/data/\n');
    process.stderr.write('Run at least one assessment skill before generating the overview.\n');
    process.exit(1);
  }

  let appName = art.app_name || (art.kc || {}).application_name || '\u2014';
  const genDate = new Date().toISOString().slice(0, 10);
  const rid = _repoIdentity(repo);
  console.log(`  Repo: ${rid.repo_name}  branch: ${rid.branch || '\u2014'}  sha: ${rid.sha || '\u2014'}`);
  if (appName === '\u2014') appName = _prettifyRepoName(rid.repo_name);

  console.log('Computing statistics and verdicts...');
  const st = computeStats(art);
  const verd = computeVerdicts(st, art);
  st.cc_html_exists = existsSync(path.join(reportsDir, 'code_changes.html'));

  console.log('Building HTML...');
  let html = buildSpa(art, st, verd, appName, genDate, {
    repo_name: rid.repo_name, branch: rid.branch, sha: rid.sha, repo_colour: rid.colour,
  });
  html = _renderRedactedChips(html);

  const outPath = path.join(reportsDir, 'security_overview.html');
  writeFileSync(outPath, html, 'utf-8');
  console.log(`  OK  ${outPath}`);

  // Broken-link check
  const linkedMatches = html.matchAll(/href="([^"#][^"]*\.html)"/g);
  const linked = new Set();
  for (const m of linkedMatches) {
    if (!m[1].startsWith('http://') && !m[1].startsWith('https://') && !m[1].startsWith('//')) linked.add(m[1]);
  }
  const missingLinks = [...linked].filter(lnk => !existsSync(path.join(reportsDir, lnk))).sort();
  if (missingLinks.length) {
    console.log('\nWARN: BROKEN LINKS \u2014 the following files are linked but do not exist:');
    for (const lnk of missingLinks) console.log(`     MISSING: .ai/blueteam/reports/${lnk}`);
    console.log('  Run generate_report_html.js or the missing skill to fix these.\n');
  }

  console.log(`\nOverall risk: ${verd.overall_risk}`);
  console.log(`Exploitability: ${verd.exploit_label}`);
  console.log(`Code changes: ${st.total_cc}  Security requirements: ${st.total_sr}`);
  console.log(`Kill chains: ${st.total_kc}  DR gaps: ${st.total_dr}  Scan findings: ${st.total_scans}  Verification tests: ${st.total_vtests}`);
  console.log(`Elevation map entries: ${Object.keys(st.elevation_map).length}  Chain participation entries: ${Object.keys(st.participation_map).length}`);
  console.log('\nDone.');
}

main();
