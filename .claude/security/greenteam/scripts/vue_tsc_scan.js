#!/usr/bin/env node
/**
 * vue_tsc_scan.js — run vue-tsc and parse TypeScript errors.
 *
 * Detects Vue+TS project. Runs `vue-tsc --noEmit --skipLibCheck` and parses
 * errors. Also runs WITHOUT --skipLibCheck to detect the docx pattern where
 * lib-check aborts on csstype/TS1010 inside node_modules — emits a LOW
 * "by-design" finding flagging the tooling situation.
 *
 * Usage: node vue_tsc_scan.js --target <path> [--out <file>]
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

function findPackageRoots(root, depth = 0, acc = []) {
  if (depth > 4) return acc;
  let entries;
  try { entries = fs.readdirSync(root, { withFileTypes: true }); } catch { return acc; }
  if (entries.some(e => e.name === 'package.json' && e.isFile())) acc.push(root);
  for (const e of entries) {
    if (e.isDirectory() && !SKIP_DIRS.has(e.name) && !e.name.startsWith('.')) {
      findPackageRoots(path.join(root, e.name), depth + 1, acc);
    }
  }
  return acc;
}

const findings = [];
const nextId = makeIdAllocator();

for (const tree of findPackageRoots(TARGET)) {
  const rel = path.relative(TARGET, tree) || '.';
  let pkg;
  try { pkg = JSON.parse(fs.readFileSync(path.join(tree, 'package.json'), 'utf8')); } catch { continue; }
  const allDeps = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) };
  const hasVueTsc = 'vue-tsc' in allDeps;
  const hasTsconfig = fs.existsSync(path.join(tree, 'tsconfig.json'));
  if (!hasVueTsc || !hasTsconfig) continue;

  // With --skipLibCheck (normal mode)
  const r1 = spawnSync('npx', ['--yes', 'vue-tsc', '--noEmit', '--skipLibCheck'], {
    cwd: tree, encoding: 'utf8', shell: true, timeout: 300_000,
  });
  const text1 = (r1.stdout || '') + (r1.stderr || '');
  const errRe = /^(.+?)\((\d+),(\d+)\):\s*error\s+TS(\d+):\s*(.*)$/gm;
  let m;
  while ((m = errRe.exec(text1)) !== null) {
    const file = m[1].trim();
    const fileRel = path.isAbsolute(file)
      ? path.relative(TARGET, file).replace(/\\/g, '/')
      : path.relative(TARGET, path.join(tree, file)).replace(/\\/g, '/');
    findings.push(finding({
      id: nextId(2, 'TC'),
      round: 2,
      severity: 'MEDIUM',
      category: 'TC',
      title: `TS${m[4]}: ${m[5].slice(0, 120)}`,
      location: { file: fileRel, line: parseInt(m[2], 10) },
      evidence: { tool: 'vue-tsc', code: `TS${m[4]}`, message: m[5], column: parseInt(m[3], 10) },
      remediation: `Fix the type error in ${fileRel}:${m[2]}: ${m[5]}`,
      compliance: 'Audit-critical',
      scanner: 'vue_tsc_scan',
    }));
  }

  // Without --skipLibCheck — if it aborts on node_modules/csstype-style noise, emit by-design LOW
  const r2 = spawnSync('npx', ['--yes', 'vue-tsc', '--noEmit'], {
    cwd: tree, encoding: 'utf8', shell: true, timeout: 300_000,
  });
  const text2 = (r2.stdout || '') + (r2.stderr || '');
  if (/node_modules[/\\][^\s]*(?:csstype|@types)[^\s]*\(\d+,\d+\):\s*error\s+TS(?:1010|2304|7016)/.test(text2)) {
    findings.push(finding({
      id: nextId(2, 'TC'),
      round: 2,
      severity: 'LOW',
      category: 'TC',
      title: `Type-check currently bypasses node_modules in ${rel}`,
      location: { repo: rel, file: 'tsconfig.json' },
      evidence: {
        tool: 'vue-tsc',
        note: 'Without --skipLibCheck, vue-tsc aborts on third-party type definition noise (csstype TS1010 etc.). CI may not be using --skipLibCheck.',
        symptom: 'tooling-only',
      },
      remediation: `Tooling fix only: ensure CI uses \`vue-tsc --noEmit --skipLibCheck\`. Long-term, watch for upstream fixes in @types/* and revisit.`,
      status: 'by-design',
      compliance: 'Toolchain',
      scanner: 'vue_tsc_scan',
    }));
  }
}

if (OUT) fs.writeFileSync(OUT, JSON.stringify(findings, null, 2));
else process.stdout.write(JSON.stringify(findings, null, 2) + '\n');
