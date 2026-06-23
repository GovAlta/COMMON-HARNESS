#!/usr/bin/env node
/**
 * integration_test_enum.js — enumerate Go //go:build integration tests.
 *
 * Walks *.go files, checks the first 5 lines for `//go:build integration`,
 * counts `func Test*(t *testing.T)` per file. Emits INFO summary + per-file
 * INFO with the first doc-comment per test (if present).
 *
 * Usage: node integration_test_enum.js --target <path> [--out <file>]
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

function walkGo(dir, acc = []) {
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return acc; }
  for (const e of entries) {
    if (SKIP_DIRS.has(e.name)) continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) walkGo(full, acc);
    else if (e.isFile() && e.name.endsWith('_test.go')) acc.push(full);
  }
  return acc;
}

const findings = [];
const nextId = makeIdAllocator();
const files = walkGo(TARGET);
const integrationFiles = [];

for (const file of files) {
  let text;
  try { text = fs.readFileSync(file, 'utf8'); } catch { continue; }
  const head = text.split(/\r?\n/).slice(0, 5).join('\n');
  if (!/\/\/go:build\s+[^\n]*\bintegration\b/.test(head)) continue;
  // Capture test functions; also try to grab the preceding doc-comment.
  const tests = [];
  const lines = text.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/^func\s+(Test[A-Z_]\w*)\s*\(t\s*\*testing\.T\)/);
    if (m) {
      let doc = '';
      for (let j = i - 1; j >= Math.max(0, i - 6); j--) {
        const l = lines[j].trim();
        if (/^\/\//.test(l)) doc = l.replace(/^\/\/\s*/, '') + (doc ? ' ' + doc : '');
        else if (l === '') continue;
        else break;
      }
      tests.push({ name: m[1], doc: doc.slice(0, 200) });
    }
  }
  integrationFiles.push({
    file: path.relative(TARGET, file).replace(/\\/g, '/'),
    test_count: tests.length,
    tests,
  });
}

if (integrationFiles.length === 0) {
  if (OUT) fs.writeFileSync(OUT, '[]');
  else process.stdout.write('[]\n');
  process.exit(0);
}

const totalTests = integrationFiles.reduce((n, f) => n + f.test_count, 0);
findings.push(finding({
  id: nextId(2, 'TEST'),
  round: 2,
  severity: 'INFO',
  category: 'TEST',
  title: `Integration test suite enumerated: ${totalTests} tests across ${integrationFiles.length} file(s)`,
  location: { repo: '.' },
  evidence: { tool: 'integration_test_enum', file_count: integrationFiles.length, test_count: totalTests },
  remediation: 'No action needed — positive evidence of an integration test suite.',
  status: 'cleared',
  scanner: 'integration_test_enum',
}));

for (const f of integrationFiles) {
  findings.push(finding({
    id: nextId(2, 'TEST'),
    round: 2,
    severity: 'INFO',
    category: 'TEST',
    title: `Integration tests in ${f.file}: ${f.test_count}`,
    location: { file: f.file },
    evidence: {
      tool: 'integration_test_enum',
      tests: f.tests.map(t => ({ name: t.name, invariant: t.doc })),
    },
    remediation: 'No action needed.',
    status: 'cleared',
    scanner: 'integration_test_enum',
  }));
}

if (OUT) fs.writeFileSync(OUT, JSON.stringify(findings, null, 2));
else process.stdout.write(JSON.stringify(findings, null, 2) + '\n');
