---
name: 01-deterministic-scan-agent
phase: Phase 1
description: Run every per-rule scanner against the target, collect findings, surface raw counts. Pure mechanical pre-pass.
---

# Phase 1: Deterministic Scan Agent

This agent invokes the 12 per-rule scanners and aggregates raw findings.
No judgement at this stage; over-fires are expected on rules 7 and 10.

## What it covers

| Rule | Scanner |
|---|---|
| 1 (Not-X-but-Y) | `scripts/rule01_not_x_but_y.js` |
| 2 (em dash) | `scripts/rule02_em_dash.js` |
| 3 (tetracolon) | `scripts/rule03_tetracolon.js` |
| 4 (cinematic sentences) | `scripts/rule04_cinematic_sentences.js` |
| 5 (rhetorical anchor) | `scripts/rule05_rhetorical_anchor.js` |
| 6 (banned vocabulary) | `scripts/rule06_banned_vocabulary.js` |
| 7 (rule of three) | `scripts/rule07_rule_of_three.js` |
| 8 (participial tail) | `scripts/rule08_participial_tail.js` |
| 9 (`ensure` hedge) | `scripts/rule09_ensure_hedge.js` |
| 10 (vague intensifiers) | `scripts/rule10_intensifier.js` |
| 11 (decorations / emoji) | `scripts/rule11_decorations_emoji.js` |
| 12 (AI smell) | `scripts/rule12_ai_smell.js` |

## Execution

```bash
cd .claude/security/yellowteam
node pipeline/run_all.js --target /path --scope prose --verbose
```

Or invoke each scanner directly when debugging:

```bash
node scripts/rule01_not_x_but_y.js --target /path --out deliverables/per-scanner/rule01.json
node scripts/rule11_decorations_emoji.js --target /path --out deliverables/per-scanner/rule11.json
# ...etc
```

## What this agent should NOT do

- Don't filter findings at this stage; the judgement agent does that.
- Don't modify scanner regex without bumping the rule's documented
  behaviour in `pipeline/output_schemas.js`.
- Don't skip rules selectively; if a rule legitimately over-fires for a
  target, document the skip in the orchestrator call via `--skip ruleNN`.
