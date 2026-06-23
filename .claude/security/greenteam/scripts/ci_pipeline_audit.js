#!/usr/bin/env node
/**
 * ci_pipeline_audit.js — audit .github/workflows for missing security gates.
 *
 * Per pipeline, check:
 *   - ESLint step       → R2-D-01
 *   - Go integration test (-tags=integration) when a Go project exists → R2-D-02
 *   - Security scan (npm audit / trivy / snyk / osv-scanner / govulncheck) → LOW
 *   - SBOM generation (cyclonedx / syft / --sbom) → LOW
 *
 * Usage: node ci_pipeline_audit.js --target <path> [--out <file>]
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

const wfFiles = walk(TARGET, p => /[/\\]\.github[/\\]workflows[/\\].+\.ya?ml$/i.test(p));
const hasGo = walk(TARGET, p => /[/\\]go\.mod$/.test(p)).length > 0;

const findings = [];
const nextId = makeIdAllocator();

if (wfFiles.length === 0) {
  if (OUT) fs.writeFileSync(OUT, '[]');
  else process.stdout.write('[]\n');
  process.exit(0);
}

let foundEslint = false, foundGoIntegration = false, foundSecScan = false, foundSbom = false;
const wfNames = [];

for (const wf of wfFiles) {
  const rel = path.relative(TARGET, wf).replace(/\\/g, '/');
  wfNames.push(rel);
  let text;
  try { text = fs.readFileSync(wf, 'utf8'); } catch { continue; }
  if (/\beslint\b|npm\s+run\s+lint\b/i.test(text)) foundEslint = true;
  if (/-tags=integration|go\s+test[^\n]*\bintegration\b/i.test(text)) foundGoIntegration = true;
  if (/\bnpm\s+audit\b|\btrivy\b|\bsnyk\b|\bosv-scanner\b|\bgovulncheck\b/i.test(text)) foundSecScan = true;
  if (/\bcyclonedx\b|\bsyft\b|--sbom\b/i.test(text)) foundSbom = true;
}

if (!foundEslint) {
  findings.push(finding({
    id: nextId(2, 'CI'),
    round: 2,
    severity: 'MEDIUM',
    category: 'CI',
    title: 'CI does not run ESLint',
    location: { file: wfNames[0] },
    evidence: { tool: 'ci_pipeline_audit', workflows: wfNames, missing: 'eslint step' },
    remediation: `Add a step that runs \`npm run lint\` (or \`npx eslint .\`) and fails the build on any error. Without this, ESLint findings are aspirational.`,
    compliance: 'Process gap',
    scanner: 'ci_pipeline_audit',
  }));
}
if (hasGo && !foundGoIntegration) {
  findings.push(finding({
    id: nextId(2, 'CI'),
    round: 2,
    severity: 'MEDIUM',
    category: 'CI',
    title: 'CI does not run Go integration tests',
    location: { file: wfNames[0] },
    evidence: { tool: 'ci_pipeline_audit', workflows: wfNames, missing: '-tags=integration' },
    remediation: `Add a step that runs \`go test ./... -tags=integration\` in CI. Without it, the integration suite is checked into the repo but never executed.`,
    compliance: 'Process gap',
    scanner: 'ci_pipeline_audit',
  }));
}
if (!foundSecScan) {
  findings.push(finding({
    id: nextId(2, 'CI'),
    round: 2,
    severity: 'LOW',
    category: 'CI',
    title: 'No security scan in CI',
    location: { file: wfNames[0] },
    evidence: { tool: 'ci_pipeline_audit', workflows: wfNames, missing: 'npm audit / trivy / snyk / osv-scanner / govulncheck' },
    remediation: `Add a security scan step (e.g. \`npm audit --audit-level=high\` or \`govulncheck ./...\`).`,
    compliance: 'Hygiene',
    scanner: 'ci_pipeline_audit',
  }));
}
if (!foundSbom) {
  findings.push(finding({
    id: nextId(2, 'CI'),
    round: 2,
    severity: 'LOW',
    category: 'CI',
    title: 'No SBOM generation in CI',
    location: { file: wfNames[0] },
    evidence: { tool: 'ci_pipeline_audit', workflows: wfNames, missing: 'cyclonedx / syft / --sbom' },
    remediation: `Add an SBOM generation step (e.g. CycloneDX or Syft) and upload the artifact with each release.`,
    compliance: 'Hygiene',
    scanner: 'ci_pipeline_audit',
  }));
}

if (OUT) fs.writeFileSync(OUT, JSON.stringify(findings, null, 2));
else process.stdout.write(JSON.stringify(findings, null, 2) + '\n');
