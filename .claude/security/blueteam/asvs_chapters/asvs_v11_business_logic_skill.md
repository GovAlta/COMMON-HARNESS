---
id: asvs-v11-business-logic-subskill
name: ASVS V11 Business Logic Sub-Skill
description: ASVS chapter V11 business logic assessment logic consumed by the ASVS Level 2 assessment workflow.
type: sub-agent
version: 1.0.0
tools_required:
  - Read
  - Glob
  - Grep
tools_optional: []
references:
  - asvs-level2-security-assessment
  - attack-chain-reference
upstream:
  - ref: asvs-level2-security-assessment
    artifacts:
      - .ai/blueteam/data/application_map.json
outputs: []
call_sequence_hard:
  - Must resolve declared upstream dependencies before execution, or fail fast with a dependency error.
  - Must run only within ASVS Level 2 Phase 2 chapter dispatch.
---

> Sub-skill for **V11 Business Logic Security**. Finding IDs: `[V11-NNN]`. Tactics: `shared/reference/attack-chain-reference.md` §2. Phase 6 normalizes IDs.

---

## Exclusion Conditions

| Condition | Sub-requirements excluded | Justification |
|-----------|---------------------------|---------------|
| Simple CRUD API with no multi-step workflows | V11.1.4 (sequential step enforcement) | No multi-step workflow to protect |
| No financial transactions | V11.1.3 (transaction limits) | No financial workflow present |

If all business logic requirements are excluded, write `[V11 CHAPTER — simple CRUD, minimal business logic, no multi-step workflows]` and assess only V11.1.2 (anti-automation).

---

> Environment assumptions for this chapter: see `shared/reference/environment-baseline.md` § "ASVS Chapter Assumption Mapping."

---

## V11 Requirements and Verification Rules

### V11.1 — Business Logic Security

**V11.1.1** — Verify the application will only process business logic flows for the same user in sequential step order and without skipping steps.
- **CAS Rule:** **Write-path completeness rule**: When a missing business logic control is identified (duplicate submission guard, idempotency check, rate limit, sequential step enforcement), identify the underlying data store or record type being protected, then enumerate **all code paths that write to that store** — not only the entry point that triggered the finding. Common patterns to check: draft-save paths alongside submit paths (e.g., `saveDraft` and `submitApplication` both inserting into the same table), retry/resubmit paths, admin override paths, and background job paths. Flag each unguarded write path as a separate `[V11-NNN]` finding with its file and function reference.
- **Verification:** Identify multi-step workflows (registration, application submission, checkout, onboarding). For each step: verify that the server validates the previous step has been completed before allowing the current step. Check for `step` or `state` validation in handler code. If step order can be bypassed by direct API calls, flag as High.
- **ATT&CK Tactic:** TA0001 — Initial Access
- **Severity if failed:** High

**V11.1.2** — Verify the application will only process business logic flows with all steps being processed in realistic human time, i.e., transactions are not submitted too quickly.
- **CAS Rule:** None.
- **Verification:** Check for rate limiting on business logic endpoints (form submission, application creation, transaction processing). Cross-reference with V13 API rate limiting — if already captured there, write `[V11-NNN: duplicate of V13-NNN]`.
- **ATT&CK Tactic:** TA0001 — Initial Access
- **Severity if failed:** Medium

**V11.1.3** — Verify the application has appropriate limits for specific business actions or transactions, and that these limits are correctly enforced on a per-user basis.
- **CAS Rule:** None.
- **Verification:** For financial or quota-limited operations: check per-user limits in business logic (daily submission limit, transaction amount limits, request quotas). Verify limits are enforced server-side.
- **ATT&CK Tactic:** TA0040 — Impact
- **Severity if failed:** High

**V11.1.4** — Verify the application has anti-automation controls to protect against excessive calls such as mass data exfiltration, business logic requests, file uploads or denial of service attacks.
- **CAS Rule:** None.
- **Verification:** Check for rate limiting and anti-automation controls on high-value business endpoints. Verify that bulk data export or listing endpoints have pagination limits.
- **ATT&CK Tactic:** TA0009 — Collection
- **Severity if failed:** High

**V11.1.5** — Verify the application has business logic limits or validation to protect against likely business risks or threats, identified using threat modeling or similar methodologies.
- **CAS Rule:** None.
- **Verification:** Review whether domain-specific business constraints are enforced server-side (e.g., an application cannot be submitted twice, a benefit cannot be claimed by an ineligible user based on eligibility rules).
- **ATT&CK Tactic:** TA0001 — Initial Access
- **Severity if failed:** High (context-dependent)

**V11.1.6** — Verify the application does not suffer from "time of check to time of use" (TOCTOU) problems or other race conditions for sensitive operations.
- **CAS Rule:** None.
- **Verification:** Review high-value state-changing operations for TOCTOU patterns: check balance → use balance → deduct balance without atomic transaction. Check for optimistic locking or pessimistic locking on concurrent write operations.
- **ATT&CK Tactic:** TA0040 — Impact
- **Severity if failed:** High

**V11.1.7** — Verify the application monitors for unusual events or activity from a business logic perspective.
- **CAS Rule:** None.
- **Verification:** Check for anomaly detection or unusual-usage monitoring in the application. Note as Medium if entirely absent.
- **ATT&CK Tactic:** TA0005 — Defense Evasion
- **Severity if failed:** Medium

**V11.1.8** — Verify the application has configurable alerting when automated attacks or unusual activity is detected.
- **CAS Rule:** None.
- **Verification:** Check for alerting integrations triggered by unusual business activity patterns.
- **ATT&CK Tactic:** TA0005 — Defense Evasion
- **Severity if failed:** Medium

---

## ATT&CK Tactic Summary

Note: Derived from `shared/reference/attack-chain-reference.md` Section 2. Update this file if that file changes.

| Finding Pattern | Primary Tactic | Kill Chain Stage |
|----------------|----------------|-----------------|
| Missing sequential step enforcement | TA0001 Initial Access | Direct step skip → unauthorized submission |
| No per-user transaction limits | TA0040 Impact | Quota exhaustion, financial abuse, resource depletion |
| Missing duplicate submission guard | TA0040 Impact | Double-submission → duplicate benefits or charges |
| TOCTOU race condition | TA0040 Impact | Race → inconsistent state, balance manipulation |
| No bulk export limits | TA0009 Collection | Automated full-table data extraction |

---

## Cross-Chapter Reference Notes

| This chapter finding | Combines with | Combined chain risk |
|---------------------|---------------|---------------------|
| V11.1.4 no anti-automation | V13 API rate limiting | Same root cause — if captured in V13, write `[V11-NNN: duplicate of V13-NNN]` |
| V11.1.1 step skip | V4.2 BOLA | Sequential step bypass + BOLA enables processing other users' submissions |
| V11.1.3 no transaction limits | V8.1.4 anomalous request detection | Both required for financial abuse detection |

---

> **ASSESSMENT ORCHESTRATOR: STOP READING HERE.** The `## Secure Implementation Guide` section below is for `skills/14-asvs-compliant-builder.md` only. Assessment skills do not need implementation patterns.

## Secure Implementation Guide

> **For builder skills only.** Assessment skills use the full chapter file above. This section provides implementation patterns for generating ASVS V11-compliant code.

### When to apply this chapter
Load V11 when implementing multi-step workflows, form submissions with multiple stages, financial transactions, quota-limited operations, or any endpoint where duplicate or out-of-order submission would cause data integrity issues.

### Sequential Step Enforcement (V11.1.1)

```typescript
// middleware/requireStep.ts — ✓ V11.1.1: enforce workflow step order server-side
export function requireStep(requiredStep: ApplicationStep) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const application = await Application.findOne({
      where: { id: req.params.id, userId: req.user!.id },
    });

    if (!application) {
      return res.status(404).json({ error: 'Not found' });
    }

    if (application.currentStep < requiredStep) {
      // ✓ V11.1.1: reject out-of-order step access
      return res.status(400).json({
        error: 'Previous step must be completed first',
        requiredStep: requiredStep - 1,
      });
    }

    req.application = application;
    next();
  };
}

// Route: step 3 requires steps 1 and 2 to be complete
router.post('/applications/:id/step3',
  authenticate,
  requireStep(ApplicationStep.Step3),
  submitStep3Handler
);
```

### Duplicate Submission Guard (V11.1.1)

```typescript
// handlers/submitApplication.ts — ✓ V11.1.1: prevent duplicate submission
export async function submitApplication(req: Request, res: Response) {
  const { id } = req.params;

  // ✓ V11.1.1: atomic check-and-update prevents double submission
  const result = await db.transaction(async (trx) => {
    const application = await trx('applications')
      .where({ id, user_id: req.user!.id, status: 'draft' })
      .forUpdate()   // pessimistic lock — prevents concurrent submissions
      .first();

    if (!application) {
      // Either not found, not owned by this user, or already submitted
      return null;
    }

    await trx('applications')
      .where({ id })
      .update({ status: 'submitted', submitted_at: new Date() });

    return application;
  });

  if (!result) {
    return res.status(409).json({ error: 'Application already submitted or not found' });
  }

  res.json({ success: true, applicationId: id });
}
```

### Per-User Transaction Limits (V11.1.3)

```typescript
// middleware/userQuota.ts — ✓ V11.1.3: per-user limits enforced server-side
export function enforceUserQuota(action: string, limit: number) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const count = await db('user_actions')
      .where({ user_id: req.user!.id, action, date: new Date().toDateString() })
      .count('id as count')
      .first();

    if (Number(count?.count ?? 0) >= limit) {
      logger.warn({
        event: 'quota.exceeded',
        userId: req.user!.id,
        action,
        limit,
      });
      return res.status(429).json({ error: 'Daily limit reached for this action' });
    }

    next();
  };
}

// Usage: max 3 applications per user per day
router.post('/applications',
  authenticate,
  enforceUserQuota('create_application', 3),
  createApplicationHandler
);
```

### TOCTOU Prevention (V11.1.6)

```typescript
// ✓ V11.1.6: atomic SQL UPDATE with WHERE clause prevents race conditions
// WRONG: check then deduct (two separate queries — TOCTOU vulnerability)
// const balance = await getBalance(userId);
// if (balance >= amount) await deductBalance(userId, amount);  // race window here!

// CORRECT: atomic conditional update
const result = await db('accounts')
  .where({ user_id: userId })
  .where('balance', '>=', amount)  // ✓ V11.1.6: condition + update in single atomic operation
  .update({ balance: db.raw('balance - ?', [amount]) });

if (result === 0) {
  throw new Error('Insufficient balance or concurrent modification detected');
}
```

### Pagination Limits for Bulk Export Prevention (V11.1.4)

```typescript
// ✓ V11.1.4: enforce max page size on listing endpoints
const MAX_PAGE_SIZE = 100;

export function parsePagination(req: Request) {
  const page = Math.max(1, parseInt(req.query.page as string) || 1);
  const limit = Math.min(MAX_PAGE_SIZE, parseInt(req.query.limit as string) || 20);
  const offset = (page - 1) * limit;
  return { page, limit, offset };
}
```

### Common anti-patterns
- Multi-step workflow enforcement only in the frontend — backend must also validate step order
- Application status checked and updated in two separate queries (TOCTOU risk)
- No server-side transaction limits — user can submit unlimited forms
- Bulk listing endpoints with no `LIMIT` clause — enables full-table extraction
- No idempotency check before allowing re-submission of a form

### Organization-specific patterns
- Protected B workflows (e.g., benefit applications): always use `FOR UPDATE` / row-level locking on status transitions
- Sequential step enforcement must be server-side; frontend step guards are UI-only and can be bypassed
- ASVS V11 rate limiting cross-references V13 API rate limiting; avoid duplicate findings
