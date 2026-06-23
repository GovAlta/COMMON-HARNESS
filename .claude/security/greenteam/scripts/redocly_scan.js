#!/usr/bin/env node
/**
 * redocly_scan.js — lint OpenAPI documents via @redocly/cli.
 *
 * Finds openapi.{yaml,yml,json}, runs `npx @redocly/cli lint <file> --format json`.
 * Emits MEDIUM per error, LOW per warning.
 *
 * Usage: node redocly_scan.js --target <path> [--out <file>]
 */

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { finding, makeIdAllocator } from '../pipeline/output_schemas.js';

const argv = process.argv.slice(2);
let TARGET = process.cwd();
let OUT = null;
for (let i = 0; i < argv.length; i++) {
  if (argv[i] === '--target') TARGET = path.resolve(argv[++i]);
  else if (argv[i] === '--out') OUT = path.resolve(argv[++i]);
}

const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'build', 'coverage', '.next', '.nuxt']);

function walkForOpenApi(root, depth = 0, acc = []) {
  if (depth > 6) return acc;
  let entries;
  try { entries = fs.readdirSync(root, { withFileTypes: true }); } catch { return acc; }
  for (const e of entries) {
    if (SKIP_DIRS.has(e.name) || e.name.startsWith('.')) continue;
    const full = path.join(root, e.name);
    if (e.isDirectory()) walkForOpenApi(full, depth + 1, acc);
    else if (e.isFile() && /^openapi\.(?:ya?ml|json)$/i.test(e.name)) acc.push(full);
  }
  return acc;
}

const findings = [];
const nextId = makeIdAllocator();
const files = walkForOpenApi(TARGET);
if (files.length === 0) {
  if (OUT) fs.writeFileSync(OUT, '[]');
  else process.stdout.write('[]\n');
  process.exit(0);
}

for (const file of files) {
  const rel = path.relative(TARGET, file).replace(/\\/g, '/');
  const r = spawnSync('npx', ['--yes', '@redocly/cli', 'lint', file, '--format', 'json'], {
    encoding: 'utf8', shell: true, timeout: 180_000,
  });
  const text = r.stdout || '';
  if (!text) continue;
  let parsed;
  try { parsed = JSON.parse(text); } catch { continue; }
  // Redocly JSON output shape: { totals: {...}, problems: [{ message, ruleId, severity, location: [{pointer, source: {ref}}] }] }
  const problems = Array.isArray(parsed.problems) ? parsed.problems : (Array.isArray(parsed) ? parsed : []);
  for (const p of problems) {
    const sev = (p.severity === 'error') ? 'MEDIUM' : 'LOW';
    const loc = Array.isArray(p.location) && p.location[0] ? p.location[0] : {};
    const ptr = loc.pointer || loc.start || '';
    findings.push(finding({
      id: nextId(1, 'API'),
      round: 1,
      severity: sev,
      category: 'API',
      title: `OpenAPI ${p.severity || 'issue'}: ${p.ruleId || 'unknown-rule'} in ${rel}`,
      location: { file: rel, line: (loc.start && loc.start.line) || null },
      evidence: {
        tool: '@redocly/cli',
        rule: p.ruleId,
        message: p.message,
        pointer: ptr,
      },
      remediation: `Fix the OpenAPI rule ${p.ruleId} at ${rel}${ptr ? '#' + ptr : ''}: ${p.message || ''}`,
      compliance: 'Hygiene',
      scanner: 'redocly_scan',
    }));
  }
}

if (OUT) fs.writeFileSync(OUT, JSON.stringify(findings, null, 2));
else process.stdout.write(JSON.stringify(findings, null, 2) + '\n');
