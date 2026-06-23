#!/usr/bin/env node
/**
 * rule11_decorations_emoji.js — detect emojis and decorative box-drawing /
 * ASCII art noise.
 *
 * Patterns:
 *   1. Emoji code points (Unicode plane ranges).
 *   2. Lines with 8+ consecutive characters drawn from the box-drawing /
 *      heavy-rule set used for ASCII decoration.
 *
 * Skip:
 *   - Inside fenced code blocks (between ```).
 *
 * Usage: node rule11_decorations_emoji.js --target <path> [--out <file>] [--scope all|prose|code]
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

const EMOJI_RE = /[\u{1F300}-\u{1FAFF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]|[\u{1F000}-\u{1F2FF}]/gu;

// Decoration: 8+ run of box-drawing / heavy-rule / light-rule glyphs.
const DECORATION_RE = /[═━─━╔╗╚╝│┃┌┐└┘─━━━]{8,}/g;

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

    // Track fence state line-by-line so we can skip code-block contents.
    let inFence = false;
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (line.trim().startsWith('```')) { inFence = !inFence; continue; }
      if (inFence) continue;

      // Emoji check
      const reE = new RegExp(EMOJI_RE.source, EMOJI_RE.flags);
      let m;
      while ((m = reE.exec(line)) !== null) {
        const absLine = seg.startLine + i;
        findings.push(finding({
          id: nextId(11),
          rule: 11,
          title: `Rule 11: emoji "${m[0]}" in ${rel}`,
          location: { file: rel, line: absLine },
          match: m[0],
          quote: line.trim().slice(0, 240),
          rewrite: 'Remove the emoji. Documentation, code, READMEs, and UI text must not contain emojis unless the user explicitly asked for them.',
          why: 'Unrequested emojis are an obvious AI-output tell. They add visual noise without information.',
          scanner: 'rule11_decorations_emoji',
        }));
      }

      // Decoration check
      const reD = new RegExp(DECORATION_RE.source, DECORATION_RE.flags);
      let d;
      while ((d = reD.exec(line)) !== null) {
        const absLine = seg.startLine + i;
        findings.push(finding({
          id: nextId(11),
          rule: 11,
          title: `Rule 11: decorative ASCII art in ${rel}`,
          location: { file: rel, line: absLine },
          match: d[0].slice(0, 60),
          quote: line.trim().slice(0, 240),
          rewrite: 'Remove the box-drawing decoration. If a visual divider is needed, a plain horizontal rule (---) or a heading suffices.',
          why: 'Long runs of box-drawing characters are decoration, not structure. They are an AI tell that the model is dressing up output.',
          scanner: 'rule11_decorations_emoji',
        }));
      }
    }
  }
}

if (OUT) fs.writeFileSync(OUT, JSON.stringify(findings, null, 2));
else process.stdout.write(JSON.stringify(findings, null, 2) + '\n');
