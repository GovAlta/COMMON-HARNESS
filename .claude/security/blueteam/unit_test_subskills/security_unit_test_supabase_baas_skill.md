---
id: security-unit-test-supabase-baas
name: Security Unit Test Supabase BaaS Skill
description: Supabase-specific security test guidance for edge functions, auth header handling, and policy-aware access behavior in BaaS deployments.
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
upstream:
  - ref: security-unit-test-shared-core
    artifacts: []
outputs: []
call_sequence_hard:
  - Must resolve declared upstream dependencies before execution, or fail fast with a dependency error.
  - Must execute only when supabase/config.toml exists.
  - Must enumerate edge functions before generating Supabase-specific tests.
---

## Supabase-specific scope

Generate/augment tests for:

- Edge function auth behavior (including `verify_jwt` expectations)
- Required header validation and rejection of malformed/absent auth headers
- Function-level authorization assumptions reflected in tests
- Input validation for edge function payloads
- Error handling without sensitive leakage

## Required detection inputs

- `supabase/config.toml`
- `supabase/functions/*/index.ts` (or `.js`)
- Any function-specific config indicating auth requirements

## Reporting notes

- Explicitly identify checks that require RLS/policy integration testing outside pure unit tests.
