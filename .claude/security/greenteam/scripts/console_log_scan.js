#!/usr/bin/env node
/**
 * console_log_scan.js — count console.* in production paths.
 *
 * Walks src/, app/, components/, views/, pages/ for .{js,ts,vue,jsx,tsx}.
 * Counts console.log|error|warn|info|debug (skips lines that start with //).
 * Total > 50  → MEDIUM with top-10 files
 * Per file > 10 → LOW per file.
 *
 * Usage: node console_log_scan.js --target <path> [--out <file>]
 */

import fs from 'node:fs';
import path from 'node:path';
import { finding, makeIdAllocator } from '../pipeline/output_schemas.js';
import { makeChecker } from '../pipeline/gitignore.js';

const argv = process.argv.slice(2);
let TARGET = process.cwd();
let OUT = null;
for (let i = 0; i < argv.length; i++) {
  if (argv[i] === '--target') TARGET = path.resolve(argv[++i]);
  else if (argv[i] === '--out') OUT = path.resolve(argv[++i]);
}

const SKIP_DIRS = new Set([
  'node_modules', '.git', 'dist', 'build', 'coverage', '.next', '.nuxt',
  '3rd-party', 'third_party', 'third-party', 'vendor', '_archive', 'bin',
]);
const SKIP_FILE_RE = /\.min\.(?:js|css)$|\.bundle\.(?:js|css)$/i;
const PROD_DIRS = new Set(['src', 'app', 'components', 'views', 'pages']);
const VALID_EXT = /\.(?:js|jsx|ts|tsx|vue|mjs|cjs)$/i;

function walkProd(root, acc = []) {
  let entries;
  try { entries = fs.readdirSync(root, { withFileTypes: true }); } catch { return acc; }
  for (const e of entries) {
    if (SKIP_DIRS.has(e.name)) continue;
    const full = path.join(root, e.name);
    if (e.isDirectory()) {
      if (PROD_DIRS.has(e.name) || e.name === 'app' || /\b(src|frontend|client|server)\b/.test(e.name)) {
        walkProdInner(full, acc);
      } else if (!e.name.startsWith('.')) {
        walkProd(full, acc);
      }
    }
  }
  return acc;
}
function walkProdInner(dir, acc) {
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
  for (const e of entries) {
    if (SKIP_DIRS.has(e.name)) continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) walkProdInner(full, acc);
    else if (e.isFile() && VALID_EXT.test(e.name) && !/\.(?:test|spec)\.[jt]sx?$/i.test(e.name) && !SKIP_FILE_RE.test(e.name)) acc.push(full);
  }
}

const CONSOLE_RE = /console\.(?:log|error|warn|info|debug)\s*\(/g;

const findings = [];
const nextId = makeIdAllocator();
const files = walkProd(TARGET);
const isIgnored = makeChecker(TARGET);
const perFile = []; // { file, count }
let total = 0;

for (const file of files) {
  if (isIgnored(file)) continue;
  let text;
  try { text = fs.readFileSync(file, 'utf8'); } catch { continue; }
  let count = 0;
  const lines = text.split(/\r?\n/);
  for (const ln of lines) {
    if (/^\s*\/\//.test(ln)) continue;
    const matches = ln.match(CONSOLE_RE);
    if (matches) count += matches.length;
  }
  if (count > 0) {
    perFile.push({ file: path.relative(TARGET, file).replace(/\\/g, '/'), count });
    total += count;
  }
}

if (total > 50) {
  perFile.sort((a, b) => b.count - a.count);
  findings.push(finding({
    id: nextId(2, 'RT'),
    round: 2,
    severity: 'MEDIUM',
    category: 'RT',
    title: `${total} console statements in production paths`,
    location: { repo: '.' },
    evidence: { tool: 'console_log_scan', total, top_10: perFile.slice(0, 10) },
    remediation: `Replace console.* with a structured logger (pino, winston, etc.) and gate verbose output behind LOG_LEVEL. Production builds should strip or silence non-error console calls.`,
    compliance: 'Hygiene',
    scanner: 'console_log_scan',
  }));
}

for (const pf of perFile) {
  if (pf.count > 10) {
    findings.push(finding({
      id: nextId(2, 'RT'),
      round: 2,
      severity: 'LOW',
      category: 'RT',
      title: `${pf.count} console statements in ${pf.file}`,
      location: { file: pf.file },
      evidence: { tool: 'console_log_scan', count: pf.count },
      remediation: `Replace console.* with a structured logger in ${pf.file}.`,
      compliance: 'Polish',
      scanner: 'console_log_scan',
    }));
  }
}

if (OUT) fs.writeFileSync(OUT, JSON.stringify(findings, null, 2));
else process.stdout.write(JSON.stringify(findings, null, 2) + '\n');
