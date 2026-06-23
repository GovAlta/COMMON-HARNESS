---
title: "ATT&CK Kill Chain Reference for organizational Web Applications"
description: Shared MITRE ATT&CK tactic reference tables, kill chain construction standards, and CAS domain to rule ID quick reference used by all organizational security assessment skills. Each skill reads this file before performing attack chain analysis or mapping findings to CAS controls.
version: 1.1.0
status: active
used_by:
  - skills/04-threat-model.md
  - skills/05-asvs-level2-assessment.md
  - skills/06-cas-compliance.md
  - skills/07-kill-chain-aggregator.md
---

## Purpose

This file is the single source of truth for MITRE ATT&CK tactic reference tables and kill chain construction standards for application security assessments. All assessment skills that perform kill chain analysis MUST read this file before constructing chains. Do not maintain separate copies of these tables in individual skill files.

## Section Loading Guide

To minimize context usage, skills MUST load only the sections they need. Do not read the full file when only a subset applies.

| Skill | Sections to load | Sections not needed |
|---|---|---|
| `skills/04-threat-model.md` | 1, 4, 5, 6 | 2 (ASVS-only), 3 (CAS-only) |
| `skills/05-asvs-level2-assessment.md` (orchestrator) | 1, 2, 4, 5 | 3 (CAS-only), 6 (threat model only) |
| ASVS chapter sub-skills | None. Each chapter has Section 2 data pre-inlined in its ATT&CK Tactic Summary table | All |
| `skills/06-cas-compliance.md` | 1, 3, 4 | 2 (ASVS-only), 5 (chain standards already inline in CAS format), 6 (threat model only) |
| `skills/07-kill-chain-aggregator.md` | All (1-6) | (none) |

**How to load a specific section:** Skim the file to find the heading `## Section N:` and read from that heading through the next `---` separator. Stop reading when you have reached all the sections you need. Do not continue to the next section.

---

## Section 1: ATT&CK Enterprise Tactic Reference for organizational Web Applications

This table maps each ATT&CK Enterprise tactic to its typical realization in organizational web application and API contexts. It is used by all three assessment skills to assign tactics to findings and to identify complete kill chains.

| ATT&CK Tactic | ID | Typical Web App Realization |
|---|---|---|
| Reconnaissance | TA0043 | Info disclosure via error messages, health endpoints, auth driver names, differential HTTP response codes, API schema enumeration |
| Initial Access | TA0001 | Auth bypass (incl. env-var-gated), credential stuffing, phishing-delivered token theft, exploitation of public-facing vulnerability |
| Execution | TA0002 | SQL injection, OS command injection, SSRF reaching exec-capable services, unsafe deserialization |
| Persistence | TA0003 | Backdoor/ghost accounts, long-lived tokens without expiry, session fixation |
| Privilege Escalation | TA0004 | BFLA (Broken Function Level Authorization), client-supplied role headers (AUTHZ-005), IDOR to admin paths, env-var-gated privilege bypass |
| Defense Evasion | TA0005 | Log injection to corrupt audit trail, missing logging (LOG-001), audit log access by attacker (LOG-010) |
| Credential Access | TA0006 | Secrets hardcoded in source or git history, credentials in log files, brute force enabled by absent rate limiting |
| Discovery | TA0007 | API endpoint enumeration, differential error code exploitation, cloud metadata service access via SSRF, internal service mapping |
| Lateral Movement | TA0008 | SSRF to internal APIs or cloud metadata service, compromised service account used against downstream services |
| Collection | TA0009 | Bulk data extraction via missing pagination/row limits, IDOR mass enumeration, unrestricted export endpoints, excessive API response fields |
| Exfiltration | TA0010 | Direct API data exfiltration, SSRF-mediated exfil, sensitive data leakage in error responses or logs |
| Impact | TA0040 | Data destruction, ransomware, financial fraud, mass account modification, service disruption |

---

## Section 2: ASVS Category → ATT&CK Tactic Mapping

Use this table when performing Phase 3b kill chain analysis in the ASVS Level 2 assessment skill. Pick the primary tactic(s) for each verified ASVS finding and record them in the Finding template field `ATT&CK Tactic(s)`.

| ASVS Category | Primary ATT&CK Tactic(s) | Kill Chain Stage |
|---|---|---|
| V2 Auth failures (bypass, weak creds) | TA0001 Initial Access, TA0006 Credential Access | Auth bypass → Initial Access; brute force/weak creds → Credential Access |
| V3 Session management failures | TA0001 Initial Access, TA0006 Credential Access | Session hijacking enables Initial Access via stolen session |
| V4 Access control (BOLA/IDOR) | TA0009 Collection | Enables unauthorized data collection across object boundaries |
| V4 Access control (BFLA) | TA0004 Privilege Escalation | Enables escalation to higher-privilege functions |
| V5 Input validation (SQLi, injection) | TA0002 Execution, TA0009 Collection | Code execution or data extraction via injection |
| V5 Input validation (XSS) | TA0001 Initial Access | Token/credential theft enabling subsequent access |
| V6 Cryptography (weak/missing encryption) | TA0009 Collection, TA0010 Exfiltration | Enables reading data at rest or in transit |
| V6 Secrets management (hardcoded secrets) | TA0006 Credential Access | Direct credential theft from source or git history |
| V7 Error handling / info disclosure | TA0043 Reconnaissance | Endpoint, internal structure, and auth mechanism discovery |
| V8 Data protection failures | TA0009 Collection, TA0010 Exfiltration | Enables data access or exfiltration |
| V9 Communication security (TLS failures) | TA0009 Collection, TA0010 Exfiltration | Enables interception of data in transit |
| V12 File handling (path traversal, SSRF) | TA0007 Discovery, TA0008 Lateral Movement | Enables internal resource access or lateral movement |
| V13 API security (auth, CORS, rate limiting) | TA0001 Initial Access, TA0006 Credential Access, TA0043 Reconnaissance | Varies by sub-finding; CORS → exfil; rate limiting absence → brute force |
| V14 Configuration (header/debug disclosure) | TA0043 Reconnaissance | Enables targeted attack planning from leaked infrastructure details |

---

## Section 3: CAS Rule → ATT&CK Tactic Mapping

Use this table when performing Section 8 kill chain analysis in the CAS compliance skill. Pick the primary tactic for each NON-COMPLIANT finding and record it in the finding block field `ATT&CK Tactic`.

| CAS Rule(s) | Primary ATT&CK Tactic(s) | Kill Chain Stage |
|---|---|---|
| AUTH-001, AUTH-002, AUTH-003 (auth absent or bypassable) | TA0001 Initial Access | Entry point. Enables all downstream stages |
| AUTH-004 (missing API auth) | TA0001 Initial Access | Unauthenticated API access with no precondition |
| SEC-001, SEC-002, SEC-004 (secrets in code / config / env) | TA0006 Credential Access | Attacker reads credentials directly from source or repository |
| SEC-003 (JWT not signed or not validated) | TA0001 Initial Access, TA0006 Credential Access | Forged or stolen token = direct authentication bypass |
| SEC-005 (credential lifecycle: shared/long-lived creds) | TA0006 Credential Access | Stale or shared credentials enable persistent access |
| AUTHZ-001, AUTHZ-002 (missing/broken authorization) | TA0004 Privilege Escalation, TA0009 Collection | Unauthorized access to higher-privilege data or functions |
| AUTHZ-005 (client-supplied roles) | TA0004 Privilege Escalation | Attacker-controlled role header directly escalates privilege |
| AUTHZ-006 (sensitive claims returned to client) | TA0006 Credential Access, TA0009 Collection | Protected B fields exposed in client-side token or API response |
| CORS-001 (wildcard CORS on authenticated API) | TA0010 Exfiltration | Cross-origin data theft if any XSS vector exists |
| RATE-001 (missing rate limiting) | TA0006 Credential Access | Enables brute-force of credentials without lockout |
| HDR-001 (info disclosure in headers/endpoints) | TA0043 Reconnaissance | Auth driver names, environment config, or versions leaked to unauthenticated users |
| LOG-001 through LOG-010 (logging failures) | TA0005 Defense Evasion | Attacker operates undetected; no audit trail for incident response |
| ENC-001, ENC-002, ENC-003 (encryption absent) | TA0009 Collection, TA0010 Exfiltration | Unencrypted Protected B data readable at rest or in transit |
| SESSION-001, SESSION-002 (session management failures) | TA0001 Initial Access, TA0006 Credential Access | Session token theft or fixation enables unauthorized access |
| UPLOAD-001 (file validation absent) | TA0002 Execution | Malicious file upload → server-side code execution |
| STORE-001, STORE-002 (publicly accessible storage) | TA0009 Collection | Unauthenticated direct access to data store |
| AI-001, AI-002, AI-004 (AI/LLM input/output/boundary) | TA0001 Initial Access, TA0009 Collection | Prompt injection → auth bypass or data boundary violation |
| AI-005 (AI tool execution: SSRF/traversal) | TA0002 Execution, TA0008 Lateral Movement | Path traversal or SSRF via AI tool input reaches internal services |

---

## Section 4: Common Kill Chain Patterns

These patterns represent frequently observed kill chains in organizational web applications. Check each during kill chain analysis regardless of which assessment skill is running. The patterns are ordered by typical impact (highest first).

- **Reconnaissance → Credential Access → Collection → Exfiltration**: Info disclosure (error messages, health endpoints) reveals auth driver or endpoint structure → brute force or secrets theft → BOLA/IDOR enables bulk data access → unencrypted Protected B data exfiltrated. No authentication required at any step.
- **Authentication bypass + permissive access control**: Env-var-gated auth bypass or missing auth on endpoint + broken function-level authorization = unrestricted data access as any role.
- **Information disclosure + missing authorization**: Schema or endpoint enumeration (differential error responses, verbose errors) + missing row-level authorization = targeted data theft without credential theft.
- **XSS / injection + session in client storage**: Reflected or stored XSS or injection attack harvests session token or OAuth token stored in client-accessible storage = full account takeover.
- **SSRF + cloud metadata endpoint**: SSRF via file path, URL parameter, or AI tool input reaches cloud metadata service (169.254.169.254) = IAM credential theft enabling lateral movement to other cloud services.
- **Missing rate limiting + brute-forceable authentication**: No auth endpoint rate limiting + weak or known-format credentials = authentication bypass via automated brute force.
- **Unauthenticated API + third-party service integration**: Public API endpoint without auth proxies to a third-party service (AI/LLM API, email, SMS, cloud compute) = financial abuse, quota exhaustion, or data exfiltration through the third-party channel.

---

## Section 5: Kill Chain Construction Standards

All kill chains produced by any organizational security assessment skill MUST conform to the following standards. This lets the kill chain aggregator skill process chains from all three skills consistently.

### Chain ID Format

All chains MUST use **KC-NNN** format (KC-001, KC-002, ...). Do not use alternative formats (e.g., CHAIN-NNN). IDs allocated by individual assessment skills are local to that assessment's report. The kill chain aggregator skill allocates globally unique KC-NNN IDs in `.ai/blueteam/data/kill_chains.json`.

### Required Chain Fields

Every documented kill chain MUST include all of the following fields:

| Field | Required | Description |
|---|---|---|
| Chain ID | Yes | KC-NNN format |
| Chain Title | Yes | Descriptive name (e.g., "Unauthenticated PHN Mass Extraction via Endpoint Enumeration + BOLA") |
| Chain Severity | Yes | Combined chain severity (may exceed any individual finding); apply organizational floor weights |
| Attacker Type | Yes | From the Attacker Capability Matrix (Script Kiddie / Cybercriminal / Hacktivist / Insider / Nation-state) |
| AI-enabled variant | Yes | How AI/LLM tools could accelerate or automate this chain (e.g., "LLM-assisted endpoint enumeration accelerates Step 1"), or "N/A" if not applicable |
| Step-by-step table | Yes | See Step Table Format below |
| Chain-Breaking Fix | Yes | The single remediation that most effectively disrupts the entire chain |

### Step Table Format

```markdown
| Step | Attacker Action | Finding/Threat ID | ATT&CK Tactic |
|------|----------------|-------------------|---------------|
| 1 | [action] | [FINDING-NNN / T-NNN / CAS-RULE-ID] | TA#### [Tactic Name] |
| 2 | ... | ... | ... |
```

- The Finding/Threat ID column references the source assessment's finding identifier. Cross-domain chains (produced by the aggregator) reference multiple assessment types; use the format `FINDING-NNN (asvs)`, `T-NNN (threat_model)`, `AUTH-001 (cas)`.
- Steps MUST begin at TA0043 Reconnaissance or TA0001 Initial Access and terminate at TA0009/TA0010 Collection/Exfiltration or TA0040 Impact.

### ATT&CK Tactic Coverage Summary (threat model only)

The threat model report MUST include an ATT&CK Tactic Coverage Summary table in Section 9, listing all 12 tactics and whether each is Covered, Not Applicable, or a Gap. Individual ASVS and CAS reports do not require this table; it is included in the aggregator's cross-domain report instead.

---

## Section 6: CAS Domain → Rule ID Quick Reference

Use this table in Step 4 of the threat model (Controls & Mitigations) and anywhere else a finding must be mapped to CAS rule IDs. For full rule definitions, verification levels, severity tiers, and remediation guidance, read `skills/06-cas-compliance.md`.

| Security Domain | CAS Rule IDs | Notes |
|---|---|---|
| Authentication | AUTH-001, AUTH-002, AUTH-003, AUTH-004 | AUTH-001 external/public users; AUTH-002 organizational staff (Enterprise IdP e.g. Entra ID, MFA required); AUTH-003 partners (External Identity Gateway); AUTH-004 API authentication (JWT) |
| Multi-factor Auth | MFA-001, MFA-002 | MFA-001 MUST for organizational staff; MFA-002 SHOULD for external users accessing Protected B data |
| Authorization | AUTHZ-001, AUTHZ-002, AUTHZ-003 | All three are Critical/High MUST rules; AUTHZ-002 includes middleware ordering requirement (auth check must be first in chain) |
| Session Management | SESSION-001 | MUST: idle timeout enforced, session invalidation on logout, no session tokens in URLs |
| Secrets & Encryption | SEC-001, SEC-002, SEC-003, SEC-004, SEC-005, ENC-001, ENC-002, ENC-003 | ENC-001: TLS 1.2+ and encryption at rest for all Protected A+ data. Use quantum-resistant algorithms per NIST (AES-256 minimum for symmetric; NIST-approved algorithms for asymmetric operations). |
| Logging & Monitoring | LOG-001 (sub-requirements a-k), LOG-002, LOG-003, LOG-004, LOG-005, LOG-006, LOG-007, LOG-008, LOG-010 | LOG-001h requires CRUD audit logging for PII / financial / health data; LOG-002 immutable logs; LOG-003 no PII/secrets in logs |
| OWASP ASVS Level 2 | WEB-001 | **MUST** for all Protected B web apps (ASVS 4.0.3 Level 2). Read `skills/05-asvs-level2-assessment.md`. |
| Content Security Policy | CSP-001 | MUST: no unsafe-inline/eval in script-src; no wildcard img-src; explicit frame-ancestors |
| Security Headers | HDR-001 | MUST: HSTS, X-Content-Type-Options, X-Frame-Options, Referrer-Policy; health/status endpoints must not disclose infrastructure details or auth driver names |
| File Uploads | UPLOAD-001, UPLOAD-002 | MUST: magic byte inspection plus malware scanning (UPLOAD-001); long-term storage to organizational SharePoint/M365, not local filesystem or unapproved blob storage (UPLOAD-002) |
| Rate Limiting & CORS | RATE-001, CORS-001 | MUST: auth endpoint rate limits; no wildcard CORS for authenticated APIs |
| Vulnerability Management | VUL-001, PAT-001 | VUL-001 explicitly requires this threat model; PAT-001 no critical/high CVEs in production |
| Secrets in Code/Config | SEC-001, SEC-002, SEC-004 | No secrets in source code; secrets manager for Protected B apps; no committed .env files with real values |
| Account Lifecycle | ACCT-001 | MUST: disable after 90 days inactivity, terminate after 180 days, remove after 270 days |
| Network / Perimeter | WAF-001, FW-001 or FW-002, CDN-001 | Infrastructure-level controls (NOT VERIFIABLE from code review alone) |
| Cloud Data Security | CDS-001, RES-001, STORE-001, STORE-002 | Cloud LZ deployments: data residency in Canada; no publicly accessible storage buckets or databases |
| AI / LLM Features | AI-001, AI-002, AI-003, AI-004, AI-005, AI-006 | If AI/LLM features present: input sanitization, output handling, cost controls, data boundary enforcement |
