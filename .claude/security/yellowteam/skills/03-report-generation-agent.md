---
name: 03-report-generation-agent
phase: Phase 3
description: Generate the AI Smells Report (MD + HTML). Runs after deterministic scan and judgement pass complete.
---

# Phase 3: Report Generation Agent

This agent runs `scripts/report_generator.js` and `scripts/validate_report.js`
to produce the user-facing AI Smells Report.

## What the report contains

1. **Scanner Execution panel**: every rule scanner listed with status
   (produced N findings / ran clean / not invoked) and a link to the
   raw per-scanner JSON.
2. **Summary**: severity counts + per-rule counts + worst-offender files.
3. **Findings by file**: primary view; a writer fixes one file at a
   time. Each finding inline with quote + rewrite + why.
4. **Anchor links**: every file section is linkable; every finding has a
   stable ID for cross-reference.

## Execution

```bash
cd .claude/security/yellowteam
node scripts/report_generator.js       # produces both .md and .html
node scripts/validate_report.js        # schema sanity check
```

## After generation

- Open `deliverables/yellowteam_findings.html` in any browser.
- Walk through the worst-offender files first (top of the report).
- For each file, fix findings top-down by severity (HIGH first).
- After fixing a batch, re-run `pipeline/run_all.js` to confirm the
  count drops.

## What this agent should NOT do

- Don't hand-craft HTML. The generator applies a consistent template;
  hand-crafting breaks the anchor-link contract.
- Don't summarize the findings in prose at the top; let the structured
  tables speak. The point of the report is mechanical traceability.
- Don't add a "Conclusion" or "Recommendation" section. The findings
  themselves carry the rewrite + why. A trailing summary would itself be
  a style-guide violation (it would restate what was already shown).
