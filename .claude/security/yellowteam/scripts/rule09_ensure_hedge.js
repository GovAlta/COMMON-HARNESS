#!/usr/bin/env node
/**
 * rule09_ensure_hedge.js — detect "ensure" used as a verb hedge in prose.
 *
 * "Ensure" is a hedge — most uses work better with a direct verb.
 *   "Ensure the whitepaper anchors the story." → "Anchor the story on the whitepaper."
 *
 * Skip:
 *   - Test contexts (within 3 lines of `describe`, `it(`, `test(`, `expect(`).
 *   - Function-call form: "ensure(<args>)" — that is API usage, not prose.
 *
 * Usage: node rule09_ensure_hedge.js --target <path> [--out <file>] [--scope all|prose|code]
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

const ENSURE_RE = /\b([Ee]nsure(?:s|d)?)\s+(?:that\s+)?(\w+)/g;
const TEST_RE = /\b(?:describe|it|test|expect)\s*\(/;

const files = walk(TARGET, { scope: SCOPE });
const findings = [];
const nextId = makeIdAllocator();

for (const file of files) {
  let text;
  try { text = fs.readFileSync(file, 'utf8'); } catch { continue; }
  const rel = path.relative(TARGET, file).replace(/\\/g, '/');
  const segments = extractProseSegments(file, text);

  // Pre-compute lines in the WHOLE file so we can do the 3-line proximity check
  // even when the segment is a comment block inside a test file.
  const allLines = text.split('\n');

  for (const seg of segments) {
    const lines = seg.text.split('\n');
    const re = new RegExp(ENSURE_RE.source, ENSURE_RE.flags);
    let m;
    while ((m = re.exec(seg.text)) !== null) {
      // Skip function-call form: ensure(...) — check the character right after the match.
      const after = seg.text[m.index + m[1].length];
      if (after === '(') continue;

      const localLine = seg.text.slice(0, m.index).split('\n').length;
      const absLine = seg.startLine + localLine - 1;

      // Test-context proximity check: look ±3 lines in the original file.
      const lo = Math.max(0, absLine - 4);
      const hi = Math.min(allLines.length, absLine + 3);
      let nearTest = false;
      for (let k = lo; k < hi; k++) {
        if (TEST_RE.test(allLines[k])) { nearTest = true; break; }
      }
      if (nearTest) continue;

      const lineText = (lines[localLine - 1] || '').trim();
      findings.push(finding({
        id: nextId(9),
        rule: 9,
        title: `Rule 9: "${m[1]}" hedge in ${rel}`,
        location: { file: rel, line: absLine },
        match: m[0],
        quote: lineText.slice(0, 240),
        rewrite: 'Replace "ensure X" with a direct verb. E.g., "Ensure visibility is maintained" → "Maintain visibility." If the sentence loses meaning without "ensure", the original was hedged.',
        why: '"Ensure" is a hedge verb. It softens the claim and almost always reads better as a direct imperative.',
        scanner: 'rule09_ensure_hedge',
      }));
    }
  }
}

if (OUT) fs.writeFileSync(OUT, JSON.stringify(findings, null, 2));
else process.stdout.write(JSON.stringify(findings, null, 2) + '\n');
