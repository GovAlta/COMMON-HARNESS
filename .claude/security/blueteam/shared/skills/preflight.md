---
id: blue-team-shared-security-preflight
name: Blue Team Shared Security Preflight Skill
description: Shared pre-assessment preflight for BlueTeam skills that centralizes environment baseline loading, controls parsing, risk-acceptance pre-checks, and optional application-map staleness validation.
type: sub-agent
version: 1.1.0
tools_required:
  - Read
  - Glob
  - Grep
  - Bash
tools_optional:
  - Write
  - Edit
references:
  - environment
  - controls-yaml-schema
  - ai-artifacts-schema
  - application-map
upstream: []
outputs: []
call_sequence_hard:
  - Must resolve declared upstream dependencies before execution, or fail fast with a dependency error.
  - Must be loaded before running skills/04-threat-model.md, skills/05-asvs-level2-assessment.md, skills/06-cas-compliance.md, or skills/10-dr-resilience.md.
  - If the consuming skill uses application_map.json, staleness must be evaluated before discovery/assessment phases proceed.
---

## Purpose

This skill reduces duplicated setup context across BlueTeam assessment skills by centralizing common preflight checks and rules.

Use it to establish a consistent pre-assessment context before executing the target assessment skill.

## Preflight Steps

1. **Load baseline context**
   - Read `shared/reference/environment-baseline.md` up to (but not including) the `> **NON-ASVS SKILLS: STOP READING HERE.**` marker. The ASVS Chapter Assumption Mapping section that follows is only needed by the ASVS assessment orchestrator, which loads it separately.
   - Record baseline assumptions that may affect infrastructure-level findings.

2. **Load controls mapping context**
   - Read `shared/schemas/controls-yaml.md`.
   - If `.ai/controls.yaml` exists, parse it and extract active controls (boolean `true` keys).
   - If parse fails, record a warning and continue.

3. **Risk acceptance register loading**
   - Check for `.ai/blueteam/data/risk_acceptances.json`.
   - **If absent:** set `risk_acceptance_mode = disabled`. Step 13 in consuming skills will be skipped.
   - **If present:** set `risk_acceptance_mode = enabled`, then:
     - Read the full file. For each entry record: `id`, `status`, `finding_ids` (or rule/threat IDs it covers), and `expires_at`.
     - Status rules: `active` and `pending` entries suppress findings. `expired` and `withdrawn` entries do NOT suppress: treat as active unaccepted findings.

   **Non-suppressible finding types** (never suppress regardless of RA entry or status):
   - Hardcoded credentials or secrets present at current HEAD
   - Authentication bypass mechanisms, including env-var-gated bypasses (`DISABLE_AUTH`, `ALLOW_MOCK_IN_PRODUCTION`, etc.)
   - PHN, SIN, medical/mental health diagnosis, or bank/credit card number exposure
   - Bulk Protected B data extraction (unfiltered API responses, missing row-level access control, missing pagination)
   - Backdoor routes or privilege escalation via client-controlled input
   - Critical DR gaps (no meaningful recovery path for the application)

   **Finding-level RA check: apply when writing each finding throughout the assessment:**
   Before recording any finding, apply this procedure:
   1. If the finding type matches a non-suppressible category above → write to the main findings section regardless. If an RA entry exists for it, note: `NON-SUPPRESSIBLE: risk acceptance cannot suppress this finding type.`
   2. Otherwise, look up the finding's ID in the loaded RA entries (match by requirement ID, CAS rule ID, threat ID, or finding ID as applicable).
   3. If a match exists with `status: active` or `status: pending`:
      - Flag the finding title: `[RISK ACCEPTED: RA-NNN]`
      - Note it will appear in the **Accepted Risks appendix** (Step 13 of the consuming skill's extraction phase), not the main findings section.
   4. If no match → write the finding normally.

   Full Step 13 processing (CODEOWNERS governance detection, orphan detection in both directions, risk register report regeneration) is deferred to the consuming skill's extraction phase using `shared/schemas/artifacts.md` Step 13.

4. **Application map pre-check (when required by consuming skill)**
   - If the consuming skill depends on `.ai/blueteam/data/application_map.json`, perform staleness evaluation:
     - If map missing: mark `application_map_state = missing`.
     - If map exists and `generated_at_commit` is present: compare with `git rev-parse HEAD`.
     - If commit matches: `application_map_state = fresh`.
     - If commit differs: `application_map_state = stale`.
     - If non-git (`generated_at_commit` null): compare date freshness (same day = fresh; otherwise stale).

## Handoff Contract

When preflight completes, the consuming skill should proceed with:

- baseline assumptions loaded.
- Controls file load outcome and active controls list (or warning).
- Risk acceptance mode (`enabled` or `disabled`).
- Application map state (`fresh`, `stale`, or `missing`) when applicable.

This allows consuming skills to avoid re-emitting long duplicated setup instructions while preserving hard ordering and behavior.
