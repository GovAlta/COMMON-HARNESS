#!/usr/bin/env node
/**
 * rule04_cinematic_sentences.js — detect runs of short declarative sentences
 * used for dramatic effect. The "movie trailer voice-over" tic.
 *
 * Heuristic: within a paragraph (consecutive non-blank, non-heading, non-list,
 * non-code lines), find any run of 3 sentences in a row where each sentence is
 * ≤8 words and ends with a period.
 *
 * Skip:
 *   - heading lines (starting with `#`)
 *   - fenced code blocks (between ```)
 *   - table rows (lines containing `|`)
 *   - bulleted / numbered list items (- * + or 1.)
 *
 * Usage: node rule04_cinematic_sentences.js --target <path> [--out <file>] [--scope all|prose|code]
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

const MAX_WORDS = 8;
const RUN_LEN = 3;

// Split a paragraph into sentences. Naive but sufficient for the heuristic.
function splitSentences(para) {
  const parts = para.match(/[^.!?]+[.!?]+(?=\s|$)/g);
  return parts ? parts.map(s => s.trim()).filter(Boolean) : [];
}

function wordCount(s) {
  return s.replace(/[.!?]+\s*$/, '').trim().split(/\s+/).filter(Boolean).length;
}

function isSkipLine(line) {
  const t = line.trim();
  if (!t) return true;
  if (t.startsWith('#')) return true;
  if (t.startsWith('```')) return true;
  if (t.startsWith('|')) return true;
  if (/^[-*+]\s/.test(t)) return true;
  if (/^\d+\.\s/.test(t)) return true;
  return false;
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

    // Collect paragraphs: groups of consecutive non-skip lines, tracking start line.
    let inFence = false;
    let para = [];
    let paraStart = 0;

    const flush = () => {
      if (para.length === 0) return;
      const paragraph = para.join(' ');
      const sentences = splitSentences(paragraph);
      // Slide a window of 3 over the sentences.
      for (let i = 0; i + RUN_LEN - 1 < sentences.length; i++) {
        const window = sentences.slice(i, i + RUN_LEN);
        if (window.every(s => wordCount(s) <= MAX_WORDS && /\.\s*$/.test(s))) {
          const match = window.join(' ').slice(0, 220);
          const absLine = seg.startLine + paraStart - 1;
          findings.push(finding({
            id: nextId(4),
            rule: 4,
            title: `Rule 4: cinematic short-sentence run in ${rel}`,
            location: { file: rel, line: absLine },
            match,
            quote: paragraph.trim().slice(0, 240),
            rewrite: 'Combine the short sentences into one normal-cadence sentence. If the rhythm matters more than the content, the content was thin.',
            why: 'Two or three short declarative sentences in a row read as a movie-trailer voice-over. It is rhythm-led prose, not information-led.',
            scanner: 'rule04_cinematic_sentences',
          }));
          break; // one hit per paragraph
        }
      }
      para = [];
    };

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (line.trim().startsWith('```')) { inFence = !inFence; flush(); continue; }
      if (inFence) continue;
      if (isSkipLine(line)) { flush(); continue; }
      if (para.length === 0) paraStart = i + 1;
      para.push(line);
    }
    flush();
  }
}

if (OUT) fs.writeFileSync(OUT, JSON.stringify(findings, null, 2));
else process.stdout.write(JSON.stringify(findings, null, 2) + '\n');
