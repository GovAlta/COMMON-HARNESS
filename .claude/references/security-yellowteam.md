# Yellow Team AI-Smell Review: Reference

Pointer doc for the yellowteam framework. Full execution protocol lives
at `.claude/security/yellowteam/CLAUDE.md`.

## What yellowteam covers

Deterministic AI-prose audit against the 12 hard rules in
`.claude/skills/style-guide/style-rules.md`. Each rule has a dedicated
scanner; the framework emits findings with the offending quote, a
concrete rewrite, and a "why this is an AI tell" explanation.

## When to use it

| Situation | Run |
|---|---|
| Before publishing user-facing prose | `/yellowteam` (prose scope) |
| Codebase prose audit (quarterly) | `/yellowteam` (all scope) |
| Comment-quality check on a module | `/yellowteam --scope code` |
| Quick check on a single file | `/style-guide <path>` (lighter-weight) |

## Output

- `deliverables/yellowteam_findings.json`: canonical
- `deliverables/yellowteam_findings.md`: human-readable per-file findings
- `deliverables/yellowteam_findings.html`: browsable AI Smells Report
- `deliverables/per-scanner/rule*.json`: raw per-rule output

## Finding schema

Findings use `Y-R<rule>-NNN` IDs where rule is the 2-digit rule number, severities `HIGH | MEDIUM | LOW | INFO`, and status `open | cleared`.

## Cross-references

- `.claude/skills/style-guide/`: the single-file companion skill (good
  for ad-hoc checks); yellowteam is the heavier batch audit
- `.claude/skills/style-guide/style-rules.md`: the rule text
- `.claude/security/blueteam/`: defensive security
- `.claude/security/redteam/`: offensive security
- `.claude/security/greenteam/`: code-quality multi-round review
