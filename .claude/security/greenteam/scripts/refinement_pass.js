#!/usr/bin/env node
/**
 * refinement_pass.js — re-frame pre-refinement findings using cross-scanner context.
 *
 * Rules:
 *   (a) Auth bypass-fence → downgrade auth coverage HIGH to LOW by-design.
 *   (b) vue-tsc --skipLibCheck caveat → downgrade TC HIGH to LOW.
 *   (c) API baseURL CI-override → downgrade HIGH to MEDIUM (never lower).
 *   (d) Consolidation: collapse noisy scanner output into team-wide patterns.
 *       - redocly: collapse by rule name (e.g. all 86 "no-undocumented-4xx-response" → 1 finding).
 *       - govulncheck: collapse by CVE id (e.g. all per-trace findings for GO-2026-4982 → 1).
 *       - go ST1005: collapse all capitalized error strings into 1 finding with count.
 *       - dangerous_patterns_scan SQL: cleared findings collapse into one INFO summary.
 *
 * Consolidation never deletes the underlying audit — the original location list goes
 * into evidence.locations[] so the reader can drill down.
 *
 * Usage: node refinement_pass.js --in <pre.json> --out <refined.json> [--target <path>]
 */

import fs from 'node:fs';
import path from 'node:path';

const argv = process.argv.slice(2);
let IN = null, OUT = null, TARGET = process.cwd();
for (let i = 0; i < argv.length; i++) {
  if (argv[i] === '--in') IN = path.resolve(argv[++i]);
  else if (argv[i] === '--out') OUT = path.resolve(argv[++i]);
  else if (argv[i] === '--target') TARGET = path.resolve(argv[++i]);
}

if (!IN || !OUT) {
  console.error('refinement_pass: --in <file> and --out <file> are required');
  process.exit(2);
}

let findings;
try { findings = JSON.parse(fs.readFileSync(IN, 'utf8')); } catch (e) {
  console.error(`refinement_pass: could not parse ${IN}: ${e.message}`);
  process.exit(2);
}
if (!Array.isArray(findings)) findings = [];

// ─── (a) auth bypass-fence → downgrade auth coverage findings ───────────────
const bypassFinding = findings.find(f =>
  f.scanner === 'go_test_bypass_audit' && f.status === 'by-design'
);
const integEnum = findings.find(f =>
  f.scanner === 'integration_test_enum' && /Integration test suite enumerated/.test(f.title || '')
);
if (bypassFinding) {
  for (const f of findings) {
    if (f.scanner !== 'go_test_coverage_scan') continue;
    if (!(f.severity === 'HIGH' || f.severity === 'CRITICAL')) continue;
    const pkg = (f.evidence && f.evidence.package) || (f.location && f.location.file) || '';
    if (!/\b(auth|security|crypto|casbin|rbac|authz|authn)\b/i.test(pkg)) continue;
    f.severity = 'LOW';
    f.status = 'by-design';
    f.evidence = f.evidence || {};
    f.evidence.note = `Coverage is by design — unit tests bypass auth enforcer; auth tested via integration suite. See ${integEnum ? integEnum.id : 'integration_test_enum'}.`;
  }
}

// ─── (b) vue-tsc --skipLibCheck tooling caveat → downgrade TC HIGH ──────────
const vtscByDesign = findings.find(f =>
  f.scanner === 'vue_tsc_scan' && f.status === 'by-design' && f.category === 'TC'
);
if (vtscByDesign) {
  const repoHint = vtscByDesign.location && vtscByDesign.location.repo;
  for (const f of findings) {
    if (f.category !== 'TC') continue;
    if (f.severity !== 'HIGH') continue;
    if (f === vtscByDesign) continue;
    const fRepo = f.location && f.location.repo;
    if (repoHint && fRepo && fRepo !== repoHint) continue;
    f.severity = 'LOW';
    f.evidence = f.evidence || {};
    f.evidence.note = `Downgraded by refinement: project's type-check skips lib check; see ${vtscByDesign.id}.`;
  }
}

// ─── (c) api baseURL: CI overrides → downgrade HIGH → MEDIUM ────────────────
for (const f of findings) {
  if (f.scanner !== 'api_base_url_audit') continue;
  if (f.severity !== 'HIGH') continue;
  const ev = f.evidence || {};
  const testLocs = ev.tests || [];
  const ciLocs = ev.ci || [];
  const testInFallback = testLocs.length > 0 && testLocs.every(t => /fallback|default|setup/i.test(t.file || ''));
  if (testInFallback && ciLocs.length > 0) {
    f.severity = 'MEDIUM';
    f.evidence = f.evidence || {};
    f.evidence.note = 'Downgraded HIGH→MEDIUM by refinement: mismatch only appears in test fallback paths and CI overrides the env. Source default is still wrong — do not downgrade further.';
  }
}

// ─── (d) CONSOLIDATION RULES ───────────────────────────────────────────────
// Collapse by-scanner + by-rule into one finding with locations[]. Preserves
// audit trail (every original location is in evidence.locations[]).

function consolidate(byScanner, keyFn, makeTitle, makeRemediation, opts = {}) {
  const groups = new Map(); // key -> [findings]
  const survivors = [];
  for (const f of findings) {
    if (f.scanner !== byScanner) { survivors.push(f); continue; }
    if (opts.skipIf && opts.skipIf(f)) { survivors.push(f); continue; }
    const k = keyFn(f);
    if (!k) { survivors.push(f); continue; }
    const arr = groups.get(k) || [];
    arr.push(f);
    groups.set(k, arr);
  }
  for (const [k, group] of groups) {
    if (group.length === 1) { survivors.push(group[0]); continue; }
    const first = group[0];
    // Pick worst severity in the group
    const sevOrder = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3, INFO: 4, CLEARED: 5 };
    const worst = group.reduce((a, b) => sevOrder[a.severity] <= sevOrder[b.severity] ? a : b);
    const consolidated = {
      ...first,
      severity: worst.severity,
      title: makeTitle(k, group),
      evidence: {
        ...(first.evidence || {}),
        consolidated_from: group.length,
        consolidation_key: k,
        locations: group.map(g => ({
          file: g.location?.file,
          line: g.location?.line,
          original_severity: g.severity,
          original_title: g.title,
        })).slice(0, 50), // cap at 50 for size
        total_locations: group.length,
      },
      remediation: makeRemediation(k, group),
      status: group.every(g => g.status === 'cleared') ? 'cleared' : (first.status || 'open'),
    };
    survivors.push(consolidated);
  }
  return survivors;
}

// (d.1) redocly: collapse by rule name from title
findings = consolidate(
  'redocly_scan',
  f => {
    // titles look like "OpenAPI warn: <rule-id> in <file>"
    const m = (f.title || '').match(/^OpenAPI (?:warn|error): ([^\s]+) in /);
    return m ? `redocly:${m[1]}` : null;
  },
  (key, group) => `OpenAPI: ${key.replace('redocly:', '')} fires across ${group.length} location(s) — single team-wide pattern`,
  (key, group) => {
    const rule = key.replace('redocly:', '');
    if (rule === 'no-undocumented-4xx-response') {
      return `Apply one shared error-response template across operations. Until then, partners generating SDKs have no documented contract for failure.`;
    }
    if (rule === 'no-server-example.com') {
      return `Remove the example.com placeholder in the servers: block.`;
    }
    if (rule === 'no-unused-components') {
      return `Delete the unused component definitions, or wire them into operations that reference them.`;
    }
    return `Fix all ${group.length} occurrences of \`${rule}\` (see evidence.locations).`;
  }
);

// (d.2) govulncheck: collapse by CVE id (osv field) — the docx "4 reachable CVEs"
findings = consolidate(
  'govulncheck_scan',
  f => {
    // title pattern: "Reachable Go vulnerability <CVE-ID> in <pkg>"
    const m = (f.title || '').match(/(GO-\d{4}-\d+|CVE-\d{4}-\d+)/);
    return m ? `govuln:${m[1]}` : null;
  },
  (key, group) => {
    const cve = key.replace('govuln:', '');
    const traces = group.length;
    return `Reachable Go vulnerability ${cve} — ${traces} call trace(s)`;
  },
  (key, group) => {
    const fixes = [...new Set(group.map(g => g.remediation).filter(Boolean))];
    return fixes.length === 1 ? fixes[0] : `Apply the upstream fix for ${key.replace('govuln:', '')} (see evidence.locations for all reachable call paths).`;
  }
);

// (d.3) go_toolchain_audit: collapse ST1005 capitalized errors
findings = consolidate(
  'go_toolchain_audit',
  f => /ST1005/i.test(f.title || '') ? 'go:ST1005' : null,
  (key, group) => `Go ST1005: capitalized error strings in ${group.length} file(s)`,
  (key, group) => `Lowercase the first word of each error string for Go convention. (${group.length} files affected — see evidence.locations.)`
);

// (d.4) dangerous_patterns_scan: SQL cleared findings into one summary
{
  const sqlCleared = findings.filter(f =>
    f.scanner === 'dangerous_patterns_scan' && f.category === 'SQL' && f.status === 'cleared'
  );
  if (sqlCleared.length > 1) {
    const remaining = findings.filter(f =>
      !(f.scanner === 'dangerous_patterns_scan' && f.category === 'SQL' && f.status === 'cleared')
    );
    remaining.push({
      ...sqlCleared[0],
      severity: 'INFO',
      status: 'cleared',
      title: `${sqlCleared.length} fmt.Sprintf+SQL patterns investigated and cleared (parameterized + allowlists confirmed)`,
      evidence: {
        ...(sqlCleared[0].evidence || {}),
        consolidated_from: sqlCleared.length,
        locations: sqlCleared.map(g => ({
          file: g.location?.file,
          line: g.location?.line,
        })).slice(0, 100),
        total_locations: sqlCleared.length,
        note: 'All flagged fmt.Sprintf+SQL calls reviewed and confirmed safe: either $N placeholders are used with separate arg binding, or dynamic identifiers are validated against an allowlist before use. Matches docx F-09 framing.',
      },
      remediation: 'No action required for any of these locations.',
    });
    findings = remaining;
  }
}

// (d.5) ci_pipeline_audit: collapse per-pipeline same-rule findings into one per rule
findings = consolidate(
  'ci_pipeline_audit',
  f => {
    const m = (f.title || '').match(/(CI does not run [A-Za-z]+|No (?:security scan|SBOM|integration test|coverage publishing) in CI|integration test job .* not present)/);
    return m ? `ci:${m[1]}` : null;
  },
  (key, group) => `${key.replace('ci:', '')} (${group.length} workflow file(s))`,
  (key, group) => group[0].remediation,
);

fs.writeFileSync(OUT, JSON.stringify(findings, null, 2));
process.stderr.write(`refinement_pass: wrote ${findings.length} finding(s)\n`);
