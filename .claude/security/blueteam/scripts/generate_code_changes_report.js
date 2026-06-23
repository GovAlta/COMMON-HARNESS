#!/usr/bin/env node
/**
 * generate_code_changes_report.js — regenerate .ai/blueteam/reports/code_changes.md
 * and optionally .ai/blueteam/reports/code_changes.html from the authoritative
 * .ai/blueteam/data/code_changes.json.
 *
 * Usage:
 *     node generate_code_changes_report.js [--repo-root /path/to/repo]
 *     node generate_code_changes_report.js --repo-root . --no-html
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ---------------------------------------------------------------------------
// Priority ordering and labels
// ---------------------------------------------------------------------------

const _PRI_ORDER = { critical: 0, high: 1, medium: 2, low: 3 };
const _PRI_LABEL = { critical: 'Critical', high: 'High', medium: 'Medium', low: 'Low' };

const ASSESSMENT_LABELS = {
  threat_model: 'Threat Model',
  cybersecurity_architecture_standard_compliance: 'CAS Compliance',
  asvs_level2_security_assessment: 'ASVS Level 2',
  dr_resilience_analysis: 'DR Resilience',
  kill_chain_aggregator: 'Kill Chain Aggregator',
  cybersecurity_tool_use: 'Tool Scan',
};

const _ASSESSMENT_SHORT = {
  threat_model: 'TM',
  cybersecurity_architecture_standard_compliance: 'CAS',
  asvs_level2_security_assessment: 'ASVS',
  dr_resilience_analysis: 'DR',
  kill_chain_aggregator: 'KC',
  cybersecurity_tool_use: 'Tools',
};

const CHANGE_TYPE_LABELS = {
  fix: 'Fix',
  add: 'Add',
  remove: 'Remove',
  refactor: 'Refactor',
};

// ---------------------------------------------------------------------------
// Field helpers
// ---------------------------------------------------------------------------

function _assessmentLabel(key) {
  return ASSESSMENT_LABELS[key] || key;
}

function _assessmentShort(key) {
  return _ASSESSMENT_SHORT[key] || key;
}

function _sourceStr(src) {
  const finding = src.finding_id || '';
  const short = _assessmentShort(src.assessment || '');
  return finding ? `${finding} (${short})` : short;
}

function _sourcesStr(entry) {
  const sources = entry.sources || [];
  if (!sources.length) return '\u2014';
  return sources.map(s => _sourceStr(s)).join(', ');
}

function _listOrDash(items) {
  if (!items || !items.length) return '\u2014';
  return items.map(String).join(', ');
}

function _getCasRules(entry) {
  const top = entry.cas_rules || [];
  if (top.length) return top;
  const seen = [];
  for (const src of (entry.sources || [])) {
    for (const rule of (src.cas_rules || [])) {
      if (!seen.includes(rule)) seen.push(rule);
    }
  }
  return seen;
}

function _getAsvsRefs(entry) {
  const top = entry.asvs_requirements || entry.asvs_refs || [];
  if (top.length) return top;
  const seen = [];
  for (const src of (entry.sources || [])) {
    for (const ref of (src.asvs_refs || src.asvs_requirements || [])) {
      if (!seen.includes(ref)) seen.push(ref);
    }
  }
  return seen;
}

function _generatedByLabel(assessments) {
  const skip = new Set(['kill_chain_aggregator', 'cybersecurity_tool_use']);
  const labels = assessments.filter(a => !skip.has(a)).map(a => _assessmentLabel(a));
  return labels.length ? labels.join(', ') + ' assessments' : 'assessment(s)';
}

function _fileBasename(fp) {
  if (!fp) return '\u2014';
  return fp.includes('/') ? fp.split('/').pop() : fp;
}

// ---------------------------------------------------------------------------
// Markdown generators
// ---------------------------------------------------------------------------

function _execSummaryTable(entries) {
  const counts = { critical: 0, high: 0, medium: 0, low: 0 };
  for (const e of entries) {
    const pri = (e.priority || 'low').toLowerCase();
    counts[pri] = (counts[pri] || 0) + 1;
  }
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  const lines = ['| Priority | Count |', '|---|---|'];
  for (const pri of ['critical', 'high', 'medium', 'low']) {
    lines.push(`| ${_PRI_LABEL[pri]} | ${counts[pri]} |`);
  }
  lines.push(`| **Total** | **${total}** |`);
  return lines.join('\n');
}

function _summaryTableForPriority(entries) {
  const rows = [
    '| ID | Title | File | Line | Type | Related Requirements |',
    '|---|---|---|---|---|---|',
  ];
  for (const e of entries) {
    const cid = e.id || '';
    const title = e.title || '';
    const fp = _fileBasename(e.file_path || '');
    const lr = String(e.line_reference || '') || '\u2014';
    const ct = CHANGE_TYPE_LABELS[e.change_type] || e.change_type || '\u2014';
    const sr = _listOrDash(e.related_requirement_ids || []);
    rows.push(`| ${cid} | ${title} | \`${fp}\` | ${lr} | ${ct} | ${sr} |`);
  }
  return rows.join('\n');
}

function _detailSection(e) {
  const cid = e.id || '';
  const title = e.title || '';
  const pri = _PRI_LABEL[(e.priority || 'low').toLowerCase()] || 'Low';
  const ct = CHANGE_TYPE_LABELS[e.change_type] || e.change_type || '\u2014';
  const sourcesStr = _sourcesStr(e);
  const description = (e.description || '').trim();
  const fp = e.file_path || '\u2014';
  const lr = String(e.line_reference || '');
  const current = (e.current_code_summary || '').trim();
  const replacement = (e.replacement_code || '').trim();
  const srRefs = _listOrDash(e.related_requirement_ids || []);
  const casRules = _listOrDash(_getCasRules(e));
  const asvsRefs = _listOrDash(_getAsvsRefs(e));
  const affected = e.affected_files || [];
  const elevation = (e.priority_elevation_note || '').trim();

  const fileRef = lr && lr !== '\u2014' ? `\`${fp}\` lines ${lr}` : `\`${fp}\``;

  const lines = [`### ${cid} \u2014 ${title}`, ''];
  lines.push(`**Priority:** ${pri} | **Type:** ${ct} | **Sources:** ${sourcesStr}`);
  lines.push(`**Primary file:** ${fileRef}`);
  if (srRefs !== '\u2014') lines.push(`**Related requirements:** ${srRefs}`);
  if (casRules !== '\u2014') lines.push(`**CAS rules:** ${casRules}`);
  if (asvsRefs !== '\u2014') lines.push(`**ASVS:** ${asvsRefs}`);
  if (elevation) lines.push(`**Elevation note:** ${elevation}`);
  lines.push('');

  if (description) { lines.push(description); lines.push(''); }
  if (current) { lines.push('**Current construct:**'); lines.push(`> ${current}`); lines.push(''); }
  if (replacement) { lines.push('**Replacement code:**'); lines.push('```'); lines.push(replacement); lines.push('```'); lines.push(''); }

  const extra = affected.filter(f => f !== fp);
  if (extra.length) {
    lines.push(`**Also affects (${extra.length} additional file(s)):**`);
    for (const af of extra) lines.push(`- \`${af}\``);
    lines.push('');
  }

  lines.push('---');
  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Top-level generator
// ---------------------------------------------------------------------------

function generateMd(data) {
  let allEntries = data.changes || data.entries || data.items || [];
  allEntries = [...allEntries].sort((a, b) => {
    const pa = _PRI_ORDER[(a.priority || 'low').toLowerCase()] ?? 99;
    const pb = _PRI_ORDER[(b.priority || 'low').toLowerCase()] ?? 99;
    if (pa !== pb) return pa - pb;
    return (a.id || '').localeCompare(b.id || '');
  });

  const assessments = data.generated_by_assessments || [];
  const generatedBy = _generatedByLabel(assessments);
  const lastUpdated = data.last_updated || data.generated_at_date || '';
  const schemaVersion = data.schema_version || '1.0';
  const application = (data.application || '').trim();
  const classification = (data.classification || '').trim();
  const commit = (data.generated_at_commit || '').trim();

  const grouped = { critical: [], high: [], medium: [], low: [] };
  for (const e of allEntries) {
    const p = (e.priority || 'low').toLowerCase();
    if (!grouped[p]) grouped[p] = [];
    grouped[p].push(e);
  }

  const summarySections = [];
  for (const pri of ['critical', 'high', 'medium', 'low']) {
    const group = grouped[pri] || [];
    if (!group.length) continue;
    const table = _summaryTableForPriority(group);
    summarySections.push(`### ${_PRI_LABEL[pri]} Priority\n\n${table}\n\n---`);
  }

  const summaryBlock = summarySections.join('\n\n');
  const detailBlock = allEntries.map(e => _detailSection(e)).join('\n\n');
  const execTable = _execSummaryTable(allEntries);
  const total = allEntries.length;

  const kcElevated = allEntries.some(e => e.priority_elevation_note);

  const appLine = application ? `\n**Application:** ${application}` : '';
  const classLine = classification ? `\n**Classification:** ${classification}` : '';
  const commitLine = commit ? `\n**Commit:** \`${commit}\`` : '';

  const elevationNote = kcElevated
    ? '  \nSome changes were elevated in priority by the Kill Chain Aggregator upon identification of cross-domain attack chains.'
    : '';

  return `# Code Changes${appLine}${classLine}

**Schema Version:** ${schemaVersion}
**Last Updated:** ${lastUpdated}
**Generated By:** ${generatedBy}${commitLine}

---

## Executive Summary

${execTable}

These code changes were derived from cross-referencing findings across assessments.${elevationNote}

---

## Code Changes by Priority

${summaryBlock}

---

## Change Details

${detailBlock}
`;
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

function main() {
  const args = process.argv.slice(2);
  let repoRoot = '.';
  let noHtml = false;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--repo-root' && i + 1 < args.length) {
      repoRoot = args[++i];
    } else if (args[i] === '--no-html') {
      noHtml = true;
    }
  }

  const repo = path.resolve(repoRoot);
  const jsonPath = path.join(repo, '.ai', 'blueteam', 'data', 'code_changes.json');
  const mdPath = path.join(repo, '.ai', 'blueteam', 'reports', 'code_changes.md');
  const htmlScript = path.join(__dirname, 'generate_report_html.js');

  if (!existsSync(jsonPath)) {
    process.stderr.write(`ERROR: ${jsonPath} not found\n`);
    process.exit(1);
  }

  let data = JSON.parse(readFileSync(jsonPath, 'utf-8'));
  // Handle raw arrays — wrap in expected object format
  if (Array.isArray(data)) {
    data = { entries: data, generated_at_date: new Date().toISOString().slice(0, 10) };
  }
  const entries = data.changes || data.entries || data.items || [];
  const count = entries.length;

  const mdContent = generateMd(data);
  mkdirSync(path.dirname(mdPath), { recursive: true });
  writeFileSync(mdPath, mdContent, 'utf-8');
  console.log(`  OK  ${mdPath}  (${count} CC entries)`);

  if (!noHtml) {
    if (!existsSync(htmlScript)) {
      process.stderr.write(
        `WARNING: generate_report_html.js not found at ${htmlScript}, skipping HTML\n`
      );
    } else {
      try {
        execFileSync(process.execPath, [htmlScript, '--repo-root', repo], {
          stdio: ['pipe', 'pipe', 'pipe'],
        });
        const htmlPath = mdPath.replace(/\.md$/, '.html');
        console.log(`  OK  ${htmlPath}`);
      } catch (e) {
        process.stderr.write(`WARNING: HTML generation failed:\n${e.stderr || e.message}\n`);
      }
    }
  }

  console.log(`\nDone. ${count} code change(s) written.`);
}

main();
