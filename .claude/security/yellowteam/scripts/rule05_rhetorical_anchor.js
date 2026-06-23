#!/usr/bin/env node
/**
 * rule05_rhetorical_anchor.js — detect "this is the moment / where / how"
 * anchors. Rhetorical scaffolding that almost never carries unique meaning.
 *
 * Patterns:
 *   - "This/That is the moment …"
 *   - "This/That is where …"
 *   - "This is the cadence/technical authority/<adj> piece"
 *   - "This is how/why/what we/you …"
 *
 * Usage: node rule05_rhetorical_anchor.js --target <path> [--out <file>] [--scope all|prose|code]
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
  { name: 'This/That is the moment / where / piece',
    re: /\b(?:This|That)\s+is\s+(?:the\s+moment|where|the\s+cadence|the\s+technical\s+authority|the\s+\w+\s+piece)\b/g },
  { name: 'This is how/why/what we/you',
    re: /\bThis\s+is\s+(?:how|why|what)\s+(?:we|you)\b/g },
  { name: 'This is the X piece (generic)',
    re: /\bThis\s+is\s+the\s+\w+\s+piece\b/g },
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
          id: nextId(5),
          rule: 5,
          title: `Rule 5: rhetorical anchor (${p.name}) in ${rel}`,
          location: { file: rel, line: absLine },
          match: m[0],
          quote: lineText.slice(0, 240),
          rewrite: 'Describe what the step delivers, not what it "is". E.g., "Step four delivers the project\'s first global feature placement." instead of "This is the moment the product becomes globally visible."',
          why: '"This is the moment / where / piece" anchors are rhetorical scaffolding. They announce significance instead of describing it.',
          scanner: 'rule05_rhetorical_anchor',
        }));
      }
    }
  }
}

if (OUT) fs.writeFileSync(OUT, JSON.stringify(findings, null, 2));
else process.stdout.write(JSON.stringify(findings, null, 2) + '\n');
