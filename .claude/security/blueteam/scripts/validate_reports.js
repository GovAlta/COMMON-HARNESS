#!/usr/bin/env node
/**
 * validate_reports.js — BlueTeam Security Assessment Report Validator
 *
 * Checks that all expected .md/.html report pairs exist in .ai/reports/, that
 * every internal .html link inside security_overview.html resolves to a real
 * file in the same directory, and that required JSON data artifacts are present
 * in .ai/data/ given the reports that have been generated.
 *
 * Usage:
 *     node <BlueTeam>/scripts/validate_reports.js --repo-root /path/to/repo
 *     node <BlueTeam>/scripts/validate_reports.js              # uses cwd
 *
 * Exit codes:
 *     0 — all checks pass
 *     1 — one or more checks failed (missing files, broken links, or missing artifacts)
 */

import { readFileSync, readdirSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ---------------------------------------------------------------------------
// Mojibake detection
// ---------------------------------------------------------------------------

const _MOJIBAKE_SEQUENCES = [
  ['\\u00e2\\u20ac\\u201d', 'em dash (\u2014)'],
  ['\\u00e2\\u20ac\\u201c', 'en dash (\u2013)'],
  ['\\u00e2\\u20ac\\u2122', 'right single quote (\u2019)'],
  ['\\u00e2\\u20ac\\u0153', 'left double quote (\u201c)'],
  ['\\u00e2\\u20ac\\u009d', 'right double quote (\u201d)'],
  ['\\u00c2\\u00a0', 'non-breaking space'],
];

// ---------------------------------------------------------------------------
// Artifact structure validation
// ---------------------------------------------------------------------------

const _ARTIFACT_REQUIRED_KEYS = {
  'dr_resilience_assessment.json': [
    'overall_score',
    'dimensions',
    'gaps',
    'recommendations',
  ],
  'security_architecture.json': [
    'profile',
    'profile_confidence',
    'mode',
    'gaps',
  ],
  'code_changes.json': [['changes', 'entries', 'items']],
  'security_requirements.json': [['requirements', 'entries', 'items']],
  'kill_chains.json': ['chains'],
  'verification_tests.json': [['tests', 'items']],
  'security-scan-results.json': ['findings'],
};

// ---------------------------------------------------------------------------
// Canonical assessment source names
// ---------------------------------------------------------------------------

const _CANONICAL_ASSESSMENT_NAMES = new Set([
  'threat_model',
  'asvs_level2_security_assessment',
  'cybersecurity_architecture_standard_compliance',
  'dr_resilience_analysis',
  'cybersecurity_tool_use',
  'kill_chain_aggregator',
  'security_architecture_design',
]);

// ---------------------------------------------------------------------------
// Expected report pairs
// ---------------------------------------------------------------------------

const EXPECTED_PAIRS = [
  ['threat_model.md', 'threat_model.html'],
  ['asvs_level2_security_assessment.md', 'asvs_level2_security_assessment.html'],
  ['cybersecurity_architecture_standard_compliance.md', 'cybersecurity_architecture_standard_compliance.html'],
  ['security-classification.md', 'security-classification.html'],
  ['application_map.md', 'application_map.html'],
  ['cross_domain_kill_chains.md', 'cross_domain_kill_chains.html'],
  ['dr_resilience_assessment.md', 'dr_resilience_assessment.html'],
  ['security_overview.md', 'security_overview.html'],
  ['security_unit_test_coverage.md', 'security_unit_test_coverage.html'],
];

const OPTIONAL_PAIRS = [
  ['security_requirements.md', 'security_requirements.html'],
  ['code_changes.md', 'code_changes.html'],
  ['security-test-coverage-report.md', 'security-test-coverage-report.html'],
  ['security_architecture.md', 'security_architecture.html'],
];

const OVERVIEW_REQUIRED_LINKS = [
  'security-classification.html',
];

// ---------------------------------------------------------------------------
// Data artifact rules
// ---------------------------------------------------------------------------

const _DATA_ARTIFACT_RULES = [
  [
    [
      'threat_model.md',
      'asvs_level2_security_assessment.md',
      'cybersecurity_architecture_standard_compliance.md',
    ],
    'code_changes.json',
  ],
  [
    [
      'threat_model.md',
      'asvs_level2_security_assessment.md',
      'cybersecurity_architecture_standard_compliance.md',
    ],
    'security_requirements.json',
  ],
  [
    [
      'threat_model.md',
      'asvs_level2_security_assessment.md',
      'cybersecurity_architecture_standard_compliance.md',
      'cross_domain_kill_chains.md',
    ],
    'verification_tests.json',
  ],
  [['cross_domain_kill_chains.md'], 'kill_chains.json'],
  [['dr_resilience_assessment.md'], 'dr_resilience_assessment.json'],
  [['security_architecture.md'], 'security_architecture.json'],
];

const _VALID_CHANGE_TYPES = new Set(['fix', 'add', 'remove', 'refactor']);

const _CC_REQUIRED_FIELDS = [
  'file_path',
  'line_reference',
  'description',
  'change_type',
  'related_requirement_ids',
];

const _SR_REQUIRED_FIELDS = [
  'related_code_change_ids',
];

// ---------------------------------------------------------------------------
// Check functions
// ---------------------------------------------------------------------------

function _checkPairs(reportsDir, pairs, optional) {
  const errors = [];
  const tag = optional ? 'OPTIONAL' : 'MISSING';
  for (const [mdName, htmlName] of pairs) {
    const mdPath = path.join(reportsDir, mdName);
    const htmlPath = path.join(reportsDir, htmlName);
    if (optional && !existsSync(mdPath)) continue;
    if (!existsSync(mdPath)) errors.push(`  ${tag}  ${mdName}`);
    if (!existsSync(htmlPath)) errors.push(`  ${tag}  ${htmlName}`);
  }
  return errors;
}

function _checkDataArtifacts(dataDir, reportsDir) {
  const errors = [];
  const checked = new Set();
  for (const [triggers, artifact] of _DATA_ARTIFACT_RULES) {
    if (checked.has(artifact)) continue;
    checked.add(artifact);
    const presentTriggers = triggers.filter(t => existsSync(path.join(reportsDir, t)));
    if (!presentTriggers.length) continue;
    if (!existsSync(path.join(dataDir, artifact))) {
      errors.push(
        `  MISSING DATA  ${artifact} (required because ${presentTriggers[0]} is present)`
      );
    }
  }

  // app_topology.json zone field check
  const topologyPath = path.join(dataDir, 'app_topology.json');
  if (existsSync(topologyPath)) {
    try {
      const topology = JSON.parse(readFileSync(topologyPath, 'utf-8'));
      const badZones = (topology.zones || [])
        .filter(z => !('fill' in z) || !('label_color' in z))
        .map(z => z.id || '?');
      if (badZones.length) {
        errors.push(
          `  TOPOLOGY ERROR  app_topology.json zones missing fill/label_color fields: ${JSON.stringify(badZones)}`
        );
      }
    } catch (exc) {
      errors.push(`  TOPOLOGY ERROR  app_topology.json is not valid JSON: ${exc.message}`);
    }
  }

  return errors;
}

function _checkArtifactStructure(dataDir) {
  const errors = [];
  for (const [filename, requiredKeys] of Object.entries(_ARTIFACT_REQUIRED_KEYS)) {
    const artifactPath = path.join(dataDir, filename);
    if (!existsSync(artifactPath)) continue;
    let data;
    try {
      data = JSON.parse(readFileSync(artifactPath, 'utf-8'));
    } catch {
      continue;
    }
    if (typeof data !== 'object' || data === null || Array.isArray(data)) {
      errors.push(`  SCHEMA ERROR  ${filename}: top-level value is not a JSON object`);
      continue;
    }
    const missing = [];
    for (const key of requiredKeys) {
      if (Array.isArray(key)) {
        if (!key.some(k => k in data)) {
          missing.push(`one of ${JSON.stringify(key)}`);
        }
      } else {
        if (!(key in data)) {
          missing.push(`'${key}'`);
        }
      }
    }
    if (missing.length) {
      errors.push(
        `  SCHEMA ERROR  ${filename}: missing required key(s): ${missing.join(', ')} \u2014 overview tab will render empty without these fields`
      );
    }
  }
  return errors;
}

function _checkSaGapEnumValues(dataDir) {
  const errors = [];
  const saPath = path.join(dataDir, 'security_architecture.json');
  if (!existsSync(saPath)) return errors;

  let sa;
  try {
    sa = JSON.parse(readFileSync(saPath, 'utf-8'));
  } catch (exc) {
    errors.push(`  security_architecture.json could not be parsed: ${exc.message}`);
    return errors;
  }

  const _VALID_CATEGORIES = new Set([
    'authentication', 'authorization_model', 'data_protection',
    'perimeter', 'logging', 'api_architecture', 'profile',
  ]);
  const _VALID_SEVERITIES = new Set(['Critical', 'High', 'Medium', 'Low']);
  const _VALID_STATUSES = new Set(['open', 'risk_accepted']);
  const _VALID_MODES = new Set(['full', 'describe', 'design', 'minimal']);
  const _VALID_PROFILES = new Set(['internal', 'public', 'dual', 'custom', 'unknown']);
  const _VALID_CONFIDENCE = new Set(['high', 'medium', 'low']);

  const mode = sa.mode || '';
  if (mode && !_VALID_MODES.has(mode)) {
    errors.push(`  security_architecture.json: mode=${JSON.stringify(mode)} is not canonical (valid: ${JSON.stringify([..._VALID_MODES].sort())})`);
  }
  const profile = sa.profile || '';
  if (profile && !_VALID_PROFILES.has(profile)) {
    errors.push(`  security_architecture.json: profile=${JSON.stringify(profile)} is not canonical (valid: ${JSON.stringify([..._VALID_PROFILES].sort())})`);
  }
  const confidence = sa.profile_confidence || '';
  if (confidence && !_VALID_CONFIDENCE.has(confidence)) {
    errors.push(`  security_architecture.json: profile_confidence=${JSON.stringify(confidence)} is not canonical (valid: ${JSON.stringify([..._VALID_CONFIDENCE].sort())})`);
  }

  for (const gap of (sa.gaps || [])) {
    const gid = gap.id || '?';
    const cat = gap.category || '';
    if (cat && !_VALID_CATEGORIES.has(cat)) {
      errors.push(`  security_architecture.json: ${gid} category=${JSON.stringify(cat)} is not canonical -- gaps with non-canonical categories are silently excluded from the Gap Severity Distribution table in security_overview.html (valid: ${JSON.stringify([..._VALID_CATEGORIES].sort())})`);
    }
    const sev = gap.severity || '';
    if (sev && !_VALID_SEVERITIES.has(sev)) {
      errors.push(`  security_architecture.json: ${gid} severity=${JSON.stringify(sev)} is not canonical (valid: ${JSON.stringify([..._VALID_SEVERITIES].sort())})`);
    }
    const status = gap.status || '';
    if (status && !_VALID_STATUSES.has(status)) {
      errors.push(`  security_architecture.json: ${gid} status=${JSON.stringify(status)} is not canonical (valid: ${JSON.stringify([..._VALID_STATUSES].sort())})`);
    }
  }

  return errors;
}

function _checkJsonMojibake(dataDir) {
  const errors = [];
  let files;
  try {
    files = readdirSync(dataDir).filter(f => f.endsWith('.json')).sort();
  } catch {
    return errors;
  }
  for (const jsonFile of files) {
    let raw;
    try {
      raw = readFileSync(path.join(dataDir, jsonFile), 'utf-8');
    } catch {
      continue;
    }
    const hits = [];
    for (const [seq, label] of _MOJIBAKE_SEQUENCES) {
      let count = 0;
      let idx = raw.indexOf(seq);
      while (idx !== -1) {
        count++;
        idx = raw.indexOf(seq, idx + 1);
      }
      if (count) hits.push(`${count}\u00d7 ${label}`);
    }
    if (hits.length) {
      errors.push(`  MOJIBAKE  ${jsonFile}: ${hits.join(', ')}`);
    }
  }
  return errors;
}

function _checkCcReplacementCode(dataDir) {
  const warnings = [];
  const ccPath = path.join(dataDir, 'code_changes.json');
  if (!existsSync(ccPath)) return warnings;
  let data;
  try {
    data = JSON.parse(readFileSync(ccPath, 'utf-8'));
  } catch {
    return warnings;
  }
  const entries = data.changes || data.entries || data.items || [];
  const missing = entries
    .filter(e => !(e.replacement_code || '').trim())
    .map(e => e.id || '?');
  if (missing.length) {
    warnings.push(
      `  WARN  ${missing.length}/${entries.length} CC entr${missing.length === 1 ? 'y' : 'ies'} missing replacement_code \u2014 "Show fix" will not appear for: ${missing.join(', ')}\n  Fix: run skills/11-code-fix-generation.md to populate replacement_code`
    );
  }
  return warnings;
}

function _checkCcSrFieldNames(dataDir) {
  const errors = [];

  // code_changes.json
  const ccPath = path.join(dataDir, 'code_changes.json');
  if (existsSync(ccPath)) {
    let data = {};
    try { data = JSON.parse(readFileSync(ccPath, 'utf-8')); } catch { data = {}; }
    const entries = data.changes || data.entries || data.items || [];

    const _WRONG_CC_ALIASES = [
      ['file', 'file_path'],
      ['line_range', 'line_reference'],
      ['change_description', 'description'],
    ];
    for (const [wrong, correct] of _WRONG_CC_ALIASES) {
      const offenders = entries.filter(e => wrong in e).map(e => e.id || '?');
      if (offenders.length) {
        const sample = offenders.slice(0, 5).join(', ') + (offenders.length > 5 ? '...' : '');
        errors.push(
          `  CC FIELD ERROR  code_changes.json: field "${wrong}" should be "${correct}" in ${offenders.length} entr${offenders.length === 1 ? 'y' : 'ies'} (${sample}) \u2014 Quick Ref / File Hotspot / card body will render empty`
        );
      }
    }

    for (const field of ['change_type', 'related_requirement_ids']) {
      const offenders = entries.filter(e => !(field in e)).map(e => e.id || '?');
      if (offenders.length) {
        const sample = offenders.slice(0, 5).join(', ') + (offenders.length > 5 ? '...' : '');
        errors.push(
          `  CC FIELD ERROR  code_changes.json: required field "${field}" absent in ${offenders.length} entr${offenders.length === 1 ? 'y' : 'ies'} (${sample})`
        );
      }
    }

    const badType = entries
      .filter(e => 'change_type' in e && !_VALID_CHANGE_TYPES.has(e.change_type))
      .map(e => e.id || '?');
    if (badType.length) {
      const sample = badType.slice(0, 5).join(', ') + (badType.length > 5 ? '...' : '');
      errors.push(
        `  CC FIELD ERROR  code_changes.json: invalid change_type value in ${badType.length} entr${badType.length === 1 ? 'y' : 'ies'} (${sample}) \u2014 must be one of: fix, add, remove, refactor`
      );
    }
  }

  // security_requirements.json
  const srPath = path.join(dataDir, 'security_requirements.json');
  if (existsSync(srPath)) {
    let data = {};
    try { data = JSON.parse(readFileSync(srPath, 'utf-8')); } catch { data = {}; }
    const entries = data.requirements || data.entries || data.items || [];

    const offenders = entries.filter(e => 'related_code_changes' in e).map(e => e.id || '?');
    if (offenders.length) {
      const sample = offenders.slice(0, 5).join(', ') + (offenders.length > 5 ? '...' : '');
      errors.push(
        `  SR FIELD ERROR  security_requirements.json: field "related_code_changes" should be "related_code_change_ids" in ${offenders.length} entr${offenders.length === 1 ? 'y' : 'ies'} (${sample}) \u2014 SR-to-CC back-links will not render in the overview report`
      );
    }
  }

  return errors;
}

function _checkAssessmentSourceNames(dataDir) {
  const errors = [];
  for (const filename of ['code_changes.json', 'security_requirements.json']) {
    const artifactPath = path.join(dataDir, filename);
    if (!existsSync(artifactPath)) continue;
    let data;
    try { data = JSON.parse(readFileSync(artifactPath, 'utf-8')); } catch { continue; }
    const entries = data.changes || data.requirements || data.entries || [];
    const bad = {};
    for (const entry of entries) {
      const entryId = entry.id || '?';
      for (const src of (entry.sources || [])) {
        const name = src.assessment || '';
        if (name && !_CANONICAL_ASSESSMENT_NAMES.has(name)) {
          if (!bad[name]) bad[name] = [];
          bad[name].push(entryId);
        }
      }
    }
    for (const [name, ids] of Object.entries(bad).sort()) {
      const sample = ids.slice(0, 5).join(', ') + (ids.length > 5 ? '...' : '');
      errors.push(
        `  SOURCE NAME ERROR  ${filename}: non-canonical assessment name "${name}" in ${ids.length} entr${ids.length === 1 ? 'y' : 'ies'} (${sample}) \u2014 overview verdicts will show Pass/Compliant incorrectly`
      );
    }
  }
  return errors;
}

function _checkGeneratedByCompleteness(dataDir) {
  const errors = [];
  for (const [filename, entryKey] of [
    ['code_changes.json', 'changes'],
    ['security_requirements.json', 'requirements'],
  ]) {
    const artifactPath = path.join(dataDir, filename);
    if (!existsSync(artifactPath)) continue;
    let data;
    try { data = JSON.parse(readFileSync(artifactPath, 'utf-8')); } catch { continue; }
    const declared = new Set(data.generated_by_assessments || []);
    const entries = data[entryKey] || data.entries || [];
    const found = new Set();
    for (const entry of entries) {
      for (const src of (entry.sources || [])) {
        const name = src.assessment || '';
        if (name) found.add(name);
      }
    }
    for (const name of [...found].sort()) {
      if (!declared.has(name)) {
        errors.push(
          `  GENERATED_BY_MISSING  ${filename}: assessment "${name}" has entries in sources[] but is absent from generated_by_assessments[] \u2014 overview will show this assessment as 'not run' (blank tab, wrong verdict, broken Dashboard link)`
        );
      }
    }
  }
  return errors;
}

function _checkCasTableArithmetic(reportsDir) {
  const errors = [];
  const casPath = path.join(reportsDir, 'cybersecurity_architecture_standard_compliance.md');
  if (!existsSync(casPath)) return [];

  const text = readFileSync(casPath, 'utf-8');
  const lines = text.split('\n');

  const tableLines = [];
  let inTable = false;
  let foundTotal = false;

  for (const line of lines) {
    const stripped = line.trim();
    if (stripped.startsWith('|')) {
      inTable = true;
      tableLines.push(stripped);
      if (/^\|\s*\*{0,2}[Tt]otal\*{0,2}\s*\|/i.test(stripped)) {
        foundTotal = true;
      }
    } else {
      if (inTable) {
        if (foundTotal) break;
        tableLines.length = 0;
        inTable = false;
        foundTotal = false;
      }
    }
  }

  if (!tableLines.length || !foundTotal) return [];

  const separatorPattern = /^[\|\s\-:]+$/;
  let headerRow = null;
  const dataRows = [];
  let totalRowCells = [];

  for (const row of tableLines) {
    const cells = row.split('|').slice(1, -1).map(c => c.trim());
    if (!cells.length) continue;
    if (separatorPattern.test(row)) continue;
    const firstCell = cells[0].replace(/\*+/g, '').trim();
    if (firstCell.toLowerCase() === 'total') {
      totalRowCells = cells;
    } else if (headerRow === null) {
      headerRow = cells;
    } else {
      dataRows.push(cells);
    }
  }

  if (!totalRowCells.length || !dataRows.length) return [];

  const numCols = Math.max(...dataRows.map(r => r.length));
  const colSums = new Array(numCols).fill(0);
  for (const row of dataRows) {
    for (let i = 0; i < row.length; i++) {
      if (i === 0) continue;
      const valStr = row[i].replace(/\*+/g, '').trim();
      const val = (valStr === '' || valStr === '\u2014' || valStr === '-') ? 0 : (parseInt(valStr, 10) || 0);
      if (i < colSums.length) colSums[i] += val;
    }
  }

  const headers = headerRow || [];
  for (let i = 0; i < totalRowCells.length; i++) {
    if (i === 0) continue;
    const valStr = totalRowCells[i].replace(/\*+/g, '').trim();
    if (valStr === '' || valStr === '\u2014' || valStr === '-') continue;
    const stated = parseInt(valStr, 10);
    if (isNaN(stated)) continue;
    const actual = i < colSums.length ? colSums[i] : 0;
    if (stated !== actual) {
      const hdr = i < headers.length ? headers[i].trim() : String(i);
      errors.push(
        `  CAS ARITHMETIC ERROR  compliance table column ${i} (header: '${hdr}'): Total = ${stated} but column sum = ${actual}`
      );
    }
  }

  return errors;
}

function _checkAsvsChapterSummary(reportsDir) {
  const errors = [];
  const asvsPath = path.join(reportsDir, 'asvs_level2_security_assessment.md');
  if (!existsSync(asvsPath)) return [];

  const text = readFileSync(asvsPath, 'utf-8');
  const _VERDICT_KEYWORDS = ['ASSUMED PASS', 'NOT APPLICABLE', 'PARTIAL', 'FAIL'];
  const chapterVerdicts = [];

  for (const line of text.split('\n')) {
    const stripped = line.trim();
    if (/^\|\s*V\d+\s*[\|\(]/.test(stripped)) {
      const cells = stripped.split('|').slice(1, -1).map(c => c.trim());
      if (!cells.length) continue;
      let verdict = null;
      for (const cell of cells) {
        const cellUpper = cell.replace(/\*+/g, '').toUpperCase().trim();
        for (const kw of _VERDICT_KEYWORDS) {
          if (cellUpper === kw || cellUpper.startsWith(kw)) {
            verdict = kw;
            break;
          }
        }
        if (verdict) break;
      }
      if (verdict) chapterVerdicts.push(verdict);
    }
  }

  if (!chapterVerdicts.length) return [];

  const actualCounts = {
    FAIL: 0,
    PARTIAL: 0,
    'ASSUMED PASS': 0,
    'NOT APPLICABLE': 0,
  };
  for (const v of chapterVerdicts) {
    if (v.startsWith('ASSUMED PASS')) actualCounts['ASSUMED PASS']++;
    else if (v === 'FAIL') actualCounts['FAIL']++;
    else if (v === 'PARTIAL') actualCounts['PARTIAL']++;
    else if (v.includes('NOT APPLICABLE')) actualCounts['NOT APPLICABLE']++;
  }

  let summaryLine = null;
  for (const line of text.split('\n')) {
    if (/\*\*chapter summary:\*\*/i.test(line)) {
      summaryLine = line;
      break;
    }
  }

  if (summaryLine === null) return [];

  for (const category of ['FAIL', 'PARTIAL', 'ASSUMED PASS', 'NOT APPLICABLE']) {
    const m = summaryLine.match(new RegExp(`(\\d+)\\s+${category.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'i'));
    if (m) {
      const stated = parseInt(m[1], 10);
      const actual = actualCounts[category];
      if (stated !== actual) {
        errors.push(
          `  ASVS CHAPTER SUMMARY ERROR  Chapter Summary footer says ${stated} ${category} but table has ${actual} ${category} rows`
        );
      }
    }
  }

  return errors;
}

function _checkKillChainElevationConsistency(reportsDir, dataDir) {
  const errors = [];
  const kcMdPath = path.join(reportsDir, 'cross_domain_kill_chains.md');
  const kcJsonPath = path.join(dataDir, 'kill_chains.json');
  if (!existsSync(kcMdPath) || !existsSync(kcJsonPath)) return [];

  let data;
  try { data = JSON.parse(readFileSync(kcJsonPath, 'utf-8')); } catch { return []; }

  let jsonCcCount = 0;
  let jsonSrCount = 0;
  for (const chain of (data.chains || [])) {
    for (const elev of (chain.priority_elevations || [])) {
      const artifactId = elev.artifact_id || '';
      if (artifactId.startsWith('CC-')) jsonCcCount++;
      else if (artifactId.startsWith('SR-')) jsonSrCount++;
    }
  }

  const text = readFileSync(kcMdPath, 'utf-8');
  const separatorPattern = /^[\|\s\-:]+$/;
  let inSection = false;
  let tableCcCount = 0;
  let tableSrCount = 0;

  for (const line of text.split('\n')) {
    const stripped = line.trim();
    if (/^#{1,3}\s+Priority Elevations/i.test(stripped)) {
      inSection = true;
      continue;
    }
    if (inSection && /^#{1,3}\s+/.test(stripped)) break;
    if (inSection && stripped.startsWith('|')) {
      if (separatorPattern.test(stripped)) continue;
      const cells = stripped.split('|').slice(1, -1).map(c => c.trim());
      if (!cells.length) continue;
      const first = cells[0];
      if (/^(artifact|id|finding)/i.test(first) && !/^(CC|SR)-\d+/.test(first)) continue;
      if (first.startsWith('CC-')) tableCcCount++;
      else if (first.startsWith('SR-')) tableSrCount++;
    }
  }

  if (jsonCcCount !== tableCcCount) {
    errors.push(
      `  ELEVATION COUNT MISMATCH  kill_chains.json has ${jsonCcCount} CC elevation(s) but Priority Elevations table in cross_domain_kill_chains.md has ${tableCcCount}`
    );
  }
  if (jsonSrCount !== tableSrCount) {
    errors.push(
      `  ELEVATION COUNT MISMATCH  kill_chains.json has ${jsonSrCount} SR elevation(s) but Priority Elevations table in cross_domain_kill_chains.md has ${tableSrCount}`
    );
  }

  return errors;
}

function _checkKillChainOverviewConsistency(reportsDir, dataDir) {
  const errors = [];
  const overviewPath = path.join(reportsDir, 'security_overview.md');
  const kcJsonPath = path.join(dataDir, 'kill_chains.json');
  if (!existsSync(overviewPath) || !existsSync(kcJsonPath)) return [];

  let data;
  try { data = JSON.parse(readFileSync(kcJsonPath, 'utf-8')); } catch { return []; }

  const jsonChains = {};
  const jsonTitles = {};
  for (const c of (data.chains || [])) {
    if (c.id) {
      jsonChains[c.id.toUpperCase()] = (c.severity || '').toLowerCase();
      jsonTitles[c.id.toUpperCase()] = c.title || c.id;
    }
  }

  const text = readFileSync(overviewPath, 'utf-8');
  let sectionText = '';
  let inSection = false;
  let attackChainsSectionFound = false;

  for (const line of text.split('\n')) {
    if (/^#{1,3}\s+Attack Chains/i.test(line)) {
      inSection = true;
      attackChainsSectionFound = true;
      continue;
    }
    if (inSection && /^#{1,3}\s+/.test(line)) break;
    if (inSection) sectionText += line + '\n';
  }

  const foundKcs = new Set();
  const kcRe = /KC-\d{3}/gi;
  let m;
  while ((m = kcRe.exec(sectionText)) !== null) {
    foundKcs.add(m[0].toUpperCase());
  }

  for (const kcId of [...foundKcs].sort()) {
    if (!(kcId in jsonChains)) {
      errors.push(`  KC MISMATCH  security_overview.md references ${kcId} which is not in kill_chains.json`);
      continue;
    }
    let sevInMd = null;
    for (const line of sectionText.split('\n')) {
      if (line.toUpperCase().includes(kcId)) {
        const sm = line.match(/\b(critical|high|medium|low)\b/i);
        if (sm) { sevInMd = sm[1].toLowerCase(); break; }
      }
    }
    if (sevInMd && sevInMd !== jsonChains[kcId]) {
      errors.push(`  KC MISMATCH  security_overview.md shows ${kcId} as ${sevInMd} but kill_chains.json has ${jsonChains[kcId]}`);
    }
  }

  if (attackChainsSectionFound) {
    for (const [kcId, title] of Object.entries(jsonTitles).sort()) {
      if (!foundKcs.has(kcId)) {
        errors.push(`  KC MISSING  kill_chains.json contains ${kcId} ("${title}") but it was not found in security_overview.md Attack Chains section`);
      }
    }
  }

  return errors;
}

function _checkOverviewLinks(reportsDir) {
  const overview = path.join(reportsDir, 'security_overview.html');
  if (!existsSync(overview)) {
    return ['  MISSING  security_overview.html (cannot check internal links)'];
  }

  const htmlText = readFileSync(overview, 'utf-8');
  const rawLinks = [];
  const re = /href="([^"#][^"]*\.html)"/g;
  let m;
  while ((m = re.exec(htmlText)) !== null) rawLinks.push(m[1]);

  const links = [...new Set(rawLinks)]
    .filter(lnk => !lnk.startsWith('http://') && !lnk.startsWith('https://') && !lnk.startsWith('//'))
    .sort();

  const errors = [];
  for (const link of links) {
    if (!existsSync(path.join(reportsDir, link))) {
      errors.push(`  BROKEN LINK  security_overview.html -> ${link}`);
    }
  }
  return errors;
}

function _checkKillChainSourceBackpropagation(dataDir) {
  const warnings = [];
  const kcPath = path.join(dataDir, 'kill_chains.json');
  const ccPath = path.join(dataDir, 'code_changes.json');
  if (!existsSync(kcPath) || !existsSync(ccPath)) return warnings;

  let kcData, ccData;
  try {
    kcData = JSON.parse(readFileSync(kcPath, 'utf-8'));
    ccData = JSON.parse(readFileSync(ccPath, 'utf-8'));
  } catch { return warnings; }

  const ccEntries = ccData.changes || ccData.entries || ccData.items || [];
  const ccSources = {};
  for (const entry of ccEntries) {
    const eid = entry.id || '';
    if (eid) {
      ccSources[eid] = new Set((entry.sources || []).map(s => s.assessment || ''));
    }
  }

  for (const chain of (kcData.chains || [])) {
    const chainAssessments = new Set(chain.source_assessments || []);
    if (chainAssessments.size < 2) continue;

    const fix = chain.chain_breaking_fix || {};
    if (typeof fix !== 'object' || fix === null) continue;
    const ccIds = fix.related_code_change_ids || [];

    const chainId = chain.id || '?';
    for (const ccId of ccIds) {
      if (!(ccId in ccSources)) continue;
      const missing = [...chainAssessments].filter(a => a && !ccSources[ccId].has(a));
      if (missing.length) {
        warnings.push(
          `  WARN  ${ccId} is the chain-breaking fix for cross-domain chain ${chainId} (source_assessments: ${JSON.stringify([...chainAssessments].sort())}) but is missing attribution for: ${JSON.stringify(missing.sort())} \u2014 run kill_chain_aggregator_skill Step 5c to back-propagate sources[]`
        );
      }
    }
  }

  return warnings;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function main() {
  const args = process.argv.slice(2);
  let repoRoot = '.';
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--repo-root' && i + 1 < args.length) {
      repoRoot = args[++i];
    }
  }

  const repo = path.resolve(repoRoot);
  const reportsDir = path.join(repo, '.ai', 'blueteam', 'reports');

  if (!existsSync(reportsDir)) {
    console.log(`ERROR: Reports directory not found: ${reportsDir}`);
    console.log('Run at least one BlueTeam assessment skill first.');
    process.exit(1);
  }

  console.log(`Validating reports in: ${reportsDir}\n`);

  const allErrors = [];

  // --- Required pairs ---
  console.log('Checking required report pairs...');
  const requiredErrors = _checkPairs(reportsDir, EXPECTED_PAIRS, false);
  if (requiredErrors.length) {
    console.log('  FAIL Missing required files:');
    for (const e of requiredErrors) console.log(e);
    allErrors.push(...requiredErrors);
  } else {
    console.log(`  PASS All ${EXPECTED_PAIRS.length} required pairs present`);
  }

  // --- Optional pairs ---
  console.log('\nChecking optional report pairs (only when .md is present)...');
  const optionalErrors = _checkPairs(reportsDir, OPTIONAL_PAIRS, true);
  if (optionalErrors.length) {
    console.log('  WARN Optional .md missing paired .html:');
    for (const e of optionalErrors) console.log(e);
    allErrors.push(...optionalErrors);
  } else {
    console.log('  PASS All present optional .md files have paired .html');
  }

  // --- JSON data artifacts ---
  console.log('\nChecking JSON data artifact completeness...');
  const dataDir = path.join(repo, '.ai', 'blueteam', 'data');
  if (existsSync(dataDir)) {
    const artifactErrors = _checkDataArtifacts(dataDir, reportsDir);
    if (artifactErrors.length) {
      console.log('  FAIL Missing or invalid data artifacts:');
      for (const e of artifactErrors) console.log(e);
      allErrors.push(...artifactErrors);
    } else {
      console.log('  PASS All required data artifacts present');
    }
  } else {
    console.log('  SKIP .ai/data/ directory not found \u2014 skipping artifact checks');
  }

  // --- Artifact structure check ---
  console.log('\nChecking JSON data artifact structure...');
  if (existsSync(dataDir)) {
    const structureErrors = _checkArtifactStructure(dataDir);
    if (structureErrors.length) {
      console.log('  FAIL Required top-level key(s) missing from data artifact(s):');
      for (const e of structureErrors) console.log(e);
      console.log('  Fix: re-run the producing skill and verify field names against ai_artifacts_schema.md');
      allErrors.push(...structureErrors);
    } else {
      console.log('  PASS All present data artifacts have required structure');
    }
  } else {
    console.log('  SKIP .ai/data/ directory not found \u2014 skipping structure check');
  }

  // --- Security architecture enum values ---
  console.log('\nChecking security_architecture.json enum values...');
  if (existsSync(dataDir)) {
    const saEnumErrors = _checkSaGapEnumValues(dataDir);
    if (saEnumErrors.length) {
      console.log('  FAIL Non-canonical enum value(s) in security_architecture.json:');
      for (const e of saEnumErrors) console.log(e);
      console.log('  Fix: use canonical snake_case names from skills/03-security-architecture.md Phase 5.3');
      console.log('       category: authentication | authorization_model | data_protection |');
      console.log('                 perimeter | logging | api_architecture | profile');
      console.log('       severity: Critical | High | Medium | Low');
      console.log('       status:   open | risk_accepted');
      allErrors.push(...saEnumErrors);
    } else {
      console.log('  PASS security_architecture.json enum values are canonical');
    }
  } else {
    console.log('  SKIP .ai/data/ directory not found \u2014 skipping SA enum check');
  }

  // --- Mojibake check ---
  console.log('\nChecking JSON data artifacts for encoding mojibake...');
  if (existsSync(dataDir)) {
    const mojibakeErrors = _checkJsonMojibake(dataDir);
    if (mojibakeErrors.length) {
      console.log('  FAIL CP1252 mojibake found \u2014 will render as garbled text in HTML reports:');
      for (const e of mojibakeErrors) console.log(e);
      console.log('  Fix: replace \\u00e2\\u20ac\\u201d with \\u2014 (em dash), etc., then re-run generate_overview_html.py');
      allErrors.push(...mojibakeErrors);
    } else {
      console.log('  PASS No mojibake found in data artifacts');
    }
  } else {
    console.log('  SKIP .ai/data/ directory not found \u2014 skipping mojibake check');
  }

  // --- CC replacement_code coverage ---
  console.log('\nChecking CC entries for replacement_code coverage...');
  if (existsSync(dataDir)) {
    const rcWarnings = _checkCcReplacementCode(dataDir);
    if (rcWarnings.length) {
      for (const w of rcWarnings) console.log(w);
    } else {
      console.log('  PASS All CC entries have replacement_code populated');
    }
  } else {
    console.log('  SKIP .ai/data/ directory not found \u2014 skipping replacement_code check');
  }

  // --- CC/SR entry field name validation ---
  console.log('\nChecking CC/SR entry field names against canonical schema...');
  if (existsSync(dataDir)) {
    const fieldNameErrors = _checkCcSrFieldNames(dataDir);
    if (fieldNameErrors.length) {
      console.log('  FAIL Non-canonical field name(s) in CC or SR entries:');
      for (const e of fieldNameErrors) console.log(e);
      console.log('  Fix: rename fields to match ai_artifacts_schema.md');
      console.log('       file->file_path, line_range->line_reference,');
      console.log('       change_description->description, add change_type,');
      console.log('       related_code_changes->related_code_change_ids (SR)');
      allErrors.push(...fieldNameErrors);
    } else {
      console.log('  PASS All CC/SR entry field names are canonical');
    }
  } else {
    console.log('  SKIP .ai/data/ directory not found \u2014 skipping field name check');
  }

  // --- Assessment source name validation ---
  console.log('\nChecking sources[].assessment values for canonical names...');
  if (existsSync(dataDir)) {
    const sourceNameErrors = _checkAssessmentSourceNames(dataDir);
    if (sourceNameErrors.length) {
      console.log('  FAIL Non-canonical assessment name(s) in data artifact(s):');
      for (const e of sourceNameErrors) console.log(e);
      console.log('  Fix: update sources[].assessment to use the canonical names listed in');
      console.log('       shared/schemas/artifacts.md \u00a7 risk_acceptances schema');
      allErrors.push(...sourceNameErrors);
    } else {
      console.log('  PASS All sources[].assessment values are canonical');
    }
  } else {
    console.log('  SKIP .ai/data/ directory not found \u2014 skipping source name check');
  }

  // --- generated_by_assessments completeness check ---
  console.log('\nChecking generated_by_assessments completeness...');
  if (existsSync(dataDir)) {
    const gbyErrors = _checkGeneratedByCompleteness(dataDir);
    if (gbyErrors.length) {
      console.log('  FAIL Assessment(s) missing from generated_by_assessments[]:');
      for (const e of gbyErrors) console.log(e);
      console.log('  Fix: add the assessment\'s canonical name to generated_by_assessments[]');
      console.log('       in code_changes.json and/or security_requirements.json');
      allErrors.push(...gbyErrors);
    } else {
      console.log('  PASS generated_by_assessments[] is complete');
    }
  } else {
    console.log('  SKIP .ai/data/ directory not found \u2014 skipping generated_by_assessments check');
  }

  // --- CAS table arithmetic ---
  console.log('\nChecking CAS compliance table arithmetic...');
  const casArithErrors = _checkCasTableArithmetic(reportsDir);
  if (casArithErrors.length) {
    console.log('  FAIL CAS compliance Total row does not match column sums:');
    for (const e of casArithErrors) console.log(e);
    allErrors.push(...casArithErrors);
  } else {
    console.log('  PASS CAS compliance Total row arithmetic correct');
  }

  // --- ASVS chapter summary ---
  console.log('\nChecking ASVS chapter summary footer counts...');
  const asvsSummaryErrors = _checkAsvsChapterSummary(reportsDir);
  if (asvsSummaryErrors.length) {
    console.log('  FAIL ASVS Chapter Summary footer counts do not match chapter table:');
    for (const e of asvsSummaryErrors) console.log(e);
    allErrors.push(...asvsSummaryErrors);
  } else {
    console.log('  PASS ASVS chapter summary footer counts match chapter table');
  }

  // --- Kill chain elevation consistency ---
  console.log('\nChecking kill chain elevation consistency (JSON vs MD table)...');
  if (existsSync(dataDir)) {
    const kcElevErrors = _checkKillChainElevationConsistency(reportsDir, dataDir);
    if (kcElevErrors.length) {
      console.log('  FAIL Kill chain elevation counts differ between kill_chains.json and MD table:');
      for (const e of kcElevErrors) console.log(e);
      allErrors.push(...kcElevErrors);
    } else {
      console.log('  PASS Kill chain elevation counts match');
    }
  } else {
    console.log('  SKIP .ai/data/ directory not found \u2014 skipping elevation consistency check');
  }

  // --- Kill chain overview consistency ---
  console.log('\nChecking kill chain IDs/severities in security_overview.md vs kill_chains.json...');
  if (existsSync(dataDir)) {
    const kcOvErrors = _checkKillChainOverviewConsistency(reportsDir, dataDir);
    if (kcOvErrors.length) {
      console.log('  FAIL Kill chain IDs/severities in overview do not match kill_chains.json:');
      for (const e of kcOvErrors) console.log(e);
      allErrors.push(...kcOvErrors);
    } else {
      console.log('  PASS Kill chain IDs/severities in overview match kill_chains.json');
    }
  } else {
    console.log('  SKIP .ai/data/ directory not found \u2014 skipping kill chain overview check');
  }

  // --- Kill chain source back-propagation check ---
  console.log('\nChecking kill chain source back-propagation...');
  if (existsSync(dataDir)) {
    const kcBackpropWarnings = _checkKillChainSourceBackpropagation(dataDir);
    if (kcBackpropWarnings.length) {
      for (const w of kcBackpropWarnings) console.log(w);
    } else {
      console.log('  PASS Kill chain sources back-propagated to CC entries');
    }
  } else {
    console.log('  SKIP .ai/data/ directory not found \u2014 skipping back-propagation check');
  }

  // --- Internal links in security_overview.html ---
  console.log('\nChecking internal links in security_overview.html...');
  const linkErrors = _checkOverviewLinks(reportsDir);
  if (linkErrors.length) {
    console.log('  FAIL Broken internal links:');
    for (const e of linkErrors) console.log(e);
    allErrors.push(...linkErrors);
  } else {
    console.log('  PASS All internal links resolve');
  }

  // --- Summary ---
  console.log();
  if (allErrors.length) {
    console.log(`RESULT: ${allErrors.length} issue(s) found.\n`);
    console.log('To fix missing .md files:');
    console.log('  -Re-run the skill that produces the missing report, OR');
    console.log('  -For .html-only gaps: run generate_report_html.py --repo-root <repo>');
    console.log();
    console.log('To fix missing data artifacts:');
    console.log('  -Re-run the skill that produces the missing artifact');
    console.log('  -See CLAUDE.md \u00a7 Required JSON Data Artifacts for the artifact-to-skill mapping');
    console.log();
    console.log('To fix app_topology.json zone errors:');
    console.log('  -Add fill and label_color to each zone object');
    console.log('  -See ai_schema_application_map.md \u00a7 Standard Zone Definitions');
    console.log();
    console.log('To fix broken links in security_overview.html:');
    console.log('  -Generate the missing report, then re-run generate_overview_html.py');
    console.log();
    console.log('To fix non-canonical security_architecture.json enum values:');
    console.log('  -Update gaps[].category to one of:');
    console.log('   authentication | authorization_model | data_protection |');
    console.log('   perimeter | logging | api_architecture | profile');
    console.log('  -Update gaps[].severity to one of: Critical | High | Medium | Low');
    console.log('  -Update gaps[].status to one of: open | risk_accepted');
    console.log('  -Update mode to: full | describe | design | minimal');
    console.log('  -Update profile to: internal | public | dual | custom | unknown');
    console.log('  -See: skills/03-security-architecture.md Phase 5.3 and Phase 7 schema');
    console.log();
    console.log('To fix non-canonical CC/SR entry field names:');
    console.log('  -Rename: file->file_path, line_range->line_reference,');
    console.log('   change_description->description in code_changes.json CC entries');
    console.log('  -Add: change_type (fix|add|remove|refactor) to each CC entry');
    console.log('  -Add: related_requirement_ids (SR-NNN list) to each CC entry');
    console.log('  -Rename: related_code_changes->related_code_change_ids in SR entries');
    console.log('  -See: shared/schemas/artifacts.md \u00a7 code_changes.json field table');
    console.log();
    console.log('To fix non-canonical assessment source names:');
    console.log('  -Update sources[].assessment in code_changes.json and security_requirements.json');
    console.log('  -Valid names: threat_model, asvs_level2_security_assessment,');
    console.log('   cybersecurity_architecture_standard_compliance, dr_resilience_analysis,');
    console.log('   cybersecurity_tool_use, kill_chain_aggregator,');
    console.log('   security_architecture_design');
    console.log();
    console.log('To fix CAS ARITHMETIC ERROR:');
    console.log('  -Re-sum each numeric column from data rows in the compliance table');
    console.log('  -Update the Total row to match the computed sums');
    console.log();
    console.log('To fix ASVS CHAPTER SUMMARY ERROR:');
    console.log('  -Count FAIL/PARTIAL/ASSUMED PASS/NOT APPLICABLE rows in the chapter table');
    console.log('  -Update the Chapter Summary footer line with the exact counts');
    console.log();
    console.log('To fix ELEVATION COUNT MISMATCH:');
    console.log('  -Re-run kill_chain_aggregator_skill to regenerate kill_chains.json and');
    console.log('   cross_domain_kill_chains.md in sync, OR');
    console.log('  -Manually reconcile the Priority Elevations table with kill_chains.json');
    console.log();
    console.log('To fix KC MISMATCH / KC MISSING:');
    console.log('  -Source ALL kill chain data exclusively from kill_chains.json');
    console.log('  -Do NOT copy KC IDs or severities from threat_model.md or');
    console.log('   cross_domain_kill_chains.md \u2014 re-run security_overview_report_skill');
    process.exit(1);
  } else {
    let total = EXPECTED_PAIRS.length;
    for (const [md] of OPTIONAL_PAIRS) {
      if (existsSync(path.join(reportsDir, md))) total++;
    }
    console.log(`RESULT: All ${total} report file(s) present. No broken links.\n`);
    process.exit(0);
  }
}

main();
