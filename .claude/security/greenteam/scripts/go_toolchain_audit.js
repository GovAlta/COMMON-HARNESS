#!/usr/bin/env node
/**
 * go_toolchain_audit.js — Go toolchain version + ST1005 lint.
 *
 * 1. Reads go.mod for `go <version>` and `toolchain go<version>`. Emits INFO.
 * 2. Scans *.go files for ST1005 (capitalized error strings):
 *      errors.New("[A-Z]…")
 *      fmt.Errorf("[A-Z]…")
 *    De-duplicates per file (one finding per file).
 *
 * Usage: node go_toolchain_audit.js --target <path> [--out <file>]
 */

import fs from 'node:fs';
import path from 'node:path';
import { finding, makeIdAllocator } from '../pipeline/output_schemas.js';

const argv = process.argv.slice(2);
let TARGET = process.cwd();
let OUT = null;
for (let i = 0; i < argv.length; i++) {
  if (argv[i] === '--target') TARGET = path.resolve(argv[++i]);
  else if (argv[i] === '--out') OUT = path.resolve(argv[++i]);
}

const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'build', 'coverage', '.next', '.nuxt']);

function findGoMods(root, depth = 0, acc = []) {
  if (depth > 6) return acc;
  let entries;
  try { entries = fs.readdirSync(root, { withFileTypes: true }); } catch { return acc; }
  if (entries.some(e => e.name === 'go.mod' && e.isFile())) acc.push(root);
  for (const e of entries) {
    if (e.isDirectory() && !SKIP_DIRS.has(e.name) && !e.name.startsWith('.')) {
      findGoMods(path.join(root, e.name), depth + 1, acc);
    }
  }
  return acc;
}

function walkGo(dir, acc = []) {
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return acc; }
  for (const e of entries) {
    if (SKIP_DIRS.has(e.name)) continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) walkGo(full, acc);
    else if (e.isFile() && e.name.endsWith('.go') && !e.name.endsWith('_test.go')) acc.push(full);
  }
  return acc;
}

function parseVer(s) {
  const m = String(s).match(/(\d+)\.(\d+)(?:\.(\d+))?/);
  if (!m) return null;
  return [parseInt(m[1], 10), parseInt(m[2], 10), parseInt(m[3] || '0', 10)];
}
function cmpVer(a, b) {
  for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return a[i] - b[i];
  return 0;
}

const findings = [];
const nextId = makeIdAllocator();
const mods = findGoMods(TARGET);

for (const mod of mods) {
  const rel = path.relative(TARGET, mod) || '.';
  let modText;
  try { modText = fs.readFileSync(path.join(mod, 'go.mod'), 'utf8'); } catch { continue; }
  const langM = modText.match(/^\s*go\s+(\d+\.\d+(?:\.\d+)?)/m);
  const toolM = modText.match(/^\s*toolchain\s+go(\d+\.\d+(?:\.\d+)?)/m);
  const lang = langM ? langM[1] : null;
  const tool = toolM ? toolM[1] : null;

  if (lang || tool) {
    let extraNote = '';
    if (lang && tool) {
      const a = parseVer(lang), b = parseVer(tool);
      if (a && b && cmpVer(b, a) > 0) extraNote = 'verify toolchain availability';
    }
    findings.push(finding({
      id: nextId(1, 'TOOL'),
      round: 1,
      severity: 'INFO',
      category: 'TOOL',
      title: `Go toolchain declared in ${rel}: go=${lang || 'unset'}, toolchain=${tool || 'unset'}${extraNote ? ' — ' + extraNote : ''}`,
      location: { repo: rel, file: 'go.mod' },
      evidence: { tool: 'go_toolchain_audit', go: lang, toolchain: tool },
      remediation: extraNote
        ? `Confirm CI and developer machines have Go ${tool} available. If not, lower the toolchain directive to match the lowest practical version.`
        : `No action needed.`,
      scanner: 'go_toolchain_audit',
    }));
  }

  // ST1005 scan
  const goFiles = walkGo(mod);
  for (const gf of goFiles) {
    let text;
    try { text = fs.readFileSync(gf, 'utf8'); } catch { continue; }
    const re = /(errors\.New|fmt\.Errorf)\s*\(\s*"([A-Z][^"]{0,200})"/g;
    let m, hit = null;
    while ((m = re.exec(text)) !== null) {
      const line = text.slice(0, m.index).split('\n').length;
      hit = { line, snippet: m[0].slice(0, 120) };
      break; // one finding per file
    }
    if (hit) {
      const grel = path.relative(TARGET, gf).replace(/\\/g, '/');
      findings.push(finding({
        id: nextId(1, 'LINT'),
        round: 1,
        severity: 'LOW',
        category: 'LINT',
        title: `ST1005: capitalized error string in ${grel}`,
        location: { file: grel, line: hit.line },
        evidence: { tool: 'go_toolchain_audit', rule: 'ST1005', snippet: hit.snippet },
        remediation: `Lowercase the first letter of error strings (Go convention). errors.New("foo") not errors.New("Foo"). Apply across the file — only the first occurrence is reported.`,
        compliance: 'Polish',
        scanner: 'go_toolchain_audit',
      }));
    }
  }
}

if (OUT) fs.writeFileSync(OUT, JSON.stringify(findings, null, 2));
else process.stdout.write(JSON.stringify(findings, null, 2) + '\n');
