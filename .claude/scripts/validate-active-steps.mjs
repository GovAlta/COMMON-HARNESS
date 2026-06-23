#!/usr/bin/env node
/**
 * validate-active-steps.mjs — find every phase deliverable in the
 * working directory and lint each against its skill's output template.
 *
 * Designed to run as a Stop hook so a Claude conversation can't end with
 * structurally-broken phase outputs sitting on disk.
 *
 * Walks `./phases/phase?-*\/output/` recursively (relative to CWD) and for
 * each `.md` file, picks the right template based on the file name:
 *
 *   File pattern                                  Template
 *   --------------------------------------------- -----------------------------
 *   phase6-user-testing/output/test-results.md       output-template-results.md
 *   phase7-user-acceptance/output/sign-off.md        output-template-signoff.md
 *   phase8-deployment/output/release-notes.md        output-template-release.md
 *   <anything else>                                  output-template.md
 *
 * Exits 0 if all outputs pass (or none found). Exits 1 if any fail.
 *
 * Zero npm dependencies. Tested against Node ≥ 18.
 *
 * Usage:
 *   node validate-active-steps.mjs               # walk CWD
 *   node validate-active-steps.mjs --root <dir>  # walk a specific project
 *   node validate-active-steps.mjs --quiet       # one line per file
 */

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const argv = process.argv.slice(2);
let ROOT = process.cwd();
let QUIET = false;
for (let i = 0; i < argv.length; i++) {
  if (argv[i] === '--root')  ROOT = path.resolve(argv[++i]);
  if (argv[i] === '--quiet') QUIET = true;
}

import { fileURLToPath } from 'node:url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const VALIDATOR  = path.join(__dirname, 'validate-step-output.mjs');

if (!fs.existsSync(VALIDATOR)) {
  console.error(`validate-active-steps: validate-step-output.mjs not found at ${VALIDATOR}`);
  process.exit(2);
}

// Map filename → secondary template name (defaults to output-template.md when absent)
const SECONDARY_TEMPLATES = {
  'test-results.md':  'output-template-results.md',
  'sign-off.md':      'output-template-signoff.md',
  'release-notes.md': 'output-template-release.md',
};

// Find candidate output dirs. Pattern: <root>/phases/phase<N>-*/output/*.md
const PHASES_DIR = path.join(ROOT, 'phases');
if (!fs.existsSync(PHASES_DIR)) {
  if (!QUIET) console.log('validate-active-steps: no ./phases/ dir → no outputs to check.');
  process.exit(0);
}

const stepDirs = fs.readdirSync(PHASES_DIR, { withFileTypes: true })
  .filter(e => e.isDirectory() && /^phase\d+-/.test(e.name))
  .map(e => e.name);

if (stepDirs.length === 0) {
  if (!QUIET) console.log('validate-active-steps: no phase?-*/ phase dirs under ./phases/.');
  process.exit(0);
}

const results = []; // { skill, file, template, ok, output }

for (const skill of stepDirs) {
  const outputDir = path.join(PHASES_DIR, skill, 'output');
  if (!fs.existsSync(outputDir)) continue;

  // All .md files at the top level of output/ (not in subdirs like adrs/, modules/)
  const files = fs.readdirSync(outputDir)
    .filter(f => f.endsWith('.md'))
    .map(f => path.join(outputDir, f));

  for (const file of files) {
    const base = path.basename(file);
    const template = SECONDARY_TEMPLATES[base] || 'output-template.md';

    const args = [VALIDATOR, skill, file, '--template', template];
    const r = spawnSync('node', args, { encoding: 'utf8' });
    const ok = r.status === 0;
    results.push({
      skill, file: path.relative(ROOT, file), template, ok,
      output: (r.stdout || '') + (r.stderr || ''),
    });
  }
}

const failed = results.filter(r => !r.ok);
const passed = results.filter(r => r.ok);

if (results.length === 0) {
  if (!QUIET) console.log('validate-active-steps: no .md outputs in any phase?-*/output/ dir.');
  process.exit(0);
}

if (QUIET) {
  for (const r of results) {
    const icon = r.ok ? 'OK' : 'FAIL';
    console.log(`${icon} ${r.skill} :: ${path.basename(r.file)} (${r.template})`);
  }
  if (failed.length) console.log(`\n${failed.length} of ${results.length} failed.`);
} else {
  for (const r of results) {
    const icon = r.ok ? '✓' : '✘';
    console.log(`\n${icon} ${r.skill} → ${path.basename(r.file)} (template: ${r.template})`);
    // Forward the validator's own output, indented for readability
    for (const line of r.output.trimEnd().split(/\r?\n/)) {
      console.log(`  ${line}`);
    }
  }
  console.log(`\nvalidate-active-steps: ${passed.length} passed, ${failed.length} failed.`);
}

process.exit(failed.length > 0 ? 1 : 0);
