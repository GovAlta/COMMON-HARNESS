/**
 * File-tree suffix indexing for validating file path references.
 */

import { readdirSync, statSync } from 'node:fs';
import path from 'node:path';

const _WALK_SKIP_DIRS = new Set([
    '.git', 'node_modules', '__pycache__', '.venv', 'venv',
    '.next', 'dist', 'build', '.nuxt', '.output', 'coverage',
]);

/**
 * Walk targetPath and return a Set containing every suffix of every
 * relative file path.
 *
 * For a file at `apps/web/src/components/AppFooter.vue` the set will
 * contain:
 *   apps/web/src/components/AppFooter.vue
 *   web/src/components/AppFooter.vue
 *   src/components/AppFooter.vue
 *   components/AppFooter.vue
 *   AppFooter.vue
 *
 * This lets us match regardless of whether the agent used a full path,
 * a partial path, or just the basename.
 *
 * @param {string} targetPath
 * @returns {Set<string>}
 */
export function build_suffix_index(targetPath) {
    const suffixes = new Set();

    function walk(dir) {
        let entries;
        try {
            entries = readdirSync(dir, { withFileTypes: true });
        } catch {
            return;
        }
        for (const entry of entries) {
            if (entry.isDirectory()) {
                if (!_WALK_SKIP_DIRS.has(entry.name)) {
                    walk(path.join(dir, entry.name));
                }
            } else if (entry.isFile()) {
                const rel = path.relative(targetPath, path.join(dir, entry.name)).replace(/\\/g, '/');
                const parts = rel.split('/');
                for (let i = 0; i < parts.length; i++) {
                    suffixes.add(parts.slice(i).join('/'));
                }
            }
        }
    }

    walk(targetPath);
    return suffixes;
}

/**
 * Check whether refPath matches any file in the suffix index.
 * @param {string} refPath
 * @param {Set<string>} suffixIndex
 * @returns {boolean}
 */
export function path_in_index(refPath, suffixIndex) {
    const normalized = refPath.replace(/\\/g, '/');
    return suffixIndex.has(normalized);
}
