#!/usr/bin/env node
/**
 * migration_sequence_scan.js — detect gaps in numbered migration sequences.
 *
 * Matches F-04 in the Lungfish ground truth: migrations dir contains
 * 002, 008, 009, 010, 011, 012, 013, 014, 015 — files 001 and 003-007
 * are missing as numbered files (probably subsumed by an unnumbered
 * migration.sql but never documented).
 *
 * Usage:
 *   node migration_sequence_scan.js --target <path> [--out <file>]
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

function findMigrationDirs(root, depth = 0, acc = []) {
  if (depth > 6) return acc;
  let entries;
  try { entries = fs.readdirSync(root, { withFileTypes: true }); } catch { return acc; }
  for (const e of entries) {
    if (e.isDirectory()) {
      if (e.name === 'node_modules' || e.name === '.git' || e.name.startsWith('.')) continue;
      if (/^migrations?$/i.test(e.name)) acc.push(path.join(root, e.name));
      findMigrationDirs(path.join(root, e.name), depth + 1, acc);
    }
  }
  return acc;
}

const findings = [];
const nextId = makeIdAllocator();

for (const mig of findMigrationDirs(TARGET)) {
  let files;
  try { files = fs.readdirSync(mig); } catch { continue; }
  const numbered = files
    .map(f => {
      const m = f.match(/^(\d{3,})[_.-]/);
      return m ? { name: f, n: parseInt(m[1], 10) } : null;
    })
    .filter(Boolean);
  const unnumbered = files.filter(f => /\.sql$/.test(f) && !/^\d/.test(f));

  if (numbered.length === 0) continue;
  numbered.sort((a, b) => a.n - b.n);

  const present = new Set(numbered.map(x => x.n));
  const max = Math.max(...present);
  const min = Math.min(...present);
  const gaps = [];
  for (let i = min; i <= max; i++) if (!present.has(i)) gaps.push(i);

  const rel = path.relative(TARGET, mig).replace(/\\/g, '/');

  if (gaps.length > 0) {
    findings.push(finding({
      id: nextId(1, 'MIG'),
      round: 1,
      severity: 'MEDIUM',
      category: 'MIG',
      title: `Database migration sequence has gaps in ${rel}`,
      location: { file: rel },
      evidence: {
        tool: 'migration_sequence_scan',
        present: numbered.map(x => x.name),
        missing: gaps.map(n => String(n).padStart(3, '0')),
        unnumbered_files: unnumbered,
      },
      remediation: unnumbered.length > 0
        ? `Document in the README what ${unnumbered.join(', ')} contains and whether it subsumes the missing migrations ${gaps.map(n => String(n).padStart(3, '0')).join(', ')}. State the canonical run order.`
        : `Recover the missing migration files ${gaps.map(n => String(n).padStart(3, '0')).join(', ')} or rebuild a consolidated baseline migration and document the order.`,
      compliance: 'Process gap',
      scanner: 'migration_sequence_scan',
    }));
  }
}

if (OUT) fs.writeFileSync(OUT, JSON.stringify(findings, null, 2));
else process.stdout.write(JSON.stringify(findings, null, 2) + '\n');
