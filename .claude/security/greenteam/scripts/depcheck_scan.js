#!/usr/bin/env node
/**
 * depcheck_scan.js — find unused / missing dependencies.
 *
 * Prefers `npx depcheck --json`; if not available, falls back to grepping
 * imports across src/ to find deps with zero references.
 *
 * Usage: node depcheck_scan.js --target <path> [--out <file>]
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

function walkSrc(dir, acc = []) {
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return acc; }
  for (const e of entries) {
    if (SKIP_DIRS.has(e.name)) continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) walkSrc(full, acc);
    else if (e.isFile() && /\.(?:js|jsx|ts|tsx|vue|mjs|cjs)$/i.test(e.name)) acc.push(full);
  }
  return acc;
}

const findings = [];
const nextId = makeIdAllocator();

for (const tree of findPackageRoots(TARGET)) {
  const rel = path.relative(TARGET, tree) || '.';
  let parsed = null;

  const r = spawnSync('npx', ['--yes', 'depcheck', '--json'], {
    cwd: tree, encoding: 'utf8', shell: true, timeout: 120_000,
  });
  if (r.stdout) {
    try { parsed = JSON.parse(r.stdout); } catch {}
  }

  let unused = [];
  let missing = [];
  if (parsed) {
    unused = Array.isArray(parsed.dependencies) ? parsed.dependencies : [];
    missing = parsed.missing ? Object.keys(parsed.missing) : [];
  } else {
    // Fallback: grep imports for each declared dep
    let pkg;
    try { pkg = JSON.parse(fs.readFileSync(path.join(tree, 'package.json'), 'utf8')); } catch { continue; }
    const deps = Object.keys(pkg.dependencies || {});
    if (deps.length === 0) continue;
    const files = walkSrc(tree);
    const corpus = files.map(f => { try { return fs.readFileSync(f, 'utf8'); } catch { return ''; } }).join('\n');
    for (const d of deps) {
      const re = new RegExp(`(?:from\\s+['"\`]|require\\(\\s*['"\`]|import\\(\\s*['"\`])${d.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?:/|['"\`])`, 'g');
      if (!re.test(corpus)) unused.push(d);
    }
  }

  for (const dep of unused) {
    findings.push(finding({
      id: nextId(1, 'UNUSED'),
      round: 1,
      severity: 'LOW',
      category: 'UNUSED',
      title: `Unused dependency ${dep} in ${rel}`,
      location: { repo: rel, file: 'package.json' },
      evidence: { tool: 'depcheck_scan', package: dep, kind: 'unused' },
      remediation: `If ${dep} is genuinely unused, run \`npm uninstall ${dep}\` in ${rel}. If it is used at runtime via dynamic require, add a depcheck ignore entry.`,
      compliance: 'Hygiene',
      scanner: 'depcheck_scan',
    }));
  }
  for (const dep of missing) {
    findings.push(finding({
      id: nextId(1, 'UNUSED'),
      round: 1,
      severity: 'LOW',
      category: 'UNUSED',
      title: `Missing declared dependency ${dep} in ${rel}`,
      location: { repo: rel, file: 'package.json' },
      evidence: { tool: 'depcheck_scan', package: dep, kind: 'missing' },
      remediation: `Add ${dep} to dependencies in ${rel}/package.json (it is imported but not declared).`,
      compliance: 'Hygiene',
      scanner: 'depcheck_scan',
    }));
  }
}

if (OUT) fs.writeFileSync(OUT, JSON.stringify(findings, null, 2));
else process.stdout.write(JSON.stringify(findings, null, 2) + '\n');
