---
name: 04-ci-pipeline-audit-agent
phase: Round 2
description: Audit CI/CD pipelines for missing gates: ESLint step, integration-test job, security scan (audit/Trivy/Snyk/govulncheck), SBOM generation, coverage publishing.
---

# Round 2: CI Pipeline Audit Agent

This agent reads the CI/CD configuration and reports which gates are
missing. A pipeline that builds and deploys but does not run lint or
security scans is a process gap that a single bad commit can convert
into a production incident.

## What it covers

| Concern | Scanner |
|---|---|
| ESLint step in CI | `scripts/ci_pipeline_audit.js` |
| Go integration-test job with Postgres service container | `scripts/ci_pipeline_audit.js` |
| Security scan step (npm audit / Trivy / Snyk / govulncheck / OSV) | `scripts/ci_pipeline_audit.js` |
| SBOM generation (CycloneDX / Syft) | `scripts/ci_pipeline_audit.js` |
| Coverage publishing (badge / trend / PR delta) | `scripts/ci_pipeline_audit.js` |

## Where the gates should live

The agent reads `.github/workflows/*.yml` first (most common). Other
CI providers (GitLab, CircleCI, Jenkins) are not yet supported by the
scanner but the agent should note that gap in the findings.

## Severity guide

- Missing ESLint step where the project has working ESLint config →
  MEDIUM. Without it, lint findings never block merge.
- Missing integration-test job where integration tests exist (per
  `integration_test_enum`) → MEDIUM. The most valuable tests in the
  codebase are not being exercised.
- Missing security scan step → LOW (informational). Many teams run
  security scans out-of-band.
- Missing SBOM generation → LOW.
- Missing coverage publishing → LOW.

## What this agent should NOT do

- Don't recommend a specific CI tool. The finding is "lint is not
  gated"; the fix can be GitHub Actions, GitLab CI, anything.
- Don't fail loud for SBOM/coverage gaps. They are hygiene, not
  correctness.
- Don't double-count: if a project has multiple pipelines (PWA +
  datahub for example), report per-pipeline.
