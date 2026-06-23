---
id: asvs-v8-data-protection-subskill
name: ASVS V8 Data Protection Sub-Skill
description: ASVS chapter V8 data protection assessment logic consumed by the ASVS Level 2 assessment workflow.
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

> Sub-skill for **V8 Data Protection**. Finding IDs: `[V8-NNN]`. Tactics: `shared/reference/attack-chain-reference.md` §2. Phase 6 normalizes IDs.

---

## Exclusion Conditions

| Condition                                 | Sub-requirements excluded        | Justification                                             |
| ----------------------------------------- | -------------------------------- | --------------------------------------------------------- |
| No browser-rendered UI / API-only service | V8.2 Client-side Data Protection | No browser storage to assess                              |
| No sensitive personal data in scope       | V8.3 Sensitive Private Data      | No Protected B data elements identified in classification |

---

> Environment assumptions for this chapter: see `shared/reference/environment-baseline.md` § "ASVS Chapter Assumption Mapping."

---

## V8 Requirements and Verification Rules

### V8.1 — General Data Protection

**V8.1.1** — Verify the application protects sensitive data from being cached in server components such as load balancers and application caches.
- **CAS Rule:** None.
- **Verification:** Check `Cache-Control` headers for API responses returning sensitive data. Responses containing Protected B data should use `Cache-Control: no-store`. Check CDN configuration if present.
- **ATT&CK Tactic:** TA0009 — Collection
- **Severity if failed:** Medium

**V8.1.2** — Verify that all cached or temporary copies of sensitive data stored on the server are protected from unauthorized access or purged/invalidated after the authorized user accesses the sensitive data.
- **CAS Rule:** None.
- **Verification:** Check in-memory cache implementations (Redis, MemoryCache, Elasticache) for Protected B data. Verify cache keys include user identity so one user cannot read another user's cached data.
- **ATT&CK Tactic:** TA0009 — Collection
- **Severity if failed:** High

**V8.1.3** — Verify the application minimizes the number of parameters in a request, such as hidden fields, Ajax variables, cookies and header values.
- **CAS Rule:** None.
- **Verification:** Review API response payloads for unnecessary sensitive fields (over-fetching). Check that responses only return fields the client needs for the current operation.
- **ATT&CK Tactic:** TA0009 — Collection
- **Severity if failed:** Medium

**V8.1.4** — Verify the application can detect and alert on abnormal numbers of requests, such as by IP, user, total per hour or day, or whatever makes sense for the application.
- **CAS Rule:** None.
- **Verification:** Check for anomalous request detection in middleware or monitoring configuration.
- **ATT&CK Tactic:** TA0009 — Collection
- **Severity if failed:** Medium

**V8.1.5** — Verify that regular backups of important data are performed and that test restoration of data is performed.
- **CAS Rule:** None.
- **Verification:** NOT VERIFIABLE via code review — infrastructure concern. Note as N/A.
- **ATT&CK Tactic:** TA0040 — Impact
- **Severity if failed:** N/A (infrastructure)

**V8.1.6** — Verify that sensitive information contained in memory is overwritten as soon as it is no longer required to mitigate memory dumping attacks.
- **CAS Rule:** None.
- **Verification:** For managed languages, note as "runtime-managed" and PASS. For unmanaged code: check for `SecureString` or explicit memory clearing.
- **ATT&CK Tactic:** TA0006 — Credential Access
- **Severity if failed:** Medium (unmanaged code only)

**V8.1.7** — Verify that sensitive or private information that is required to be encrypted, is encrypted using approved cryptographic algorithms that provide both confidentiality and integrity.
- **CAS Rule:** None — cross-reference with V6.1 findings.
- **Verification:** Cross-reference with V6.1 data classification findings. If V6.1 already identifies encryption gaps, write `[V8-NNN: duplicate of V6-NNN]`.
- **ATT&CK Tactic:** TA0009 — Collection
- **Severity if failed:** Covered in V6 chapter — cross-reference only

**V8.1.8** — Verify that cloud storage and object storage access policies protect sensitive data from unauthorized access.
- **CAS Rule:** Cloud Landing Zone guardrails enforce encryption at rest. Application-level bucket policies must still be verified.
- **Verification:** Check storage access configuration: Supabase Storage bucket policies (`public` vs. private), S3 bucket ACLs and policies, Azure Blob container access levels, GCS bucket IAM policies. Flag any public read/write bucket containing sensitive data.
- **ATT&CK Tactic:** TA0009 — Collection
- **Severity if failed:** Critical (public bucket with Protected B data), High (authenticated API mediation missing)

---

### V8.2 — Client-side Data Protection

*Only assess if browser-rendered UI is present. Exclude for API-only services.*

**V8.2.1** — Verify the application sets sufficient anti-caching headers so that sensitive data is not cached in modern browsers.
- **CAS Rule:** None.
- **Verification:** Check HTTP response headers for pages/API endpoints returning sensitive data: `Cache-Control: no-store`, `Pragma: no-cache`. Missing `no-store` on Protected B data responses is a finding.
- **ATT&CK Tactic:** TA0009 — Collection
- **Severity if failed:** Medium

**V8.2.2** — Verify that data stored in browser storage (localStorage, sessionStorage, IndexedDB, or cookies) does not contain sensitive data or PII.
- **CAS Rule:** PHN, SIN, and other Protected B data must not be stored unencrypted in browser storage.
- **Verification:** Search client-side code for `localStorage.setItem`, `sessionStorage.setItem`, `document.cookie` assignments with sensitive field names. Review Redux/state management store for sensitive data persistence.
- **ATT&CK Tactic:** TA0009 — Collection
- **Severity if failed:** Critical (PHN/SIN), High (other Protected B data)

**V8.2.3** — Verify that authenticated data is cleared from client storage, such as the browser DOM, after the client or session is terminated.
- **CAS Rule:** None.
- **Verification:** Check logout handler for localStorage/sessionStorage clearing operations.
- **ATT&CK Tactic:** TA0006 — Credential Access
- **Severity if failed:** Medium

---

### V8.3 — Sensitive Private Data

**V8.3.1** — Verify that sensitive data is sent to the server in the HTTP message body or headers, and that query string parameters from any HTTP verb do not contain sensitive data.
- **CAS Rule:** None.
- **Verification:** Check API endpoints for sensitive data in query parameters (PHN, SIN, account numbers). Search for GET request handlers that accept sensitive identifiers as URL path segments vs. query params — URL parameters are logged by web servers.
- **ATT&CK Tactic:** TA0010 — Exfiltration (via server logs)
- **Severity if failed:** High

**V8.3.2** — Verify that users have a method to remove or export their data on demand.
- **CAS Rule:** applicable privacy legislation right-of-access provisions.
- **Verification:** Check for user data export/deletion functionality.
- **ATT&CK Tactic:** N/A (compliance)
- **Severity if failed:** Medium (regulatory compliance gap)

**V8.3.3** — Verify that users are provided clear language regarding collection and use of supplied personal information and that users have provided opt-in consent for the use of that data before it is used in any way.
- **CAS Rule:** applicable privacy legislation (e.g. GDPR, CCPA, PIPEDA) consent requirements.
- **Verification:** Check for privacy consent mechanisms in UI/registration flows.
- **ATT&CK Tactic:** N/A (compliance)
- **Severity if failed:** Medium (regulatory compliance gap)

**V8.3.4** — Verify that all sensitive data created and processed by the application has been identified, and ensure that a policy exists on how to deal with sensitive data. (ASVS V8.3.4)
- **CAS Rule:** Cross-reference with security classification output.
- **Verification:** Check `.ai/blueteam/data/security-classification.yaml` for identified sensitive data elements. If classification has not been performed, note as prerequisite failure.
- **ATT&CK Tactic:** TA0009 — Collection
- **Severity if failed:** Medium

**V8.3.5** — Verify accessing sensitive data is audited (without logging the sensitive data itself), if the data is collected under relevant data protection directives or where logging of access is required.
- **CAS Rule:** The organization requires audit logging of access to Protected B data (LOG-010 equivalent). Log the access event (user, timestamp, resource, operation) but NOT the Protected B field value itself.
- **Verification:** Check data access handlers for Protected B data. Verify audit logging is present. Verify that the log record does not include the raw PHN/SIN value.
- **ATT&CK Tactic:** TA0005 — Defense Evasion
- **Severity if failed:** High

**V8.3.6** — Verify that sensitive information contained in memory is overwritten as soon as it is no longer required.
- **CAS Rule:** None.
- **Verification:** Same as V8.1.6.
- **ATT&CK Tactic:** TA0006 — Credential Access
- **Severity if failed:** Medium (unmanaged code only)

**V8.3.7** — Verify that sensitive or private information that is required to be encrypted, is encrypted using approved cryptographic algorithms that provide both confidentiality and integrity. (ASVS V8.3.7)
- **CAS Rule:** None.
- **Verification:** Cross-reference with V6.1 and V6.2 findings.
- **ATT&CK Tactic:** TA0009 — Collection
- **Severity if failed:** Cross-reference V6 findings

**V8.3.8** — Verify that sensitive personal information is subject to data retention classification, such that old or out of date data is deleted automatically, on a schedule, or as the situation requires.
- **CAS Rule:** applicable privacy legislation (e.g. GDPR, CCPA, PIPEDA) retention requirements apply.
- **Verification:** Check for data retention mechanisms (scheduled deletion, retention period configuration).
- **ATT&CK Tactic:** TA0009 — Collection
- **Severity if failed:** Low (if no retention controls at all), Medium (if Protected B data retained indefinitely without policy)

---

## ATT&CK Tactic Summary

Note: Derived from `shared/reference/attack-chain-reference.md` Section 2. Update this file if that file changes.

| Finding Pattern                             | Primary Tactic         | Kill Chain Stage                                  |
| ------------------------------------------- | ---------------------- | ------------------------------------------------- |
| Public storage bucket with Protected B data | TA0009 Collection      | Unauthenticated direct download of sensitive data |
| Protected B data in browser localStorage    | TA0009 Collection      | XSS or physical access exposes Protected B data   |
| PHN/SIN in query parameters / URL           | TA0010 Exfiltration    | Sensitive data in server access logs → log access |
| Missing Protected B access audit logging    | TA0005 Defense Evasion | Attacker accesses Protected B data undetected     |
| Cache headers missing on sensitive API      | TA0009 Collection      | Sensitive data cached by CDN/proxy                |

---

## Cross-Chapter Reference Notes

| This chapter finding                  | Combines with              | Combined chain risk                                                            |
| ------------------------------------- | -------------------------- | ------------------------------------------------------------------------------ |
| V8.1.7 encryption missing             | V6.1 data classification   | Same root cause — write `[V8-NNN: duplicate of V6-NNN]`                        |
| V8.2.2 Protected B in browser storage | V3.2.3 JWT in localStorage | Compound client-side exposure: both token and data in XSS-accessible storage   |
| V8.1.8 public storage bucket          | V4.2 BOLA                  | Missing auth on storage + missing object ownership = full data collection path |

---

> **ASSESSMENT ORCHESTRATOR: STOP READING HERE.** The `## Secure Implementation Guide` section below is for `skills/14-asvs-compliant-builder.md` only. Assessment skills do not need implementation patterns.

## Secure Implementation Guide

> **For builder skills only.** Assessment skills use the full chapter file above. This section provides implementation patterns for generating ASVS V8-compliant code.

### When to apply this chapter
Load V8 when building endpoints that return sensitive data, implementing caching for user data, building browser-side data storage, handling Protected B fields, or integrating with cloud storage services.

### Cache-Control Headers for Sensitive Responses (V8.1.1, V8.2.1)

```typescript
// middleware/noCache.ts — ✓ V8.1.1, V8.2.1 compliant
export function noStore(req: Request, res: Response, next: NextFunction) {
  res.set('Cache-Control', 'no-store');
  res.set('Pragma', 'no-cache');
  next();
}

// Apply to all Protected B data endpoints
router.get('/employees/:id', authenticate, noStore, getEmployee);
router.get('/health-records', authenticate, noStore, getHealthRecords);
```

### Server-side Cache Isolation (V8.1.2)

Ensure per-user cache keys so users cannot read each other's cached data:

```typescript
// services/cache.ts — ✓ V8.1.2 compliant: user-scoped cache keys
import { createClient } from 'redis';

const redis = createClient({ url: process.env.REDIS_URL });

// WRONG: shared cache key — any user can read any user's data
// const data = await redis.get(`employee:${employeeId}`);

// RIGHT: user-scoped cache key ✓ V8.1.2
export async function getCachedForUser<T>(
  userId: string,
  resourceKey: string,
  fetchFn: () => Promise<T>,
  ttlSeconds = 300
): Promise<T> {
  const cacheKey = `user:${userId}:${resourceKey}`; // Scoped to requesting user
  const cached = await redis.get(cacheKey);
  if (cached) return JSON.parse(cached);

  const fresh = await fetchFn();
  await redis.setEx(cacheKey, ttlSeconds, JSON.stringify(fresh));
  return fresh;
}
```

### Browser Storage Protection (V8.2.2, V8.2.3)

Protected B data must never be stored unencrypted in browser storage:

```typescript
// client/store/sessionSlice.ts — ✓ V8.2.2 compliant
// Store only non-sensitive session state in browser storage
const sessionSlice = createSlice({
  name: 'session',
  initialState: {
    userId: null as string | null,
    roles: [] as string[],
    // NEVER store: phn, sin, healthRecords, bankAccounts ✓ V8.2.2
  },
  // ...
});

// Logout: clear all client-side state ✓ V8.2.3
export function clearSession() {
  localStorage.clear();
  sessionStorage.clear();
  store.dispatch(sessionSlice.actions.reset());
}
```

### Sensitive Data in URL Prevention (V8.3.1)

```typescript
// ✓ V8.3.1 compliant: sensitive data in request body, not URL
// WRONG: GET /employees?phn=123456789  (logged in access logs)
// RIGHT: POST /employees/lookup with body { phn: '123456789' }

router.post('/employees/lookup', authenticate, async (req, res) => {
  const { phn } = req.body; // ✓ V8.3.1: in body, not URL
  // ...
});
```

### Audit Logging for Protected B Access (V8.3.5, LOG-010)

```typescript
// middleware/protectedBAudit.ts — ✓ V8.3.5, LOG-010 compliant
export function auditProtectedBAccess(dataType: string) {
  return (req: Request, res: Response, next: NextFunction) => {
    logger.info({
      event: 'data.access.protected_b',
      dataType,                    // e.g., 'employee_phn', 'health_record'
      userId: req.user!.id,
      resourceId: req.params.id,  // Resource identifier only — NOT the data value ✓ V8.3.5
      timestamp: new Date().toISOString(),
      requestId: req.id,
    });
    next();
  };
}

// Apply to every Protected B data endpoint
router.get('/employees/:id/health',
  authenticate,
  auditProtectedBAccess('health_record'),  // ← log before access
  getHealthRecord
);
```

### Response Field Minimization (V8.1.3)

Return only the fields the client needs:

```typescript
// ✓ V8.1.3 compliant: explicit field selection — no over-fetching
const employee = await prisma.employee.findUnique({
  where: { id },
  select: {
    id: true,
    name: true,
    email: true,
    department: true,
    // NOT included unless explicitly needed: phn, sin, salary, medicalRecords
  },
});
```

### Cloud Storage Access Control (V8.1.8)

```typescript
// storage/azureBlob.ts — ✓ V8.1.8, STORE-001 compliant
// Never use public container access — always use SAS tokens or managed identity
import { BlobServiceClient } from '@azure/storage-blob';
import { DefaultAzureCredential } from '@azure/identity';

const blobClient = new BlobServiceClient(
  `https://${process.env.STORAGE_ACCOUNT}.blob.core.windows.net`,
  new DefaultAzureCredential() // Managed identity — private container access only ✓ V8.1.8
);

// Generate short-lived SAS token for client download (not public URL)
export async function generateDownloadUrl(containerName: string, blobName: string): Promise<string> {
  // Returns time-limited SAS URL — NOT a public URL ✓ V8.1.8
  const containerClient = blobClient.getContainerClient(containerName);
  const blobSasUrl = await containerClient.getBlobClient(blobName).generateSasUrl({
    permissions: { read: true },
    expiresOn: new Date(Date.now() + 15 * 60 * 1000), // 15 minutes
  });
  return blobSasUrl;
}
```

### Common anti-patterns
- Missing `Cache-Control: no-store` on API responses returning Protected B data
- Using the same Redis cache key for all users accessing a resource (shared cache → BOLA via cache)
- Storing session state containing PHN/SIN/health data in `localStorage` or `sessionStorage`
- PHN/SIN fields in URL query parameters (`GET /lookup?phn=...`) — logged in web server access logs
- Public Azure Blob container or S3 bucket containing user-uploaded files
- Logging the full Protected B field value in audit logs (log the resource ID only)

### Organization-specific patterns
- applicable privacy legislation (e.g. GDPR, CCPA, PIPEDA): right-of-access → implement user data export (`GET /api/user/data/export`)
- applicable privacy legislation (e.g. GDPR, CCPA, PIPEDA): data retention → implement scheduled deletion for records past retention period
- STORE-001/002 (CAS): Azure Blob containers and SharePoint libraries must use private access with SAS or managed identity
- LOG-010 (CAS): every read of Protected B data must generate an audit log entry (who, when, what resource — never the value itself)
