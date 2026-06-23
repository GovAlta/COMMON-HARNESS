#!/usr/bin/env node
/**
 * validate_report.js — sanity check on deliverables/yellowteam_findings.json.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SEVERITIES, RULES } from '../pipeline/output_schemas.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const argv = process.argv.slice(2);
let TARGET = null;
let OUT_OVERRIDE = null;
for (let i = 0; i < argv.length; i++) {
  if (argv[i] === '--target') TARGET = path.resolve(argv[++i]);
  else if (argv[i] === '--out-dir') OUT_OVERRIDE = path.resolve(argv[++i]);
}

const inPath = OUT_OVERRIDE
  ? path.join(OUT_OVERRIDE, 'yellowteam_findings.json')
  : TARGET
    ? path.join(TARGET, '.ai', 'yellowteam', 'yellowteam_findings.json')
    : path.join(__dirname, '..', 'deliverables', 'yellowteam_findings.json');

if (!fs.existsSync(inPath)) {
  console.error(`validate_report: ${inPath} not found`);
  process.exit(2);
}

const data = JSON.parse(fs.readFileSync(inPath, 'utf8'));
const errors = [];

if (data.schemaVersion !== 1) errors.push(`schemaVersion must be 1`);
if (data.framework !== 'yellowteam') errors.push(`framework must be 'yellowteam'`);
if (!Array.isArray(data.findings)) errors.push('findings must be an array');

const seen = new Set();
const idRe = /^Y-R\d{2}-\d{3,}$/;
for (const [i, f] of (data.findings || []).entries()) {
  const ctx = `findings[${i}]`;
  if (!idRe.test(f.id || '')) errors.push(`${ctx}.id must match Y-R<NN>-NNN (got ${f.id})`);
  if (seen.has(f.id)) errors.push(`${ctx}.id duplicated: ${f.id}`);
  seen.add(f.id);
  if (!RULES[f.rule]) errors.push(`${ctx}.rule invalid: ${f.rule}`);
  if (!SEVERITIES.includes(f.severity)) errors.push(`${ctx}.severity invalid: ${f.severity}`);
  if (!f.title) errors.push(`${ctx}.title missing`);
}

if (errors.length === 0) {
  console.log(`validate_report: OK (${data.findings.length} findings, schema v${data.schemaVersion})`);
  process.exit(0);
}
console.error(`validate_report: ${errors.length} error(s)`);
for (const e of errors) console.error(`  ✘ ${e}`);
process.exit(1);
