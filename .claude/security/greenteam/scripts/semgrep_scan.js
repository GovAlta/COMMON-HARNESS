#!/usr/bin/env node
/**
 * semgrep_scan.js — optional SAST scanner via semgrep.
 *
 * Runs `semgrep --config p/security-audit --config p/javascript
 *                --config p/typescript --config p/golang --json --quiet`
 * against the target. Emits one finding per result, grouped by check_id at
 * refinement time.
 *
 * Skips silently when:
 *   - semgrep is not installed
 *   - running on Windows without WSL (semgrep is not officially supported)
 *
 * Usage: node semgrep_scan.js --target <path> [--out <file>]
 */

import fs from 'node:fs';
import os from 'node:os';
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

function fail(reason) {
  process.stderr.write(`semgrep_scan: skipped — ${reason}\n`);
  if (OUT) fs.writeFileSync(OUT, '[]');
  else process.stdout.write('[]\n');
  process.exit(0);
}

// Probe semgrep availability
const probe = spawnSync('semgrep', ['--version'], { encoding: 'utf8', shell: true });
if (probe.status !== 0) {
  fail(os.platform() === 'win32'
    ? 'semgrep is not natively supported on Windows; install via WSL'
    : 'semgrep not installed (pip install semgrep)');
}

// Sev mapping
const SEV_MAP = { ERROR: 'HIGH', WARNING: 'MEDIUM', INFO: 'LOW' };

const r = spawnSync('semgrep', [
  '--config', 'p/security-audit',
  '--config', 'p/javascript',
  '--config', 'p/typescript',
  '--config', 'p/golang',
  '--json', '--quiet',
  '--metrics=off',
  '--timeout', '60',
  TARGET,
], { encoding: 'utf8', shell: true, timeout: 900_000, maxBuffer: 128 * 1024 * 1024 });

if (!r.stdout) fail('semgrep produced no output');
let report;
try { report = JSON.parse(r.stdout); } catch (e) { fail('semgrep output not parseable: ' + e.message); }

const results = report.results || [];
const findings = [];
const nextId = makeIdAllocator();

// Category mapping by rule prefix
function categoryFor(check) {
  if (/sql|injection.*query/i.test(check)) return 'SQL';
  if (/xss|innerHTML|sanitize|dompurify|unsafe|unsanitized/i.test(check)) return 'XSS';
  if (/cookie|csrf|cors|jwt|auth/i.test(check)) return 'CONF';
  if (/random|crypto|timing/i.test(check)) return 'CONF';
  if (/secret|password|key|credential/i.test(check)) return 'SECRET';
  return 'LINT';
}

for (const res of results) {
  const sev = SEV_MAP[res.extra?.severity || 'WARNING'] || 'MEDIUM';
  const cat = categoryFor(res.check_id);
  const fileRel = path.relative(TARGET, res.path || '').replace(/\\/g, '/');
  findings.push(finding({
    id: nextId(1, cat),
    round: 1,
    severity: sev,
    category: cat,
    title: `semgrep ${res.check_id} in ${fileRel}`,
    location: { file: fileRel, line: res.start?.line || null },
    evidence: {
      tool: 'semgrep',
      check_id: res.check_id,
      message: (res.extra?.message || '').slice(0, 400),
      lines: (res.extra?.lines || '').slice(0, 400),
      metadata: res.extra?.metadata || {},
    },
    remediation: (res.extra?.metadata?.fix || res.extra?.fix || `Investigate ${res.check_id} at ${fileRel}:${res.start?.line || '?'}.`),
    scanner: 'semgrep_scan',
  }));
}

if (OUT) fs.writeFileSync(OUT, JSON.stringify(findings, null, 2));
else process.stdout.write(JSON.stringify(findings, null, 2) + '\n');
