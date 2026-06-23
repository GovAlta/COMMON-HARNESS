# Methodology: Phase 7: User Acceptance

> Companion to `SKILL.md` in this directory. Loaded on demand by `/phase7-user-acceptance`.
> No frontmatter, methodology reference, not a discoverable skill.

UAT is where the build becomes the project's product. The stakeholder
formally accepts (or rejects) the work against the agreed FRs. Two phases:
Phase A produces a script the stakeholder can run; Phase B captures the
outcome and the formal signature.

The purpose of UAT is **explicit acceptance**, not "we hope they like it."
Every must-have FR gets a pass/fail, every signer signs, and conditional-passes
become phase8 prerequisites. Deferrals move to documented backlog with target
dates.

---

## Inputs

- **Required:** `test-results.md` from `./phases/phase6-user-testing/output/`: confirms the build is testable. **Hard-block** if missing.
- **Required:** No unresolved Critical issues in `test-results.md`. **Hard-block** if any are open.
- **Required:** No "send-back" decision in `test-results.md §3.10`. **Hard-block** if found.
- **Strongly recommended:** `requirements.md`: the FR list and ACs the script is built around.
- **Strongly recommended:** `architecture.md`: for context on what's deployed and where.
- **Phase B input:** stakeholder-posted notes / annotations / signed PDFs from the UAT session.

---

## Phase A: Generate

### 2.1 The FR-by-FR checklist

The core of `uat-script.md`. Every must-have AND should-have FR gets a row:

| FR ID | Title | Acceptance criteria | Demonstrate by | Pass/Fail | Stakeholder note |
|-------|-------|---------------------|----------------|-----------|------------------|
| FR-001 | Sign in with Microsoft SSO | "User clicks 'Sign in,' is redirected to Microsoft, returns authenticated." | Click sign-in. Use test account. Land on dashboard. | [ ] Pass [ ] Fail [ ] Conditional | |
| FR-014 | Create a project | "Logged-in user clicks 'New project,' fills title, submits, sees project in list." | Click New project. Enter "UAT Test 2026-MM-DD." Submit. See it in list. | [ ] Pass [ ] Fail [ ] Conditional | |
| ... | ... | ... | ... | ... | ... |

The "Demonstrate by" column is the critical addition over /phase6-user-testing's manual scripts. UAT is faster than user testing, the stakeholder can't run 15 scripts. They can confirm a 1-paragraph demonstration of each FR.

Don't include `wont` or unfunded `could` FRs. If a stakeholder wants to verify them, that's a re-plan trigger.

### 2.2 Demo prep

Time-box: 30-60 minutes total. Aim for 5-7 segments, each 5-10 minutes.

For each segment:
- The user workflow it demonstrates (which FRs it touches)
- The narrative (what story you're telling, usually a persona's day)
- The clicks (verbatim, don't improvise during a live demo)
- Expected stakeholder reaction (what do you want them to notice?)

Default segment list for an enterprise app:
1. Sign-in + dashboard tour (FR-001 + FR-014 + key landing patterns)
2. Core CRUD path (the must-have happy path; M2 work)
3. Permissions + sharing (multi-user collaboration; FR-MEMBER-*)
4. Integration touchpoint (whatever the project does that's distinctive, third-party APIs, document stores, etc.)
5. NFR proof (a11y keyboard demo, perf snappiness, mobile responsive)
6. Q&A buffer (10 min reserved, never let the demo run long without Q&A)

### 2.3 The deferral backlog

Carry forward from /phase6-user-testing:

| Bucket | What goes here | Source |
|--------|----------------|--------|
| **Must fix before /phase8-deployment** | All Major issues from /phase6-user-testing | test-results.md §3.8 Issues by Disposition (Major) |
| **Conditional /phase7-user-acceptance acceptance** | Items the stakeholder will conditionally approve in UAT | Filled in during Phase B |
| **Post-launch backlog** | Minor issues + agreed scope cuts | test-results.md §3.8 (Minor) + requirements.md `wont` FRs + plan.md deferred tasks |

Stakeholders see this list during UAT and either:
- Confirm a "must fix" stays as such
- Move a "must fix" to "post-launch" if they accept the risk
- Move a "post-launch" item up to "must fix" if they newly require it
- Reject the deferral and trigger a re-plan

The backlog goes into the UAT script (not just the sign-off) so stakeholders see it BEFORE saying yes.

### 2.4 Sign-off table skeleton

| Stakeholder | Role | Decision | Conditions | Date | Signature / approval reference |
|-------------|------|----------|------------|------|-------------------------------|
| <name> | Project Sponsor | [ ] Approve [ ] Approve with conditions [ ] Reject | (filled if conditional) | YYYY-MM-DD | (e-sig URL, ticket ID, written note) |
| <name> | Product Owner | [ ] Approve [ ] Approve with conditions [ ] Reject | | | |
| <name> | Technical Lead | [ ] Approve [ ] Approve with conditions [ ] Reject | | | |
| <name> | Security Lead | [ ] Approve [ ] Approve with conditions [ ] Reject | | | |
| <name> | Accessibility Lead | [ ] Approve [ ] Approve with conditions [ ] Reject | | | |

Stakeholder list comes from `requirements.md §2 Stakeholders` filtered to those with sign-off authority. Default minimum: Sponsor, Product Owner, Technical Lead. Add Security if NFR-SEC is must; add Accessibility if NFR-A11Y-AA is required (often both are).

---

## Phase B: Capture

### 3.1 Pull stakeholder results

Stakeholders typically post results in one of these ways (in order of preference):

1. **Marked-up upload** of `uat-script.md`: they checked boxes, wrote notes, uploaded back.
2. **Signed PDF**: printed, signed, scanned, uploaded.
3. **Inline notes file**: a brief notes document with a quick decision per FR.
4. **Meeting recording link**: if UAT was synchronous.

Source 1 is the most structured. Source 4 is the messiest, extract the per-FR decisions from notes manually.

### 3.2 Compute outcome

| State of UAT script | Decision |
|---------------------|----------|
| All FRs pass + all signers approve | Advance to /phase8-deployment |
| Any FR fails (without conditional acceptance) | Send-back. Decide /phase5-development (implementation problem) or /phase6-user-testing (testing problem). |
| Any FR conditional-pass | Advance with documented conditions; conditions become /phase8-deployment prerequisites in handoff. |
| Any signer rejected | Halt. The project is not approved; stakeholder discussion needed before next step. |
| Any signer didn't respond by deadline | Halt with named missing approver. Don't proceed without them. |

Conditional-passes need explicit conditions:

- "Approve with condition: fix I-002 before launch."
- "Approve with condition: a11y findings I-005, I-007 must be resolved before public release."
- "Approve with condition: launch is internal-only until perf p95 reaches target."

Each condition becomes a row in the /phase8-deployment prerequisite table.

### 3.3 The signed sign-off doc

`sign-off.md` is the formal record. It must contain:

1. The completed UAT script (FR rows now have Pass/Fail/Conditional filled)
2. The completed sign-off table (every signer's decision + reference to their actual signature artifact)
3. The updated deferral backlog (with stakeholder-confirmed bucket assignments)
4. The list of conditional-pass conditions (each becomes a /phase8-deployment prerequisite)

Treat `sign-off.md` as the audit artifact: it must stand on its own as evidence that the project was approved.

---

## Phase 4: Output structure

### uat-script.md (Phase A)

Standard 7-section skeleton. Body:

#### 3.1 UAT Script: FR-by-FR

The big checklist table from §2.1.

#### 3.2 Demo Prep

The segment-by-segment plan from §2.2.

#### 3.3 Deferral Backlog

The three-bucket table from §2.3 with current contents.

#### 3.4 Sign-off Roster

The skeleton table from §2.4.

#### 3.5 Test Environment

URL, accounts, time-box, attendee list (for synchronous UAT).

### sign-off.md (Phase B)

Standard 7-section skeleton. Body:

#### 3.1 UAT Outcome

The §2.1 table, completed.

#### 3.2 Stakeholder Decisions

The §2.4 table, completed with signatures.

#### 3.3 Conditions

Per-condition table, what was conditioned, who conditioned it, what's required to satisfy it, target deadline.

#### 3.4 Updated Deferral Backlog

The §2.3 table after stakeholder revisions.

#### 3.5 /phase8-deployment Prerequisites

A clean, prioritized list of the conditional-pass conditions, formatted as work items /phase8-deployment can ingest.

---

## Quality bar

The UAT script is good when:
- Every must-have FR has a row with concrete demonstrate-by steps.
- The demo segments time-box to 30-60 min total.
- The deferral backlog is honest about what's not in scope.
- The sign-off roster names every required signer.

The sign-off doc is good when:
- Every FR row has a clear pass/fail/conditional outcome.
- Every required signer's row is filled with a real signature artifact reference.
- Conditional-passes have explicit, actionable conditions.
- A regulator or auditor reading sign-off.md alone could verify the project was approved.

The skill is bad when:
- "All passed!" with no real signatures (vibes-based approval).
- Conditional-pass conditions are vague ("clean it up before launch").
- A signer is missing and the doc still says "Approved."
- Deferrals get hand-waved ("we'll handle that later") instead of bucketed.
