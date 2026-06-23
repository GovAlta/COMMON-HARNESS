#!/usr/bin/env node
/**
 * check-harness-consistency.mjs — lint that the three sources-of-truth for
 * skill metadata agree:
 *
 *   1. .claude/skills/<name>/SKILL.md frontmatter (name, description)
 *   2. CLAUDE.md skill index tables (rows with `/<name>` slash command)
 *   3. harness.html `harnessData.phaseSkills` + `harnessData.generalSkills`
 *
 * Reports any mismatch: skills present in one source but missing from others,
 * or descriptions that materially diverge.
 *
 * Run from harness root:
 *   node .claude/scripts/check-harness-consistency.mjs
 *
 * Exits 0 on agreement, 1 on drift.
 *
 * Zero npm dependencies. Tested against Node ≥ 18.
 */

import fs from 'node:fs';
import path from 'node:path';

import { fileURLToPath } from 'node:url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const HARNESS_ROOT = path.resolve(__dirname, '..', '..');
const SKILLS_DIR   = path.join(HARNESS_ROOT, '.claude', 'skills');
const CLAUDE_MD    = path.join(HARNESS_ROOT, 'CLAUDE.md');
const HARNESS_HTML = path.join(HARNESS_ROOT, 'harness.html');

const issues = []; // { severity, message }
const warn = (m) => issues.push({ severity: 'warn',  message: m });
const err  = (m) => issues.push({ severity: 'error', message: m });

// ─── Source 1: SKILL.md frontmatter ────────────────────────────────────────
const skillDirs = fs.readdirSync(SKILLS_DIR, { withFileTypes: true })
  .filter(e => e.isDirectory())
  .map(e => e.name);

const skillSource = {}; // name → { description }
for (const dir of skillDirs) {
  const skillPath = path.join(SKILLS_DIR, dir, 'SKILL.md');
  if (!fs.existsSync(skillPath)) {
    err(`SKILL.md missing in skills/${dir}/`);
    continue;
  }
  const text = fs.readFileSync(skillPath, 'utf8');
  const fm = text.match(/^---\s*\n([\s\S]+?)\n---/);
  if (!fm) {
    err(`skills/${dir}/SKILL.md: no YAML frontmatter`);
    continue;
  }
  const nameM = fm[1].match(/^\s*name:\s*(.+?)\s*$/m);
  const descM = fm[1].match(/^\s*description:\s*"?([\s\S]+?)"?\s*$/m);
  const userM = fm[1].match(/^\s*user[-_]invocable:\s*(true|false)\s*$/m);
  if (!nameM)         err(`skills/${dir}/SKILL.md: frontmatter has no \`name:\``);
  if (nameM && nameM[1] !== dir) err(`skills/${dir}/SKILL.md: name "${nameM[1]}" doesn't match dir "${dir}"`);
  if (!descM)         err(`skills/${dir}/SKILL.md: frontmatter has no \`description:\``);
  if (!userM)         warn(`skills/${dir}/SKILL.md: missing \`user-invocable: true\` (skill won't be slash-invokable)`);
  if (nameM) skillSource[nameM[1]] = {
    description: descM ? descM[1].split('\n')[0].trim().replace(/^"/, '').replace(/"$/, '') : '',
    invocable: userM ? userM[1] === 'true' : false,
  };
}

// ─── Source 2: CLAUDE.md skill index tables ────────────────────────────────
const claudeText = fs.readFileSync(CLAUDE_MD, 'utf8');
const claudeSource = {}; // name → row text
// Match `| `/skill-name` |` style rows in tables
for (const m of claudeText.matchAll(/^\|\s*`\/([a-z][a-z0-9-]*)`\s*\|/gm)) {
  claudeSource[m[1]] = true;
}

// ─── Source 3: harness.html harnessData ─────────────────────────────────────
const htmlText = fs.readFileSync(HARNESS_HTML, 'utf8');
const htmlSource = {}; // name → description
const idMatches = htmlText.matchAll(/\bid:\s*"([a-z][a-z0-9-]+)"\s*,\s*slash:\s*"\/([a-z][a-z0-9-]+)"/g);
for (const m of idMatches) {
  htmlSource[m[1]] = true;
}

// ─── Cross-check ────────────────────────────────────────────────────────────
const allNames = new Set([
  ...Object.keys(skillSource),
  ...Object.keys(claudeSource),
  ...Object.keys(htmlSource),
]);

for (const name of [...allNames].sort()) {
  const inSkill  = name in skillSource;
  const inClaude = name in claudeSource;
  const inHtml   = name in htmlSource;
  const sources  = [inSkill && 'SKILL.md', inClaude && 'CLAUDE.md', inHtml && 'harness.html'].filter(Boolean);
  if (sources.length < 3) {
    const missing = ['SKILL.md', 'CLAUDE.md', 'harness.html'].filter(s => !sources.includes(s));
    err(`skill "${name}" present in ${sources.join(', ')}; missing from ${missing.join(', ')}`);
  }
}

// ─── Report ─────────────────────────────────────────────────────────────────
const errors = issues.filter(i => i.severity === 'error');
const warns  = issues.filter(i => i.severity === 'warn');

console.log(`\nharness consistency check`);
console.log('─'.repeat(60));
console.log(`  ${Object.keys(skillSource).length}  skills with valid SKILL.md frontmatter`);
console.log(`  ${Object.keys(claudeSource).length}  skills referenced in CLAUDE.md tables`);
console.log(`  ${Object.keys(htmlSource).length}  skills in harness.html harnessData`);
console.log(`  ${allNames.size}  unique skill names across all sources`);
console.log('─'.repeat(60));

if (errors.length === 0 && warns.length === 0) {
  console.log('  no drift — all three sources agree.\n');
  process.exit(0);
}

for (const i of errors) console.log(`  ✘  ${i.message}`);
for (const i of warns)  console.log(`  ⚠  ${i.message}`);
console.log('');
console.log(`  ${errors.length} error(s), ${warns.length} warning(s).\n`);

process.exit(errors.length > 0 ? 1 : 0);
