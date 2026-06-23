#!/usr/bin/env node
/**
 * check-docs-sync.mjs — project-agnostic documentation drift detector.
 *
 * Auto-discovers what exists in the project and runs only the checks that
 * apply. Designed to be dropped into any project as a Claude Code skill or
 * a pre-push / CI hook.
 *
 * Checks (each runs only if its inputs exist):
 *   • Migration count       — README/CLAUDE.md "(N Total)" / "N migrations" matches files on disk
 *   • Routes ⊆ OpenAPI      — every router.METHOD('path') has a matching path: in openapi.yaml
 *   • OpenAPI orphans       — paths documented in OpenAPI but not implemented (warn)
 *   • Doc citations         — `GET /xxx` references in *.md resolve to a real route
 *   • SSE event coverage    — every .broadcast('event') is mentioned in some doc
 *   • Error code coverage   — all-caps error codes thrown in code are documented (warn)
 *   • Version banner        — README "Aligned with openapi vX.Y.Z" matches openapi info.version
 *
 * Usage:
 *   node check-docs-sync.mjs                 # run from project root
 *   node check-docs-sync.mjs --root <dir>    # run against a specific project
 *   node check-docs-sync.mjs --json          # machine-readable output
 *   node check-docs-sync.mjs --migrations-only   # cheap subset (PostToolUse hook)
 *
 * Optional config: drop `.docs-sync.json` in the project root to override
 * any of the auto-discovered paths. See `loadConfig()` for the schema.
 *
 * Zero npm dependencies. Tested against Node ≥ 18.
 */

import fs from 'node:fs';
import path from 'node:path';

// ─── CLI flags ──────────────────────────────────────────────────────────────
const argv = process.argv.slice(2);
const FLAGS = { json: false, migOnly: false, root: null };
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a === '--json') FLAGS.json = true;
  else if (a === '--migrations-only') FLAGS.migOnly = true;
  else if (a === '--root') FLAGS.root = argv[++i];
}

// ─── Project root resolution ─────────────────────────────────────────────────
function findProjectRoot(start) {
  let cur = path.resolve(start);
  for (let i = 0; i < 12; i++) {
    if (fs.existsSync(path.join(cur, 'package.json')) ||
        fs.existsSync(path.join(cur, '.git')) ||
        fs.existsSync(path.join(cur, 'pyproject.toml')) ||
        fs.existsSync(path.join(cur, 'go.mod'))) return cur;
    const parent = path.dirname(cur);
    if (parent === cur) break;
    cur = parent;
  }
  return path.resolve(start);
}
const ROOT = FLAGS.root ? path.resolve(FLAGS.root) : findProjectRoot(process.cwd());

// ─── Config: optional .docs-sync.json overrides any auto-discovered path ────
function loadConfig() {
  const p = path.join(ROOT, '.docs-sync.json');
  if (!fs.existsSync(p)) return {};
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); }
  catch (e) {
    console.error(`docs-sync: failed to parse .docs-sync.json — ${e.message}`);
    return {};
  }
}
const CFG = loadConfig();

// ─── Auto-discovery helpers ─────────────────────────────────────────────────
function firstExisting(rels) {
  for (const r of rels) {
    const abs = path.join(ROOT, r);
    if (fs.existsSync(abs)) return abs;
  }
  return null;
}
function allExisting(rels) {
  return rels.map(r => path.join(ROOT, r)).filter(p => fs.existsSync(p));
}

const README = CFG.readme
  ? path.join(ROOT, CFG.readme)
  : firstExisting(['README.md', 'README.MD', 'app/README.md', 'docs/README.md']);

const OPENAPI = CFG.openapi
  ? path.join(ROOT, CFG.openapi)
  : firstExisting([
      'openapi.yaml', 'openapi.yml',
      'server/openapi.yaml', 'server/openapi.yml',
      'api/openapi.yaml', 'docs/openapi.yaml',
      'swagger.yaml', 'swagger.yml',
    ]);

const CLAUDE_FILES = (CFG.claudeMds && CFG.claudeMds.map(r => path.join(ROOT, r)))
  || allExisting([
    'CLAUDE.md',
    'server/src/static/CLAUDE.md',
    'server/CLAUDE.md',
    'app/CLAUDE.md',
    '.claude/CLAUDE.md',
  ]);

// Migrations dir + filename pattern
function findMigrationsDir() {
  if (CFG.migrations?.dir) return path.join(ROOT, CFG.migrations.dir);
  for (const rel of ['server/migrations', 'migrations', 'db/migrations', 'db/migrate', 'sql/migrations']) {
    const abs = path.join(ROOT, rel);
    if (fs.existsSync(abs) && fs.statSync(abs).isDirectory()) return abs;
  }
  return null;
}
const MIGRATIONS = findMigrationsDir();
const MIG_PATTERN = new RegExp(CFG.migrations?.pattern || '^\\d{3}_.*\\.sql$');

// Routes dir + file pattern (Express-ish projects). Also guess the "app entry"
// for inline routes (app.ts / server.ts / index.ts).
function findRoutesDir() {
  if (CFG.routes?.dir) return path.join(ROOT, CFG.routes.dir);
  for (const rel of ['server/src/routes', 'src/routes', 'server/routes', 'app/server/src/routes']) {
    const abs = path.join(ROOT, rel);
    if (fs.existsSync(abs) && fs.statSync(abs).isDirectory()) return abs;
  }
  return null;
}
const ROUTES_DIR  = findRoutesDir();
const ROUTES_GLOB = CFG.routes?.glob || '*.routes.{ts,js,mjs}';

function findAppEntry() {
  if (CFG.appEntry) return path.join(ROOT, CFG.appEntry);
  for (const rel of [
    'server/src/app.ts', 'server/src/server.ts', 'server/src/index.ts',
    'src/app.ts', 'src/server.ts', 'src/index.ts',
    'server/app.js', 'app.js', 'server.js',
  ]) {
    const abs = path.join(ROOT, rel);
    if (fs.existsSync(abs)) return abs;
  }
  return null;
}
const APP_ENTRY = findAppEntry();

function findSrcDir() {
  if (CFG.srcDir) return path.join(ROOT, CFG.srcDir);
  for (const rel of ['server/src', 'src', 'server', 'app/server/src']) {
    const abs = path.join(ROOT, rel);
    if (fs.existsSync(abs) && fs.statSync(abs).isDirectory()) return abs;
  }
  return null;
}
const SRC_DIR = findSrcDir();

const SKIP = new Set(CFG.skip || []);

// ─── Issue collector ────────────────────────────────────────────────────────
const issues = []; // { severity, category, message, hint? }
function err(category, message, hint) {
  if (SKIP.has(category)) return;
  issues.push({ severity: 'error', category, message, hint });
}
function warn(category, message, hint) {
  if (SKIP.has(category)) return;
  issues.push({ severity: 'warn', category, message, hint });
}

// ─── Tiny YAML helpers (no js-yaml dep) ─────────────────────────────────────
// We only need two things from openapi.yaml: top-level path keys under `paths:`
// and the `info.version` value. Both are extractable with a regex over the
// raw text — robust enough for any spec that's hand-edited or generated.
function extractOpenapiPaths(text) {
  const out = new Set();
  // Find `paths:` line, then collect every line that begins with two spaces
  // and is followed by `<path>:` until a top-level key resumes.
  const pathsHdr = text.match(/^paths:\s*$/m);
  if (!pathsHdr) return out;
  const start = pathsHdr.index + pathsHdr[0].length;
  // Slice from after `paths:` to the next top-level key (zero-indent line ending in `:`)
  const rest = text.slice(start);
  const endRe = /\n([A-Za-z_][\w-]*):\s*\n/;
  const endMatch = rest.match(endRe);
  const block = endMatch ? rest.slice(0, endMatch.index) : rest;
  // Lines like `  /foo/bar:` or `  /foo/{id}:`
  for (const m of block.matchAll(/^[ \t]{2}(\/[^\s#:]+):\s*$/gm)) {
    out.add(m[1]);
  }
  return out;
}
function extractOpenapiVersion(text) {
  // Prefer the version under info: — but a top-level `version:` works too.
  const m = text.match(/^\s*version:\s*['"]?(\d+\.\d+\.\d+)/m);
  return m ? m[1] : null;
}

// ─── Filesystem helpers ─────────────────────────────────────────────────────
function listDir(dir, predicate) {
  try {
    return fs.readdirSync(dir).filter(predicate).map(f => path.join(dir, f));
  } catch { return []; }
}
function globToRe(pat) {
  // tiny glob → regex: `*.routes.{ts,js}` style
  let re = pat.replace(/\./g, '\\.').replace(/\*/g, '[^/]*');
  re = re.replace(/\{([^}]+)\}/g, (_, alts) => `(?:${alts.split(',').join('|')})`);
  return new RegExp(`^${re}$`);
}
function grepFiles(dir, pattern, fileFilter = () => true) {
  const out = [];
  if (!dir) return out;
  const stack = [dir];
  while (stack.length) {
    const cur = stack.pop();
    let entries;
    try { entries = fs.readdirSync(cur, { withFileTypes: true }); } catch { continue; }
    for (const entry of entries) {
      const p = path.join(cur, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === 'node_modules' || entry.name === 'dist' || entry.name === 'build' || entry.name.startsWith('.')) continue;
        stack.push(p);
      } else if (fileFilter(p)) {
        let text;
        try { text = fs.readFileSync(p, 'utf8'); } catch { continue; }
        for (const m of text.matchAll(pattern)) out.push({ file: p, match: m });
      }
    }
  }
  return out;
}

// =============================================================================
// CHECK 1 — Migration count consistency
// =============================================================================
function checkMigrationCount() {
  if (!MIGRATIONS) return { onDisk: null, files: [] };
  const files = listDir(MIGRATIONS, f => MIG_PATTERN.test(f)).sort();
  const onDisk = files.length;
  const docs = [README, ...CLAUDE_FILES].filter(Boolean);
  for (const docPath of docs) {
    const text = fs.readFileSync(docPath, 'utf8');
    const name = path.relative(ROOT, docPath);
    const m1 = text.match(/Migrations\s*\((\d+)\s*Total/i);
    if (m1 && Number(m1[1]) !== onDisk) {
      err('migrations.count',
          `${name} claims ${m1[1]} migrations; ${onDisk} on disk.`,
          `Update the "(N Total)" header.`);
    }
    const m2 = text.match(/idempotent\s*[—\-]\s*(\d+)\s*migrations/);
    if (m2 && Number(m2[1]) !== onDisk) {
      err('migrations.count',
          `${name} "${m2[0]}" disagrees with on-disk count ${onDisk}.`);
    }
  }
  return { onDisk, files };
}

// =============================================================================
// CHECK 2 — Express routes vs OpenAPI paths
// =============================================================================
function listRouteFiles() {
  if (!ROUTES_DIR) return [];
  const re = globToRe(ROUTES_GLOB);
  return listDir(ROUTES_DIR, f => re.test(f));
}

function parseAppMounts() {
  if (!APP_ENTRY) return {};
  const text = fs.readFileSync(APP_ENTRY, 'utf8');
  const defaultImportRe    = /import\s+(\w+)\s+from\s+['"]\.\/routes\/([^'"]+)['"]/g;
  const destructuredImportRe = /import\s+\{([^}]+)\}\s+from\s+['"]\.\/routes\/([^'"]+)['"]/g;
  const mountRe  = /(\w+)\.use\(\s*['"]([^'"]+)['"]\s*,[^)]*?(\w+(?:Routes|Router))\s*\)/g;
  const importToFile = {};
  for (const m of text.matchAll(defaultImportRe)) importToFile[m[1]] = m[2];
  for (const m of text.matchAll(destructuredImportRe)) {
    const file = m[2];
    for (const name of m[1].split(',').map(s => s.trim().replace(/\s+as\s+\w+$/, '')).filter(Boolean))
      importToFile[name] = file;
  }
  const mounts = {};
  for (const m of text.matchAll(mountRe)) {
    const prefix = m[2], importName = m[3];
    const file = importToFile[importName];
    if (!file) continue;
    (mounts[file] ||= []).push(prefix);
  }
  return mounts;
}

function parseRoutesInFile(file) {
  const text = fs.readFileSync(file, 'utf8');
  const re = /\b(?:router|app)\.(get|post|put|patch|delete)\s*\(\s*['"]([^'"]+)['"]/g;
  const out = [];
  for (const m of text.matchAll(re)) out.push({ method: m[1].toUpperCase(), relPath: m[2] });
  return out;
}

function parseInlineAppRoutes() {
  if (!APP_ENTRY) return [];
  const text = fs.readFileSync(APP_ENTRY, 'utf8');
  const out = [];
  // Match common router-variable names that are wired directly in app.ts:
  // v1Routes.get('/x'), apiRouter.post('/y'), router.get('/z').
  const re = /\b([A-Za-z_][\w]*Router|[Vv]\d+Routes|router|api)\.(get|post|put|patch|delete)\s*\(\s*['"]([^'"]+)['"]/g;
  for (const m of text.matchAll(re)) {
    out.push({ method: m[2].toUpperCase(), relPath: m[3], owner: m[1] });
  }
  return out;
}

function expressToOpenapi(p) {
  return p.replace(/:([A-Za-z_][\w]*)/g, '{$1}');
}
function joinPath(mount, rel) {
  if (rel === '/' || rel === '') return mount.replace(/\/$/, '') || '/';
  return (mount.replace(/\/$/, '') + (rel.startsWith('/') ? rel : '/' + rel)).replace(/\/{2,}/g, '/');
}

function checkRoutesVsOpenAPI() {
  if (!OPENAPI) {
    if (ROUTES_DIR || APP_ENTRY) {
      warn('openapi', 'No openapi.yaml found — skipping route coverage check.');
    }
    return { expressRoutes: [], openapiPaths: [] };
  }
  if (!ROUTES_DIR && !APP_ENTRY) {
    warn('openapi', 'No routes dir or app entry found — skipping route coverage check.');
    return { expressRoutes: [], openapiPaths: [] };
  }
  const text = fs.readFileSync(OPENAPI, 'utf8');
  const openapiPaths = extractOpenapiPaths(text);
  const mounts = parseAppMounts();
  const expressRoutes = [];

  for (const file of listRouteFiles()) {
    const fileBase = path.basename(file).replace(/\.(ts|js|mjs)$/, '');
    const prefixes = mounts[fileBase] || [''];
    for (const r of parseRoutesInFile(file)) {
      const candidates = prefixes.map(p => expressToOpenapi(joinPath(p, r.relPath)));
      expressRoutes.push({
        method: r.method, candidates,
        sourceFile: path.basename(file), relPath: r.relPath,
      });
    }
  }
  for (const r of parseInlineAppRoutes()) {
    expressRoutes.push({
      method: r.method,
      candidates: [expressToOpenapi(r.relPath)],
      sourceFile: `${path.basename(APP_ENTRY)} (inline)`,
      relPath: r.relPath,
    });
  }

  const docCovered = new Set();
  for (const r of expressRoutes) {
    const hit = r.candidates.find(c => openapiPaths.has(c));
    if (hit) docCovered.add(hit);
    else err('routes.openapi.missing',
             `${r.method} ${r.candidates[0]} (in ${r.sourceFile}) not documented in openapi.yaml`,
             r.candidates.length > 1 ? `Tried alternates: ${r.candidates.slice(1).join(', ')}` : undefined);
  }
  for (const p of openapiPaths) {
    if (docCovered.has(p)) continue;
    const matched = expressRoutes.some(r => r.candidates.includes(p));
    if (!matched) warn('routes.openapi.orphan', `openapi.yaml documents ${p} but no route implements it`);
  }
  return { expressRoutes, openapiPaths: [...openapiPaths] };
}

// =============================================================================
// CHECK 3 — README/CLAUDE.md endpoint citations resolve to real routes
// =============================================================================
function checkDocCitations(expressRoutes) {
  if (expressRoutes.length === 0) return;
  const docs = [README, ...CLAUDE_FILES].filter(Boolean);

  const valid = new Set();
  for (const r of expressRoutes) {
    for (const c of r.candidates) {
      valid.add(`${r.method} ${c}`);
      valid.add(`${r.method} ${c.replace(/^\/[a-z0-9_-]+\//, '/')}`);
    }
  }

  const re = /\b(GET|POST|PUT|PATCH|DELETE)\s+(\/[A-Za-z0-9\/_:{}\-.]+)/g;
  for (const docPath of docs) {
    const text = fs.readFileSync(docPath, 'utf8');
    const name = path.relative(ROOT, docPath);
    const seen = new Set();
    for (const m of text.matchAll(re)) {
      const key = `${m[1]} ${m[2]}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const rawPath = m[2];
      if (/^\/etc|^\/Users|^\/var|^\/tmp/.test(rawPath)) continue;
      if (/\{[a-z_]+$/.test(rawPath) && !rawPath.endsWith('}')) continue;
      if (/\/(abc|xyz|foo|bar)(\/|$)/.test(rawPath)) continue;

      const isSingleSegment = /^\/[A-Za-z0-9_-]+$/.test(rawPath);
      if (isSingleSegment) {
        const suffixHit = [...valid].some(v =>
          v.startsWith(`${m[1]} `) && v.endsWith(rawPath));
        if (suffixHit) continue;
      }

      const normalized = rawPath
        .replace(/^\/api(\/v\d+)?(?=\/)/, '')
        .replace(/:([A-Za-z_][\w]*)/g, '{$1}');
      const k = `${m[1]} ${normalized}`;
      if (!valid.has(k) && !valid.has(k.replace(/\/$/, '')) && !valid.has(k + '/')) {
        warn('citations',
             `${name} mentions ${m[1]} ${rawPath} but no matching route found`,
             `Either remove the citation, fix the typo, or implement the endpoint.`);
      }
    }
  }
}

// =============================================================================
// CHECK 4 — SSE events: broadcast call sites vs docs
// =============================================================================
function checkSSEEvents() {
  if (!SRC_DIR) return;
  const broadcasts = grepFiles(SRC_DIR,
    /\.broadcast\(\s*['"]([a-z][a-z0-9_]*)['"]/g,
    p => /\.(ts|js|mjs)$/.test(p));
  const codeEvents = new Set(broadcasts.map(b => b.match[1]));
  if (codeEvents.size === 0) return;

  const docTexts = [];
  for (const p of [README, OPENAPI, ...CLAUDE_FILES].filter(Boolean)) {
    docTexts.push({ name: path.basename(p), text: fs.readFileSync(p, 'utf8') });
  }

  for (const ev of [...codeEvents].sort()) {
    if (['connected', 'clients', 'message', 'open', 'close', 'error'].includes(ev)) continue;
    const inAny = docTexts.some(d => new RegExp(`\\b${ev}\\b`).test(d.text));
    if (!inAny) {
      err('sse.events',
          `Event '${ev}' is broadcast in code but not documented in README/openapi/CLAUDE.md`);
    }
  }
}

// =============================================================================
// CHECK 5 — Custom error codes thrown vs documented
// =============================================================================
function checkErrorCodes() {
  if (!SRC_DIR) return;
  // Look for AppError-style throws with explicit string codes:
  //   new AppError(msg, status, 'CODE')
  //   throw new SomethingError(..., 'CODE')
  const re = /new\s+\w*Error\s*\([^)]*?,\s*\d+\s*,\s*['"]([A-Z][A-Z0-9_]+)['"]/g;
  const codes = new Set();
  for (const m of grepFiles(SRC_DIR, re, p => /\.(ts|js|mjs)$/.test(p))) {
    codes.add(m.match[1]);
  }
  if (codes.size === 0) return;

  const corpus = [README, OPENAPI, ...CLAUDE_FILES]
    .filter(Boolean).map(p => fs.readFileSync(p, 'utf8')).join('\n');
  const builtIns = new Set([
    'INTERNAL_ERROR', 'UNAUTHORIZED', 'BAD_REQUEST', 'FORBIDDEN',
    'NOT_FOUND', 'VALIDATION_ERROR', 'CONFLICT', 'RATE_LIMIT_EXCEEDED',
  ]);
  for (const code of [...codes].sort()) {
    if (builtIns.has(code)) continue;
    if (!corpus.includes(code)) {
      warn('errors.undocumented',
           `Error code '${code}' is thrown but never mentioned in README/openapi/CLAUDE.md`,
           `Add the code + meaning to whichever doc the consumer reads.`);
    }
  }
}

// =============================================================================
// CHECK 6 — Version banner consistency
// =============================================================================
function checkVersionBanners() {
  if (!README || !OPENAPI) return;
  const readme = fs.readFileSync(README, 'utf8');
  const openapi = fs.readFileSync(OPENAPI, 'utf8');
  const align = readme.match(/Aligned with[^v]+v(\d+\.\d+\.\d+)/);
  const oapiV = extractOpenapiVersion(openapi);
  if (align && oapiV && align[1] !== oapiV) {
    err('version.banner',
        `README banner says openapi v${align[1]}; openapi.yaml itself is v${oapiV}.`);
  }
}

// =============================================================================
// Run
// =============================================================================
const migInfo = checkMigrationCount();
if (FLAGS.migOnly) emitAndExit();

const { expressRoutes } = checkRoutesVsOpenAPI();
checkDocCitations(expressRoutes);
checkSSEEvents();
checkErrorCodes();
checkVersionBanners();

emitAndExit();

function emitAndExit() {
  const errors = issues.filter(i => i.severity === 'error');
  const warns  = issues.filter(i => i.severity === 'warn');
  const discovered = {
    root: ROOT,
    readme:    README   ? path.relative(ROOT, README)   : null,
    openapi:   OPENAPI  ? path.relative(ROOT, OPENAPI)  : null,
    claudeMds: CLAUDE_FILES.map(p => path.relative(ROOT, p)),
    migrations: MIGRATIONS ? path.relative(ROOT, MIGRATIONS) : null,
    routesDir:  ROUTES_DIR  ? path.relative(ROOT, ROUTES_DIR)  : null,
    appEntry:   APP_ENTRY   ? path.relative(ROOT, APP_ENTRY)   : null,
  };

  if (FLAGS.json) {
    console.log(JSON.stringify({
      ok: errors.length === 0,
      errorCount: errors.length,
      warnCount: warns.length,
      summary: { migrationsOnDisk: migInfo.onDisk },
      discovered,
      issues,
    }, null, 2));
  } else {
    if (issues.length === 0) {
      console.log('docs-sync: no drift detected.');
      if (migInfo.onDisk !== null) console.log(`  ${migInfo.onDisk} migrations on disk.`);
      const found = Object.entries(discovered)
        .filter(([k, v]) => k !== 'root' && v && (!Array.isArray(v) || v.length))
        .map(([k]) => k);
      if (found.length) console.log(`  checked: ${found.join(', ')}`);
      process.exit(0);
    }
    if (errors.length) {
      console.log(`\ndocs-sync: ${errors.length} error(s):`);
      for (const i of errors) {
        console.log(`  [${i.category}] ${i.message}`);
        if (i.hint) console.log(`     -> ${i.hint}`);
      }
    }
    if (warns.length) {
      console.log(`\ndocs-sync: ${warns.length} warning(s):`);
      for (const i of warns) {
        console.log(`  [${i.category}] ${i.message}`);
      }
    }
    console.log('');
  }

  process.exit(errors.length > 0 ? 1 : 0);
}
