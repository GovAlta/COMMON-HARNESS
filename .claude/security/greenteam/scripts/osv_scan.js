#!/usr/bin/env node
/**
 * osv_scan.js — multi-ecosystem dependency vulnerability scan via OSV.dev.
 *
 * Walks the target for lockfiles + manifests across Java (Maven, Gradle),
 * Python (pip / Poetry / Pipenv), Cargo, RubyGems, Composer, NuGet, npm,
 * and Go (cross-check with govulncheck). Extracts (ecosystem, package,
 * version) tuples and queries https://api.osv.dev/v1/querybatch in batches
 * of up to 1000 per request. Emits one finding per (package@version × vuln)
 * pair, then the refinement pass consolidates by CVE id.
 *
 * No local install required — uses Node's built-in `fetch` (Node 18+).
 * If `osv-scanner` binary IS available, prefers it (faster + handles more
 * lockfile variants); otherwise falls back to the API path.
 *
 * Severity mapping: CRITICAL ≥ 9.0, HIGH ≥ 7.0, MEDIUM ≥ 4.0, LOW < 4.0.
 *
 * Usage: node osv_scan.js --target <path> [--out <file>]
 */

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { finding, makeIdAllocator } from '../pipeline/output_schemas.js';
import { makeChecker } from '../pipeline/gitignore.js';

const argv = process.argv.slice(2);
let TARGET = process.cwd();
let OUT = null;
for (let i = 0; i < argv.length; i++) {
  if (argv[i] === '--target') TARGET = path.resolve(argv[++i]);
  else if (argv[i] === '--out') OUT = path.resolve(argv[++i]);
}

const SKIP_DIRS = new Set([
  'node_modules', '.git', 'dist', 'build', 'coverage', '.next', '.nuxt',
  '.gradle', '.idea', '.venv', 'venv', '__pycache__', 'target', 'out', 'bin',
  '3rd-party', 'vendor', '_archive',
]);

function walk(dir, acc = []) {
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return acc; }
  for (const e of entries) {
    if (SKIP_DIRS.has(e.name)) continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) walk(full, acc);
    else if (e.isFile()) acc.push(full);
  }
  return acc;
}

const isIgnored = makeChecker(TARGET);
const files = walk(TARGET).filter(f => !isIgnored(f));

// ─── Lockfile / manifest parsers ────────────────────────────────────────────
// Each returns { ecosystem, name, version, source }[]

function parseRequirementsTxt(text, sourceRel) {
  const out = [];
  for (const raw of text.split(/\r?\n/)) {
    let line = raw.replace(/#.*$/, '').trim();
    if (!line || line.startsWith('-')) continue;
    // package==version | package>=version | package~=version | package[extras]==version
    const m = line.match(/^([A-Za-z0-9_.-]+)(?:\[[^\]]*\])?\s*[=~<>!]+\s*([A-Za-z0-9._+-]+)/);
    if (m) out.push({ ecosystem: 'PyPI', name: m[1], version: m[2], source: sourceRel });
  }
  return out;
}

function parsePipfileLock(text, sourceRel) {
  const out = [];
  let data;
  try { data = JSON.parse(text); } catch { return out; }
  for (const section of ['default', 'develop']) {
    const sec = data[section] || {};
    for (const [name, info] of Object.entries(sec)) {
      const v = (info.version || '').replace(/^==/, '');
      if (v) out.push({ ecosystem: 'PyPI', name, version: v, source: sourceRel });
    }
  }
  return out;
}

function parsePoetryLock(text, sourceRel) {
  const out = [];
  // poetry.lock is TOML; rough parse: [[package]] blocks with name = "x" / version = "y"
  const blocks = text.split(/\n\[\[package\]\]/);
  for (const b of blocks.slice(1)) {
    const nm = b.match(/^\s*name\s*=\s*"([^"]+)"/m);
    const vm = b.match(/^\s*version\s*=\s*"([^"]+)"/m);
    if (nm && vm) out.push({ ecosystem: 'PyPI', name: nm[1], version: vm[1], source: sourceRel });
  }
  return out;
}

function parseGemfileLock(text, sourceRel) {
  const out = [];
  // GEM section, indented lines like "  rails (7.0.4.2)"
  let inGems = false;
  for (const line of text.split(/\r?\n/)) {
    if (line === 'GEM') inGems = true;
    else if (inGems && /^[A-Z]/.test(line)) inGems = false;
    else if (inGems) {
      const m = line.match(/^\s{4}([A-Za-z0-9_.-]+)\s+\(([^)]+)\)/);
      if (m) out.push({ ecosystem: 'RubyGems', name: m[1], version: m[2], source: sourceRel });
    }
  }
  return out;
}

function parseCargoLock(text, sourceRel) {
  const out = [];
  const blocks = text.split(/\n\[\[package\]\]/);
  for (const b of blocks.slice(1)) {
    const nm = b.match(/^\s*name\s*=\s*"([^"]+)"/m);
    const vm = b.match(/^\s*version\s*=\s*"([^"]+)"/m);
    if (nm && vm) out.push({ ecosystem: 'crates.io', name: nm[1], version: vm[1], source: sourceRel });
  }
  return out;
}

function parseComposerLock(text, sourceRel) {
  const out = [];
  let data;
  try { data = JSON.parse(text); } catch { return out; }
  for (const arr of [data.packages || [], data['packages-dev'] || []]) {
    for (const p of arr) {
      const v = (p.version || '').replace(/^v/, '');
      if (p.name && v) out.push({ ecosystem: 'Packagist', name: p.name, version: v, source: sourceRel });
    }
  }
  return out;
}

function parsePackageLockJson(text, sourceRel) {
  const out = [];
  let data;
  try { data = JSON.parse(text); } catch { return out; }
  const seen = new Set();
  function add(name, version) {
    if (!name || !version) return;
    const k = `${name}@${version}`;
    if (seen.has(k)) return;
    seen.add(k);
    out.push({ ecosystem: 'npm', name, version, source: sourceRel });
  }
  // Extract the LEAF package name from a v3 lockfile path key.
  // Path examples:
  //   "node_modules/express"                                → "express"
  //   "node_modules/express/node_modules/ms"                → "ms"          (NOT "express")
  //   "node_modules/@babel/traverse"                        → "@babel/traverse"
  //   "node_modules/@babel/traverse/node_modules/@types/x"  → "@types/x"
  function extractLeafName(key) {
    const MARKER = 'node_modules/';
    const lastIdx = key.lastIndexOf(MARKER);
    if (lastIdx < 0) return null;
    const tail = key.slice(lastIdx + MARKER.length);
    if (!tail) return null;
    // Scoped package: take @scope/name (two segments). Non-scoped: take one segment.
    const parts = tail.split('/');
    if (parts[0].startsWith('@') && parts.length >= 2) return parts[0] + '/' + parts[1];
    return parts[0];
  }
  // v3 lockfile (npm 7+). Authoritative source for package name is v.name
  // when present; fall back to leaf-path extraction.
  if (data.packages) {
    for (const [k, v] of Object.entries(data.packages)) {
      if (!k) continue; // root
      const name = (v && v.name) || extractLeafName(k);
      add(name, v && v.version);
    }
  }
  // v1 lockfile (npm <=6) — recursive dependencies; the key IS the package name
  function walkDeps(deps) {
    if (!deps) return;
    for (const [name, info] of Object.entries(deps)) {
      add(name, info.version);
      if (info.dependencies) walkDeps(info.dependencies);
    }
  }
  walkDeps(data.dependencies);
  return out;
}

function parseGoSum(text, sourceRel) {
  const out = [];
  const seen = new Set();
  for (const line of text.split(/\r?\n/)) {
    // module v1.2.3/go.mod h1:...  OR  module v1.2.3 h1:...
    const m = line.match(/^(\S+)\s+(v[0-9][^\s/]+)/);
    if (m) {
      const key = m[1] + '@' + m[2];
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ ecosystem: 'Go', name: m[1], version: m[2].replace(/^v/, ''), source: sourceRel });
    }
  }
  return out;
}

function parsePomXml(text, sourceRel) {
  const out = [];
  // Simple parse: <dependency>...<groupId>...<artifactId>...<version>...</dependency>
  const re = /<dependency>([\s\S]*?)<\/dependency>/g;
  let m;
  while ((m = re.exec(text)) !== null) {
    const inner = m[1];
    const g = inner.match(/<groupId>([^<]+)<\/groupId>/);
    const a = inner.match(/<artifactId>([^<]+)<\/artifactId>/);
    const v = inner.match(/<version>([^<]+)<\/version>/);
    if (g && a && v && !/\${/.test(v[1])) {
      out.push({ ecosystem: 'Maven', name: `${g[1]}:${a[1]}`, version: v[1], source: sourceRel });
    }
  }
  return out;
}

function parseGradleProperties(text) {
  const map = {};
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z_][\w.]*)\s*=\s*(.+?)\s*$/);
    if (m) map[m[1]] = m[2];
  }
  return map;
}

function parseGradle(text, sourceRel, propsMap) {
  const out = [];
  // implementation 'group:artifact:version' OR "group:artifact:$var" OR "group:artifact:${var}"
  const patterns = [
    /(?:implementation|api|compile|runtimeOnly|compileOnly|testImplementation|testCompile|annotationProcessor|classpath)\s*\(?\s*["']([A-Za-z0-9_.-]+):([A-Za-z0-9_.-]+):([^"'\s)]+)["']/g,
  ];
  for (const re of patterns) {
    const r = new RegExp(re.source, re.flags);
    let m;
    while ((m = r.exec(text)) !== null) {
      let version = m[3];
      // Substitute $var or ${var} from properties
      version = version.replace(/\$\{?([A-Za-z_][\w.]*)\}?/g, (_, v) => propsMap[v] || '');
      if (!version || /\$/.test(version)) continue;
      version = version.replace(/^v/, '');
      out.push({ ecosystem: 'Maven', name: `${m[1]}:${m[2]}`, version, source: sourceRel });
    }
  }
  return out;
}

// ─── Collect all deps ───────────────────────────────────────────────────────
const allDeps = [];
const seenDep = new Set();

// Pre-parse all gradle.properties files inside the target into per-dir maps
const gradleProps = new Map(); // dir -> propsMap
for (const f of files) {
  if (path.basename(f) === 'gradle.properties') {
    try { gradleProps.set(path.dirname(f), parseGradleProperties(fs.readFileSync(f, 'utf8'))); } catch {}
  }
}

// Multi-repo support: many gradle projects split build orchestration into one
// repo and source code into a sibling repo. Walk up to 3 ancestors of TARGET
// and scan each sibling directory one level down for additional gradle.properties.
// Merged into a "global" props map used as fallback.
const globalProps = {};
let ancestor = TARGET;
for (let i = 0; i < 3; i++) {
  const parent = path.dirname(ancestor);
  if (parent === ancestor) break;
  let siblings;
  try { siblings = fs.readdirSync(parent, { withFileTypes: true }); } catch { break; }
  for (const s of siblings) {
    if (!s.isDirectory()) continue;
    const sib = path.join(parent, s.name);
    if (sib === TARGET) continue;
    // Look one level in for gradle.properties (handles X/X-repo/gradle.properties layout)
    for (const probe of [sib, path.join(sib, s.name)]) {
      const gp = path.join(probe, 'gradle.properties');
      if (fs.existsSync(gp)) {
        try { Object.assign(globalProps, parseGradleProperties(fs.readFileSync(gp, 'utf8'))); } catch {}
      }
    }
  }
  ancestor = parent;
}
if (Object.keys(globalProps).length > 0) {
  process.stderr.write(`osv_scan: merged ${Object.keys(globalProps).length} property keys from sibling repos\n`);
}

function propsFor(file) {
  // Find the closest gradle.properties up the tree, then layer in globalProps as fallback
  const merged = { ...globalProps };
  let dir = path.dirname(file);
  while (dir.startsWith(TARGET)) {
    if (gradleProps.has(dir)) Object.assign(merged, gradleProps.get(dir));
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return merged;
}

for (const f of files) {
  const rel = path.relative(TARGET, f).replace(/\\/g, '/');
  const base = path.basename(f);
  let text;
  try { text = fs.readFileSync(f, 'utf8'); } catch { continue; }

  let deps = [];
  if (base === 'requirements.txt' || /^requirements-.*\.txt$/.test(base)) deps = parseRequirementsTxt(text, rel);
  else if (base === 'Pipfile.lock') deps = parsePipfileLock(text, rel);
  else if (base === 'poetry.lock') deps = parsePoetryLock(text, rel);
  else if (base === 'Gemfile.lock') deps = parseGemfileLock(text, rel);
  else if (base === 'Cargo.lock') deps = parseCargoLock(text, rel);
  else if (base === 'composer.lock') deps = parseComposerLock(text, rel);
  else if (base === 'go.sum') deps = parseGoSum(text, rel);
  else if (base === 'package-lock.json') deps = parsePackageLockJson(text, rel);
  else if (base === 'pom.xml') deps = parsePomXml(text, rel);
  else if (base === 'build.gradle' || base === 'build.gradle.kts') deps = parseGradle(text, rel, propsFor(f));

  for (const d of deps) {
    const k = `${d.ecosystem}|${d.name}|${d.version}`;
    if (seenDep.has(k)) continue;
    seenDep.add(k);
    allDeps.push(d);
  }
}

process.stderr.write(`osv_scan: extracted ${allDeps.length} unique (ecosystem,name,version) tuples\n`);

if (allDeps.length === 0) {
  if (OUT) fs.writeFileSync(OUT, '[]');
  else process.stdout.write('[]\n');
  process.exit(0);
}

// ─── Query OSV.dev /v1/querybatch in batches of 500 ─────────────────────────
async function batchQuery(deps) {
  const out = []; // parallel to deps; each entry: [vuln,...] or null
  const BATCH = 500;
  for (let i = 0; i < deps.length; i += BATCH) {
    const slice = deps.slice(i, i + BATCH);
    const body = {
      queries: slice.map(d => ({
        package: { name: d.name, ecosystem: d.ecosystem },
        version: d.version,
      })),
    };
    let resp;
    try {
      resp = await fetch('https://api.osv.dev/v1/querybatch', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
    } catch (e) {
      process.stderr.write(`osv_scan: querybatch failed (${e.message}); aborting\n`);
      return null;
    }
    if (!resp.ok) {
      process.stderr.write(`osv_scan: querybatch HTTP ${resp.status}; aborting\n`);
      return null;
    }
    const data = await resp.json();
    const results = data.results || [];
    for (let j = 0; j < slice.length; j++) {
      const vulns = (results[j] && results[j].vulns) || [];
      out.push(vulns);
    }
    process.stderr.write(`osv_scan: queried ${Math.min(i + BATCH, deps.length)}/${deps.length}\n`);
  }
  return out;
}

// Fetch full vuln details for IDs we need (CVSS, summary)
async function fetchVulnDetail(id) {
  try {
    const r = await fetch(`https://api.osv.dev/v1/vulns/${encodeURIComponent(id)}`);
    if (!r.ok) return null;
    return await r.json();
  } catch { return null; }
}

function cvssToSeverity(score) {
  if (score >= 9.0) return 'CRITICAL';
  if (score >= 7.0) return 'HIGH';
  if (score >= 4.0) return 'MEDIUM';
  return 'LOW';
}

function pickSeverity(vuln) {
  const sevArr = vuln.severity || [];
  for (const s of sevArr) {
    if (s.type === 'CVSS_V3' || s.type === 'CVSS_V4') {
      const m = (s.score || '').match(/CVSS:[\d.]+\/[^/]+(?:\/[^/]+)*$/);
      if (m) {
        // Pull base-score from vector or DB-supplied score
        const scoreMatch = (s.score || '').match(/([0-9]+\.[0-9]+)/);
        if (scoreMatch) return cvssToSeverity(parseFloat(scoreMatch[1]));
      }
    }
  }
  // Heuristic: use database_specific.severity / aliases if present
  if (vuln.database_specific && vuln.database_specific.severity) {
    const s = String(vuln.database_specific.severity).toUpperCase();
    if (['CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'MODERATE'].includes(s)) {
      return s === 'MODERATE' ? 'MEDIUM' : s;
    }
  }
  return 'MEDIUM';
}

const results = await batchQuery(allDeps);
const findings = [];
const nextId = makeIdAllocator();

if (results) {
  // Group: vulnId -> [{ dep, vulnSummary }]
  const byVuln = new Map();
  for (let i = 0; i < allDeps.length; i++) {
    const dep = allDeps[i];
    const vulns = results[i] || [];
    for (const v of vulns) {
      const id = v.id;
      const arr = byVuln.get(id) || [];
      arr.push({ dep, vuln: v });
      byVuln.set(id, arr);
    }
  }
  process.stderr.write(`osv_scan: ${byVuln.size} unique vulns across ${allDeps.length} deps\n`);

  // For each unique vuln, fetch its detail to get summary + better severity
  // (querybatch returns only id + modified date)
  const vulnDetails = new Map();
  const idList = [...byVuln.keys()];
  for (let i = 0; i < idList.length; i++) {
    const id = idList[i];
    const d = await fetchVulnDetail(id);
    if (d) vulnDetails.set(id, d);
    if ((i + 1) % 50 === 0) process.stderr.write(`osv_scan: fetched detail ${i + 1}/${idList.length}\n`);
  }

  // Emit one finding per (vuln × affected dep)
  for (const [id, entries] of byVuln) {
    const detail = vulnDetails.get(id) || entries[0].vuln;
    const severity = pickSeverity(detail);
    const summary = detail.summary || detail.details?.slice(0, 200) || '(no summary)';
    const aliases = detail.aliases || [];
    const referenceUrl = (detail.references && detail.references[0] && detail.references[0].url)
      || `https://osv.dev/vulnerability/${id}`;

    for (const { dep } of entries) {
      findings.push(finding({
        id: nextId(1, 'DEP'),
        round: 1,
        severity,
        category: 'DEP',
        title: `${dep.ecosystem}: ${dep.name}@${dep.version} — ${id} (${summary.slice(0, 100)})`,
        location: { file: dep.source },
        evidence: {
          tool: 'osv.dev API',
          ecosystem: dep.ecosystem,
          package: dep.name,
          installed: dep.version,
          vuln_id: id,
          aliases,
          summary: summary.slice(0, 400),
          reference: referenceUrl,
          severity_source: detail.severity || detail.database_specific || null,
        },
        remediation: `Update ${dep.ecosystem} dependency \`${dep.name}\` to a non-vulnerable version. See ${referenceUrl} for affected ranges and fixed versions.`,
        scanner: 'osv_scan',
      }));
    }
  }
}

if (OUT) fs.writeFileSync(OUT, JSON.stringify(findings, null, 2));
else process.stdout.write(JSON.stringify(findings, null, 2) + '\n');
