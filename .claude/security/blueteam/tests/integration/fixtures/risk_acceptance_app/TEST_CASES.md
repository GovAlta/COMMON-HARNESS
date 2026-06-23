# Risk Acceptance Test Cases

**Test harness for:** Blue Team Security Agent — Step 13 (Risk Acceptance Processing)
**Application simulated:** risk-acceptance-testapp (Node + Vue + SQLite)
**Date created:** 2026-03-03

This file is the assertion specification for the test harness. Each test case maps to a specific
behavioral branch of Step 13 in `ai_artifacts_schema.md`. Run an assessment skill (ASVS Level 2,
CAS, Threat Model, DR Resilience) against this directory and verify that each expected outcome
appears in the generated report's "Accepted Risks" appendix and in `.ai/blueteam/reports/risk_register.md`.

---

## How to Run

```
Using the skill at "./security/blueteam/asvs_level2_assessment_skill.md",
assess the application in the current directory against the ASVS Level 2 standard
```

Then examine:
1. The "Accepted Risks" appendix at the end of `.ai/blueteam/reports/asvs_level2_security_assessment.md`
2. `.ai/blueteam/reports/risk_register.md`
3. Completion report output (RA counters)

---

## Test Cases

| TC  | RA ID  | File | Line | Status | Expected Outcome |
|-----|--------|------|------|--------|-----------------|
| TC-01 | RA-001 | src/routes/users.ts | 19 | active | **VALID ACCEPTANCE** — finding appears in "Known Accepted Risks" appendix table. Finding does NOT appear in main findings section. |
| TC-02 | RA-002 | src/app.ts | 10 | active (EXPIRED) | **EXPIRED ACCEPTANCE** — `review_date` is 2025-11-15 (past). Entry treated as active finding. Appears in "Expired Acceptances" sub-table in appendix with expiry warning. Finding ALSO appears in main findings section (not suppressed). |
| TC-03 | RA-003 | src/routes/admin.ts | 14 | pending | **PENDING ACCEPTANCE** — finding is NOT suppressed from main findings section. Appears in "Pending Acceptances" sub-table in appendix (advisory note: not yet active). |
| TC-04 | RA-004 | src/db/queries.ts | 24 | active | **VALID HIGH ADVISORY** — finding in "Known Accepted Risks" table. Advisory note rendered because severity_at_acceptance = "high" and register is not CODEOWNERS-protected. |
| TC-05 | RA-005 | src/config/index.ts | 13 | active | **SUPPRESSION_REJECTED** — marker present but finding type is hardcoded secret (non-suppressible). Skill must reject the suppression. Finding appears in main findings section AND in anomaly table as SUPPRESSION_REJECTED. |
| TC-06 | RA-099 | src/auth/middleware.ts | 5 | N/A | **UNAUTHORIZED_SUPPRESSION** — `RISK_ACCEPTED: RA-099` marker in source but no RA-099 entry in register. Appears in anomaly table as UNAUTHORIZED_SUPPRESSION. |
| TC-07 | RA-007 | src/routes/reports.ts | N/A | withdrawn | **WITHDRAWN ENTRY** — no marker in source (correct: finding was fixed). Entry appears in "Withdrawn Acceptances" appendix section. No STALE_REGISTER_ENTRY anomaly triggered (withdrawn entries are exempt from stale check). |
| TC-08 | RA-008 | src/routes/users.ts | 31 (register) / middleware.ts:24 (marker) | active | **DUAL ANOMALY** — (a) Register scope `users.ts:31` has no marker within ±3 lines → STALE_REGISTER_ENTRY; (b) Marker at `middleware.ts:24` references RA-008 but register scope is `users.ts:31` → OUT_OF_SCOPE_SUPPRESSION. Both anomalies appear in anomaly table. |
| TC-09 | RA-006 | src/utils/validation.ts | 12 | active | **STALE_REGISTER_ENTRY** — Register entry scopes to `validation.ts:12` but no marker exists within ±3 lines of that location. Entry appears in anomaly table as STALE_REGISTER_ENTRY (finding was remediated but register not updated to withdrawn). |
| TC-10 | RA-009 | sql/reports.sql | 6 | active | **VALID — SQL comment style** — `-- RISK_ACCEPTED: RA-009` marker correctly detected. Finding in "Known Accepted Risks" table. Verifies SQL comment-style marker parsing. |
| TC-11 | RA-010 | scripts/backup.sh | 7 | pending | **PENDING — shell comment style** — `# RISK_ACCEPTED: RA-010` marker detected. Finding in "Pending Acceptances" table. DR-specific: skill must note that Critical DR gaps are non-suppressible; RA-010 is medium severity so suppression is accepted. |
| TC-12 | N/A | .github/CODEOWNERS | N/A | N/A | **SELF-SERVICE GOVERNANCE BADGE** — `.ai/blueteam/data/risk_acceptances.json` does NOT appear in `.github/CODEOWNERS`. Report must render governance badge as "Self-service (no CODEOWNERS protection detected)". No "CODEOWNER governance active" badge. |
| TC-13 | N/A | src/views/UserList.vue | N/A | N/A | **NORMAL FINDING (NO RA)** — `v-html` with unsanitized `user.bio` is a real XSS finding. No RISK_ACCEPTED marker is present. Finding must appear in main findings section as a normal (non-accepted) finding — confirms the RA system does not interfere with unaccepted findings. |

---

## Expected Appendix Structure

The "Accepted Risks" appendix in the assessment report must contain all of the following sub-sections
(any sub-section with no entries may be omitted):

### Governance Badge
```
**Risk Acceptance Governance:** Self-service (no CODEOWNERS protection detected for .ai/blueteam/data/risk_acceptances.json)
```

### Known Accepted Risks
Entries: RA-001, RA-004, RA-009, RA-011
*(RA-002 expired; RA-003 pending; RA-005 rejected; RA-007 withdrawn; RA-008/RA-006 anomalies)*

| RA ID | Finding | Severity | Accepted By | Review Date | Compensating Controls |
|-------|---------|----------|-------------|-------------|----------------------|
| RA-001 | FINDING-AUTH-07 — No rate limiting on login | Medium | Jane Developer | 2027-02-01 | VPN required; IPS monitoring; IdP lockout |
| RA-004 | FINDING-QUERY-02 — LIKE wildcard ReDoS | High | Bob Lead | 2027-01-10 | API GW 50-char limit; admin-only; SQLite timeout |
| RA-009 | FINDING-QUERY-05 — SELECT * in reports.sql | Low | Jane Developer | 2027-02-20 | Schema review in Sprint 14 |
| RA-011 | HEADERS-02 — Missing CSP header | Medium | Jane Developer | 2027-02-28 | Enterprise IdP SSO gate; Cloudflare WAF |

**Advisory (RA-004, RA-001):** High/Critical risk acceptances are present without CODEOWNERS governance. Consider adding `.ai/blueteam/data/risk_acceptances.json` to CODEOWNERS for additional oversight.

### Pending Acceptances
Entries: RA-003, RA-010

| RA ID | Finding | Severity | Pending Since | Review Date |
|-------|---------|----------|---------------|-------------|
| RA-003 | FINDING-INPUT-03 — Missing role validation | High | 2026-02-28 | 2026-08-28 |
| RA-010 | DRG-003 — Unencrypted backup | Medium | 2026-03-01 | 2026-09-01 |

*Pending acceptances are not active — findings remain in the main report.*

### Expired Acceptances
Entries: RA-002

| RA ID | Finding | Severity | Expired On | Original Accepted By |
|-------|---------|----------|------------|----------------------|
| RA-002 | CORS-01 — CORS wildcard | Medium | 2025-11-15 | Bob Lead |

*Expired acceptances are not active — findings remain in the main report.*

### Withdrawn Acceptances
Entries: RA-007

| RA ID | Finding | Withdrawn Reason |
|-------|---------|-----------------|
| RA-007 | FINDING-QUERY-01 — Unbounded report query | Finding resolved — pagination implemented (PR-405) |

### Acceptance Anomalies

| Anomaly Type | RA / Marker | Location | Detail |
|-------------|-------------|----------|--------|
| SUPPRESSION_REJECTED | RA-005 | src/config/index.ts:13 | Hardcoded secret is a non-suppressible finding type. Marker detected but suppression rejected. Finding remains in main report. |
| UNAUTHORIZED_SUPPRESSION | RA-099 | src/auth/middleware.ts:5 | RISK_ACCEPTED marker references RA-099 but no such entry exists in risk_acceptances.json. |
| STALE_REGISTER_ENTRY | RA-008 | src/routes/users.ts:31 | Register entry scopes to this location but no matching RISK_ACCEPTED marker found within ±3 lines. |
| OUT_OF_SCOPE_SUPPRESSION | RA-008 | src/auth/middleware.ts:24 | Marker at this location references RA-008, but RA-008 register scope is src/routes/users.ts:31. |
| STALE_REGISTER_ENTRY | RA-006 | src/utils/validation.ts:12 | Register entry exists but no marker found within ±3 lines. Finding appears to have been remediated without updating the register to 'withdrawn'. |

---

## Expected Completion Report RA Counters

```
- Risk acceptances: 4 active, 2 pending, 1 expired
- Acceptance anomalies: 1 UNAUTHORIZED_SUPPRESSION, 2 STALE_REGISTER_ENTRY, 1 OUT_OF_SCOPE_SUPPRESSION, 1 SUPPRESSION_REJECTED
- .ai/blueteam/reports/risk_register.md: regenerated
```

---

## File Structure Reference

```
risk_acceptance_tests/
├── .gitignore
├── .github/
│   └── CODEOWNERS            # Does NOT list risk_acceptances.json → Self-service badge (TC-12)
├── package.json
├── tsconfig.json
├── src/
│   ├── app.ts                # RA-002 marker line 9, cors() line 10 — EXPIRED (TC-02)
│   ├── routes/
│   │   ├── users.ts          # RA-001 marker line 18, handler line 19 — VALID (TC-01)
│   │   │                     # Comment at line 31 — RA-008 register scope → STALE (TC-08a)
│   │   ├── admin.ts          # RA-003 marker line 13, handler line 14 — PENDING (TC-03)
│   │   └── reports.ts        # No marker — RA-007 WITHDRAWN (TC-07)
│   ├── auth/
│   │   └── middleware.ts     # RA-099 marker line 5 — UNAUTHORIZED_SUPPRESSION (TC-06)
│   │                         # RA-008 marker line 24 — OUT_OF_SCOPE (TC-08b)
│   ├── db/
│   │   └── queries.ts        # RA-004 marker line 23, function line 24 — VALID HIGH (TC-04)
│   ├── config/
│   │   └── index.ts          # RA-005 marker line 12, key line 13 — SUPPRESSION_REJECTED (TC-05)
│   ├── utils/
│   │   └── validation.ts     # No marker — RA-006 STALE_REGISTER_ENTRY (TC-09)
│   └── views/
│       └── UserList.vue      # No marker — normal XSS finding (TC-13)
├── sql/
│   └── reports.sql           # RA-009 SQL comment marker line 5, SELECT line 6 — VALID (TC-10)
├── scripts/
│   └── backup.sh             # RA-010 shell comment marker line 6, tar line 7 — PENDING (TC-11)
├── templates/
│   └── dashboard.html        # RA-011 HTML comment marker line 13, div line 14 — VALID (TC-12)
├── data/
│   └── .gitkeep
└── .ai/
    ├── data/
    │   ├── risk_acceptances.json          # RA-001 through RA-011 (no RA-099)
    │   ├── security-classification.yaml
    │   └── security-classification-details.yaml
    └── reports/
        └── .gitkeep
```

---

## Notes on Marker Line Numbers

All `scope.line_reference` values in `risk_acceptances.json` point to the **vulnerable line**
(the line immediately after the marker comment), not to the marker comment line itself.
Step 13 must find a `RISK_ACCEPTED: RA-NNN` marker within ±3 lines of `line_reference`.

| RA ID | Marker Line | Vulnerable Line | line_reference |
|-------|-------------|-----------------|----------------|
| RA-001 | 18 | 19 | "19" |
| RA-002 | 9 | 10 | "10" |
| RA-003 | 13 | 14 | "14" |
| RA-004 | 23 | 24 | "24" |
| RA-005 | 12 | 13 | "13" |
| RA-006 | N/A (no marker) | 12 | "12" |
| RA-007 | N/A (no marker) | N/A | null |
| RA-008 | 20 (wrong file) | 31 (wrong file) | "31" |
| RA-009 | 5 | 6 | "6" |
| RA-010 | 6 | 7 | "7" |
| RA-011 | 12 | 13 | "13" |
