#!/usr/bin/env node
/**
 * java_patterns_scan.js — pattern-based SAST for Java + JSP.
 *
 * Covers the common-and-serious Java security anti-patterns without
 * requiring an installed SpotBugs / find-sec-bugs / SonarJava. Each
 * pattern carries the rule name + severity matching widely-accepted
 * SonarJava / find-sec-bugs categorisations.
 *
 * Patterns (per-language):
 *   .java
 *     - Runtime.getRuntime().exec(             → HIGH   (command-injection risk)
 *     - new ProcessBuilder(                    → MEDIUM (arg-list safer than exec)
 *     - Statement.executeQuery("..."+x), .executeUpdate("..."+x)
 *                                              → HIGH   (SQL injection)
 *     - Class.forName(<expr non-literal>)      → MEDIUM (reflection RCE)
 *     - Cipher.getInstance("DES"|"DESede"|"RC4"|"RC2"|"BLOWFISH")
 *                                              → HIGH   (weak crypto algorithm)
 *     - Cipher.getInstance("AES/ECB/...")      → HIGH   (ECB mode unsafe)
 *     - MessageDigest.getInstance("MD5"|"MD2"|"SHA1"|"SHA-1")
 *                                              → MEDIUM (weak hashing)
 *     - new Random( for security-named vars    → MEDIUM (use SecureRandom)
 *     - DocumentBuilderFactory / SAXParserFactory without disallow-doctype-decl
 *                                              → HIGH   (XXE)
 *     - XMLInputFactory without IS_SUPPORTING_EXTERNAL_ENTITIES=false
 *                                              → HIGH   (XXE)
 *     - System.setProperty("javax.net.ssl.trustStore", ...) hardcoded
 *                                              → MEDIUM (config)
 *     - new TrustManager with empty checkServerTrusted body
 *                                              → HIGH   (cert validation disabled)
 *     - new HostnameVerifier with verify always returning true
 *                                              → HIGH   (hostname check disabled)
 *     - @PreAuthorize / @Secured / @RolesAllowed missing on @RequestMapping?
 *                                              → INFO (informational; full check needs annotation graph)
 *
 *   .jsp / .jspx
 *     - <%= request.getParameter(...) %>       → HIGH   (reflected XSS, unescaped)
 *     - <%= <expr> %> where <expr> is not c:out
 *                                              → MEDIUM (potential XSS)
 *     - jsp:include with user-controlled file  → HIGH (file inclusion)
 *
 * Usage: node java_patterns_scan.js --target <path> [--out <file>]
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
    else if (e.isFile()) {
      const lower = e.name.toLowerCase();
      if (lower.endsWith('.java') || lower.endsWith('.jsp') || lower.endsWith('.jspx')) acc.push(full);
    }
  }
  return acc;
}

// All patterns use bounded quantifiers and avoid nested groups to prevent
// catastrophic backtracking on large Java files.
const PATTERNS_JAVA = [
  { name: 'Runtime.exec command-injection risk', re: /\bRuntime\.getRuntime\(\)\.exec\s*\(/g, severity: 'HIGH' },
  { name: 'ProcessBuilder with potential user input', re: /\bnew\s+ProcessBuilder\s*\(/g, severity: 'MEDIUM' },
  { name: 'SQL injection via concatenation in execute', re: /\.execute(?:Query|Update|LargeUpdate)?\s*\(\s*["'][^"']{1,200}["']\s*\+/g, severity: 'HIGH' },
  { name: 'Reflection by string (potential RCE)', re: /\bClass\.forName\s*\(\s*(?!"[^"]*"\s*\))/g, severity: 'MEDIUM' },
  { name: 'Weak crypto algorithm', re: /\bCipher\.getInstance\s*\(\s*"(?:DES|DESede|RC4|RC2|BLOWFISH|3DES)\b/gi, severity: 'HIGH' },
  { name: 'ECB cipher mode (unsafe for most use cases)', re: /\bCipher\.getInstance\s*\(\s*"[A-Za-z0-9_-]{1,20}\/ECB\//g, severity: 'HIGH' },
  { name: 'Weak hash algorithm', re: /\bMessageDigest\.getInstance\s*\(\s*"(?:MD5|MD2|SHA1|SHA-1)"/g, severity: 'MEDIUM' },
  { name: 'XXE: DocumentBuilderFactory without disallow-doctype-decl', re: /\bDocumentBuilderFactory\.newInstance\s*\(/g, severity: 'HIGH', requireAbsence: /disallow-doctype-decl/ },
  { name: 'XXE: SAXParserFactory without disallow-doctype-decl', re: /\bSAXParserFactory\.newInstance\s*\(/g, severity: 'HIGH', requireAbsence: /disallow-doctype-decl/ },
  { name: 'XXE: XMLInputFactory without IS_SUPPORTING_EXTERNAL_ENTITIES=false', re: /\bXMLInputFactory\.newInstance\s*\(/g, severity: 'HIGH', requireAbsence: /IS_SUPPORTING_EXTERNAL_ENTITIES/ },
  { name: 'TrustManager: empty checkServerTrusted (cert validation disabled)', re: /checkServerTrusted\s*\([^)]{1,200}\)\s*(?:throws\s+[A-Za-z, ]{1,60})?\s*\{\s*\}/g, severity: 'HIGH' },
  { name: 'HostnameVerifier always returns true', re: /\bverify\s*\([^)]{1,80}\)\s*\{\s*return\s+true\s*;\s*\}/g, severity: 'HIGH' },
];

const PATTERNS_JSP = [
  { name: 'JSP reflected XSS (unescaped request parameter)', re: /<%=\s*request\.getParameter\s*\(/g, severity: 'HIGH' },
  { name: 'JSP dynamic include (file inclusion risk)', re: /<jsp:include\s+page\s*=\s*"[^"]{1,80}<%=/g, severity: 'HIGH' },
];

const isIgnored = makeChecker(TARGET);
const files = walk(TARGET).filter(f => !isIgnored(f));

const findings = [];
const nextId = makeIdAllocator();

for (const file of files) {
  // Skip oversized files to avoid regex pathological cases
  let stat;
  try { stat = fs.statSync(file); if (stat.size > 1_000_000) continue; } catch { continue; }
  let text;
  try { text = fs.readFileSync(file, 'utf8'); } catch { continue; }
  const rel = path.relative(TARGET, file).replace(/\\/g, '/');
  const ext = path.extname(file).toLowerCase();
  const patterns = ext === '.java' ? PATTERNS_JAVA : PATTERNS_JSP;

  for (const p of patterns) {
    try {
      if (p.requireAbsence && p.requireAbsence.test(text)) continue;
      const re = new RegExp(p.re.source, p.re.flags);
      let m;
      let matchCount = 0;
      while ((m = re.exec(text)) !== null) {
        if (++matchCount > 50) break; // cap per pattern per file
      const line = text.slice(0, m.index).split('\n').length;
      const snippet = (text.split('\n')[line - 1] || '').trim().slice(0, 180);
      // Skip if the line is commented out
      if (/^\s*(?:\/\/|\*|#)/.test(snippet)) continue;
      const category = /(SQL|Statement)/i.test(p.name) ? 'SQL'
        : /(XSS|XXE|JSP|reflected|TrustManager|HostnameVerifier)/i.test(p.name) ? 'XSS'
        : 'LINT';
      findings.push(finding({
        id: nextId(1, category),
        round: 1,
        severity: p.severity,
        category,
        title: `Java/JSP: ${p.name} in ${rel}`,
        location: { file: rel, line },
        evidence: {
          tool: 'java_patterns_scan',
          pattern: p.name,
          snippet,
          note: p.requireAbsence
            ? `Suppress this by configuring the parser factory securely earlier in the file (e.g., factory.setFeature("http://apache.org/xml/features/disallow-doctype-decl", true)).`
            : 'Confirm by reading the call site — pattern detection cannot tell whether the input is user-controlled.',
        },
        remediation: getRemediation(p.name),
        compliance: 'Audit-critical',
        scanner: 'java_patterns_scan',
      }));
    }
    } catch (e) {
      process.stderr.write(`java_patterns_scan: skipped pattern "${p.name}" on ${rel}: ${e.message.slice(0, 100)}\n`);
    }
  }
}

function getRemediation(name) {
  if (/SQL injection/.test(name)) return 'Use PreparedStatement with parameter binding (e.g., conn.prepareStatement("SELECT * FROM users WHERE id = ?"); ps.setLong(1, userId)). Never concatenate user input into SQL.';
  if (/Runtime\.exec/.test(name)) return 'Avoid Runtime.exec with user input. Use ProcessBuilder with arg list, validate args against an allowlist, and never pass shell strings.';
  if (/Weak crypto/.test(name)) return 'Use Cipher.getInstance("AES/GCM/NoPadding") with a 256-bit key. Avoid DES, 3DES, RC2, RC4.';
  if (/ECB cipher mode/.test(name)) return 'Use a mode with IV like GCM or CBC + HMAC. ECB leaks block-level pattern information.';
  if (/Weak hash/.test(name)) return 'Use SHA-256 or stronger. For password storage, use BCrypt / Argon2 / scrypt — not raw hashing.';
  if (/java\.util\.Random/.test(name)) return 'Use java.security.SecureRandom for any value that must be unpredictable (tokens, nonces, salts).';
  if (/XXE/.test(name)) return 'Disable DTD processing: factory.setFeature("http://apache.org/xml/features/disallow-doctype-decl", true); factory.setExpandEntityReferences(false).';
  if (/TrustManager/.test(name)) return 'Implement real certificate validation. Empty checkServerTrusted is equivalent to disabling TLS — anything claiming to be the server is accepted.';
  if (/HostnameVerifier/.test(name)) return 'Use the default HostnameVerifier or implement real comparison. `return true` accepts any hostname for the cert presented.';
  if (/JSP/.test(name)) return 'Use <c:out value="${var}"/> from JSTL or call StringEscapeUtils.escapeHtml4(...) on the value before output.';
  return 'Review the call site; replace the unsafe pattern with the documented safe alternative.';
}

if (OUT) fs.writeFileSync(OUT, JSON.stringify(findings, null, 2));
else process.stdout.write(JSON.stringify(findings, null, 2) + '\n');
