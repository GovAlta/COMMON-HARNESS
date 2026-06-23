#!/usr/bin/env node
/**
 * rule03_tetracolon.js — detect four-part parallel structures used as rhetorical
 * flourish. AI prose loves them; they sound polished and say very little.
 *
 * Patterns:
 *   1. Four consecutive short sentences with a parallel "<np> is <np>." shape.
 *      e.g. "The whitepaper is the asset. The X Prize is the multiplier.
 *            The feature is the launch pad. The Minister's voice is the durable outcome."
 *   2. A single sentence with a 4-item ", X, Y, and Z" list where each item
 *      is itself a noun-phrase introduced by "the".
 *      e.g. "It is the artifact, the document, the basis, and the credential."
 *
 * Usage: node rule03_tetracolon.js --target <path> [--out <file>] [--scope all|prose|code]
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

// Bounded quantifiers keep this from chewing big files.
// Pattern 1: four consecutive "<np> is the/a <np>." sentences (≤60 chars each).
// Use a non-greedy interior with hard length cap.
const FOUR_SENTENCE_RE =
  /(?:[A-Z][^.\n]{2,60}\bis\s+(?:the|a|an)\s+[^.\n]{1,40}\.\s+){3}[A-Z][^.\n]{2,60}\bis\s+(?:the|a|an)\s+[^.\n]{1,40}\./g;

// Pattern 2: "<verb-phrase> the X, the Y, the Z, (and )?the W" — 4 "the"-led items.
const FOUR_ITEM_LIST_RE =
  /\b(?:is|are|was|were|becomes?|remains?)\s+the\s+\w[\w\s-]{0,30},\s+the\s+\w[\w\s-]{0,30},\s+the\s+\w[\w\s-]{0,30},\s+(?:and\s+)?the\s+\w[\w\s-]{0,30}/gi;

// Pattern 3: shorter ", A, B, C, and D" four-noun list (each item 1-3 words).
const FOUR_NOUN_LIST_RE =
  /(?:^|[,:])\s+\w[\w-]{1,20}(?:\s+\w[\w-]{1,20})?,\s+\w[\w-]{1,20}(?:\s+\w[\w-]{1,20})?,\s+\w[\w-]{1,20}(?:\s+\w[\w-]{1,20})?,\s+and\s+\w[\w-]{1,20}(?:\s+\w[\w-]{1,20})?\b/g;

const PATTERNS = [
  { name: 'four parallel "X is the Y." sentences', re: FOUR_SENTENCE_RE,
    why: 'A four-part parallel structure (tetracolon) is rhythm-led rhetoric. Each clause sounds polished and contributes little new content.' },
  { name: 'four-item "the X, the Y, the Z, and the W" list', re: FOUR_ITEM_LIST_RE,
    why: 'Parallel "the X, the Y" four-item lists are a classic AI flourish. Write the same claim as plain prose; cut to two items if only two genuinely apply.' },
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
        const localLine = seg.text.slice(0, m.index).split('\n').length;
        const absLine = seg.startLine + localLine - 1;
        const lineText = (lines[localLine - 1] || '').trim();
        findings.push(finding({
          id: nextId(3),
          rule: 3,
          title: `Rule 3: tetracolon (${p.name}) in ${rel}`,
          location: { file: rel, line: absLine },
          match: m[0].slice(0, 200),
          quote: lineText.slice(0, 240),
          rewrite: 'Rewrite as ordinary prose. Use a list only when the items are genuinely comparable, not a rhetorical flourish. If only two items genuinely apply, use two.',
          why: p.why,
          scanner: 'rule03_tetracolon',
        }));
      }
    }
  }
}

if (OUT) fs.writeFileSync(OUT, JSON.stringify(findings, null, 2));
else process.stdout.write(JSON.stringify(findings, null, 2) + '\n');
