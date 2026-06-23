#!/usr/bin/env node
/**
 * gitignore_audit.js — checks .gitignore coverage and conventions.
 *
 * Detects:
 *   - Any .env / .env.* file committed to the repository (R1E-D-01).
 *   - Subdirectories that have .env files but are not covered by an
 *     ancestor .gitignore (R1E-D-01 frontend/.env gap).
 *   - Inverted convention: .env committed without a .env.example sibling
 *     (R1E-D-07).
 *   - Compiled binaries (*.exe, *.dll, *.so, *.dylib) checked in (F-08).
 *
 * Usage:
 *   node gitignore_audit.js --target <path> [--out <file>]
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

const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'build', 'coverage', '.next', '.nuxt']);

function walk(dir, acc = { envs: [], examples: [], binaries: [], gitignores: [] }) {
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return acc; }
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (SKIP_DIRS.has(e.name)) continue;
    if (e.isDirectory()) {
      walk(full, acc);
    } else if (e.isFile()) {
      const rel = path.relative(TARGET, full).replace(/\\/g, '/');
      if (/(^|\/)\.env(\.[^\/]+)?$/.test(rel) && !/\.example$/.test(rel)) acc.envs.push(rel);
      if (/(^|\/)\.env\.example$/.test(rel)) acc.examples.push(rel);
      if (/\.(exe|dll|so|dylib)$/i.test(rel)) acc.binaries.push(rel);
      if (/(^|\/)\.gitignore$/.test(rel)) acc.gitignores.push({ rel, dir: path.dirname(rel) || '.' });
    }
  }
  return acc;
}

const { envs, examples, binaries, gitignores } = walk(TARGET);
const findings = [];
const nextId = makeIdAllocator();

// Use the shared gitignore checker so coverage matches the rest of the framework.
const isIgnored = makeChecker(TARGET);
function isCovered(envOrBinRel) {
  return isIgnored(path.join(TARGET, envOrBinRel));
}

// ─── Finding 1: committed .env files that are not covered ──────────────────
for (const env of envs) {
  if (!isCovered(env)) {
    findings.push(finding({
      id: nextId(1, 'CONF'),
      round: 1,
      severity: 'MEDIUM',
      category: 'CONF',
      title: `${env} is committed but not covered by any .gitignore`,
      location: { file: env },
      evidence: { tool: 'gitignore_audit', file: env, gitignores_found: gitignores.length },
      remediation: `Add ${env} to the nearest .gitignore (or create a sibling .gitignore). Even if the file is currently public-safe, any future secret added to it will commit silently.`,
      compliance: 'Process gap',
      scanner: 'gitignore_audit',
    }));
  }
}

// ─── Finding 2: inverted convention — .env committed without .env.example ──
for (const env of envs) {
  const dir = path.dirname(env);
  const exampleHere = examples.some(e => path.dirname(e) === dir);
  if (!exampleHere) {
    findings.push(finding({
      id: nextId(1, 'CONF'),
      round: 1,
      severity: 'LOW',
      category: 'CONF',
      title: `Inverted convention: ${env} present but no .env.example sibling`,
      location: { file: env },
      evidence: { tool: 'gitignore_audit', env_file: env, expected_sibling: path.join(dir, '.env.example') },
      remediation: `Either gitignore ${env} and commit a ${path.join(dir, '.env.example')}, or move sensitive values out of the env file. Convention: .env.example is the template; .env stays local.`,
      compliance: 'Hygiene',
      scanner: 'gitignore_audit',
    }));
  }
}

// ─── Finding 3: compiled binaries that are NOT gitignored ─────────────────
// (a binary that IS gitignored is just a local build artifact, not a
// "committed binary"; we only flag genuinely-checked-in binaries.)
for (const bin of binaries) {
  if (isCovered(bin)) continue;
  findings.push(finding({
    id: nextId(1, 'BIN'),
    round: 1,
    severity: 'INFO',
    category: 'BIN',
    title: `Compiled binary committed (not gitignored): ${bin}`,
    location: { file: bin },
    evidence: { tool: 'gitignore_audit', extension: path.extname(bin) },
    remediation: `Add ${bin} (or ${path.extname(bin)}) to .gitignore, remove the binary via \`git rm\`, and produce binaries exclusively through CI/CD.`,
    compliance: 'Hygiene',
    scanner: 'gitignore_audit',
  }));
}

if (OUT) fs.writeFileSync(OUT, JSON.stringify(findings, null, 2));
else process.stdout.write(JSON.stringify(findings, null, 2) + '\n');
