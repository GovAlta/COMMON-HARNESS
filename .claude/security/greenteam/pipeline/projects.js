/**
 * projects.js — multi-project detection.
 *
 * Walks the target tree and returns a list of project roots — directories
 * that own a package.json, go.mod, tsconfig.json, vitest.config.*, or
 * .eslintrc.*. Used by scanners that must run from a project root
 * (vitest, vue-tsc, madge, eslint, govulncheck) so a target with nested
 * sub-projects (e.g. frontend/, backend-go/, plus the root) is handled
 * correctly.
 *
 * Each project entry: { root, kinds: ['node'|'go'|'ts'|'vitest'|'eslint'|...], name }
 */

import fs from 'node:fs';
import path from 'node:path';

const SKIP_DIRS = new Set([
  'node_modules', '.git', 'dist', 'build', 'coverage',
  '.next', '.nuxt', '.cache', '.svelte-kit', 'vendor', '_archive', 'bin',
]);

const MARKERS = [
  { file: 'package.json',   kind: 'node' },
  { file: 'go.mod',         kind: 'go' },
  { file: 'tsconfig.json',  kind: 'ts' },
  { file: 'vitest.config.js',  kind: 'vitest' },
  { file: 'vitest.config.ts',  kind: 'vitest' },
  { file: 'vitest.config.mjs', kind: 'vitest' },
  { file: 'vite.config.js',    kind: 'vite' },
  { file: 'vite.config.ts',    kind: 'vite' },
  { file: 'vite.config.mjs',   kind: 'vite' },
  { file: '.eslintrc.js',     kind: 'eslint' },
  { file: '.eslintrc.json',   kind: 'eslint' },
  { file: '.eslintrc.cjs',    kind: 'eslint' },
  { file: 'eslint.config.js', kind: 'eslint' },
  { file: 'eslint.config.mjs',kind: 'eslint' },
  { file: 'eslint.config.cjs',kind: 'eslint' },
];

/**
 * Detect every project root under `target`, up to maxDepth levels.
 * Returns an array, deduplicated by root.
 */
export function detectProjects(target, { maxDepth = 5 } = {}) {
  const projects = new Map(); // root -> { root, kinds: Set, name }
  const root = path.resolve(target);

  function visit(dir, depth) {
    if (depth > maxDepth) return;
    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }

    for (const m of MARKERS) {
      if (entries.some(e => e.isFile() && e.name === m.file)) {
        let entry = projects.get(dir);
        if (!entry) {
          entry = { root: dir, kinds: new Set(), name: path.relative(root, dir) || '.' };
          projects.set(dir, entry);
        }
        entry.kinds.add(m.kind);
      }
    }

    for (const e of entries) {
      if (!e.isDirectory()) continue;
      if (SKIP_DIRS.has(e.name)) continue;
      if (e.name.startsWith('.')) continue;
      visit(path.join(dir, e.name), depth + 1);
    }
  }
  visit(root, 0);

  return [...projects.values()].map(p => ({
    ...p,
    kinds: [...p.kinds],
  }));
}

/**
 * Convenience: list projects of a specific kind.
 *   projectsOfKind(target, 'vitest')  → projects with a vitest config
 *   projectsOfKind(target, 'go')      → projects with go.mod
 */
export function projectsOfKind(target, kind, opts = {}) {
  return detectProjects(target, opts).filter(p => p.kinds.includes(kind));
}

/**
 * Convenience: list every node project (has package.json).
 */
export function nodeProjects(target, opts = {}) {
  return projectsOfKind(target, 'node', opts);
}
