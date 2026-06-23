#!/usr/bin/env node
/**
 * broken_file_deps_scan.js — detect broken local file:// dependencies.
 *
 * Matches F-06 from the Lungfish ground truth: `"lungfish-phase-1": "file:../../_project"`
 * in package.json where the target path does not exist on disk. depcheck
 * does not validate file:// dependency resolution.
 *
 * Severity:
 *   - LOW per broken file:// dep (npm install will fail / silently use a stale module).
 *
 * Usage: node broken_file_deps_scan.js --target <path> [--out <file>]
 */

import fs from 'node:fs';
import path from 'node:path';
import { finding, makeIdAllocator } from '../pipeline/output_schemas.js';

const argv = process.argv.slice(2);
let TARGET = process.cwd();
let OUT = null;
for (let i = 0; i < argv.length; i++) {
  if (argv[i] === '--target') TARGET = path.resolve(argv[++i]);
  else if (argv[i] === '--out') OUT = path.resolve(argv[++i]);
}

const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'build', 'coverage', '.next', '.nuxt']);

function findPackageJsons(root, depth = 0, acc = []) {
  if (depth > 4) return acc;
  let entries;
  try { entries = fs.readdirSync(root, { withFileTypes: true }); } catch { return acc; }
  for (const e of entries) {
    if (e.isFile() && e.name === 'package.json') acc.push(path.join(root, 'package.json'));
    if (e.isDirectory() && !SKIP_DIRS.has(e.name) && !e.name.startsWith('.')) {
      findPackageJsons(path.join(root, e.name), depth + 1, acc);
    }
  }
  return acc;
}

const findings = [];
const nextId = makeIdAllocator();

for (const pkgPath of findPackageJsons(TARGET)) {
  let pkg;
  try { pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8')); } catch { continue; }
  const pkgDir = path.dirname(pkgPath);
  const pkgRel = path.relative(TARGET, pkgPath).replace(/\\/g, '/');

  const deps = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}), ...(pkg.optionalDependencies || {}) };
  for (const [name, spec] of Object.entries(deps)) {
    if (typeof spec !== 'string') continue;
    const m = spec.match(/^file:(.+)$/);
    if (!m) continue;
    let depPath = m[1].trim();
    const resolved = path.resolve(pkgDir, depPath);
    const exists = fs.existsSync(resolved);
    // Two failure modes:
    //   (1) Path does not exist at all → BROKEN
    //   (2) Path resolves but to a sibling/parent OUTSIDE the package tree
    //       (any `..` segment) → FRAGILE: works on this disk, fails in CI
    //       and in a fresh clone where the sibling repo isn't checked out.
    const isFragileExternal = /^(?:\.\.[/\\]|\.\.$)|[/\\]\.\.[/\\]|[/\\]\.\.$/.test(depPath);

    if (!exists) {
      findings.push(finding({
        id: nextId(1, 'DEP'),
        round: 1,
        severity: 'LOW',
        category: 'DEP',
        title: `Broken local file:// dependency: ${name} → ${depPath} (does not exist)`,
        location: { file: pkgRel },
        evidence: {
          tool: 'broken_file_deps_scan',
          dep_name: name,
          file_spec: spec,
          attempted_path: resolved.replace(/\\/g, '/'),
          note: 'npm install will fail in any clean environment (CI, fresh clone). Hard blocker for onboarding and CI pipelines.',
        },
        remediation: `Either remove the broken dep from ${pkgRel}, point it at the correct path, or convert to a real published package.`,
        compliance: 'Process gap',
        scanner: 'broken_file_deps_scan',
      }));
    } else if (isFragileExternal) {
      findings.push(finding({
        id: nextId(1, 'DEP'),
        round: 1,
        severity: 'LOW',
        category: 'DEP',
        title: `Fragile file:// dependency: ${name} → ${depPath} (resolves locally but points outside this package's tree)`,
        location: { file: pkgRel },
        evidence: {
          tool: 'broken_file_deps_scan',
          dep_name: name,
          file_spec: spec,
          resolved_path: resolved.replace(/\\/g, '/'),
          note: 'Resolves on this disk because the sibling/parent path happens to exist. In any environment where that sibling repo is not checked out (CI, a colleague\'s fresh clone, a Docker build context), npm install will fail.',
        },
        remediation: `Convert ${name} to a real published package, or use a monorepo tool (npm workspaces, pnpm workspaces, turborepo) that declares the dependency graph properly.`,
        compliance: 'Process gap',
        scanner: 'broken_file_deps_scan',
      }));
    }
  }
}

if (OUT) fs.writeFileSync(OUT, JSON.stringify(findings, null, 2));
else process.stdout.write(JSON.stringify(findings, null, 2) + '\n');
