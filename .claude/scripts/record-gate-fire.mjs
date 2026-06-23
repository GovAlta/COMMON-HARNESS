#!/usr/bin/env node
/**
 * record-gate-fire.mjs — append a JSON line to `.claude/state/gate-state.jsonl`
 * each time a gate runs. Provides an audit trail of which checks fired during
 * a session, and lets check-step-gates.mjs detect "should have run but didn't"
 * patterns for soft-enforcement gates.
 *
 * Usage:
 *   node .claude/scripts/record-gate-fire.mjs <step> <gate-name> <pass|fail>
 *
 * Append-only. The file is gitignored.
 */
import fs from 'node:fs';
import path from 'node:path';

const [, , step, gate, result] = process.argv;
if (!step || !gate || !result) {
  console.error('usage: record-gate-fire.mjs <step> <gate> <pass|fail>');
  process.exit(2);
}

import { fileURLToPath } from 'node:url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const STATE_DIR = path.resolve(__dirname, '..', 'state');
fs.mkdirSync(STATE_DIR, { recursive: true });
const STATE_FILE = path.join(STATE_DIR, 'gate-state.jsonl');

const entry = {
  ts: new Date().toISOString(),
  step,
  gate,
  result,
  cwd: process.cwd(),
};

fs.appendFileSync(STATE_FILE, JSON.stringify(entry) + '\n');
