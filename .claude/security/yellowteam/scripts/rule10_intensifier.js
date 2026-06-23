#!/usr/bin/env node
/**
 * rule10_intensifier.js — detect vague intensifiers.
 *
 * Banned (whole-word, case-insensitive in prose):
 *   very, really, truly, deeply, profoundly, incredibly, extremely,
 *   particularly, notably, importantly.
 *
 * Skip:
 *   - Code identifiers (e.g. veryLargeMap, IMPORTANT_CONSTANT) — handled by
 *     prose-segment extraction, but we add a defence-in-depth check.
 *
 * Usage: node rule10_intensifier.js --target <path> [--out <file>] [--scope all|prose|code]
 */

import fs from 'node:fs';
import path from 'node:path';
import { finding, makeIdAllocator } from '../pipeline/output_schemas.js';
import { walk, extractProseSegments } from '../pipeline/walker.js';

const argv = process.argv.slice(2);
let TARGET = process.cwd();
let OUT = null;
let SCOPE = 'all';
for (let i = 0; i < argv.length; i++) {
  if (argv[i] === '--target') TARGET = path.resolve(argv[++i]);
  else if (argv[i] === '--out') OUT = path.resolve(argv[++i]);
  else if (argv[i] === '--scope') SCOPE = argv[++i];
}

const INTENSIFIERS = [
  'very', 'really', 'truly', 'deeply', 'profoundly', 'incredibly',
  'extremely', 'particularly', 'notably', 'importantly',
];

// Whole-word: bracket the word with hard non-letter boundaries on both sides
// so "veryLargeMap" doesn't fire (the L is a letter).
function makeRe(word) {
  return new RegExp(`(^|[^A-Za-z_])(${word})(?=[^A-Za-z_]|$)`, 'gi');
}

const PATTERNS = INTENSIFIERS.map(w => ({ word: w, re: makeRe(w) }));

const files = walk(TARGET, { scope: SCOPE });
const findings = [];
const nextId = makeIdAllocator();

for (const file of files) {
  let text;
  try { text = fs.readFileSync(file, 'utf8'); } catch { continue; }
  const rel = path.relative(TARGET, file).replace(/\\/g, '/');
  const segments = extractProseSegments(file, text);

  for (const seg of segments) {
    const lines = seg.text.split('\n');
    for (const p of PATTERNS) {
      const re = new RegExp(p.re.source, p.re.flags);
      let m;
      while ((m = re.exec(seg.text)) !== null) {
        // m[2] is the captured intensifier
        const idx = m.index + m[1].length;
        const localLine = seg.text.slice(0, idx).split('\n').length;
        const absLine = seg.startLine + localLine - 1;
        const lineText = (lines[localLine - 1] || '').trim();
        findings.push(finding({
          id: nextId(10),
          rule: 10,
          title: `Rule 10: vague intensifier "${m[2]}" in ${rel}`,
          location: { file: rel, line: absLine },
          match: m[2],
          quote: lineText.slice(0, 240),
          rewrite: `Strike "${m[2]}". If the claim needs an intensifier to land, the claim is weak — strengthen it with a specific fact, number, or example.`,
          why: 'Vague intensifiers ("very", "deeply", "truly") add no information. They signal that the writer hopes a softer claim will read as a stronger one.',
          scanner: 'rule10_intensifier',
        }));
      }
    }
  }
}

if (OUT) fs.writeFileSync(OUT, JSON.stringify(findings, null, 2));
else process.stdout.write(JSON.stringify(findings, null, 2) + '\n');
