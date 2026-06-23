/**
 * Markdown and text parsing utilities for evaluation.
 */

// -- File path extension whitelist -------------------------------------------

const _KNOWN_SRC_EXTENSIONS = new Set([
    'ts', 'js', 'tsx', 'jsx', 'mjs', 'cjs', 'py', 'go', 'java', 'rb', 'rs',
    'c', 'cpp', 'h', 'hpp', 'cs', 'php', 'vue', 'svelte', 'html', 'css',
    'scss', 'less', 'sass', 'json', 'yaml', 'yml', 'toml', 'xml', 'ini',
    'cfg', 'conf', 'md', 'txt', 'sql', 'graphql', 'gql', 'proto', 'sh',
    'bash', 'zsh', 'env', 'lock', 'prisma', 'mod', 'sum', 'gradle',
    'properties', 'csproj', 'sln', 'swift', 'kt', 'kts', 'dart', 'lua',
    'ex', 'exs', 'erl', 'hrl', 'hs', 'elm',
]);

/**
 * Heuristic: does this string look like a file path?
 * @param {string} s
 * @returns {boolean}
 */
function _looksLikeFilepath(s) {
    if (s.startsWith('http://') || s.startsWith('https://') || s.startsWith('//') || s.startsWith('mailto:')) {
        return false;
    }
    if (s.includes(' ')) {
        return false;
    }
    const extMatch = s.match(/\.(\w{1,10})$/);
    if (!extMatch) {
        return false;
    }
    const ext = extMatch[1].toLowerCase();

    // Paths with a directory separator are always file paths
    if (s.includes('/') || s.includes('\\')) {
        return true;
    }

    // No-slash paths: accept only when the final extension is a known
    // source/config file type.
    return _KNOWN_SRC_EXTENSIONS.has(ext);
}

// -- Section parsing ---------------------------------------------------------

/**
 * Split markdown into sections keyed by normalised heading text.
 *
 * Hierarchy-aware: a `##` heading's body includes all `###`
 * sub-sections until the next `##` (or `#`) heading.
 *
 * @param {string} content - Raw markdown text.
 * @param {Object<string, string[]>} expectedSections - Mapping of `{section_key: [heading_keywords]}`
 * @returns {[Object<string, string>, Object<string, string>]} [mapped_sections, raw_sections]
 */
export function parse_sections(content, expectedSections) {
    // Find fenced code block ranges so we can skip headings inside them.
    const fenceRanges = [];
    let inFence = false;
    const fenceRe = /^(`{3,}|~{3,})[^\n]*$/gm;
    let fm;
    while ((fm = fenceRe.exec(content)) !== null) {
        if (!inFence) {
            fenceRanges.push([fm.index, -1]);
            inFence = true;
        } else {
            fenceRanges[fenceRanges.length - 1][1] = fm.index + fm[0].length;
            inFence = false;
        }
    }
    // If an unclosed fence remains, extend it to end of content
    if (fenceRanges.length > 0 && fenceRanges[fenceRanges.length - 1][1] === -1) {
        fenceRanges[fenceRanges.length - 1][1] = content.length;
    }

    function insideFence(pos) {
        return fenceRanges.some(([start, end]) => pos >= start && pos <= end);
    }

    const headingRe = /^(#{1,3})\s+(.+)$/gm;
    const matches = [];
    let hm;
    while ((hm = headingRe.exec(content)) !== null) {
        if (!insideFence(hm.index)) {
            matches.push({
                index: hm.index,
                end: hm.index + hm[0].length,
                level: hm[1].length,
                heading: hm[2].trim(),
            });
        }
    }

    // raw_sections: every heading -> immediate body (until any next heading)
    const rawSections = {};
    for (let i = 0; i < matches.length; i++) {
        const heading = matches[i].heading;
        const start = matches[i].end;
        const end = (i + 1 < matches.length) ? matches[i + 1].index : content.length;
        rawSections[heading] = content.slice(start, end).trim();
    }

    // aggregated: top-level headings (# or ##) -> all content *including*
    // sub-headings (###) until the next heading at the same or higher level.
    const aggregated = {};
    for (let i = 0; i < matches.length; i++) {
        const level = matches[i].level;
        if (level > 2) continue; // skip sub-headings; folded into parent
        const heading = matches[i].heading;
        const start = matches[i].end;
        let end = content.length;
        for (let j = i + 1; j < matches.length; j++) {
            if (matches[j].level <= level) {
                end = matches[j].index;
                break;
            }
        }
        aggregated[heading] = content.slice(start, end).trim();
    }

    // Map aggregated sections -> expected section keys
    const mapped = {};
    for (const [key, keywords] of Object.entries(expectedSections)) {
        for (const [heading, body] of Object.entries(aggregated)) {
            if (keywords.some(kw => heading.toLowerCase().includes(kw))) {
                mapped[key] = body;
                break;
            }
        }
    }

    return [mapped, rawSections];
}

// -- Text extraction helpers -------------------------------------------------

/**
 * Extract file-path references from markdown text.
 * @param {string} text
 * @returns {Set<string>}
 */
export function extract_file_paths(text) {
    const paths = new Set();

    // Backticked paths  e.g.  `src/middleware/auth.ts`  or `config.yaml:42`
    const backtickRe = /`([^`\n]{3,120})`/g;
    let m;
    while ((m = backtickRe.exec(text)) !== null) {
        const candidate = m[1].trim();
        const base = candidate.replace(/:\d+$/, '');
        if (_looksLikeFilepath(base)) {
            paths.add(base);
        }
    }

    // Bare paths containing / and a dotted extension
    const bareRe = /(?:^|[\s,|])([a-zA-Z][\w./-]{2,100}\.\w{1,10})(?::(\d+))?(?=[\s,|)]|$)/gm;
    while ((m = bareRe.exec(text)) !== null) {
        const candidate = m[1];
        if (candidate.includes('/') && _looksLikeFilepath(candidate)) {
            paths.add(candidate);
        }
    }

    return paths;
}

/**
 * Extract (HTTP_METHOD, route) pairs from text.
 * @param {string} text
 * @returns {Array<[string, string]>}
 */
export function extract_endpoints(text) {
    const seen = new Set();
    const results = [];

    // Explicit METHOD /route
    const methodRe = /\b(GET|POST|PUT|DELETE|PATCH|OPTIONS|HEAD)\s+[`"']*(\/([\w/{}\-:.?&=*[\]]+))/gi;
    let m;
    while ((m = methodRe.exec(text)) !== null) {
        const method = m[1].toUpperCase();
        const route = m[2].replace(/[`"']+$/, '');
        const key = `${method} ${route}`;
        if (!seen.has(key)) {
            seen.add(key);
            results.push([method, route]);
        }
    }

    // Route-only (backticked /api/... without explicit method)
    const routeRe = /`(\/(?:api|v\d|auth|admin|webhook|health)[\w/{}\-:.?&=*]*)`/g;
    while ((m = routeRe.exec(text)) !== null) {
        const key = `ANY ${m[1]}`;
        if (!seen.has(key)) {
            seen.add(key);
            results.push(['ANY', m[1]]);
        }
    }

    return results;
}

/**
 * Case-insensitive count of how many terms appear at least once in text.
 * @param {string} text
 * @param {string[]|Set<string>} terms
 * @returns {number}
 */
export function count_term_hits(text, terms) {
    const lower = text.toLowerCase();
    let count = 0;
    for (const t of terms) {
        if (lower.includes(t.toLowerCase())) {
            count++;
        }
    }
    return count;
}
