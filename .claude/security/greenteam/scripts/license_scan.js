#!/usr/bin/env node
/**
 * license_scan.js — detect GPL/AGPL/LGPL packages in npm dependency trees.
 *
 * Tries license-checker first; falls back to reading node_modules/<pkg>/package.json.
 * Emits HIGH per copyleft package; emits INFO positive evidence if scan was clean.
 *
 * Usage: node license_scan.js --target <path> [--out <file>]
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
const COPYLEFT = /\b(AGPL|GPL|LGPL)\b/i;

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
const trees = findPackageRoots(TARGET);
let ranCleanly = false;
let totalCopyleft = 0;

for (const tree of trees) {
  const rel = path.relative(TARGET, tree) || '.';
  let parsedJson = null;
  const r = spawnSync('npx', ['--yes', 'license-checker', '--json', '--production'], {
    cwd: tree, encoding: 'utf8', shell: true, timeout: 120_000,
  });
  if (r.status === 0 && r.stdout) {
    try { parsedJson = JSON.parse(r.stdout); } catch {}
  }

  let matches = [];
  if (parsedJson) {
    ranCleanly = true;
    for (const [pkg, info] of Object.entries(parsedJson)) {
      const lic = String(info.licenses || '');
      if (COPYLEFT.test(lic)) matches.push({ pkg, license: lic });
    }
  } else {
    // Fallback: scan node_modules/*/package.json directly
    const nm = path.join(tree, 'node_modules');
    if (fs.existsSync(nm)) {
      ranCleanly = true;
      let entries;
      try { entries = fs.readdirSync(nm, { withFileTypes: true }); } catch { entries = []; }
      for (const e of entries) {
        if (!e.isDirectory()) continue;
        const inner = e.name.startsWith('@') ? path.join(nm, e.name) : null;
        const dirs = inner ? (fs.existsSync(inner) ? fs.readdirSync(inner).map(d => path.join(e.name, d)) : []) : [e.name];
        for (const d of dirs) {
          const pjp = path.join(nm, d, 'package.json');
          if (!fs.existsSync(pjp)) continue;
          try {
            const pj = JSON.parse(fs.readFileSync(pjp, 'utf8'));
            const lic = String(pj.license || pj.licenses || '');
            if (COPYLEFT.test(lic)) matches.push({ pkg: `${pj.name}@${pj.version}`, license: lic });
          } catch {}
        }
      }
    }
  }

  for (const m of matches) {
    totalCopyleft++;
    findings.push(finding({
      id: nextId(1, 'LIC'),
      round: 1,
      severity: 'HIGH',
      category: 'LIC',
      title: `Copyleft licence in ${m.pkg} (${m.license})`,
      location: { repo: rel, file: 'package.json' },
      evidence: { tool: 'license_scan', package: m.pkg, license: m.license },
      remediation: `Review whether the ${m.license} obligations are compatible with the project's distribution model. Either replace ${m.pkg} or document the licence exposure in NOTICE/LICENSE files.`,
      compliance: 'Audit-critical',
      scanner: 'license_scan',
    }));
  }
}

// Positive-evidence finding only when we ran cleanly and found nothing
if (ranCleanly && totalCopyleft === 0) {
  findings.push(finding({
    id: nextId(1, 'LIC'),
    round: 1,
    severity: 'INFO',
    category: 'LIC',
    title: 'No GPL/AGPL/LGPL packages detected in production dependencies',
    location: { repo: '.' },
    evidence: { tool: 'license_scan', trees_scanned: trees.length },
    remediation: 'No action needed.',
    status: 'cleared',
    scanner: 'license_scan',
  }));
}

if (OUT) fs.writeFileSync(OUT, JSON.stringify(findings, null, 2));
else process.stdout.write(JSON.stringify(findings, null, 2) + '\n');
