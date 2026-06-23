#!/usr/bin/env node
/**
 * rule07_rule_of_three.js — detect three-item "X, Y, and Z" lists used as
 * rhetorical flourish.
 *
 * This pattern over-fires by design — many legitimate lists trigger it.
 * The judgement layer (the skill agent) filters. Default severity is LOW.
 *
 * Heuristic boost to MEDIUM when:
 *   - all three items are single words, AND
 *   - all three items have lengths within 2 characters of each other.
 *
 * Usage: node rule07_rule_of_three.js --target <path> [--out <file>] [--scope all|prose|code]
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

// Capture the three items so we can score parallelism.
// Bounded item length keeps this safe on big files.
const RULE_OF_THREE_RE = /\b([A-Za-z][A-Za-z'-]{1,20}),\s+([A-Za-z][A-Za-z'-]{1,20}),?\s+and\s+([A-Za-z][A-Za-z'-]{1,20})\b/g;

function isParallelTriad(a, b, c) {
  const lens = [a.length, b.length, c.length];
  const minL = Math.min(...lens);
  const maxL = Math.max(...lens);
  return (maxL - minL) <= 2;
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
    const re = new RegExp(RULE_OF_THREE_RE.source, RULE_OF_THREE_RE.flags);
    let m;
    while ((m = re.exec(seg.text)) !== null) {
      const [whole, a, b, c] = m;
      const localLine = seg.text.slice(0, m.index).split('\n').length;
      const absLine = seg.startLine + localLine - 1;
      const lineText = (lines[localLine - 1] || '').trim();
      const parallel = isParallelTriad(a, b, c);

      findings.push(finding({
        id: nextId(7),
        rule: 7,
        severity: parallel ? 'MEDIUM' : 'LOW',
        title: `Rule 7: three-item list "${a}, ${b}, and ${c}" in ${rel}`,
        location: { file: rel, line: absLine },
        match: whole,
        quote: lineText.slice(0, 240),
        rewrite: 'If the items are not genuinely a list of comparable things, use prose. If only two items genuinely apply, use two. Three items chosen for rhythm — drop one.',
        why: 'The "X, Y, and Z" rule-of-three is overused as rhetorical flourish. Parallel single-word triads in particular signal rhythm-led writing.',
        scanner: 'rule07_rule_of_three',
      }));
    }
  }
}

if (OUT) fs.writeFileSync(OUT, JSON.stringify(findings, null, 2));
else process.stdout.write(JSON.stringify(findings, null, 2) + '\n');
