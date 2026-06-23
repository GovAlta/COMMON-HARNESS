---
name: yellowteam
description: "Run a yellow team AI-smell review against a target codebase or set of documents. Deterministic 12-rule audit against the harness writing style guide (No Not-X-but-Y, no em dashes, no rhetorical tetracolons, no cinematic short sentences, no rhetorical anchors, banned vocabulary, no rule-of-three flourishes, no participial tails, no ensure-hedge, no vague intensifiers, no decorations/emojis, no AI smell). Produces an AI Smells Report (JSON + MD + HTML) per target. Usage: /yellowteam [--target /path/to/repo] [--scope all|prose|code]"
user-invocable: true
---

# Yellow Team AI-Smell Review

Run the full deterministic style audit against a target. Yellowteam mirrors
blueteam (defensive), redteam (offensive), and greenteam (code quality)
with a fourth dimension: writing-style integrity.

The framework runs 12 scanners, one per hard rule from the harness
writing style guide, and produces an **AI Smells Report** with per-file
findings, severity, the offending quote, and a concrete rewrite.

## Usage

```
/yellowteam                              # Audit ./ with full scope
/yellowteam --target /path/to/repo       # Audit a different target
/yellowteam --scope prose                # Only README / .md / .txt / docs (skip code)
/yellowteam --scope code                 # Only source-file comments + docstrings
/yellowteam --skip rule07,rule10         # Skip noisier rules
```

## Prerequisites

```bash
cd .claude/security/yellowteam && npm install
# No third-party deps: pure Node 20+. npm install is a no-op.
```

## Pipeline

Execute these steps in order. Read `.claude/security/yellowteam/CLAUDE.md`
for the full protocol.

| Step | Phase | Skill File |
|---|---|---|
| 1 | Deterministic per-rule scanners (12 rules) | `skills/01-deterministic-scan-agent.md` |
| 2 | AI judgement pass (filter over-fires, clear noise) | `skills/02-judgement-pass-agent.md` |
| 3 | Report generation (MD + HTML AI Smells Report) | `skills/03-report-generation-agent.md` |

## End-to-end orchestrator

```bash
cd .claude/security/yellowteam
node pipeline/run_all.js --target /path/to/repo --verbose
node scripts/report_generator.js
node scripts/validate_report.js
```

Output drops:

- `deliverables/yellowteam_findings.json`: canonical machine-readable
- `deliverables/yellowteam_findings.md`: human-readable per-file findings
- `deliverables/yellowteam_findings.html`: browsable AI Smells Report
- `deliverables/per-scanner/rule*.json`: raw per-rule output

## Severity scale

`HIGH | MEDIUM | LOW | INFO`. The four rules with default-HIGH severity
(Not-X-but-Y, tetracolons, rhetorical anchors, decorations/emoji) are
near-certain AI tells. MEDIUM rules are strong signals with occasional
legitimate uses. LOW rules over-fire, the judgement pass must filter.

## When to invoke

Auto-invoke before producing any:

- README, CHANGELOG, RUNBOOK
- ADR or architecture decision
- Release notes
- Training material
- External-facing communications
- Customer-facing documentation
- Sales / marketing copy
- LinkedIn posts
- Any prose intended for a non-internal audience

Manually invoke during periodic codebase audits or before a major release.

## Cross-framework integration

After yellowteam completes, findings can inform:

- Blueteam findings in user-facing security communications (those need
  HIGH style cleanliness , `/yellowteam` should clear them)
- Greenteam findings in CLAUDE.md / README updates (avoid recap loops
  when documenting harness rule changes)
- Documentation for new skills, the style guide applies to skill
  `description:` and SKILL.md prose

## Safety rules

- Do not modify the target's source files; yellowteam is read-only
- Do not delete cleared findings, keep them with `status: cleared` so the
  audit reader sees what was reviewed-and-dismissed vs. not-reviewed
- Do not skip the judgement pass on documents that will be published.
  rules 7 and 10 over-fire and need filtering
- All HTML reports must be script-generated, never hand-crafted
