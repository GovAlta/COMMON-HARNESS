#!/usr/bin/env node
/**
 * go_test_coverage_scan.js — per-package Go coverage.
 *
 * `go test ./... -short -cover -count=1`. Parses lines like:
 *   ok   acme/auth   0.123s   coverage: 12.3% of statements
 *   ok   acme/x      0.000s   coverage: [no statements]
 *   FAIL acme/y      [build failed]
 *
 * <5% → LOW, <20% → MEDIUM, auth/security packages <10% → HIGH.
 * Build/compile failure → MEDIUM "test compilation failed".
 *
 * Usage: node go_test_coverage_scan.js --target <path> [--out <file>]
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

function findGoMods(root, depth = 0, acc = []) {
  if (depth > 6) return acc;
  let entries;
  try { entries = fs.readdirSync(root, { withFileTypes: true }); } catch { return acc; }
  if (entries.some(e => e.name === 'go.mod' && e.isFile())) acc.push(root);
  for (const e of entries) {
    if (e.isDirectory() && !SKIP_DIRS.has(e.name) && !e.name.startsWith('.')) {
      findGoMods(path.join(root, e.name), depth + 1, acc);
    }
  }
  return acc;
}

const findings = [];
const nextId = makeIdAllocator();
const mods = findGoMods(TARGET);
if (mods.length === 0) {
  if (OUT) fs.writeFileSync(OUT, '[]');
  else process.stdout.write('[]\n');
  process.exit(0);
}

const isAuthOrSec = pkg => /\b(auth|security|crypto|casbin|rbac|authz|authn)\b/i.test(pkg);

for (const mod of mods) {
  const rel = path.relative(TARGET, mod) || '.';
  const r = spawnSync('go', ['test', './...', '-short', '-cover', '-count=1'], {
    cwd: mod, encoding: 'utf8', shell: true, timeout: 600_000, maxBuffer: 32 * 1024 * 1024,
  });
  const text = (r.stdout || '') + '\n' + (r.stderr || '');
  if (r.error) continue;

  const lineRe = /^(ok|FAIL|---)\s+(\S+)\s+(?:[\d.]+s|\[.*\])?(?:.*coverage:\s*([\d.]+)%[^]*)?$/gm;
  // Simpler: walk lines.
  const lines = text.split(/\r?\n/);
  for (const ln of lines) {
    let m;
    if ((m = ln.match(/^ok\s+(\S+)\s+[\d.]+s\s+coverage:\s*([\d.]+)%/))) {
      const pkg = m[1];
      const pct = parseFloat(m[2]);
      let sev = null;
      if (isAuthOrSec(pkg) && pct < 10) sev = 'HIGH';
      else if (pct < 5) sev = 'LOW';
      else if (pct < 20) sev = 'MEDIUM';
      if (sev) {
        findings.push(finding({
          id: nextId(2, 'COV'),
          round: 2,
          severity: sev,
          category: 'COV',
          title: `Low Go coverage in ${pkg}: ${pct.toFixed(1)}%`,
          location: { repo: rel },
          evidence: { tool: 'go test', package: pkg, coverage_pct: pct },
          remediation: `Increase unit test coverage for ${pkg}. If coverage is intentionally low because the package is tested via integration suite, mark it by-design in the refinement pass.`,
          compliance: sev === 'HIGH' ? 'Audit-critical' : 'Hygiene',
          scanner: 'go_test_coverage_scan',
        }));
      }
    } else if ((m = ln.match(/^FAIL\s+(\S+)\s+\[(?:build failed|setup failed|.*build.*)\]/i))) {
      findings.push(finding({
        id: nextId(2, 'COV'),
        round: 2,
        severity: 'MEDIUM',
        category: 'TEST',
        title: `Test compilation failed in ${m[1]}`,
        location: { repo: rel },
        evidence: { tool: 'go test', package: m[1], stderr: text.slice(0, 600) },
        remediation: `Fix the build error in ${m[1]} so its tests can run.`,
        scanner: 'go_test_coverage_scan',
      }));
    }
  }
}

if (OUT) fs.writeFileSync(OUT, JSON.stringify(findings, null, 2));
else process.stdout.write(JSON.stringify(findings, null, 2) + '\n');
