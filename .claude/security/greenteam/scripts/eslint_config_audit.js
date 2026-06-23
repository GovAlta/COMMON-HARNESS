#!/usr/bin/env node
/**
 * eslint_config_audit.js — detect ESLint configuration anti-patterns.
 *
 * Catches:
 *   - R2-B-01: husky+lint-staged pre-commit wired but no eslint.config.* file
 *     (linting silently does nothing on every commit).
 *   - R1E-B-01: eslint.config*.{js,mjs,cjs,ts} imports a plugin from a hardcoded
 *     absolute path that won't resolve on any other machine
 *     (e.g. `file://C:/...` or `/Users/<name>/...`).
 *   - Tooling installed (eslint in devDependencies) but no config file at all.
 *   - lint script defined in package.json but no config file.
 *
 * Usage:
 *   node eslint_config_audit.js --target <path> [--out <file>]
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

const ESLINT_CONFIG_NAMES = [
  'eslint.config.js', 'eslint.config.mjs', 'eslint.config.cjs', 'eslint.config.ts',
  '.eslintrc.js', '.eslintrc.cjs', '.eslintrc.json', '.eslintrc.yml', '.eslintrc.yaml',
];

function findEslintConfigs(root) {
  const out = [];
  let entries;
  try { entries = fs.readdirSync(root, { withFileTypes: true }); } catch { return out; }
  for (const e of entries) {
    if (e.isFile() && (ESLINT_CONFIG_NAMES.includes(e.name) || /^eslint\..+\.(?:config\.)?(?:js|mjs|cjs)$/.test(e.name))) {
      out.push(path.join(root, e.name));
    }
  }
  return out;
}

const findings = [];
const nextId = makeIdAllocator();

for (const pkgRoot of findPackageRoots(TARGET)) {
  const rel = path.relative(TARGET, pkgRoot) || '.';
  let pkg;
  try { pkg = JSON.parse(fs.readFileSync(path.join(pkgRoot, 'package.json'), 'utf8')); } catch { continue; }

  const allDeps = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) };
  const hasEslintDep = 'eslint' in allDeps;
  const lintScript = pkg.scripts && pkg.scripts.lint;
  const huskyHook = pkg.scripts && pkg.scripts.prepare && /husky/.test(pkg.scripts.prepare);
  const lintStaged = pkg['lint-staged'] || (pkg.devDependencies && pkg.devDependencies['lint-staged']);
  const configs = findEslintConfigs(pkgRoot);

  // R2-B-01: husky + lint-staged wired with eslint but no rules to enforce
  if (huskyHook && lintStaged && (hasEslintDep || (typeof lintStaged === 'object' && JSON.stringify(lintStaged).includes('eslint'))) && configs.length === 0) {
    findings.push(finding({
      id: nextId(2, 'LINT'),
      round: 2,
      severity: 'HIGH',
      category: 'LINT',
      title: `Lint runs on every commit but has zero rules to enforce in ${rel}`,
      location: { file: path.join(rel, 'package.json') },
      evidence: {
        tool: 'eslint_config_audit',
        husky: true,
        lint_staged: true,
        eslint_dep: hasEslintDep,
        configs_found: [],
        symptom: 'Pre-commit hook silently does nothing; git history looks linted but no rule was applied',
      },
      remediation: `Create an eslint.config.{js,mjs} in ${rel} with rules the team wants to enforce. Either accept the first-run findings as a baseline (write rules to prevent regressions) or commit to a phased cleanup.`,
      compliance: 'Process gap',
      scanner: 'eslint_config_audit',
    }));
  }
  // Plain "no config + has eslint dep" case
  else if (hasEslintDep && configs.length === 0) {
    findings.push(finding({
      id: nextId(2, 'LINT'),
      round: 2,
      severity: lintScript ? 'HIGH' : 'MEDIUM',
      category: 'LINT',
      title: `ESLint installed but no config file in ${rel}`,
      location: { file: path.join(rel, 'package.json') },
      evidence: { tool: 'eslint_config_audit', eslint_dep: true, lint_script: !!lintScript },
      remediation: `Create an eslint.config.{js,mjs} in ${rel}. Without one, ${lintScript ? '`npm run lint` errors out' : 'the installed eslint never runs'}.`,
      compliance: 'Process gap',
      scanner: 'eslint_config_audit',
    }));
  }

  // R1E-B-01: hardcoded absolute paths in eslint config (file:// + drive letter or /Users/)
  for (const cfg of configs) {
    let text;
    try { text = fs.readFileSync(cfg, 'utf8'); } catch { continue; }
    const hardcoded = [
      /file:\/\/[A-Za-z]:[/\\]/g,       // file://C:/...
      /from\s+['"`]\/Users\/[^\s'"`]+['"`]/g,  // import x from '/Users/...'
      /from\s+['"`][A-Z]:\\[^\s'"`]+['"`]/g,    // import x from 'C:\\...'
      /require\s*\(\s*['"`]\/Users\/[^\s'"`]+['"`]\s*\)/g,
    ];
    for (const re of hardcoded) {
      let m;
      while ((m = re.exec(text)) !== null) {
        const line = text.slice(0, m.index).split('\n').length;
        findings.push(finding({
          id: nextId(1, 'LINT'),
          round: 1,
          severity: 'HIGH',
          category: 'LINT',
          title: `Hardcoded absolute path in ESLint config — scan cannot run anywhere except author's machine`,
          location: { file: path.relative(TARGET, cfg).replace(/\\/g, '/'), line },
          evidence: { tool: 'eslint_config_audit', match: m[0], config_file: path.relative(TARGET, cfg) },
          remediation: `Install the imported plugin as a regular devDependency in ${rel} and import it conventionally. The current path cannot resolve in CI or on any other machine, so the security ESLint scan is documented but never executes.`,
          compliance: 'Process gap',
          scanner: 'eslint_config_audit',
        }));
      }
    }
  }
}

if (OUT) fs.writeFileSync(OUT, JSON.stringify(findings, null, 2));
else process.stdout.write(JSON.stringify(findings, null, 2) + '\n');
