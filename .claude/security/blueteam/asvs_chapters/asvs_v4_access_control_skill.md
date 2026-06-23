---
id: asvs-v4-access-control-subskill
name: ASVS V4 Access Control Sub-Skill
description: ASVS chapter V4 access control assessment logic consumed by the ASVS Level 2 assessment workflow.
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

> Sub-skill for **V4 Access Control**. Finding IDs: `[V4-NNN]`. Tactics: `shared/reference/attack-chain-reference.md` §2. Phase 6 normalizes IDs.

---

## Exclusion Conditions

| Condition                      | Sub-requirements excluded                   | Justification                          |
| ------------------------------ | ------------------------------------------- | -------------------------------------- |
| No admin interface exists      | V4.3 (partial — admin interface protection) | No admin interface to protect          |
| Single-user / no multi-tenancy | V4.2.1 BOLA/IDOR                            | No cross-user data isolation to verify |

---

> Environment assumptions for this chapter: see `shared/reference/environment-baseline.md` § "ASVS Chapter Assumption Mapping."

---

## V4 Requirements and Verification Rules

### V4.1 — General Access Control

**V4.1.1** — Verify that the application enforces access control rules on a trusted service layer, especially if client-side access control is present and could be bypassed.
- **CAS Rule:** None.
- **Verification:** Search for authorization checks in server-side route handlers. Verify authorization is NOT delegated to client-supplied parameters like `isAdmin: true`, `role: "admin"` in request body.
- **ATT&CK Tactic:** TA0004 — Privilege Escalation
- **Severity if failed:** Critical

**V4.1.2** — Verify that all user and data attributes and policy information used by access controls cannot be manipulated by end users unless specifically authorized.
- **CAS Rule:** None.
- **Verification:** Search for authorization decisions based on client-supplied fields: `req.body.role`, `req.body.isAdmin`, `request.Body.roles`, `HttpContext.Request.Form["role"]`. Check for AUTHZ-005 pattern (client-supplied role headers).
- **ATT&CK Tactic:** TA0004 — Privilege Escalation
- **Severity if failed:** Critical

**V4.1.3** — Verify that the principle of least privilege exists — users should only be able to access functions, data files, URLs, controllers, services, and other resources, for which they possess specific authorization.
- **CAS Rule:** None.
- **Verification:** Review role definitions and permission grants. Verify that default permissions are restricted, not permissive.
- **ATT&CK Tactic:** TA0004 — Privilege Escalation
- **Severity if failed:** High

**V4.1.4** — Verify that the principle of deny by default exists whereby new users/roles start with minimal or no permissions and users/roles do not receive access to new features until access is explicitly assigned.
- **CAS Rule:** None.
- **Verification:** Check default role/permission assignments. Verify new user onboarding does not grant excess permissions by default.
- **ATT&CK Tactic:** TA0004 — Privilege Escalation
- **Severity if failed:** High

**V4.1.5** — Verify that access controls fail securely including when an exception occurs.
- **CAS Rule:** **Fail-secure design (SC-7(18))**: Applications MUST default to denying access when a security control component fails, not permitting it.
- **Verification:** Read authorization middleware exception handling. Check for catch blocks that `return true` or `continue` on auth exceptions instead of `return false` / `throw` / `403`. A catch-all that permits is a Critical finding.
- **ATT&CK Tactic:** TA0001 — Initial Access
- **Severity if failed:** Critical

**V4.1.6** — Verify that middleware ordering enforces authentication before other security-relevant processing for protected routes.
- **CAS Rule:** **Middleware ordering rule**: Authentication middleware MUST be the first security-relevant middleware in the chain for protected routes. Middleware that runs before authentication (e.g., configuration checks, feature flags, input validation) can leak internal details to unauthenticated users via error responses (a "fail-open information disclosure" pattern).
- **Verification:** Read middleware registration in `Startup.cs`, `Program.cs`, `app.js`, or equivalent. Map the middleware execution order for protected routes. Check whether any middleware runs before `UseAuthentication()` / `UseAuthorization()` / auth guards that could produce distinguishable error responses to unauthenticated users.
- **ATT&CK Tactic:** TA0043 — Reconnaissance (pre-auth error leakage)
- **Severity if failed:** Medium (information disclosure), High (if pre-auth middleware reveals Protected B data or internal config)

---

### V4.2 — Operation Level Access Control

**V4.2.1** — Verify that sensitive data and APIs are protected against Insecure Direct Object Reference (IDOR) / Broken Object Level Authorization (BOLA) attacks that target creation, reading, updating and deleting of records.
- **CAS Rule:** **BOLA completeness rule**: When a BOLA or missing ownership check is identified on any parameterized endpoint (e.g., `GET /resource/:id`), use the `resource_group` field in the application map to find **all other endpoints sharing the same resource group** and verify that the ownership check is present on every one of them — including POST, PUT, PATCH, DELETE, and any action sub-routes (e.g., `/resource/:id/adjudicate`, `/resource/:id/submit`). Flag each unguarded method or action as a distinct `[V4-NNN]` with the same BOLA root cause, its own file and line reference, and the same severity as the read-path finding. Do not consolidate multiple unguarded methods into a single finding.
- **Verification:** For each parameterized endpoint in `endpoints[]` from the application map: read the handler code. Check for ownership verification: `WHERE user_id = currentUser.id`, `if (record.ownerId !== req.user.id)`, policy-based authorization (`resource.OwnerId == userId`). Identify all endpoints in the same resource group and verify each one independently.
- **ATT&CK Tactic:** TA0009 — Collection
- **Severity if failed:** Critical (if Protected B data), High (if Protected A data)

**V4.2.2** — Verify that the application or framework enforces a strong anti-CSRF mechanism to protect authenticated functionality, and effective anti-automation or anti-CSRF protects unauthenticated functionality.
- **CAS Rule:** None.
- **Verification:** Check CSRF middleware configuration. Verify CSRF tokens are validated on state-changing requests (POST/PUT/DELETE). For JSON APIs using `Authorization: Bearer` headers (not cookies), CSRF is reduced-risk but `SameSite: Strict` on session cookies is still required.
- **ATT&CK Tactic:** TA0001 — Initial Access
- **Severity if failed:** High

---

### V4.3 — Other Access Control

**V4.3.1** — Verify administrative interfaces use appropriate multi-factor authentication to prevent unauthorized use.
- **CAS Rule:** Staff using admin interfaces MUST authenticate via Enterprise IdP (e.g. Entra ID) (AUTH-002) with MFA.
- **Verification:** Check admin route authentication — verify it requires Enterprise IdP / MFA-protected identity (e.g. Entra ID). If admin uses the same auth as regular users without elevated requirements, flag as High.
- **ATT&CK Tactic:** TA0004 — Privilege Escalation
- **Severity if failed:** High

**V4.3.2** — Verify that directory browsing is disabled unless deliberately desired.
- **CAS Rule:** None.
- **Verification:** Check web server configuration (if accessible). Check IIS/Nginx/Apache config for directory listing settings. Check `UseStaticFiles()` options in ASP.NET.
- **ATT&CK Tactic:** TA0043 — Reconnaissance
- **Severity if failed:** Medium

**V4.3.3** — Verify the application does not allow discovery or disclosure of file or directory metadata, such as Thumbs.db, .DS_Store, .git, or .svn folders.
- **CAS Rule:** None.
- **Verification:** Check whether `.git/` directory is accessible via web root. Check `wwwroot`/`public` directory structure for metadata files. Search for `.git` in static file serving configuration.
- **ATT&CK Tactic:** TA0043 — Reconnaissance
- **Severity if failed:** High (if `.git/` exposed — source code and credentials accessible)

**V4.4.1** — **Non-Privileged Access for Non-Security Functions (AC-6(2))**: Verify that users with administrative or security-function access support role switching or separate accounts for day-to-day work.
- **CAS Rule:** Applications SHOULD support role switching or separate accounts for administrative functions, enforcing the "no standing privilege" principle.
- **Verification:** Check whether the application supports role switching or enforces separation between admin and non-admin contexts. Absence of this is a Low finding.
- **ATT&CK Tactic:** TA0004 — Privilege Escalation
- **Severity if failed:** Low (best practice; not a direct exploit vector)

---

## ATT&CK Tactic Summary

Note: Derived from `shared/reference/attack-chain-reference.md` Section 2. Update this file if that file changes.

| Finding Pattern                      | Primary Tactic              | Kill Chain Stage                                     |
| ------------------------------------ | --------------------------- | ---------------------------------------------------- |
| BOLA/IDOR on parameterized endpoints | TA0009 Collection           | Bulk data extraction by iterating IDs                |
| BFLA (function-level auth bypass)    | TA0004 Privilege Escalation | Access to admin/elevated functions                   |
| Client-supplied role/permission      | TA0004 Privilege Escalation | Direct privilege escalation via request manipulation |
| Fail-open access control exception   | TA0001 Initial Access       | Authorization exception → access granted             |
| Missing CSRF protection              | TA0001 Initial Access       | CSRF attack forces authenticated action              |
| .git directory exposed               | TA0043 Reconnaissance       | Source code + credentials from git objects           |

---

## Cross-Chapter Reference Notes

| This chapter finding                                 | Combines with                       | Combined chain risk                                                         |
| ---------------------------------------------------- | ----------------------------------- | --------------------------------------------------------------------------- |
| V4.1.6 middleware ordering (auth after config check) | V7.4 error response normalization   | Pre-auth middleware leaks internal state → Reconnaissance → targeted attack |
| V4.2.1 BOLA/IDOR                                     | V3.7.1 no re-auth for sensitive ops | Session + BOLA = bulk Protected B extraction without additional auth step   |
| V4.3.3 .git directory exposed                        | V6.4 secrets in source              | .git exposure includes all committed secrets from git history               |

---

> **ASSESSMENT ORCHESTRATOR: STOP READING HERE.** The `## Secure Implementation Guide` section below is for `skills/14-asvs-compliant-builder.md` only. Assessment skills do not need implementation patterns.

## Secure Implementation Guide

> **For builder skills only.** Assessment skills use the full chapter file above. This section provides implementation patterns for generating ASVS V4-compliant code.

### When to apply this chapter
Load V4 when building any authenticated endpoint, adding role-based access control, implementing object-level data access, or designing admin interfaces. Every API endpoint that returns or modifies data needs patterns from this chapter.

### Middleware Ordering (V4.1.6)

Authentication MUST run before any other security-relevant middleware. This is the most commonly missed architectural requirement:

```typescript
// app.ts — ✓ V4.1.6 compliant: auth first in every protected route
import express from 'express';
import { authenticate } from './middleware/auth';
import { requireRole } from './middleware/authorize';
import { auditLog } from './middleware/audit';

const app = express();

// Public routes — no auth middleware
app.get('/health', healthCheck);
app.post('/api/auth/login', loginHandler);

// Protected route group — auth ALWAYS first
const protectedRouter = express.Router();
protectedRouter.use(authenticate);  // ← MUST be first: unauthenticated requests stopped here
protectedRouter.use(auditLog);      // Only reached after auth succeeds

app.use('/api', protectedRouter);

// Admin route group — additional role check after auth
const adminRouter = express.Router();
adminRouter.use(authenticate);           // Auth first ✓ V4.1.6
adminRouter.use(requireRole('admin'));   // Then authz ✓ V4.3.1
app.use('/admin', adminRouter);
```

### BOLA/IDOR Prevention (V4.2.1)

Every parameterized endpoint MUST verify that the requesting user owns or is authorized for the requested resource:

```typescript
// routes/employees.ts — ✓ V4.2.1 compliant: ownership check on every operation
router.get('/employees/:id', authenticate, async (req, res) => {
  const { id } = req.params;
  const userId = req.user!.id;
  const userRoles = req.user!.roles;

  // Ownership check: user can only access their own record unless admin ✓ V4.2.1
  const employee = await db.query(
    'SELECT * FROM employees WHERE id = $1 AND (user_id = $2 OR $3 = true)',
    [id, userId, userRoles.includes('admin')]
  );

  if (!employee) return res.status(404).json({ error: 'Not found' });
  res.json(employee);
});

// WRONG — missing ownership check:
// router.get('/employees/:id', authenticate, async (req, res) => {
//   const employee = await db.query('SELECT * FROM employees WHERE id = $1', [req.params.id]);
//   res.json(employee); // ← BOLA: any authenticated user can read any record
// });

// Apply the same ownership check to ALL operations on the same resource ✓ V4.2.1 BOLA completeness rule
router.put('/employees/:id', authenticate, checkOwnership('employees'), updateEmployee);
router.delete('/employees/:id', authenticate, requireRole('admin'), deleteEmployee);
```

### Reusable Ownership Check Middleware

```typescript
// middleware/ownership.ts — ✓ V4.2.1 BOLA completeness rule
export function checkOwnership(table: string) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const { id } = req.params;
    const userId = req.user!.id;

    try {
      const record = await db.query(
        `SELECT user_id FROM ${table} WHERE id = $1`, [id]
      );
      if (!record) return res.status(404).json({ error: 'Not found' });
      if (record.user_id !== userId && !req.user!.roles.includes('admin')) {
        return res.status(403).json({ error: 'Forbidden' });
      }
      next();
    } catch {
      // Fail-secure: deny on exception ✓ V4.1.5
      return res.status(500).json({ error: 'Internal server error' });
    }
  };
}
```

### Deny-by-Default and Fail-Secure (V4.1.4, V4.1.5)

```typescript
// middleware/authorize.ts — ✓ V4.1.4 deny-by-default, ✓ V4.1.5 fail-secure
export function requireRole(requiredRole: string) {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      const userRole = req.user?.role; // From verified JWT — NEVER from req.body ✓ V4.1.2
      if (!userRole) return res.status(403).json({ error: 'Forbidden' }); // Deny if no role

      const ROLE_HIERARCHY: Record<string, number> = { viewer: 1, editor: 2, admin: 3 };
      const hasAccess = (ROLE_HIERARCHY[userRole] ?? 0) >= (ROLE_HIERARCHY[requiredRole] ?? 99);

      if (!hasAccess) return res.status(403).json({ error: 'Forbidden' });
      next();
    } catch {
      // Fail-SECURE: never grant access on error ✓ V4.1.5
      return res.status(403).json({ error: 'Forbidden' });
    }
  };
}
```

### Admin Interface Protection (V4.3.1, V4.4.1)

```typescript
// Protect admin routes: Enterprise IdP (MFA-enforced, e.g. Entra ID) + admin role ✓ V4.3.1
adminRouter.use(authenticate);                   // Enterprise IdP JWT validation
adminRouter.use(requireEntraIdMFA);             // Verify amr claim includes 'mfa'
adminRouter.use(requireRole('admin'));
adminRouter.use(adminAuditLog);                 // Audit all admin actions

// ✓ V4.3.2: disable directory listing in static file serving
app.use(express.static('public', { dotfiles: 'deny', index: false }));
```

### Prevent .git Exposure (V4.3.3)

```typescript
// Explicitly block .git access in Express ✓ V4.3.3
app.use((req, res, next) => {
  if (req.path.startsWith('/.git') || req.path.startsWith('/.env')) {
    return res.status(404).end();
  }
  next();
});
```

In Nginx: `location ~ /\.git { deny all; }`

### Common anti-patterns
- Authorization decisions based on `req.body.role`, `req.body.isAdmin`, `req.query.admin=true` — client-controlled
- `catch (e) { next() }` or `catch (e) { return true }` in auth middleware — fail-open
- Missing BOLA check on mutating operations (PUT/DELETE) when only GET was checked
- Multiple independent authorization implementations across different route files
- Admin routes behind the same auth level as user routes

### Organization-specific patterns
- Staff admin access: verify `amr` claim in Enterprise IdP JWT (e.g. Entra ID) contains `'mfa'` before granting admin functions
- For Protected B data endpoints: check both authentication (valid JWT) AND authorization (role + data ownership) before returning any data
- AUTHZ-005 (CAS): never read role from request body/headers to make authorization decisions — always from the verified JWT `roles` or `groups` claim
