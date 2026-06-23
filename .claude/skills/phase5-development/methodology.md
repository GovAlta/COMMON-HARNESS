# Methodology, Phase 5: Development

> Companion to `SKILL.md` in this directory. Loaded on demand by `/phase5-development`.
> No frontmatter, methodology reference, not a discoverable skill.

Build the production code. This is the longest, most complex phase
because it's where every prior decision becomes real. The methodology is
about discipline: template-first scaffolding, milestone-by-milestone
execution, guides loaded in order, standards applied continuously, drift
caught after every feature, security scans before "done."

The mindset: this skill orchestrates rather than reinvent. `/build` scaffolds, the guides describe the path, the standards constrain quality, sync-docs catches drift, and blueteam catches security regressions; phase5 glues these tools together against the plan's milestones.

---

## Inputs

- **Required:** `architecture.md`: the design contract. Every component/endpoint/entity in phase5 must trace to a section here.
- **Required:** `./app/` scaffolded by `/build`. Hard-block if absent.
- **Strongly recommended:** `plan.md`: milestone breakdowns and task IDs. Without it, milestone execution becomes ad-hoc.
- **Optional:** `prototype-report.md`: performance baseline + mock inventory. The mock-inventory list is the "must validate in phase5" list.
- **Strongly recommended:** a linked source-control repo for the project. Commits land there via the team's normal git workflow.

---

## Phase 1: Template enforcement (the non-negotiable)

`/phase5-development` is template-first by hard rule. The harness's #1 rule is
"Template first, never scaffold by hand." Breaking it cascades:

| If you skip the template | What breaks |
|--------------------------|-------------|
| Auth middleware | You'll re-implement JWT/CSRF poorly; ASVS L2 fails |
| Migrations | Audit columns missing; soft-delete pattern wrong; revision triggers absent |
| Validation layer | Mass-assignment vulnerability; Zod schemas inconsistent |
| Error handling | AppError taxonomy missing; consumer error codes drift |
| Tests structure | Coverage targets unmeasured; CI gates can't run |
| Build config | sync-docs can't auto-discover; CI workflows break |
| Layout / dirs | Guides 01-08 stop matching the file paths they reference |

The template is the harness's accumulated "we already solved this." Reusing
it is not a constraint, it's how the project benefits from every prior
project's lessons.

**The template enforcement gate** in `SKILL.md` Step 5 hard-blocks if
`./app/package.json` doesn't exist. Recovery: run `/build` with the
template choice from `architecture.md §3.7 Tech Stack`. If the stack diverges
from any available template, that's an architecture problem, send back to
/phase3-architecture, don't paper over it here.

---

## Phase 2: Milestone-by-milestone execution

### 2.1 Identifying the active milestone

Read `plan.md §3.1 Roadmap` and §3.2 Task Breakdown. Active milestone is
either:

- The one passed via `--milestone` flag, or
- The earliest milestone with `status: in-progress` if any, else
- The earliest milestone with `status: pending` whose dependencies are met.

Don't jump milestones. Don't work on M3 tasks while M1 has open critical-path tasks.

### 2.2 Milestone → guides map

Each milestone's character determines which guides to load. Default mapping (adjust per project):

| Milestone | Frontend guides | Backend guides | Standards focus |
|-----------|-----------------|----------------|-----------------|
| **M1 Foundation** | 01-project-setup, 02-routing, 03-state | 01-project-setup, 02-security-middleware, 03-authentication | 01-architecture, 02-security |
| **M2 Core domain** | 04-forms, 05-api-integration, 06-error-handling | 04-database, 05-api-patterns | 03-coding-conventions, 04-testing |
| **M3 Integrations** | 07-realtime, 08-file-handling | 06-realtime, 07-file-uploads | 02-security (re-check) |
| **M4 Polish** | 09-accessibility, 10-pwa, 11-testing, 12-pwa | 08-deployment | 05-accessibility, 06-pwa |

Load the relevant guides in numerical order at the start of the milestone. Don't skip ahead. Each guide assumes the prior is done.

### 2.3 Task execution loop

For each task in the milestone (in `plan.md` dependency order):

1. **Read the task entry in `plan.md`**: confirm FR/NFR ID, owner profile, estimate, deps.
2. **Read the FR/NFR in `requirements.md`**: confirm acceptance criteria.
3. **Read the relevant component spec in `architecture.md`**: confirm the design.
4. **Implement the code** following the loaded guides + standards.
5. **Write the tests** (unit + integration as appropriate per `04-testing.md`).
6. **Run lint + type-check** locally, must be zero/zero.
7. **Run `/sync-docs`**: must be zero drift. If a new endpoint was added, openapi.yaml must reflect it. If a migration was added, README's migration count must update. The hook should auto-run, but verify manually too.
8. **Commit atomically via git**: group related files into one commit:

```bash
git checkout -b feature/<milestone>-<slug>
git add server/src/routes/foo.routes.ts \
        server/migrations/064_foo.sql \
        client/src/views/FooView.vue \
        server/openapi.yaml
git commit -m "feat(<scope>): <description> [closes T-NNN]"
```

Reference the task ID in the commit message (`[closes T-NNN]`) for traceability.

### 2.4 End-of-milestone gate

Before marking a milestone complete, run **all** of these:

| Check | Expectation | Recovery if fail |
|-------|-------------|------------------|
| Lint + type-check | Zero errors, zero warnings | Fix before proceeding |
| Tests pass | All green; coverage meets `04-testing.md` targets | Add tests; don't ship gaps |
| `/sync-docs` | Zero drift | Update docs to match code |
| `/blueteam` (or `node .claude/security/blueteam/scripts/security-pipeline.js --all`) | Zero criticals; highs require explicit risk-acceptance | Fix criticals; document risk-accepted highs |
| Manual smoke test | Happy path runs end-to-end in browser | Don't claim "complete" without exercising it |
| Performance baseline (if in M4) | At or under prototype baseline (or with documented regression rationale) | Profile + fix; don't pretend |

A milestone with any failed gate is **not complete**. Either fix it before proceeding to the next milestone OR halt and document the blocker for the human reviewer.

### 2.5 Architecture revisions during phase5

It's normal to discover during development that `architecture.md` needs revision (an integration behaves differently than expected; a library has a constraint we didn't know). Two options:

- **Minor inline update:** edit `architecture.md` directly with a dated note explaining the change.
- **Major revision:** halt and request a send-back to /phase3-architecture. Preferred when the change affects ADRs or the threat model.

Either way, **do not silently diverge from `architecture.md`**. Future readers of the architecture must be able to reconcile what's in code with what's documented.

---

## Phase 3: Output structure

Write `development-report.md` with the standard 7-section skeleton + Compliance.

### 1. Executive Summary

3-5 bullets: milestones complete (and remaining), test coverage achieved, sync-docs/blueteam status, headline architecture revision (if any), readiness for /phase6-user-testing.

### 2. Inputs Consumed

`architecture.md`, `plan.md`, `prototype-report.md` (if present), prior turn-history quotes that shaped scope. Note any cuts or deferrals the team agreed to during development.

### 3. Development Body

#### 3.1 Milestone Status

| Milestone | Status | Tasks closed | Tasks deferred | Notes |
|-----------|--------|--------------|----------------|-------|
| M1 | complete | T-001…T-014 (14) |: | Foundation + auth slice; demoed 2026-MM-DD |
| M2 | complete | T-015…T-038 (24) |: | Core CRUD + business logic |
| M3 | partial | T-039…T-051 (13) | T-052 (deferred to v6: see §5) | One integration mocked; rationale documented |
| M4 | not-started |: |: | Pending /v6 sign-off |

#### 3.2 Tech Stack Realized

Confirm the stack matches `architecture.md §3.7`. Note any divergences and link to the rationale (inline architecture revision or accepted send-back).

| Component | architecture.md called for | What was built | Status |
|-----------|----------------------------|----------------|--------|
| Frontend | `template/public/client/` | scaffolded from public/client | match |
| Backend | `template/public/server/` | scaffolded from public/server | match |
| File storage | Postgres BYTEA | Azure Blob (revised: see ADR-004 v2) | revised: accepted |

#### 3.3 FRs / NFRs Closed

Two tables. FRs:

| FR ID | Title | Status | Tasks | Tests |
|-------|-------|--------|-------|-------|
| FR-001 | User can sign in with Microsoft SSO | complete | T-001, T-002 | unit:auth.test.ts; integration:auth-flow.test.ts |
| ... | ... | ... | ... | ... |

NFRs (cross-reference `plan.md §3.7 NFR Coverage Map`):

| NFR ID | Coverage | Tasks done | Tests | Standards-compliant |
|--------|----------|------------|-------|---------------------|
| NFR-SEC-01 ASVS L2 | full | T-008, T-014, T-027, T-041 | security/*.test.ts; blueteam scan pass | yes |
| NFR-A11Y-01 WCAG AA | partial | T-046 | axe in CI | partial - see section 3.6 |
| ... | ... | ... | ... | ... |

#### 3.4 Commits Reference

Branch + summary stats; full git log is in the repo. List the meaningful commits per milestone (or commit ranges). Helps reviewers locate work fast.

#### 3.5 Test Coverage

```
Backend:    Lines:  82.4%   Branches: 75.1%   Funcs: 88.0%   Stmts: 82.7%
Frontend:   Lines:  73.2%   Branches: 64.8%   Funcs: 79.5%   Stmts: 73.8%
E2E:        12 scenarios passing; 0 flakes in last 5 runs
```

Targets per `04-testing.md`: backend 80% lines, frontend 70% lines. Report MUST highlight any gap with a remediation plan or explicit deferral.

#### 3.6 Standards Compliance

Per-standard checklist:

| Standard | Status | Notes |
|----------|--------|-------|
| 01-architecture | pass | Layered structure preserved; health endpoints present |
| 02-security | pass | ASVS L2 self-assessed; blueteam scan zero criticals |
| 03-coding-conventions | pass | Lint zero; type-check zero |
| 04-testing | pass | Coverage targets met (see §3.5) |
| 05-accessibility | partial | Manual keyboard test deferred to /phase6-user-testing |
| 06-pwa | pass | Manifest, SW, install-prompt all wired |
| 07-architectural-patterns | pass | Enterprise pattern preserved per architecture.md ADR-001 |
| (project-specific design system, if any) | pass | Components, fonts, mobile-nav workarounds all in place |

Any non-pass entry needs a remediation plan or an explicit deferral.

#### 3.7 sync-docs Final Report

Must be zero drift. Paste the final `sync-docs` output:

```
docs-sync: no drift detected.
  64 migrations on disk.
  checked: readme, openapi, claudeMds, migrations, routesDir, appEntry
```

If non-zero drift remains, the step is NOT complete.

#### 3.8 blueteam Final Report

Must be zero criticals. Paste a summary table:

| Severity | Count | Status |
|----------|-------|--------|
| Critical | 0 |: |
| High | 2 | both risk-accepted (see `.ai/data/risk_acceptances.json` (per `.claude/security/blueteam/RISK_ACCEPTANCE_GUIDE.md`)) |
| Medium | 5 | tracked for v6/v7 |
| Low | 12 | acknowledged |

Critical or unaccepted-high findings BLOCK the step from completing.

#### 3.9 Outstanding TODOs

Code-level TODOs that survived to the end. Each should have:
- File:line reference
- Why it's deferred (not "ran out of time")
- Which step or ticket will resolve it

A long list of unexplained TODOs is a smell, close them or move them to issues.

#### 3.10 Performance Metrics

If a baseline was captured in /phase4-prototyping, compare against it. Otherwise, capture current metrics as the phase5 baseline.

| Metric | Prototype baseline | phase5 measured | Status |
|--------|-------------------|--------------|--------|
| Bundle (gzip) | 220 KB | 268 KB | within 25%: acceptable |
| API p95 | 180 ms | 195 ms | within 10%: acceptable |
| Lighthouse perf | n/a | 92 | new measurement |
| Lighthouse a11y | n/a | 98 | new measurement |
| Lighthouse PWA | n/a | 100 | new measurement |

### 4. Compliance and Standards

Same skeleton as v3 §4. The status here is "what's actually in the code." Items deferred from architecture's compliance section should now be `pass` or carry an explicit deferral with a target date.

### 5. Open Questions / Risks

**Open questions for the human reviewer:**
- Whether deferred items (T-052, etc.) need a separate ticket or roll into v6.
- Whether risk-accepted highs in §3.8 are acceptable for production.
- Whether the bundle-size growth (if any) needs further optimization before /phase8-deployment.

**Development-phase risks:**
- Mocked-in-prototype touchpoints that remain mocked in phase5 (must be flagged as deferred to v6 or v8).
- Performance regressions (if any) that may worsen under production load.
- Standards items still partial (a11y, perf) that v6 must close.

### 6. Handoff Notes

What `/phase6-user-testing` will need:
- Deployed preview URL
- Test accounts (with credentials in a secure channel, never inline)
- The FR list with acceptance criteria (from requirements.md)
- The list of mocked touchpoints still to be validated
- The list of standards items still partial (especially a11y, needs human keyboard + screen-reader testing)

What `/phase8-deployment` will need (later, but flag now):
- Migration count + ordering
- Secret/config inventory (env vars, Key Vault entries)
- Health probe endpoints
- Monitoring dashboard URLs
- On-call contact info

### 7. Appendix: Source Doc Traceability

| Development element | Source |
|---------------------|--------|
| FR-001 implementation | architecture.md §3.2 component "Auth"; plan.md M1 tasks T-001, T-002 |
| Migration 064_foo.sql | architecture.md §3.3 entity `foo`; plan.md task T-018 |
| ADR-004 revision | prototype-report.md §3.6 Architecture Revisions Proposed |
| Bundle size 268 KB | phase5 measurement; prototype baseline 220 KB |
| ... | ... |

---

## Quality bar

The development is good when:
- `./app/` was scaffolded by `/build`, not by hand.
- Every milestone closed before the next one started.
- Every FR/NFR has a status in §3.3 (no orphans, no silent drops).
- Test coverage meets `04-testing.md` targets (or has explicit, justified gaps).
- sync-docs reports zero drift at the time of submission.
- blueteam reports zero criticals (or only risk-accepted highs).
- Tech stack matches `architecture.md §3.7` (or has documented revisions).
- Outstanding TODOs are scoped to non-critical paths and have target tickets.

The development is bad when:
- `./app/` was scaffolded "the agent's way" instead of via `/build`.
- Drift is "we'll fix sync-docs later."
- blueteam was "skipped because we ran out of time."
- A mocked touchpoint from /phase4-prototyping is still mocked in phase5 with no plan.
- TODOs in critical paths (auth, payment, data integrity).
- Test coverage meaningfully below targets without a documented exception.
- The doc claims complete but the smoke test wasn't actually run.
