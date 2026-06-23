---
title: "Application Security Environment Baseline"
description: Defines the assumed security controls present in all application deployment environments. Security assessment skills read this file to avoid false positives on infrastructure-level controls that are present by policy but not visible in application source code.
version: 1.0.0
status: active
---

# Application Security Environment Baseline

This document defines the security controls that are **assumed to be in place** for application deployments by policy and operational standard. Security assessment agents **MUST**:

1. **Read this file** before beginning any assessment.
2. **Apply assumptions selectively** based on the deployment target stated in the assessment inputs (Cloud LZ, on-premises DC, or unknown).
3. **Explicitly document every assumption made** in the assessment report's "Organizational Environment Assumptions" section (see template below).
4. **Flag assumption conflicts**: if evidence in the repository contradicts a standard assumption (e.g., a Dockerfile or deployment manifest indicating a non-standard deployment that would bypass these controls), the assumption MUST NOT be applied and the finding MUST be reported at its full severity.
5. **Do NOT suppress application-layer findings** using these assumptions. These assumptions apply only to infrastructure-level controls that require cloud console access, network diagrams, or infrastructure-as-code to verify. Application code MUST still implement its own security controls.

---

## Deployment Target Definitions

| Target | Description | How to Determine |
|--------|-------------|-----------------|
| **Cloud Landing Zone (LZ)** | managed Azure, AWS, or GCP environment with PBMM/CCCS Medium guardrails applied | Deployment manifests referencing Azure/AWS/GCP, `render.yaml`, cloud IaC (Terraform, Bicep), or assessment input stating "Cloud Landing Zone" |
| **On-Premises Data Centre (DC)** | managed data centre with zone firewalls | Assessment input stating "on-premises" or "DC"; IIS, Windows Server deployment artifacts |
| **Unknown / Not Stated** | Deployment target not determinable from inputs | Apply only Universal assumptions; flag deployment target as unconfirmed in assumptions |

---

## Universal Assumptions (All Deployments)

The following controls are assumed to be in place regardless of deployment target, based on operational standards.

### Security Tooling

| Control | Assumed State | organizational Standard Basis | CAS Rule |
|---------|--------------|-------------------|----------|
| **MS Defender** | Deployed on all managed servers and endpoints | Anti-Malware Standard | MAL-001 |
| **TLS 1.2+** | Enforced at the network perimeter (load balancer, reverse proxy, or CDN) | network baseline | ENC-001 (infra) |
| **NTP time synchronization** | NTP server configured on all servers | infrastructure baseline | LOG-004 |
| **centralized log shipping service** | centralized cybersecurity log shipping service (Splunk or LogStash) is operated centrally and available for application log forwarding | LOG-006 | LOG-006 |
| **Private repos** | GitHub repos are private by default. Only application team members, specific DevOps staff and security personnel may access them.| Standard operating procedure | SEC-002 |
| **GitHub Advanced Security** | GitHub repos are always scanned by GitHub Advanced Security. Code change to resolve issues is not automated and may not occur. | Standard operating procedure | SEC-002 |

### Approved Identity Providers

The following identity providers are approved and available for applications. Their security controls (MFA enforcement, credential storage, account lifecycle, and anti-brute-force) are enforced at the provider level.

| Provider | User Type | Authentication Methods | MFA | organizational Standard |
|----------|-----------|----------------------|-----|-------------|
| **Corporate OIDC Provider** | Public/external users | Username/password, social login | SHOULD be enforced for Protected B data access (MFA-002) | AUTH-001 |
| **Enterprise IdP (e.g. MS Entra ID)** | organizational staff (internal users) | SSO via SAML/OIDC | MUST be enforced via strong authenticator (MFA-001); SMS not recommended | AUTH-002 |
| **External Identity Gateway** | Partner organizations (e.g., RCMP, other police services, federal agencies) | Federation via SAML/OIDC | Enforced per partner agreement | AUTH-003 |
| **KeyCloak** | Identity broker/federator (when federation is required between providers) | SAML/OIDC federation | Passes through from upstream provider | IDBR-001 |

**Assessment implication:** When an application delegates authentication to one of the above providers, the following controls are satisfied at the provider level and MUST NOT be reported as application findings:
- Password complexity and length requirements (V2.1 ASVS): enforced by provider
- MFA enforcement for organizational staff (MFA-001): enforced at Enterprise IdP level
- Account lockout and anti-brute-force for user credentials: enforced by provider
- Credential storage security (V2.4 ASVS): application does not store passwords
- Password rotation for user accounts: provider responsibility

**Exception:** Applications implementing their own password-based authentication (PWD-001 exception cases) do NOT benefit from these provider-level assumptions and must implement all credential controls in application code.

---

## Cloud Landing Zone Assumptions ( Azure / AWS / GCP LZ)

These controls are enforced by Cloud Landing Zone guardrails for apps deployed to organizational Azure/AWS/GCP Landing Zones.

**PBMM/CCCS context:** Cloud Landing Zones are designed to satisfy the Government of Canada Protected B, Medium-Medium (PBMM) profile under CCCS guidance. Network, key management, and logging infrastructure controls are enforced at the LZ level as technical guardrails.

| CAS Rule | Control | Assumed State | LZ Mechanism |
|----------|---------|--------------|-------------|
| **WAF-001** | Web Application Firewall | **Cloudflare** assumed for all public-facing apps: provides OWASP Core Rule Set WAF, DDoS protection (L3/L4/L7), bot management, and SSL/TLS termination | Cloudflare enterprise agreement |
| **CDN-001** | Content Delivery Network | Cloud-native CDN assumed (Azure Front Door / AWS CloudFront / GCP Cloud CDN) | Cloud Landing Zone guardrails |
| **FW-001** | Cloud-native Firewall | Cloud-native firewalls assumed (Azure NSG + Azure Firewall / AWS Security Groups + Network Firewall / GCP VPC Firewall) | Cloud Landing Zone guardrails |
| **BOT-001** | Bot/Fraud Protection | Cloudflare Bot Management assumed for public-facing apps (included in Cloudflare deployment) | Cloudflare enterprise agreement |
| **RES-001** | Data residency in Canada | Cloud LZ deployed in Canadian regions (Canada Central, Canada East, or equivalent) | Cloud Landing Zone design |
| **ENC-001** (infra portion) | Encryption at rest for managed storage | Cloud LZ enforces encryption at rest for managed storage services (Azure Storage, S3, GCS) | CCCS PBMM guardrails |
| **LOG-007** | Cloud-native telemetry | Azure Application Insights / AWS CloudWatch / GCP Cloud Logging assumed available | Cloud LZ tooling |

### Cloudflare Capabilities and Limitations

When Cloudflare is assumed present for a public-facing app:

**Cloudflare PROVIDES (assume satisfied at perimeter level):**
- OWASP Core Rule Set WAF rules
- Volumetric and layer-7 DDoS mitigation
- SSL/TLS termination with TLS 1.2+ enforced
- Bot detection and challenge pages
- Perimeter-level rate limiting (configurable; provides defence-in-depth baseline)

**Cloudflare does NOT satisfy (application code must still implement):**
- Application authentication (AUTH-001/002/003/004): Cloudflare is not an identity provider
- Application authorization (AUTHZ-001 through AUTHZ-006)
- Application-level rate limiting on auth/sensitive endpoints: **RATE-001 requires application-level rate limiting in addition to Cloudflare.** Reasons: (1) Cloudflare rules may not target individual auth endpoints precisely; (2) CCCS/PBMM AC-7 requires lockout control at the application layer; (3) defence-in-depth requires controls at both perimeter and application layers
- Secrets management (SEC-001 through SEC-005)
- Field-level data encryption (ENC-002, ENC-003)
- Security event logging (LOG-001 through LOG-010)
- File upload validation (UPLOAD-001, UPLOAD-002)
- CORS policy (CORS-001): Cloudflare does not set application CORS headers
- HTTP security headers (CSP-001, HDR-001): must be set by the application
- Session management (SESSION-001, SESSION-002)

---

## On-Premises Data Centre Assumptions (DC)

| CAS Rule | Control | Assumed State | Critical Constraints |
|----------|---------|--------------|---------------------|
| **FW-002** | Zone firewalls | Zone 2/3 firewalls exist at the DC network boundary | **NOT zero-trust.** Application and database servers may be on the same flat network segment. Explicit segmentation (separate VLANs/subnets per tier) MUST be verified separately. Do not assume the DB tier is isolated from the app tier. |
| **SQL Server TDE** | Database encryption at rest | SQL Server databases use Transparent Data Encryption (TDE) as part of the standard organizational on-premises SQL Server build | **TDE protects physical media only (disk/backup theft).** TDE does NOT protect against: SQL injection, unauthorized query access via the database engine, or an authenticated attacker with database-level access. Field-level encryption for high-sensitivity data (PHN / SIN / similar fields under ENC-002/003) is still required and MUST NOT be suppressed because TDE is assumed present. |
| **MAL-001** | Anti-malware | MS Defender deployed on all on-premises servers per Anti-Malware Standard | Standard organizational server build |

**Critical on-premises network constraint:** The organizational on-premises DC is **NOT zero-trust by default**. This means:
- A compromised application server may have direct network-layer access to database servers without additional firewall rules, unless explicit network segmentation is configured
- File shares may be accessible from multiple network segments unless explicit ACLs are applied
- This acts as a **threat model amplifier**: lateral movement out of a compromised app tier into the DB tier is realistic in flat-network DC deployments

---

## Controls That Are NEVER Satisfied by organizational Environment Assumptions

Regardless of deployment target, the following controls MUST be verified in application code or configuration. No environmental assumption reduces the obligation to implement them:

| Control Category | Controls | Reason |
|-----------------|---------|--------|
| Application authentication | AUTH-001 through AUTH-004 | Code must wire up and enforce the IdP integration |
| Application authorization | AUTHZ-001 through AUTHZ-006 | Authorization logic is always application-responsibility |
| Secrets in source code | SEC-001, SEC-002, SEC-004 | Source code and config must be free of secrets |
| JWT security | SEC-003 | Application must validate JWT signatures |
| Application session management | SESSION-001, SESSION-002 | Application must implement session handling |
| Application-level rate limiting | RATE-001 | Auth endpoints must implement lockout in code |
| CORS policy | CORS-001 | Application must set correct CORS headers |
| HTTP security headers | CSP-001, HDR-001 | Application must set headers |
| Logging of security events | LOG-001 through LOG-010 | Application must instrument log calls |
| Field-level encryption | ENC-002, ENC-003 | TDE and perimeter TLS do not protect PHN/SIN at rest |
| File upload validation | UPLOAD-001, UPLOAD-002 | Application must implement magic byte / malware scanning |

---

## Assumption Reporting Requirements

Every security assessment MUST include a **"Organizational Environment Assumptions"** section in the report. Use the following format:

```markdown
## organizational Environment Assumptions

**Deployment target assumed:** [Cloud LZ | On-Premises DC | Unknown: not determinable from inputs]
**Public-facing:** [Yes | No | Unknown]
**Environment baseline applied:** shared/reference/environment-baseline.md v1.0.0

### Assumptions Applied

| ID | Assumption | CAS Rule(s) | ASVS Requirement(s) | Validation Required |
|----|-----------|-------------|--------------------|--------------------|
| ASMP-001 | Cloudflare WAF assumed for public-facing app | WAF-001 | V13.6 (perimeter rate limiting) | Confirm Cloudflare is in the DNS path for this app; verify in Cloudflare dashboard |
| ASMP-002 | MS Defender assumed on all servers | MAL-001 |: | Verify in endpoint management console or IaC |
| ASMP-003 | Cloud Landing Zone guardrails assumed; cloud-native firewall and CDN in place | FW-001, CDN-001 |: | Verify LZ subscription assignment in Azure/AWS/GCP console |
| ... | | | | |

### Assumption Conflicts Detected

[List any repository evidence that conflicts with a standard assumption. If none, state "No conflicts detected."]
```

Additionally, write assumptions to `.ai/blueteam/data/environment_assumptions.json` using the schema defined in `shared/schemas/artifacts.md`.

---

## Verdict Modifier for Infrastructure Controls

When a organizational environment assumption covers an infrastructure-level CAS control that would otherwise be NOT VERIFIABLE, use the following verdict modifier:

**`ASSUMED COMPLIANT (Environment Baseline)`**

This verdict applies when:
1. The control is at `infrastructure` verification level (cannot be verified from code/config review)
2. The organizational environment baseline states the control is assumed present for the applicable deployment target
3. No conflicting evidence was found in the repository

Report format:
```
Rule ID: WAF-001
Verdict: ASSUMED COMPLIANT (Environment Baseline)
Basis: Cloudflare assumed for public-facing organizational apps per shared/reference/environment-baseline.md; no conflicting deployment evidence found
Validation required: Confirm Cloudflare DNS configuration for this application
```

This verdict is distinct from NOT VERIFIABLE (used when no assumption can be made) and COMPLIANT (used when evidence confirms the control is in place).

---

> **NON-ASVS SKILLS: STOP READING HERE.** The `## ASVS Chapter Assumption Mapping` section below is only needed by the ASVS assessment orchestrator and ASVS chapter sub-skills. All other skills (threat model, CAS, DR resilience, classification, builder skills) do not need this section.

## ASVS Chapter Assumption Mapping

Consolidated organizational environment assumptions for all 14 ASVS chapter sub-skills. Each chapter sub-skill references this section rather than embedding its own copy.

| Chapter | ASVS Requirement | organizational Assumption | Waiver Condition | Controls NOT Waived |
|---------|-----------------|----------------|------------------|---------------------|
| V1 | V1.9 Communications architecture: TLS | TLS 1.2+ enforced at perimeter for all organizational apps | Only waived for app-to-load-balancer leg if Cloud LZ deployment confirmed | Backend-to-backend connections not traversing perimeter must still use TLS |
| V1 | V1.13 Configuration architecture | Cloud Landing Zone guardrails provide baseline configuration hardening for managed infrastructure | Only for confirmed Cloud LZ deployments | Application-level environment separation is NOT waived |
| V2 | V2.1 Password Security | If app uses AUTH-001/002/003, password policy enforced at provider level | Only waived when 100% of auth paths delegate to approved organizational IdP | Verify IdP wiring present in code; do not assume delegation without evidence |
| V2 | V2.2 Anti-brute-force | Provider handles brute-force controls if auth fully delegated | Same conditions as V2.1 | RATE-001 application-level rate limiting on auth endpoints is still required |
| V2 | V2.4 Credential Storage | Provider handles credential storage if auth fully delegated | Same conditions as V2.1 | JWT signature validation (SEC-003) is never waived regardless of IdP delegation |
| V3 | V3.2 Session binding | If app fully delegates auth to organizational IdP with IdP-issued tokens and no custom session layer | Only when no application-managed session layer exists | SEC-003 JWT validation, token expiry, and revocation are NEVER waived |
| V3 | V3.4.2 SameSite cookie attribute | No waiver | Never waived | Always required in application cookie configuration |
| V4 | V4.1.3 Least privilege for service accounts | Cloud Landing Zone IAM guardrails set baseline service account permissions | Only for confirmed Cloud LZ deployments using managed identity | Application-level authorization (per-user, per-object) is NEVER waived |
| V4 | V4.3.2 Directory listing | Cloud Landing Zone restricts direct storage access by default | Only for managed storage in Cloud LZ | Application routes and API directory listing must still be verified |
| V5 | V5.3 Output Encoding | Modern frameworks (ASP.NET Core, React, Angular) encode output by default | Only for confirmed framework-managed rendering; verify unsafe bypass APIs not in use | Raw HTML construction (`innerHTML`, `dangerouslySetInnerHTML`) always verified |
| V6 | V6.1 Data Classification | Cloud Landing Zone provides encryption at rest via TDE/SSE for managed storage | Only for confirmed Cloud LZ managed storage | Field-level encryption for PHN/SIN (ENC-002/003) is NEVER waived |
| V6 | V6.4.3 Key rotation | Cloud Landing Zone key vault services provide managed key rotation for platform-managed keys | Only for keys fully managed by Azure Key Vault / AWS KMS / GCP KMS | Application-managed keys must have rotation procedures |
| V7 | V7.2.2 Log aggregation / SIEM | organizational SIEM/log aggregation provided by infrastructure for Cloud LZ deployments | Only for confirmed Cloud LZ deployments | Application-level logging (LOG-001-LOG-010) is NEVER waived |
| V7 | V7.3.3 Log integrity | organizational log infrastructure provides log integrity controls | Only for confirmed Cloud LZ deployments | Application must still write structured, tamper-evident log events |
| V8 | V8.1 Cloud storage access policies | Cloud Landing Zone guardrails enforce encryption at rest for managed storage services | Only for confirmed Cloud LZ deployments using managed storage | Application-level access control is NEVER waived |
| V8 | V8.3 Sensitive data transmission | TLS at perimeter for Cloud Landing Zone apps | Only for app-to-client leg when Cloud LZ confirmed | All backend-to-backend transmission of Protected B data must still be verified |
| V9 | V9.1 TLS for client communication | TLS 1.2+ enforced at perimeter (Cloudflare/Cloud LZ load balancer) | Only for app-to-client leg when Cloud LZ / Cloudflare confirmed | STILL verify TLS for backend-to-backend connections not traversing the perimeter |
| V9 | V9.2.2 TLS certificate validation | No waiver | Never waived | Disabled certificate validation is always Critical regardless of environment |
| V10 | V10.2.2 Signed code / SRI | organizational internal packages distributed via managed artifact repositories | Only for packages sourced from managed registries | External CDN resources must still use Subresource Integrity (SRI) |
| V11 | V11.1.2 Anti-automation | applications expected to implement application-level rate limiting | No waiver | Rate limiting on business logic endpoints required even when Cloudflare active |
| V12 | V12.4 Cloud storage bucket policies | Cloud Landing Zone guardrails enforce encryption at rest for managed storage | Only for confirmed Cloud LZ deployments | Application-level access control on storage buckets is NEVER waived |
| V13 | V13.6 API Rate Limiting (infrastructure-level) | Cloudflare provides perimeter-level rate limiting for public-facing apps | Only for confirmed Cloudflare deployment (public-facing) | Application-level rate limiting on auth endpoints (RATE-001) is ALWAYS required |
| V13 | V13.7 API Discovery | organizational API inventory managed via API Gateway for registered APIs | Not waived: still verify unauthenticated API discovery | OpenAPI endpoints must not expose sensitive schema in production |
| V14 | V14.4.1 HTTP Strict Transport Security | HSTS enforced at Cloudflare/Cloud LZ edge for public-facing apps | Only if Cloud LZ or Cloudflare confirmed in DNS path | Application-level HSTS must still be present as defence-in-depth |
| V14 | V14.1.3 Debug not enabled in production | organizational CI/CD pipelines use environment-specific config transforms | No waiver: must be verified in application config files | All debug flags and development modes in application config |
