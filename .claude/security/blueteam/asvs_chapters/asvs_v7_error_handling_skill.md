---
id: asvs-v7-error-handling-subskill
name: ASVS V7 Error Handling Sub-Skill
description: ASVS chapter V7 error handling and logging assessment logic consumed by the ASVS Level 2 assessment workflow.
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

> Sub-skill for **V7 Error Handling and Logging**. Finding IDs: `[V7-NNN]`. Tactics: `shared/reference/attack-chain-reference.md` §2. Phase 6 normalizes IDs.

---

## Exclusion Conditions

No exclusion conditions for this chapter — all sub-requirements apply to all applications.

---

> Environment assumptions for this chapter: see `shared/reference/environment-baseline.md` § "ASVS Chapter Assumption Mapping."

---

## V7 Requirements and Verification Rules

### V7.1 — Log Content

**V7.1.1** — Verify that the application does not log credentials or payment details. Session tokens should only be stored in logs in an irreversible, hashed form.
- **CAS Rule:** None.
- **Verification:** Search for logging statements that include password fields, tokens, payment data, PHN, SIN. Check log middleware for any blind request/response logging that captures `Authorization` headers, `password` fields, or form POST bodies.
- **ATT&CK Tactic:** TA0006 — Credential Access
- **Severity if failed:** Critical (if credentials logged), High (if session tokens logged)

**V7.1.2** — Verify that the application does not log other sensitive personal data that could lead to applicable privacy legislation implications.
- **CAS Rule:** PHN, SIN, medical or mental health diagnosis, bank account or credit card number, date-of-birth must not appear in application logs. applicable privacy legislation (e.g. GDPR, CCPA, PIPEDA) obligations apply.
- **Verification:** Search log statements for Protected B field names (PHN, SIN, personalHealthNumber, socialInsuranceNumber). Check structured logging templates for accidentally included sensitive fields.
- **ATT&CK Tactic:** TA0010 — Exfiltration (via log access)
- **Severity if failed:** High

**V7.1.3** — Verify that the application logs security relevant events including successful and failed authentication events, access control failures, deserialization failures and input validation failures.
- **CAS Rule:** Logging requirements (LOG-001 through LOG-010): authentication events, authorization failures, input validation failures, data access events for Protected B data, and admin actions must be logged.
- **Verification:** Read authentication middleware, authorization middleware, and input validation handlers. Check that: (1) login success/failure is logged, (2) authorization failures (403) are logged with user context, (3) input validation failures include the endpoint and data type (not the raw input), (4) admin actions are logged with actor ID. Cross-reference `critical_files.logging` from the application map.
- **ATT&CK Tactic:** TA0005 — Defense Evasion
- **Severity if failed:** High

**V7.1.4** — Verify that each log event includes necessary information that would allow for a detailed investigation when an incident occurs.
- **CAS Rule:** Required log fields: timestamp (ISO 8601), event type, user ID (or service identity), source IP, endpoint/resource, action, result (success/failure), correlation/request ID.
- **Verification:** Read structured logging calls. Verify required fields are present. Check for missing user ID (anonymous logging), missing timestamp, or missing request correlation.
- **ATT&CK Tactic:** TA0005 — Defense Evasion
- **Severity if failed:** Medium

---

### V7.2 — Log Processing

**V7.2.1** — Verify that all authentication decisions are logged, without storing sensitive session tokens or passwords. This should include requests with relevant metadata needed for security investigations.
- **CAS Rule:** None.
- **Verification:** Check auth decision logging — confirm tokens are not logged, but outcome (success/fail), user, IP, and timestamp are.
- **ATT&CK Tactic:** TA0005 — Defense Evasion
- **Severity if failed:** High

**V7.2.2** — Verify that all access control decisions can be logged and all failed decisions are logged. This should include requests with relevant metadata needed for security investigations.
- **CAS Rule:** None.
- **Verification:** Check authorization middleware for logging of denied access events.
- **ATT&CK Tactic:** TA0005 — Defense Evasion
- **Severity if failed:** Medium

---

### V7.3 — Log Protection

**V7.3.1** — Verify that all logging components appropriately encode data to prevent log injection.
- **CAS Rule:** None.
- **Verification:** Check whether user-supplied data is logged without sanitization — specifically look for newline injection (`\n`, `\r`) in log fields that could forge new log entries. Structured JSON logging mitigates this if properly implemented.
- **ATT&CK Tactic:** TA0005 — Defense Evasion
- **Severity if failed:** Medium

**V7.3.2** — Verify that all events are protected from injection when viewed in log viewing software.
- **CAS Rule:** None.
- **Verification:** Same as V7.3.1. Check whether log viewer or dashboard could be vulnerable to XSS via log fields.
- **ATT&CK Tactic:** TA0005 — Defense Evasion
- **Severity if failed:** Medium

**V7.3.3** — Verify that security logs are protected from unauthorized access and modification.
- **CAS Rule:** None.
- **Verification:** Check log file permissions (if local logging). For remote/aggregated logging, verify log write-only access (application should not be able to read or delete its own logs).
- **ATT&CK Tactic:** TA0005 — Defense Evasion
- **Severity if failed:** High

**V7.3.4** — Verify that time sources are synchronized to the correct time and time zone. Strongly consider logging only in UTC or a local time that includes the time zone offset.
- **CAS Rule:** None.
- **Verification:** Check log timestamp format. Confirm UTC or timezone-aware timestamps are used.
- **ATT&CK Tactic:** TA0005 — Defense Evasion
- **Severity if failed:** Low

---

### V7.4 — Error Handling

**V7.4.1** — Verify that a generic message is shown when an unexpected or security sensitive error occurs, potentially with a unique ID which support personnel can use to investigate.
- **CAS Rule:** None.
- **Verification:** Read global exception handler / error middleware. Confirm that: (1) stack traces are not returned to clients, (2) exception type names are not returned, (3) internal component names are not returned. Check for exception filters that convert exceptions to generic `500 Internal Server Error` or problem details objects.
- **ATT&CK Tactic:** TA0043 — Reconnaissance
- **Severity if failed:** Medium

**V7.4.2** — Verify that exception handling is used across the codebase to account for expected and unexpected error conditions.
- **CAS Rule:** None.
- **Verification:** Spot-check high-risk paths (auth, payment, PHN access) for missing try-catch on external calls (database, external API, file I/O). Unhandled exceptions may produce raw stack traces.
- **ATT&CK Tactic:** TA0043 — Reconnaissance
- **Severity if failed:** Medium

**V7.4.3** — Verify that a "last resort" error handler is defined which will catch all unhandled exceptions.
- **CAS Rule:** None.
- **Verification:** Confirm presence of global exception handler (`app.UseExceptionHandler`, Express error middleware `(err, req, res, next)`, `@ControllerAdvice` with `@ExceptionHandler`).
- **ATT&CK Tactic:** TA0043 — Reconnaissance
- **Severity if failed:** Medium

**V7.4.4** — **Error Response Normalization Rule**: Verify that unauthenticated requests to different API routes do not produce distinguishable response patterns that enable endpoint enumeration.
- **CAS Rule:** For protected route groups, ensure authentication runs first so all unauthenticated requests receive a uniform 401 response rather than revealing which endpoints exist and their protection level. Response codes like `404`, `403`, `custom error codes like "GATEWAY_NOT_CONFIGURED"` returned to unauthenticated users indicate endpoint enumeration is possible.
- **Verification:** Review route handler error responses for unauthenticated requests. Check whether routes that don't exist return 404 while protected routes that exist return 401/403 — this differential enables endpoint enumeration. Verify that auth middleware runs before route matching on protected route groups.
- **ATT&CK Tactic:** TA0043 — Reconnaissance
- **Severity if failed:** Medium (High if reveals Protected B endpoint existence)

---

## ATT&CK Tactic Summary

Note: Derived from `shared/reference/attack-chain-reference.md` Section 2. Update this file if that file changes.

| Finding Pattern                                    | Primary Tactic           | Kill Chain Stage                               |
| -------------------------------------------------- | ------------------------ | ---------------------------------------------- |
| Credentials/secrets in logs                        | TA0006 Credential Access | Log access → credential theft                  |
| Stack traces / internal details in error responses | TA0043 Reconnaissance    | Reveals framework, file paths, component names |
| Missing auth event logging                         | TA0005 Defense Evasion   | Attacker operates undetected                   |
| Differential error responses (404 vs 401)          | TA0043 Reconnaissance    | Endpoint enumeration without authentication    |
| Log injection                                      | TA0005 Defense Evasion   | Corrupts audit trail; hides attacker activity  |

---

## Cross-Chapter Reference Notes

| This chapter finding                | Combines with                        | Combined chain risk                                                                     |
| ----------------------------------- | ------------------------------------ | --------------------------------------------------------------------------------------- |
| V7.4.4 differential error responses | V4.1.6 middleware ordering           | Same root cause: auth middleware after route matching → pre-auth information disclosure |
| V7.1.1 credentials in logs          | V6.4 secrets management              | Credential exposure via log path as well as source path                                 |
| V7.4.1 stack traces in responses    | V14.3.1 framework/version disclosure | Compound reconnaissance: stack trace + version = targeted CVE selection                 |

---

> **ASSESSMENT ORCHESTRATOR: STOP READING HERE.** The `## Secure Implementation Guide` section below is for `skills/14-asvs-compliant-builder.md` only. Assessment skills do not need implementation patterns.

## Secure Implementation Guide

> **For builder skills only.** Assessment skills use the full chapter file above. This section provides implementation patterns for generating ASVS V7-compliant code.

### When to apply this chapter
Load V7 when setting up logging infrastructure, implementing error handling middleware, building any endpoint that processes sensitive data, or configuring audit logging for data access events.

### Structured Logging with PII Redaction (V7.1.1, V7.1.2, V7.1.4)

```typescript
// logger.ts — ✓ V7.1.1–V7.1.4 compliant
import pino from 'pino';
import { v4 as uuidv4 } from 'uuid';

export const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  // Redact sensitive fields before any log output ✓ V7.1.1, V7.1.2
  redact: {
    paths: [
      'req.headers.authorization',
      'req.headers.cookie',
      '*.password',
      '*.phn',             // Personal Health Number ✓ privacy legislation
      '*.sin',             // Social Insurance Number ✓ privacy legislation
      '*.personalHealthNumber',
      '*.socialInsuranceNumber',
      '*.bankAccountNumber',
      '*.creditCardNumber',
    ],
    censor: '[REDACTED]',
  },
});

// Request ID middleware for correlation ✓ V7.1.4
export function requestId(req: Request, res: Response, next: NextFunction) {
  req.id = req.headers['x-request-id'] as string || uuidv4();
  res.setHeader('X-Request-Id', req.id);
  next();
}
```

### Security Event Logging (V7.1.3, V7.2.1, V7.2.2)

Log all authentication and authorization events at the right verbosity:

```typescript
// middleware/auditLog.ts — ✓ V7.1.3, LOG-001 compliant
export function auditLog(req: Request, res: Response, next: NextFunction) {
  res.on('finish', () => {
    const event = {
      timestamp: new Date().toISOString(), // ISO 8601 ✓ V7.3.4
      requestId: req.id,
      userId: req.user?.id ?? 'anonymous',
      event: deriveEventType(req, res),
      method: req.method,
      path: req.path,
      statusCode: res.statusCode,
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    };

    // Authorization failure ✓ V7.2.2
    if (res.statusCode === 403) {
      logger.warn({ ...event, event: 'authz.denied' });
    // Authentication failure ✓ V7.2.1
    } else if (res.statusCode === 401) {
      logger.warn({ ...event, event: 'auth.failed' });
    } else {
      logger.info(event);
    }
  });
  next();
}

// Protected B data access audit ✓ V8.3.5, LOG-010
export function auditProtectedBAccess(resourceType: string) {
  return (req: Request, res: Response, next: NextFunction) => {
    logger.info({
      event: 'data.access.protected_b',
      resourceType,
      userId: req.user!.id,
      requestId: req.id,
      timestamp: new Date().toISOString(),
      // DO NOT log the actual PHN/SIN value — log the resource ID only
      resourceId: req.params.id,
    });
    next();
  };
}
```

### Global Error Handler (V7.4.1, V7.4.3)

A last-resort error handler must always be registered:

```typescript
// middleware/errorHandler.ts — ✓ V7.4.1, V7.4.3 compliant
export function errorHandler(
  err: Error,
  req: Request,
  res: Response,
  next: NextFunction
) {
  // Log internally with full details ✓ V7.4.2
  logger.error({
    event: 'error.unhandled',
    error: err.message,
    stack: err.stack,    // Internal log — NOT returned to client
    requestId: req.id,
    userId: req.user?.id,
  });

  // Return generic message to client — no stack trace ✓ V7.4.1
  const statusCode = (err as any).statusCode ?? 500;
  res.status(statusCode).json({
    error: statusCode < 500 ? err.message : 'Internal server error',
    requestId: req.id,   // Correlation ID for support — safe to expose ✓ V7.4.1
    // NEVER include: err.stack, component names, DB query, file paths
  });
}

// Register LAST in Express middleware chain ✓ V7.4.3
app.use(errorHandler);
```

### Error Response Normalization (V7.4.4)

Prevent differential error responses that leak endpoint existence:

```typescript
// app.ts — ✓ V7.4.4 compliant: auth middleware runs before route matching
// Auth middleware registered at router level, not after route matching
const protectedRouter = express.Router();
protectedRouter.use(authenticate); // ← All unknown routes also hit auth first

app.use('/api', protectedRouter);

// Result: unauthenticated requests to ANY /api/* path get 401
// NOT: 404 for nonexistent routes and 403 for protected ones
```

### Log Injection Prevention (V7.3.1)

Using structured (JSON) logging inherently prevents log injection. For message fields containing user input:

```typescript
// ✓ V7.3.1: pino structured logging — user input in data fields, not message
logger.info({
  event: 'user.search',
  query: userQuery,    // Safe: serialized as JSON string, newlines escaped
});

// WRONG — log injection risk:
// logger.info(`User searched for: ${userQuery}`); // \n could forge new log line
```

### Common anti-patterns
- Returning `err.stack` or `err.message` in HTTP error responses
- Logging `req.body` or `req.headers.authorization` without redaction
- Logging PHN, SIN, bank account, or medical diagnosis values
- No global error handler — unhandled exceptions return raw Express error pages
- `console.log()` instead of structured logger — loses timestamp, requestId, level
- Auth events (login success/failure) not logged at all

### Organization-specific patterns
- LOG-001h (CAS): log CRUD events for Protected B data — but only resource ID and action, never the field value
- LOG-002 (CAS): logs must be immutable — use a log shipping service (log shipping assumed); application should not have read or delete access to its own logs
- All log events must include: timestamp (ISO 8601 UTC), userId, requestId, event type, source IP
- PHN, SIN, medical diagnosis, bank/credit card numbers are NEVER logged in any form
