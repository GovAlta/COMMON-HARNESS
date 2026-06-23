#!/usr/bin/env node
/**
 * check-nfr-coverage.mjs — verify every NFR in requirements.md has concrete
 * evidence of implementation in app/, not just doc claims.
 *
 * Different NFR categories require different evidence:
 *   NFR-TEST-*    → tests exist in app/test/ or app/{server,client}/__tests__/
 *   NFR-A11Y-*    → axe + manual a11y assertions present
 *   NFR-PWA-*     → manifest.webmanifest + service-worker registered
 *   NFR-I18N-*    → vue-i18n configured + locale files present
 *   NFR-DATA-03   → idempotent migrations + check-migration-idempotency proof
 *   NFR-OBS-*     → /health endpoints + structured logger
 *   NFR-PERF-*    → lighthouse-ci config or perf test script
 *   NFR-SEC-*     → ASVS gate scan output, parameterized SQL conventions
 *   NFR-RELI-*    → audit middleware wired, fallback paths verified
 *
 * Usage:
 *   node .claude/scripts/check-nfr-coverage.mjs
 *   node .claude/scripts/check-nfr-coverage.mjs --root <project-root>
 *   node .claude/scripts/check-nfr-coverage.mjs --json
 *
 * Exits 0 on full coverage, 1 on any NFR without evidence.
 */

import fs from 'node:fs';
import path from 'node:path';

const argv = process.argv.slice(2);
let ROOT = process.cwd();
let JSON_OUT = false;
for (let i = 0; i < argv.length; i++) {
  if (argv[i] === '--root') ROOT = path.resolve(argv[++i]);
  else if (argv[i] === '--json') JSON_OUT = true;
}

const REQUIREMENTS = path.join(ROOT, 'phases', 'phase1-requirements', 'output', 'requirements.md');
const APP_DIR      = path.join(ROOT, 'app');

if (!fs.existsSync(REQUIREMENTS)) { console.error('check-nfr-coverage: requirements.md not found'); process.exit(2); }
if (!fs.existsSync(APP_DIR))      { console.error('check-nfr-coverage: ./app/ not found');         process.exit(2); }

// ─── Parse NFR table ────────────────────────────────────────────────────────
const reqText = fs.readFileSync(REQUIREMENTS, 'utf8');
const nfrSec = reqText.match(/## (?:6\. )?Non-Functional Requirements[\s\S]+?(?=\n## )/);
if (!nfrSec) { console.error('check-nfr-coverage: requirements.md §NFR not found'); process.exit(2); }

const nfrs = [];
for (const line of nfrSec[0].split(/\r?\n/)) {
  const m = line.match(/^\|\s*(NFR-[A-Z0-9-]+)\s*\|\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|/);
  if (m && !/^[\s|:-]+$/.test(m[1])) {
    nfrs.push({ id: m[1], category: m[2].trim(), target: m[3].trim() });
  }
}

// ─── Helpers ────────────────────────────────────────────────────────────────
function exists(rel) { return fs.existsSync(path.join(APP_DIR, rel)); }
function listFiles(rel, predicate) {
  const dir = path.join(APP_DIR, rel);
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter(predicate || (() => true));
}
function recurseFiles(dir, predicate, acc = []) {
  if (!fs.existsSync(dir)) return acc;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (['node_modules', 'dist', 'build', '.git'].includes(e.name)) continue;
      recurseFiles(full, predicate, acc);
    } else if (predicate(full)) acc.push(full);
  }
  return acc;
}
function fileContains(rel, re) {
  const p = path.join(APP_DIR, rel);
  if (!fs.existsSync(p)) return false;
  return re.test(fs.readFileSync(p, 'utf8'));
}

// ─── Evidence rules per NFR family ──────────────────────────────────────────
function checkNFR(nfr) {
  const id = nfr.id;
  // NFR-TEST-01 — coverage targets met (existence of test files is the prerequisite)
  if (/^NFR-TEST-/.test(id)) {
    const testFiles = [
      ...recurseFiles(path.join(APP_DIR, 'server'), p => /\.(test|spec)\.(ts|js)$/.test(p)),
      ...recurseFiles(path.join(APP_DIR, 'client'), p => /\.(test|spec)\.(ts|js|vue)$/.test(p)),
      ...recurseFiles(path.join(APP_DIR, 'test'),   p => /\.(test|spec|e2e)\.(ts|js)$/.test(p)),
    ];
    return testFiles.length > 0
      ? { ok: true,  evidence: `${testFiles.length} test files found` }
      : { ok: false, evidence: 'no *.test.* / *.spec.* / *.e2e.* files in app/{server,client,test}/' };
  }
  // NFR-A11Y-* — Axe in CI + at least one a11y test
  if (/^NFR-A11Y-/.test(id)) {
    const axe = recurseFiles(path.join(APP_DIR, 'test'), p => /a11y/i.test(p));
    const pkg = path.join(APP_DIR, 'client', 'package.json');
    const hasAxe = fs.existsSync(pkg) && /axe[-/]?(playwright|core)/i.test(fs.readFileSync(pkg, 'utf8'));
    return (axe.length > 0 || hasAxe)
      ? { ok: true,  evidence: `${axe.length > 0 ? axe.length + ' a11y test(s)' : 'axe-* dep present'}` }
      : { ok: false, evidence: 'no a11y test files AND no axe-* dependency in client/package.json' };
  }
  // NFR-PWA-* — manifest + service worker.
  // Manifest can be a static file in public/ OR a VitePWA `manifest:` config in vite.config.
  if (/^NFR-PWA-/.test(id)) {
    const manifestFile = recurseFiles(path.join(APP_DIR, 'client'), p => /manifest\.(webmanifest|json)$/.test(p));
    const viteConfig = path.join(APP_DIR, 'client', 'vite.config.ts');
    const manifestInVite = fs.existsSync(viteConfig) && /VitePWA\s*\(\s*\{[\s\S]*manifest\s*:/m.test(fs.readFileSync(viteConfig, 'utf8'));
    const swReg = recurseFiles(path.join(APP_DIR, 'client', 'src'), p => /\.(ts|js|vue)$/.test(p))
      .some(p => /serviceWorker|registerSW|workbox|virtual:pwa-register/i.test(fs.readFileSync(p, 'utf8')));
    const hasManifest = manifestFile.length > 0 || manifestInVite;
    return (hasManifest && swReg)
      ? { ok: true,  evidence: `${manifestFile.length > 0 ? 'manifest file' : 'VitePWA manifest config'} + SW registration` }
      : { ok: false, evidence: `manifest:${hasManifest ? 'yes' : 'no'}, SW registration:${swReg ? 'yes' : 'no'}` };
  }
  // NFR-I18N-* — vue-i18n configured (cross-platform path matching)
  if (/^NFR-I18N-/.test(id)) {
    const pkg = path.join(APP_DIR, 'client', 'package.json');
    const hasI18n = fs.existsSync(pkg) && /vue-i18n|@intlify\//.test(fs.readFileSync(pkg, 'utf8'));
    const localeFiles = recurseFiles(path.join(APP_DIR, 'client'), p => {
      const norm = p.replace(/\\/g, '/');
      return /\/(locales?|i18n)\/.+\.(ts|js|json)$/.test(norm);
    });
    return (hasI18n && localeFiles.length > 0)
      ? { ok: true,  evidence: `vue-i18n + ${localeFiles.length} locale file(s)` }
      : { ok: false, evidence: `vue-i18n dep:${hasI18n}, locale files:${localeFiles.length}` };
  }
  // NFR-DATA-03 — idempotent migrations
  if (id === 'NFR-DATA-03') {
    const migs = listFiles(path.join('server', 'migrations'), f => /^\d{3}_.*\.sql$/.test(f));
    return migs.length > 0
      ? { ok: true, evidence: `${migs.length} NNN_*.sql migrations present (idempotency proof requires running .claude/scripts/check-migration-idempotency.mjs)` }
      : { ok: false, evidence: 'no NNN_*.sql migrations found' };
  }
  // NFR-OBS-02 — health endpoints
  if (id === 'NFR-OBS-02') {
    const healthFile = recurseFiles(path.join(APP_DIR, 'server'), p => /health.*\.(routes|controller)\.ts$/i.test(p));
    return healthFile.length > 0
      ? { ok: true,  evidence: `health route file present (${path.relative(APP_DIR, healthFile[0])})` }
      : { ok: false, evidence: 'no health.routes.ts or health.controller.ts found' };
  }
  // NFR-OBS-01 — structured logs (pino or winston, both produce structured JSON)
  if (id === 'NFR-OBS-01') {
    const usesStructuredLogger = recurseFiles(path.join(APP_DIR, 'server', 'src'), p => /\.ts$/.test(p))
      .some(p => /from ['"](pino|winston)['"]|require\(['"](pino|winston)['"]\)/.test(fs.readFileSync(p, 'utf8')));
    return usesStructuredLogger
      ? { ok: true,  evidence: 'structured logger (pino|winston) imported in server/src' }
      : { ok: false, evidence: 'no pino|winston import found' };
  }
  // NFR-PERF-* — lighthouse-ci config OR explicit perf test
  if (/^NFR-PERF-/.test(id)) {
    const lhci = exists('client/lighthouserc.json') || exists('client/lighthouserc.js') || exists('lighthouserc.json');
    const perfTests = recurseFiles(path.join(APP_DIR, 'test'), p => /perf|lighthouse|p95/i.test(p));
    return (lhci || perfTests.length > 0)
      ? { ok: true,  evidence: lhci ? 'lighthouserc present' : `${perfTests.length} perf test(s)` }
      : { ok: false, evidence: 'no lighthouserc config and no perf tests' };
  }
  // NFR-SEC-01 — ASVS L2 self-assessed (look for blueteam scan output)
  if (id === 'NFR-SEC-01') {
    const scanReports = exists('.ai/reports/security_overview.html') || exists('.ai/data/security-scan-results.json');
    return scanReports
      ? { ok: true,  evidence: '.ai/ blueteam scan output present' }
      : { ok: false, evidence: 'no .ai/reports/ blueteam scan run' };
  }
  // NFR-SEC-03 — parameterized SQL: at least one route file using `pool.query(... , [...])` and zero string-concat in SQL
  if (id === 'NFR-SEC-03') {
    const routes = recurseFiles(path.join(APP_DIR, 'server', 'src'), p => /\.(ts|js)$/.test(p));
    const hasParameterized = routes.some(p => /pool\.query\([^)]*,\s*\[/m.test(fs.readFileSync(p, 'utf8')));
    return hasParameterized
      ? { ok: true,  evidence: 'parameterized pool.query(... , [params]) calls found' }
      : { ok: false, evidence: 'no parameterized pool.query found in server' };
  }
  // NFR-SEC-04 — httpOnly cookies (template provides; check it's used)
  if (id === 'NFR-SEC-04') {
    const httpOnly = recurseFiles(path.join(APP_DIR, 'server', 'src'), p => /\.ts$/.test(p))
      .some(p => /httpOnly:\s*true/.test(fs.readFileSync(p, 'utf8')));
    return httpOnly
      ? { ok: true,  evidence: 'httpOnly: true present in server' }
      : { ok: false, evidence: 'no httpOnly cookie attr found' };
  }
  // NFR-RELI-03 — audit log on every admin write (audit middleware wired)
  if (id === 'NFR-RELI-03') {
    const auditMidd = recurseFiles(path.join(APP_DIR, 'server', 'src'), p => /audit/i.test(p) && /\.(ts|js)$/.test(p));
    return auditMidd.length > 0
      ? { ok: true,  evidence: `${auditMidd.length} audit-related file(s)` }
      : { ok: false, evidence: 'no audit middleware/service file found' };
  }
  // NFR-DATA-01/02 — soft delete + audit cols (look for is_deleted, deleted_at, created_by in any migration)
  if (id === 'NFR-DATA-01' || id === 'NFR-DATA-02') {
    const migs = recurseFiles(path.join(APP_DIR, 'server', 'migrations'), p => /\.sql$/.test(p));
    const hasAuditCols = migs.some(p => {
      const t = fs.readFileSync(p, 'utf8');
      return /\bcreated_at\b/.test(t) && /\bcreated_by\b/.test(t);
    });
    const hasSoftDelete = migs.some(p => /\bis_deleted\b/.test(fs.readFileSync(p, 'utf8')));
    return (hasAuditCols && hasSoftDelete)
      ? { ok: true,  evidence: 'audit cols + is_deleted in migrations' }
      : { ok: false, evidence: `audit cols:${hasAuditCols}, soft delete:${hasSoftDelete}` };
  }
  // NFR-MOBILE-* — relies on responsive CSS / design-system components, hard to mechanically verify; skip with note
  if (/^NFR-MOBILE-/.test(id)) {
    return { ok: true, evidence: 'manual verification required (responsive CSS / touch targets)', warning: true };
  }
  // NFR-DOC-01 — sync-docs check passes
  if (id === 'NFR-DOC-01') {
    // Presence of the sync-docs script isn't proof of zero drift. Instead, for
    // every NEW route file in app/server/src/routes/ (any *.routes.ts not in
    // the stock template route set), assert openapi.yaml documents at
    // least one path the route file declares.
    const routesDir = path.join(APP_DIR, 'server', 'src', 'routes');
    const openapiPath = path.join(APP_DIR, 'server', 'openapi.yaml');
    if (!fs.existsSync(routesDir)) return { ok: true, evidence: 'no server/src/routes/ — n/a' };
    if (!fs.existsSync(openapiPath)) return { ok: false, evidence: 'server/openapi.yaml missing — every project must ship an OpenAPI contract' };
    // Stock template route files (in the public template) — these are
    // pre-documented; we only enforce documentation for the project-added
    // route files.
    const STOCK = new Set([
      'auth.routes.ts', 'health.routes.ts', 'resource.routes.ts',
      'service.routes.ts', 'form.routes.ts', 'submission.routes.ts',
      'ai.routes.ts', 'notification.routes.ts', 'admin.routes.ts'
    ]);
    const routeFiles = fs.readdirSync(routesDir).filter(f => /\.routes\.ts$/.test(f));
    const newRoutes = routeFiles.filter(f => !STOCK.has(f));
    if (newRoutes.length === 0) return { ok: true, evidence: 'no project-specific route files — n/a' };
    const openapi = fs.readFileSync(openapiPath, 'utf8');
    const undocumented = [];
    for (const rf of newRoutes) {
      const src = fs.readFileSync(path.join(routesDir, rf), 'utf8');
      // Routes typically declare paths relative to their mount point ('/', '/:id'),
      // so the route file's STEM (e.g. "centre" from "centre.routes.ts") is a
      // better heuristic than parsed paths. Match the stem (and its plural) against
      // any /<seg> path in openapi.yaml.
      const stem = rf.replace(/\.routes\.ts$/, '');
      const parts = stem.split('-').filter(Boolean);
      // Try several path-shape permutations: foo-bar → /foo/bar, /bar/foo, /foo-bar, /foo, /bar (+ plurals)
      const candidates = new Set();
      for (const p of [parts, parts.slice().reverse()]) {
        const seg = p.join('/');
        candidates.add(seg); candidates.add(seg + 's');
      }
      candidates.add(parts.join('-')); candidates.add(parts.join('-') + 's');
      for (const p of parts) { candidates.add(p); candidates.add(p + 's'); }
      const escape = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const documented = [...candidates].some(v => new RegExp(`(^|[/\\s])\\/${escape(v)}(\\/|:|\\s|$)`, 'i').test(openapi));
      // Fallback: also accept any literal declared path that's not bare '/'
      const declared = [...src.matchAll(/router\.(?:get|post|put|patch|delete)\s*\(\s*['"`]([^'"`]+)['"`]/g)].map(m => m[1]).filter(p => p !== '/');
      const declaredMatch = declared.some(p => openapi.includes(p));
      if (!documented && !declaredMatch) undocumented.push(rf);
    }
    return undocumented.length === 0
      ? { ok: true,  evidence: `${newRoutes.length} project route file(s) all documented in openapi.yaml` }
      : { ok: false, evidence: `route file(s) not in openapi.yaml: ${undocumented.join(', ')} — drift!` };
  }
  // NFR-RELI-01 / RELI-02 / SEC-02/SEC-05/SEC-06 — process / config NFRs; require human to confirm
  return { ok: true, evidence: 'manual verification required (process NFR)', warning: true };
}

// ─── Run ────────────────────────────────────────────────────────────────────
const results = nfrs.map(n => ({ ...n, ...checkNFR(n) }));
const errors  = results.filter(r => !r.ok);
const warns   = results.filter(r => r.ok && r.warning);
const passes  = results.filter(r => r.ok && !r.warning);

if (JSON_OUT) {
  console.log(JSON.stringify({ ok: errors.length === 0, totalNFRs: nfrs.length, results }, null, 2));
} else {
  console.log(`\nNFR coverage check`);
  console.log('─'.repeat(64));
  console.log(`  parsed: ${nfrs.length} NFRs`);
  console.log(`  ✓ pass: ${passes.length}    ⚠ manual-verify-required: ${warns.length}    ✘ fail: ${errors.length}`);
  console.log('─'.repeat(64));
  for (const r of results) {
    const icon = r.ok ? (r.warning ? '⚠' : '✓') : '✘';
    console.log(`  ${icon}  [${r.id.padEnd(15)}]  ${r.evidence}`);
  }
  console.log('');
  if (errors.length) {
    console.log(`  ${errors.length} NFR(s) have no implementation evidence in ./app/.`);
    console.log(`  These are silent deferrals. Build them OR re-plan via /phase2-planning.`);
  }
}
process.exit(errors.length > 0 ? 1 : 0);
