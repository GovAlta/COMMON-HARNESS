#!/usr/bin/env node
/**
 * golangci_audit.js — verify Go projects have a golangci-lint config.
 *
 * Matches R1E-C-04 from the Lungfish ground truth: backend-go has no
 * `.golangci.yml` / `.golangci.yaml` / `.golangci.toml`, so when the
 * Makefile calls `golangci-lint run` it picks only the default linter set
 * (~8 linters). Security-focused linters (gosec, gocritic, nilerr,
 * prealloc) are silent.
 *
 * Emit MEDIUM per Go module without a config.
 *
 * Usage: node golangci_audit.js --target <path> [--out <file>]
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

const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'build', 'coverage', '.next', '.nuxt', 'vendor']);
const CONFIG_NAMES = ['.golangci.yml', '.golangci.yaml', '.golangci.toml', '.golangci.json'];

function findGoModules(root, depth = 0, acc = []) {
  if (depth > 5) return acc;
  let entries;
  try { entries = fs.readdirSync(root, { withFileTypes: true }); } catch { return acc; }
  if (entries.some(e => e.isFile() && e.name === 'go.mod')) acc.push(root);
  for (const e of entries) {
    if (e.isDirectory() && !SKIP_DIRS.has(e.name) && !e.name.startsWith('.')) {
      findGoModules(path.join(root, e.name), depth + 1, acc);
    }
  }
  return acc;
}

const findings = [];
const nextId = makeIdAllocator();

for (const mod of findGoModules(TARGET)) {
  const rel = path.relative(TARGET, mod) || '.';
  // Look in module dir and the next dir up (some teams put config at repo root)
  const candidates = [];
  for (const name of CONFIG_NAMES) {
    candidates.push(path.join(mod, name));
    candidates.push(path.join(path.dirname(mod), name));
  }
  const present = candidates.find(p => fs.existsSync(p));
  if (present) continue;

  // Look for "golangci-lint" invocation in Makefile to confirm the tool is used
  let invokes = false;
  for (const m of ['Makefile', 'makefile', 'GNUmakefile']) {
    const mp = path.join(mod, m);
    try {
      const t = fs.readFileSync(mp, 'utf8');
      if (/golangci-lint\b/.test(t)) { invokes = true; break; }
    } catch {}
  }

  findings.push(finding({
    id: nextId(1, 'LINT'),
    round: 1,
    severity: 'MEDIUM',
    category: 'LINT',
    title: `Go module in ${rel} has no golangci-lint config${invokes ? ' (Makefile invokes the tool — defaults only)' : ''}`,
    location: { file: path.join(rel, 'go.mod') },
    evidence: {
      tool: 'golangci_audit',
      module: rel,
      invokes_in_makefile: invokes,
      searched_for: CONFIG_NAMES,
      note: invokes
        ? 'The Makefile runs golangci-lint but with no config — only the default linter set fires. Security-focused linters (gosec, gocritic, nilerr) are silent.'
        : 'No golangci-lint config detected. Adding one establishes a reproducible lint floor and enables security-focused linters.',
    },
    remediation: `Create a \`.golangci.yml\` in ${rel} that enables gosec, gocritic, nilerr, prealloc, and the rest of the security-focused linter set. Document the chosen lint floor in the README.`,
    compliance: 'Process gap',
    scanner: 'golangci_audit',
  }));
}

if (OUT) fs.writeFileSync(OUT, JSON.stringify(findings, null, 2));
else process.stdout.write(JSON.stringify(findings, null, 2) + '\n');
