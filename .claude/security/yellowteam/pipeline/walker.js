/**
 * walker.js — shared file walk for yellowteam scanners.
 *
 * Walks the target tree for text files (markdown, code comments, docs, JSDoc).
 * Skips: node_modules, .git, build/dist/coverage, vendored dirs, binary files,
 * minified files, oversized files (>2MB).
 */

import fs from 'node:fs';
import path from 'node:path';

const SKIP_DIRS = new Set([
  'node_modules', '.git', 'dist', 'build', 'coverage', '.next', '.nuxt',
  '.gradle', '.idea', '.venv', 'venv', '__pycache__', 'target', 'out', 'bin',
  '3rd-party', 'third_party', 'third-party', 'vendor', '_archive',
  'fixtures', '__fixtures__',
]);

const SKIP_FILE_RE = /\.min\.(?:js|css|html)$|\.bundle\.(?:js|css)$|package-lock\.json$|yarn\.lock$|poetry\.lock$|Gemfile\.lock$|composer\.lock$|go\.sum$|Cargo\.lock$/i;
const BINARY_EXT = new Set([
  '.png', '.jpg', '.jpeg', '.gif', '.ico', '.svg', '.pdf', '.zip', '.tar', '.gz',
  '.woff', '.woff2', '.ttf', '.otf', '.eot', '.mp3', '.mp4', '.exe', '.dll',
  '.so', '.dylib', '.bin', '.jar', '.class', '.wasm',
]);

/**
 * Walk and return absolute file paths of textual / human-prose files.
 *
 * scope options:
 *   'all'   — every text file (default)
 *   'prose' — only Markdown / text / docs / comments — best for style audit
 *   'code'  — only source files (for comment-only style audit)
 */
export function walk(target, { scope = 'all', maxSize = 2_000_000 } = {}) {
  const out = [];
  const abs = path.resolve(target);

  // Single-file target. Without this branch, walkDir() below calls
  // readdirSync on the file, the readdir throws ENOTDIR, the catch
  // swallows it, and the function returns an empty array. The caller
  // then reports zero findings, which looks like a clean scan but
  // actually means nothing was scanned. Bug discovered 2026-05-18
  // when --target <file.md> returned 0 findings on a file with 29
  // em dashes in plain prose.
  let topStat;
  try { topStat = fs.statSync(abs); } catch { return out; }
  if (topStat.isFile()) {
    if (topStat.size > maxSize) return out;
    if (shouldKeep(abs)) out.push(abs);
    return out;
  }

  function shouldKeep(file) {
    const base = path.basename(file);
    if (SKIP_FILE_RE.test(base)) return false;
    const ext = path.extname(base).toLowerCase();
    if (BINARY_EXT.has(ext)) return false;
    if (scope === 'prose') {
      return /\.(?:md|mdx|markdown|txt|rst|adoc|asciidoc|rtf)$/i.test(base)
        || /^(?:README|CONTRIBUTING|CHANGELOG|CHANGES|HISTORY|LICENSE|AUTHORS|MAINTAINERS|NOTICE|CODE_OF_CONDUCT|SECURITY|CLAUDE|TESTING|DEVELOPMENT|RUNBOOK)(?:\.[A-Za-z]+)?$/i.test(base);
    }
    if (scope === 'code') {
      return /\.(?:js|jsx|ts|tsx|vue|mjs|cjs|go|java|py|rb|rs|cs|php|swift|kt|kts|scala|sh|ps1)$/i.test(base);
    }
    // 'all' — keep anything texty
    return /\.(?:md|mdx|markdown|txt|rst|adoc|asciidoc|js|jsx|ts|tsx|vue|mjs|cjs|go|java|py|rb|rs|cs|php|swift|kt|kts|scala|sh|ps1|yaml|yml|toml|json|html|css|scss|sass)$/i.test(base)
      || /^(?:README|CONTRIBUTING|CHANGELOG|CHANGES|HISTORY|LICENSE|AUTHORS|MAINTAINERS|NOTICE|CODE_OF_CONDUCT|SECURITY|CLAUDE|TESTING|DEVELOPMENT|RUNBOOK|Makefile|Dockerfile)(?:\.[A-Za-z]+)?$/i.test(base);
  }

  function walkDir(dir) {
    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      if (SKIP_DIRS.has(e.name)) continue;
      if (e.name.startsWith('.git')) continue;
      const full = path.join(dir, e.name);
      if (e.isDirectory()) walkDir(full);
      else if (e.isFile() && shouldKeep(full)) {
        let stat;
        try { stat = fs.statSync(full); } catch { continue; }
        if (stat.size > maxSize) continue;
        out.push(full);
      }
    }
  }
  walkDir(abs);
  return out;
}

/**
 * Decide which segments of a source file count as "prose".
 * For .md / .txt / .rst — the whole file.
 * For source code — block comments (/* ... *​/) + JSDoc + line comments
 * grouped into adjacent runs.
 *
 * Returns an array of { text, startLine }
 */
export function extractProseSegments(file, text) {
  const ext = path.extname(file).toLowerCase();
  if (/\.(?:md|mdx|markdown|txt|rst|adoc|asciidoc)$/i.test(ext) || !ext) {
    return [{ text, startLine: 1 }];
  }
  const segments = [];
  // Block comments /* ... */
  const blockRe = /\/\*\*?([\s\S]+?)\*\//g;
  let m;
  while ((m = blockRe.exec(text)) !== null) {
    const startLine = text.slice(0, m.index).split('\n').length;
    segments.push({ text: m[1].replace(/^\s*\*\s?/gm, ''), startLine });
  }
  // Adjacent line-comments grouped into a segment
  const lines = text.split('\n');
  let run = [];
  let runStart = 0;
  for (let i = 0; i < lines.length; i++) {
    const ln = lines[i];
    const mm = ln.match(/^\s*(?:\/\/|#)\s?(.*)$/);
    if (mm) {
      if (run.length === 0) runStart = i + 1;
      run.push(mm[1]);
    } else if (run.length > 0) {
      if (run.length >= 2) {
        segments.push({ text: run.join('\n'), startLine: runStart });
      }
      run = [];
    }
  }
  if (run.length >= 2) segments.push({ text: run.join('\n'), startLine: runStart });
  return segments;
}
