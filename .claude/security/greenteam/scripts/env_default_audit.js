#!/usr/bin/env node
/**
 * env_default_audit.js — flag risky defaults in committed .env files.
 *
 * Patterns:
 *   - VITE_ENABLE_DEVTOOLS=true   → HIGH
 *   - *_DEBUG=true / *_DEV=true / DEBUG=true → MEDIUM
 *   - LOG_LEVEL=debug|verbose → LOW
 *   - placeholder values in committed .env (not .env.example) → LOW
 *
 * Usage: node env_default_audit.js --target <path> [--out <file>]
 */

import fs from 'node:fs';
import path from 'node:path';
import { finding, makeIdAllocator } from '../pipeline/output_schemas.js';
import { makeChecker } from '../pipeline/gitignore.js';

const argv = process.argv.slice(2);
let TARGET = process.cwd();
let OUT = null;
for (let i = 0; i < argv.length; i++) {
  if (argv[i] === '--target') TARGET = path.resolve(argv[++i]);
  else if (argv[i] === '--out') OUT = path.resolve(argv[++i]);
}

const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'build', 'coverage', '.next', '.nuxt']);

function walk(dir, acc = []) {
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return acc; }
  for (const e of entries) {
    if (SKIP_DIRS.has(e.name)) continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) walk(full, acc);
    else if (e.isFile() && /^\.env(\.|$)/.test(e.name)) acc.push(full);
  }
  return acc;
}

const PLACEHOLDER = /(your[-_].*here|changeme|todo|placeholder|<.*>|example\.com)/i;

const findings = [];
const nextId = makeIdAllocator();
const files = walk(TARGET);
const isIgnored = makeChecker(TARGET);

for (const file of files) {
  const rel = path.relative(TARGET, file).replace(/\\/g, '/');
  const base = path.basename(file);
  const isExample = /\.env\.example$|\.env\.sample$|\.env\.template$/i.test(base);
  // Skip .env files that are gitignored — those are local-dev convention,
  // not committed exposures. Always SCAN .env.example / .env.sample / template
  // (they're meant to be committed, so risky defaults there are real).
  if (!isExample && isIgnored(file)) continue;
  let text;
  try { text = fs.readFileSync(file, 'utf8'); } catch { continue; }
  const lines = text.split(/\r?\n/);

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq < 0) continue;
    const key = line.slice(0, eq).trim();
    let val = line.slice(eq + 1).trim();
    val = val.replace(/^['"]|['"]$/g, '');
    const lineNum = i + 1;

    let sev = null, title = null;
    if (key === 'VITE_ENABLE_DEVTOOLS' && /^true$/i.test(val)) {
      sev = 'HIGH';
      title = `Devtools enabled by default in ${rel}`;
    } else if (/(^|_)DEBUG$/.test(key) && /^true$/i.test(val)) {
      sev = 'MEDIUM';
      title = `Debug mode enabled by default (${key}=true) in ${rel}`;
    } else if (/(^|_)DEV$/.test(key) && /^true$/i.test(val)) {
      sev = 'MEDIUM';
      title = `Dev mode enabled by default (${key}=true) in ${rel}`;
    } else if (key === 'LOG_LEVEL' && /^(debug|verbose|trace)$/i.test(val)) {
      sev = 'LOW';
      title = `Verbose log level (LOG_LEVEL=${val}) in ${rel}`;
    } else if (!isExample && PLACEHOLDER.test(val)) {
      sev = 'LOW';
      title = `Placeholder value (${key}) committed in ${rel}`;
    }

    if (sev) {
      findings.push(finding({
        id: nextId(1, 'CONF'),
        round: 1,
        severity: sev,
        category: 'CONF',
        title,
        location: { file: rel, line: lineNum },
        evidence: { tool: 'env_default_audit', key, value: val.slice(0, 64), is_example: isExample },
        remediation: isExample
          ? `Document the intended production value for ${key} in README rather than shipping ${val} as the example.`
          : `Override ${key} in production (set it via the deployment env, not the committed .env). Switch the committed default to a safe value.`,
        compliance: sev === 'HIGH' ? 'Top-priority' : 'Hygiene',
        scanner: 'env_default_audit',
      }));
    }
  }
}

if (OUT) fs.writeFileSync(OUT, JSON.stringify(findings, null, 2));
else process.stdout.write(JSON.stringify(findings, null, 2) + '\n');
