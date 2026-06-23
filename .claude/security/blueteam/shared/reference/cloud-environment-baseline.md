---
title: "Cloud Environment Baseline for Resilience & DR"
description: Defines repo-first evidence rules and baseline resilience assumptions for cloud-hosted applications assessed by BlueTeam DR skill.
version: 1.0.0
status: active
---

# Cloud Environment Baseline for Resilience & DR

This baseline is used by `skills/10-dr-resilience.md` to avoid over-penalizing cloud-hosted applications while still requiring in-repo evidence.

## Evidence-First Credit Rules

DR controls that depend on cloud hosting MUST use one of the following evidence levels:

1. **OBSERVED** (full credit)
   - Direct in-repo evidence that a cloud property is in use and configured (IaC, deployment manifests, provider config exports, app config showing enabled feature)
   - Weight: `1.0`

2. **DECLARED** (partial credit)
   - Evidence from in-repo `app_cloud_environment.json` (or `app_cloud_environment.md`) when direct technical evidence is not present
   - Weight: `0.6`

3. **ASSUMED** (no control credit)
   - Provider capabilities that may exist but are not evidenced or declared in repo
   - Weight: `0.0`
   - MAY be discussed as "potential inherited capability" in report narrative only

No cloud resilience control may receive points from provider reputation or generic platform capability alone.

---

## Cloud Landing Zone Default Characteristics (Canada Central)

For deployments on Azure/AWS/GCP Landing Zones in Canada Central, the following may be treated as default platform characteristics when the repo indicates Cloud Landing Zone use:

- Canadian residency target in `canada central` region(s)
- Managed cloud networking guardrails
- Managed telemetry and monitoring services available
- Managed storage/database backup capabilities available
- Zone-aware high-availability options available for supported services

These are still subject to Evidence-First Credit Rules:
- If LZ usage is **OBSERVED**, grant credit for baseline platform controls
- If LZ usage is only **DECLARED**, grant partial credit
- If neither, do not grant credit

Default service levels inferred from LZ baseline (only when LZ usage is observed/declared and app-specific values are absent):
- `RTO`: inferred platform baseline target (same-day restoration window)
- `RPO`: inferred platform baseline target (same-day data-loss window)

If app-specific RTO/RPO are defined in repo, those values override inferred baseline values.

---

## Non-Cloud Properties

For non-organizational cloud properties (for example Supabase, Render, Lovable, Vercel, Netlify):

- Provider usage must be evidenced in repo (endpoint URLs, SDK config, connection strings, deployment metadata) before any hosting/provider usage credit is applied
- Resilience controls (backup retention, PITR, failover, multi-region, restore workflows) require:
  - **OBSERVED** config evidence for full credit, or
  - **DECLARED** values in `app_cloud_environment.*` for partial credit
- If provider usage is not evidenced in repo, assign no provider resilience credit

---

## Optional App Declaration File

When cloud configuration is outside source control, teams may add:

- `.ai/blueteam/data/app_cloud_environment.json` (preferred), or
- `.ai/blueteam/data/app_cloud_environment.md`

This declaration is an accepted evidence source at `DECLARED` confidence (`0.6` weighting) and SHOULD be treated as lower confidence than observed technical evidence.

Minimum declaration fields:

- provider name and role (`hosting`, `database`, etc.)
- region
- plan/tier
- resilience flags (multi-zone, multi-region, failover)
- backup settings (enabled, frequency, retention, PITR)
- optional `rto_target` and `rpo_target`

---

## Report Requirements

DR reports SHOULD include a short "Cloud Evidence Summary" section with:

- providers observed in repository
- providers declared by `app_cloud_environment.*`
- controls credited at observed vs declared vs assumed levels
- unresolved controls requiring explicit in-repo declaration or technical evidence
