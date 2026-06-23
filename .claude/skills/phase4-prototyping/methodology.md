# Methodology: Phase 4: Prototyping

> Companion to `SKILL.md` in this directory. Loaded on demand by `/phase4-prototyping`.
> No frontmatter, methodology reference, not a discoverable skill.

Build a thin end-to-end slice, the **tracer bullet**: that proves or disproves
the architecture's headline assumptions before the team commits the rest of
the plan to them. The output is twofold: a working code branch (throwaway-grade)
and a structured `prototype-report.md` capturing what was learned.

The prototype's value is asymmetric. A *successful* prototype confirms an
assumption with low cost. A *falsified* assumption is even more valuable.
you've avoided weeks of wrong-path development by burning a few days on a
stripped-down slice.

---

## Inputs

The `/phase4-prototyping` skill reads these from local files before invoking this methodology:

- **Required:** `./phases/phase3-architecture/output/architecture.md`: pattern, components, tech stack, threat model, NFR coverage. **Hard-block** if missing.
- **Optional:** ADR files alongside the architecture doc, they document the assumptions you're about to validate.
- **Optional:** `./phases/phase1-requirements/output/requirements.md` and `./phases/phase2-planning/output/plan.md` for context on which FR/NFR the prototype is anchored to.
- **Optional:** prior-phase notes the reviewer left in `./phases/phase4-prototyping/inputs/`: the human's notes usually name the specific assumption to validate.

---

## Phase 1: Scope the tracer bullet

A good tracer bullet has these properties:

| Property | What it means | What's wrong if missing |
|----------|--------------|------------------------|
| End-to-end | UI → API → data store → integration → response | Validates only the easy parts; misses the integration risks |
| Single happy path | One success scenario, one user walkthrough | Sprawls into v5-development; never finishes |
| Anchored to a specific assumption | Maps to ≥1 ADR or risky `architecture.md` claim | "Just get something running": proves nothing |
| Explicit cuts | Documented list of what's deliberately excluded | Becomes "the implementation"; team starts polishing it |
| Time-boxed | 1-3 days max | Becomes the project; no plan revision happens |

### Choosing the assumption

Read `architecture.md` §6 Handoff Notes (which lists the riskiest assumption to validate) and §10 Threat Model + §3.7 Tech Stack. Look for:

- **Integration risk**: third-party APIs, auth providers, file processing pipelines, queues. Anything that involves a network call to something the team doesn't fully control.
- **Performance assumption**: "the data store can handle this load," "the bundle size will be under N KB," "p95 < 500ms achievable."
- **Compatibility risk**: new library version, framework upgrade, browser compatibility, web-component / Shadow DOM constraints.
- **Architecture pattern fit**: "BFF pattern works here even though we have N integrations" (the pattern's load is on the BFF, does it scale?).
- **Auth + permissions risk**: "JWT + CSRF + RBAC + multi-tenant, the layers compose."

Pick the assumption whose **failure** would force the most rework. Don't pick the easy one to feel productive.

### The cut list

Document explicitly what the prototype WILL NOT include. Standard cuts:

- No styling polish (raw HTML or template defaults)
- No accessibility pass beyond what the template provides
- No PWA / service worker
- No error UX (errors throw + log; users see white-screen, fine for prototype)
- No edge-case validation (only the happy path)
- Mocked external services where possible (use one real integration, mock the rest)
- No tests (yet, tests come in /phase5-development)
- No internationalization
- No observability beyond console.log

If a cut feels uncomfortable to write down, that's a sign the prototype is being asked to do too much. Make the cut anyway and document the trade.

---

## Phase 2: Build

### 2.1 Use `/build` to scaffold

The prototype uses templates too. Never write from scratch.

```
/build frontend using <chosen client template> and backend using <chosen server template>
```

After scaffolding, strip what you don't need: extra controllers, routes, migrations, components. The scaffold is a starting *baseline*, not a constraint.

### 2.2 Implement the slice

Walk the slice end-to-end:

1. **Bootstrap**: get the dev server running with the chosen template baseline.
2. **Auth touchpoint**: confirm SSO callback works, JWT is issued, a protected route returns 401 without it. Real or stubbed.
3. **One CRUD path**: create / read at minimum; update + delete optional.
4. **One integration touchpoint**: the assumption you're validating. If it's GitHub PAT injection: actually perform a `POST /git/repos` call end-to-end. If it's a document-store upload: actually upload one file.
5. **Click-test the happy path** in a browser. Manual is fine, no automation for the prototype.

### 2.3 Capture a performance baseline

While the slice is running, record:

| Metric | How to measure |
|--------|----------------|
| Frontend bundle size | `npm run build` output (chunks + gzip sizes) |
| Cold-start time | `npm run dev` to "ready" timestamp |
| First-meaningful-paint | Browser DevTools Performance tab, or Lighthouse |
| API p95 latency | A 50-request loop with `curl -w "%{time_total}\n"` and `sort | tail -3` |
| DB query plan | `EXPLAIN ANALYZE` on the riskiest query |

These numbers go into `prototype-report.md §3.5` as a baseline for /phase5-development; if production p95 drifts above this baseline by 2x, treat it as a regression.

### 2.4 Honest mocking

If you mocked an external service, the prototype did not validate that integration. State this clearly. Examples:

- "Mocked the document-store upload because tenant access wasn't ready. The local API was called; the upstream call returned a stubbed response. Validation of actual upload deferred to /phase5-development."
- "Mocked email send. Validated the queue dispatch but not the SES delivery."

A prototype that "validates" a mocked integration is a prototype that proves nothing about that integration.

---

## Phase 3: Output structure

Write `prototype-report.md` with the standard 7-section skeleton + Compliance.

### 1. Executive Summary

3-5 bullets: the assumption being tested, the slice that was built, headline result (validated / falsified / mixed), top finding.

### 2. Inputs Consumed

`architecture.md` (citing which §s informed the scope), any ADRs, prior-phase reviewer notes that named the assumption.

### 3. Prototype Body

#### 3.1 Tracer-Bullet Scope

The 1-paragraph scope summary written before any code. **Don't rewrite this after the fact**: leave it as it was, even if the prototype evolved. The drift between scope-as-planned and scope-as-built is itself information.

#### 3.2 Demo Walkthrough

Step-by-step "how to run and see it work." Anyone reading the report should be able to clone the branch, follow these steps, and see the slice working in 5 minutes.

```bash
# Branch
git checkout prototype/<feature>

# Install + run
cd app && npm install
npm run dev:all

# Click-through
1. Navigate to http://localhost:5175/login
2. Sign in with <test account>
3. Click <button>
4. Observe <expected behavior>
```

#### 3.3 Validations Confirmed

Numbered list. Each item: "We tested X by doing Y, and observed Z, which confirms the architecture's claim that ___."

#### 3.4 Assumptions Falsified

Numbered list. Each item: "We tested X by doing Y, but observed Z instead of expected. This invalidates architecture.md §___'s claim that ___. Implication: ___."

If empty, ask yourself whether the prototype was ambitious enough. A prototype that confirms everything is suspicious, either the architecture is unusually solid or the prototype didn't push hard enough.

#### 3.5 Performance Baseline

The numbers from Phase 2.3, in a table.

| Metric | Baseline | Notes |
|--------|----------|-------|
| Bundle (gzip) | N KB | Tested 2026-MM-DD |
| Cold start | N sec | |
| FMP | N ms | Lighthouse local |
| API p95 | N ms | 50 requests, /api/v1/projects |
| Top query | N ms | `EXPLAIN ANALYZE` attached |

#### 3.6 Architecture Revisions Proposed

For each falsified assumption (and any other learnings), propose a concrete edit to `architecture.md`. Format:

> **Revision #1:** Edit `architecture.md §3.7` Tech Stack so files use Azure Blob Storage above 10MB (BYTEA only for smaller) instead of "Postgres BYTEA for files".
> **Why:** prototype showed BYTEA writes blocking concurrent reads at file sizes >25MB.
> **Impact:** ADR-004 (file-storage strategy) needs to be re-decided. New migration needed. Workers package gains a blob client.

If revisions are extensive, recommend a send-back to /phase3-architecture rather than inline edits. Don't try to retro-fix architecture.md silently.

#### 3.7 Mock Inventory

What was mocked vs real. One row per external touchpoint.

| Touchpoint | Real / Mocked | Validation status |
|------------|---------------|-------------------|
| SSO callback | Real | Confirmed |
| Postgres CRUD | Real | Confirmed |
| GitHub PAT injection | Real | Confirmed (one POST /git/repos succeeded) |
| Document-store upload | Mocked | DEFERRED: must validate in /phase5-development |
| Email send | Mocked | DEFERRED |

### 4. Compliance and Standards

The prototype isn't expected to be standards-compliant. State which standards were deliberately deferred and which (if any) were exercised in the slice.

| Standard | Prototype status |
|----------|------------------|
| 02-security | Auth flow exercised; CSRF/JWT confirmed; full ASVS L2 deferred to /phase5-development |
| 04-testing | Deferred (no tests in prototype) |
| 05-accessibility | Template defaults only; full a11y pass deferred |
| 06-pwa | Deferred |

### 5. Open Questions / Risks

**Open questions for the human reviewer:**
- Whether to send back to /phase3-architecture or accept inline revisions
- Whether to extend prototype scope to validate currently-mocked touchpoints before /phase5-development
- Whether the falsified assumptions warrant a re-plan (capacity, milestone reordering)

**Risks introduced by the prototype's findings:**
- New tech-stack risk if the falsified assumption needs a different library
- Schedule risk if architecture revision pushes the M1 demo window

### 6. Handoff Notes

What `/phase5-development` will need:
- Architecture revisions accepted (link to revised architecture.md or send-back outcome)
- Performance baseline as the regression target
- Mock inventory, list of touchpoints that still need real-integration validation in phase5
- Branch reference (the prototype branch): useful as a starting point but should not be merged to main as-is

### 7. Appendix: Source Doc Traceability

| Prototype element | Source |
|-------------------|--------|
| Assumption tested | architecture.md §6 Handoff Notes |
| Slice scope | architecture.md §3.2 Components + §3.4 API |
| Performance baseline targets | requirements.md NFR-PERF-* |
| Mocked touchpoints | architecture.md §3.7 Tech Stack |

---

## Quality bar

The prototype is good when:
- The riskiest assumption was named explicitly before any code was written.
- The slice walks UI down to data store and returns, with at least one real integration call.
- Performance baseline numbers are recorded (not "feels fast").
- Either Validations or Falsifications has a non-trivial list, not both empty.
- Mock inventory is honest (no claims of "validated" for touchpoints that were mocked).
- A reviewer can run the demo walkthrough in 5 minutes from the report alone.

The prototype is bad when:
- The assumption is fuzzy ("see if the architecture works") rather than specific.
- The cut list is short or absent (so the prototype is becoming the implementation).
- The slice skips the integration touchpoint and only exercises the easy layers.
- Performance baseline is missing (you can't tell if /phase5-development regressed without it).
- Falsifications are massaged into "minor caveats" , it should be loud when something didn't work.
