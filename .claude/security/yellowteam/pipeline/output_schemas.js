/**
 * output_schemas.js — canonical Finding shape for the yellowteam framework.
 *
 * Each scanner emits an array of Finding objects to a JSON file under
 * deliverables/per-scanner/. The aggregator merges them into
 * deliverables/yellowteam_findings.json.
 *
 * Finding ID convention: Y-R<ruleNumber>-NNN
 *   Y-R01-001  — rule 1 (not-X-but-Y), ordinal 001
 *   Y-R11-014  — rule 11 (decorations), ordinal 014
 *
 * Severity:
 *   HIGH    = pattern is a strong AI-tell that almost never has a legitimate
 *             use; reader will recognise it as AI-generated.
 *   MEDIUM  = pattern is suspicious; may be legitimate in some contexts but
 *             should be reviewed.
 *   LOW     = stylistic preference, low-confidence detection, easy to ignore
 *             if context warrants.
 *   INFO    = positive evidence / cleared findings.
 *
 * Rule severity defaults:
 *   Rule 1  (not-X-but-Y)            → HIGH
 *   Rule 2  (em dash)                → MEDIUM
 *   Rule 3  (tetracolon)             → HIGH
 *   Rule 4  (cinematic sentences)    → MEDIUM
 *   Rule 5  (rhetorical anchors)     → HIGH
 *   Rule 6  (banned vocabulary)      → MEDIUM
 *   Rule 7  (rule of three)          → LOW
 *   Rule 8  (participial tail)       → MEDIUM
 *   Rule 9  (ensure hedge)           → MEDIUM
 *   Rule 10 (vague intensifiers)     → LOW
 *   Rule 11 (decorations / emojis)   → HIGH
 *   Rule 12 (AI smell)               → MEDIUM
 */

export const SEVERITIES = ['HIGH', 'MEDIUM', 'LOW', 'INFO'];

export const RULES = {
  1: { name: 'not-X-but-Y',           default: 'HIGH' },
  2: { name: 'em-dash',               default: 'MEDIUM' },
  3: { name: 'tetracolon',            default: 'HIGH' },
  4: { name: 'cinematic-sentences',   default: 'MEDIUM' },
  5: { name: 'rhetorical-anchor',     default: 'HIGH' },
  6: { name: 'banned-vocabulary',     default: 'MEDIUM' },
  7: { name: 'rule-of-three',         default: 'LOW' },
  8: { name: 'participial-tail',      default: 'MEDIUM' },
  9: { name: 'ensure-hedge',          default: 'MEDIUM' },
 10: { name: 'vague-intensifier',     default: 'LOW' },
 11: { name: 'decorations-emoji',     default: 'HIGH' },
 12: { name: 'ai-smell',              default: 'MEDIUM' },
};

export function finding({
  id,
  rule,                 // integer 1-12
  severity,             // override; defaults to RULES[rule].default
  title,                // short headline
  location,             // { file, line, col? }
  match,                // the offending text matched
  quote,                // the full line for context
  rewrite,              // optional suggested rewrite
  why,                  // why this is an AI tell / what the rule says
  scanner,
  status,               // optional: 'open' | 'cleared'
}) {
  if (!(rule in RULES)) throw new Error(`Finding.rule must be 1-12 (got ${rule})`);
  const sev = severity || RULES[rule].default;
  if (!SEVERITIES.includes(sev)) throw new Error(`Finding.severity invalid: ${sev}`);
  return {
    id,
    rule,
    rule_name: RULES[rule].name,
    severity: sev,
    title,
    location: location || { file: null, line: null, col: null },
    match: match || '',
    quote: quote || '',
    rewrite: rewrite || '',
    why: why || '',
    scanner: scanner || null,
    status: status || 'open',
  };
}

export function deliverable(findings, meta = {}) {
  return {
    schemaVersion: 1,
    framework: 'yellowteam',
    generatedAt: new Date().toISOString(),
    target: meta.target || null,
    summary: summarize(findings),
    findings,
  };
}

function summarize(findings) {
  const bySeverity = Object.fromEntries(SEVERITIES.map(s => [s, 0]));
  const byRule = {};
  const byFile = {};
  for (const f of findings) {
    bySeverity[f.severity] = (bySeverity[f.severity] || 0) + 1;
    byRule[`R${String(f.rule).padStart(2, '0')}-${f.rule_name}`] = (byRule[`R${String(f.rule).padStart(2, '0')}-${f.rule_name}`] || 0) + 1;
    const file = f.location?.file || '(unknown)';
    byFile[file] = (byFile[file] || 0) + 1;
  }
  return { total: findings.length, bySeverity, byRule, byFile };
}

export function makeIdAllocator() {
  const counters = {};
  return function nextId(rule) {
    const key = `R${String(rule).padStart(2, '0')}`;
    counters[key] = (counters[key] || 0) + 1;
    return `Y-${key}-${String(counters[key]).padStart(3, '0')}`;
  };
}
