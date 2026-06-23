---
name: 02-judgement-pass-agent
phase: Phase 2
description: Read the deterministic findings then decide which are real violations vs. legitimate uses (rules 6/7/9/10 in particular). Set status:"cleared" on filtered findings with the reasoning; this judgement pass is AI-driven.
---

# Phase 2: Judgement Pass Agent

The deterministic scanners over-fire by design on rules with legitimate
non-AI uses. This agent reads each finding's `quote` field (the
surrounding line context) and decides whether the match is a real style
violation or a false positive that should be cleared.

## When to clear a finding

Mark `status: cleared` (preserved in the report, not deleted) with a
short reasoning when:

| Rule | Clear when |
|---|---|
| 6 (banned vocab) | The word is used non-metaphorically. "Navigate" in a real navigation context (URL, file path, geography) is fine. "Landscape" describing actual terrain is fine. "Journey" describing a literal trip is fine. |
| 6 (sentence openers) | "Moreover" / "Furthermore" inside a quoted academic-style passage where the writer is parodying or citing. |
| 7 (rule of three) | The three items are genuinely distinct (for example a list of primary colors; a list of tiers like frontend / backend / database). Clear unless the three items are clearly rhetorical filler. |
| 9 (ensure) | The "ensure" is inside test code (`expect(...).toEnsure(...)`, `ensures(...)`, function names containing `ensure`). It's an API name, not a hedge. |
| 9 (ensure) | The "ensure" is in a list of formal requirements ("The system shall ensure X"). RFC-style. |
| 10 (intensifier) | The intensifier is precise (paired with a specific measurement, temperature, or benchmark number). |
| 10 (intensifier) | The intensifier is in a quoted speaker's words. |
| 2 (em dash) | In code (sometimes valid in literals); in URLs; in already-emitted output strings; but treat doubt as "leave it open". |
| 4 (cinematic) | The short-sentence run is conveying genuine speed (e.g., a checklist item summary, a status update). |
| 11 (decoration) | Emoji inside a localisation / unicode test file (e.g., `\u{1F600}` in a test asserting unicode handling). |

## When to KEEP open (do not clear)

- Rules 1, 3, 5, 11 (HIGH severity): default to keeping open unless the
  evidence is conclusively a legitimate use. These four are near-certain
  AI tells.
- Any finding in a heading or opening paragraph: keep open. The first
  thing the reader sees deserves more scrutiny.
- Cumulative effect: 5+ rule-6 banned-word hits in the same paragraph
  should all stay open even if individual words have plausible alternatives.

## How to record clearance

Update each cleared finding in-place:

```js
{
  ...originalFinding,
  status: "cleared",
  clearance_reason: "...",      // ONE short sentence
  judgement_agent: "manual"     // mark the audit trail
}
```

Then re-run `scripts/report_generator.js` to refresh the MD + HTML.

## What this agent should NOT do

- Don't delete findings. `status: cleared` preserves the audit trail.
- Don't lower severity. The rule severity is fixed in
  `output_schemas.js`. If a finding is legitimate, clear it; don't
  downgrade.
- Don't clear in bulk. Each clearance needs a one-sentence reasoning so
  a future reviewer understands the verdict.
- Don't clear rule 1, 3, 5, 11 findings without a clear, specific
  reason. These are the framework's "default-trust-the-scanner" rules.
