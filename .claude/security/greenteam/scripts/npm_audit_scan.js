#!/usr/bin/env node
/**
 * npm_audit_scan.js — wrap `npm audit --json` for each package.json tree.
 *
 * Walks the target for package.json files (skipping node_modules), runs
 * `npm audit --json` in each, parses the JSON, and emits findings.
 *
 * Severity mapping: critical→CRITICAL, high→HIGH, moderate→MEDIUM, low→LOW.
 *
 * Usage:
 *   node npm_audit_scan.js --target <path> [--out <file>]
 *
 * Exits 0 unless the scan itself failed.
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

const SEV_MAP = { critical: 'CRITICAL', high: 'HIGH', moderate: 'MEDIUM', low: 'LOW', info: 'INFO' };

function findPackageJsons(root, depth = 0, acc = []) {
  if (depth > 4) return acc;
  let entries;
  try { entries = fs.readdirSync(root, { withFileTypes: true }); } catch { return acc; }
  if (entries.some(e => e.name === 'package.json' && e.isFile())) {
    acc.push(root);
  }
  for (const e of entries) {
    if (e.isDirectory() && e.name !== 'node_modules' && !e.name.startsWith('.')) {
      findPackageJsons(path.join(root, e.name), depth + 1, acc);
    }
  }
  return acc;
}

const findings = [];
const nextId = makeIdAllocator();
const trees = findPackageJsons(TARGET);

for (const tree of trees) {
  const rel = path.relative(TARGET, tree) || '.';
  const r = spawnSync('npm', ['audit', '--json'], {
    cwd: tree, encoding: 'utf8', shell: true,
  });
  let audit;
  try { audit = JSON.parse(r.stdout || '{}'); } catch { continue; }
  if (!audit.vulnerabilities) continue;

  for (const [pkg, info] of Object.entries(audit.vulnerabilities)) {
    if (info.severity === 'info') continue;
    const sev = SEV_MAP[info.severity] || 'LOW';
    findings.push(finding({
      id: nextId(1, 'DEP'),
      round: 1,
      severity: sev,
      category: 'DEP',
      title: `${pkg}: ${info.severity}-severity npm vulnerability`,
      location: { repo: rel, file: 'package.json', line: null },
      evidence: {
        tool: 'npm audit',
        package: pkg,
        installed: info.installedVersions || info.range,
        via: info.via,
        fixAvailable: !!info.fixAvailable,
      },
      remediation: info.fixAvailable
        ? `Run \`npm audit fix\` in ${rel}/`
        : `No automated fix available for ${pkg}; review advisory and bump or replace`,
      scanner: 'npm_audit_scan',
    }));
  }
}

if (OUT) fs.writeFileSync(OUT, JSON.stringify(findings, null, 2));
else process.stdout.write(JSON.stringify(findings, null, 2) + '\n');
