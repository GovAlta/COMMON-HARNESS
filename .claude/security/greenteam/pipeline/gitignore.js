/**
 * gitignore.js — load every .gitignore in the target tree and answer
 * `isIgnored(filePath)`.
 *
 * Reasoning: secret_scan and others walk the FULL tree (intentionally —
 * we want to catch credentials in committed-but-misclassified files). But
 * a local `.env` that IS gitignored is not an exposure — it's the
 * intended local-development pattern. We don't want to flag those.
 *
 * Strategy:
 *   - Load every .gitignore between the file and the target root.
 *   - Build pattern → regex matcher per .gitignore (root-relative anchoring).
 *   - Per-file lookup: walk up the dir chain, ask each ancestor's
 *     .gitignore whether the relative path is covered; first hit wins.
 *
 * Notes:
 *   - We implement a subset of gitignore semantics that covers the
 *     overwhelming majority of real-world usage:
 *       leading "/"   = anchor to .gitignore's dir
 *       trailing "/"  = directory-only match
 *       "**"          = any number of dirs (zero or more)
 *       "*"           = any chars except "/"
 *       "?"           = any single char except "/"
 *       leading "!"   = negate (un-ignore)
 *       leading "#"   = comment (skipped)
 *   - We do NOT shell out to `git check-ignore` — many target trees may
 *     not be git repos, and we want zero-dep behavior.
 */

import fs from 'node:fs';
import path from 'node:path';

const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'build', 'coverage', '.next', '.nuxt']);

/**
 * Load every .gitignore under root. Returns an array of
 * { dir, dirRel, rules: [{ pattern, isNegation, isDirOnly, isAnchored, re }] }
 * sorted so deeper .gitignores are checked AFTER shallower ones (negations
 * in nested ignores can re-include files).
 */
export function loadGitignores(root) {
  // Normalize root to platform-native form so path comparisons work on Windows
  // (input may have forward slashes; path.resolve / path.relative use \ on win).
  const normRoot = path.resolve(root);
  const out = [];
  function walkDir(dir) {
    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    if (entries.some(e => e.isFile() && e.name === '.gitignore')) {
      const giPath = path.join(dir, '.gitignore');
      let text;
      try { text = fs.readFileSync(giPath, 'utf8'); } catch { text = ''; }
      const rules = parseGitignore(text);
      out.push({ dir, dirRel: path.relative(normRoot, dir).replace(/\\/g, '/'), rules });
    }
    for (const e of entries) {
      if (e.isDirectory() && !SKIP_DIRS.has(e.name) && !e.name.startsWith('.git')) {
        walkDir(path.join(dir, e.name));
      }
    }
  }
  walkDir(normRoot);
  return out;
}

function parseGitignore(text) {
  const rules = [];
  for (let line of text.split(/\r?\n/)) {
    line = line.replace(/\s+$/, '');
    if (!line || line.startsWith('#')) continue;
    let isNegation = false;
    if (line.startsWith('!')) { isNegation = true; line = line.slice(1); }
    let isDirOnly = false;
    if (line.endsWith('/')) { isDirOnly = true; line = line.slice(0, -1); }
    let isAnchored = false;
    if (line.startsWith('/')) { isAnchored = true; line = line.slice(1); }
    if (!line) continue;
    rules.push({ pattern: line, isNegation, isDirOnly, isAnchored, re: globToRegex(line, isAnchored) });
  }
  return rules;
}

function globToRegex(glob, isAnchored) {
  // Convert a gitignore glob to a regex. Handles ** / * / ? and literal escaping.
  let re = '';
  for (let i = 0; i < glob.length; i++) {
    const ch = glob[i];
    const next = glob[i + 1];
    if (ch === '*' && next === '*') {
      re += '.*';
      i++;
      if (glob[i + 1] === '/') i++; // consume the slash after **
    } else if (ch === '*') {
      re += '[^/]*';
    } else if (ch === '?') {
      re += '[^/]';
    } else if ('.+()|^$[]{}\\'.includes(ch)) {
      re += '\\' + ch;
    } else if (ch === '/') {
      re += '/';
    } else {
      re += ch;
    }
  }
  // gitignore matching:
  //   anchored: must match from beginning of relative path
  //   un-anchored: matches anywhere; either the full basename or any segment
  if (isAnchored) {
    return new RegExp('^' + re + '(?:/|$)');
  }
  return new RegExp('(?:^|/)' + re + '(?:/|$)');
}

/**
 * Resolved gitignore checker. Bind to a target root + the loaded gitignores
 * and call `isIgnored(absoluteFilePath)`.
 */
export function makeChecker(root, gitignores = null) {
  const list = gitignores || loadGitignores(root);
  // Sort: shallower first, so deeper rules override
  list.sort((a, b) => a.dirRel.length - b.dirRel.length);

  return function isIgnored(absFile) {
    const absResolved = path.resolve(absFile);
    let ignored = false;

    for (const gi of list) {
      // The file must be inside this .gitignore's dir to be subject to it
      if (!absResolved.startsWith(gi.dir + path.sep) && absResolved !== gi.dir) continue;
      const relToGi = path.relative(gi.dir, absResolved).replace(/\\/g, '/');
      if (!relToGi) continue;

      for (const r of gi.rules) {
        if (r.re.test(relToGi)) {
          ignored = !r.isNegation;
        }
      }
    }
    return ignored;
  };
}
