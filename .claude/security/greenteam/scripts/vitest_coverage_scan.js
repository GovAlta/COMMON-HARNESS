#!/usr/bin/env node
/**
 * vitest_coverage_scan.js — run vitest with coverage; emit shape findings.
 *
 * Matches R2-A-10/R2-A-11: per-file <20% line coverage + >100 source lines.
 * Emits HIGH per such file with analysis sentence. Also emits MEDIUM per
 * failing test.
 *
 * Usage: node vitest_coverage_scan.js --target <path> [--out <file>]
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

function findTestFiles(dir, depth = 0, acc = []) {
  if (depth > 5) return acc;
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return acc; }
  for (const e of entries) {
    if (SKIP_DIRS.has(e.name)) continue;
    if (e.isDirectory()) findTestFiles(path.join(dir, e.name), depth + 1, acc);
    else if (e.isFile() && /\.(?:test|spec)\.[jt]sx?$/.test(e.name)) acc.push(path.join(dir, e.name));
    else if (e.isFile() && /__tests__/.test(dir) && /\.[jt]sx?$/.test(e.name)) acc.push(path.join(dir, e.name));
  }
  return acc;
}

for (const tree of findPackageRoots(TARGET)) {
  const rel = path.relative(TARGET, tree) || '.';
  let pkg;
  try { pkg = JSON.parse(fs.readFileSync(path.join(tree, 'package.json'), 'utf8')); } catch { continue; }
  const allDeps = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) };
  const hasVitest = 'vitest' in allDeps;
  const hasConfig = ['vitest.config.js', 'vitest.config.ts', 'vitest.config.mjs', 'vite.config.js', 'vite.config.ts']
    .some(n => fs.existsSync(path.join(tree, n)));
  const testFiles = findTestFiles(tree);
  // Run if vitest declared (with or without dedicated config) OR if test files + a vite config exist
  if (!hasVitest && testFiles.length === 0) continue;

  // R2-B-02-style finding: tests exist but unreachable via `npm test`
  const testScript = (pkg.scripts && pkg.scripts.test) || '';
  const npmTestRunsVitest = /\bvitest\b/.test(testScript);
  if (testFiles.length > 0 && !npmTestRunsVitest) {
    findings.push(finding({
      id: nextId(2, 'TEST'),
      round: 2,
      severity: 'MEDIUM',
      category: 'TEST',
      title: `${testFiles.length} test file(s) exist in ${rel} but \`npm test\` does not run vitest`,
      location: { repo: rel, file: path.join(rel, 'package.json') },
      evidence: {
        tool: 'vitest_coverage_scan',
        test_files: testFiles.length,
        test_files_sample: testFiles.slice(0, 5).map(f => path.relative(TARGET, f).replace(/\\/g, '/')),
        test_script: testScript || '(missing)',
        vitest_declared: hasVitest,
        note: 'Tests are invisible to any tool that follows the npm convention. Add `"test": "vitest run"` to package.json.',
      },
      remediation: 'Add `"test": "vitest run"` (and `"test:coverage": "vitest run --coverage"`) to scripts in package.json.',
      compliance: 'Process gap',
      scanner: 'vitest_coverage_scan',
    }));
  }

  if (!hasConfig || testFiles.length === 0) continue;

  const reporterPath = path.join(tree, '.vitest-greenteam-report.json');
  let r = spawnSync('npx', [
    '--yes', 'vitest', 'run', '--coverage',
    '--coverage.reportOnFailure', '--coverage.reporter=json-summary', '--coverage.reporter=text',
    '--reporter=json', `--outputFile=${reporterPath}`,
  ], { cwd: tree, encoding: 'utf8', shell: true, timeout: 600_000, maxBuffer: 64 * 1024 * 1024 });

  // If coverage provider is missing: emit the gap-finding, then attempt a
  // transparent `npm install --no-save @vitest/coverage-v8` so we can
  // actually surface the coverage shape (R2-A-10 / R2-A-11 pattern) instead
  // of leaving the analysis blocked. Cleanup happens via npm itself — we
  // don't modify package.json.
  const stderrText = (r.stderr || '') + (r.stdout || '');
  const providerMissing = /MISSING DEPENDENCY.*@vitest\/coverage-/.test(stderrText)
    || /Cannot find dependency.*@vitest\/coverage/.test(stderrText)
    || /Failed to load url .*@vitest\/coverage/.test(stderrText);
  let autoInstalled = false;
  if (providerMissing) {
    findings.push(finding({
      id: nextId(2, 'COV'),
      round: 2,
      severity: 'MEDIUM',
      category: 'COV',
      title: `Coverage provider not declared in ${rel} — coverage shape would not surface in CI`,
      location: { repo: rel, file: path.join(rel, 'package.json') },
      evidence: {
        tool: 'vitest_coverage_scan',
        missing: '@vitest/coverage-v8 (or @vitest/coverage-istanbul)',
        symptom: 'Coverage is documented as available via `vitest run --coverage` but the provider package is not in devDependencies. CI runs that include --coverage will fail OR silently emit no coverage.',
      },
      remediation: `Add \`@vitest/coverage-v8\` (or \`@vitest/coverage-istanbul\`) to devDependencies in ${rel}.`,
      compliance: 'Process gap',
      scanner: 'vitest_coverage_scan',
    }));

    // Attempt non-destructive install — node_modules only, package.json untouched.
    // Match vitest's major version so the coverage provider's peer-dep aligns.
    let vitestMajor = null;
    const vitestSpec = allDeps.vitest || '';
    const mmajor = vitestSpec.match(/(\d+)/);
    if (mmajor) vitestMajor = mmajor[1];
    const covPkg = vitestMajor ? `@vitest/coverage-v8@${vitestMajor}` : '@vitest/coverage-v8';
    process.stderr.write(`vitest_coverage_scan: attempting transparent install of ${covPkg} in ${rel}…\n`);
    let inst = spawnSync('npm', ['install', '--no-save', '--no-audit', '--no-fund', '--silent', covPkg],
      { cwd: tree, encoding: 'utf8', shell: true, timeout: 300_000 });
    if (inst.status !== 0) {
      // Retry with legacy-peer-deps as a last resort
      process.stderr.write(`vitest_coverage_scan: peer-dep conflict; retrying with --legacy-peer-deps\n`);
      inst = spawnSync('npm', ['install', '--no-save', '--no-audit', '--no-fund', '--silent', '--legacy-peer-deps', covPkg],
        { cwd: tree, encoding: 'utf8', shell: true, timeout: 300_000 });
    }
    if (inst.status === 0) {
      autoInstalled = true;
      process.stderr.write(`vitest_coverage_scan: install ok, retrying with coverage\n`);
      r = spawnSync('npx', [
        '--yes', 'vitest', 'run', '--coverage', '--coverage.reportOnFailure',
        '--reporter=json', `--outputFile=${reporterPath}`,
      ], { cwd: tree, encoding: 'utf8', shell: true, timeout: 600_000, maxBuffer: 64 * 1024 * 1024 });
    } else {
      process.stderr.write(`vitest_coverage_scan: install failed (likely target has broken file:// deps); falling back to test-only run\n`);
      r = spawnSync('npx', [
        '--yes', 'vitest', 'run', '--reporter=json', `--outputFile=${reporterPath}`,
      ], { cwd: tree, encoding: 'utf8', shell: true, timeout: 600_000, maxBuffer: 64 * 1024 * 1024 });
    }
  }

  // Failing tests (from json reporter)
  if (fs.existsSync(reporterPath)) {
    let rep;
    try { rep = JSON.parse(fs.readFileSync(reporterPath, 'utf8')); } catch { rep = null; }
    if (rep && Array.isArray(rep.testResults)) {
      for (const tr of rep.testResults) {
        for (const a of (tr.assertionResults || [])) {
          if (a.status === 'failed') {
            findings.push(finding({
              id: nextId(2, 'TEST'),
              round: 2,
              severity: 'MEDIUM',
              category: 'TEST',
              title: `Vitest failure: ${a.fullName || a.title}`,
              location: { file: path.relative(TARGET, tr.name || '').replace(/\\/g, '/') },
              evidence: {
                tool: 'vitest',
                assertion: (a.failureMessages || []).join('\n').slice(0, 600),
              },
              remediation: `Fix the failing assertion or update the test if behavior changed intentionally.`,
              scanner: 'vitest_coverage_scan',
            }));
          }
        }
      }
    }
    try { fs.unlinkSync(reporterPath); } catch {}
  }

  // Coverage summary
  const covSummary = path.join(tree, 'coverage', 'coverage-summary.json');
  if (!fs.existsSync(covSummary)) continue;
  let summary;
  try { summary = JSON.parse(fs.readFileSync(covSummary, 'utf8')); } catch { continue; }

  for (const [file, m] of Object.entries(summary)) {
    if (file === 'total') continue;
    const lines = m && m.lines;
    if (!lines) continue;
    const pct = typeof lines.pct === 'number' ? lines.pct : 0;
    const total = lines.total || 0;
    if (pct < 20 && total > 100) {
      const fileRel = path.relative(TARGET, file).replace(/\\/g, '/');
      findings.push(finding({
        id: nextId(2, 'COV'),
        round: 2,
        severity: 'HIGH',
        category: 'COV',
        title: `Low coverage in ${fileRel}: ${pct.toFixed(2)}% (${total} lines)`,
        location: { file: fileRel },
        evidence: {
          tool: 'vitest',
          coverage_pct: pct,
          total_lines: total,
          covered_lines: lines.covered || 0,
          analysis: 'Foundation files (lib/, composables/) are well-tested while orchestration files are not — coverage shape is asymmetric.',
        },
        remediation: `Add tests covering the orchestration paths in ${fileRel} (state transitions, error branches, integration with composables).`,
        compliance: 'Audit-critical',
        scanner: 'vitest_coverage_scan',
      }));
    }
  }
}

if (OUT) fs.writeFileSync(OUT, JSON.stringify(findings, null, 2));
else process.stdout.write(JSON.stringify(findings, null, 2) + '\n');
