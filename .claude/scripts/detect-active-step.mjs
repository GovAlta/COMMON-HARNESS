#!/usr/bin/env node
/**
 * detect-active-step.mjs — figure out which lifecycle phase is currently in
 * flight in this project (most recently modified output dir under
 * ./phases/phase?-*\/output/ that contains files).
 *
 * Used by the Stop hook in harness-hooks.json so that
 * `check-step-gates.mjs <active-phase>` can run automatically.
 *
 * Prints the phase name (e.g. "phase5-development") on stdout.
 * Exits 0 if a phase found, 1 if none.
 */
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.argv[2] ? path.resolve(process.argv[2]) : process.cwd();
const PHASES_DIR = path.join(ROOT, 'phases');

if (!fs.existsSync(PHASES_DIR)) process.exit(1);

const candidates = fs.readdirSync(PHASES_DIR, { withFileTypes: true })
  .filter(e => e.isDirectory() && /^phase\d+-/.test(e.name))
  .map(e => {
    const outDir = path.join(PHASES_DIR, e.name, 'output');
    if (!fs.existsSync(outDir)) return null;
    const mds = fs.readdirSync(outDir).filter(f => f.endsWith('.md'));
    if (mds.length === 0) return null;
    const newest = mds.map(f => fs.statSync(path.join(outDir, f)).mtimeMs).reduce((a, b) => Math.max(a, b), 0);
    return { name: e.name, mtime: newest };
  })
  .filter(Boolean);

if (candidates.length === 0) process.exit(1);

candidates.sort((a, b) => b.mtime - a.mtime);
process.stdout.write(candidates[0].name);
process.exit(0);
