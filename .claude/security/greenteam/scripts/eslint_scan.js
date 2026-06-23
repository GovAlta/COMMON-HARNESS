#!/usr/bin/env node
/**
 * eslint_scan.js — run ESLint and emit per-rule findings.
 *
 * - severity 2 → MEDIUM (HIGH for no-undef per R2-B-03)
 * - severity 1 → LOW
 * - rules firing >20× in one repo collapse to one finding with `count`.
 *
 * Usage: node eslint_scan.js --target <path> [--out <file>]
 */

import fs from 'node:fs';
import os from 'node:os';
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
const CONFIG_NAMES = [
  'eslint.config.js', 'eslint.config.mjs', 'eslint.config.cjs', 'eslint.config.ts',
  '.eslintrc.js', '.eslintrc.cjs', '.eslintrc.json', '.eslintrc.yml', '.eslintrc.yaml',
];

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

// Minimal review-only eslint config used when target has eslint as dep but no
// config of its own. Mirrors what a human reviewer wrote in the Lungfish
// Round-2 docx (R2-B-01) to produce the first lint pass the codebase ever had.
// Written DIRECTLY INTO the target project so @eslint/js + plugins resolve
// from the target's node_modules. File is deleted after the scan.
const TEMP_CONFIG_FILENAME = '.greenteam-eslint.config.mjs';
const TEMP_CONFIG_JS = `
// AUTO-WRITTEN BY GREENTEAM eslint_scan — temporary review config.
// Project has eslint installed but no config of its own. Without this temp
// config, eslint cannot run and the no-config gap hides other findings.
// File is deleted after the scan.
export default [
  {
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: {
        window: 'readonly', document: 'readonly', navigator: 'readonly', console: 'readonly',
        process: 'readonly', module: 'readonly', require: 'readonly', __dirname: 'readonly',
        __filename: 'readonly', global: 'readonly', Buffer: 'readonly',
        setTimeout: 'readonly', setInterval: 'readonly', clearTimeout: 'readonly', clearInterval: 'readonly',
        fetch: 'readonly', URL: 'readonly', URLSearchParams: 'readonly',
        localStorage: 'readonly', sessionStorage: 'readonly', alert: 'readonly', confirm: 'readonly',
        Promise: 'readonly', Map: 'readonly', Set: 'readonly', Symbol: 'readonly',
        FormData: 'readonly', Blob: 'readonly', File: 'readonly',
        // test globals
        describe: 'readonly', it: 'readonly', test: 'readonly', expect: 'readonly',
        beforeEach: 'readonly', afterEach: 'readonly', beforeAll: 'readonly', afterAll: 'readonly',
        vi: 'readonly', vitest: 'readonly',
      },
    },
    rules: {
      'no-undef': 'error',
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
      'no-console': 'warn',
      'no-debugger': 'error',
      'no-dupe-keys': 'error',
      'no-dupe-args': 'error',
      'no-unreachable': 'error',
      'no-empty': 'warn',
    },
  },
  { ignores: ['node_modules/', 'dist/', 'build/', 'coverage/', '.nuxt/', '.next/', '3rd-party/', '_archive/'] },
];
`.trim() + '\n';

const findings = [];
const nextId = makeIdAllocator();

for (const tree of findPackageRoots(TARGET)) {
  const rel = path.relative(TARGET, tree) || '.';
  let pkg;
  try { pkg = JSON.parse(fs.readFileSync(path.join(tree, 'package.json'), 'utf8')); } catch { continue; }
  const allDeps = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) };
  const hasEslint = 'eslint' in allDeps;
  const hasConfig = CONFIG_NAMES.some(n => fs.existsSync(path.join(tree, n)));
  if (!hasEslint) continue;

  // If no config: write a temp review config DIRECTLY in the target project's
  // root so `@eslint/js` etc. resolve from the target's node_modules. Delete
  // it after the scan completes. If eslint-plugin-vue is present, layer in
  // .vue parsing AND vue-specific rules (vue/return-in-computed-property,
  // vue/no-unused-components, vue/no-undef-properties) so SFC findings
  // like R2-A-04 (computed missing return) surface.
  let tempConfigPath = null;
  let usedTempConfig = false;
  let cliArgs = ['--yes', 'eslint', '.', '--format', 'json', '--no-fix'];
  if (!hasConfig) {
    try {
      tempConfigPath = path.join(tree, TEMP_CONFIG_FILENAME);
      let configBody = TEMP_CONFIG_JS;
      const hasVuePlugin = 'eslint-plugin-vue' in allDeps;
      const hasVueParser = 'vue-eslint-parser' in allDeps || hasVuePlugin;
      if (hasVueParser) {
        // Layer in Vue parser + a curated set of vue rules that catch the
        // docx R2-A class (dead handlers, missing returns, unused components).
        const vueImport = hasVuePlugin
          ? `import vueParser from 'vue-eslint-parser';\nimport vue from 'eslint-plugin-vue';\n`
          : `import vueParser from 'vue-eslint-parser';\n`;
        const vueBlock = hasVuePlugin
          ? `  { files: ["**/*.vue"], languageOptions: { parser: vueParser, ecmaVersion: "latest", sourceType: "module" }, plugins: { vue }, rules: {
      'vue/return-in-computed-property': 'error',
      'vue/no-unused-components': 'warn',
      'vue/no-unused-vars': 'warn',
      'vue/no-undef-properties': 'warn',
      'vue/no-undef-components': 'warn',
      'vue/no-dupe-keys': 'error',
      'vue/no-mutating-props': 'warn',
      'vue/require-default-prop': 'warn',
    } },\n`
          : `  { files: ["**/*.vue"], languageOptions: { parser: vueParser, ecmaVersion: "latest", sourceType: "module" } },\n`;
        configBody = vueImport + TEMP_CONFIG_JS.replace('export default [', 'export default [\n' + vueBlock);
      }
      fs.writeFileSync(tempConfigPath, configBody);
      // Lint .vue + .js + .ts + .jsx + .tsx explicitly via glob (flat-config style)
      cliArgs = ['--yes', 'eslint', '"src/**/*.{js,jsx,ts,tsx,vue,mjs,cjs}"', '"*.{js,mjs,cjs}"',
                 '--format', 'json', '--no-fix', '--config', TEMP_CONFIG_FILENAME];
      usedTempConfig = true;
    } catch { /* fall through; eslint will error */ }
  }

  const r = spawnSync('npx', cliArgs, {
    cwd: tree, encoding: 'utf8', shell: true, timeout: 300_000, maxBuffer: 32 * 1024 * 1024,
  });

  if (tempConfigPath) {
    try { fs.unlinkSync(tempConfigPath); } catch {}
  }
  if (!r.stdout) continue;
  let report;
  try { report = JSON.parse(r.stdout); } catch { continue; }
  if (!Array.isArray(report)) continue;

  // Bucket by rule
  const ruleBuckets = new Map(); // ruleId -> [{file,line,severity,message}]
  for (const f of report) {
    for (const msg of (f.messages || [])) {
      const ruleId = msg.ruleId || '(no-rule)';
      const arr = ruleBuckets.get(ruleId) || [];
      arr.push({
        file: path.relative(TARGET, f.filePath).replace(/\\/g, '/'),
        line: msg.line || null,
        severity: msg.severity,
        message: msg.message,
      });
      ruleBuckets.set(ruleId, arr);
    }
  }

  for (const [ruleId, occurrences] of ruleBuckets) {
    const first = occurrences[0];
    const isError = first.severity === 2;
    let sev = isError ? 'MEDIUM' : 'LOW';
    if (ruleId === 'no-undef' && isError) sev = 'HIGH';
    if (ruleId === 'no-unused-vars' && isError && occurrences.length > 5) sev = 'MEDIUM';

    if (occurrences.length > 20) {
      findings.push(finding({
        id: nextId(2, 'LINT'),
        round: 2,
        severity: sev,
        category: 'LINT',
        title: `ESLint ${ruleId} fires ${occurrences.length}× in ${rel}${usedTempConfig ? ' (temp review config)' : ''}`,
        location: { repo: rel, file: first.file, line: first.line },
        evidence: {
          tool: 'eslint',
          rule: ruleId,
          count: occurrences.length,
          sample_first_5: occurrences.slice(0, 5),
          temp_config: usedTempConfig,
          temp_config_note: usedTempConfig ? 'Project has no eslint config of its own; greenteam wrote a temp review config (no-undef + no-unused-vars + no-console + recommended rules). Findings here would never surface in CI because the project lint is silently a no-op.' : undefined,
        },
        remediation: `Fix the underlying issue or, if intentional, disable ${ruleId} for the relevant files via an eslint override (don't disable globally).${usedTempConfig ? ' Also: commit a real eslint.config so these findings stop hiding.' : ''}`,
        scanner: 'eslint_scan',
      }));
    } else {
      for (const occ of occurrences) {
        findings.push(finding({
          id: nextId(2, 'LINT'),
          round: 2,
          severity: sev,
          category: 'LINT',
          title: `ESLint ${ruleId}: ${occ.message.slice(0, 120)}${usedTempConfig ? ' (temp review config)' : ''}`,
          location: { repo: rel, file: occ.file, line: occ.line },
          evidence: {
            tool: 'eslint',
            rule: ruleId,
            message: occ.message,
            temp_config: usedTempConfig,
          },
          remediation: `Fix ${ruleId} at ${occ.file}:${occ.line}.${usedTempConfig ? ' Also: commit a real eslint.config so these findings surface in CI.' : ''}`,
          scanner: 'eslint_scan',
        }));
      }
    }
  }
}

if (OUT) fs.writeFileSync(OUT, JSON.stringify(findings, null, 2));
else process.stdout.write(JSON.stringify(findings, null, 2) + '\n');
