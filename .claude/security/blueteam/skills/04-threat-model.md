---
id: protected-b-threat-model
name: Protected B Threat Model Skill
description: Generates a Protected B-aligned STRIDE + DREAD threat model from repository evidence and produces prioritized code and requirement remediations.
type: sub-agent
version: 1.0.0
tools_required:
   - Read
   - Write
   - Edit
   - Glob
   - Grep
   - Bash
tools_optional: []
references:
   - environment
   - ai-artifacts-schema
   - controls-yaml-schema
   - blue-team-shared-security-preflight
   - information-security-classification-skill
   - application-map-skill
upstream:
   - ref: blue-team-shared-security-preflight
      artifacts: []
   - ref: information-security-classification-skill
      artifacts:
         - .ai/blueteam/data/security-classification.yaml
         - .ai/blueteam/data/security-classification-details.yaml
   - ref: application-map-skill
      artifacts:
         - .ai/blueteam/data/application_map.json
   - ref: requirements-map-skill
      optional: true
      artifacts:
         - .ai/blueteam/data/application_map.json   # when source: "requirements"
outputs:
   - artifact: .ai/blueteam/reports/threat_model.md
      format: markdown
   - artifact: .ai/blueteam/reports/threat_model.html
      format: html
   - artifact: .ai/blueteam/data/code_changes.json
      format: json
   - artifact: .ai/blueteam/data/security_requirements.json
      format: json
   - artifact: .ai/blueteam/data/verification_tests.json
      format: json
   - artifact: .ai/blueteam/data/environment_assumptions.json
      format: json
call_sequence_hard:
   - Must resolve declared upstream dependencies before execution, or fail fast with a dependency error.
   - Must load shared/skills/preflight.md before assessment setup.
   - Must read shared/skills/information-classification.md before assessment.
   - Must complete classification file gate before Step 1.
   - Must check application_map staleness and regenerate when stale before model analysis.
   - Phase 6 JSON artifact extraction MUST complete before HTML report generation. If context is limited, skip or defer HTML generation; never skip Phase 6.
   - Phase 6 MUST add "threat_model" to generated_by_assessments in both code_changes.json and security_requirements.json.
---

## Shared Preflight (Load First)

Before executing this skill's assessment steps, load `shared/skills/preflight.md` and carry its preflight state forward. The repeated baseline / controls / risk-acceptance setup sections below remain authoritative but may be treated as inherited context when preflight is already complete.

## Purpose
This skill generates a threat model for organizational applications handling data classified up to **Protected B**. 

**Usage**: Feed inputs to AI w/this skill → auto-generates threat model.

**Use Cases**:
- **Proactive**: From requirements/docs → generate/revised security reqs.
- **Reactive**: From code/repo + deploy targets → identify design/deployment threats. Identify and generate revised requirements and recommended code changes.

**Attackers Considered**: Nation-states (APTs), insiders, hacktivists, cybercriminals, script kiddies.
**Deployments**: data centre (DC) or Cloud Landing Zone (LZ) (Azure/AWS/GCP PBMM/CCCS Medium).

**Methodology**: STRIDE + DREAD prioritization + organizational controls (Protected B std, App Sec Std, Cloud LZ guardrails).

## Inputs
Provide:
1. **Requirements/Docs**: URL or text (functional/non-functional reqs, data flows).
2. **Repo**: GitHub URL (for code analysis). Can analyze local files as well.
3. **Deployment**: DC (internal) or Protected B Cloud landing zone (LZ).
4. **Context**: App type (web/API), data (PII), users (employees/public?).

## organizational Environment

> **Required reading:** Load `shared/reference/environment-baseline.md` before beginning any assessment step. Stop at the `> **NON-ASVS SKILLS: STOP READING HERE.**` marker; the ASVS Chapter Assumption Mapping section that follows is not needed by this skill.

Key assumptions from `shared/reference/environment-baseline.md` that affect threat modelling:
- **Cloudflare** assumed for public-facing apps (WAF, DDoS, bot protection, TLS termination, perimeter rate limiting)
- **MS Defender** assumed on all managed servers and endpoints
- **SQL Server TDE** assumed for on-premises DB deployments. This does NOT protect against SQL injection or authenticated DB access; field-level encryption for PHN/SIN is still required
- **Cloud Landing Zone** (Azure/AWS/GCP) provides CCCS PBMM-equivalent technical controls for network / firewall / CDN / storage encryption
- **On-premises DC** is NOT zero-trust by default; flat network unless explicitly segmented
- **approved identity providers** (Corporate OIDC Provider, Enterprise IdP e.g. MS Entra ID, External Identity Gateway) enforce authentication controls at the provider level when properly integrated

When using `shared/reference/environment-baseline.md` assumptions:
1. Apply the "ASSUMED PRESENT" status only to infrastructure-level controls (those requiring cloud console or network diagram to verify)
2. **Never** suppress application-layer findings (auth code, authorization logic, secrets in source, session management, logging, etc.) based on environment assumptions
3. Include a "Organizational Environment Assumptions" section in the threat model report listing every assumption made, using the format defined in `shared/reference/environment-baseline.md`
4. Flag any assumption that conflicts with evidence in the repository (e.g., deployment manifests indicating non-standard infrastructure)

## Controls File Loading (Optional, Layers 3 & 4)

After loading `shared/reference/environment-baseline.md`, check for `.ai/controls.yaml` in the repository root:

1. If **absent**: skip all Layer 3 processing; proceed normally.
2. If **present**: parse the YAML and extract the **Active Controls List**: all keys where the boolean is `true`. For any `true` key with an empty detail string, record the key with placeholder: `"(no details provided; application team should add detail)"`.
3. If the file cannot be parsed, add `> Warning: .ai/controls.yaml is present but could not be parsed; Layer 3 annotations skipped.` to the report and proceed.

Read `shared/schemas/controls-yaml.md` (located in the same directory as this skill file) for the **control key → finding type mapping table**, **annotation format**, and **Layer 4 organizational Baseline Context hints table**. These tables determine which findings receive annotations and what text to use when writing each vulnerable code example in Section 7.

## Risk Acceptance (Pre-Assessment)

> **RA register loaded in preflight.** `shared/skills/preflight.md` Step 3 has loaded `.ai/blueteam/data/risk_acceptances.json` (if present), recorded all RA entries, and established the finding-level RA check procedure including the non-suppressible finding type list. Apply that procedure when writing each threat and finding in Section 7. Full Step 13 processing (CODEOWNERS governance, orphan detection, register regeneration) completes in Phase 6.

## Steps
BEFORE proceeding, you MUST read the [shared/skills/information-classification.md] skill file and gain the associated organizational information security classification skill. If that fails: STOP. Report an error condition; this skill is required before classifying an application or data store or data flow and assessing risk.

### 0. Read or Generate Security Classification

Before decomposing the application or identifying threats, establish the application's data classification. This drives DREAD floor priorities, trust boundary sensitivity labels, and data-at-risk identification throughout the threat model.

#### Step 0.1: Check for Classification Files

Check for **both** of the following files in the repository root `.ai/blueteam/data/` folder:
- `.ai/blueteam/data/security-classification.yaml`
- `.ai/blueteam/data/security-classification-details.yaml`

- **If either file is missing**: You MUST run the `skills/02-security-classification.md` skill (located in the same directory as this skill file) **before proceeding any further**. STOP; do not advance to Step 1 until **both** files have been created. Performing classification inline within the threat model report is **NOT sufficient**. Inline text is lost between sessions and defeats the purpose of the `.ai/` persistence folder. The YAML files are required persistent artifacts that other AI sessions and skills depend on.
- **If both files exist**: Read both files and proceed to Step 0.2.

#### Step 0.2: Extract Classification Context

Using the classification files, record the following for use throughout this threat model:

1. **Overall application classification**: from `application.overall_classification` in `security-classification.yaml` (e.g., Protected B).
2. **Protected B+ data elements and their locations**: from `data_elements[]` entries in `security-classification-details.yaml` where `sensitivity_classification` is Protected B or higher. Record the element name / description / all `locations[]` entries (tables, columns, stores). These are the primary targets for threat actors.
3. **Data stores and their classification levels**: from `data_stores[]` in `security-classification-details.yaml`. Record the `name` / `sensitivity_classification` / `type` / `location` plus (critically) the `missing_controls[]` list for each store. These missing controls are **pre-confirmed threat surfaces**; include them directly as threat entry points rather than re-discovering them from code.
4. **High-sensitivity indicators**: from `high_sensitivity_indicators` in `security-classification.yaml`. Note which of `financial_info_present`, `health_info_present` (PHN), `sin_present`,  `government_evaluation_present`, and `third_party_business_info_present` are true. These drive which STRIDE categories receive elevated attention.
5. **Known security findings**: if `security_posture` is present in `security-classification.yaml`, note the `assessment_file` reference and finding counts. These represent confirmed vulnerabilities; cross-reference them during threat enumeration rather than re-discovering them.

#### Step 0.3: Classification-Driven DREAD Floor Weights

Using the data extracted in Step 0.2, apply the following floor priority table **before** final DREAD scoring in Step 3. DREAD scoring may elevate a threat above its floor, but **may not reduce it below the floor**.

| Condition                                                                                                                                           | Floor Priority                                    |
| --------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------- |
| Any threat exposing Protected B financial data (individual or organizational finances, budget data, financial statements) without authorization     | P1 (High); bulk exposure → P0 (Critical)          |
| Any threat enabling bulk extraction of a Protected B data store (unfiltered response, missing pagination, no row-level access control)              | P0 (Critical)                                     |
| Authentication credential exposure (OAuth tokens, session tokens with serialized credentials, refresh tokens in application storage)                | P0 (Critical)                                     |
| PHN, SIN, health diagnosis or bank account number present (any `high_sensitivity_indicators` flag true): any threat that can expose them           | P0 (Critical)                                     |
| Government evaluation, internal review, or opinion records (applicable privacy/information legislation) exposed to unauthorized parties                                         | P1 (High)                                         |
| Any Protected B data store with pre-confirmed `missing_controls[]` entries for access control, encryption at rest, or non-approved storage location | P1 (High)                                         |
| Protected A personal information (applicable privacy legislation name, address, email, phone) exposed or accessible without authorization                              | P1 (High)                                         |
| Missing audit trail for Protected B data access or modification events                                                                              | P1 (High)                                         |
| Environment-variable-gated security bypass on any Protected A or higher data path                                                                   | P0 (Critical); apply Gated Bypass Rule in Step 3 |

#### Step 0.4: Generate Human-Readable Classification Report

Using the data extracted in Step 0.2, generate and save `.ai/blueteam/reports/security-classification.md`. Then generate `.ai/blueteam/reports/security-classification.html` by running `generate_report_html.js` (see **HTML Report Generation** below). Both files must exist before proceeding to Step 1.

The report format is defined in the "Required Output Structure" section below under "`.ai/blueteam/reports/security-classification.md`".

> **Pre-Step 1 Gate: Classification Files Required**
> Before advancing to Step 1, confirm both files exist and have been read:
> - `.ai/blueteam/data/security-classification.yaml`
> - `.ai/blueteam/data/security-classification-details.yaml`
>
> If either file is missing: STOP. Run `skills/02-security-classification.md` now. Do not proceed to Step 1 until both files are confirmed to exist, Step 0.2 extraction is complete, and the Step 0.4 classification report has been written to `.ai/blueteam/reports/security-classification.md`.

### 0.5. Application Map: Shared Discovery Input

After classification files are confirmed, check for a pre-built application map before performing DFD construction:

**Staleness check:**
1. Check whether `.ai/blueteam/data/application_map.json` exists. If not → run `skills/01-application-map.md` (located in the same directory as this skill file) before proceeding to Step 1.
2. If the file exists, run `git rev-parse HEAD` and compare to `generated_at_commit`.
   - **Matching** → Map is fresh. Read and extract per the table below; use map data to seed Step 1 DFD construction.
   - **Different** → Map is stale. Run `skills/01-application-map.md` to regenerate, then proceed.
   - **`generated_at_commit` is null** → Compare dates. Same day → use as fresh. Different day → regenerate.

**Extract the following from `.ai/blueteam/data/application_map.json` for use in Step 1 and Step 2:**

| Map Field                                            | Threat Model Use                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `tech_stack`                                         | Step 1: seed the technology stack summary in the DFD; `deployment_target_inferred` confirms Cloud LZ vs. DC deployment for organizational environment assumptions                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `endpoints[]`                                        | Step 1: seed external entities and processes in the High-Level DFD; unauthenticated endpoints with `uses_elevated_credentials: true` are pre-confirmed high-priority STRIDE threats                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `endpoints[].auth_first_in_chain: false`             | Step 2: pre-confirmed Elevation of Privilege / Information Disclosure threat (middleware ordering leak)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `identity_providers[]` + `auth_mechanisms[]`         | Step 1: seed authentication components in the DFD; `signature_verified: false` is a pre-confirmed Spoofing threat                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `critical_files`                                     | Step 1: use to locate authentication / authorization / logging / encryption code for trust boundary characterization                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `secrets_findings[].location: 'current_head'`        | Step 2: each entry is a pre-confirmed Information Disclosure / Credential Access threat; add directly to STRIDE table with P0 floor priority per Step 0.3                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `bot_commits[]` with `review_evidence: 'unreviewed'` | Step 2: flag as potential Tampering threat (unreviewed AI-authored changes to security-critical code)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `gitignore_gaps[].any_committed: true`               | Step 2: pre-confirmed Information Disclosure threat                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `client_applications[]`                              | Step 1, add each entry as an external entity in the High-Level DFD inside its own trust boundary zone ("Mobile Device (iOS/Android)" or "Browser Client"). For `mobile-rn` entries: (a) flag `credential_storage_encrypted: false` as a pre-confirmed Information Disclosure finding (P1 minimum; elevate to P0 if PHN or other Protected B data is confirmed in local state); (b) flag `attestation_present: false` on any credential wallet or digital identity app as a pre-confirmed Elevation of Privilege risk (P1; attacker can run a modified build that passes as the legitimate app); (c) flag `certificate_pinning: false` on any app transmitting Protected B data as a missing defence-in-depth control (P2). Add each `pii_in_local_state` element as a data-at-risk item in the DFD data classification table. |

The DFD should still be constructed through code reading; the application map accelerates DFD seeding but does not replace reading the authentication / authorization / data flow code. Use `critical_files` as the starting file list for Step 1 code reading.

#### Requirements Mode Detection

After reading `application_map.json`, check the `source` field:

- **`source` field absent or `"code"`** → **Code Mode** (standard behaviour).
  `evidence_mode = "code"`. Proceed as normal.
- **`source: "requirements"`** → **Requirements Mode** (design-level analysis).
  `evidence_mode = "design"`. Apply the following adjustments in subsequent steps:
  - Skip staleness git check; requirements maps use date comparison only
  - Skip `critical_files`-based code reading in Step 1
  - Add `[Design-Level: Not Code-Verified]` label to all DFD diagrams
  - Replace "Pre-confirmed threats" with "Pre-assumed threats" in Step 2 (see below)
  - Replace "Vulnerable Code Examples" with "Design Threat Instances" in Section 7
  - Skip CC extraction Steps 2-5 in Phase 6 (no code to change)
  - Read `pre_assumed_gaps[]` from the map; each entry seeds a pre-assumed threat

**Pre-assumed threats from `pre_assumed_gaps[]` (Requirements Mode only):**

| Gap type | Pre-assumed threat | STRIDE category | Floor priority |
|----------|--------------------|-----------------|----------------|
| `no_auth_for_actor` | Actor has no authentication story | Spoofing | P1 |
| `no_authz_for_protected_data` | Protected data accessible without role check | Elevation of Privilege | P1 |
| `no_audit_for_protected_b_access` | Protected B data accessed without audit trail story | Repudiation | P1 |
| `external_integration_no_credential_story` | External service called without credential/trust story | Info Disclosure | P1 |
| `sensitive_data_no_encryption_story` | Sensitive data stored without encryption story | Info Disclosure | P0 if PHN/SIN, P1 otherwise |
| `multi_step_no_idempotency_story` | Multi-step workflow without idempotency AC | Tampering | P2 |

### 1. Decompose Application (DFD)
- Create **High-Level DFD**: External entities, processes, data stores, flows.
- **Low-Level DFDs**: Per component (frontend, API, DB, auth).
- Tools: Use Mermaid diagrams in MD.

> **Requirements Mode:** If `evidence_mode = "design"`, skip the `critical_files`-based code
> reading step. Construct the DFD entirely from the map's `endpoints[]`, `identity_providers[]`,
> `client_applications[]`, and `data_stores[]` fields (populated by `skills/13-requirements-map.md`)
> plus the requirements document narratives. Label all DFD diagrams
> `[Design-Level: Not Code-Verified]`.

- **Seed from classification files**: The data stores and data classification table in the output MUST be populated from the Step 0.2 extraction; use `data_stores[]` and `data_elements[]` from `.ai/blueteam/data/security-classification-details.yaml`. Label each data store in the DFD with its `sensitivity_classification` level. Label each trust boundary crossing with the classification of the highest-sensitivity data that flows across it. Do NOT reclassify already-assessed stores or elements; treat the stored classification as authoritative. Add any data flows or new stores identified in code that are absent from the classification files, and flag them for incremental re-assessment.

### 2. Identify Threats (STRIDE)
Apply STRIDE per DFD element:
| Category                   | Description         | Examples for Protected B                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| -------------------------- | ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **S**poofing               | Impersonation       | Fake user login, API spoofing (nation-state MITM). Mobile: biometric authentication bypassed on rooted/jailbroken device when no attestation check is present (attacker with physical access impersonates enrolled user (cybercriminal). Mobile OAuth deep-link hijacking: a malicious app registers the same URL scheme and intercepts the OIDC redirect_uri, stealing the authorization code before the legitimate app receives it (cybercriminal).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| **T**ampering              | Data alteration     | Modify DB/PII (insider tampering).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| **R**epudiation            | Deny actions        | Logs bypassed (cybercriminal injection).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| **I**nfo Disclosure        | Leak Protected B    | SQLi exposing PII (hacktivist). Health/diagnostic endpoint over-sharing infrastructure details (cache connectivity, environment names, versions) (script kiddie). Middleware ordering leak: pre-auth middleware returning configuration details or env var names to unauthenticated users (cybercriminal/script kiddie). Endpoint enumeration via differential error responses: distinct HTTP status codes for different error conditions revealing which endpoints exist and their protection level (cybercriminal/script kiddie). Auth status endpoints exposing internal implementation details such as auth driver names (script kiddie). Mobile: PHN or credential tokens stored in unencrypted `AsyncStorage`: readable by any other app on a rooted device or via adb backup (credential thief with physical device access). Mobile: Protected B field values logged to crash reporting service or React Native state written to unencrypted device storage (insider/cybercriminal). |
| **D**enial of Service      | Availability loss   | DDoS on LZ (nation-state).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| **E**levation of Privilege | Unauthorized access | Privilege escalation in app/DC. Mobile: sideloaded or repackaged app that passes as the verified wallet app when Play Integrity / AppAttest is absent; attacker issues credentials to a build under their control (cybercriminal/nation-state).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |

#### Attacker Capability Matrix

| Attacker      | Skill Level | Resources                | Motivation          | Typical Attacks                 |
| ------------- | ----------- | ------------------------ | ------------------- | ------------------------------- |
| Script Kiddie | Low         | Public tools             | Curiosity, bragging | Automated scans, known exploits |
| Cybercriminal | Medium      | Purchased tools, botnets | Financial           | Credential stuffing, ransomware |
| Hacktivist    | Medium      | Collaborative            | Ideology            | Data leaks, defacement          |
| Insider       | Variable    | Legitimate access        | Revenge, profit     | Data exfil, sabotage            |
| Nation-state  | High        | Custom tools, 0-days     | Intelligence        | APT, supply chain               |

Map each threat to attacker(s) most likely to exploit it. When enumerating individual threats, assign each a primary ATT&CK Enterprise tactic from the reference table in Step 2.5 and record it in the threat table.

### 2.5. Kill Chain Analysis (MITRE ATT&CK Enterprise)

After enumerating individual STRIDE threats, synthesize how they combine into complete attacker kill chains spanning initial foothold through impact. Kill chain analysis reveals compounded risk that is invisible from per-threat DREAD scoring alone, since two Medium-severity threats that chain together can produce Critical impact.

#### ATT&CK Tactic Reference for organizational Web Applications

Read **Sections 1, 4, 5, and 6** of `shared/reference/attack-chain-reference.md` (located in the same directory as this skill file; see its Section Loading Guide for instructions on reading only specific sections). Use **Section 1: ATT&CK Enterprise Tactic Reference** as the tactic lookup table for all threat-to-tactic assignments. Review **Section 4: Common Kill Chain Patterns** so that the most common application chains are explicitly checked. Use **Section 5** for kill chain construction standards and required chain fields. Use **Section 6** for the CAS Domain to Rule ID quick reference. Do NOT load Sections 2 (ASVS-only) or 3 (CAS-only).

#### Kill Chain Construction Steps

1. **Assign ATT&CK tactics to all threats**: For every threat T-NNN identified in Step 2, assign the primary ATT&CK tactic. Record this in the threat enumeration table as an `ATT&CK Tactic` column. Where a threat spans multiple tactics, record the **earliest** kill chain stage (e.g., a finding that enables both Credential Access and Collection is recorded as Credential Access).

2. **Identify complete kill chains**: A complete kill chain begins at **Reconnaissance** (TA0043) or **Initial Access** (TA0001) and terminates at **Collection/Exfiltration** (TA0009/TA0010) or **Impact** (TA0040). Trace which threat combinations form a complete attacker path. Prioritize chains that:
   - Begin with a **public-facing, unauthenticated** threat (no precondition; highest risk)
   - Include a **Credential Access** or **Privilege Escalation** step that expands the blast radius
   - Terminate at **Collection** or **Exfiltration** of Protected B or higher data, or **Impact**

3. **Assign Kill Chain IDs**: Label each chain KC-001, KC-002, etc. for cross-referencing in the DREAD table and output report.

4. **Apply chain severity to DREAD**: In Step 3, any threat that participates in a kill chain MUST be scored at a minimum of the chain's combined severity (which may exceed the threat's individual DREAD-derived priority). Add a `Kill Chain(s)` column to the DREAD table. A threat's DREAD priority MUST NOT fall below the chain severity floor.

5. **Document 3-5 kill chains in Section 9**: For each chain, record all fields defined in **Section 5: Kill Chain Construction Standards** of `shared/reference/attack-chain-reference.md`. Required fields:
   - **Chain ID** (KC-NNN format) and **chain name** (descriptive, e.g., "Unauthenticated PHN Mass Extraction via Endpoint Enumeration + BOLA")
   - **Overall chain severity** (apply Step 0.3 floor weights)
   - **Attacker type** (from the Attacker Capability Matrix)
   - **AI-enabled variant**: how AI/LLM tools could accelerate or automate this chain (e.g., LLM-assisted endpoint enumeration, automated credential stuffing at scale), or "N/A" if not applicable
   - **Step-by-step progression table** (Step | Attacker Action | Threat ID | ATT&CK Tactic)
   - **Chain-breaking fix**: the single remediation that most effectively disrupts this chain

### 3. Prioritize (DREAD)
> **Apply Step 0.3 floor weights first.** For each threat, check whether it matches a condition in the Step 0.3 table. If it does, its floor priority is set. DREAD scoring may elevate the threat above the floor, but **may not reduce it below the floor**. Record both the DREAD-derived priority and the floor alongside each scored threat so the reasoning is traceable.

After DREAD scoring, apply this prioritization:

1. **Exploitable without authentication** → P0 (Critical)
2. **Exposes Protected B PII** → P0 (Critical)
3. **Enables privilege escalation** → P1 (High)
4. **Missing defense-in-depth** → P2 (Medium)
5. **Code quality/best practice** → P3 (Low)

#### Gated Bypass Rule
Environment-variable-gated security bypasses (e.g., `ALLOW_MOCK_IN_PRODUCTION`, `DISABLE_AUTH`, `SKIP_VALIDATION`) MUST be classified at the severity of the **ungated** vulnerability, not reduced for the gating mechanism. Environment variables are operational configuration, not security controls; they can be set accidentally, through misconfiguration, or via environment injection. A mock auth bypass that grants admin access is P0 Critical regardless of whether it requires an env var to activate. The gating mechanism should be noted as context but MUST NOT reduce the priority below what the ungated exploit would receive.

#### Tiebreaker Rules
- Higher DREAD score wins
- Public-facing > internal
- PII impact > availability impact

### 4. organizational Controls & Mitigations
#### organizational Cybersecurity Architecture Standard (CAS) Control Reference

Use **Section 6** of `shared/reference/attack-chain-reference.md` (already loaded in Step 2.5) for the CAS Domain → Rule ID quick-reference table. Read `skills/06-cas-compliance.md` for full rule definitions, verification levels, severity tiers, and remediation guidance.

Map findings to:
- **Cybersecurity Architecture Standard (CAS)**: Use the rule IDs from `shared/reference/attack-chain-reference.md` Section 6. Read `skills/06-cas-compliance.md` for full requirement text and remediation patterns.
- **OWASP ASVS 4.0.3 Level 2** (mandated by CAS WEB-001): Read `skills/05-asvs-level2-assessment.md` for the full requirement set with code-level verification techniques.
- **Cloud Landing Zone** (if applicable): CAS network/perimeter controls (WAF-001, FW-001, CDN-001) apply. organizational cloud LZ guardrails are designed to satisfy the CCCS PBMM (Protected B, Medium-Medium) profile for network, key management, and logging infrastructure.
- **DC / On-premises** (if applicable): FW-002 zone firewalls required. Network is NOT zero-trust by default; explicit segmentation required for application and database servers.

**Generate Req Table**:
| Threat ID | STRIDE   | ATT&CK Tactic         | DREAD Score | Priority | Kill Chain(s) | Mitigation                                                                   | CAS Rule(s) / ASVS       |
| --------- | -------- | --------------------- | ----------- | -------- | ------------- | ---------------------------------------------------------------------------- | ------------------------ |
| T1        | Spoofing | TA0001 Initial Access | 8/10        | P0       | KC-001        | Enforce MFA for all organizational staff; use client certs for service-to-service in LZ | AUTH-002, MFA-001 / V2.2 |

### 5. Validate & Output (formerly the final step; see Phase 6 below for artifact extraction)
- Review for completeness (all attackers/deploys).
- Proactive: New reqs to reduce risk.
- Reactive: Code-specific threats (e.g., lib vulns, insecure code).

#### Threat Model Validation Checklist

Before finalizing, verify:

##### Coverage
- [ ] All trust boundaries identified
- [ ] All data stores mapped
- [ ] All external entities documented, including all `client_applications[]` entries from the application map (mobile apps, web SPAs) as external entity nodes with explicit device trust boundaries; if `client_applications[]` is non-empty and none appear in the DFD, treat this as a coverage gap
- [ ] Each STRIDE category addressed
- [ ] Each attacker type considered
- [ ] All identified threats assigned an ATT&CK tactic (Step 2.5)
- [ ] At least 3 complete kill chains documented (Initial Access/Reconnaissance → Exfiltration/Impact)
- [ ] ATT&CK tactic coverage summary produced (covered / not applicable / gap)
- [ ] organizational Environment Assumptions section present in report with all assumptions listed
- [ ] `.ai/blueteam/data/environment_assumptions.json` written (see `shared/schemas/artifacts.md`)

##### Quality
- [ ] DFDs match actual architecture
- [ ] Threats map to specific code/config
- [ ] DREAD scores justified
- [ ] Kill chain severity applied to DREAD (chain-participating threats scored at chain floor)
- [ ] Each kill chain has an identified chain-breaking fix
- [ ] AI-enabled attack variants considered for each kill chain
- [ ] Mitigations are specific and actionable
- [ ] Code examples included for reactive assessments

##### Compliance
- [ ] Each finding mapped to CAS rule ID(s) and/or ASVS requirement ID(s)
- [ ] Compliance gaps identified
- [ ] Remediation timeline appropriate for severity

## Outputs
1. **Threat Model MD + HTML**:
   - DFD diagrams (Mermaid).
   - STRIDE threat table.
   - Prioritized list (DREAD). Identify data at risk and its classification.
   - Mitigations mapped to organizational stds.
   - If assessing existing code:
      - Examples of vulnerable code
      - Recommended design and code changes
      - Each Vulnerable Code Example's Remediation section MUST include a one-line `**Change ID:** CC-NNN → see \`.ai/blueteam/data/code_changes.json\`` reference after the code snippet, linking the human-readable finding to the machine-readable artifact. Allocate CC-NNN IDs during Phase 6 (extraction phase) and backfill these references once IDs are known.
   - Save the output as `.ai/blueteam/reports/threat_model.md`. Then generate `.ai/blueteam/reports/threat_model.html` by running `generate_report_html.js` (see **HTML Report Generation** below).
2. **Security Requirements MD + HTML** (human-review, consolidated):
   - Revised reqs list (additions/changes). Include traditional requirements and requirements as epics and user stories, to suit traditional and Agile projects.
   - Compliance refs: CAS rule IDs and ASVS requirement IDs for each finding.
   - Each requirement item MUST include a one-line `**Requirement ID:** SR-NNN → see \`.ai/blueteam/data/security_requirements.json\`` reference.
   - **Save the output to `.ai/blueteam/reports/security_requirements.md` and `.ai/blueteam/reports/security_requirements.html`** (not to the project root). These files are regenerated from the full `.ai/blueteam/data/security_requirements.json` state in Phase 6; do NOT write the old `recommended_security_requirements.md` format to the project root.
3. **Security Classification Report** (generated in Step 0.4):
   - Human-readable rendering of `.ai/blueteam/data/security-classification.yaml` and `.ai/blueteam/data/security-classification-details.yaml`
   - Save as `.ai/blueteam/reports/security-classification.md` and `.ai/blueteam/reports/security-classification.html`
4. **Machine-Readable Artifacts** (written in Phase 6):
   - `.ai/blueteam/data/code_changes.json`: all code-level fixes
   - `.ai/blueteam/data/security_requirements.json`: all normative requirements
   - `.ai/blueteam/data/environment_assumptions.json`: organizational environment assumptions applied during this assessment
   - `.ai/blueteam/reports/code_changes.md` and `.ai/blueteam/reports/code_changes.html`: human-review rendering
   - `.ai/blueteam/reports/security_requirements.md` and `.ai/blueteam/reports/security_requirements.html`: human-review rendering

### Required Output Structure
#### `.ai/blueteam/reports/threat_model.md` and `.ai/blueteam/reports/threat_model.html`

After writing the `.md`, generate the corresponding `.html` by running `generate_report_html.js` (see **HTML Report Generation** below). The script automatically applies organizational CSS, section wrapping, severity badges, and finding cards.

> **Threat Exposure Banner:** The `generate_report_html.js` script does not inject status banners automatically. To add a status banner, insert the banner HTML directly into the `.md` file as a raw HTML block (supported by the markdown library) before the Executive Summary section, using the `.status-banner` CSS classes.
>
> **Determining the verdict**: count all CC-NNN and SR-NNN produced by this assessment:
>
> | Condition | Verdict | Banner CSS | Icon |
> |---|---|---|---|
> | Run + 0 findings | No Active Threats | `sb-pass` | `&#10003;` |
> | Max priority = medium or low only | Manageable Exposure | `sb-medium` | `&#9679;` |
> | Any high-priority finding | Elevated Exposure | `sb-high` | `&#9888;` |
> | Any critical-priority finding | Critical Exposure | `sb-critical` | `&#9888;` |
>
> **Banner HTML (render the one matching state):**
>
> ```html
> <!-- Critical Exposure -->
> <div class="status-banner sb-critical">
>   <div class="sb-icon">&#9888;</div>
>   <div class="sb-body">
>     <div class="sb-title">Critical Exposure</div>
>     <div class="sb-detail">[APPLICATION_NAME] has [N] critical threat(s) identified in this threat model. These represent the highest-priority risks requiring immediate remediation.</div>
>   </div>
> </div>
>
> <!-- Elevated Exposure -->
> <div class="status-banner sb-high">
>   <div class="sb-icon">&#9888;</div>
>   <div class="sb-body">
>     <div class="sb-title">Elevated Exposure</div>
>     <div class="sb-detail">[APPLICATION_NAME] has [N] high-severity threat(s). No critical threats identified, but elevated exposure requires remediation within 4 weeks.</div>
>   </div>
> </div>
>
> <!-- Manageable Exposure -->
> <div class="status-banner sb-medium">
>   <div class="sb-icon">&#9679;</div>
>   <div class="sb-body">
>     <div class="sb-title">Manageable Exposure</div>
>     <div class="sb-detail">Only medium and/or low threats identified for [APPLICATION_NAME]. No critical or high-severity threat model findings.</div>
>   </div>
> </div>
>
> <!-- No Active Threats -->
> <div class="status-banner sb-pass">
>   <div class="sb-icon">&#10003;</div>
>   <div class="sb-body">
>     <div class="sb-title">No Active Threats</div>
>     <div class="sb-detail">Threat model completed for [APPLICATION_NAME]. No active threats were identified.</div>
>   </div>
> </div>
> ```

#### `.ai/blueteam/reports/threat_model.md`: Structure
1. Executive Summary (1 page max)
2. Assumptions
3. organizational Environment Assumptions (see format in `shared/reference/environment-baseline.md`: list every organizational environment assumption applied and flag any conflicts)
4. Application Decomposition
   - High-level DFD (Mermaid)
   - Component DFDs
   - Data classification table
5. STRIDE Threat Analysis
   - Table per category with attacker mapping
6. DREAD Prioritization
   - Scored tables by severity
7. **Vulnerable Code Examples** (if reactive/Code Mode, top 5 most severe, P0 Critical and P1 High priority findings only; P2 Medium and lower findings are documented in the threat table with DREAD scores only; do not generate Vulnerable Code Examples for P2 or lower)

> **Requirements Mode (Design Threat Instances):** If `evidence_mode = "design"`, replace
> Vulnerable Code Examples with **Design Threat Instances** for each P0/P1 threat:
> - **DFD element(s) involved**: which process/data store/flow carries this threat
> - **Attack scenario**: how an attacker exploits this design gap
> - **Missing security control**: the requirement or acceptance criterion that should exist
>   but was not found in the requirements documents
> - **Recommended requirement**: a specific, testable security requirement to add to the backlog
> - **Verification acceptance criteria**: what a tester would check once implemented
>   (becomes the verification_tests.json entry)
>
> Do NOT generate code snippets. Do NOT populate `current_code_summary`.
> CC entries are NOT produced in Requirements Mode.
   - File path and line numbers
   - Vulnerable code snippet
   - Explanation
   - **Layer 3 annotation (if controls.yaml present):** After the Explanation, check the Active Controls List against the mapping table in `shared/schemas/controls-yaml.md`. For each matching control, add a blockquote: `> **Declared compensating control:** [detail string]. Verify this mitigates the specific risk before closing.` Omit block entirely if no controls match.
   - **Layer 4 annotation (Baseline Context):** After any Layer 3 annotations, check the Layer 4 hints table in `shared/schemas/controls-yaml.md`. For each matching hint, add: `> **baseline context:** [hint text]` Omit block entirely if no hints apply.
   - Remediation code and / or recommended design changes to reduce risk
8. organizational Controls Mapping
9. Kill Chain Analysis (MITRE ATT&CK)
   - **ATT&CK Tactic Coverage Summary**: table listing all 12 ATT&CK tactics; for each: whether it is Covered (at least one identified threat), Not Applicable (no realistic path to this tactic given the application's architecture), or Gap (no identified threat; note as potential blind spot if applicable to the architecture).
   - **3-5 Complete Kill Chain Narratives** (from Step 2.5), each containing:
     - Chain ID (KC-NNN), chain name, and overall chain severity
     - Attacker type (from Attacker Capability Matrix)
     - AI-enabled variant (where applicable, e.g., LLM-assisted enumeration, automated phishing)
     - Step-by-step progression table:

       | Step | Attacker Action | Threat ID | ATT&CK Tactic        |
       | ---- | --------------- | --------- | -------------------- |
       | 1    | [action]        | T-NNN     | TA#### [Tactic Name] |
       | 2    | ...             | ...       | ...                  |

     - Chain-breaking fix: the single remediation that most effectively disrupts this chain
10. Compliance Status Table

### Secret Handling in Code Snippets

> **NEVER record actual secret values** (passwords, tokens, API keys, connection strings with embedded credentials) in code snippets, finding descriptions, or JSON artifacts.
>
> When a finding involves a hardcoded secret, replace the literal value with `[REDACTED]` in any code shown:
> - **Correct**: `var key = "[REDACTED-JWT-KEY]"; // hardcoded fallback at apps/auth-api/Startup.cs:156`
> - **Incorrect**: `var key = "xecretKeywqejane";`
>
> Describe the finding by referencing the **file path and line number** where the secret exists. The actual value must remain only in the source repository, not in reports or artifacts.

### Required for Each Recommended Code Remediation

For each vulnerable code example, include:

1. **Code Change** - The fix (current vulnerable code snippet and the replacement code)
2. **Verification Test** - Add one actionable command with placeholders (for example `curl`) that can validate both vulnerable and mitigated behavior.

Use this exact structure in each finding block:

```markdown
**Verification Test (SAFE-READONLY | SAFE-AUTHZ | DESTRUCTIVE):**
- **Preconditions:** [list]
- **Command template:**
~~~bash
[actionable command with placeholders only, e.g., ${BASE_URL}, ${TOKEN_USER}]
~~~
- **Expected vulnerable result:** [observable outcome]
- **Expected mitigated result:** [observable outcome]
- **Evidence to capture:** [status code, key response fields, log identifiers]
```

Never include real secrets, internal hostnames, or production-only values in commands.

#### `.ai/blueteam/reports/security-classification.md`

Render the full contents of the YAML classification files into human-readable Markdown. Present the data accurately; do not editorialise or reclassify. Use the system date as the report date.

```markdown
# Information Security Classification: [application.name]

**Overall Classification:** [application.overall_classification]
**Date:** [last_updated]  **Assessment Mode:** [incremental_assessment.last_assessment_mode]  **Commit:** [incremental_assessment.assessment_commit]

---

## Application Overview

| Field                  | Value                                           |
| ---------------------- | ----------------------------------------------- |
| Overall Classification | **[application.overall_classification]**        |
| Privacy Legislation Applies           | [application.privacy_legislation_applies]                      |
| Conditional Elevation  | [application.conditional_elevation, or "None"] |

## High-Sensitivity Indicators

| Indicator                     | Present                                              |
| ----------------------------- | ---------------------------------------------------- |
| Personal Health Number (PHN)  | [high_sensitivity_indicators.phn_present]            |
| Social Insurance Number (SIN) | [high_sensitivity_indicators.sin_present]            |
| Health Information            | [high_sensitivity_indicators.health_info_present]    |
| Financial Information         | [high_sensitivity_indicators.financial_info_present] |

## Data Stores Summary

| Store | Classification |
| ----- | -------------- |
[one row per entry in data_stores_summary.stores]

## Data Stores: Detail

[For each store in data_stores[] from the details YAML:]

### [store.name]: [store.sensitivity_classification]

**Type:** [store.type]
**Privacy Classification:** [store.privacy_classification]

[store.description]

**Current security controls:**
[store.security_controls.current as bullet list, or "None documented"]

**Recommended controls:**
[store.security_controls.recommended as bullet list, or "None"]

---

## Protected A+ Data Elements

| Element | Classification | Privacy Category | Locations |
| ------- | -------------- | ------------- | --------- |
[one row per entry in data_elements[] where sensitivity_classification is Protected A or higher;
 Locations column: comma-separated list of file/table references from locations[]]

## Classification Rationale

[classification_rationale from details YAML]

## Security Recommendations

### High Priority ([security_posture.high_priority_recommendations] items)

[For each item in security_recommendations.high_priority:]
**[item.id]**: [item.description]
*Rationale:* [item.rationale]
*Affected stores:* [item.affected_stores]

### Medium Priority ([security_posture.medium_priority_recommendations] items)

[For each item in security_recommendations.medium_priority; omit section if empty]

## Assessment Metadata

| Field                             | Value                                                         |
| --------------------------------- | ------------------------------------------------------------- |
| Assessment Mode                   | [incremental_assessment.last_assessment_mode]                 |
| Last Assessment Date              | [incremental_assessment.last_assessment_date]                 |
| Assessment Commit                 | [incremental_assessment.assessment_commit]                    |
| Stores Re-assessed (partial mode) | [incremental_assessment.partial_stores_reassessed, or "N/A"] |
```

#### `.ai/blueteam/reports/security_requirements.md` (replaces former `recommended_security_requirements.md`)

> This file is regenerated from `.ai/blueteam/data/security_requirements.json` in Phase 6, and its format is defined in `shared/schemas/artifacts.md` (Human-Review File Formats section); do NOT write a separate `recommended_security_requirements.md` to the project root.

Use the format defined in `shared/schemas/artifacts.md` under "`.ai/blueteam/reports/security_requirements.md`". The content MUST cover:
1. Executive summary (total counts by priority, assessment source, date)
2. Requirements sorted by priority (Critical, then High, then Medium, then Low), each with:
   - SR-NNN identifier
   - Full normative requirement text
   - Acceptance criteria checklist
   - CAS rules and ASVS references
   - Related CC-NNN code change IDs
3. Agile Epics and User Stories section (for Agile teams): restate P0/P1 requirements as epics, with user stories derived from acceptance criteria
4. Traceability Matrix: table of SR-NNN ↔ CC-NNN ↔ CAS rule ↔ ASVS requirement ID
5. Implementation Checklist with timeline (Immediate / Short-term / Medium-term / Long-term)

---

## Phase 6: Extract to .ai/ Artifacts

> **WARNING EXECUTION PRIORITY: Phase 6 MUST complete before HTML generation.** If context is limited, skip or defer HTML generation; never skip Phase 6. The JSON artifacts are required by downstream skills (kill chain aggregator, security overview). An incomplete Phase 6 causes the security overview report's Threat Model tab to appear blank and breaks cross-domain kill chain correlation.

**This phase MUST run after `.ai/blueteam/reports/threat_model.md` has been written and after the security requirements content has been drafted.**

This phase extracts machine-readable artifacts into the `.ai/` folder so that downstream AI coding agents and requirements injection agents can consume the findings without re-parsing prose. **Load `shared/schemas/artifacts.md` now** (§ "Extraction Phase Instructions": the 13-step process). Follow that process exactly, using the source material and naming conventions below.

### Source Material for This Skill

> **Requirements Mode:** If `evidence_mode = "design"`, **skip Steps 2-5** (code changes).
> There is no code to extract change entries from. Proceed directly to Steps 6-9 (security
> requirements). Each Design Threat Instance becomes one or more SR entries. SR entries
> produced in Requirements Mode MUST include `"design_mode": true` in their `sources[]`
> entry so downstream skills can distinguish them from code-evidence requirements.

**For code changes (Steps 2-5):** Extract from the "Vulnerable Code Examples" section (Section 7) of `.ai/blueteam/reports/threat_model.md`. Each example that includes a recommended code remediation produces one candidate CC entry. The `sources[].assessment` value is `threat_model` and the `sources[].finding_id` is the threat ID (e.g., `T-001`). When **creating a new CC entry** (no existing entry covers this finding), set `replacement_code: null`: the threat model provides evidence of vulnerability but is not the authoritative source for exact remediation code; ASVS and CAS will populate it via merge. When **merging into an existing CC entry** (de-duplication match found), add only the new `sources[]` entry; do NOT overwrite an existing non-null `replacement_code` value. Populate `current_code_summary` with one sentence describing the vulnerable construct.

**For security requirements (Steps 6-9):** Extract from all P0/P1/P2 priority items in the threat model requirements table and the drafted security requirements content. Each distinct requirement produces one candidate SR entry. The `sources[].assessment` value is `threat_model` and the `sources[].finding_id` is the threat ID (e.g., `T-001`).

**For verification tests (Step 9b):** Extract one verification entry per active finding from Section 7. Use the finding ID (for example `T-001`) as `finding_id`, set `assessment` to `threat_model`, and include actionable placeholder-based command templates.

### Post-Extraction: Backfill CC-NNN and SR-NNN References

After completing the 13 steps:
1. Return to `.ai/blueteam/reports/threat_model.md` Section 7 (Vulnerable Code Examples) and add the allocated `**Change ID:** CC-NNN, see \`.ai/blueteam/data/code_changes.json\`` line at the end of each Remediation block where a CC entry was created.
2. The `.ai/blueteam/reports/security_requirements.md` file (written in Step 11) replaces any requirement content that would otherwise have gone to `recommended_security_requirements.md`. Do NOT create `recommended_security_requirements.md` in the project root.

### Step 12: Write environment_assumptions.json

Write `.ai/blueteam/data/environment_assumptions.json` using the schema defined in `shared/schemas/artifacts.md`. Record every organizational environment assumption applied during this assessment, the deployment target determined, and whether any conflicts were detected.

### Step 13: Risk Acceptance Processing

Follow **Step 13** of `shared/schemas/artifacts.md` (§ "Extraction Phase Instructions") exactly. This step loads the risk register (if present), performs CODEOWNERS governance detection, moves accepted findings to the report appendix, runs orphan detection in both directions, and writes/updates `.ai/blueteam/reports/risk_register.md`, `.ai/blueteam/reports/risk_register.html`, and `SECURITY_RISK_REGISTER.md` (repo root stub).

If `.ai/blueteam/data/risk_acceptances.json` does not exist, skip Step 13 with a note in the completion report.

### Completion Report

After all steps, output a brief summary:
```
## Phase 6 Artifact Extraction Complete
- Code changes: [N] new entries created, [N] duplicates merged. Total [N] in .ai/blueteam/data/code_changes.json
- Security requirements: [N] new entries created, [N] duplicates merged. Total [N] in .ai/blueteam/data/security_requirements.json
- Verification tests: [N] new entries created, [N] duplicates merged. Total [N] in .ai/blueteam/data/verification_tests.json
- Environment assumptions: [N] assumptions written to .ai/blueteam/data/environment_assumptions.json
- .ai/blueteam/reports/code_changes.md: [regenerated | skipped, no new entries]
- .ai/blueteam/reports/code_changes.html: [generated via generate_report_html.js | skipped]
- .ai/blueteam/reports/security_requirements.md: [regenerated | skipped, no new entries]
- .ai/blueteam/reports/security_requirements.html: [generated via generate_report_html.js | skipped]
- Risk acceptances: [N active, N pending, N expired | skipped, no risk_acceptances.json]
- Acceptance anomalies: [N UNAUTHORIZED_SUPPRESSION, N STALE_REGISTER_ENTRY, N EXPIRED | none]
- .ai/blueteam/reports/risk_register.md: [regenerated | skipped]
```

---

## HTML Report Generation

All `.html` report files are generated by the `generate_report_html.js` script located in the `scripts/` directory of the BlueTeam skills repository, so do **not** generate HTML manually; run the script instead.

### Setup (one-time)

```bash
npm install  # dependencies defined in package.json
```

### Usage

```bash
# Convert a specific report:
node <BlueTeam>/scripts/generate_report_html.js --file .ai/blueteam/reports/threat_model.md

# Convert all reports in .ai/blueteam/reports/ at once:
node <BlueTeam>/scripts/generate_report_html.js --repo-root /path/to/repo
```

Replace `<BlueTeam>` with the path to the BlueTeam skills directory. Run commands from the target repository root, or pass `--repo-root` explicitly.

**Optional Mermaid diagram rendering:**
```bash
npm install -g @mermaid-js/mermaid-cli
```
If `mmdc` is installed, diagrams are rendered as inline SVG. Otherwise a styled fallback box is shown.

---

## Completion Checklist

Before declaring this skill execution complete, verify every item below. Do not mark the skill done if any required output is missing; generate it first.

### Required output files

**Prerequisite artifacts (verified present, NOT written by this skill):**
- [ ] `.ai/blueteam/data/security-classification.yaml`: verified present; written by `skills/02-security-classification.md` before this skill ran. DO NOT write this file inline.
- [ ] `.ai/blueteam/data/security-classification-details.yaml`: verified present; written by `skills/02-security-classification.md` before this skill ran. If absent: STOP. Run that skill now.
- [ ] `.ai/blueteam/data/application_map.json`: verified present; written by `skills/01-application-map.md` before this skill ran.
- [ ] `.ai/blueteam/reports/application_map.md`: verified present; written by `skills/01-application-map.md`.
- [ ] `.ai/blueteam/reports/application_map.html`: verified present; generated by `skills/01-application-map.md`.

**Outputs written by this skill:**
- [ ] `.ai/blueteam/reports/security-classification.md`: written in Step 0.4 (human-readable rendering of the classification YAMLs)
- [ ] `.ai/blueteam/reports/security-classification.html`: generated by `generate_report_html.js` in Step 0.4
- [ ] `.ai/blueteam/reports/threat_model.md`: written in Phase 5
- [ ] `.ai/blueteam/reports/threat_model.html`: generated by `generate_report_html.js`
- [ ] `.ai/blueteam/data/code_changes.json`: written in Phase 6
- [ ] `.ai/blueteam/data/security_requirements.json`: written in Phase 6
- [ ] `.ai/blueteam/data/verification_tests.json`: written in Phase 6
- [ ] `.ai/blueteam/data/environment_assumptions.json`: written in Phase 6

### Verification command

Run the following at the repository root to confirm no files are missing and no links are broken:

```bash
node <BlueTeam>/scripts/validate_reports.js --repo-root /path/to/repo
```

If `validate_reports.js` reports missing files, generate them before exiting. For `.html`-only gaps, run:

```bash
node <BlueTeam>/scripts/generate_report_html.js --repo-root /path/to/repo
```

