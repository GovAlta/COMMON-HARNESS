#!/usr/bin/env node
/**
 * go_test_bypass_audit.js — detect build-tag-fenced test bypass pattern.
 *
 * Looks for paired files (e.g. *testbypass_dev.go + *testbypass_prod.go) that
 * declare/null-out a SetTestBypass function, plus a fence test that asserts
 * the prod build does NOT carry the bypass. When the pattern matches, emit
 * INFO with status:"by-design" — this is the R2-C-01 refinement signal.
 *
 * Usage: node go_test_bypass_audit.js --target <path> [--out <file>]
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

function walkGo(dir, acc = []) {
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return acc; }
  for (const e of entries) {
    if (SKIP_DIRS.has(e.name)) continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) walkGo(full, acc);
    else if (e.isFile() && e.name.endsWith('.go')) acc.push(full);
  }
  return acc;
}

const findings = [];
const nextId = makeIdAllocator();
const files = walkGo(TARGET);
const candidates = []; // { file, head, hasBypass, tag }
let fenceFile = null;

// Broader bypass-name patterns — any of these in code OR file name signals the family
const BYPASS_NAME_RE = /\b(?:SetTestBypass|TestBypass|testBypass|SkipAuthForTest|DisableAuthForTest|allowAllForTest|enforcerBypass|casbinBypass)\b/;
const BYPASS_FILE_RE = /(?:testbypass|test_bypass|bypass_test|auth_test_bypass|test_only_auth)/i;
const BYPASS_FLIPPER_RE = /\b(?:func\s+\w*[Bb]ypass\w*|var\s+\w*[Bb]ypass\w*\s*(?:bool|=))/;

for (const file of files) {
  const base = path.basename(file);
  let text;
  try { text = fs.readFileSync(file, 'utf8'); } catch { continue; }
  const head = text.split(/\r?\n/).slice(0, 8).join('\n');
  const isFenceName = /fence/i.test(base) && /test/i.test(base);
  // Fence test: anything that asserts a bypass is a no-op under prod build
  if ((isFenceName || /_test\.go$/.test(base)) && /TestProd_[A-Z]\w*Bypass|TestProd_\w*NoOp|prod.*bypass.*no.?op/i.test(text)) {
    fenceFile = file;
  }

  const nameMatch = BYPASS_FILE_RE.test(base);
  const codeMatch = BYPASS_NAME_RE.test(text) || BYPASS_FLIPPER_RE.test(text);
  const tagMatch = head.match(/\/\/go:build\s+([^\n]+)/);
  if ((nameMatch || codeMatch) && tagMatch) {
    candidates.push({
      file,
      tag: tagMatch[1].trim(),
      hasBypass: BYPASS_NAME_RE.test(text) || BYPASS_FLIPPER_RE.test(text),
    });
  }
}

// Need at least one dev/test variant AND one prod variant. Use BOTH the tag
// AND the filename as evidence — common pattern is `*_dev.go` with tag
// `!prod` and `*_prod.go` with tag `prod`.
function isDevVariant(c) {
  const base = path.basename(c.file).toLowerCase();
  if (/_dev\.go$|_test\.go$/.test(base)) return true;
  // Tag: matches dev/test OR is the negation of prod (!prod)
  if (/^!\s*prod\b/.test(c.tag)) return true;
  if (/\b(dev|test)\b/.test(c.tag) && !/\bprod\b/.test(c.tag)) return true;
  return false;
}
function isProdVariant(c) {
  const base = path.basename(c.file).toLowerCase();
  if (/_prod\.go$/.test(base) && !/_test\.go$/.test(base)) return true;
  // Tag: matches `prod` and not `!prod`
  if (/\bprod\b/.test(c.tag) && !/^!\s*prod\b/.test(c.tag) && !/!\s*prod/.test(c.tag)) return true;
  return false;
}
const dev = candidates.find(isDevVariant);
const prod = candidates.find(isProdVariant);

if (dev && prod) {
  findings.push(finding({
    id: nextId(2, 'TEST'),
    round: 2,
    severity: 'INFO',
    category: 'TEST',
    title: 'Build-tag-fenced test bypass detected — auth coverage is by design',
    location: {
      file: path.relative(TARGET, dev.file).replace(/\\/g, '/'),
    },
    evidence: {
      tool: 'go_test_bypass_audit',
      dev_file: path.relative(TARGET, dev.file).replace(/\\/g, '/'),
      prod_file: path.relative(TARGET, prod.file).replace(/\\/g, '/'),
      fence_test: fenceFile ? path.relative(TARGET, fenceFile).replace(/\\/g, '/') : null,
      fence_test_present: !!fenceFile,
      explanation: 'Unit tests intentionally bypass the auth enforcer to test downstream logic; auth enforcement itself is validated by the integration suite. ' + (fenceFile ? 'The fence test guarantees the prod build cannot ship with the bypass.' : 'No fence test detected — consider adding one to assert prod build does not carry the bypass.'),
    },
    remediation: 'No action — by design. Refinement pass downgrades the auth-package coverage finding using this evidence.',
    status: 'by-design',
    scanner: 'go_test_bypass_audit',
  }));
}

if (OUT) fs.writeFileSync(OUT, JSON.stringify(findings, null, 2));
else process.stdout.write(JSON.stringify(findings, null, 2) + '\n');
