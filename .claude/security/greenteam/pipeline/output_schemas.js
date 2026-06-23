/**
 * output_schemas.js — canonical Finding shape for the greenteam framework.
 *
 * Every scanner emits an array of Finding objects to a JSON file under
 * deliverables/. The aggregator merges them into greenteam_findings.json.
 *
 * Finding IDs follow the pattern G-R<round>-<sec>-<NNN>:
 *   G-R1-DEP-001  — round 1, dependency category, ordinal 001
 *   G-R2-COV-014  — round 2, coverage category, ordinal 014
 *
 * Severity scale (matches blueteam / redteam): CRITICAL | HIGH | MEDIUM | LOW | INFO | CLEARED.
 *
 * Category codes (short, grep-friendly):
 *   DEP    dependency vulnerability (npm audit, govulncheck)
 *   SECRET secret / credential leakage
 *   SQL    SQL-injection / unsafe SQL construction
 *   XSS    cross-site scripting / unsafe DOM
 *   WS     websocket / realtime channel
 *   MIG    database migration integrity
 *   LIC    licence (GPL/AGPL exposure)
 *   UNUSED unused / dead dependency
 *   CIRC   circular import / dependency
 *   FMT    formatting / style standard absent
 *   TC     TypeScript type-check
 *   LINT   ESLint / golangci-lint
 *   COV    test coverage shortfall
 *   TEST   missing or non-runnable test wiring
 *   CI     CI/CD pipeline gap
 *   RT     runtime bug / dead handler / no-undef
 *   CONF   configuration / env default
 *   API    OpenAPI / contract drift
 *   TOOL   toolchain availability / OS support
 *   BIN    compiled binary checked in
 *   AI     credentials/PII committed by AI tooling
 */

export const SEVERITIES = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'INFO', 'CLEARED'];

export const CATEGORIES = [
  'DEP', 'SECRET', 'SQL', 'XSS', 'WS', 'MIG', 'LIC', 'UNUSED', 'CIRC',
  'FMT', 'TC', 'LINT', 'COV', 'TEST', 'CI', 'RT', 'CONF', 'API',
  'TOOL', 'BIN', 'AI',
];

/**
 * Build a Finding. All fields required except where marked optional.
 */
export function finding({
  id,           // string, e.g. "G-R1-DEP-001"
  round,        // 1 | 2
  severity,     // one of SEVERITIES
  category,     // one of CATEGORIES
  title,        // short headline
  location,     // { repo?: string, file?: string, line?: number|null }
  evidence,     // { tool: string, raw?: string, count?: number, ... }
  remediation,  // string (what to do)
  compliance,   // optional: "Top-priority" | "Audit-critical" | "Process gap" | "Hygiene" | "Polish" | "Toolchain" | ""
  status,       // optional: "open" | "cleared" | "carried-forward" | "by-design"
  scanner,      // which scanner emitted this finding (filename without extension)
}) {
  if (!SEVERITIES.includes(severity)) {
    throw new Error(`Finding.severity must be one of ${SEVERITIES.join(', ')} (got ${severity})`);
  }
  if (!CATEGORIES.includes(category)) {
    throw new Error(`Finding.category must be one of ${CATEGORIES.join(', ')} (got ${category})`);
  }
  return {
    id, round, severity, category, title,
    location: location || { repo: null, file: null, line: null },
    evidence: evidence || {},
    remediation: remediation || '',
    compliance: compliance || '',
    status: status || 'open',
    scanner: scanner || null,
  };
}

/**
 * Wrap a list of findings into the canonical deliverable file.
 */
export function deliverable(findings, meta = {}) {
  return {
    schemaVersion: 1,
    framework: 'greenteam',
    generatedAt: new Date().toISOString(),
    target: meta.target || null,
    rounds: meta.rounds || [1, 2],
    summary: summarize(findings),
    findings,
  };
}

function summarize(findings) {
  const bySeverity = Object.fromEntries(SEVERITIES.map(s => [s, 0]));
  const byCategory = {};
  const byRound = { 1: 0, 2: 0 };
  for (const f of findings) {
    bySeverity[f.severity] = (bySeverity[f.severity] || 0) + 1;
    byCategory[f.category] = (byCategory[f.category] || 0) + 1;
    byRound[f.round] = (byRound[f.round] || 0) + 1;
  }
  return { total: findings.length, bySeverity, byCategory, byRound };
}

/**
 * Allocate the next ordinal ID for a given round + category.
 * Useful when several scanners write into the same category.
 */
export function makeIdAllocator() {
  const counters = {};
  return function nextId(round, category) {
    const key = `R${round}-${category}`;
    counters[key] = (counters[key] || 0) + 1;
    return `G-${key}-${String(counters[key]).padStart(3, '0')}`;
  };
}
