#!/usr/bin/env node
/**
 * prettier_check.js — detect packages with no enforced formatting standard.
 *
 * Looks for .prettierrc / prettier in package.json / prettier in devDependencies.
 * If none found, emits LOW.
 *
 * Usage: node prettier_check.js --target <path> [--out <file>]
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

const PRETTIER_FILES = [
  '.prettierrc', '.prettierrc.json', '.prettierrc.js', '.prettierrc.cjs',
  '.prettierrc.mjs', '.prettierrc.yml', '.prettierrc.yaml', '.prettierrc.toml',
  'prettier.config.js', 'prettier.config.cjs', 'prettier.config.mjs',
];

const findings = [];
const nextId = makeIdAllocator();

for (const tree of findPackageRoots(TARGET)) {
  const rel = path.relative(TARGET, tree) || '.';
  let pkg;
  try { pkg = JSON.parse(fs.readFileSync(path.join(tree, 'package.json'), 'utf8')); } catch { continue; }
  const hasConfigFile = PRETTIER_FILES.some(f => fs.existsSync(path.join(tree, f)));
  const inPackageJson = Object.prototype.hasOwnProperty.call(pkg, 'prettier');
  const allDeps = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) };
  const hasDep = 'prettier' in allDeps;

  if (!hasConfigFile && !inPackageJson && !hasDep) {
    findings.push(finding({
      id: nextId(1, 'FMT'),
      round: 1,
      severity: 'LOW',
      category: 'FMT',
      title: `No enforced formatting standard in ${rel}`,
      location: { repo: rel, file: 'package.json' },
      evidence: {
        tool: 'prettier_check',
        prettier_config_file: false,
        prettier_in_package_json: false,
        prettier_in_dependencies: false,
      },
      remediation: `Add prettier as a devDependency in ${rel} and create a .prettierrc with the team's chosen style. Add a "format" script so CI can verify formatting.`,
      compliance: 'Polish',
      scanner: 'prettier_check',
    }));
  }
}

if (OUT) fs.writeFileSync(OUT, JSON.stringify(findings, null, 2));
else process.stdout.write(JSON.stringify(findings, null, 2) + '\n');
