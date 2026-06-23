---
id: security-unit-test-node-express
name: Security Unit Test Node Express Skill
description: Node/Express-specific security unit-test guidance for authentication, authorization, API endpoint controls, and backend middleware enforcement.
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
  - cybersecurity-architecture-standards
  - asvs-level2-security-assessment
upstream:
  - ref: security-unit-test-shared-core
    artifacts: []
outputs: []
call_sequence_hard:
  - Must resolve declared upstream dependencies before execution, or fail fast with a dependency error.
  - Must execute only when Node/Express backend signals are present.
  - Must use endpoint inventory built during shared core discovery.
---

## In-scope backend controls

Generate/augment tests for:

- Authentication enforcement on protected endpoints
- Session handling and token rejection behavior
- Authorization (role/permission and object-level access)
- Input validation and output encoding at API boundaries
- CORS behavior and deny-by-default origin handling
- Rate limiting behavior for abuse-prone routes
- Secrets management checks that are code-verifiable
- Security headers middleware behavior
- File upload validation/sanitization constraints
- Logging/audit behavior at security decision points
- AI/LLM integration guardrails (if present)

## Required route-level assertions

- Protected routes reject missing/invalid auth.
- Admin-only routes reject non-admin callers.
- Write operations enforce expected authorization checks.
- Validation failures return expected error status without stack leakage.

## Deferral Policy: [CURRENT VULNERABLE] / [MITIGATED] pattern

The `[CURRENT VULNERABLE]` / `[MITIGATED]` dual-state pattern MUST be applied even when the associated CC fix has not yet been implemented in the codebase. The purpose of [MITIGATED] tests is precisely to write the acceptance criteria before the fix exists.

**Deferral is only acceptable when:**
- Testing genuinely requires a live external service that cannot be reasonably mocked (e.g., an HSM, a real SAML IdP, a live virus scanner with specific behavior)
- Testing would require executing actual malware or inherently destructive operations

**These scenarios are always unit-testable and MUST NOT be deferred:**
- Startup config validation (`createApp()` throws on invalid config): use `process.env` mocking
- SQL WHERE clause parameter verification: mock the `query` function and capture parameters
- Middleware behavior that depends on env vars: mock `process.env` in `beforeEach`/`afterEach`
- Rate limiter store type (MemoryStore vs RedisStore): inspect the `.store` property
- Function call invocation (e.g., virus scanner, retry logic): use `vi.fn()` / `vi.spyOn()`
- Retry-with-backoff behavior: use `vi.useFakeTimers()` and mock the underlying function

**Rationale:** Deferring these tests on the grounds of "can be covered once CC is implemented" defeats the purpose of the [CURRENT VULNERABLE]/[MITIGATED] pattern. The pattern exists so that MITIGATED tests fail on unfixed code (documenting the vulnerability as a regression gate) and pass once the fix is applied (serving as acceptance criteria). Deferring them means the regression gate is never established.
