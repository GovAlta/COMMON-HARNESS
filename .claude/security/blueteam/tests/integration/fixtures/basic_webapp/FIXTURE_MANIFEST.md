# FIXTURE_MANIFEST — organizational Employee Directory

## Purpose

This fixture is the **primary regression baseline** for the BlueTeam AI security assessment skills. It is a runnable TypeScript/Express/SQLite application that is intentionally populated with a calibrated mix of real security vulnerabilities and correctly-implemented security controls.

**When to use this fixture:**

- After modifying any BlueTeam skill (threat model, ASVS, CAS, kill-chain, overview report) to verify the skill still detects all known vulnerabilities and does not generate false positives against the known-good controls.
- When developing new detection logic — add the corresponding F-* entry to the catalogue below and verify the skill flags it.
- When developing new pass-through logic — add a P-* entry and verify the skill does not raise a finding.
- As a reference application when onboarding new BlueTeam contributors.

**What this fixture does NOT test:**

- Risk acceptance suppression (that is covered by the `risk_acceptance_app` fixture).
- Protected B data handling (this app is classified Protected A; the PHN/SIN/medical non-suppressible list is tested by a separate fixture).
- Multi-tenant or microservices patterns.

---

## Application Overview

| Property | Value |
|---|---|
| App Name | organizational Employee Directory |
| Purpose | Internal organizational staff directory — name, email, phone, employee ID lookup |
| Stack | Node.js 20 / Express 4 / TypeScript 5 / SQLite (better-sqlite3) |
| Auth | JWT (HS256), bcrypt passwords, express-validator |
| Security Middleware | helmet, express-rate-limit, cors, custom security headers |
| Data Classification | Protected A |
| Deployment | Internal — organizational Azure landing zone, not public-facing |
| Sensitive Data | Employee names, emails, phone numbers, employee IDs, salaries |
| Non-Sensitive Data | Department names, manager IDs |
| PHN / SIN / Medical | None present — Protected A only |

---

## Vulnerability Catalogue

All 24 intentional failures. Skills that perform security assessment SHOULD flag each of these items.

| ID | File | Line Context | Description | Skills That Should Detect It |
|---|---|---|---|---|
| F-V2-01 | `src/routes/auth.ts` | POST /login — failed_attempts never incremented | No account lockout after failed login attempts — brute-force possible indefinitely | threat_model, asvs, cas |
| F-V2-02 | `src/auth/passwords.ts` | `legacyHashPassword()` function | MD5 used as password hash — cryptographically broken, GPU-crackable | threat_model, asvs |
| F-V3-01 | `src/auth/middleware.ts` | `authenticateLegacyToken()` | jwt.decode used instead of jwt.verify — no signature check, token forgery possible | threat_model, asvs, cas |
| F-V3-02 | `src/routes/auth.ts` | jwt.sign call in POST /login | JWT generated without expiresIn — tokens never expire, stolen token is permanently valid | asvs, cas |
| F-V4-01 | `src/routes/admin.ts` | GET /admin/users handler | requireAdmin middleware missing — any authenticated user can list all user accounts | threat_model, asvs, cas |
| F-V4-02 | `src/routes/employees.ts` | GET /:id handler | IDOR — no ownership check, any authenticated user fetches any employee record including salary | threat_model, asvs |
| F-V5-01 | `src/routes/search.ts` | SQL string interpolation of `q` and `department` | SQL injection via string concatenation — both parameters unsafely embedded in query | threat_model, asvs |
| F-V5-02 | `src/routes/search.ts` | GET / handler — no query length validation | No input length limit on search `q` parameter — enables DoS via expensive LIKE on large input | asvs |
| F-V5-03 | `src/routes/auth.ts` | GET /callback — res.redirect(redirect) | Unvalidated open redirect — `redirect` param accepted without allowlist, phishing vector | threat_model, asvs, cas |
| F-V6-01 | `src/config/index.ts` | `JWT_SECRET = 'dir-secret-2024'` | Hardcoded JWT secret committed to source — anyone with repo access knows the signing key | threat_model, asvs, cas |
| F-V6-02 | `src/config/index.ts` | JWT_ALGORITHM + JWT_SECRET combination | HS256 with a short weak secret — vulnerable to offline brute-force of the HMAC key | threat_model, asvs |
| F-V7-01 | `src/routes/admin.ts` | DELETE /users/:id catch block | err.stack returned in JSON response — leaks server file paths and library versions | asvs, cas |
| F-V7-02 | `src/routes/admin.ts` | GET /stats catch block | err.message from DB returned to client — leaks schema details to attacker | asvs |
| F-V8-01 | `src/routes/employees.ts` | GET /:id — logger.info(JSON.stringify(employee)) | Full employee record including salary logged — Protected A PII written to application logs | threat_model, asvs |
| F-V9-01 | `src/app.ts` | `cors({ origin: '*' })` | CORS wildcard — any origin can make credentialed cross-site requests | asvs, cas |
| F-V9-02 | `src/middleware/security.ts` | Missing Strict-Transport-Security header | HSTS not set — protocol downgrade and SSL-stripping attacks possible | asvs, cas |
| F-V11-01 | `src/routes/auth.ts` | POST /login — no rateLimit middleware | No rate limiter on login endpoint — password brute-force unrestricted | asvs, cas |
| F-V11-02 | `src/routes/employees.ts` | GET / — getAllEmployees() with no LIMIT | Entire employee table returned without pagination — single request bulk-extracts all Protected A data | threat_model, asvs |
| F-V12-01 | `src/routes/export.ts` | path.join('./exports', filename) | Path traversal — ../sequences in filename not sanitized, arbitrary file read possible | threat_model, asvs |
| F-V12-02 | `src/routes/export.ts` | No extension check before sendFile | No file type/extension validation — any file served including .db, .env, source files | asvs |
| F-V13-01 | `src/app.ts` | Route registration without /v1/ prefix | No API versioning — breaking changes cannot be deployed alongside current API | cas |
| F-V13-02 | `src/app.ts` | `express.json({ limit: '10mb' })` | Request body limit set to 10mb — enables large-payload DoS against Express JSON parser | asvs, cas |
| F-V14-01 | `src/config/index.ts` | `DEBUG = process.env.NODE_ENV !== 'production'` | DEBUG flag conditionally exposes DB path and NODE_ENV in API responses | asvs |
| F-V14-02 | `src/app.ts` | `helmet({ contentSecurityPolicy: false })` | Content Security Policy disabled — XSS has maximum impact with no CSP restriction | asvs, cas |
| F-PKG-01 | `package.json` | `"jsonwebtoken": "8.5.1"` | jsonwebtoken pinned to 8.5.1 which has CVE-2022-23529 (arbitrary code execution via malformed token) | cybersecurity_tool_use (Trivy/OSV) |

---

## Pass Controls

All 14 intentional pass-throughs. Skills SHOULD NOT raise findings for these items.

| ID | File | Description | Skills That Should NOT Flag It |
|---|---|---|---|
| P-V2-01 | `src/auth/passwords.ts` | bcrypt with SALT_ROUNDS=12 in hashPassword — meets organizational minimum requirements | asvs, threat_model |
| P-V4-01 | `src/auth/middleware.ts` | requireAdmin middleware properly checks req.user.role === 'admin' after signature verification | asvs, cas |
| P-V4-02 | `src/routes/employees.ts` | PUT /:id enforces req.user.id === targetId OR admin role before allowing update | asvs, threat_model |
| P-V5-01 | `src/db/queries.ts` | All CRUD functions use better-sqlite3 prepared statements with ? placeholders | asvs |
| P-V5-02 | `src/utils/validation.ts` | express-validator rules defined with length limits and type constraints | asvs |
| P-V5-03 | `src/routes/employees.ts` | express-validator applied on PUT /:id with field-level rules | asvs |
| P-V7-01 | `src/routes/auth.ts` | Generic 'Authentication failed' message in login catch block — no stack or DB detail | asvs |
| P-V8-01 | `src/utils/logger.ts` | Structured JSON logger does not automatically serialize PII — caller controls message content | asvs |
| P-V9-01 | `src/config/index.ts` | HTTPS_PORT = 443 documented in config with reverse-proxy TLS note | cas |
| P-V11-01 | `src/routes/reports.ts` | express-rate-limit applied on GET /department-summary (20 req / 15 min) | asvs |
| P-V11-02 | `src/routes/reports.ts` | LIMIT 50 in department-summary query prevents bulk data extraction via this endpoint | asvs |
| P-V14-01 | `src/middleware/security.ts` | X-Frame-Options DENY and X-Content-Type-Options nosniff set explicitly | asvs, cas |
| P-V14-02 | `src/app.ts` | helmet() applied globally — provides baseline security headers even with CSP disabled | cas |
| P-DB-01 | `src/db/queries.ts` | getUserByUsername, getEmployeeById, updateEmployee all use parameterized prepared statements | asvs |

---

## Expected Skill Behaviour

### application_map_skill

Should discover:
- Entry points: POST /api/auth/login, POST /api/auth/login/legacy, GET /api/auth/callback, GET /api/employees, GET /api/employees/:id, PUT /api/employees/:id, GET /api/admin/users, DELETE /api/admin/users/:id, GET /api/admin/stats, GET /api/search, GET /api/export/file, GET /api/reports/department-summary, GET /health
- Auth mechanisms: JWT (Bearer), x-legacy-token header (unverified)
- Auth levels per endpoint: unauthenticated (health, callback), authenticated (most), admin-only (delete user, stats, export, reports)
- Hardcoded secret: JWT_SECRET in src/config/index.ts
- Dependency: jsonwebtoken 8.5.1 (should appear in tech stack)
- No .gitignore gaps of concern (*.db and .env already ignored)

### threat_model_skill (threat_model_skill)

Should produce STRIDE findings covering at minimum:
- Spoofing: F-V3-01 (jwt.decode bypass), F-V6-01/02 (weak secret enables token forgery)
- Tampering: F-V5-01 (SQL injection), F-V12-01 (path traversal)
- Repudiation: F-V8-01 (salary in logs is a repudiation concern, not a positive control)
- Information Disclosure: F-V4-02 (IDOR), F-V7-01/02 (error leakage), F-V11-02 (bulk extract)
- Denial of Service: F-V5-02, F-V13-02
- Elevation of Privilege: F-V4-01 (broken access control on admin endpoint), F-V5-03 (open redirect)

Kill chains should include at minimum:
- Chain: Unauthenticated token forgery via x-legacy-token → IDOR on employee records → bulk salary extraction
- Chain: SQL injection in search → users table credential dump → offline bcrypt crack

### asvs_level2_assessment_skill

Should produce chapter findings for:
- V2 (Authentication): F-V2-01, F-V2-02, F-V3-02
- V3 (Session Management): F-V3-01, F-V3-02
- V4 (Access Control): F-V4-01, F-V4-02
- V5 (Validation): F-V5-01, F-V5-02, F-V5-03
- V6 (Cryptography): F-V6-01, F-V6-02
- V7 (Error Handling): F-V7-01, F-V7-02
- V8 (Data Protection): F-V8-01
- V9 (Communications): F-V9-01, F-V9-02
- V11 (Business Logic): F-V11-01, F-V11-02
- V12 (Files and Resources): F-V12-01, F-V12-02
- V13 (API): F-V13-01, F-V13-02
- V14 (Configuration): F-V14-01, F-V14-02

Should NOT flag:
- bcrypt usage (P-V2-01), requireAdmin implementation (P-V4-01), ownership check (P-V4-02),
  prepared statements (P-V5-01, P-DB-01), rate limiter on reports (P-V11-01), LIMIT 50 (P-V11-02),
  X-Frame-Options/nosniff (P-V14-01)

### cybersecurity_architecture_standards_skill (CAS)

Should flag:
- Missing API versioning (F-V13-01)
- CORS wildcard (F-V9-01)
- No HSTS (F-V9-02)
- CSP disabled (F-V14-02)
- No rate limit on login (F-V11-01)
- Hardcoded secret (F-V6-01)
- jwt.decode no-verify pattern (F-V3-01)
- err.stack in response (F-V7-01)

Should not flag:
- helmet() presence (P-V14-02), X-Frame-Options (P-V14-01), requireAdmin (P-V4-01)

### kill_chain_aggregator_skill

After threat_model + asvs + cas complete, should elevate at least one cross-domain chain, for example:
- SQL injection (V5/asvs) + weak JWT secret (V6/asvs + threat_model) + missing rate limit (V11/asvs + CAS) = credential extraction + account takeover + persistent access chain spanning all three assessments

### cybersecurity_tool_use_skill

Should detect:
- F-PKG-01: jsonwebtoken 8.5.1 via Trivy or OSV-Scanner (CVE-2022-23529)
- Possibly: hardcoded JWT secret 'dir-secret-2024' via TruffleHog or pattern scan

### security_overview_report_skill

Should synthesize all JSON artifacts into the 10-tab SPA. Expected tabs with content:
- Overview: Protected A classification, high finding count
- Threat Model: STRIDE findings from above
- ASVS: 14 chapter results, majority of chapters with findings
- CAS: Architecture compliance gaps
- Kill Chains: Cross-domain chains from aggregator
- Tool Scan: F-PKG-01 CVE entry
- Security Requirements: SR-NNN entries derived from findings
- Code Changes: CC-NNN entries for implementable fixes
- Security Tests: test stubs for critical findings
- Risk Register: empty (no risk_acceptances.json in this fixture)

---

## How to Extend

### Adding a new vulnerability test case

1. Implement the vulnerability in the appropriate source file under `src/`.
2. Add a comment in the format `// F-VCAT-NN: Short description` immediately at the vulnerable line.
3. Add a row to the **Vulnerability Catalogue** table in this file with the new ID, file path, line context, description, and which skills should detect it.
4. Run all applicable skills against this fixture and verify the new finding appears in their output.
5. Update the **Expected Skill Behaviour** section if the finding represents a new detection category.

### Adding a new pass-through control

1. Implement the correct control in the appropriate source file.
2. Add a comment in the format `// P-VCAT-NN: Short description` at the implementing line.
3. Add a row to the **Pass Controls** table.
4. Run all applicable skills and verify the control does NOT generate a finding.
5. If a skill incorrectly flags it as a vulnerability, that is a false-positive regression — file a bug against the skill.

### Changing the data classification

If you need to test Protected B detection (PHN, SIN, medical data), do NOT modify this fixture. Create a separate fixture under `tests/fixtures/protected_b_webapp/` with its own security-classification.yaml. Mixing Protected A and Protected B test cases in the same fixture makes regression failures ambiguous.

### Updating the fixture for new skill versions

When a skill is updated to detect a new class of vulnerability:
1. Verify the skill detects all existing F-* entries in this fixture (no regressions).
2. Add a new F-* entry that specifically exercises the new detection capability.
3. Update the **Expected Skill Behaviour** section for the affected skill.

---

## Last Updated

2026-03-05
