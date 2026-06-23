---
name: phase6-user-testing
description: "Phase 6 of the build lifecycle. User testing, Phase A: generate test-plan.md + manual test scripts (committed under app/test/manual/) + a comprehensive automated suite (E2E + integration in app/test/e2e/) covering every FR's acceptance criteria. Phase B: ingest session results and decide advance vs send-back. Auto-detects which phase based on existing artifacts. Hard-blocks if ./app/ isn't built. Usage: /phase6-user-testing [--module moduleName] [--phase generate|ingest]"
user-invocable: true
---

# /phase6-user-testing: Phase 6: User Testing

Validate the build with real users. Two phases:

- **Phase A (generate)**: produce `test-plan.md`, write step-by-step **human-runnable test scripts** to `./app/test/manual/`, and generate a **comprehensive automated test suite** in `./app/test/e2e/` covering every FR's acceptance criteria.
- **Phase B (ingest)**: once human session notes are dropped under `./phases/phase6-user-testing/inputs/`, re-invoke the skill. It reads the notes, runs the automated suite, classifies issues by severity, decides advance-to-`/phase7-user-acceptance` vs send-back-to-`/phase5-development`, and produces `test-results.md`.

The skill auto-detects which phase based on what already exists locally. Force with `--phase generate` or `--phase ingest`.

Output: `./phases/phase6-user-testing/output/test-plan.md` (Phase A) and
`./phases/phase6-user-testing/output/test-results.md` (Phase B).

## Arguments

- `--module moduleName`: (optional) Scope to a single module.
- `--phase generate|ingest`: (optional) Force the phase. Auto-detected otherwise.

## Hard-blocks

This skill refuses to proceed when:
- `./app/` does not exist OR has no `package.json` (nothing to test).
- `./phases/phase1-requirements/output/requirements.md` is missing (no acceptance criteria to test against).

For Phase B specifically:
- `./phases/phase6-user-testing/output/test-plan.md` from Phase A must exist.
- At least one session-result file must be present under
  `./phases/phase6-user-testing/inputs/` (e.g.
  `session-notes-<tester>.md` or filled-in copies of the manual scripts).

---

## Execution Steps

### Step 0: Load context

1. Load methodology: `.claude/skills/phase6-user-testing/methodology.md`
2. Load testing standard: `.claude/standards/04-testing.md`
3. Load accessibility standard: `.claude/standards/05-accessibility.md` (a11y is part of phase 6)
4. Create the directories if they do not exist:

```bash
mkdir -p ./phases/phase6-user-testing/inputs ./phases/phase6-user-testing/output
```

### Step 1: Verify upstream deliverables

```bash
if [ ! -f ./app/package.json ]; then
  echo "/phase6-user-testing hard-block: ./app/ does not exist or is unscaffolded. Run /build then /phase5-development first." >&2
  exit 1
fi

if [ ! -f ./phases/phase1-requirements/output/requirements.md ]; then
  echo "/phase6-user-testing hard-block: ./phases/phase1-requirements/output/requirements.md missing. Phase 6 needs FR acceptance criteria to write tests against." >&2
  exit 1
fi
```

### Step 2: Resolve phase (auto-detect or forced)

```bash
PHASE="${PHASE:-auto}"   # generate | ingest | auto

if [ "$PHASE" = "auto" ]; then
  if [ -f ./phases/phase6-user-testing/output/test-plan.md ] \
     && [ -n "$(ls -A ./phases/phase6-user-testing/inputs 2>/dev/null)" ]; then
    PHASE="ingest"
  else
    PHASE="generate"
  fi
fi
echo "Operating in phase: $PHASE"
```

---

## Phase A: Generate (PHASE=generate)

### Step 3A: Build the test plan + scripts + automated suite (per `methodology.md` §2)

1. **Read `./phases/phase1-requirements/output/requirements.md`** and extract every FR's acceptance criteria. Each AC becomes at least one test.
2. **Define test personas**: at minimum: "anonymous visitor," "authenticated user (basic role)," "admin." Add project-specific personas from requirements §2 Stakeholders.
3. **Write manual test scripts** to `./app/test/manual/`, one file per scenario. Format:

   ```markdown
   # Manual Test: <Scenario name>

   - **Persona:** authenticated user
   - **FRs covered:** FR-014, FR-015
   - **Pre-conditions:** Logged in. At least 3 projects exist.
   - **Estimated duration:** 4 min

   ## Steps

   1. Click "New project" in the top nav.
      **Expected:** Modal opens with a form. Title field is focused.
   2. Type "Q3 Strategy" in the Title field, leave Description blank.
      **Expected:** Title field shows the typed value. No errors yet.
   3. Click "Create".
      **Expected:** Modal closes. New project appears in the list at the top. Toast "Project created" appears for ~3s.
   4. Click the new "Q3 Strategy" project.
      **Expected:** Project detail page loads. URL contains the project's UUID. Title matches.

   ## Success criteria

   - All 4 steps produce the expected result.
   - No console errors during the flow.
   - Total time under 30 seconds.

   ## Tester notes

   <Leave blank; testers fill this in during the session>
   ```

   Write one script per major user task flow (typically 5-15 scripts for an enterprise app).

4. **Generate the automated suite** to `./app/test/e2e/` covering every FR's acceptance criteria. Use Playwright (or the test framework already in `template/public/`). Each test cites its FR ID in a comment and the test name. Example:

   ```typescript
   // FR-014: User can create a project with title only
   test('create project with minimum fields', async ({ page }) => {
     await loginAs(page, 'authenticated-user');
     await page.click('[data-testid="new-project"]');
     await page.fill('[data-testid="title"]', 'Q3 Strategy');
     await page.click('[data-testid="submit"]');
     await expect(page.getByText('Project created')).toBeVisible();
     await expect(page).toHaveURL(/\/projects\/[a-f0-9-]+$/);
   });
   ```

   Write one or more automated tests per FR's AC. NFRs that automate (a11y via axe-playwright, perf via lighthouse-ci) get tests too.

5. **Wire the suite into `package.json`:**
   ```json
   "scripts": {
     "test:e2e": "playwright test",
     "test:manual": "echo 'Manual scripts in app/test/manual/; run by hand'"
   }
   ```

6. **Run the automated suite once** to confirm it executes against the dev/preview build. Capture the count of passing/failing tests; failing tests at this stage become Issues in test-results.md when Phase B runs.

7. **Commit the test artifacts** (atomic, message references the FRs the new tests cover).

### Step 4A: Produce `test-plan.md`

Write to `./phases/phase6-user-testing/output/test-plan.md` per
`output-template.md`. Structure must include the manual-script index, the
automated-suite FR coverage table, the persona list, the issue severity
rubric, and the test environment block (preview URL, test accounts).

### Step 5A: Gate check

```bash
node .claude/scripts/check-step-gates.mjs phase6-user-testing
```

This executes:
- `check-test-presence.mjs`: real test files exist for must-have FRs.
- `validate-step-output.mjs phase6-user-testing`: output structure correct.

Tell the human: drop session notes (or filled-in manual scripts) under
`./phases/phase6-user-testing/inputs/` and re-invoke
`/phase6-user-testing` (Phase B).

---

## Phase B: Ingest (PHASE=ingest)

### Step 3B: Read session results

Read every file under `./phases/phase6-user-testing/inputs/`: session
notes, filled-in manual scripts, screenshots, bug reports. Aggregate.

```bash
ls ./phases/phase6-user-testing/inputs/
```

If testers filled in the manual script files in `./app/test/manual/`, read
those too, they may contain inline tester notes.

### Step 4B: Run the automated suite + collect results

```bash
cd ./app && npm run test:e2e -- --reporter=json > ../phases/phase6-user-testing/inputs/e2e-results.json
cd ..
```

Also run NFR validations:
- a11y: `npx axe-playwright` or equivalent against the preview build
- perf: `npx lighthouse <preview-url> --output=json` or `lighthouse-ci`

### Step 5B: Analyze + classify issues

Per `methodology.md` §3:

1. Compute task success rates per scenario (passes / total testers per scenario)
2. Classify every issue (manual + automated failures + NFR violations) by severity:
   - **Critical:** blocks core happy path; data loss; security regression. → triggers send-back to `/phase5-development`.
   - **Major:** important flow broken or seriously degraded; needs fix before `/phase7-user-acceptance`.
   - **Minor:** cosmetic / edge-case / nice-to-have; can defer to post-launch backlog.
3. Decide: send-back to `/phase5-development` (any criticals) OR advance to `/phase7-user-acceptance` (only minors remain) OR mixed (advance with majors documented as must-fix-before-`/phase8-deployment`).

### Step 6B: Produce `test-results.md`

Write to `./phases/phase6-user-testing/output/test-results.md` per
`output-template.md`. The §3.10 Decision section must state explicitly:
`advance` OR `send-back-to-phase5`. The next phase (`/phase7-user-acceptance`)
hard-blocks if this says `send-back`.

### Step 7B: Gate check

```bash
node .claude/scripts/check-step-gates.mjs phase6-user-testing
```

### Step 8: Report to user

Summarize:
- Phase executed (generate / ingest)
- Phase A: scripts written, automated tests added, FR coverage achieved
- Phase B: sessions ingested, task success rates, issues by severity, decision (advance / send-back), automated suite + NFR validation results
- Open questions for the human reviewer

---

## What this skill should NOT do

- Don't skip writing manual scripts even if automated coverage is high. Humans catch UX issues automation never will.
- Don't skip writing automated tests just because manual scripts exist. Automated tests catch regressions during `/phase8-deployment`.
- Don't classify a critical issue as "major" to keep things moving. Send-backs are the project's immune system; suppressing them creates production incidents.
- Don't run `/phase6-user-testing --phase ingest` before a human has actually run sessions. The session notes under `./phases/phase6-user-testing/inputs/` are the input.
- Don't forget to commit the test files. Tests not in the repo = tests that don't run in CI.
