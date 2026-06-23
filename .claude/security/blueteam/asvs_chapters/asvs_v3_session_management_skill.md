---
id: asvs-v3-session-management-subskill
name: ASVS V3 Session Management Sub-Skill
description: ASVS chapter V3 session management assessment logic consumed by the ASVS Level 2 assessment workflow.
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

> Sub-skill for **V3 Session Management**. Finding IDs: `[V3-NNN]`. Tactics: `shared/reference/attack-chain-reference.md` §2. Phase 6 normalizes IDs.

---

## Exclusion Conditions

| Condition                                                                       | Sub-requirements excluded   | Justification                         |
| ------------------------------------------------------------------------------- | --------------------------- | ------------------------------------- |
| Pure API service with no user sessions (stateless JWT only, no session cookies) | V3.4 Cookie-based Sessions  | No cookie session mechanism to assess |
| No cookie-based sessions                                                        | V3.4 (all sub-requirements) | Cookie session mechanism not present  |

If stateless JWT is used, V3.5 (Token-based Sessions) applies fully. If both stateless JWT and cookie sessions are present, both sections apply.

---

> Environment assumptions for this chapter: see `shared/reference/environment-baseline.md` § "ASVS Chapter Assumption Mapping."

---

## V3 Requirements and Verification Rules

### V3.1 — Fundamental Session Security

**V3.1.1** — Verify the application never reveals session tokens in URL parameters or error messages.
- **CAS Rule:** None.
- **Verification:** Search for session token/JWT in URL construction code: query string parameters named `token`, `session`, `sessionId`, `jwt`, `access_token`. Search for session tokens in log statements or error responses. Check redirect URLs after authentication for token leakage in URL.
- **ATT&CK Tactic:** TA0006 — Credential Access
- **Severity if failed:** High

**V3.1.2** — Verify the application generates a new session token on user authentication and can be revoked, and that existing sessions are invalidated upon authentication.
- **CAS Rule:** None.
- **Verification:** Read authentication success handler. Confirm a new session/token is generated after successful login. Confirm prior session/token is invalidated.
- **ATT&CK Tactic:** TA0001 — Initial Access (session fixation)
- **Severity if failed:** High

---

### V3.2 — Session Binding

**V3.2.1** — Verify the application generates a new session token on user authentication.
- **CAS Rule:** None.
- **Verification:** Same as V3.1.2 — check new token generation on login.
- **ATT&CK Tactic:** TA0001 — Initial Access
- **Severity if failed:** High

**V3.2.2** — Verify that session tokens possess at least 64 bits of entropy.
- **CAS Rule:** None.
- **Verification:** If using a standard session management library (ASP.NET Identity, Express-session, Flask-Session), note the library defaults. Only flag if custom session ID generation uses insufficient entropy.
- **ATT&CK Tactic:** TA0006 — Credential Access
- **Severity if failed:** High

**V3.2.3** — Verify the application only stores session tokens in the browser using secure methods.
- **CAS Rule:** None.
- **Verification:** Check where tokens are stored on the client side. JWTs stored in `localStorage` or `sessionStorage` are accessible to JavaScript and therefore to XSS. JWTs/session tokens stored in `HttpOnly` cookies are preferred.
- **ATT&CK Tactic:** TA0006 — Credential Access
- **Severity if failed:** High (if in localStorage/sessionStorage), Medium (if in non-HttpOnly cookie)

**V3.2.4** — Verify that session token are generated using approved cryptographic algorithms.
- **CAS Rule:** Algorithms must be quantum-resistant.
- **Verification:** Check JWT signing algorithm if JWT is in use. `none` alg is Critical. `HS256` (HMAC-SHA256) is acceptable for current use but note quantum roadmap. `alg: 'RS256'` or `alg: 'ES256'` with proper key management is preferred.
- **ATT&CK Tactic:** TA0006 — Credential Access
- **Severity if failed:** Critical (alg: none), High (MD5/SHA1-based), Medium (weak key length)

---

### V3.3 — Session Termination

**V3.3.1** — Verify that logout and expiration invalidate the session token, such that the back button or a downstream relying party does not resume an authenticated session, including across relying parties.
- **CAS Rule:** None.
- **Verification:** Read logout handler. Confirm server-side session invalidation (not just client-side token deletion). For stateless JWT: verify token is added to a deny-list or short expiry is enforced. Client-side-only logout (delete cookie/localStorage) is a finding.
- **ATT&CK Tactic:** TA0003 — Persistence
- **Severity if failed:** High

**V3.3.2** — Verify that the application provides a mechanism to allow users to log out of any or all currently active sessions.
- **CAS Rule:** None.
- **Verification:** Search for session management UI or "log out all sessions" functionality.
- **ATT&CK Tactic:** TA0003 — Persistence
- **Severity if failed:** Medium

**V3.3.3** — Verify that the application gives the option to terminate all other active sessions after a successful password change.
- **CAS Rule:** None.
- **Verification:** Read password change handler for session invalidation logic.
- **ATT&CK Tactic:** TA0003 — Persistence
- **Severity if failed:** Medium

**V3.3.4** — Verify that users are able to view and (optionally) log out any or all currently active sessions and devices.
- **CAS Rule:** None.
- **Verification:** Check for active session listing and revocation in user account management.
- **ATT&CK Tactic:** TA0003 — Persistence
- **Severity if failed:** Medium

---

### V3.4 — Cookie-based Sessions

*Only assess if cookie-based sessions are implemented. If excluded, write `[V3.4 EXCLUDED — no cookie-based sessions]` and skip.*

**V3.4.1** — Verify that cookie-based session tokens have the `Secure` attribute set.
- **CAS Rule:** None.
- **Verification:** Read cookie configuration in session middleware. Check `CookieOptions.Secure`, `cookie: { secure: true }`, or equivalent. Missing `Secure` attribute means cookie is transmitted over HTTP.
- **ATT&CK Tactic:** TA0006 — Credential Access
- **Severity if failed:** High

**V3.4.2** — Verify that cookie-based session tokens have the `HttpOnly` attribute set to prevent JavaScript access.
- **CAS Rule:** None.
- **Verification:** Check cookie configuration for `HttpOnly: true`. Missing attribute exposes session token to XSS.
- **ATT&CK Tactic:** TA0006 — Credential Access
- **Severity if failed:** High

**V3.4.3** — Verify that cookie-based session tokens utilize the `SameSite` attribute to limit exposure to cross-site request forgery attacks.
- **CAS Rule:** None.
- **Verification:** Check cookie configuration for `SameSite: Strict` or `SameSite: Lax`. `SameSite: None` requires explicit justification. Missing attribute defaults to browser behaviour.
- **ATT&CK Tactic:** TA0001 — Initial Access (CSRF)
- **Severity if failed:** Medium

**V3.4.4** — Verify that cookie-based session tokens use the `__Host-` prefix to provide cookie isolation.
- **CAS Rule:** None.
- **Verification:** Check session cookie name — `__Host-` prefix is a best practice for isolation on shared domains.
- **ATT&CK Tactic:** TA0006 — Credential Access
- **Severity if failed:** Low

**V3.4.5** — Verify that if the application is published under a domain name with other applications that set or use session cookies that might disclose the session cookies, set the path attribute as precisely as possible.
- **CAS Rule:** None.
- **Verification:** Check cookie `Path` attribute. If the app shares a domain with other apps, an overly broad path (e.g., `/`) may expose session cookies to sibling applications.
- **ATT&CK Tactic:** TA0006 — Credential Access
- **Severity if failed:** Medium (if sharing domain with other apps)

---

### V3.5 — Token-based Sessions

*Applies to all JWT-based auth regardless of cookie vs. Authorization header delivery.*

**V3.5.1** — Verify the application allows users to revoke OAuth tokens that form trust relationships with linked applications.
- **CAS Rule:** None.
- **Verification:** Check OAuth token revocation endpoint or mechanism.
- **ATT&CK Tactic:** TA0003 — Persistence
- **Severity if failed:** Medium

**V3.5.2** — Verify the application uses session tokens rather than static API secrets and keys, except with legacy integrations.
- **CAS Rule:** None.
- **Verification:** Check that user-facing APIs use time-limited session tokens. Static long-lived API keys for user-facing operations are a finding.
- **ATT&CK Tactic:** TA0006 — Credential Access
- **Severity if failed:** High

**V3.5.3** — Verify that stateless session tokens use digital signatures, encryption, and other countermeasures to protect against tampering, enveloping, replay, null cipher, and key substitution attacks.
- **CAS Rule:** None.
- **Verification:** Read JWT validation code. Check: (1) signature verification is enforced (`ValidateIssuerSigningKey: true`), (2) `alg: none` is rejected, (3) algorithm is not taken from the token header without validation (algorithm confusion attack), (4) expiry (`exp`) is validated, (5) issuer (`iss`) and audience (`aud`) are validated.
- **ATT&CK Tactic:** TA0001 — Initial Access
- **Severity if failed:** Critical (if `alg: none` accepted or signature not validated)

---

### V3.7 — Session Exploits Defenses

**V3.7.1** — Verify the application ensures a full, valid login session or requires re-authentication or secondary verification before allowing any sensitive transactions or account changes.
- **CAS Rule:** For Protected B applications, re-authentication or MFA step-up is required for Protected B data access and sensitive operations.
- **Verification:** Check whether high-value operations (password change, data export, PHN/SIN access, financial transaction) require additional auth confirmation.
- **ATT&CK Tactic:** TA0009 — Collection
- **Severity if failed:** High (Critical if Protected B data affected)

---

## ATT&CK Tactic Summary

Note: Derived from `shared/reference/attack-chain-reference.md` Section 2. Update this file if that file changes.

| Finding Pattern                             | Primary Tactic           | Kill Chain Stage                                                |
| ------------------------------------------- | ------------------------ | --------------------------------------------------------------- |
| Session token in URL / log                  | TA0006 Credential Access | Token exposed to referrer logs, browser history, server logs    |
| JWT alg:none / no signature verification    | TA0001 Initial Access    | Forged token → immediate unauthenticated access                 |
| Session not invalidated on logout           | TA0003 Persistence       | Stolen session remains valid indefinitely                       |
| JWT in localStorage (XSS-accessible)        | TA0006 Credential Access | XSS harvests JWT → account takeover                             |
| Missing HttpOnly / Secure cookie attributes | TA0006 Credential Access | JS access or HTTP transmission of session cookie                |
| No re-auth for sensitive operations         | TA0009 Collection        | Authenticated session used for bulk Protected B data extraction |

---

## Cross-Chapter Reference Notes

| This chapter finding                | Combines with                       | Combined chain risk                                                                                                                |
| ----------------------------------- | ----------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| V3.5.3 JWT not validated / alg:none | V2.2.4 auth bypass                  | Both result in Initial Access — report as the same root-cause chain; V2 is primary if env-var bypass exists alongside JWT weakness |
| V3.2.3 JWT in localStorage          | V14.4.3 CSP missing / unsafe-inline | XSS enabled by missing CSP + localStorage storage = token theft chain                                                              |
| V3.7.1 no re-auth for sensitive ops | V4.2 BOLA/IDOR                      | Authenticated session + no ownership checks = bulk data extraction                                                                 |

---

> **ASSESSMENT ORCHESTRATOR: STOP READING HERE.** The `## Secure Implementation Guide` section below is for `skills/14-asvs-compliant-builder.md` only. Assessment skills do not need implementation patterns.

## Secure Implementation Guide

> **For builder skills only.** Assessment skills use the full chapter file above. This section provides implementation patterns for generating ASVS V3-compliant code.

### When to apply this chapter
Load V3 when building login flows, JWT token handling, cookie-based sessions, logout functionality, or any feature requiring re-authentication before sensitive operations.

### Cookie-based Session Configuration (V3.4)

```typescript
// session.ts — ✓ V3.4.1–V3.4.3 compliant
import session from 'express-session';
import connectPgSimple from 'connect-pg-simple';

const PgStore = connectPgSimple(session);

export const sessionMiddleware = session({
  name: '__Host-session',    // __Host- prefix ✓ V3.4.4: domain isolation
  secret: process.env.SESSION_SECRET!,
  resave: false,
  saveUninitialized: false,
  store: new PgStore({ pool: db }),
  cookie: {
    secure: true,            // HTTPS only ✓ V3.4.1
    httpOnly: true,          // No JS access ✓ V3.4.2
    sameSite: 'strict',      // CSRF protection ✓ V3.4.3
    maxAge: 30 * 60 * 1000, // 30-minute idle timeout (SESSION-001)
    path: '/api',            // Restrict path ✓ V3.4.5
  },
});
```

### JWT Token Validation (V3.5.3)

The most critical session requirement: never accept unverified tokens.

```typescript
// middleware/auth.ts — ✓ V3.5.3 compliant
import jwt from 'jsonwebtoken';
import jwksClient from 'jwks-rsa';

// Use JWKS endpoint for Enterprise IdP JWT validation (e.g. Entra ID)
const client = jwksClient({
  jwksUri: `https://login.microsoftonline.com/${process.env.TENANT_ID}/discovery/v2.0/keys`,
  cache: true,
  rateLimit: true,
});

export async function validateToken(token: string): Promise<JwtPayload> {
  const decoded = jwt.decode(token, { complete: true });
  if (!decoded || typeof decoded === 'string') throw new Error('Invalid token');

  const key = await client.getSigningKey(decoded.header.kid);
  const publicKey = key.getPublicKey();

  return jwt.verify(token, publicKey, {
    algorithms: ['RS256'],   // Explicit algorithm — rejects alg:none ✓ V3.5.3
    audience: process.env.CLIENT_ID,
    issuer: `https://login.microsoftonline.com/${process.env.TENANT_ID}/v2.0`,
  }) as JwtPayload;
}
```

### Secure Token Storage (V3.2.3)

Prefer httpOnly cookies over localStorage for session tokens:

```typescript
// After successful login — ✓ V3.2.3: httpOnly cookie prevents JS access
res.cookie('access_token', tokens.accessToken, {
  httpOnly: true,    // XSS-safe: JS cannot read ✓ V3.2.3
  secure: true,
  sameSite: 'strict',
  maxAge: 15 * 60 * 1000, // Short-lived access token: 15 min
});

res.cookie('refresh_token', tokens.refreshToken, {
  httpOnly: true,
  secure: true,
  sameSite: 'strict',
  path: '/api/auth/refresh', // Narrow path ✓ V3.4.5
  maxAge: 7 * 24 * 60 * 60 * 1000,
});
```

### Session Invalidation on Logout (V3.3.1)

Client-side token deletion alone is insufficient. Server-side invalidation is required:

```typescript
// routes/auth.ts — ✓ V3.3.1 compliant
router.post('/logout', authenticate, async (req, res) => {
  // Server-side: add token to deny-list
  await tokenDenyList.add(req.user!.jti, req.user!.exp);

  // Clear client-side cookies
  res.clearCookie('access_token');
  res.clearCookie('refresh_token', { path: '/api/auth/refresh' });

  // Federated logout via Enterprise IdP (e.g. Entra ID)
  res.redirect(`https://login.microsoftonline.com/${process.env.TENANT_ID}/oauth2/v2.0/logout`);
});
```

### New Session on Login (V3.1.2, V3.2.1)

```typescript
// ✓ V3.1.2, V3.2.1 compliant: regenerate session on login
req.session.regenerate((err) => {
  if (err) return next(err);
  req.session.userId = user.id;
  req.session.roles = user.roles;
  res.json({ success: true });
});
```

### Re-authentication for Sensitive Operations (V3.7.1)

```typescript
// middleware/stepUp.ts — ✓ V3.7.1 compliant
export function requireStepUp(maxAgeSeconds = 300) {
  return (req: Request, res: Response, next: NextFunction) => {
    const authTime = req.user?.auth_time; // From Enterprise IdP JWT claim
    const elapsed = Date.now() / 1000 - authTime;
    if (elapsed > maxAgeSeconds) {
      return res.status(401).json({
        error: 'step_up_required',
        message: 'Re-authentication required for this operation',
      });
    }
    next();
  };
}

// Protected B data access — requires re-auth within 5 minutes
router.get('/protected-b-data', authenticate, requireStepUp(300), getData);
```

### Common anti-patterns
- JWTs stored in `localStorage` — accessible to XSS; use httpOnly cookies
- Logout that only clears client-side cookie without server-side token invalidation
- JWT algorithm taken from the token header instead of enforced server-side
- `alg: 'none'` accepted — always specify algorithms explicitly in `jwt.verify()`
- Missing `audience` and `issuer` validation in JWT verification
- Session tokens appended to URLs (e.g., `?token=...`) — logged in access logs
- Static long-lived API secrets used for user-facing sessions

### Organization-specific patterns
- Enterprise IdP JWT validation (e.g. Entra ID): use JWKS endpoint `https://login.microsoftonline.com/{tenantId}/discovery/v2.0/keys`
- SESSION-001 (CAS): idle timeout must be 30 minutes; logout must invalidate server-side session
- For Protected B operations, use `auth_time` claim from Enterprise IdP JWT to enforce step-up auth
- Corporate OIDC Provider uses a separate OIDC endpoint — verify `iss` matches the correct issuer for each IdP
