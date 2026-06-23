#!/usr/bin/env node
/**
 * madge_scan.js — detect circular imports via madge.
 *
 * Tries `npx madge --circular --json --ts-config <tsconfig> <src>` in each
 * project root. If madge unavailable, skip silently.
 *
 * Usage: node madge_scan.js --target <path> [--out <file>]
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
  const srcDir = ['src', 'app', 'lib'].map(s => path.join(tree, s)).find(p => fs.existsSync(p));
  if (!srcDir) continue;
  const tsconfig = path.join(tree, 'tsconfig.json');
  const args = ['--yes', 'madge', '--circular', '--json'];
  if (fs.existsSync(tsconfig)) args.push('--ts-config', tsconfig);
  args.push(srcDir);

  const r = spawnSync('npx', args, { cwd: tree, encoding: 'utf8', shell: true, timeout: 180_000 });
  if (!r.stdout) continue;
  let cycles;
  try { cycles = JSON.parse(r.stdout); } catch { continue; }
  if (!Array.isArray(cycles) || cycles.length === 0) continue;

  for (const cycle of cycles) {
    const chain = Array.isArray(cycle) ? cycle.join(' → ') : String(cycle);
    findings.push(finding({
      id: nextId(1, 'CIRC'),
      round: 1,
      severity: 'MEDIUM',
      category: 'CIRC',
      title: `Circular import cycle in ${rel}`,
      location: { repo: rel },
      evidence: { tool: 'madge', cycle: Array.isArray(cycle) ? cycle : [String(cycle)], chain },
      remediation: `Break the cycle by extracting shared types/interfaces into a leaf module, or by inverting the dependency at one edge of the cycle.`,
      compliance: 'Hygiene',
      scanner: 'madge_scan',
    }));
  }
}

if (OUT) fs.writeFileSync(OUT, JSON.stringify(findings, null, 2));
else process.stdout.write(JSON.stringify(findings, null, 2) + '\n');
