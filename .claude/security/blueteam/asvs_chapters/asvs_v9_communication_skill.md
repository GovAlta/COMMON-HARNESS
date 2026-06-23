---
id: asvs-v9-communication-subskill
name: ASVS V9 Communication Security Sub-Skill
description: ASVS chapter V9 communication security assessment logic consumed by the ASVS Level 2 assessment workflow.
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

> Sub-skill for **V9 Communication Security**. Finding IDs: `[V9-NNN]`. Tactics: `shared/reference/attack-chain-reference.md` §2. Phase 6 normalizes IDs.

---

## Exclusion Conditions

| Condition                                            | Sub-requirements excluded                    | Justification                    |
| ---------------------------------------------------- | -------------------------------------------- | -------------------------------- |
| No external/backend service calls                    | V9.2 Server Communication Security (partial) | No backend connections to verify |
| Internal-only service with no external communication | V9.1 Client Communication (partial)          | Perimeter TLS assumption applies |

---

> Environment assumptions for this chapter: see `shared/reference/environment-baseline.md` § "ASVS Chapter Assumption Mapping."

---

## V9 Requirements and Verification Rules

### V9.1 — Client Communication Security

**V9.1.1** — Verify that TLS is used for all client connectivity, and does not fall back to insecure or unencrypted protocols.
- **CAS Rule:** environment baseline: TLS 1.2+ assumed at perimeter for public-facing organizational apps. Note assumption as "TLS assumed at perimeter (environment baseline)" in report. Still verify for any direct client connections not traversing the perimeter.
- **Verification:** Check application-level TLS configuration (Kestrel settings, nginx.conf, web.config). If Cloud Landing Zone / Cloudflare is confirmed, note perimeter assumption and mark as PASS with assumption. Still verify that the app does not offer HTTP fallback (`http://` redirects are acceptable; `http://` without redirect is a finding).
- **ATT&CK Tactic:** TA0009 — Collection
- **Severity if failed:** High (if direct non-TLS connection possible), Low (if only missing app-level config with confirmed perimeter TLS)

**V9.1.2** — Verify that only the latest recommended versions of the TLS protocol are enabled, such as TLS 1.2 and TLS 1.3.
- **CAS Rule:** Algorithms must be quantum-resistant per NIST guidance — TLS 1.3 is preferred for quantum readiness roadmap.
- **Verification:** Check TLS version configuration in server settings. Flag TLS 1.0 or 1.1 if explicitly enabled. Note TLS 1.2 as acceptable; TLS 1.3 as preferred.
- **ATT&CK Tactic:** TA0009 — Collection
- **Severity if failed:** High (TLS 1.0/1.1 enabled), Low (TLS 1.3 not enabled — roadmap)

**V9.1.3** — Verify that only the latest recommended cipher suites are enabled, with the weakest cipher suites removed.
- **CAS Rule:** Avoid cipher suites with RC4, DES, 3DES, NULL, EXPORT.
- **Verification:** Check cipher suite configuration if accessible in server/framework config.
- **ATT&CK Tactic:** TA0009 — Collection
- **Severity if failed:** High (if weak ciphers enabled)

---

### V9.2 — Server Communication Security

**V9.2.1** — Verify that connections to and from the server use trusted TLS certificates. Where internally generated or self-signed certificates are used, the server must be configured to only trust specific internal CAs and specific self-signed certificates. All others must be rejected.
- **CAS Rule:** None.
- **Verification:** Check backend HTTP client configuration for certificate validation. Check database connection strings for SSL certificate validation settings.
- **ATT&CK Tactic:** TA0009 — Collection
- **Severity if failed:** High

**V9.2.2** — Verify that encrypted communications such as TLS are used for all inbound and outbound connections, including for management ports, monitoring, authentication, API, or web service calls.
- **CAS Rule:** None.
- **Verification:** Review all outbound connection code: HTTP clients, database connections, message queue connections, cache connections (Redis), external API calls. For each: verify TLS/SSL is enabled. Check connection strings for explicit TLS parameters (`ssl=true`, `Encrypt=true`, `SslMode=Require`).
- **ATT&CK Tactic:** TA0009 — Collection
- **Severity if failed:** High

**V9.2.3** — Verify that all encrypted connections to external systems that involve sensitive information or functions are authenticated.
- **CAS Rule:** None.
- **Verification:** Check external API calls for authentication credentials. Flag outbound calls to external services that handle Protected B data without authentication.
- **ATT&CK Tactic:** TA0001 — Initial Access
- **Severity if failed:** High

**V9.2.4** — Verify that proper certification revocation, such as Online Certificate Status Protocol (OCSP) Stapling, is enabled and configured.
- **CAS Rule:** None.
- **Verification:** Check TLS configuration for OCSP stapling. Note as Low finding if absent.
- **ATT&CK Tactic:** TA0001 — Initial Access
- **Severity if failed:** Low

**V9.2.5** — Verify that backend TLS connection failures are logged.
- **CAS Rule:** None.
- **Verification:** Check logging of TLS/SSL exception handling in HTTP client code.
- **ATT&CK Tactic:** TA0005 — Defense Evasion
- **Severity if failed:** Low

---

## ATT&CK Tactic Summary

Note: Derived from `shared/reference/attack-chain-reference.md` Section 2. Update this file if that file changes.

| Finding Pattern                                 | Primary Tactic        | Kill Chain Stage                                 |
| ----------------------------------------------- | --------------------- | ------------------------------------------------ |
| Disabled TLS certificate validation             | TA0009 Collection     | MitM interception of all backend traffic         |
| Unencrypted backend connections (DB, Redis, MQ) | TA0009 Collection     | Network-level credential/data interception       |
| TLS 1.0/1.1 enabled                             | TA0009 Collection     | Protocol downgrade → POODLE/BEAST exploitation   |
| Outbound API calls without auth                 | TA0001 Initial Access | Impersonation of application to external service |

---

## Cross-Chapter Reference Notes

| This chapter finding                   | Combines with                 | Combined chain risk                                                        |
| -------------------------------------- | ----------------------------- | -------------------------------------------------------------------------- |
| V9.2.2 unencrypted DB connection       | V6.1 PHN without encryption   | Compound: PHN unencrypted at rest + unencrypted in transit = full exposure |
| V9.2.1 disabled certificate validation | V1.9.2 architecture comm auth | Same root cause — consolidate                                              |

---

> **ASSESSMENT ORCHESTRATOR: STOP READING HERE.** The `## Secure Implementation Guide` section below is for `skills/14-asvs-compliant-builder.md` only. Assessment skills do not need implementation patterns.

## Secure Implementation Guide

> **For builder skills only.** Assessment skills use the full chapter file above. This section provides implementation patterns for generating ASVS V9-compliant code.

### When to apply this chapter
Load V9 when configuring outbound HTTP clients, database connections, message queue connections, Redis connections, or any service-to-service communication.

### Secure Outbound HTTPS Client (V9.2.1)

Never disable certificate validation — even for testing:

```typescript
// httpClient.ts — ✓ V9.2.1 compliant: never disable cert validation
import axios from 'axios';

// ✓ V9.2.1: default axios uses system CAs — cert validation is ON by default
export const httpClient = axios.create({
  timeout: 10000,
  // Do NOT set: httpsAgent: new https.Agent({ rejectUnauthorized: false })
  // That disables certificate validation — NEVER do this
});

// For mutual TLS (service-to-service): load client cert from Key Vault, not disk
// const tlsAgent = new https.Agent({
//   cert: clientCertPem,       // from Azure Key Vault
//   key: clientKeyPem,         // from Azure Key Vault
//   rejectUnauthorized: true,  // always true
// });
```

### Database TLS Connection (V9.2.2)

```typescript
// db.ts — ✓ V9.2.2: encrypted database connection
import knex from 'knex';

export const db = knex({
  client: 'mssql',
  connection: {
    server: process.env.DB_HOST!,
    database: process.env.DB_NAME!,
    user: process.env.DB_USER!,
    password: process.env.DB_PASSWORD!,
    options: {
      encrypt: true,                  // ✓ V9.2.2: TLS in transit
      trustServerCertificate: false,  // ✓ V9.2.1: validate server cert
      // trustServerCertificate: true disables validation — only for local dev
    },
  },
});

// For PostgreSQL via Prisma:
// DATABASE_URL="postgresql://<user>:<password>@host:5432/db?sslmode=verify-full"
```

### Redis TLS Connection (V9.2.2)

```typescript
// redis.ts — ✓ V9.2.2: encrypted Redis connection
import { createClient } from 'redis';

export const redisClient = createClient({
  url: process.env.REDIS_URL!, // rediss:// (TLS) not redis://
  socket: {
    tls: true,
    rejectUnauthorized: true,  // ✓ V9.2.1: validate cert
  },
});

redisClient.on('error', (err) => {
  logger.error({ event: 'redis.connection_error', error: err.message });
  // ✓ V7.4.2: handle connection errors — do not crash unguarded
});
```

### TLS Failure Handling (V9.1.1)

```typescript
// ✓ V9.1.1: log TLS errors without exposing cert details to client
httpClient.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.code === 'CERT_HAS_EXPIRED' || error.code === 'UNABLE_TO_VERIFY_LEAF_SIGNATURE') {
      logger.error({
        event: 'tls.certificate_error',
        code: error.code,
        host: error.config?.url,
      });
      throw new Error('Upstream service unavailable'); // ✓ V7.4.1: generic client error
    }
    throw error;
  }
);
```

### Common anti-patterns
- Setting `rejectUnauthorized: false` — disables all cert validation; enables MitM
- Using `http://` instead of `https://` for backend connections in production
- Setting `trustServerCertificate: true` for SQL Server in production
- Using `redis://` (no TLS) for a Redis instance storing session data or PHN/SIN

### Organization-specific patterns
- Cloud Landing Zone SQL Server: always `encrypt: true; trustServerCertificate: false`
- Azure Cache for Redis: always use `rediss://` URL with `tls: true`
- On-Premises: TLS 1.2+ minimum; 1.0/1.1 explicitly disabled at the load balancer level
- Service-to-service via Azure Service Bus or Event Grid: Managed Identity authentication covers encryption requirements
