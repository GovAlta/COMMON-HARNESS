#!/usr/bin/env node
/**
 * generate_requirements_report.js — regenerate .ai/blueteam/reports/security_requirements.md
 * and optionally .ai/blueteam/reports/security_requirements.html from the authoritative
 * .ai/blueteam/data/security_requirements.json.
 *
 * Usage:
 *     node generate_requirements_report.js [--repo-root /path/to/repo]
 *     node generate_requirements_report.js --repo-root . --no-html
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ---------------------------------------------------------------------------
// Priority ordering
// ---------------------------------------------------------------------------

const _PRI_ORDER = { critical: 0, high: 1, medium: 2, low: 3 };
const _PRI_LABEL = { critical: 'Critical', high: 'High', medium: 'Medium', low: 'Low' };

const ASSESSMENT_LABELS = {
  threat_model: 'Threat Model',
  cybersecurity_architecture_standard_compliance: 'CAS Compliance',
  asvs_level2_security_assessment: 'ASVS Level 2',
  dr_resilience_analysis: 'DR Resilience',
  kill_chain_aggregator: 'Kill Chain Aggregator',
};

function _assessmentLabel(key) {
  return ASSESSMENT_LABELS[key] || key;
}

function _assessmentLabelsShort(key) {
  const shorts = {
    threat_model: 'TM',
    cybersecurity_architecture_standard_compliance: 'CAS',
    asvs_level2_security_assessment: 'ASVS',
    dr_resilience_analysis: 'DR',
    kill_chain_aggregator: 'KC',
  };
  return shorts[key] || key;
}

function _sourceStr(src) {
  const finding = src.finding_id || '';
  const short = _assessmentLabelsShort(src.assessment || '');
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

function _summaryTableForPriority(entries, priority) {
  const rows = [
    '| ID | Title | Related Code Change | Kill Chains | CAS Rules | ASVS |',
    '|---|---|---|---|---|---|',
  ];
  for (const e of entries) {
    const sid = e.id || '';
    const title = e.title || '';
    const cc = _listOrDash(e.related_code_change_ids || []);
    const kcs = _listOrDash(e.kill_chain_ids || e.related_kill_chains || []);
    const cas = _listOrDash(e.cas_rules || e.cas_rules || []);
    const asvs = _listOrDash(e.asvs_refs || e.asvs_requirements || []);
    rows.push(`| ${sid} | ${title} | ${cc} | ${kcs} | ${cas} | ${asvs} |`);
  }
  return rows.join('\n');
}

function _detailSection(e) {
  const sid = e.id || '';
  const title = e.title || '';
  const pri = _PRI_LABEL[(e.priority || 'low').toLowerCase()] || 'Low';
  const sourcesStr = _sourcesStr(e);
  const reqText = e.normative_text || e.requirement_text || '';
  const criteria = e.acceptance_criteria || [];
  const criteriaMd = criteria.length
    ? criteria.map(c => `- ${c}`).join('\n')
    : '- (none specified)';

  return `### ${sid} \u2014 ${title}

**Priority:** ${pri} | **Sources:** ${sourcesStr}

${reqText}

**Acceptance Criteria:**
${criteriaMd}

---`;
}

function _generatedByLabel(assessments) {
  const labels = assessments
    .filter(a => a !== 'kill_chain_aggregator')
    .map(a => _assessmentLabel(a));
  return labels.length ? labels.join(', ') + ' assessments' : 'assessment(s)';
}

function generateMd(data) {
  let allEntries = data.requirements || data.entries || data.items || [];
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
  const appName = data.application || data.app_name || '';

  // Group by priority
  const grouped = { critical: [], high: [], medium: [], low: [] };
  for (const e of allEntries) {
    const p = (e.priority || 'low').toLowerCase();
    if (!grouped[p]) grouped[p] = [];
    grouped[p].push(e);
  }

  const sections = [];
  for (const pri of ['critical', 'high', 'medium', 'low']) {
    const group = grouped[pri] || [];
    if (!group.length) continue;
    const label = _PRI_LABEL[pri];
    const table = _summaryTableForPriority(group, pri);
    sections.push(`### ${label} Priority\n\n${table}\n\n---`);
  }

  const summarySections = sections.join('\n\n');
  const detailSections = allEntries.map(e => _detailSection(e)).join('\n\n');
  const execTable = _execSummaryTable(allEntries);
  const total = allEntries.length;

  const kcElevated = allEntries.some(
    e =>
      String(e.title || '').includes('elevated') ||
      (e.sources || []).some(s => s.assessment === 'kill_chain_aggregator')
  );

  const appSubtitle = appName ? `\n## ${appName}` : '';

  return `# Security Requirements${appSubtitle}

**Schema Version:** ${schemaVersion}
**Last Updated:** ${lastUpdated}
**Generated By:** ${generatedBy}

---

## Executive Summary

${execTable}

These security requirements were derived from cross-referencing findings across assessments. ${kcElevated ? 'Five requirements were elevated in priority by the Kill Chain Aggregator upon identification of cross-domain attack chains.' : ''}

---

## Security Requirements

${summarySections}

---

## Requirement Details

${detailSections}
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
  const jsonPath = path.join(repo, '.ai', 'blueteam', 'data', 'security_requirements.json');
  const mdPath = path.join(repo, '.ai', 'blueteam', 'reports', 'security_requirements.md');
  const htmlScript = path.join(__dirname, 'generate_report_html.js');

  if (!existsSync(jsonPath)) {
    process.stderr.write(`ERROR: ${jsonPath} not found\n`);
    process.exit(1);
  }

  let data = JSON.parse(readFileSync(jsonPath, 'utf-8'));
  // Handle raw arrays — wrap in expected object format
  if (Array.isArray(data)) {
    data = { requirements: data, generated_at_date: new Date().toISOString().slice(0, 10) };
  }
  const entries = data.requirements || data.entries || data.items || [];
  const count = entries.length;

  const mdContent = generateMd(data);
  mkdirSync(path.dirname(mdPath), { recursive: true });
  writeFileSync(mdPath, mdContent, 'utf-8');
  console.log(`  OK  ${mdPath}  (${count} SR entries)`);

  if (!noHtml) {
    if (!existsSync(htmlScript)) {
      process.stderr.write(
        `WARNING: generate_report_html.js not found at ${htmlScript}, skipping HTML\n`
      );
    } else {
      try {
        execFileSync(process.execPath, [htmlScript, '--file', mdPath, '--repo-root', repo], {
          stdio: ['pipe', 'pipe', 'pipe'],
        });
        const htmlPath = mdPath.replace(/\.md$/, '.html');
        console.log(`  OK  ${htmlPath}`);
      } catch (e) {
        process.stderr.write(`WARNING: HTML generation failed:\n${e.stderr || e.message}\n`);
      }
    }
  }

  console.log(`\nDone. ${count} security requirement(s) written.`);
}

main();
