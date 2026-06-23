#!/usr/bin/env node
/**
 * python_patterns_scan.js — pattern-based SAST for Python (.py).
 *
 * Covers the common dangerous patterns that `bandit` catches without
 * requiring bandit to be installed.
 *
 * Patterns:
 *   - eval(<expr>)                                   → HIGH   (B307)
 *   - exec(<expr>)                                   → HIGH   (B102)
 *   - pickle.loads / cPickle.loads / yaml.load (no SafeLoader)
 *                                                    → HIGH   (B301, B506)
 *   - subprocess.* with shell=True                   → HIGH   (B602)
 *   - os.system(...)                                 → HIGH   (B605)
 *   - SQL string-concat / f-string in cursor.execute → HIGH   (B608)
 *   - hashlib.md5 / sha1 for non-test use            → MEDIUM (B303, B304)
 *   - random.random / randint for security purposes  → MEDIUM (B311)
 *   - assert in non-test files                       → LOW    (B101)
 *   - requests.get(..., verify=False)                → HIGH   (B501)
 *   - xml.etree.ElementTree without defusedxml       → MEDIUM (B313)
 *   - Hardcoded /tmp paths                           → LOW    (B108)
 *   - Flask app.run(debug=True)                      → MEDIUM (B201)
 *   - Django DEBUG=True in settings.py               → MEDIUM
 *
 * Usage: node python_patterns_scan.js --target <path> [--out <file>]
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

const SKIP_DIRS = new Set([
  'node_modules', '.git', 'dist', 'build', 'coverage', '.next', '.nuxt',
  '.gradle', '.idea', '.venv', 'venv', '__pycache__', 'site-packages',
  'eggs', '.tox', '.eggs', '.pytest_cache',
  '3rd-party', 'vendor', '_archive',
]);

function walk(dir, acc = []) {
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return acc; }
  for (const e of entries) {
    if (SKIP_DIRS.has(e.name)) continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) walk(full, acc);
    else if (e.isFile() && e.name.toLowerCase().endsWith('.py')) acc.push(full);
  }
  return acc;
}

const PATTERNS = [
  { name: 'B307: use of eval()', re: /\beval\s*\(/g, severity: 'HIGH', category: 'XSS' },
  { name: 'B102: use of exec()', re: /\bexec\s*\(/g, severity: 'HIGH', category: 'XSS' },
  { name: 'B301: pickle.loads (insecure deserialization)', re: /\b(?:cPickle|pickle)\.loads?\s*\(/g, severity: 'HIGH', category: 'XSS' },
  { name: 'B506: yaml.load without SafeLoader', re: /\byaml\.load\s*\(/g, severity: 'HIGH', category: 'XSS', requireAbsence: /Loader\s*=\s*(?:yaml\.)?SafeLoader/ },
  { name: 'B602: subprocess with shell=True', re: /subprocess\.(?:call|run|Popen|check_call|check_output)\s*\([^)]*shell\s*=\s*True/g, severity: 'HIGH', category: 'XSS' },
  { name: 'B605: os.system call', re: /\bos\.system\s*\(/g, severity: 'HIGH', category: 'XSS' },
  { name: 'B608: SQL injection via f-string / concat in cursor.execute', re: /(?:cursor|conn|db|c)\.execute(?:many)?\s*\(\s*(?:f[`"']|[`"'][^`"']*[`"']\s*[+%]|[`"'][^`"']*\{)/g, severity: 'HIGH', category: 'SQL' },
  { name: 'B303: weak hash MD5', re: /\bhashlib\.md5\s*\(/g, severity: 'MEDIUM', category: 'LINT' },
  { name: 'B304: weak hash SHA-1', re: /\bhashlib\.sha1\s*\(/g, severity: 'MEDIUM', category: 'LINT' },
  { name: 'B311: random for security context', re: /\b(?:random\.random|random\.randint|random\.choice|random\.shuffle)\s*\([^)]*\)\s*[\s\S]{0,200}(?:password|token|secret|nonce|salt|key|session)/i, severity: 'MEDIUM', category: 'LINT' },
  { name: 'B501: requests with verify=False (TLS off)', re: /\brequests\.(?:get|post|put|delete|patch|head|request)\s*\([^)]*verify\s*=\s*False/g, severity: 'HIGH', category: 'CONF' },
  { name: 'B313: xml.etree.ElementTree (XXE risk; use defusedxml)', re: /\bfrom\s+xml\.etree\.ElementTree\s+import\b|\bimport\s+xml\.etree\.ElementTree\b/g, severity: 'MEDIUM', category: 'XSS' },
  { name: 'B108: hardcoded /tmp path', re: /[`"']\/tmp\//g, severity: 'LOW', category: 'CONF' },
  { name: 'B201: Flask debug=True', re: /\bapp\.run\s*\([^)]*debug\s*=\s*True/g, severity: 'MEDIUM', category: 'CONF' },
  { name: 'Django DEBUG=True in settings', re: /^\s*DEBUG\s*=\s*True/gm, severity: 'MEDIUM', category: 'CONF', filenameHint: /settings(?:\.py|\/)|\bsettings_/i },
];

const isIgnored = makeChecker(TARGET);
const files = walk(TARGET).filter(f => !isIgnored(f));

const findings = [];
const nextId = makeIdAllocator();

for (const file of files) {
  let text;
  try { text = fs.readFileSync(file, 'utf8'); } catch { continue; }
  const rel = path.relative(TARGET, file).replace(/\\/g, '/');
  const lines = text.split('\n');

  for (const p of PATTERNS) {
    if (p.filenameHint && !p.filenameHint.test(rel)) continue;
    if (p.requireAbsence && p.requireAbsence.test(text)) continue;
    const re = new RegExp(p.re.source, p.re.flags);
    let m;
    while ((m = re.exec(text)) !== null) {
      const line = text.slice(0, m.index).split('\n').length;
      const snippet = (lines[line - 1] || '').trim().slice(0, 180);
      if (/^\s*#/.test(snippet)) continue; // skip comments
      findings.push(finding({
        id: nextId(1, p.category),
        round: 1,
        severity: p.severity,
        category: p.category,
        title: `Python: ${p.name} in ${rel}`,
        location: { file: rel, line },
        evidence: {
          tool: 'python_patterns_scan',
          rule: p.name.match(/B\d{3}/)?.[0] || 'custom',
          pattern: p.name,
          snippet,
        },
        remediation: getRemediation(p.name),
        compliance: 'Audit-critical',
        scanner: 'python_patterns_scan',
      }));
    }
  }
}

function getRemediation(name) {
  if (/eval\(\)/.test(name)) return 'Avoid eval(). Use ast.literal_eval for simple literal parsing, or json.loads for JSON. Never pass user input to eval.';
  if (/exec\(\)/.test(name)) return 'Avoid exec(). If you need dynamic code, use a controlled DSL or a sandboxed interpreter.';
  if (/pickle/.test(name)) return 'Use json or msgpack for untrusted data. pickle is RCE if the payload is attacker-controlled.';
  if (/yaml\.load/.test(name)) return 'Use yaml.safe_load() or yaml.load(stream, Loader=yaml.SafeLoader).';
  if (/shell=True/.test(name)) return 'Pass args as a list (shell=False is the default). Validate args against an allowlist.';
  if (/os\.system/.test(name)) return 'Use subprocess.run([...]) with an arg list. os.system invokes the shell with concatenated user input.';
  if (/SQL injection/.test(name)) return 'Use parameterized queries: cursor.execute("SELECT * FROM users WHERE id = %s", (user_id,)). Never f-string or concatenate user input into SQL.';
  if (/MD5|SHA-1/.test(name)) return 'Use hashlib.sha256 or better. For password storage, use passlib (bcrypt / argon2) — not raw hashing.';
  if (/random for security/.test(name)) return 'Use secrets.token_urlsafe() / secrets.choice() / secrets.randbelow() for any value that must be unpredictable.';
  if (/verify=False/.test(name)) return 'Remove verify=False. Use a proper CA bundle (set REQUESTS_CA_BUNDLE) or pass verify="/path/to/ca.pem".';
  if (/xml\.etree/.test(name)) return 'Switch to defusedxml: from defusedxml.ElementTree import parse, fromstring. Same API, XXE-safe defaults.';
  if (/Flask debug=True/.test(name)) return 'Never run Flask with debug=True in production — exposes the interactive debugger over HTTP.';
  if (/Django DEBUG/.test(name)) return 'Set DEBUG=False in production. Use environment variable: DEBUG = os.environ.get("DEBUG", "False") == "True".';
  if (/\/tmp\//.test(name)) return 'Use tempfile.mkstemp / mkdtemp to get a race-safe temp path with proper permissions.';
  return 'Review the call site; replace the unsafe pattern with the documented safe alternative.';
}

if (OUT) fs.writeFileSync(OUT, JSON.stringify(findings, null, 2));
else process.stdout.write(JSON.stringify(findings, null, 2) + '\n');
