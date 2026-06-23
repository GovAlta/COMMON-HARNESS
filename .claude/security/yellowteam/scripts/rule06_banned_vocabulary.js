#!/usr/bin/env node
/**
 * rule06_banned_vocabulary.js — detect banned words, banned sentence openers,
 * and cliché adjective phrases.
 *
 * Rule 6 from the style guide. Three sub-categories:
 *   1. Banned words (whole-word, case-insensitive)
 *   2. Banned sentence openers (must match start of sentence)
 *   3. Metaphor-only words ("navigate", "landscape", "ecosystem", "journey")
 *      — best-effort heuristic to avoid flagging legitimate literal use.
 *
 * Usage: node rule06_banned_vocabulary.js --target <path> [--out <file>] [--scope all|prose|code]
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

const BANNED_WORDS = [
  'leverage', 'unlock', 'delve', 'robust', 'seamless', 'crucial', 'essential',
  'vital', 'holistic', 'intricate', 'interlocking', 'mutually reinforcing',
  'crystallize', 'crystallise', 'amplify', 'tee up',
  'tapestry', 'realm', 'paradigm', 'synergy', 'fabric',
  'game-changing', 'cutting-edge', 'state-of-the-art', 'world-class',
  'best-in-class', 'next-generation',
];

const FILLER_PHRASES = [
  'It is also worth noting', 'From .{1,30} to .{1,30}', 'In a world where',
  'At the end of the day', 'Move the needle', 'Drive impact',
];

const METAPHOR_WORDS = ['navigate', 'landscape', 'ecosystem', 'journey'];

// Heuristic exclusions for metaphor words — likely literal/technical contexts.
const METAPHOR_EXCLUDE = [
  'Map.prototype', 'URL', 'npm', 'Window', 'window.', 'document.',
  '.js', '.ts', '.go', '.py', '.html', '.css',
  'mountain', 'river', 'forest', 'desert', 'coast', 'island', 'rural',
  'http', 'https://', 'browser', 'router', 'route',
];

const SENTENCE_OPENERS = [
  'Moreover', 'Furthermore', 'In essence', 'At its core', 'Fundamentally',
  "In today['’]s world", 'In the world of', "It['’]s worth noting that",
  'It is important to note that',
];

function esc(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

const PATTERNS = [];

for (const w of BANNED_WORDS) {
  PATTERNS.push({
    name: `banned word: "${w}"`,
    kind: 'banned-word',
    re: new RegExp(`\\b${w.replace(/[-]/g, '[- ]').replace(/\\s\\+/g, '\\s+').replace(/ /g, '\\s+')}\\b`, 'gi'),
  });
}

for (const phrase of FILLER_PHRASES) {
  PATTERNS.push({
    name: `filler phrase: "${phrase}"`,
    kind: 'filler-phrase',
    re: new RegExp(`\\b${phrase}\\b`, 'gi'),
  });
}

for (const w of METAPHOR_WORDS) {
  PATTERNS.push({
    name: `metaphor word: "${w}" (verify not literal)`,
    kind: 'metaphor',
    re: new RegExp(`\\b${w}\\b`, 'gi'),
  });
}

for (const opener of SENTENCE_OPENERS) {
  PATTERNS.push({
    name: `banned opener: "${opener.replace(/\\.|\[.*?\]/g, '')}"`,
    kind: 'opener',
    re: new RegExp(`(?:^|\\.\\s+|\\n\\s*)(${opener})\\b`, 'gm'),
  });
}

function looksLiteral(line) {
  const low = line.toLowerCase();
  return METAPHOR_EXCLUDE.some(t => low.includes(t.toLowerCase()));
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

        if (p.kind === 'metaphor' && looksLiteral(lineText)) continue;

        findings.push(finding({
          id: nextId(6),
          rule: 6,
          title: `Rule 6: ${p.name} in ${rel}`,
          location: { file: rel, line: absLine },
          match: m[0],
          quote: lineText.slice(0, 240),
          rewrite: 'Replace with the plainest direct word. The banned term almost never carries unique meaning a plainer word would not carry better.',
          why: 'The style guide bans this word/phrase as a high-frequency AI tell. Reach for a literal, specific alternative.',
          scanner: 'rule06_banned_vocabulary',
        }));
      }
    }
  }
}

if (OUT) fs.writeFileSync(OUT, JSON.stringify(findings, null, 2));
else process.stdout.write(JSON.stringify(findings, null, 2) + '\n');
