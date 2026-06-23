#!/usr/bin/env node
/**
 * websocket_audit.js — defensive review of WebSocket handlers.
 *
 * Matches F-02 (WS no rate limiting) and F-03 (WS DB error leaked to client)
 * from the Lungfish ground truth.
 *
 * Heuristics (per language):
 *   Go:
 *     - Find files that call `upgrader.Upgrade(` or `websocket.Upgrade(`
 *       (gorilla/websocket or nhooyr).
 *     - Identify the surrounding handler function.
 *     - Within the file, look for:
 *         * rate-limit signals: `RateLimit`, `Limiter`, `golang.org/x/time/rate`
 *           in the same file or in an imported middleware near the upgrade call
 *         * error-text-leak signals: any `WriteMessage`/`WriteJSON` whose
 *           payload includes `err.Error()`, `%v` of an `err`, or `Sprintf("...%v")`
 *           with no obvious generic-message guard
 *   JS/TS:
 *     - Find `new WebSocket(`/`io.on('connection')` blocks
 *     - Look for similar rate-limit + leak signals.
 *
 * Emit per finding:
 *   - F-02 equivalent: MEDIUM "WebSocket route has no detected rate limiting"
 *   - F-03 equivalent: MEDIUM "WebSocket may leak internal error text to clients"
 *
 * Usage: node websocket_audit.js --target <path> [--out <file>]
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

const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'build', 'coverage', '.next', '.nuxt', '3rd-party', 'vendor', '_archive', 'bin']);

function walk(dir, acc = []) {
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return acc; }
  for (const e of entries) {
    if (SKIP_DIRS.has(e.name)) continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) walk(full, acc);
    else if (e.isFile() && /\.(?:go|js|jsx|ts|tsx|mjs)$/i.test(e.name)) acc.push(full);
  }
  return acc;
}

const isIgnored = makeChecker(TARGET);
const files = walk(TARGET).filter(f => !isIgnored(f));

const findings = [];
const nextId = makeIdAllocator();

// Per-file analysis
for (const file of files) {
  let text;
  try { text = fs.readFileSync(file, 'utf8'); } catch { continue; }
  const rel = path.relative(TARGET, file).replace(/\\/g, '/');

  // Detect WS upgrade
  const goUpgradeRe = /\b(?:upgrader|websocket|conn)\s*[\.:]\s*Upgrade(?:r)?\s*\(|websocket\.Upgrade\s*\(/g;
  const jsWsConnRe = /new\s+WebSocketServer\s*\(|wss?\.on\s*\(\s*['"`]connection['"`]|io\.on\s*\(\s*['"`]connection['"`]/g;
  const isGo = /\.go$/.test(file);
  const upgradeRe = isGo ? goUpgradeRe : jsWsConnRe;
  let m;
  let upgradeLines = [];
  while ((m = upgradeRe.exec(text)) !== null) {
    const line = text.slice(0, m.index).split('\n').length;
    upgradeLines.push({ line, snippet: text.split('\n')[line - 1] || '' });
  }
  if (upgradeLines.length === 0) continue;

  // Rate-limit signals (file-local + simple import-line check)
  const hasRateLimit = /\b(?:RateLimit|Limiter|rate\.NewLimiter|token.?bucket|express-rate-limit|rate-limiter-flexible|fastify-rate-limit)\b/i.test(text)
    || /golang\.org\/x\/time\/rate/.test(text);

  // Error-leak signals. The leak can take several forms within a WS handler file:
  //   (a) err.Error() passed to any Send*/Write*/Emit*/Respond* method
  //       e.g.   conn.SendError(taskId, err.Error())
  //              ws.WriteJSON({"error": err.Error()})
  //   (b) fmt.Sprintf("...%v...", err) anywhere in the file — the formatted
  //       string is almost always relayed to the client when a WS upgrade exists.
  //       e.g.   "error": fmt.Sprintf("User not found: %v", err)
  //   (c) Direct `"error": err.Error()` in a map/struct literal — same idea.
  //
  // We collect ALL distinct leak locations (not just the first) so the report
  // shows the full surface, not a single representative.
  const leakPatterns = [
    { name: 'err.Error() to Send/Write/Emit/Respond method',
      re: /\b(?:Send|Write|Emit|Respond|Broadcast)\w*\s*\([^)]*\berr\.Error\(\s*\)/g },
    { name: 'fmt.Sprintf with %v/%s of err',
      re: /fmt\.Sprintf\s*\(\s*[`"][^`"]*%[svdq+#xX][^`"]*[`"]\s*,\s*(?:[^,)]+,\s*)*err\b/g },
    { name: '"error" key bound to err.Error()',
      re: /["']error["']\s*:\s*err\.Error\(\s*\)/g },
    { name: '"error" key bound to fmt.Sprintf(...err)',
      re: /["']error["']\s*:\s*fmt\.Sprintf\s*\(\s*[`"][^`"]*%[svdq+#xX][^`"]*[`"]\s*,\s*(?:[^,)]+,\s*)*err\b/g },
  ];
  const lines = text.split('\n');
  const leaks = []; // { line, snippet, pattern }
  const seenLines = new Set();
  for (const p of leakPatterns) {
    const re = new RegExp(p.re.source, p.re.flags);
    while ((m = re.exec(text)) !== null) {
      const ln = text.slice(0, m.index).split('\n').length;
      if (seenLines.has(ln)) continue;
      seenLines.add(ln);
      leaks.push({ line: ln, snippet: (lines[ln - 1] || '').trim().slice(0, 200), pattern: p.name });
    }
  }

  // F-02 equivalent: no rate-limit detected near WS upgrade
  if (!hasRateLimit) {
    findings.push(finding({
      id: nextId(1, 'WS'),
      round: 1,
      severity: 'MEDIUM',
      category: 'WS',
      title: `WebSocket handler in ${rel} has no detected rate limiting`,
      location: { file: rel, line: upgradeLines[0].line },
      evidence: {
        tool: 'websocket_audit',
        upgrade_locations: upgradeLines.slice(0, 5),
        rate_limit_signals: { found: false, looked_for: ['RateLimit', 'Limiter', 'rate.NewLimiter', 'express-rate-limit', 'rate-limiter-flexible'] },
        note: 'An attacker can open many concurrent WebSocket connections before authentication fires, exhausting server goroutines / event-loop slots. Add IP-based token-bucket or connection-count limiter on the WS path.',
      },
      remediation: `Add a lightweight rate-limit middleware on the WebSocket route in ${rel}, before the HTTP→WebSocket upgrade.`,
      compliance: 'Audit-critical',
      scanner: 'websocket_audit',
    }));
  }

  // F-03 equivalent: error text leaks to client
  if (leaks.length > 0) {
    findings.push(finding({
      id: nextId(1, 'WS'),
      round: 1,
      severity: 'MEDIUM',
      category: 'WS',
      title: `WebSocket may leak internal error text to clients in ${rel} (${leaks.length} location${leaks.length === 1 ? '' : 's'})`,
      location: { file: rel, line: leaks[0].line },
      evidence: {
        tool: 'websocket_audit',
        leak_locations: leaks.slice(0, 20),
        total_leaks: leaks.length,
        patterns_matched: [...new Set(leaks.map(l => l.pattern))],
        note: 'Internal database / system error text reaches the client. Exposes schema, table names, connection state, or stack-frame hints. Send a generic message to the client and log the internal error server-side only via your structured logger.',
      },
      remediation: `For each location in ${rel}, replace the leaking payload with a generic client-facing message (e.g., "Authentication failed", "Internal error"); log the original \`err\` via logrus / zap / your structured logger so it stays server-side.`,
      compliance: 'Audit-critical',
      scanner: 'websocket_audit',
    }));
  }
}

if (OUT) fs.writeFileSync(OUT, JSON.stringify(findings, null, 2));
else process.stdout.write(JSON.stringify(findings, null, 2) + '\n');
