#!/usr/bin/env node
/**
 * rule12_ai_smell.js — detect sycophantic openings, recap loops, foreshadowing,
 * over-explanation tells, hedge-stacks, and "as an AI" disclaimers.
 *
 * Patterns:
 *   1. Sycophantic openings: "Great question", "Excellent point", etc.
 *   2. Foreshadowing / recap: "As we will see", "As noted above", "To summarize", etc.
 *   3. Over-explanation tells: "Let's dive in", "First and foremost", "It is worth mentioning".
 *   4. Hedge-stack: any single sentence containing 3+ of
 *      might / could / may / perhaps / possibly / potentially / seemingly.
 *   5. "As an AI" disclaimers.
 *
 * Usage: node rule12_ai_smell.js --target <path> [--out <file>] [--scope all|prose|code]
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
  { name: 'sycophantic opening',
    re: /\b(?:Great|Excellent|Perfect|Absolutely)\s+(?:question|point|observation|call|idea)\b/g,
    why: 'Sycophantic openings ("Great question!") are a classic AI tell. They flatter rather than inform.',
    rewrite: 'Drop the compliment. Answer the question directly.' },
  { name: 'foreshadowing / recap',
    re: /\b(?:As\s+we\s+will\s+see|As\s+noted\s+above|As\s+mentioned\s+earlier|To\s+summari[sz]e|To\s+sum\s+up|In\s+summary)\b/gi,
    why: 'Foreshadowing and recap signal an AI summarising itself. Trust the reader — do not narrate the document.',
    rewrite: 'Cut the foreshadowing/recap entirely. The reader has just read (or will read) the section.' },
  { name: 'over-explanation opener',
    re: /\b(?:Let['’]s\s+(?:dive\s+in|explore|unpack|break\s+down)|First\s+and\s+foremost|It\s+is\s+worth\s+mentioning)\b/gi,
    why: 'Over-explanation openers ("Let\'s dive in", "First and foremost") are throat-clearing. Cut them.',
    rewrite: 'Delete the opener and start with the claim.' },
  { name: '"as an AI" disclaimer',
    re: /\b[Aa]s\s+an\s+AI\b/g,
    why: 'AI disclaimers are an obvious model tell and rarely add useful framing.',
    rewrite: 'Remove the disclaimer. Make the claim and let the reader judge it.' },
];

const HEDGES = ['might', 'could', 'may', 'perhaps', 'possibly', 'potentially', 'seemingly'];

function splitSentences(para) {
  const parts = para.match(/[^.!?\n]+[.!?]+(?=\s|$)/g);
  return parts ? parts.map(s => s.trim()).filter(Boolean) : [];
}

function countHedges(sentence) {
  let n = 0;
  for (const h of HEDGES) {
    const re = new RegExp(`\\b${h}\\b`, 'gi');
    const m = sentence.match(re);
    if (m) n += m.length;
  }
  return n;
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

    // Direct pattern matches
    for (const p of PATTERNS) {
      const re = new RegExp(p.re.source, p.re.flags);
      let m;
      while ((m = re.exec(seg.text)) !== null) {
        const localLine = seg.text.slice(0, m.index).split('\n').length;
        const absLine = seg.startLine + localLine - 1;
        const lineText = (lines[localLine - 1] || '').trim();
        findings.push(finding({
          id: nextId(12),
          rule: 12,
          title: `Rule 12: AI smell (${p.name}) in ${rel}`,
          location: { file: rel, line: absLine },
          match: m[0],
          quote: lineText.slice(0, 240),
          rewrite: p.rewrite,
          why: p.why,
          scanner: 'rule12_ai_smell',
        }));
      }
    }

    // Hedge-stack: any sentence with 3+ hedges.
    const sentRe = /[^.!?\n]+[.!?]/g;
    let sm;
    while ((sm = sentRe.exec(seg.text)) !== null) {
      const sentence = sm[0];
      if (countHedges(sentence) >= 3) {
        const localLine = seg.text.slice(0, sm.index).split('\n').length;
        const absLine = seg.startLine + localLine - 1;
        const lineText = (lines[localLine - 1] || '').trim();
        findings.push(finding({
          id: nextId(12),
          rule: 12,
          title: `Rule 12: AI smell (hedge-stack) in ${rel}`,
          location: { file: rel, line: absLine },
          match: sentence.trim().slice(0, 200),
          quote: lineText.slice(0, 240),
          rewrite: 'Cut the hedges. State what you mean. If you genuinely don\'t know, say "we do not know yet" once — not three softening verbs in one sentence.',
          why: 'Stacking 3+ hedges (might/could/may/perhaps/possibly/potentially/seemingly) in one sentence is an AI confidence-laundering pattern.',
          scanner: 'rule12_ai_smell',
        }));
      }
    }
  }
}

if (OUT) fs.writeFileSync(OUT, JSON.stringify(findings, null, 2));
else process.stdout.write(JSON.stringify(findings, null, 2) + '\n');
