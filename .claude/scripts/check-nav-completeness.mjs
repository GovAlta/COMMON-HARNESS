#!/usr/bin/env node
/**
 * check-nav-completeness.mjs — catch orphan-page bugs.
 *
 * A page that exists in the router but is not reachable from `/` via visible
 * nav links is invisible to users. Canonical failure: a route is registered,
 * the page works when visited directly via its URL, but no link exists in
 * DefaultLayout's desktop or mobile nav and no CTA appears on the landing page.
 *
 * What it checks:
 *   - Parses app/client/src/router/(index|router).ts to enumerate routes
 *   - Filters to public, non-parameterized, non-excluded routes
 *   - Among those, picks "in-scope" routes — components that cite at least
 *     one FR-NNN ID (i.e., the route implements a documented requirement)
 *   - Walks DefaultLayout.vue, PublicLayout.vue, App.vue, and the landing
 *     page (LandingPage.vue / HomePage.vue / HomeView.vue) for `to=` and
 *     `href=` attributes pointing at internal paths
 *   - Fails if any in-scope route is not reachable within 2 clicks of `/`
 *     (direct nav link OR parent path is in nav)
 *
 * Why "FR-cited components" only? Plenty of routes are intentionally not in
 * the primary nav (auth callbacks, design-system reference, 404s). Those
 * don't implement an FR. By filtering to FR-cited components we focus on
 * the routes that promise a user-facing feature.
 *
 * Usage:
 *   node .claude/scripts/check-nav-completeness.mjs
 *   node .claude/scripts/check-nav-completeness.mjs --root <project-root>
 *   node .claude/scripts/check-nav-completeness.mjs --json
 *
 * Exits 0 if no orphans, 1 on orphans, 2 on missing inputs.
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

const APP    = path.join(ROOT, 'app');
const CLIENT = path.join(APP, 'client', 'src');
if (!fs.existsSync(CLIENT)) {
  console.error('check-nav-completeness: app/client/src not found. Pass --root <project-root> or run from a project with /build done.');
  process.exit(2);
}

// ─── 1. Parse vue-router routes ─────────────────────────────────────────────
const routerCandidates = [
  path.join(CLIENT, 'router', 'index.ts'),
  path.join(CLIENT, 'router.ts'),
  path.join(CLIENT, 'router', 'index.js'),
];
const routerFile = routerCandidates.find(p => fs.existsSync(p));
if (!routerFile) {
  console.error('check-nav-completeness: vue-router config not found at app/client/src/router/index.ts.');
  process.exit(2);
}
const routerSrc = fs.readFileSync(routerFile, 'utf8');

const routes = [];
const lines = routerSrc.split(/\r?\n/);
for (let i = 0; i < lines.length; i++) {
  const m = lines[i].match(/^\s*path:\s*['"]([^'"]+)['"]/);
  if (!m) continue;
  const block = lines.slice(i, i + 20).join('\n');
  routes.push({
    path: m[1],
    name: (block.match(/name:\s*['"]([^'"]+)['"]/) || [])[1] || null,
    component: (block.match(/component:[^,]*?import\s*\(\s*['"]([^'"]+)['"]/s) || [])[1] || null,
    requiresAuth:  /requiresAuth:\s*true/.test(block),
    requiresAdmin: /requiresAdmin:\s*true/.test(block),
    guestOnly:     /guestOnly:\s*true/.test(block),
  });
}

if (routes.length === 0) {
  console.error('check-nav-completeness: parsed 0 routes from router. Check the file format (script expects `path:` on a single line followed by name/component within ~20 lines).');
  process.exit(2);
}

// ─── 2. Collect nav links from layouts + landing pages ──────────────────────
const navFileCandidates = [
  path.join(CLIENT, 'layouts', 'DefaultLayout.vue'),
  path.join(CLIENT, 'layouts', 'PublicLayout.vue'),
  path.join(CLIENT, 'App.vue'),
  path.join(CLIENT, 'pages', 'public', 'LandingPage.vue'),
  path.join(CLIENT, 'pages', 'public', 'HomePage.vue'),
  path.join(CLIENT, 'pages', 'HomePage.vue'),
  path.join(CLIENT, 'views', 'HomeView.vue'),
];
const navFiles = navFileCandidates.filter(p => fs.existsSync(p));

const navLinks = new Set();
for (const f of navFiles) {
  const src = fs.readFileSync(f, 'utf8');
  // Match `to="/path"`, `href="/path"`, `to: '/path'`. Internal paths only.
  const linkRe = /(?:\bto\b\s*=\s*|\bhref\s*=\s*|\bto\s*:\s*)['"]([^'"]+)['"]/g;
  let lm;
  while ((lm = linkRe.exec(src)) !== null) {
    const href = lm[1];
    if (href.startsWith('/') && !href.startsWith('//') && !href.startsWith('/#')) {
      navLinks.add(href.split('?')[0].split('#')[0]);
    }
  }
}

// ─── 3. Filter to public, in-scope (FR-cited) routes ────────────────────────
const EXCLUDE_PATHS = new Set([
  '/', '/login', '/logout',
  '/auth/callback', '/sso-callback',
  '/:pathMatch(.*)*', '/404', '/not-found',
  '/design', // design-system reference, intentionally unlisted
]);

function readFile(p) { try { return fs.readFileSync(p, 'utf8'); } catch { return ''; } }

const inScope = [];
for (const r of routes) {
  if (r.requiresAuth || r.requiresAdmin || r.guestOnly) continue;
  if (EXCLUDE_PATHS.has(r.path)) continue;
  if (r.path.includes(':')) continue; // detail routes reached from list
  if (!r.component) continue;
  // Resolve `@/` import alias to CLIENT
  const rel = r.component.replace(/^@\//, '');
  const compFile = path.join(CLIENT, rel);
  if (!fs.existsSync(compFile)) continue;
  const src = readFile(compFile);
  const idMatches = src.match(/\bFR-\d{3}\b/g) || [];
  if (idMatches.length === 0) continue;
  inScope.push({ ...r, frCitations: [...new Set(idMatches)] });
}

// ─── 4. Reachability check ──────────────────────────────────────────────────
const orphans = [];
for (const r of inScope) {
  if (navLinks.has(r.path)) continue;
  // ≤2 clicks: parent path also counts (e.g., /resources/list reached from /resources)
  const parts = r.path.split('/').filter(Boolean);
  if (parts.length > 1) {
    const parent = '/' + parts.slice(0, -1).join('/');
    if (navLinks.has(parent)) continue;
  }
  orphans.push(r);
}

// ─── 5. Report ──────────────────────────────────────────────────────────────
if (JSON_OUT) {
  console.log(JSON.stringify({
    ok: orphans.length === 0,
    routerFile: path.relative(ROOT, routerFile),
    navFiles: navFiles.map(f => path.relative(ROOT, f)),
    navLinks: [...navLinks].sort(),
    routesParsed: routes.length,
    inScope: inScope.length,
    orphans: orphans.map(o => ({ path: o.path, name: o.name, frCitations: o.frCitations })),
  }, null, 2));
} else {
  console.log(`\nnav-completeness check`);
  console.log('─'.repeat(60));
  console.log(`  router:        ${path.relative(ROOT, routerFile)}`);
  console.log(`  nav sources:   ${navFiles.map(f => path.basename(f)).join(', ') || '(none found)'}`);
  console.log(`  nav links:     ${navLinks.size}`);
  console.log(`  routes parsed: ${routes.length}`);
  console.log(`  in-scope:      ${inScope.length}  (public, non-param, FR-cited)`);
  console.log('─'.repeat(60));
  if (orphans.length === 0) {
    console.log('  ✓ every FR-cited public route is reachable from / within 2 clicks.');
  } else {
    for (const o of orphans) {
      console.log(`  ✘ ${o.path}   FRs: ${o.frCitations.join(', ')}   — not in nav`);
    }
    console.log('');
    console.log(`  ${orphans.length} orphan route(s). Each is a feature users cannot discover from the home page.`);
    console.log(`  Fix: add <router-link to="${orphans[0].path}">…</router-link> to DefaultLayout.vue or LandingPage.vue.`);
    console.log(`  Per harness rule #12: every public FR must be reachable from / in ≤2 clicks.`);
  }
  console.log('');
}

process.exit(orphans.length > 0 ? 1 : 0);
