#!/usr/bin/env node
/**
 * rule01_not_x_but_y.js — detect "this is not X, it is Y" / "not just X, but Y"
 * constructions. The most reliable single signal of AI prose.
 *
 * Patterns:
 *   - "is not X, but/it is Y"
 *   - "Not just X, but Y." / "Not only X, but Y."
 *   - "X is not a nice to have, it is a requirement."
 *   - "This is not X. It is Y." (multi-sentence)
 *   - "It is not A, it is B."
 *
 * Usage: node rule01_not_x_but_y.js --target <path> [--out <file>]
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

const PATTERNS = [
  { name: 'is not X, but Y',
    re: /\b(?:is|are|was|were|isn['’]t|aren['’]t|wasn['’]t|weren['’]t)\s+not\s+(?:just\s+|only\s+|merely\s+)?[^.,;\n]{2,80},\s+(?:but|it\s+is|they\s+are)\b/gi },
  { name: 'Not just X, but Y',
    re: /\b[Nn]ot\s+(?:just|only|merely)\s+[^.,;\n]{2,80},\s+but\b/g },
  { name: 'This is not X. It is Y.',
    re: /\bThis\s+is\s+not\s+[^.]{2,120}\.\s+(?:It\s+is|This\s+is)\b/g },
  { name: 'It is not A, it is B',
    re: /\bIt\s+is\s+not\s+[^.,;\n]{2,80},\s+it\s+is\b/gi },
  { name: 'X is not a nice to have, it is Y',
    re: /\bis\s+not\s+(?:a\s+)?nice\s+to\s+have,\s+it\s+is\b/gi },
  { name: 'This is more than X. It is Y.',
    re: /\bThis\s+is\s+more\s+than\s+[^.]{2,80}\.\s+It\s+is\b/g },
];

function rewrite(match) {
  return 'State what the thing IS. Drop the negated half entirely (e.g., "X is required by operational reality." instead of "X is not a press exercise. It is required.").';
}

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
          id: nextId(1),
          rule: 1,
          title: `Rule 1: "${p.name}" pattern in ${rel}`,
          location: { file: rel, line: absLine },
          match: m[0],
          quote: lineText.slice(0, 240),
          rewrite: rewrite(m[0]),
          why: 'The "Not X, but Y" pattern is the single most reliable AI-prose tell. It almost never carries unique meaning — the negated half is rhetorical scaffolding.',
          scanner: 'rule01_not_x_but_y',
        }));
      }
    }
  }
}

if (OUT) fs.writeFileSync(OUT, JSON.stringify(findings, null, 2));
else process.stdout.write(JSON.stringify(findings, null, 2) + '\n');
