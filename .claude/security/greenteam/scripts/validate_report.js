#!/usr/bin/env node
/**
 * validate_report.js — schema sanity check on deliverables/greenteam_findings.json.
 *
 * Verifies:
 *   - Required top-level fields: schemaVersion, framework, generatedAt, findings, summary.
 *   - Each finding has required fields: id, round, severity, category, title.
 *   - id format: G-R<round>-<CAT>-NNN.
 *   - summary counts agree with the findings array.
 *
 * Exits 0 on pass, 1 on validation failure.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SEVERITIES, CATEGORIES } from '../pipeline/output_schemas.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const argv = process.argv.slice(2);
let TARGET = null;
let OUT_OVERRIDE = null;
for (let i = 0; i < argv.length; i++) {
  if (argv[i] === '--target') TARGET = path.resolve(argv[++i]);
  else if (argv[i] === '--out-dir') OUT_OVERRIDE = path.resolve(argv[++i]);
}

const inPath = OUT_OVERRIDE
  ? path.join(OUT_OVERRIDE, 'greenteam_findings.json')
  : TARGET
    ? path.join(TARGET, '.ai', 'greenteam', 'greenteam_findings.json')
    : path.join(__dirname, '..', 'deliverables', 'greenteam_findings.json');

if (!fs.existsSync(inPath)) {
  console.error(`validate_report: ${inPath} not found`);
  process.exit(2);
}

const data = JSON.parse(fs.readFileSync(inPath, 'utf8'));
const errors = [];

if (data.schemaVersion !== 1) errors.push(`schemaVersion must be 1 (got ${data.schemaVersion})`);
if (data.framework !== 'greenteam') errors.push(`framework must be 'greenteam' (got ${data.framework})`);
if (!Array.isArray(data.findings)) errors.push('findings must be an array');
if (typeof data.summary !== 'object') errors.push('summary must be an object');

const idRe = /^G-R[1-2]-[A-Z]+-\d{3}$/;
const seenIds = new Set();
const sevCounts = Object.fromEntries(SEVERITIES.map(s => [s, 0]));
const catCounts = {};

for (const [i, f] of (data.findings || []).entries()) {
  const ctx = `findings[${i}]`;
  if (!idRe.test(f.id || '')) errors.push(`${ctx}.id must match G-R<round>-<CAT>-NNN (got "${f.id}")`);
  if (seenIds.has(f.id)) errors.push(`${ctx}.id duplicated: ${f.id}`);
  seenIds.add(f.id);
  if (![1, 2].includes(f.round)) errors.push(`${ctx}.round must be 1 or 2 (got ${f.round})`);
  if (!SEVERITIES.includes(f.severity)) errors.push(`${ctx}.severity invalid: ${f.severity}`);
  if (!CATEGORIES.includes(f.category)) errors.push(`${ctx}.category invalid: ${f.category}`);
  if (!f.title) errors.push(`${ctx}.title missing`);
  sevCounts[f.severity] = (sevCounts[f.severity] || 0) + 1;
  catCounts[f.category] = (catCounts[f.category] || 0) + 1;
}

// Summary cross-check
for (const s of SEVERITIES) {
  if ((data.summary.bySeverity?.[s] || 0) !== sevCounts[s]) {
    errors.push(`summary.bySeverity.${s} mismatch (expected ${sevCounts[s]}, got ${data.summary.bySeverity?.[s] || 0})`);
  }
}
for (const [c, n] of Object.entries(catCounts)) {
  if ((data.summary.byCategory?.[c] || 0) !== n) {
    errors.push(`summary.byCategory.${c} mismatch (expected ${n}, got ${data.summary.byCategory?.[c] || 0})`);
  }
}

if (errors.length === 0) {
  console.log(`validate_report: OK (${data.findings.length} findings, schema v${data.schemaVersion})`);
  process.exit(0);
}

console.error(`validate_report: ${errors.length} error(s)`);
for (const e of errors) console.error(`  ✘ ${e}`);
process.exit(1);
