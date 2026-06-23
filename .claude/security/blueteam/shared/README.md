# BlueTeam Shared Assets

This folder contains shared BlueTeam skill assets used across multiple assessment skills.

## Purpose

Centralize common reference artifacts and preflight logic to reduce duplication and context pressure in primary skills.

## Contents

### Sub-agent skills (`skills/`)

- `skills/api-security.md`: API security requirements for REST, SOAP, GraphQL, gRPC, WebSocket; called by ASVS V13 and CAS
- `skills/information-classification.md`: information security classification framework; called by threat model / ASVS / classification skills
- `skills/requirements-updater.md`: maps assessment findings to requirements updates in the project's requirements database
- `skills/preflight.md`: shared pre-assessment preflight (v1.1.0+). Loads baseline, parses controls file, **fully loads and processes risk acceptance register** (canonical non-suppressible list plus finding-level RA check procedure), and evaluates app map staleness. All 4 assessment skills defer RA loading to this file. Do not add inline RA loading sections to assessment skills.

### Schema and template files (`schemas/`)

- `schemas/artifacts.md`: core JSON schemas (`code_changes.json`, `security_requirements.json`, `environment_assumptions.json`, `risk_acceptances.json`). 13-step extraction process. Canonical `sources[].assessment` values (`threat_model`, `asvs_level2_security_assessment`, `cybersecurity_architecture_standard_compliance`, `dr_resilience_analysis`, `cybersecurity_tool_use`, `kill_chain_aggregator`). Non-canonical values cause ASVS/CAS verdicts to silently show "Pass" in the overview report.
- `schemas/application-map.md`: `application_map.json` schema; read by `skills/01-application-map.md`
- `schemas/kill-chains.md`: `kill_chains.json` schema; read by `skills/07-kill-chain-aggregator.md`
- `schemas/html-report-template.md`: HTML page template, CSS, Markdown to HTML and Mermaid to SVG conversion rules; read by any skill generating `.html` reports
- `schemas/controls-yaml.md`: controls file schema and annotation mapping guidance

### Environment and standards reference files (`reference/`)

- `reference/environment-baseline.md`: organizational environment assumptions and baseline behavior; read by all assessment skills
- `reference/cloud-environment-baseline.md`: cloud resilience baseline assumptions and credit model for DR skill
- `reference/attack-chain-reference.md`: ATT&CK tactic mapping and kill-chain reference tables
- `reference/cas-rule-definitions.md`: authoritative CAS rule specifications (all 57 rules with requirement text, compliant TypeScript/Node.js implementation patterns, organization-specific requirements, applicability scope, and ITSG-33 mappings). Read by `skills/06-cas-compliance.md` (full file) and `skills/15-cas-compliant-builder.md` (selective: Platform Context plus requested domain sections only; see Section Loading Guide and Domain to Section Heading Map at top of file).
- `reference/reference-architectures.md`: externalized organizational reference architecture profiles (Profile A: Internal/Enterprise IdP, Profile B: Public/SAML, Profile C: Dual Portal), data classification overlays, and REST API baseline synthesized from organizational API standards. Read exclusively by `skills/03-security-architecture.md`.
- `reference/human-process-controls.md`: process-based controls required outside of code to achieve ASVS Level 2; informational reference for assessors and development teams

## Usage

- Skills should reference shared assets using `shared/<file>.md` paths.
- `shared/skills/preflight.md` should be loaded before core assessment skills that depend on baseline/controls/risk-acceptance setup.
- Keep shared files broadly reusable; avoid embedding skill-specific logic here.

## Change Guidance

When changing a shared file:

1. Update this README if purpose or ownership changes.
2. Validate references in BlueTeam skills and README tables.
3. Keep compatibility notes in consuming skills when behavior changes.
