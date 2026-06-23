#!/usr/bin/env node
/**
 * check-fr-coverage.mjs — verify every must-have FR in requirements.md has
 * actual code in app/ that cites the FR ID.
 *
 * Catches the failure mode "FR-X marked complete in dev report but no code
 * references FR-X" — i.e., the dev report claims complete but nothing was
 * actually built. This is the most common /phase5 failure mode: must-have FRs
 * silently deferred while the development-report still reads as "substantially
 * complete." Without this gate, the silent-deferral pattern only surfaces at
 * /phase7 user-acceptance or /phase8 deploy, far too late.
 *
 * What it checks:
 *   - Parse requirements.md for every FR row, extract ID + MoSCoW
 *   - For each must-have FR, search ./app/ for an FR-ID citation
 *     (in code comments, file paths, test names, commit messages, or doc files)
 *   - Report any must-have FR with no citation as ERROR
 *   - Should-have FRs without citation are warnings
 *   - Could/wont FRs are not checked
 *
 * Usage:
 *   node .claude/scripts/check-fr-coverage.mjs
 *   node .claude/scripts/check-fr-coverage.mjs --requirements <path>
 *   node .claude/scripts/check-fr-coverage.mjs --root <project-root>
 *   node .claude/scripts/check-fr-coverage.mjs --json
 *
 * Exits 0 on full must-have coverage, 1 on missing must-haves, 2 on missing inputs.
 */

import fs from 'node:fs';
import path from 'node:path';

const argv = process.argv.slice(2);
let ROOT = process.cwd();
let REQUIREMENTS = null;
let JSON_OUT = false;
for (let i = 0; i < argv.length; i++) {
  if (argv[i] === '--root') ROOT = path.resolve(argv[++i]);
  else if (argv[i] === '--requirements') REQUIREMENTS = path.resolve(argv[++i]);
  else if (argv[i] === '--json') JSON_OUT = true;
}

// Auto-discover requirements.md if not specified
if (!REQUIREMENTS) {
  const candidates = [
    path.join(ROOT, 'phases', 'phase1-requirements', 'output', 'requirements.md'),
    path.join(ROOT, 'requirements.md'),
    path.join(ROOT, 'docs', 'requirements.md'),
  ];
  REQUIREMENTS = candidates.find(p => fs.existsSync(p));
}

if (!REQUIREMENTS || !fs.existsSync(REQUIREMENTS)) {
  console.error('check-fr-coverage: requirements.md not found. Pass --requirements <path> or run from a project with phases/phase1-requirements/output/.');
  process.exit(2);
}

const APP_DIR = path.join(ROOT, 'app');
if (!fs.existsSync(APP_DIR)) {
  console.error('check-fr-coverage: ./app/ not found. Run /build first or pass --root.');
  process.exit(2);
}

// ─── Parse FR table from requirements.md ────────────────────────────────────
const reqText = fs.readFileSync(REQUIREMENTS, 'utf8');
const frTableMatch = reqText.match(/## (?:5\. )?Functional Requirements[\s\S]+?(?=\n## )/);
if (!frTableMatch) {
  console.error('check-fr-coverage: could not locate "## Functional Requirements" section in requirements.md');
  process.exit(2);
}

const frRows = [];
for (const line of frTableMatch[0].split(/\r?\n/)) {
  // Match table rows: | FR-NNN | Title | moscow | module | AC |
  const m = line.match(/^\|\s*(FR-[A-Z0-9]+-\d{2,3}|FR-\d{3})\s*\|\s*([^|]+?)\s*\|\s*(must|should|could|wont)\s*\|/i);
  if (m) {
    frRows.push({ id: m[1], title: m[2].trim(), moscow: m[3].toLowerCase() });
  }
}

if (frRows.length === 0) {
  console.error('check-fr-coverage: parsed 0 FR rows from requirements.md §5. Check the table format.');
  process.exit(2);
}

// ─── Build a corpus of all citations across app/ + phases/ outputs ─────────
function walk(dir, files = []) {
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return files; }
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (['node_modules', 'dist', 'build', '.git', '.cache'].includes(e.name)) continue;
      walk(full, files);
    } else if (e.isFile()) {
      if (/\.(ts|tsx|js|jsx|vue|sql|md|json|yaml|yml)$/.test(e.name)) {
        files.push(full);
      }
    }
  }
  return files;
}

const corpus = walk(APP_DIR);
// Also walk phase outputs (dev report claims to track FR coverage there)
const phasesDir = path.join(ROOT, 'phases');
if (fs.existsSync(phasesDir)) walk(phasesDir, corpus);

// ─── Check each FR for citations in code (excluding requirements.md itself) ─
const issues = [];

for (const fr of frRows) {
  // Find files that mention this FR ID, excluding the requirements.md and plan.md
  // (those are aspirational; we want EVIDENCE of implementation)
  const citationFiles = [];
  const codeFileMatchers = [];
  const docFileMatchers = [];

  for (const file of corpus) {
    if (path.resolve(file) === path.resolve(REQUIREMENTS)) continue;
    let text;
    try { text = fs.readFileSync(file, 'utf8'); } catch { continue; }
    const re = new RegExp(`\\b${fr.id}\\b`);
    if (re.test(text)) {
      citationFiles.push(file);
      const rel = path.relative(ROOT, file).replace(/\\/g, '/');
      // Code files MUST be in app/{server,client,test} AND have a code extension.
      // .md / .yaml / .json files in those dirs are NOT code, even if they live there.
      const isCodePath = /^app\/(server|client|test)\//.test(rel);
      const isCodeExt  = /\.(ts|tsx|js|jsx|vue|sql)$/i.test(rel);
      if (isCodePath && isCodeExt) {
        // Demote when the FR ID only appears as a TODO/FIXME/STUB marker
        // ("// TODO: FR-009 admin path"). Section-header comments that label
        // real implementations below are fine — they're a documentation link,
        // not a deferral.
        const lines = text.split(/\r?\n/);
        const idLines = lines.filter(l => re.test(l));
        const stubMarker = /\b(TODO|FIXME|XXX|HACK|STUB|DEFERRED|NOT IMPLEMENTED|PLACEHOLDER|UNIMPLEMENTED)\b/i;
        const allLinesAreStubs = idLines.length > 0 && idLines.every(l => stubMarker.test(l));
        if (allLinesAreStubs) {
          docFileMatchers.push(rel + ' (TODO/STUB only)');
        } else {
          codeFileMatchers.push(rel);
        }
      } else if (rel.endsWith('.md')) {
        docFileMatchers.push(rel);
      }
    }
  }

  const hasCode = codeFileMatchers.length > 0;
  const hasDocOnly = !hasCode && docFileMatchers.length > 0;
  const hasNothing = citationFiles.length === 0;

  if (fr.moscow === 'must') {
    if (hasNothing) {
      issues.push({
        severity: 'error',
        fr: fr.id, moscow: fr.moscow,
        message: `MUST-have FR ${fr.id} ("${fr.title}") has ZERO citations anywhere in app/ or phases/. Likely unbuilt.`,
        codeCitations: 0, docCitations: 0,
      });
    } else if (hasDocOnly) {
      issues.push({
        severity: 'error',
        fr: fr.id, moscow: fr.moscow,
        message: `MUST-have FR ${fr.id} ("${fr.title}") only cited in docs (${docFileMatchers.join(', ')}); no code in app/server/app/client/app/test references it. Doc claim without implementation = deferred.`,
        codeCitations: 0, docCitations: docFileMatchers.length,
      });
    }
  } else if (fr.moscow === 'should') {
    if (hasNothing) {
      issues.push({
        severity: 'warn',
        fr: fr.id, moscow: fr.moscow,
        message: `SHOULD-have FR ${fr.id} ("${fr.title}") has zero citations.`,
        codeCitations: 0, docCitations: 0,
      });
    }
  }
  // could / wont: not checked
}

// ─── Report ─────────────────────────────────────────────────────────────────
const errors = issues.filter(i => i.severity === 'error');
const warns  = issues.filter(i => i.severity === 'warn');

if (JSON_OUT) {
  console.log(JSON.stringify({
    ok: errors.length === 0,
    requirements: path.relative(ROOT, REQUIREMENTS),
    totalFRs: frRows.length,
    musts: frRows.filter(f => f.moscow === 'must').length,
    issues,
  }, null, 2));
} else {
  const musts = frRows.filter(f => f.moscow === 'must').length;
  console.log(`\nFR coverage check`);
  console.log('─'.repeat(60));
  console.log(`  requirements: ${path.relative(ROOT, REQUIREMENTS)}`);
  console.log(`  parsed: ${frRows.length} FRs (${musts} must-have)`);
  console.log(`  app code corpus: ${corpus.length} files scanned`);
  console.log('─'.repeat(60));
  if (errors.length === 0 && warns.length === 0) {
    console.log('  no coverage gaps — every must-have FR has code referencing its ID.');
    process.exit(0);
  }
  for (const i of errors) console.log(`  ✘  [${i.fr}]  ${i.message}`);
  for (const i of warns)  console.log(`  ⚠  [${i.fr}]  ${i.message}`);
  console.log('');
  if (errors.length) {
    console.log(`  ${errors.length} must-have FR(s) without code coverage.`);
    console.log(`  Either build them, OR if scope-cut is approved, downgrade in requirements.md AND re-plan via /phase2-planning.`);
    console.log(`  Silent deferral is NOT acceptable per harness rule #10.`);
  }
  console.log('');
}

process.exit(errors.length > 0 ? 1 : 0);
