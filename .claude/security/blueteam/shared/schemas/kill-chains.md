---
title: "AI Schema: kill_chains.json"
description: Schema sub-file for kill_chains.json, read by skills/07-kill-chain-aggregator.md (not for standalone use).
version: 1.0.0
status: active
parent_skill: shared/schemas/artifacts.md
---

> Sub-file of `shared/schemas/artifacts.md`. Contains only the `kill_chains.json` schema and field definitions. Load this file instead of the full `shared/schemas/artifacts.md` when you only need the kill chains schema.

---

## Schema: `.ai/blueteam/data/kill_chains.json`

This file is written by the **kill chain aggregator skill** after all three assessment skills have completed. It contains machine-readable kill chain records spanning single and cross-domain assessments, enabling downstream agents to understand compound attack paths and prioritize chain-breaking remediations.

```json
{
  "schema_version": "1.0",
  "last_updated": "YYYY-MM-DD",
  "application_name": "string",
  "generated_by": "kill_chain_aggregator",
  "source_assessments_present": ["threat_model", "asvs_level2_security_assessment", "cybersecurity_architecture_standard_compliance"],
  "chains": [
    {
      "id": "KC-NNN",
      "title": "Descriptive chain name",
      "severity": "critical | high | medium | low",
      "attacker_type": "Script Kiddie | Cybercriminal | Hacktivist | Insider | Nation-state",
      "ai_enabled_variant": "Description of AI/LLM acceleration, or null",
      "scope": "single_assessment | cross_domain",
      "source_assessments": ["threat_model"],
      "attack_path": [
        {
          "step": 1,
          "attacker_action": "string",
          "finding_refs": [
            { "assessment": "threat_model", "finding_id": "T-001" },
            { "assessment": "asvs_level2_security_assessment", "finding_id": "FINDING-003" }
          ],
          "att_ck_tactic": "TA0043 Reconnaissance"
        }
      ],
      "chain_breaking_fix": {
        "description": "The single remediation that most effectively disrupts this chain",
        "related_requirement_ids": ["SR-NNN"],
        "related_code_change_ids": ["CC-NNN"]
      },
      "participating_requirement_ids": ["SR-NNN"],
      "participating_code_change_ids": ["CC-NNN"],
      "priority_elevations": [
        {
          "artifact_type": "requirement | code_change",
          "artifact_id": "SR-NNN or CC-NNN",
          "previous_priority": "medium",
          "elevated_to": "critical",
          "rationale": "Cross-domain chain KC-NNN elevates this finding to Critical: individual assessment scored it as Medium"
        }
      ]
    }
  ]
}
```

### Field Definitions: Kill Chains

| Field | Required | Description |
|---|---|---|
| `schema_version` | Yes | Schema version: `"1.0"` |
| `last_updated` | Yes | ISO date of last write |
| `application_name` | Yes | Application name from classification files |
| `generated_by` | Yes | Always `"kill_chain_aggregator"` |
| `source_assessments_present` | Yes | Which of the three assessment reports were available as inputs |
| `chains[].id` | Yes | KC-NNN. Globally unique across all chains in this file. Sequential starting at KC-001. |
| `chains[].title` | Yes | Descriptive chain name (e.g., "Unauthenticated PHN Mass Extraction via Endpoint Enumeration + BOLA") |
| `chains[].severity` | Yes | Combined chain severity: `critical`, `high`, `medium`, or `low`. May exceed individual finding severities. |
| `chains[].attacker_type` | Yes | Attacker classification from the Attacker Capability Matrix |
| `chains[].ai_enabled_variant` | Yes | How AI/LLM tools could accelerate or automate this chain; `null` if not applicable |
| `chains[].scope` | Yes | `single_assessment`: chain constructed from one skill's findings only; `cross_domain`: chain spans findings from two or more assessment skills |
| `chains[].source_assessments` | Yes | Which assessment(s) contributed findings to this chain |
| `chains[].attack_path[].step` | Yes | Sequential step number (1, 2, 3, ...) |
| `chains[].attack_path[].attacker_action` | Yes | Plain-language description of the attacker action at this step |
| `chains[].attack_path[].finding_refs` | Yes | Array of `{ assessment, finding_id }` objects. Each ref identifies the specific finding that enables this step. A step may draw on findings from multiple assessments. |
| `chains[].attack_path[].att_ck_tactic` | Yes | ATT&CK tactic ID and name (e.g., `"TA0043 Reconnaissance"`) |
| `chains[].chain_breaking_fix.description` | Yes | Single remediation most effectively disrupting the chain |
| `chains[].chain_breaking_fix.related_requirement_ids` | Yes | SR-NNN IDs in `security_requirements.json` implementing the chain-breaking fix. Empty array if not yet linked. |
| `chains[].chain_breaking_fix.related_code_change_ids` | Yes | CC-NNN IDs in `code_changes.json` implementing the chain-breaking fix. Empty array if not yet linked. |
| `chains[].participating_requirement_ids` | Yes | All SR-NNN IDs whose findings participate in this chain (not just the chain-breaking fix) |
| `chains[].participating_code_change_ids` | Yes | All CC-NNN IDs whose findings participate in this chain |
| `chains[].priority_elevations` | Yes | Records any SR-NNN or CC-NNN entries whose priority was elevated because this cross-domain chain raised their compound severity. Empty array if no elevations occurred. |

### Merging kill_chains.json

The kill chain aggregator skill always regenerates this file from scratch on each run (it reads all current assessment reports and re-derives all chains). It does not merge incrementally. The `last_updated` date is set to the run date. Previous KC-NNN IDs are NOT preserved between runs: IDs are reallocated sequentially each time.

> **Downstream agent note**: Do not hardcode KC-NNN references in other artifacts. Cross-references on SR-NNN and CC-NNN entries that point at kill chains are read-only derivations produced by the aggregator and will be refreshed on each aggregator run.

---
