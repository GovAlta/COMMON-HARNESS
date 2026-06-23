# Methodology: Phase 6: User Testing

> Companion to `SKILL.md` in this directory. Loaded on demand by `/phase6-user-testing`.
> No frontmatter, methodology reference, not a discoverable skill.

User testing is the first place reality contradicts assumptions. The skill
produces TWO classes of test artifact, both committed into the project:

1. **Human-runnable test scripts** in `./app/test/manual/`: step-by-step
   markdown that any tester (the project lead, a stakeholder, a usability
   panel) can follow without prior training. These catch UX issues, content
   issues, and "the documentation said this would work" issues that
   automation can't.

2. **A comprehensive automated suite** in `./app/test/e2e/`: Playwright
   (or whatever the template ships) covering every FR's acceptance criteria
   plus NFR validations (axe for a11y, lighthouse-ci for perf). Catches
   regressions during /phase8-deployment and on every CI run thereafter.

The skill runs in two phases: Phase A generates everything; Phase B ingests
human session results, runs the automated suite, classifies issues, and
decides advance-to-/phase7-user-acceptance vs send-back-to-/phase5-development.

---

## Inputs

- **Required:** `./app/` scaffolded and built. Hard-block if absent.
- **Required:** `requirements.md`: the FR acceptance criteria. Without these, you cannot write tests; hard-block if missing.
- **Recommended:** `architecture.md` (component map informs which UI areas need scenarios), `plan.md` (NFR coverage map identifies which NFRs need automated validation), `prototype-report.md` (mock inventory, touchpoints flagged DEFERRED in phase4 must get real validation now).
- **Phase B input:** session notes the human tester drops into `./phases/phase6-user-testing/inputs/` (or commits in-line annotations on the manual script files). The skill reads these notes plus any updated script files.

---

## Phase A: Generate

### 2.1 Test scope

Read `requirements.md` and build a flat catalog:

```
{
  "frs": [{ "id": "FR-014", "title": "Create project", "ac": ["...AC1...", "...AC2..."] }, ...],
  "nfrs": [
    { "id": "NFR-A11Y-01", "category": "a11y", "target": "WCAG 2.1 AA", "automatable": true },
    { "id": "NFR-PERF-01", "category": "performance", "target": "p95 < 500ms", "automatable": true },
    { "id": "NFR-USAB-01", "category": "usability", "target": "task success > 80%", "automatable": false },
    ...
  ]
}
```

Decide which FRs/NFRs are **manual-only** (judgment-based, usability, content, visual design), **automated-only** (deterministic, perf, a11y rule violations, API contract), or **both** (most happy-path flows benefit from automated regression AND a manual scenario that exercises the surrounding context).

### 2.2 Personas

Identify personas from `requirements.md §2 Stakeholders`. Default minimum:

| Persona | Use when |
|---------|----------|
| anonymous-visitor | Marketing pages, signup, public reads |
| authenticated-user | Core CRUD, the bulk of the application |
| admin | Admin-only flows; never reused with regular-user data fixtures |
| guest-with-link | Shared-link flows (if applicable) |
| service-account | API-key based agent access (if applicable) |

Each persona needs a fixture: a way to provision a clean test account with the right role + minimal seed data. Document this in `app/test/fixtures/personas.ts`.

### 2.3 Manual test scripts

A good manual script:

- Has **one clear goal** (one task flow, not three)
- Specifies **pre-conditions** the tester sets up before starting (logged-in state, data state)
- Has **5-15 numbered steps**, each with an explicit **expected result**
- Has a **success criteria** block at the end (objective pass/fail)
- Has a **tester notes** section with a guidance prompt for what to record

Storage: one .md file per scenario in `./app/test/manual/`, named `NN-<slug>.md` (e.g. `01-create-project.md`, `02-share-with-collaborator.md`). The numeric prefix sets a default order for the test session.

Cover at minimum:
- Every must-have FR's primary happy path (one script per)
- Every error/edge path the user might hit (e.g., invalid input, network blip, permission denied)
- Every accessibility-sensitive flow (keyboard-only, screen-reader)
- Every cross-feature interaction the requirements call out

Aim for 5-15 total scripts for a typical module. Fewer than 5 = under-covered; more than 20 = sessions take too long, testers fatigue, results degrade.

### 2.4 Automated test suite

Storage: `./app/test/e2e/<area>.spec.ts` (Playwright, or whatever the template uses). One spec file per area (auth, projects, modules, sharing, etc.).

For every FR's acceptance criteria, write at least one automated test:

```typescript
// FR-014: User can create a project with title only
// AC1: A logged-in user clicks "New project" and is shown a creation form.
// AC2: Submitting with valid title creates the project and shows a success toast.
// AC3: New project appears in the list immediately.
test('FR-014: create project with minimum fields', async ({ page }) => {
  await loginAs(page, 'authenticated-user');
  await page.click('[data-testid="new-project"]');
  await expect(page.getByRole('dialog', { name: /new project/i })).toBeVisible();
  await page.fill('[data-testid="project-title"]', 'Q3 Strategy');
  await page.click('[data-testid="submit"]');
  await expect(page.getByText('Project created')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Q3 Strategy' })).toBeVisible();
});
```

Conventions:
- Test name starts with `<FR-ID>:` so traceability is mechanical.
- Use `data-testid` attributes (added during /phase5-development, if missing, that's a regression to flag).
- Use ARIA-based selectors (`getByRole`, `getByLabel`) where possible, they double as a11y validators.
- Each test creates and cleans up its own data (no shared mutable state between tests).

For NFRs that automate:

| NFR | Tool | Where it lives |
|-----|------|----------------|
| WCAG 2.1 AA | `axe-playwright` | `./app/test/e2e/a11y.spec.ts` runs `await injectAxe(page)` then `await checkA11y(page, null, {...})` for every key page |
| Lighthouse perf | `lighthouse-ci` | `./app/test/perf/lighthouserc.json` + GitHub Actions step |
| Bundle size | `bundlesize` or build output diff | CI step compares against prototype baseline |
| API contract | OpenAPI conformance via `prism` or `dredd` | `./app/test/api/openapi-conformance.spec.ts` |

### 2.5 Wire into npm scripts

Add to `app/package.json`:

```json
"scripts": {
  "test:e2e":     "playwright test",
  "test:e2e:ui":  "playwright test --ui",
  "test:a11y":    "playwright test e2e/a11y.spec.ts",
  "test:perf":    "lhci autorun",
  "test:manual":  "echo 'Manual test scripts in test/manual/; open and run by hand'",
  "test:all":     "npm run test && npm run test:e2e && npm run test:a11y"
}
```

The `test:all` target should run cleanly before Phase A is declared done.

### 2.6 Run the suite once before handoff

Confirm the suite is green against the preview build before handing the build to human testers. A red suite at the start of human testing wastes everyone's time, the testers will spend the session reproducing automation issues you already knew about.

If the suite has known failures that match documented FR gaps, flag them in `test-plan.md §3.4 Automated Suite` rather than burying them.

---

## Phase B: Ingest

### 3.1 Pull session notes

Sources, in order of authority:
1. Session note files the human tester dropped in `./phases/phase6-user-testing/inputs/` (most direct).
2. Updated manual script files where testers wrote in-line `## Tester notes` content (e.g. via PR or direct push to the repo).
3. Any other artifacts the tester placed in `./phases/phase6-user-testing/inputs/` (screenshots, recordings, written summaries).

### 3.2 Run the automated suite + NFR validations

```bash
cd ./app
npm run test:e2e -- --reporter=json > ../phases/phase6-user-testing/inputs/e2e-results.json
npm run test:a11y -- --reporter=json > ../phases/phase6-user-testing/inputs/a11y-results.json
npm run test:perf > ../phases/phase6-user-testing/inputs/perf-results.json 2>&1 || true
```

Parse the results: pass/fail counts, regressions vs the prototype baseline, a11y violations by severity.

### 3.3 Compute task success rates

Per scenario:

```
success_rate = (testers_who_completed_all_steps) / (testers_who_attempted)
```

Default threshold: ≥80% per scenario for must-have FRs, ≥60% for should-have. Lower than this = the scenario found a real UX problem regardless of whether testers wrote it down.

### 3.4 Classify every issue

Issues come from three sources:
- Manual session notes
- Automated suite failures
- NFR validation failures

Severity rubric:

| Severity | Definition | Decision |
|----------|------------|----------|
| **Critical** | Blocks the core happy path. Data loss. Security regression. Auth or permission bypass. Total UX dead-end. | **Triggers send-back to /phase5-development.** No advance to /phase7-user-acceptance. |
| **Major** | Important secondary flow broken. Workaround exists but is awkward. NFR target missed by >2x (e.g., p95 = 1200ms vs target 500ms). Several testers struggled with the same UI. | Allowed to advance, but documented as **must-fix-before-/phase8-deployment** in handoff notes. /phase7-user-acceptance sign-off should call this out. |
| **Minor** | Cosmetic. Edge-case bug. Nice-to-have copy improvement. Single tester opinion. NFR target missed by <2x. | Advance freely. Add to post-launch backlog in /phase7-user-acceptance. |

Document the rubric in `test-results.md §3.7` with concrete examples from this run so future testers calibrate consistently.

### 3.5 Decide

| State | Action |
|-------|--------|
| Any criticals exist | Send-back to /phase5-development with the critical list. /phase7-user-acceptance cannot start. |
| Only majors + minors | Advance to /phase7-user-acceptance. Majors are listed in handoff notes as must-fix-before-/phase8-deployment (so /phase7-user-acceptance sign-off captures them and /phase8-deployment fixes them). |
| Only minors | Advance to /phase7-user-acceptance cleanly. Minors go to post-launch backlog. |
| Mixed but criticals are clearly fixable in <1d | Edge case. Default to send-back; the human reviewer can override on the board. |

The decision goes in `test-results.md §3.10 Send-back Decision` with rationale.

---

## Phase 4: Output structure

Two artifacts. Both share the standard 7-section skeleton + Compliance, but their bodies differ.

### test-plan.md (Phase A output)

#### 1. Executive Summary

Test scope, persona count, manual-script count, automated-test count, NFR validation set, expected duration of one full manual session (sum of script estimates).

#### 2. Inputs Consumed

requirements.md + any other prior artifacts.

#### 3. Test Plan Body

##### 3.1 Test Scope

A table mapping every FR/NFR to its test approach (manual / automated / both / deferred-with-rationale).

##### 3.2 Personas

The persona table from §2.2 with fixture references.

##### 3.3 Manual Test Scripts

A table indexing every script in `./app/test/manual/`:

| File | Scenario | Persona | FRs covered | Est duration |
|------|----------|---------|-------------|--------------|
| 01-create-project.md | Create a project | authenticated-user | FR-014, FR-015 | 4 min |
| ... | ... | ... | ... | ... |

##### 3.4 Automated Test Suite

A table mapping FR coverage to automated tests:

| FR ID | AC count | Tests | Status when plan was generated |
|-------|---------|-------|--------------------------------|
| FR-014 | 3 | e2e/projects.spec.ts:12-78 | green (3 tests) |
| ... | ... | ... | ... |

##### 3.5 NFR Validation Plan

The mapping from §2.4 (which tool covers which NFR).

##### 3.6 Test Environment

Preview URL, test account credentials reference (vault path; never inline), seed data state, time-box for sessions.

##### 3.7 Issue Severity Rubric

Reuse the Critical/Major/Minor table in §3.4 with definitions tailored to this project.

### test-results.md (Phase B output)

Same skeleton; body differs:

##### 3.1 Sessions Conducted

| Date | Persona | Tester | Scenarios run | Duration | Notes |
|------|---------|--------|---------------|----------|-------|
| 2026-MM-DD | authenticated-user | <person> | 01,02,04,05 | 22 min | smoothest run |

##### 3.2 Task Success Rates

| Scenario | Attempts | Successes | Rate | Threshold | Status |
|----------|----------|-----------|------|-----------|--------|
| 01-create-project | 4 | 4 | 100% | 80% | pass |
| 02-share-link | 4 | 2 | 50% | 80% | fail (see Issue #4) |

##### 3.3 Issues Found

| ID | Source | Scenario / Test | Severity | Description | Repro | Recommended fix |
|----|--------|-----------------|----------|-------------|-------|-----------------|
| I-001 | manual | 02-share-link | Critical | The shared link returns 404 if recipient not logged in | always | Add public-access route or redirect to SSO |
| I-002 | a11y | a11y.spec.ts:34 | Major | Modal lacks `role="dialog"` | always | Add ARIA role + label |
| ... | ... | ... | ... | ... | ... | ... |

##### 3.4 Quotes / Observations

A short list of direct tester quotes that capture sentiment beyond bug reports. Useful for /phase7-user-acceptance sign-off context.

##### 3.5 Automated Suite Results

```
e2e:    47 passing, 3 failing  (see §3.3 issue IDs I-005, I-006, I-007)
a11y:   12 passing, 1 violation (Issue I-002)
perf:   Lighthouse score 91 (target 90 ✓)
```

##### 3.6 NFR Verification Results

For each NFR, did the verification pass? Cite the evidence.

##### 3.7 Severity Rubric Calibration

If anything was edge-case-classified differently than the §2.7 rubric would suggest, document why.

##### 3.8 Issues by Disposition

| Disposition | Count | Issue IDs |
|-------------|-------|-----------|
| Send-back to /phase5-development (Critical) | 1 | I-001 |
| Must fix before /phase8-deployment (Major) | 3 | I-002, I-005, I-006 |
| Post-launch backlog (Minor) | 7 | I-003, I-004, I-007,I-011 |

##### 3.9 Send-back Decision

One paragraph: send-back to /phase5-development OR advance to /phase7-user-acceptance, with rationale citing the issue table. If send-back, list the critical issues that block. If advance, list the majors that /phase7-user-acceptance sign-off must acknowledge.

---

## Quality bar

The test plan is good when:
- Every must-have FR is covered by both at least one manual script AND at least one automated test.
- Every automatable NFR has a tool wired into the suite.
- Manual scripts have explicit pre-conditions and expected results per step.
- The whole automated suite ran green against the preview build before handoff.
- A new tester could run a session from cold by reading `test-plan.md §3.6` and the manual scripts.

The test results are good when:
- Every issue has a severity, repro steps, and a recommended fix.
- Severity classification is honest (criticals not downgraded to keep schedule).
- The send-back decision is explicit, not "tbd."
- Quotes and observations capture sentiment beyond the bug list.

The test artifacts are bad when:
- Manual scripts are vague ("test the project page").
- Automated tests don't cite their FR ID.
- Issues are listed without repro steps.
- "Severity: medium" appears (the rubric has Critical/Major/Minor, undefined severities are how things slip).
