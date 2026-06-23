#!/usr/bin/env node
/**
 * check-no-silent-deferral.mjs — block stealth scope-cuts in step reports.
 *
 * Worst pattern this gate catches: a v5/v6/v7/v8 report says "FR-XXX deferred
 * to follow-up" without (a) downgrading FR-XXX in requirements.md, (b) entering
 * it in v8 Prerequisites, or (c) recording a risk-acceptance. The narrative
 * silently shrinks scope while structural gates pass on technicality. Rule #10
 * forbids this.
 *
 * What it checks: scan phase output reports for deferral language
 * paired with must/should FR or NFR mentions. Each occurrence must be
 * paired with one of:
 *   (a) a requirements.md entry that downgrades the FR (must → should/wont)
 *       — detected by reading requirements.md and noting the FR's current MoSCoW
 *   (b) an entry in sign-off.md §"v8 Prerequisites" (or "Prerequisites for v8")
 *       that names the FR + owner + date
 *   (c) a risk-acceptance with the FR ID in .ai/data/risk_acceptances.json
 *
 * Reports scanned (whichever exist):
 *   phases/phase5-development/output/development-report.md
 *   phases/phase6-user-testing/output/test-results.md
 *   phases/phase7-user-acceptance/output/uat-script.md
 *   phases/phase7-user-acceptance/output/sign-off.md
 *   phases/phase8-deployment/output/runbook.md
 *
 * Usage:
 *   node .claude/scripts/check-no-silent-deferral.mjs
 *   node .claude/scripts/check-no-silent-deferral.mjs --root <project-root>
 *   node .claude/scripts/check-no-silent-deferral.mjs --json
 *
 * Exits 0 if every deferral is documented, 1 on any silent deferral, 2 on missing inputs.
 */

import fs from 'node:fs';
import path from 'node:path';

const argv = process.argv.slice(2);
let ROOT = process.cwd();
let JSON_OUT = false;
for (let i = 0; i < argv.length; i++) {
  if (argv[i] === '--root') ROOT = path.resolve(argv[++i]);
  else if (argv[i] === '--json') JSON_OUT = true;
}

const REQS = path.join(ROOT, 'phases', 'phase1-requirements', 'output', 'requirements.md');
if (!fs.existsSync(REQS)) {
  console.error('check-no-silent-deferral: requirements.md not found.');
  process.exit(2);
}

const REPORTS = [
  path.join(ROOT, 'phases', 'phase5-development',     'output', 'development-report.md'),
  path.join(ROOT, 'phases', 'phase6-user-testing',    'output', 'test-results.md'),
  path.join(ROOT, 'phases', 'phase7-user-acceptance', 'output', 'uat-script.md'),
  path.join(ROOT, 'phases', 'phase7-user-acceptance', 'output', 'sign-off.md'),
  path.join(ROOT, 'phases', 'phase8-deployment',      'output', 'runbook.md'),
].filter(p => fs.existsSync(p));

if (REPORTS.length === 0) {
  // No reports yet — nothing to check, pass cleanly
  if (!JSON_OUT) console.log('check-no-silent-deferral: no step reports yet — pass.');
  process.exit(0);
}

// ─── Load the FR/NFR catalogue with current MoSCoW ──────────────────────────
const reqText = fs.readFileSync(REQS, 'utf8');
const moscowOf = {};
{
  const frSection = reqText.match(/## 5\. Functional Requirements[\s\S]+?(?=\n## )/);
  if (frSection) {
    for (const line of frSection[0].split(/\r?\n/)) {
      const m = line.match(/^\|\s*(FR-\d{3})\s*\|\s*[^|]+\|\s*(must|should|could|wont)/i);
      if (m) moscowOf[m[1]] = m[2].toLowerCase();
    }
  }
  const nfrSection = reqText.match(/## 6\. Non-Functional Requirements[\s\S]+?(?=\n## )/);
  if (nfrSection) {
    // NFR table format may not have an explicit MoSCoW; treat all NFRs as must by default
    for (const line of nfrSection[0].split(/\r?\n/)) {
      const m = line.match(/^\|\s*(NFR-[A-Z0-9-]+)\s*\|/);
      if (m && !moscowOf[m[1]]) moscowOf[m[1]] = 'must';
    }
  }
}

// ─── Load v8 prerequisites (whichever sign-off exists) ─────────────────────
const SIGNOFF = path.join(ROOT, 'phases', 'phase7-user-acceptance', 'output', 'sign-off.md');
let prereqText = '';
if (fs.existsSync(SIGNOFF)) {
  const t = fs.readFileSync(SIGNOFF, 'utf8');
  // Capture the prerequisites section
  // Note: JS regex has no \Z (end of string); use $ with /m flag, or just (?=\n## |$)
  const m = t.match(/##[^\n]*?(?:Prerequisites for v8|v8 Prerequisites|Pre-deploy|Prerequisites)[\s\S]+?(?=\n## |$)/i);
  if (m) prereqText = m[0];
}

// ─── Load risk-acceptances ──────────────────────────────────────────────────
const RAFILE = path.join(ROOT, 'app', '.ai', 'data', 'risk_acceptances.json');
let raList = [];
if (fs.existsSync(RAFILE)) {
  try {
    const j = JSON.parse(fs.readFileSync(RAFILE, 'utf8'));
    raList = Array.isArray(j) ? j : Object.entries(j).map(([id, v]) => ({ id, ...v }));
  } catch { /* tolerate parse failure */ }
}
const raCovers = id => raList.some(ra => {
  const blob = JSON.stringify(ra);
  return blob.includes(id);
});

// ─── Scan each report ───────────────────────────────────────────────────────
const DEFER_RE  = /\b(deferred?|defer|postpon|follow[-\s]*up|post[-\s]*launch|not run in this slice|skipped)\b/i;
const REQ_ID_RE = /\b(FR-\d{3}|NFR-[A-Z0-9-]+)\b/g;

// Strip fenced code blocks (```...```), inline code (`...`), and link URLs so
// deferral language inside code examples / URL slugs / inline-code doesn't
// trigger a false positive. Replace with newlines to preserve line numbers.
function stripCodeAndLinks(text) {
  return text
    .replace(/```[\s\S]*?```/g, m => m.replace(/[^\n]/g, ' '))
    .replace(/`[^`\n]*`/g, m => ' '.repeat(m.length))
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, label) => label);
}

const issues = [];
for (const report of REPORTS) {
  const text = stripCodeAndLinks(fs.readFileSync(report, 'utf8'));
  const lines = text.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!DEFER_RE.test(line)) continue;
    // Look at this line + 2 lines before/after for FR/NFR IDs (deferral context window)
    const window = lines.slice(Math.max(0, i - 2), Math.min(lines.length, i + 3)).join(' ');
    const ids = [...window.matchAll(REQ_ID_RE)].map(m => m[1]);
    if (ids.length === 0) continue;
    for (const id of [...new Set(ids)]) {
      const moscow = moscowOf[id];
      if (!moscow) continue; // unknown ID — skip
      if (moscow !== 'must' && moscow !== 'should') continue; // could/wont — fine to defer

      // (a) downgraded? — moscow check above already returns 'must' or 'should'.
      //     If requirements.md still says must/should AND we're seeing deferral,
      //     this is the silent-deferral path. The "downgrade" route is to literally
      //     move the FR's MoSCoW to could/wont in requirements.md.
      // (b) v8 prereq?
      const inPrereq = prereqText.includes(id);
      // (c) risk-acceptance?
      const inRA = raCovers(id);

      if (inPrereq || inRA) continue;

      issues.push({
        file: path.relative(ROOT, report),
        line: i + 1,
        text: line.trim().slice(0, 140),
        id,
        moscow,
      });
    }
  }
}

// Deduplicate (same id mentioned multiple times in same file → one issue per file+id)
const dedup = new Map();
for (const i of issues) {
  const k = `${i.file}|${i.id}`;
  if (!dedup.has(k)) dedup.set(k, i);
}
const unique = [...dedup.values()];

// ─── Report ─────────────────────────────────────────────────────────────────
if (JSON_OUT) {
  console.log(JSON.stringify({
    ok: unique.length === 0,
    reportsScanned: REPORTS.map(p => path.relative(ROOT, p)),
    silentDeferrals: unique,
  }, null, 2));
} else {
  console.log(`\nno-silent-deferral check`);
  console.log('─'.repeat(64));
  console.log(`  reports scanned: ${REPORTS.length}`);
  console.log(`  RA entries: ${raList.length}`);
  console.log(`  v8 prereqs section: ${prereqText ? 'found' : 'missing'}`);
  console.log('─'.repeat(64));
  if (unique.length === 0) {
    console.log('  ✓ no silent deferrals — every must/should requirement deferred has a paper trail.');
  } else {
    for (const u of unique) {
      console.log(`  ✘ ${u.id} (${u.moscow})  ${u.file}:${u.line}`);
      console.log(`      ${u.text}`);
    }
    console.log('');
    console.log(`  ${unique.length} silent deferral(s). Per harness rule #10, each must be paired with ONE of:`);
    console.log(`    (a) downgrade in requirements.md (must→could/wont) + /phase2-planning re-plan`);
    console.log(`    (b) entry in sign-off.md §"v8 Prerequisites" with owner + date`);
    console.log(`    (c) RA-NNN entry in app/.ai/data/risk_acceptances.json citing the FR/NFR ID`);
  }
  console.log('');
}

process.exit(unique.length > 0 ? 1 : 0);
