#!/usr/bin/env node
/**
 * api_base_url_audit.js — detect API baseURL inconsistency across
 * src / tests / CI / env templates / Go backend defaults.
 *
 * Matches R2-A-9: source default says '/api', tests expect '/api/v1',
 * CI sets VITE_API_BASE_URL='/api/v1', .env.example documents '/api'.
 * Emit HIGH when the distinct-value set across these sources is > 1.
 *
 * Source coverage:
 *   - JS/TS/Vue source: `baseURL: 'X'`, `baseURL: ... || 'X'`,
 *     `axios.create({ baseURL: 'X' })`, `axios.defaults.baseURL = 'X'`
 *   - Tests: `expect(*.baseURL).toBe('X')`, `expect(*.baseURL).toEqual('X')`,
 *     plus the same baseURL: 'X' patterns
 *   - .github/workflows: `VITE_API_BASE_URL: X`, `VITE_API_BASE_URL=X`
 *   - .env.example / .env: `VITE_API_BASE_URL=X`
 *   - Go backend: `API_BASE_PATH` default in config.go
 *
 * Usage: node api_base_url_audit.js --target <path> [--out <file>]
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

function walk(dir, filterFn, acc = []) {
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return acc; }
  for (const e of entries) {
    if (SKIP_DIRS.has(e.name)) continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) walk(full, filterFn, acc);
    else if (e.isFile() && filterFn(full)) acc.push(full);
  }
  return acc;
}

const findings = [];
const nextId = makeIdAllocator();

const srcFiles = walk(TARGET, p => /\.(?:js|jsx|ts|tsx|vue|mjs|cjs)$/i.test(p) && !/[/\\](?:tests?|__tests__|spec|e2e)[/\\]/i.test(p));
const testFiles = walk(TARGET, p => /\.(?:test|spec)\.[jt]sx?$|[/\\](?:tests?|__tests__|e2e)[/\\]/i.test(p));
const ciFiles = walk(TARGET, p => /[/\\]\.github[/\\]workflows[/\\].+\.ya?ml$/i.test(p));
const envFiles = walk(TARGET, p => /(^|[/\\])\.env(\.example|\.[^/\\]+)?$/i.test(p));
const goFiles = walk(TARGET, p => /\.go$/i.test(p));

// Broad: baseURL: '...' OR baseURL: ... || '...' OR baseURL: ... ?? '...'
const BASEURL_RE   = /baseURL\s*[:=]\s*(?:[^,;\n}]*?(?:\|\||\?\?)\s*)?['"`]([^'"`]{1,200})['"`]/g;
// Test assertion: expect(*.baseURL).toBe('X') / toEqual('X') / toContain('X')
const TEST_ASSERT_RE = /\.baseURL\s*\)\s*\.to(?:Be|Equal|Contain|Match)\(\s*['"`]([^'"`]+)['"`]/g;
// CI: VITE_API_BASE_URL: '/api/v1' or = '/api/v1'
const CI_VITE_RE   = /VITE_API_BASE_URL\s*:\s*['"]?([^\s'"#]+)['"]?/g;
// env file: VITE_API_BASE_URL=/api or =/api/v1
const ENV_VITE_RE  = /^\s*VITE_API_BASE_URL\s*=\s*['"]?([^\s'"#]+)['"]?/gm;
// Go: API_BASE_PATH default in getEnv("API_BASE_PATH", "/api/v1")
const GO_API_RE    = /getEnv\w*\(\s*["']API_BASE_PATH["']\s*,\s*["']([^"']+)["']/g;

function scan(files, pattern, multiline = false) {
  const hits = [];
  for (const f of files) {
    let text;
    try { text = fs.readFileSync(f, 'utf8'); } catch { continue; }
    const re = new RegExp(pattern.source, pattern.flags);
    let m;
    while ((m = re.exec(text)) !== null) {
      const line = text.slice(0, m.index).split('\n').length;
      hits.push({ file: path.relative(TARGET, f).replace(/\\/g, '/'), line, value: m[1] });
    }
  }
  return hits;
}

const srcHits        = scan(srcFiles, BASEURL_RE);
const testAssertHits = scan(testFiles, TEST_ASSERT_RE);
const testBaseHits   = scan(testFiles, BASEURL_RE);
const ciHits         = scan(ciFiles,  CI_VITE_RE);
const envHits        = scan(envFiles, ENV_VITE_RE);
const goHits         = scan(goFiles,  GO_API_RE);

// Normalize values — strip trailing slash, ignore env-only refs like ${VAR}
function norm(v) {
  if (!v) return null;
  if (v.startsWith('${') || v.startsWith('$')) return null;
  if (v.startsWith('http://') || v.startsWith('https://')) return null; // absolute URL is a different layer
  return v.replace(/\/+$/, '');
}
function uniq(hits) {
  return [...new Set(hits.map(h => norm(h.value)).filter(Boolean))];
}

const srcValues  = uniq(srcHits);
const testValues = uniq([...testAssertHits, ...testBaseHits]);
const ciValues   = uniq(ciHits);
const envValues  = uniq(envHits);
const goValues   = uniq(goHits);

const allValues = new Set([...srcValues, ...testValues, ...ciValues, ...envValues, ...goValues]);
const sourcesPresent = [
  srcValues.length  && 'src',
  testValues.length && 'tests',
  ciValues.length   && 'ci',
  envValues.length  && 'env',
  goValues.length   && 'go',
].filter(Boolean);

// Emit if 2+ distinct values across 2+ sources
if (allValues.size > 1 && sourcesPresent.length >= 2) {
  findings.push(finding({
    id: nextId(1, 'CONF'),
    round: 1,
    severity: 'HIGH',
    category: 'CONF',
    title: `API baseURL inconsistency across ${sourcesPresent.length} sources (${[...allValues].map(v => `'${v}'`).join(' vs ')})`,
    location: { file: srcHits[0]?.file || envHits[0]?.file || null, line: srcHits[0]?.line || envHits[0]?.line || null },
    evidence: {
      tool: 'api_base_url_audit',
      distinct_values: [...allValues],
      sources_present: sourcesPresent,
      src:   srcHits,
      tests: [...testAssertHits, ...testBaseHits],
      ci:    ciHits,
      env:   envHits,
      go:    goHits,
      note: 'Operational reality: production may work because CI / deploy env overrides the source default. Tests pass green in CI because the test env sets the var. Locally without the env, tests fail and the running app uses the wrong endpoint.',
    },
    remediation: `Pick one canonical API baseURL. Set it as: (1) the source default in every file that falls back to one, (2) the test expectation, (3) the CI env var, (4) the .env.example documentation, (5) the Go backend default. Fix all 4+ locations.`,
    compliance: 'Top-priority',
    scanner: 'api_base_url_audit',
  }));
}

if (OUT) fs.writeFileSync(OUT, JSON.stringify(findings, null, 2));
else process.stdout.write(JSON.stringify(findings, null, 2) + '\n');
