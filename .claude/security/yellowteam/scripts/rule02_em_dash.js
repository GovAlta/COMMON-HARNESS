#!/usr/bin/env node
/**
 * rule02_em_dash.js — detect em dashes (—) and en dashes (–).
 *
 * The style guide forbids both. Use commas, periods, parentheses, or colons.
 * If a sentence relies on an em dash, it's usually two sentences trying to be one.
 *
 * Usage: node rule02_em_dash.js --target <path> [--out <file>]
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

const EM_DASH_RE = /([^\s])\s?[—–]\s?([^\s])/g;
// Skip lines that are clearly markdown horizontal rules or table separators
const SKIP_LINE_RE = /^[\s|—\-:=]+$/;

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
    let m;
    const re = new RegExp(EM_DASH_RE.source, EM_DASH_RE.flags);
    while ((m = re.exec(seg.text)) !== null) {
      const localLine = seg.text.slice(0, m.index).split('\n').length;
      const absLine = seg.startLine + localLine - 1;
      const lineText = lines[localLine - 1] || '';
      if (SKIP_LINE_RE.test(lineText)) continue;
      findings.push(finding({
        id: nextId(2),
        rule: 2,
        title: `Rule 2: em dash / en dash in ${rel}`,
        location: { file: rel, line: absLine },
        match: m[0],
        quote: lineText.trim().slice(0, 240),
        rewrite: 'Replace with a comma, period, parenthesis, or colon. If the sentence works only because of the em dash, it is usually two sentences trying to be one — split them.',
        why: 'Em dashes are a frequent AI-prose habit. The plain alternatives almost always read better and force the writer to commit to a sentence structure.',
        scanner: 'rule02_em_dash',
      }));
    }
  }
}

if (OUT) fs.writeFileSync(OUT, JSON.stringify(findings, null, 2));
else process.stdout.write(JSON.stringify(findings, null, 2) + '\n');
