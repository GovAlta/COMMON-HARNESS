#!/usr/bin/env node
/**
 * secret_scan.js — credential / API key detection.
 *
 * Catches the R1E-D-03 pattern: AI-tooling reports committed under
 * .ai/reports/ or .ai/data/ that quote live credentials verbatim. Also
 * catches the conventional cases (Google AI, Anthropic, OpenAI, GitHub,
 * AWS, Postgres connection strings, private keys).
 *
 * False-positive suppression:
 *   - Files that are gitignored are SKIPPED entirely (local .env files in
 *     normal dev pattern are not an exposure — they're never committed).
 *   - Dummy / placeholder Postgres URLs (localhost + trivial creds like
 *     postgres:postgres) are downgraded to CLEARED with status noting
 *     they're a development convention, not a real credential.
 *   - Pre-existing .env.example / fixtures / test data: severity LOW.
 *
 * Usage:
 *   node secret_scan.js --target <path> [--out <file>]
 */

import fs from 'node:fs';
import path from 'node:path';
import { finding, makeIdAllocator } from '../pipeline/output_schemas.js';
import { makeChecker } from '../pipeline/gitignore.js';

const argv = process.argv.slice(2);
let TARGET = process.cwd();
let OUT = null;
for (let i = 0; i < argv.length; i++) {
  if (argv[i] === '--target') TARGET = path.resolve(argv[++i]);
  else if (argv[i] === '--out') OUT = path.resolve(argv[++i]);
}

// Pattern → { name, severity, category context }
const PATTERNS = [
  { name: 'Google AI API key',           re: /AIza[0-9A-Za-z_-]{35}/g,            severity: 'CRITICAL' },
  { name: 'Anthropic API key',           re: /sk-ant-(?:api03-)?[0-9A-Za-z_-]{10,}/g, severity: 'CRITICAL' },
  { name: 'Anthropic API key prefix',    re: /sk-ant-api03-[0-9A-Za-z_-]{4,12}\b/g, severity: 'HIGH' },
  { name: 'OpenAI API key',              re: /sk-[A-Za-z0-9]{20,}\b/g,           severity: 'CRITICAL' },
  { name: 'GitHub PAT',                  re: /ghp_[A-Za-z0-9]{36}/g,             severity: 'CRITICAL' },
  { name: 'GitHub fine-grained token',   re: /github_pat_[A-Za-z0-9_]{82}/g,     severity: 'CRITICAL' },
  { name: 'AWS access key',              re: /AKIA[0-9A-Z]{16}/g,                severity: 'CRITICAL' },
  { name: 'AWS RDS endpoint',            re: /[a-z0-9-]+\.[a-z0-9]{12}\.[a-z0-9-]+\.rds\.amazonaws\.com/g, severity: 'HIGH' },
  { name: 'Postgres connection URL',     re: /postgres(?:ql)?:\/\/[^\s'"`]+:[^\s'"`@]+@[^\s'"`]+/g, severity: 'CRITICAL' },
  { name: 'Generic JWT',                 re: /eyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g, severity: 'HIGH' },
  { name: 'Private key block',           re: /-----BEGIN (?:RSA |EC |OPENSSH |DSA |PGP )?PRIVATE KEY-----/g, severity: 'CRITICAL' },
  { name: 'Slack token',                 re: /xox[abpsr]-[0-9]+-[0-9]+-[0-9]+-[a-f0-9]+/g, severity: 'CRITICAL' },
];

const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'build', 'coverage', '.next', '.nuxt', '.cache']);

// Known-dummy / convention DB credentials and hosts. These match patterns
// like postgres://postgres:PASSWORD@localhost:5432/db and similar
// "trivial local dev defaults" that aren't actually secrets.
const DUMMY_DB_USERS = new Set(['postgres', 'user', 'admin', 'root', 'test', 'dev', 'developer', 'app', 'demo']);
const DUMMY_DB_PASSWORDS = new Set(['postgres', 'password', 'pass', 'test', 'dev', 'demo', 'admin', 'root', 'changeme', 'pwd', '123', '1234', '12345', 'password123', 'mysecretpassword', 'secret', 'docker']);
const DUMMY_DB_HOSTS = new Set(['localhost', '127.0.0.1', '0.0.0.0', '::1', 'db', 'database', 'postgres', 'pgsql', 'docker']);
// Service-container host pattern: short alphanumeric (CI service names)
const DUMMY_HOST_RE = /^[a-z][a-z0-9-]{0,15}$/;

function isDummyDbUrl(url) {
  // Pattern: postgres(ql)://user:PASSWORD@host(:port)?/db?
  const m = url.match(/^postgres(?:ql)?:\/\/([^:@/]+):([^@/]*)@([^:/]+)(?::(\d+))?(?:\/([\w-]+))?/i);
  if (!m) return false;
  const [, user, pass, host] = m;
  const userL = user.toLowerCase();
  const passL = pass.toLowerCase();
  const hostL = host.toLowerCase();
  // Localhost / service-container hostnames + (trivial password OR no password OR placeholder)
  const hostIsLocal = DUMMY_DB_HOSTS.has(hostL) || DUMMY_HOST_RE.test(hostL);
  if (!hostIsLocal) return false;
  // Placeholder password marker
  const isPlaceholder = /\[REDACTED|<.+?>|\${[A-Z_]+}|YOUR_|CHANGE.?ME|EXAMPLE|PLACEHOLDER/i.test(pass);
  if (isPlaceholder) return true;
  // Trivial / dummy creds
  if (DUMMY_DB_PASSWORDS.has(passL)) return true;
  if (DUMMY_DB_USERS.has(userL) && userL === passL) return true; // user==password
  if (pass.length <= 3) return true; // implausibly short
  return false;
}

function walk(dir, acc = []) {
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return acc; }
  for (const e of entries) {
    if (SKIP_DIRS.has(e.name)) continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) walk(full, acc);
    else if (e.isFile()) {
      // Skip binary-looking files and oversized files
      const ext = path.extname(e.name).toLowerCase();
      if (['.png', '.jpg', '.jpeg', '.gif', '.ico', '.pdf', '.zip', '.tar', '.gz',
           '.woff', '.woff2', '.ttf', '.otf', '.eot', '.mp3', '.mp4', '.exe', '.dll',
           '.so', '.dylib', '.bin', '.lock'].includes(ext)) continue;
      try {
        const stat = fs.statSync(full);
        if (stat.size > 2_000_000) continue;
      } catch { continue; }
      acc.push(full);
    }
  }
  return acc;
}

// Load gitignore for the entire target — skipped files are not real exposures
const isIgnored = makeChecker(TARGET);

const files = walk(TARGET);
const findings = [];
const nextId = makeIdAllocator();
const seen = new Set();
let skippedGitignored = 0;
let dummyDbCleared = 0;

for (const file of files) {
  // Skip gitignored files entirely — they aren't an exposure
  if (isIgnored(file)) {
    skippedGitignored++;
    continue;
  }

  let text;
  try { text = fs.readFileSync(file, 'utf8'); } catch { continue; }
  const rel = path.relative(TARGET, file).replace(/\\/g, '/');
  const isExample = /\.env\.example$|fixtures?\//i.test(rel);
  const isAiReport = /^\.ai\/(?:reports?|data)\//.test(rel);
  // Documentation context: README, docs/, prompts/, *.md — typically test setup
  // examples; treat dummy URLs as informational rather than secrets
  const isDocFile = /(?:^|\/)(?:README|CONTRIBUTING|CLAUDE|TESTING|DEVELOPMENT|DEVELOPER|RUNBOOK|docs|prompts|guides?|tutorial)\b/i.test(rel) || /\.(?:md|mdx|rst|txt|adoc)$/i.test(rel);

  for (const p of PATTERNS) {
    let m;
    const re = new RegExp(p.re.source, p.re.flags);
    while ((m = re.exec(text)) !== null) {
      const line = text.slice(0, m.index).split('\n').length;
      const key = `${file}|${p.name}|${m[0].slice(0, 20)}`;
      if (seen.has(key)) continue;
      seen.add(key);

      const matched = m[0];

      // Dummy DB URL detection — these are conventional local-dev defaults,
      // not credential exposure. Emit a CLEARED finding so the audit trail
      // shows we investigated (matches docx behaviour for F-09).
      if (p.name === 'Postgres connection URL' && isDummyDbUrl(matched)) {
        dummyDbCleared++;
        findings.push(finding({
          id: nextId(1, 'SECRET'),
          round: 1,
          severity: 'CLEARED',
          category: 'SECRET',
          title: `Local-dev placeholder DB URL cleared in ${rel}`,
          location: { repo: null, file: rel, line },
          evidence: {
            tool: 'secret_scan',
            pattern: p.name,
            match_preview: matched.slice(0, 60) + (matched.length > 60 ? '…' : ''),
            classification: 'localhost-or-service-container + trivial/placeholder credentials',
            context: isDocFile ? 'documentation file (test-setup example)' : 'config file',
          },
          remediation: 'No action — convention pattern, not an exposure. If you later swap in a real password and host, this scan will flag it.',
          status: 'cleared',
          scanner: 'secret_scan',
        }));
        continue;
      }

      const sev = isExample ? 'LOW' : (isAiReport ? 'CRITICAL' : p.severity);
      const category = isAiReport ? 'AI' : 'SECRET';
      const title = isAiReport
        ? `${p.name} committed in AI-generated report (${rel})`
        : `${p.name} found in ${rel}`;

      findings.push(finding({
        id: nextId(1, category),
        round: 1,
        severity: sev,
        category,
        title,
        location: { repo: null, file: rel, line },
        evidence: {
          tool: 'secret_scan',
          pattern: p.name,
          match_preview: matched.slice(0, 24) + (matched.length > 24 ? '…' : ''),
          context: isAiReport ? 'AI-generated security report under .ai/' : (isExample ? 'example / fixture file' : 'source file'),
        },
        remediation: isAiReport
          ? `Rotate the exposed credential immediately. Remove ${rel} from the repo, add the .ai/reports/ and .ai/data/ paths to .gitignore, and rewrite git history (git filter-repo / BFG) to purge the key from past commits.`
          : `Rotate the credential and move it to an environment variable (.env, secret store).`,
        compliance: isAiReport ? 'Top-priority' : '',
        scanner: 'secret_scan',
      }));
    }
  }
}

// Emit a single INFO note summarizing what was skipped — keeps the audit trail
if (skippedGitignored > 0 || dummyDbCleared > 0) {
  findings.push(finding({
    id: nextId(1, 'SECRET'),
    round: 1,
    severity: 'INFO',
    category: 'SECRET',
    title: `secret_scan FP-suppression: ${skippedGitignored} gitignored file(s) skipped, ${dummyDbCleared} dummy DB URL(s) cleared`,
    location: { repo: null, file: null, line: null },
    evidence: {
      tool: 'secret_scan',
      gitignored_skipped: skippedGitignored,
      dummy_db_cleared: dummyDbCleared,
      note: 'Gitignored files are never committed — local .env values are a normal dev pattern, not an exposure. Dummy DB URLs (localhost + trivial creds) are conventional test-setup examples and do not represent leaked credentials.',
    },
    remediation: 'No action — informational. Review the cleared findings if you want to verify the classifier.',
    status: 'cleared',
    scanner: 'secret_scan',
  }));
}

if (OUT) fs.writeFileSync(OUT, JSON.stringify(findings, null, 2));
else process.stdout.write(JSON.stringify(findings, null, 2) + '\n');
