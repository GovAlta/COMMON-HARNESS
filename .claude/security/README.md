# Security Assessment Framework

A comprehensive AI-driven cybersecurity evaluation system with Blue Team (defensive) and Red Team (offensive) capabilities. This framework uses Claude AI agents to perform security assessments, penetration testing, compliance auditing, and remediation planning.

## Overview

| Team | Purpose | Agents | Approach |
|------|---------|--------|----------|
| **Blue Team** | Defensive assessment & compliance | 15 skills + 14 ASVS chapters | OWASP ASVS L2, CAS, STRIDE+DREAD threat modeling |
| **Red Team** | Offensive penetration testing | 8 agent skills | Recon, code analysis, PoC exploitation, remediation |

## Blue Team

The Blue Team framework performs comprehensive defensive security assessments including:

- **Application mapping** - Discover tech stack, endpoints, auth mechanisms, secrets
- **Information classification** - Data sensitivity assessment (public through protected)
- **Security architecture review** - Deployment profile and architectural gap analysis
- **Threat modeling** - STRIDE+DREAD methodology with kill chain analysis
- **ASVS Level 2 compliance** - All 14 chapters of OWASP ASVS 4.0.3
- **CAS compliance** - 57 Cybersecurity Architecture Standard rules
- **Cross-domain kill chains** - Multi-assessment attack path correlation
- **Automated tool scanning** - npm audit, secretlint, ESLint security plugins
- **Security unit test generation** - Stack-specific test coverage
- **DR/resilience assessment** - Business continuity evaluation
- **Unified overview report** - 10-tab SPA synthesizing all findings

### Blue Team Execution Flow

```
1. CLAUDE.md (mandatory first read)
2. Application Map (or Requirements Map if no code)
3. Security Classification (optional gate for threat model)
4. Security Architecture (optional)
5. Threat Model (STRIDE+DREAD)
6. CAS Compliance (57 rules)
7. ASVS Level 2 Assessment (14 chapters)
8. Kill Chain Aggregator
9. Tool Scanning (npm audit, secretlint, ESLint security)
10. Security Unit Tests
11. DR/Resilience Analysis
12. Code Fix Generation (optional)
13. Security Overview Report
14. Validate: node scripts/validate_reports.js
```

### Blue Team Skills

| # | Skill | File |
|---|-------|------|
| 01 | Application Map | `skills/01-application-map.md` |
| 02 | Security Classification | `skills/02-security-classification.md` |
| 03 | Security Architecture | `skills/03-security-architecture.md` |
| 04 | Threat Model | `skills/04-threat-model.md` |
| 05 | ASVS Level 2 Assessment | `skills/05-asvs-level2-assessment.md` |
| 06 | CAS Compliance | `skills/06-cas-compliance.md` |
| 07 | Kill Chain Aggregator | `skills/07-kill-chain-aggregator.md` |
| 08 | Tool Scanning | `skills/08-tool-scanning.md` |
| 09 | Security Unit Tests | `skills/09-security-unit-tests.md` |
| 10 | DR/Resilience | `skills/10-dr-resilience.md` |
| 11 | Code Fix Generation | `skills/11-code-fix-generation.md` |
| 12 | Security Overview Report | `skills/12-security-overview-report.md` |
| 13 | Requirements Map | `skills/13-requirements-map.md` |
| 14 | ASVS Compliant Builder | `skills/14-asvs-compliant-builder.md` |
| 15 | CAS Compliant Builder | `skills/15-cas-compliant-builder.md` |

### ASVS Chapters (Auto-loaded by skill 05)

| Chapter | File |
|---------|------|
| V1 Architecture | `asvs_chapters/asvs_v1_architecture_skill.md` |
| V2 Authentication | `asvs_chapters/asvs_v2_authentication_skill.md` |
| V3 Session Management | `asvs_chapters/asvs_v3_session_management_skill.md` |
| V4 Access Control | `asvs_chapters/asvs_v4_access_control_skill.md` |
| V5 Input Validation | `asvs_chapters/asvs_v5_input_validation_skill.md` |
| V6 Cryptography | `asvs_chapters/asvs_v6_cryptography_skill.md` |
| V7 Error Handling | `asvs_chapters/asvs_v7_error_handling_skill.md` |
| V8 Data Protection | `asvs_chapters/asvs_v8_data_protection_skill.md` |
| V9 Communication | `asvs_chapters/asvs_v9_communication_skill.md` |
| V10 Malicious Code | `asvs_chapters/asvs_v10_malicious_code_skill.md` |
| V11 Business Logic | `asvs_chapters/asvs_v11_business_logic_skill.md` |
| V12 Files & Resources | `asvs_chapters/asvs_v12_files_resources_skill.md` |
| V13 API Security | `asvs_chapters/asvs_v13_api_security_skill.md` |
| V14 Configuration | `asvs_chapters/asvs_v14_configuration_skill.md` |

### Shared Resources

| Category | Files | Purpose |
|----------|-------|---------|
| **Sub-agent skills** | `shared/skills/` | Preflight checks, API security, classification, requirements updater |
| **Schemas** | `shared/schemas/` | JSON artifact schemas, HTML report template, application map schema |
| **Reference data** | `shared/reference/` | CAS rules (57), attack chains (ATT&CK), environment baselines, reference architectures |

### Scripts

| Script | Purpose |
|--------|---------|
| `generate_overview_html.js` | 10-tab SPA report from all artifacts |
| `generate_report_html.js` | Individual assessment HTML reports |
| `generate_requirements_report.js` | Security requirements summary |
| `generate_code_changes_report.js` | Code changes summary |
| `security-pipeline.js` | npm audit, secretlint, ESLint security scans |
| `check_skill_coverage.js` | ASVS chapter coverage validator |
| `validate_reports.js` | Post-assessment validation |

### Test Infrastructure

| Component | Path | Purpose |
|-----------|------|---------|
| Unit tests | `tests/unit/` | Tests for all Node.js scripts |
| Integration tests | `tests/integration/` | Assertion-based skill output validation |
| JSON schemas | `tests/schemas/` | 10 artifact schemas for validation |
| Test fixtures | `tests/integration/fixtures/` | Sample apps for testing |
| Assertions | `tests/integration/assertions/` | 16 assertion YAML files |

---

## Red Team

The Red Team framework performs offensive security testing including:

- **External reconnaissance** - DNS, subdomains, ports, TLS, WAF detection, tech fingerprinting
- **Source code analysis** - Architecture review, auth mapping, attack surface identification
- **PoC exploitation** - Proof-of-concept development against live targets
- **Remediation recommendations** - Code-level fixes from findings
- **Dependency analysis** - Known vulnerability scanning
- **Infrastructure analysis** - Cloud/server configuration review
- **SAST analysis** - Static application security testing
- **Secrets detection** - Credential and secret exposure scanning

### Red Team Pipeline Flow

```
Phase 1:  recon + code-analysis (parallel, foundational)
Phase 2:  dependency + infrastructure + sast + secrets (parallel, supporting)
Phase 3:  poc (sequential, requires Phase 1)
Phase 4:  recommendation (sequential, requires Phase 3)
```

### Red Team Skills

| # | Agent | File | Role |
|---|-------|------|------|
| 01 | Recon Agent | `skills/01-recon-agent.md` | External reconnaissance |
| 02 | Code Analysis Agent | `skills/02-code-analysis-agent.md` | Source code security review |
| 03 | PoC Execution Agent | `skills/03-poc-execution-agent.md` | Exploit development & testing |
| 04 | Recommendation Agent | `skills/04-recommendation-agent.md` | Remediation with code fixes |
| 05 | Dependency Analysis | `skills/05-dependency-analysis-agent.md` | Known CVE scanning |
| 06 | Infrastructure Analysis | `skills/06-infrastructure-analysis-agent.md` | Cloud/infra config review |
| 07 | SAST Analysis | `skills/07-sast-analysis-agent.md` | Static analysis |
| 08 | Secrets Detection | `skills/08-secrets-detection-agent.md` | Credential exposure |

### Recon Tools

10 Node.js wrapper scripts in `tools/recon/` that normalize CLI tool output to structured JSON:

| Tool | External Dependency | Purpose |
|------|-------------------|---------|
| `dns_enum.js` | `dig` | DNS record enumeration |
| `whois_lookup.js` | `whois` | Domain registration lookup |
| `subdomain_discovery.js` | `subfinder` (optional) | Subdomain enumeration |
| `port_scan.js` | `nmap` | Port and service scanning |
| `tls_scan.js` | `curl`/`testssl.sh` | TLS/SSL certificate analysis |
| `http_headers.js` | `curl` | HTTP security header inspection |
| `tech_fingerprint.js` | `whatweb` (optional) | Technology stack detection |
| `waf_detect.js` | `wafw00f` (optional) | Web application firewall detection |
| `endpoint_discovery.js` | `feroxbuster` (optional) | URL/endpoint enumeration |
| `ct_search.js` | `curl` | Certificate Transparency search |

### Evaluation Framework

Modular scoring system for agent deliverables:
- **Objective checks**: Deterministic validation (structure, completeness, accuracy)
- **Subjective checks**: LLM judge for qualitative assessment
- **Scoring**: 40% objective + 60% subjective (configurable)
- **Grade scale**: EXCELLENT (90+), GOOD (75+), ADEQUATE (60+), NEEDS IMPROVEMENT (40+), POOR (<40)
- **History tracking**: Compare evaluation runs across iterations

---

## Output Artifacts

### Blue Team Outputs (`.ai/` directory in target repo)

```
.ai/
├── data/
│   ├── application_map.json
│   ├── app_topology.json
│   ├── security-classification.yaml
│   ├── code_changes.json
│   ├── security_requirements.json
│   ├── verification_tests.json
│   ├── environment_assumptions.json
│   ├── kill_chains.json
│   ├── dr_resilience_assessment.json
│   ├── security-scan-results.json
│   └── raw/                               # npm-audit, secretlint, eslint-security raw output
└── reports/
    ├── application_map.md / .html
    ├── threat_model.md / .html
    ├── asvs_level2_security_assessment.md / .html
    ├── cybersecurity_architecture_standard_compliance.md / .html
    ├── cross_domain_kill_chains.md / .html
    ├── dr_resilience_assessment.md / .html
    ├── security-test-coverage-report.md / .html
    ├── security_requirements.md / .html
    ├── code_changes.md / .html
    └── security_overview.md / .html (10-tab SPA)
```

### Red Team Outputs (`./deliverables/` directory)

```
deliverables/
├── recon_deliverable_{id}.json
├── code_analysis_deliverable_{id}.json
├── dependency_analysis_deliverable_{id}.md
├── infrastructure_analysis_deliverable_{id}.md
├── sast_analysis_deliverable_{id}.md
├── secrets_analysis_deliverable_{id}.md
├── poc_testing_{id}.json
└── remediation_report_{id}.json
```

---

## Quick Start

### Blue Team Assessment
```bash
cd security/blueteam
npm install
# Read CLAUDE.md first (mandatory)
# Then run skills in order via Claude Code
```

### Red Team Assessment
```bash
cd security/redteam
npm install
bash scripts/install_recon_deps.sh  # Install external tools

# Full pipeline
node pipeline/claude_sdk.js /path/to/target --endpoint https://target.example.com

# With evaluation
node pipeline/claude_sdk.js /path/to/target --endpoint https://target.example.com --eval-full
```
