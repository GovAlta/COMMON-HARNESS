---
id: asvs-v2-authentication-subskill
name: ASVS V2 Authentication Sub-Skill
description: ASVS chapter V2 authentication assessment logic consumed by the ASVS Level 2 assessment workflow.
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

> Sub-skill for **V2 Authentication**. Finding IDs: `[V2-NNN]`. Tactics: `shared/reference/attack-chain-reference.md` §2. Phase 6 normalizes IDs.

---

## Exclusion Conditions

| Condition                                                                                        | Sub-requirements excluded                                              | Justification                                                                       |
| ------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| App fully delegates to approved organizational IdP (e.g. Corporate OIDC Provider, Enterprise IdP, External Identity Gateway) | V2.1 Password Security, V2.2 Anti-brute-force, V2.4 Credential Storage | Provider enforces these at IdP layer — note as "satisfied by organizational identity provider" |
| No OOB authenticator implemented                                                                 | V2.7 Out-of-Band Verifier                                              | Authenticator type not present                                                      |
| No OTP (time-based/TOTP) implemented                                                             | V2.8 One-Time Verifier                                                 | Authenticator type not present                                                      |
| No cryptographic device authentication                                                           | V2.9 Cryptographic Verifier                                            | Authenticator type not present                                                      |
| No look-up/recovery codes issued                                                                 | V2.6 Look-up Secret Verifier                                           | Authenticator type not present                                                      |

If authentication is fully absent (no auth layer at all), write `[V2 CHAPTER — No authentication implemented]` and report as a Critical finding before proceeding.

---

> Environment assumptions for this chapter: see `shared/reference/environment-baseline.md` § "ASVS Chapter Assumption Mapping."

---

## DUC Standard Deviations from NIST 800-63B

The Digital User Credentials Standard v4.3 is the authoritative operational standard for credential requirements. It deviates from NIST 800-63B (which ASVS V2.1 references) in three areas:

| Deviation area                    | NIST 800-63B guidance                                  | DUC v4.3 requirement                                                                                            | Assessment implication                                                                                        |
| --------------------------------- | ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| Privileged account minimum length | 8+ characters                                          | **15-character minimum** for Admin, Service, Local Admin, and System accounts                                       | If app manages privileged credentials directly, 12-char ASVS requirement is insufficient — The organization requires 15    |
| Composition rules                 | No composition rules (prohibits mandatory complexity)  | **3+ of 5 character types** required (uppercase, lowercase, digits, special characters, Unicode), aligned with CCCS | When assessing organizational apps that manage passwords, the composition rule IS required — do not flag it as a finding |
| Mandatory rotation                | Against mandatory rotation unless compromise suspected | **365-day maximum** password duration for all account types                                                         | Mandatory rotation IS required for organizational apps managing passwords directly                                       |

**When assessing V2.1:** if the application delegates password management to a organizational standard IdP (PWD-001), these requirements are enforced at the provider level. For any application that manages its own passwords (PWD-001 exception cases), the DUC requirements take precedence over NIST 800-63B where they conflict.

---

## IdP Delegation Assessment Matrix

Use this table to determine which V2 sub-requirements are app-layer responsibilities vs. waived by IdP delegation:

| V2 Sub-requirement                                         | App delegates fully to approved organizational IdP                                         | App uses custom/partial auth               |
| ---------------------------------------------------------- | ------------------------------------------------------------------------------- | ------------------------------------------ |
| V2.1.1 Password length (12+ chars / DUC 15 for privileged) | Waived — note "satisfied by organizational IdP"                                            | Must verify in app code                    |
| V2.1.2 No truncation                                       | Waived                                                                          | Must verify                                |
| V2.1.6 Change password functionality                       | Waived                                                                          | Must verify                                |
| V2.1.9 No composition rules (DUC 3-of-5 required)     | Waived                                                                          | Must verify DUC compliance                 |
| V2.1.12 Breached password check                            | Waived                                                                          | Must verify                                |
| V2.2.1 Anti-automation controls                            | Waived at IdP level; app-layer rate limiting on handoff endpoint still required | Must verify rate limiting on auth endpoint |
| V2.2.2 No weak authenticators by default                   | Waived                                                                          | Must verify                                |
| V2.2.4 Env-var-gated auth bypass check                     | **NEVER waived** — applies regardless of IdP                                    | **NEVER waived**                           |
| V2.3.1 Secure initial credential distribution              | Waived                                                                          | Must verify                                |
| V2.4.x Credential storage                                  | Waived                                                                          | Must verify (bcrypt/argon2/scrypt/PBKDF2)  |
| V2.5.x Credential recovery                                 | Waived                                                                          | Must verify                                |
| V2.10 Service authentication                               | **NEVER waived** — service-to-service credentials are app responsibility        | Must verify                                |

---

## V2 Requirements and Verification Rules

### V2.1 — Password Security

**V2.1.1** — Verify that user-set passwords are at least 12 characters in length (or 15 for privileged accounts per DUC v4.3).
- **CAS Rule:** DUC v4.3 requires 15-char minimum for privileged accounts. For all user-facing accounts, 12-char minimum applies unless DUC specifies otherwise.
- **Verification:** Read authentication configuration files, custom auth providers, and password validation logic. If delegated to organizational IdP, note as "satisfied by organizational identity provider" and PASS.
- **ATT&CK Tactic:** TA0006 — Credential Access
- **Severity if failed:** High

**V2.1.2** — Verify that passwords of at least 64 characters are permitted and that passwords of more than 128 characters are denied.
- **CAS Rule:** None beyond standard.
- **Verification:** Check validator length constraints on password fields.
- **ATT&CK Tactic:** TA0006 — Credential Access
- **Severity if failed:** Low

**V2.1.3** — Verify that password truncation is not performed.
- **CAS Rule:** None.
- **Verification:** Read credential storage code; confirm full password length is passed to hashing function.
- **ATT&CK Tactic:** TA0006 — Credential Access
- **Severity if failed:** Medium

**V2.1.6** — Verify that a "change password" function is included that requires the current and new password.
- **CAS Rule:** None.
- **Verification:** Search for password change endpoint. Verify it requires `currentPassword` or equivalent.
- **ATT&CK Tactic:** TA0006 — Credential Access
- **Severity if failed:** High

**V2.1.9** — Verify that there are no password composition rules limiting the type of characters permitted.
- **CAS Rule:** DUC v4.3 REQUIRES composition rules (3-of-5 character types) — this deviates from NIST. Do NOT flag DUC-compliant composition rules as a finding in contexts.
- **Verification:** Check password validators. If composition rules are present AND aligned to DUC 3-of-5, note as "compliant with DUC v4.3". Only flag if composition rules are more restrictive than DUC (e.g., blocks Unicode) or if they block legitimate character types.
- **ATT&CK Tactic:** TA0006 — Credential Access
- **Severity if failed:** Low (only if rules block legitimate characters)

**V2.1.12** — Verify that the user can choose to temporarily view the entire masked password, or temporarily view the last typed character.
- **CAS Rule:** None.
- **Verification:** Check UI components or API for password reveal functionality. This is a UX requirement that affects user compliance; absence is a Low finding.
- **ATT&CK Tactic:** N/A
- **Severity if failed:** Low

---

### V2.2 — General Authenticator Security

**V2.2.1** — Verify that anti-automation controls are effective at mitigating breached credential testing, brute force, and account lockout attacks.
- **CAS Rule:** Application-level rate limiting on auth endpoints is required even when delegating to a organizational IdP (the limiter protects the handoff endpoint).
- **Verification:** Read auth endpoint handlers and middleware for rate limiting (`AspNetCoreRateLimit`, `IpRateLimiting`, custom rate limiters). Verify auth endpoints are included in rate limiting scope.
- **ATT&CK Tactic:** TA0006 — Credential Access
- **Severity if failed:** High

**V2.2.2** — Verify that the use of weak authenticators (such as SMS and email) is limited to secondary verification and transaction approval.
- **CAS Rule:** The organization prefers push notifications over SMS for OOB verification (DUC guidance).
- **Verification:** Check MFA/OOB authenticator type. If SMS is used as primary MFA, flag as Medium.
- **ATT&CK Tactic:** TA0006 — Credential Access
- **Severity if failed:** Medium

**V2.2.3** — Verify that secure notifications are sent to users after updates to authentication details.
- **CAS Rule:** None.
- **Verification:** Search for notification logic triggered by password change, email change, or MFA enrollment events.
- **ATT&CK Tactic:** TA0003 — Persistence
- **Severity if failed:** Medium

**V2.2.4** — **[ENV-VAR BYPASS RULE — NEVER WAIVED]** Verify that anti-automation, lockout, rate limiting, and brute force controls are not bypassable via environment variables, configuration flags, or feature flags.
- **CAS Rule:** Environment-variable-gated authentication bypass mechanisms (e.g., `ALLOW_MOCK_IN_PRODUCTION`, `DISABLE_AUTH`, `SKIP_VALIDATION`, `TEST_MODE`, `MOCK_AUTH`) MUST be assessed at the severity of the ungated bypass, not reduced because activation requires a configuration flag. Environment variables are operational configuration, not security controls — they can be set accidentally, through misconfiguration, or via environment injection. If the bypass grants unauthenticated admin access, it is **Critical** regardless of the gating mechanism. This rule applies even when the app is fully delegated to a organizational IdP — the bypass supersedes the delegation.
- **Verification:** Search for environment variable checks in authentication code: `Environment.GetEnvironmentVariable`, `process.env`, `os.getenv`, `System.getenv`, `ConfigurationManager.AppSettings`. For each env-var-gated block in auth code: (1) what does the bypass enable? (2) what authentication level is bypassed? (3) could this env-var be set accidentally in production? Search `Program.cs`, `Startup.cs`, auth middleware, identity service classes, API key handlers, JWT handlers. Check for patterns: `if (env == "test")`, `if (bool.Parse(testMode))`, `if (username == password)`.
- **ATT&CK Tactic:** TA0001 — Initial Access
- **Severity if failed:** **Critical** if bypass grants unauthenticated or admin access; High if bypass weakens but does not eliminate auth

**V2.2.5** — Verify that credential providers and external credential partners are trusted and kept up to date.
- **CAS Rule:** Approved identity providers: Corporate OIDC Provider (AUTH-001), Enterprise IdP e.g. Entra ID (AUTH-002), External Identity Gateway (AUTH-003). Any other provider requires organizational security review.
- **Verification:** Identify IdP integration type. Check SDK/library versions for known vulnerabilities.
- **ATT&CK Tactic:** TA0001 — Initial Access
- **Severity if failed:** High (if using non-approved provider), Medium (if approved provider SDK is outdated)

---

### V2.3 — Authenticator Lifecycle

**V2.3.1** — Verify that system generated initial passwords or activation codes are at least 6 characters long, contain letters and numbers, and expire after a short period of time.
- **CAS Rule:** None.
- **Verification:** Search for initial password generation or activation code generation code. Verify entropy (length, character set) and expiry.
- **ATT&CK Tactic:** TA0006 — Credential Access
- **Severity if failed:** High

**V2.3.2** — Verify that enrollment and other high-value actions complete within a time period that has an appropriate expiry.
- **CAS Rule:** None.
- **Verification:** Check time-limited token/code generation for registration flows (confirmation emails, password resets, invitations). Verify expiry is set (typically 15–60 min for registration, 15 min for password reset).
- **ATT&CK Tactic:** TA0006 — Credential Access
- **Severity if failed:** Medium

**V2.3.3** — Verify that password hints or knowledge-based authentication (so-called "secret questions") are not present.
- **CAS Rule:** None.
- **Verification:** Search for "secret question", "security question", `hint` in auth-related UI components and API payloads.
- **ATT&CK Tactic:** TA0006 — Credential Access
- **Severity if failed:** High

---

### V2.4 — Credential Storage

**V2.4.1** — Verify that passwords are stored in a form that is resistant to offline attacks, using an approved adaptive hashing or salted hashing (bcrypt, scrypt, argon2, PBKDF2).
- **CAS Rule:** Encryption used for credentials must be quantum-resistant per NIST guidance.
- **Verification:** Read credential storage code (user creation, password hashing). Identify the hashing function and library. Flag: MD5, SHA1, SHA256 without KDF, unsalted hashing, plaintext storage, reversible encryption. Pass: bcrypt (cost ≥ 10), argon2, scrypt, PBKDF2 (≥ 100,000 iterations).
- **ATT&CK Tactic:** TA0006 — Credential Access
- **Severity if failed:** Critical

**V2.4.2** — Verify that the salt is at least 32 bits in length and chosen arbitrarily to minimize salt value collisions among stored hashes.
- **CAS Rule:** None beyond standard.
- **Verification:** For any custom hashing implementation, verify salt generation. Libraries like bcrypt, argon2 handle this automatically — PASS if using an approved library correctly.
- **ATT&CK Tactic:** TA0006 — Credential Access
- **Severity if failed:** High

**V2.4.3** — Verify that if PBKDF2 is used, the iteration count is as large as verification server performance will allow, typically at least 100,000 iterations.
- **CAS Rule:** None.
- **Verification:** Check PBKDF2 iteration parameter if that algorithm is in use.
- **ATT&CK Tactic:** TA0006 — Credential Access
- **Severity if failed:** High

**V2.4.4** — Verify that if bcrypt is used, the work factor is as large as verification server performance will allow, with a minimum of 10.
- **CAS Rule:** None.
- **Verification:** Check bcrypt cost factor parameter. Flag if < 10.
- **ATT&CK Tactic:** TA0006 — Credential Access
- **Severity if failed:** Medium

**V2.4.5** — Verify that an additional iteration of a key derivation function is performed, using a salt value that is secret and known only to the verifier.
- **CAS Rule:** None.
- **Verification:** Check for pepper/server-side secret salt in credential hashing.
- **ATT&CK Tactic:** TA0006 — Credential Access
- **Severity if failed:** Low (defence-in-depth layer)

---

### V2.5 — Credential Recovery

**V2.5.1** — Verify that a system generated initial activation secret or recovery secret is not sent in clear text to the user.
- **CAS Rule:** None.
- **Verification:** Confirm password reset links use a tokenized URL, not the raw credential.
- **ATT&CK Tactic:** TA0006 — Credential Access
- **Severity if failed:** High

**V2.5.2** — Verify that password hints or knowledge-based recovery (secret questions) are not present.
- **CAS Rule:** None.
- **Verification:** Same as V2.3.3.
- **ATT&CK Tactic:** TA0006 — Credential Access
- **Severity if failed:** High

**V2.5.3** — Verify that OTP or multi-factor recovery, refresh, or bypass codes are exchanged using a secure channel.
- **CAS Rule:** None.
- **Verification:** Confirm recovery codes are transmitted via the authenticated channel (HTTPS response body), not in plaintext email or SMS body directly.
- **ATT&CK Tactic:** TA0006 — Credential Access
- **Severity if failed:** High

**V2.5.4** — Verify that forgotten password and other recovery paths use a TOTP or other soft token, push notification, or other offline recovery mechanism.
- **CAS Rule:** None.
- **Verification:** Confirm password reset does not rely solely on email link without MFA step for accounts with elevated access.
- **ATT&CK Tactic:** TA0006 — Credential Access
- **Severity if failed:** Medium

**V2.5.5** — Verify that if an authentication factor is changed or replaced, the user is notified of this event.
- **CAS Rule:** None.
- **Verification:** Check notification logic on MFA changes, password reset completions.
- **ATT&CK Tactic:** TA0003 — Persistence
- **Severity if failed:** Medium

**V2.5.6** — Verify forgotten password and other recovery paths use a time-limited one-time reset link, OTP, or another secret.
- **CAS Rule:** None.
- **Verification:** Confirm reset tokens expire (typically 15–60 min). Confirm one-time use (token invalidated after use).
- **ATT&CK Tactic:** TA0006 — Credential Access
- **Severity if failed:** High

**V2.5.7** — Verify that OTP factors, where used, are invalidated after use.
- **CAS Rule:** None.
- **Verification:** Check OTP validation logic — confirm token/code cannot be reused after successful verification.
- **ATT&CK Tactic:** TA0006 — Credential Access
- **Severity if failed:** High

---

### V2.6 — Look-up Secret Verifier

*Applicable only if the application issues recovery codes, backup codes, or lookup tables as an authenticator type.*

**V2.6.1** — Verify that look-up secrets have sufficient randomness of at least 112 bits of entropy.
- **CAS Rule:** None.
- **Verification:** Check entropy of generated recovery codes (e.g., 10 × 8-character alphanumeric codes ≈ sufficient; 6-digit numeric codes are not).
- **ATT&CK Tactic:** TA0006 — Credential Access
- **Severity if failed:** High

**V2.6.2** — Verify that look-up secrets are resistant to offline attacks, such as predictable values.
- **CAS Rule:** None.
- **Verification:** Check generation logic for use of CSPRNG.
- **ATT&CK Tactic:** TA0006 — Credential Access
- **Severity if failed:** High

**V2.6.3** — Verify that look-up secrets are salted and hashed using an approved one-way hash.
- **CAS Rule:** None.
- **Verification:** Confirm recovery codes are not stored in plaintext.
- **ATT&CK Tactic:** TA0006 — Credential Access
- **Severity if failed:** High

---

### V2.7 — Out-of-Band Verifier

*Applicable only if OOB authentication (push notification, SMS OTP, email OTP) is implemented.*

**V2.7.1** — Verify that clear text out-of-band (NIST "restricted") authenticators, such as SMS or PSTN, are not offered by default, and that stronger alternatives such as push notifications are offered first.
- **CAS Rule:** The organization prefers push notifications over SMS.
- **Verification:** Check MFA enrollment options. SMS as the only or default OOB option is a finding.
- **ATT&CK Tactic:** TA0006 — Credential Access
- **Severity if failed:** Medium

**V2.7.2** — Verify that the out-of-band verifier expires out-of-band authentication requests after 10 minutes.
- **CAS Rule:** None.
- **Verification:** Check OOB token/push notification expiry setting.
- **ATT&CK Tactic:** TA0006 — Credential Access
- **Severity if failed:** Medium

**V2.7.3** — Verify that the out-of-band authenticator is used at most once.
- **CAS Rule:** None.
- **Verification:** Check that OOB code/token is invalidated after first use.
- **ATT&CK Tactic:** TA0006 — Credential Access
- **Severity if failed:** High

---

### V2.8 — One-Time Verifier

*Applicable only if TOTP or HOTP is implemented.*

**V2.8.1** — Verify that time-based OTPs have a defined lifetime before expiring.
- **CAS Rule:** None.
- **Verification:** Check TOTP window setting. TOTP standard is 30-second window. Overly large windows (> 90 seconds) reduce security.
- **ATT&CK Tactic:** TA0006 — Credential Access
- **Severity if failed:** Medium

**V2.8.2** — Verify that the keys used for time-based OTPs are stored securely using platform secrets storage.
- **CAS Rule:** None.
- **Verification:** Check how TOTP seeds are stored in the database — confirm they are encrypted at rest.
- **ATT&CK Tactic:** TA0006 — Credential Access
- **Severity if failed:** High

**V2.8.3** — Verify that approved cryptographic algorithms are used in the generation, seeding, and verification of OTPs.
- **CAS Rule:** Algorithms must be quantum-resistant per NIST guidance.
- **Verification:** Check TOTP library and its underlying algorithm (HMAC-SHA1 is standard for TOTP/RFC 6238 but is not quantum-resistant; flag for future roadmap).
- **ATT&CK Tactic:** TA0006 — Credential Access
- **Severity if failed:** Low (quantum readiness; roadmap item)

**V2.8.4** — Verify that time-based OTP can only be used once within the validity period.
- **CAS Rule:** None.
- **Verification:** Check replay protection (used-OTP tracking) in TOTP validation logic.
- **ATT&CK Tactic:** TA0006 — Credential Access
- **Severity if failed:** High

**V2.8.5** — Verify that if a time-based multi-factor OTP token is re-used during the validity period, it is logged and the user is alerted.
- **CAS Rule:** None.
- **Verification:** Check logging logic on TOTP replay attempts.
- **ATT&CK Tactic:** TA0005 — Defense Evasion
- **Severity if failed:** Medium

**V2.8.6** — Verify that physical single-factor OTP generators can be revoked in case of theft or loss.
- **CAS Rule:** None.
- **Verification:** Check device management / MFA device revocation in admin UI.
- **ATT&CK Tactic:** TA0003 — Persistence
- **Severity if failed:** Medium

---

### V2.9 — Cryptographic Verifier

*Applicable only if cryptographic device authentication is implemented.*

**V2.9.1** — Verify that cryptographic keys used in verification are stored securely and protected against disclosure, such as using a TPM, HSM, or OS keystore.
- **CAS Rule:** None.
- **Verification:** Check key storage mechanism for any cryptographic verifier.
- **ATT&CK Tactic:** TA0006 — Credential Access
- **Severity if failed:** High

**V2.9.2** — Verify that the challenge nonce is at least 64 bits in length, and statistically unique or unique over the lifetime of the cryptographic device.
- **CAS Rule:** None.
- **Verification:** Check nonce generation in challenge-response code.
- **ATT&CK Tactic:** TA0006 — Credential Access
- **Severity if failed:** High

**V2.9.3** — Verify that approved cryptographic algorithms are used in the generation, seeding, and verification.
- **CAS Rule:** Algorithms must be quantum-resistant.
- **Verification:** Check algorithm selection in cryptographic verifier.
- **ATT&CK Tactic:** TA0006 — Credential Access
- **Severity if failed:** High

---

### V2.10 — Service Authentication

*Always assessed — NEVER waived by IdP delegation.*

**V2.10.1** — Verify that integration secrets do not rely on unchanging passwords, such as API keys or shared secrets, except with legacy systems.
- **CAS Rule:** Shared API keys must not be shared across multiple consuming services. Each integration must have its own credentials.
- **Verification:** Read API key and service credential configuration. Check `ApiAuthenticationHandler` or equivalent for single shared key serving multiple clients. Review `appsettings.json`, `secrets.json`, environment variables for service credentials.
- **ATT&CK Tactic:** TA0006 — Credential Access
- **Severity if failed:** High (Critical if single shared key grants admin or data-exfiltration-level access)

**V2.10.2** — Verify that if passwords are required for service authentication, the credentials used are not a default password.
- **CAS Rule:** None.
- **Verification:** Check service credentials for default values.
- **ATT&CK Tactic:** TA0006 — Credential Access
- **Severity if failed:** Critical

**V2.10.3** — Verify that passwords are stored with sufficient protection to prevent offline recovery attacks, including local system access.
- **CAS Rule:** None.
- **Verification:** Confirm service passwords are stored in secrets manager / key vault, not in plaintext config files committed to source control.
- **ATT&CK Tactic:** TA0006 — Credential Access
- **Severity if failed:** High (Critical if in committed source)

**V2.10.4** — Verify that passwords, integrations with databases and third-party systems, seeds and internal secrets, and API keys are managed securely and not included in source code or stored within source code repositories.
- **CAS Rule:** This overlaps with V6.4 Secrets Management. Pre-confirmed findings from `secrets_findings[]` in the application map apply here directly. Each `current_head` secrets finding is a confirmed Critical or High finding.
- **Verification:** Cross-reference `secrets_findings[]` from application map. For each confirmed finding: verify the secret is present in current HEAD, identify severity based on secret type (admin API key = Critical, connection string = High, service credential = High).
- **ATT&CK Tactic:** TA0006 — Credential Access
- **Severity if failed:** Critical (production credentials), High (development credentials in production config)

---

## ATT&CK Tactic Summary

Note: Derived from `shared/reference/attack-chain-reference.md` Section 2. Update this file if that file changes.

| Finding Pattern                                      | Primary Tactic           | Kill Chain Stage                           |
| ---------------------------------------------------- | ------------------------ | ------------------------------------------ |
| Auth bypass (env-var-gated, TEST_MODE, DISABLE_AUTH) | TA0001 Initial Access    | Direct unauthenticated entry               |
| Weak/missing credential hashing                      | TA0006 Credential Access | Offline credential cracking after DB exfil |
| Absent anti-brute-force controls                     | TA0006 Credential Access | Online brute force of auth endpoint        |
| Shared / hardcoded API keys (service auth)           | TA0006 Credential Access | Credential theft from source or config     |
| Missing MFA on sensitive operations                  | TA0001 Initial Access    | Account takeover via phishing              |
| Non-expiring/reusable OTP/reset tokens               | TA0006 Credential Access | Token replay attack                        |

---

## Cross-Chapter Reference Notes

Pre-populated known duplicates to prevent two findings for the same vulnerability:

| This chapter finding                              | Combines with                               | Combined chain risk                                                                                                                                                                                                                                             |
| ------------------------------------------------- | ------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| V2.2.4 TEST_MODE / DISABLE_AUTH bypass            | V14.3.4 auth driver name in status endpoint | Reconnaissance → Initial Access: attacker discovers mock auth active via V14 finding, then activates bypass via TEST_MODE. Report V2 finding as the primary. If V14 chapter later produces an auth-driver-name finding, write `[V14-NNN: duplicate of V2-001]`. |
| V2.10.4 secrets in source / hardcoded credentials | V6.4 Secret Management                      | Same root cause — cross-reference finding IDs, do not create two independent findings; V6 chapter should reference this V2 finding                                                                                                                              |
| V2.1 weak password policy                         | V3 Session management (absent timeout)      | Combined: weak password + no session expiry enables persistent account takeover                                                                                                                                                                                 |

---

> **ASSESSMENT ORCHESTRATOR: STOP READING HERE.** The `## Secure Implementation Guide` section below is for `skills/14-asvs-compliant-builder.md` only. Assessment skills do not need implementation patterns.

## Secure Implementation Guide

> **For builder skills only.** Assessment skills use the full chapter file above. This section provides implementation patterns for generating ASVS V2-compliant code.

### When to apply this chapter
Load V2 when building user login, password management, MFA, API key validation, or service-to-service authentication. If fully delegating to a organizational IdP (e.g. Corporate OIDC Provider, Enterprise IdP, External Identity Gateway), most V2.1–V2.5 requirements are satisfied at the provider — focus on V2.2.1 (rate limiting on handoff endpoint), V2.10 (service auth), and V2.2.4 (never-waived bypass check).

### organizational IdP Integration (V2.2.4 — never waived)

The env-var-gated auth bypass must NEVER exist in production code:

```typescript
// middleware/auth.ts — ✓ V2.2.4 compliant: no bypass mechanism
import jwt from 'jsonwebtoken';
import jwksClient from 'jwks-rsa';

// WRONG — bypass that should NEVER exist:
// if (process.env.TEST_MODE === 'true') {
//   req.user = { id: 'test-user', role: 'admin' };
//   return next();
// }

// RIGHT — always validate JWT against Enterprise IdP JWKS (e.g. Entra ID) ✓ V2.2.4
const jwks = jwksClient({
  jwksUri: `https://login.microsoftonline.com/${process.env.TENANT_ID}/discovery/v2.0/keys`,
  cache: true,
  rateLimit: true,
});

export async function authenticate(req: Request, res: Response, next: NextFunction) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'Authentication required' });

  try {
    const decoded = jwt.decode(token, { complete: true });
    const key = await jwks.getSigningKey(decoded?.header.kid);
    req.user = jwt.verify(token, key.getPublicKey(), {
      algorithms: ['RS256'],   // Explicit — rejects alg:none ✓ V2.2.4
      audience: process.env.CLIENT_ID,
      issuer: `https://login.microsoftonline.com/${process.env.TENANT_ID}/v2.0`,
    }) as JwtPayload;
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid token' });
  }
}
```

### Rate Limiting on Auth Endpoint (V2.2.1, RATE-001)

Even when delegating to a organizational IdP, the handoff endpoint needs app-layer rate limiting:

```typescript
// ✓ V2.2.1, RATE-001 compliant
import rateLimit from 'express-rate-limit';

export const authRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20,                   // 20 attempts per window per IP
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many authentication attempts. Please try again later.' },
});

router.post('/auth/login', authRateLimit, loginHandler);
router.get('/auth/callback', authRateLimit, oauthCallbackHandler);
```

### Password Storage — when app manages passwords (V2.4)

Use only when NOT delegating to a organizational IdP (rare for organizational apps):

```typescript
// ✓ V2.4.1 compliant: argon2id
import argon2 from 'argon2';

export const hashPassword = (password: string) =>
  argon2.hash(password, { type: argon2.argon2id, memoryCost: 65536, timeCost: 3 });

export const verifyPassword = (hash: string, candidate: string) =>
  argon2.verify(hash, candidate);
```

### organizational Password Policy Validation (V2.1, DUC v4.3)

```typescript
// ✓ V2.1.1 DUC v4.3: 12-char min (users), 15 (privileged), 3-of-5 composition
function validatePassword(password: string, isPrivileged = false): boolean {
  const minLen = isPrivileged ? 15 : 12;
  if (password.length < minLen || password.length > 128) return false;
  const charTypes = [/[A-Z]/, /[a-z]/, /[0-9]/, /[^A-Za-z0-9]/, /[^\x00-\x7F]/];
  return charTypes.filter(re => re.test(password)).length >= 3; // 3-of-5
}
```

### Service-to-Service Authentication (V2.10)

```typescript
// ✓ V2.10.1 compliant: per-service credentials from Key Vault, never shared
import { SecretClient } from '@azure/keyvault-secrets';
import { DefaultAzureCredential } from '@azure/identity';

const vault = new SecretClient(process.env.AZURE_KEY_VAULT_URL!, new DefaultAzureCredential());

export async function callInternalService(endpoint: string, body: unknown) {
  const apiKey = (await vault.getSecret('internal-service-api-key')).value!;
  return fetch(endpoint, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}
```

### Common anti-patterns
- Environment variable bypass in auth middleware (`TEST_MODE`, `DISABLE_AUTH`, `MOCK_AUTH`) — Critical finding, never acceptable
- bcrypt with work factor < 10 or MD5/SHA1 for password hashing
- Single shared API key used by multiple consumer services (SEC-005)
- No rate limiting on OAuth callback or login endpoints
- Missing `audience`/`issuer` validation allowing tokens from other tenants

### Organization-specific patterns
- Never implement a `TEST_MODE` or `MOCK_AUTH` bypass — use a real test tenant in the Enterprise IdP (e.g. Entra ID)
- DUC v4.3 password policy: 12-char min (users), 15-char min (privileged), 3-of-5 composition, 365-day max age
- Application-layer rate limiting is required on auth endpoints even with Cloudflare (RATE-001)
- Each internal service must have its own credential — no shared service accounts (SEC-005)
