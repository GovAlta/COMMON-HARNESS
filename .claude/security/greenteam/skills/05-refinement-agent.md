---
name: 05-refinement-agent
phase: Round 2 (final pass)
description: Re-frame findings with corrected tooling flags and by-design context. Downgrades coverage findings when test-bypass is build-tag-fenced; downgrades type-check findings when --skipLibCheck resolves them; preserves findings that look like green CI but are actually wallpaper over a bug.
---

# Refinement Agent

The refinement agent is the framework's signature. It runs AFTER the
Round 2 test execution + CI audit and AFTER the test-bypass audit. It
mutates findings in-place using the canonical rules in
`scripts/refinement_pass.js`.

The principle behind refinement: many "obvious" Round-2 findings are
mathematically correct but misleading without context. A by-design
test-bypass pattern makes the auth package look 0.2%-covered when in
fact it is heavily integration-tested. A vue-tsc abort in node_modules
masks a clean source tree. Each correction is encoded mechanically.

The principle behind NOT refining: sometimes the apparent green signal
is wallpaper. CI passes because the env override sets the value the
source default got wrong. Refinement must not erase the underlying
bug; it must only correct the framing.

## What it covers

| Rule | Effect |
|---|---|
| Test-bypass downgrade | HIGH/CRITICAL Go coverage findings on auth/security packages → LOW, status: by-design, evidence linked to integration test enumeration |
| vue-tsc --skipLibCheck downgrade | HIGH "type errors invisible" → LOW when source is clean with the flag |
| API baseURL inconsistency preservation | Keep HIGH even if CI env overrides; source default is still wrong |
| Test wiring (R2-B-02 refined) | "no test script" downgrade when running `npx vitest` directly DOES surface tests |
| Test-execution by-design | Vitest coverage absent only because tests fail → MEDIUM with the underlying test failure as the actual cause |

## Execution

Refinement is the last step. It reads the pre-refinement findings list,
applies rules, and writes the refined list back to the orchestrator.

```bash
node scripts/refinement_pass.js \
  --in  deliverables/per-scanner/_pre_refinement.json \
  --out deliverables/per-scanner/_pre_refinement.json.out
```

The orchestrator (`pipeline/run_all.js`) runs this automatically.

## What this agent should NOT do

- Don't downgrade a finding just because there's a workaround. A CI
  env-var override of a wrong source default is a workaround, not a
  fix.
- Don't clear (`status: cleared`) a finding without a code change. The
  only paths to `cleared` are: code was edited, or the original
  observation was a false positive.
- Don't invent refinements that aren't in `refinement_pass.js`. Every
  refinement is mechanical and traceable.
- Don't refine across rounds: a Round 1 dependency vulnerability is
  not by-design just because the team has an integration test.
