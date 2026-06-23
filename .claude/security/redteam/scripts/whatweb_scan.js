#!/usr/bin/env node
/**
 * Run a whatweb scan against a target IP or domain. Designed to be called by an AI agent.
 *
 * Usage:
 *   node whatweb_scan.js <ip-or-domain>
 */

import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const ANSI_ESCAPE = /\x1b\[[0-9;]*m/g;

function scan(target) {
  const cmd = 'whatweb';
  const args = ['-a3', target, '-v'];

  let stdout = '';
  let stderr = '';
  let returncode = 0;

  try {
    stdout = execFileSync(cmd, args, { encoding: 'utf-8', maxBuffer: 50 * 1024 * 1024 });
  } catch (err) {
    returncode = err.status ?? 1;
    stdout = err.stdout ?? '';
    stderr = err.stderr ?? '';
  }

  if (returncode !== 0 && !stdout) {
    return { error: stderr.trim(), target };
  }

  return {
    target,
    raw_output: stdout.trim().replace(ANSI_ESCAPE, ''),
  };
}

// ── CLI ──────────────────────────────────────────────────────────

if (process.argv.length !== 3) {
  process.stderr.write(`Usage: ${process.argv[1]} <ip-or-domain>\n`);
  process.exit(1);
}

const output = scan(process.argv[2]);
console.log(JSON.stringify(output, null, 2));
