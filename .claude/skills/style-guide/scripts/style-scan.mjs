#!/usr/bin/env node
/**
 * style-scan.mjs — mechanical pre-pass for /style-guide.
 *
 * Greps the target text for regex signatures of the 12 hard rules in
 * style-rules.md and emits a JSON list of suspect lines. The judgement
 * pass (the skill agent) reads this output plus the original document
 * and decides which suspects are real violations.
 *
 * Usage:
 *   node style-scan.mjs <file>                  # single file → JSON to stdout
 *   node style-scan.mjs <file> --pretty         # one violation per line, human readable
 *   node style-scan.mjs --glob "docs/**\/*.md"  # glob pattern (single-quoted on shell)
 *   echo "<text>" | node style-scan.mjs --stdin # read from stdin
 *
 * Exits 0 always. Empty list = no mechanical hits (but the judgement pass
 * may still find rule-12 / AI-smell issues).
 */

import fs from 'node:fs';
import path from 'node:path';

const argv = process.argv.slice(2);
let target = null, pretty = false, fromStdin = false, globPattern = null;
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a === '--pretty') pretty = true;
  else if (a === '--stdin') fromStdin = true;
  else if (a === '--glob') globPattern = argv[++i];
  else if (!target) target = a;
}

// ─── Rule patterns ──────────────────────────────────────────────────────────
// Each pattern is { rule, name, pattern, severity, explain }

const BANNED_WORDS = [
  // verbs / adjectives
  'leverage', 'unlock', 'delve', 'robust', 'seamless', 'crucial', 'essential',
  'vital', 'holistic', 'intricate', 'interlocking', 'mutually reinforcing',
  'crystallize', 'crystallise', 'amplify', 'tee up',
  // nouns (metaphorical)
  'tapestry', 'realm', 'paradigm', 'synergy', 'fabric',
  // adjective clichés
  'game-changing', 'cutting-edge', 'state-of-the-art', 'world-class',
  'best-in-class', 'next-generation',
];

const METAPHOR_WORDS = ['landscape', 'ecosystem', 'journey', 'navigate'];

const SENTENCE_OPENERS = [
  'Moreover', 'Furthermore', 'In essence', 'At its core', 'Fundamentally',
  "In today's world", 'In the world of', "It's worth noting that",
  'It is important to note that',
];

const INTENSIFIERS = ['very', 'really', 'truly', 'deeply', 'profoundly',
  'incredibly', 'extremely', 'particularly', 'notably', 'importantly'];

const RULES = [
  // Rule 1 — Not X, but Y
  { rule: 1, name: 'not-X-but-Y',
    pattern: /\b(is|are|was|were|isn't|aren't)\s+not\s+(?:just\s+)?[^.,;]+,\s+(?:but|it)\b/i,
    explain: 'Drop the negated half. State what the thing is.' },
  { rule: 1, name: 'not-X-but-Y',
    pattern: /\bnot\s+(?:just|only|merely)\s+[^.,;]+,\s+but\b/i,
    explain: 'Drop the negated half. State what the thing is.' },
  { rule: 1, name: 'not-X-but-Y',
    pattern: /\bThis is not\s+[^.]+\.\s+(?:It is|This is)\b/i,
    explain: 'Drop the "This is not X. It is Y." flourish.' },
  // Rule 2 — em dash / long dash
  { rule: 2, name: 'em-dash',
    pattern: /—|–/, // em-dash U+2014, en-dash U+2013
    explain: 'Replace with comma, period, parenthesis, or colon.' },
  // Rule 5 — rhetorical anchors
  { rule: 5, name: 'is-the-moment',
    pattern: /\b(?:This|That) is (?:the moment|where|the cadence|the technical authority|the [a-z]+ piece)\b/i,
    explain: 'Describe what the step delivers, not what it "is".' },
  // Rule 6 — banned vocabulary
  { rule: 6, name: 'banned-word', vocab: BANNED_WORDS,
    explain: 'Replace with a plainer word. The banned word almost never carries unique meaning.' },
  { rule: 6, name: 'banned-metaphor', vocab: METAPHOR_WORDS,
    explain: 'Strip the metaphor. Use the literal word.' },
  { rule: 6, name: 'banned-opener',
    pattern: new RegExp(`^\\s*(?:${SENTENCE_OPENERS.map(s => s.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\\\$&')).join('|')})[\\s,]`, 'mi'),
    explain: 'Cut the opener. The sentence works without it.' },
  // Rule 9 — ensure as hedge
  { rule: 9, name: 'ensure-hedge',
    pattern: /\bEnsure(?:s|d)?\s+(?:that\s+)?\w+/i,
    explain: '"Ensure" is a hedge. Use a direct verb.' },
  // Rule 10 — vague intensifiers
  { rule: 10, name: 'intensifier', vocab: INTENSIFIERS,
    explain: 'Strike unless it carries real meaning. If the claim needs the intensifier to land, strengthen the claim instead.' },
  // Rule 11 — decorations (emoji + obvious decorators)
  { rule: 11, name: 'emoji',
    pattern: /[\u{1F300}-\u{1FAFF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]|[\u{1F000}-\u{1F2FF}]/u,
    explain: 'No emoji in documentation, code, READMEs, or UI unless explicitly requested.' },
  // Rule 8 — sentence-end participial flourish (heuristic)
  { rule: 8, name: 'participial-tail',
    pattern: /,\s+\w+ing\s+[a-z]+(?:\s+[a-z]+){0,5}\.\s*$/m,
    explain: 'End the sentence at the period. The trailing -ing phrase usually restates what was just said.' },
  // Rule 7 — three-item rule-of-three (heuristic; over-fires; judgement pass filters)
  { rule: 7, name: 'rule-of-three',
    pattern: /\b\w+,\s+\w+,?\s+and\s+\w+\b/,
    severity: 'low', // many legitimate lists trigger this — judgement pass MUST filter
    explain: 'If the items are not genuinely a list, use prose. If only two items genuinely apply, use two.' },
];

// ─── Run on a text body ─────────────────────────────────────────────────────
function scanText(text, filename = '<stdin>') {
  const lines = text.split(/\r?\n/);
  const findings = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim()) continue;
    for (const rule of RULES) {
      if (rule.vocab) {
        for (const word of rule.vocab) {
          const re = new RegExp(`\\b${word.replace(/[-]/g, '[- ]')}\\b`, 'i');
          const m = line.match(re);
          if (m) {
            findings.push({
              file: filename, line: i + 1, col: m.index + 1,
              rule: rule.rule, name: rule.name, severity: rule.severity || 'medium',
              match: m[0], explain: rule.explain, quote: line.trim().slice(0, 280),
            });
          }
        }
      } else if (rule.pattern) {
        const m = line.match(rule.pattern);
        if (m) {
          findings.push({
            file: filename, line: i + 1, col: (m.index ?? 0) + 1,
            rule: rule.rule, name: rule.name, severity: rule.severity || 'medium',
            match: m[0], explain: rule.explain, quote: line.trim().slice(0, 280),
          });
        }
      }
    }
  }
  return findings;
}

// ─── I/O ────────────────────────────────────────────────────────────────────
async function readStdin() {
  return new Promise(resolve => {
    let buf = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', d => buf += d);
    process.stdin.on('end', () => resolve(buf));
  });
}

function expandGlob(p) {
  // Very small glob: only the ** and * patterns inside a literal prefix
  const idx = p.search(/[*?]/);
  const base = idx === -1 ? path.dirname(p) : (p.slice(0, idx).match(/(.*?\/)[^\/]*$/) || ['./',])[1] || '.';
  const out = [];
  const re = new RegExp('^' + p
    .replace(/\./g, '\\.')
    .replace(/\*\*/g, '@@DOUBLESTAR@@')
    .replace(/\*/g, '[^/]*')
    .replace(/@@DOUBLESTAR@@/g, '.*')
    + '$');
  function walk(dir) {
    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) walk(full);
      else if (re.test(full.replace(/\\/g, '/'))) out.push(full);
    }
  }
  walk(base);
  return out;
}

let inputs = [];
let text = null;
if (fromStdin) {
  text = await readStdin();
} else if (globPattern) {
  inputs = expandGlob(globPattern);
} else if (target) {
  inputs = [target];
} else {
  console.error('usage: style-scan.mjs <file> | --stdin | --glob "<pattern>" [--pretty]');
  process.exit(2);
}

const all = [];
if (text !== null) {
  all.push(...scanText(text));
} else {
  for (const f of inputs) {
    let body;
    try { body = fs.readFileSync(f, 'utf8'); } catch (e) {
      process.stderr.write(`style-scan: cannot read ${f}: ${e.message}\n`);
      continue;
    }
    all.push(...scanText(body, f));
  }
}

if (pretty) {
  if (all.length === 0) {
    console.log('style-scan: no mechanical violations.');
    process.exit(0);
  }
  console.log(`style-scan: ${all.length} suspect line(s)`);
  console.log('─'.repeat(72));
  for (const v of all) {
    console.log(`  rule ${v.rule} (${v.name})  ${v.file}:${v.line}`);
    console.log(`    match: "${v.match}"`);
    console.log(`    line:  ${v.quote}`);
    console.log(`    fix:   ${v.explain}`);
    console.log('');
  }
} else {
  process.stdout.write(JSON.stringify(all, null, 2) + '\n');
}
process.exit(0);
