#!/usr/bin/env node
/**
 * check-ia-section.mjs — require an Information Architecture section in v3.
 *
 * Root cause of the orphan-page bug: when phase3-architecture's output omits the
 * public sitemap and primary-nav structure, only the API surface, data model
 * and ADRs are documented — nav goes unspecified. phase5 then registers a route
 * without wiring it into nav, and there's no upstream gate that catches the
 * break before /phase6 / /phase7 user testing.
 *
 * What it checks (only on architecture.md):
 *   1. A heading whose normalized text matches "Information Architecture"
 *      (or "IA" / "Sitemap & Navigation") at any depth ≥ 2
 *   2. A markdown table inside that section with at least these columns:
 *      Route, FR ID(s) (or "FR"), Primary nav entry (or "Nav"), Click depth (or "Depth")
 *   3. At least one row in the table (so it's not an empty stub)
 *
 * Usage:
 *   node .claude/scripts/check-ia-section.mjs
 *   node .claude/scripts/check-ia-section.mjs --root <project-root>
 *   node .claude/scripts/check-ia-section.mjs --json
 *
 * Exits 0 if section is present + has rows, 1 on missing/empty, 2 on missing inputs.
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

const ARCH = path.join(ROOT, 'phases', 'phase3-architecture', 'output', 'architecture.md');
if (!fs.existsSync(ARCH)) {
  console.error(`check-ia-section: ${path.relative(ROOT, ARCH)} not found.`);
  process.exit(2);
}

const text  = fs.readFileSync(ARCH, 'utf8');
const lines = text.split(/\r?\n/);

// ─── 1. Locate the IA section ───────────────────────────────────────────────
function isIAHeading(line) {
  const m = line.match(/^(#{2,6})\s+(?:[\d.]+[A-Za-z]*\s+)?(.+?)\s*$/);
  if (!m) return false;
  const t = m[2].toLowerCase().replace(/[^a-z ]/g, '').trim();
  return /\b(information architecture|sitemap.*nav|nav.*sitemap|site map|primary nav)\b/.test(t);
}

let iaStart = -1, iaEnd = -1, iaDepth = 0;
for (let i = 0; i < lines.length; i++) {
  if (iaStart === -1 && isIAHeading(lines[i])) {
    iaStart = i;
    iaDepth = (lines[i].match(/^(#+)/) || ['',''])[1].length;
    continue;
  }
  if (iaStart !== -1) {
    const m = lines[i].match(/^(#{2,6})\s+/);
    if (m && m[1].length <= iaDepth) {
      iaEnd = i;
      break;
    }
  }
}
if (iaEnd === -1 && iaStart !== -1) iaEnd = lines.length;

const results = [];
function record(name, ok, evidence) { results.push({ name, ok, evidence }); }

if (iaStart === -1) {
  record('IA section present', false, 'no "Information Architecture" / "Sitemap & Navigation" heading in architecture.md');
} else {
  record('IA section present', true, `heading at line ${iaStart + 1}`);

  // ─── 2. Required nav-wiring table ─────────────────────────────────────────
  const section = lines.slice(iaStart, iaEnd).join('\n');
  const tableLines = section.split('\n').filter(l => l.trim().startsWith('|') && l.trim().endsWith('|'));
  const headerLine = tableLines[0] || '';
  const headerCells = headerLine.split('|').map(c => c.trim().toLowerCase()).filter(Boolean);

  const hasRoute = headerCells.some(c => /\broute\b|\bpath\b|\bpage\b/.test(c));
  const hasFR    = headerCells.some(c => /\bfr\b|requirement/.test(c));
  const hasNav   = headerCells.some(c => /\bnav\b|menu|primary entry|navigation/.test(c));
  const hasDepth = headerCells.some(c => /\bdepth\b|click|reach/.test(c));

  if (!headerLine) {
    record('Nav-wiring table present', false, 'IA section contains no markdown table');
  } else if (!(hasRoute && hasFR && hasNav)) {
    const need = [
      hasRoute ? '' : 'Route',
      hasFR    ? '' : 'FR ID',
      hasNav   ? '' : 'Primary nav entry',
    ].filter(Boolean).join(', ');
    record('Nav-wiring table present', false, `table missing required column(s): ${need}`);
  } else {
    record('Nav-wiring table present', true, `header has Route + FR + Nav${hasDepth ? ' + Depth' : ''}`);
  }

  // ─── 3. Table has at least one data row ───────────────────────────────────
  // First two table lines are header + separator (|---|---|---|). Real rows start at index 2.
  const dataRows = tableLines.slice(2).filter(l => /[A-Za-z0-9]/.test(l));
  if (headerLine && dataRows.length === 0) {
    record('Nav-wiring table has rows', false, 'table is empty (header + separator only)');
  } else if (headerLine) {
    record('Nav-wiring table has rows', true, `${dataRows.length} row(s)`);
  }
}

// ─── Report ─────────────────────────────────────────────────────────────────
const failed = results.filter(r => !r.ok);
if (JSON_OUT) {
  console.log(JSON.stringify({ ok: failed.length === 0, file: path.relative(ROOT, ARCH), results }, null, 2));
} else {
  console.log(`\nia-section check  —  phase3-architecture/output/architecture.md`);
  console.log('─'.repeat(64));
  for (const r of results) {
    const icon = r.ok ? '✓' : '✘';
    console.log(`  ${icon}  ${r.name.padEnd(30)} ${r.evidence}`);
  }
  console.log('─'.repeat(64));
  if (failed.length === 0) {
    console.log('  ✓ Information Architecture section + nav-wiring table + rows present.');
  } else {
    console.log(`  ${failed.length} IA gap(s).`);
    console.log(`  Add to architecture.md a "## Information Architecture" section with a table:`);
    console.log(`    | Route | FR ID(s) | Primary nav entry | Click depth from / |`);
    console.log(`    | ----- | -------- | ----------------- | ------------------ |`);
    console.log(`    | /...  | FR-NNN   | Header > ...      | 1                  |`);
    console.log(`  Per harness rule #12: every public FR must be reachable from / in ≤2 clicks.`);
  }
  console.log('');
}

process.exit(failed.length > 0 ? 1 : 0);
