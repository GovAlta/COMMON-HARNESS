#!/usr/bin/env node
/**
 * govulncheck_scan.js — wrap govulncheck for Go modules.
 *
 * Finds go.mod, runs `govulncheck -json ./...`, parses the JSON stream and
 * emits HIGH per reachable vulnerability (entry with osv + imports trace).
 *
 * Usage: node govulncheck_scan.js --target <path> [--out <file>]
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

for (const dir of mods) {
  const rel = path.relative(TARGET, dir) || '.';
  // GOTOOLCHAIN=auto tells Go to honour the `toolchain` directive in go.mod and
  // fetch the required compiler version if it isn't installed locally. Without
  // this, govulncheck scans against whichever Go version happens to be on the
  // scan machine, which produces stdlib FPs when the project pins to a newer
  // patch version (e.g. go.mod toolchain=go1.25.10 but scan machine has 1.25.0).
  const r = spawnSync('govulncheck', ['-json', './...'], {
    cwd: dir,
    encoding: 'utf8',
    shell: true,
    timeout: 300_000,
    env: { ...process.env, GOTOOLCHAIN: process.env.GOTOOLCHAIN || 'auto' },
  });
  if (r.error || !r.stdout) continue;

  // govulncheck -json emits a stream of JSON objects (one per line OR concatenated).
  // Split on '}{' boundaries by parsing tokens.
  const blobs = [];
  const text = r.stdout;
  let depth = 0, start = 0;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '{') { if (depth === 0) start = i; depth++; }
    else if (c === '}') {
      depth--;
      if (depth === 0) {
        try { blobs.push(JSON.parse(text.slice(start, i + 1))); } catch {}
      }
    }
  }

  // Each "finding" entry that has both osv and a trace with non-empty function entries is reachable.
  for (const b of blobs) {
    const f = b.finding || b.Finding;
    if (!f || !f.osv) continue;
    const traces = f.trace || f.Trace || [];
    const reachable = Array.isArray(traces) && traces.some(t => t.function || t.Function);
    if (!reachable) continue;
    const pkg = (traces[0] && (traces[0].module || traces[0].Module)) || 'unknown';
    findings.push(finding({
      id: nextId(1, 'DEP'),
      round: 1,
      severity: 'HIGH',
      category: 'DEP',
      title: `Reachable Go vulnerability ${f.osv} in ${pkg}`,
      location: { repo: rel, file: 'go.mod' },
      evidence: {
        tool: 'govulncheck',
        osv: f.osv,
        module: pkg,
        trace_depth: traces.length,
      },
      remediation: `Update ${pkg} per the OSV advisory ${f.osv}. Run \`go get ${pkg}@latest\` in ${rel}, then \`go mod tidy\`.`,
      compliance: 'Audit-critical',
      scanner: 'govulncheck_scan',
    }));
  }
}

if (OUT) fs.writeFileSync(OUT, JSON.stringify(findings, null, 2));
else process.stdout.write(JSON.stringify(findings, null, 2) + '\n');
