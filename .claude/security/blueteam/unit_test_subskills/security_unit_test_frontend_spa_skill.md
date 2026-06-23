---
id: security-unit-test-frontend-spa
name: Security Unit Test Frontend SPA Skill
description: Frontend SPA security test guidance for Vue/React clients, including auth-state handling, secure token storage expectations, and client-side validation safeguards.
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
  - security-unit-test-shared-core
  - asvs-level2-security-assessment
upstream:
  - ref: security-unit-test-shared-core
    artifacts: []
outputs: []
call_sequence_hard:
  - Must resolve declared upstream dependencies before execution, or fail fast with a dependency error.
  - Must execute only when Vue/React frontend signals are present.
---

## In-scope frontend controls

Generate/augment tests for:

- Auth guard behavior for protected routes/views
- Session token storage posture checks (especially localStorage vs secure patterns)
- Client-side validation/encoding behavior for unsafe inputs
- Security-relevant state transitions (login/logout/token-expired flows)
- Frontend handling of API auth/authorization error responses

## Required constraints

- Do not treat frontend validation as sufficient server protection.
- Where frontend-only controls exist, report backend enforcement gap in coverage report.
