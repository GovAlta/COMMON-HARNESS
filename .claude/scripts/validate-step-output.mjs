#!/usr/bin/env node
/**
 * validate-step-output.mjs — structural lint for phase deliverables.
 *
 * Each phase produces a structured .md (e.g. requirements.md, plan.md,
 * architecture.md). This script reads that .md and the matching skill's
 * output-template.md, and verifies the deliverable has the required sections,
 * tables, and content blocks. Surfaces drift early — before a reviewer notices
 * the doc is missing its Critical Path section.
 *
 * Usage:
 *   node validate-step-output.mjs <skill-id> <output-path> [--template <filename>]
 *
 * Examples:
 *   node validate-step-output.mjs phase2-planning ./phases/phase2-planning/output/plan.md
 *   node validate-step-output.mjs phase6-user-testing ./phases/phase6-user-testing/output/test-plan.md
 *   node validate-step-output.mjs phase6-user-testing ./phases/phase6-user-testing/output/test-results.md \
 *        --template output-template-results.md
 *   node validate-step-output.mjs phase7-user-acceptance ./phases/phase7-user-acceptance/output/sign-off.md \
 *        --template output-template-signoff.md
 *
 * --template defaults to "output-template.md". Use it to lint Phase B
 * deliverables (test-results, sign-off, release-notes) against their
 * secondary templates.
 *
 * Exits 0 on pass, 1 on structural violations, 2 on missing inputs.
 *
 * The output-template.md format (in each skill's dir):
 *   Lines beginning with "## REQUIRED:" name a required section heading.
 *   Lines beginning with "## OPTIONAL:" name an optional section.
 *   Lines beginning with "## TABLE:" assert that a markdown table appears in the next required section.
 *   Lines beginning with "## MERMAID:" assert that a ```mermaid block appears.
 *   Everything else is documentation.
 *
 * Zero npm dependencies. Tested against Node ≥ 18.
 */

import fs from 'node:fs';
import path from 'node:path';

const argv = process.argv.slice(2);
let skillId = null, outputPath = null, templateName = 'output-template.md';
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a === '--template') templateName = argv[++i];
  else if (!skillId) skillId = a;
  else if (!outputPath) outputPath = a;
}
if (!skillId || !outputPath) {
  console.error('usage: validate-step-output.mjs <skill-id> <output-path> [--template <filename>]');
  process.exit(2);
}

import { fileURLToPath } from 'node:url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SKILL_DIR = path.resolve(__dirname, '..', 'skills', skillId);
const TEMPLATE  = path.join(SKILL_DIR, templateName);

if (!fs.existsSync(SKILL_DIR)) {
  console.error(`skill directory not found: ${SKILL_DIR}`);
  process.exit(2);
}
if (!fs.existsSync(TEMPLATE)) {
  // No template means no validation. Pass silently — opt-in.
  console.log(`validate: ${skillId} has no ${templateName} → skipped.`);
  process.exit(0);
}
if (!fs.existsSync(outputPath)) {
  console.error(`output not found: ${outputPath}`);
  process.exit(2);
}

const tmpl = fs.readFileSync(TEMPLATE, 'utf8');
const out  = fs.readFileSync(outputPath, 'utf8');

// Extract assertions from the template
const assertions = [];
for (const line of tmpl.split(/\r?\n/)) {
  let m;
  if ((m = line.match(/^##\s+REQUIRED:\s+(.+)$/))) assertions.push({ kind: 'section', required: true,  name: m[1].trim() });
  else if ((m = line.match(/^##\s+OPTIONAL:\s+(.+)$/))) assertions.push({ kind: 'section', required: false, name: m[1].trim() });
  else if ((m = line.match(/^##\s+TABLE:\s+(.+)$/)))    assertions.push({ kind: 'table',   underSection: m[1].trim() });
  else if ((m = line.match(/^##\s+MERMAID:\s+(.+)$/)))  assertions.push({ kind: 'mermaid', underSection: m[1].trim() });
}

// Walk the output's headings, building a map of heading → body content
const headings = [];
const lines = out.split(/\r?\n/);
let curHeading = null;
let curBody = [];
for (const line of lines) {
  const h = line.match(/^(#{1,6})\s+(.+)$/);
  if (h) {
    if (curHeading) headings.push({ ...curHeading, body: curBody.join('\n') });
    curHeading = { level: h[1].length, name: h[2].trim() };
    curBody = [];
  } else if (curHeading) {
    curBody.push(line);
  }
}
if (curHeading) headings.push({ ...curHeading, body: curBody.join('\n') });

const issues = [];
function err(message) { issues.push({ severity: 'error', message }); }
function warn(message) { issues.push({ severity: 'warn',  message }); }

// Check section assertions
for (const a of assertions.filter(x => x.kind === 'section')) {
  const found = headings.some(h => normalize(h.name).includes(normalize(a.name)));
  if (!found && a.required) err(`missing required section: "${a.name}"`);
  if (!found && !a.required) warn(`missing optional section: "${a.name}"`);
}

// Check table assertions — find the named section, verify body has a markdown table.
// Prefer the DEEPEST (smallest-scope) heading match so an H1 doc title
// containing the section name doesn't shadow the actual H2/H3 we mean.
function findSectionHeading(name) {
  const matches = headings.filter(x => normalize(x.name).includes(normalize(name)));
  if (matches.length === 0) return null;
  // Among matches, prefer:
  //   1. an exact normalized match (e.g. "uat script" === "uat script")
  //   2. otherwise the deepest heading level (largest level number = smallest section)
  const exact = matches.find(x => normalize(x.name) === normalize(name));
  if (exact) return exact;
  return matches.sort((a, b) => b.level - a.level)[0];
}

for (const a of assertions.filter(x => x.kind === 'table')) {
  const h = findSectionHeading(a.underSection);
  if (!h) {
    err(`table assertion: section "${a.underSection}" not found, can't check table presence`);
    continue;
  }
  const hasTable = /^\|.*\|/m.test(h.body) && /^\|[\s|:-]+\|/m.test(h.body);
  if (!hasTable) err(`section "${a.underSection}" must contain a markdown table`);
}

// Check mermaid assertions (use same deepest-match logic as tables)
for (const a of assertions.filter(x => x.kind === 'mermaid')) {
  const h = findSectionHeading(a.underSection);
  if (!h) {
    err(`mermaid assertion: section "${a.underSection}" not found`);
    continue;
  }
  const hasMermaid = /```mermaid[\s\S]+?```/m.test(h.body);
  if (!hasMermaid) err(`section "${a.underSection}" must contain a \`\`\`mermaid block`);
}

// Report
if (issues.length === 0) {
  console.log(`validate: ${skillId} → ${path.basename(outputPath)} ✓`);
  console.log(`  ${assertions.filter(a => a.kind==='section').length} sections, ${assertions.filter(a=>a.kind==='table').length} tables, ${assertions.filter(a=>a.kind==='mermaid').length} mermaid checks → all pass`);
  process.exit(0);
}

const errors = issues.filter(i => i.severity === 'error');
const warns  = issues.filter(i => i.severity === 'warn');
console.log(`validate: ${skillId} → ${path.basename(outputPath)}`);
if (errors.length) {
  console.log(`\n  ${errors.length} error(s):`);
  for (const i of errors) console.log(`    ✘ ${i.message}`);
}
if (warns.length) {
  console.log(`\n  ${warns.length} warning(s):`);
  for (const i of warns) console.log(`    ⚠ ${i.message}`);
}
console.log('');
process.exit(errors.length > 0 ? 1 : 0);

function normalize(s) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}
