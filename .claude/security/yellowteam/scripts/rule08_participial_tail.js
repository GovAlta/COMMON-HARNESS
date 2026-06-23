#!/usr/bin/env node
/**
 * rule08_participial_tail.js — detect sentences that close with a comma plus
 * a participle phrase summarising what the sentence already said.
 *
 * Forbidden: "The team has built the only operational answer in the industry,
 *             demonstrating its leadership."
 *
 * Patterns:
 *   1. Line-end comma + -ing phrase + period.
 *   2. Comma + -ing phrase followed by sentence end punctuation anywhere.
 *
 * Usage: node rule08_participial_tail.js --target <path> [--out <file>] [--scope all|prose|code]
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

// Pattern A: end-of-line ", <verb>ing <up-to-5-words>."
const TAIL_EOL_RE = /,\s+\w+ing\s+(?:[a-z][\w'-]*\s+){0,5}[a-z][\w'-]*\.\s*$/gm;

// Pattern B: ", <verb>ing <up-to-7-words> <sentence-end>." anywhere
const TAIL_INLINE_RE = /,\s+(?:by\s+)?\w+ing\s+(?:[a-z][\w'-]*(?:\s+|$)){1,7}\./g;

// Whitelist common prepositions that mean the -ing is not a restatement participle.
// e.g. "by using X", "in working through", "for handling".
// We bias toward false negatives here.
const PREPOSITION_HEDGE = /,\s+(?:by|in|while|after|before|when|for)\s+\w+ing\b/;

const PATTERNS = [
  { name: 'sentence-end participle phrase', re: TAIL_EOL_RE },
  { name: 'inline participle tail', re: TAIL_INLINE_RE },
];

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
        // Skip clearly prepositional -ing constructions ("by leveraging", "in handling").
        if (PREPOSITION_HEDGE.test(m[0])) continue;
        const localLine = seg.text.slice(0, m.index).split('\n').length;
        const absLine = seg.startLine + localLine - 1;
        const lineText = (lines[localLine - 1] || '').trim();
        findings.push(finding({
          id: nextId(8),
          rule: 8,
          title: `Rule 8: ${p.name} in ${rel}`,
          location: { file: rel, line: absLine },
          match: m[0].trim().slice(0, 200),
          quote: lineText.slice(0, 240),
          rewrite: 'End the sentence at the period. If the trailing -ing clause adds real information, promote it to its own sentence. If it restates, delete it.',
          why: 'A sentence-end "comma + -ing phrase" usually restates what the sentence already said. It is a rhetorical bow on a finished thought.',
          scanner: 'rule08_participial_tail',
        }));
      }
    }
  }
}

if (OUT) fs.writeFileSync(OUT, JSON.stringify(findings, null, 2));
else process.stdout.write(JSON.stringify(findings, null, 2) + '\n');
