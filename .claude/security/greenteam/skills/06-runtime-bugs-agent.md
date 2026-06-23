---
name: 06-runtime-bugs-agent
phase: Round 2
description: Detect runtime bugs that linting + type checking missed; no-undef references, dead event handlers, missing return paths in computed properties, console statement leakage in production code.
---

# Round 2: Runtime Bugs Agent

This agent surfaces runtime bugs that linting and type-checking did not
catch; typically because the lint config was absent (R2-B-01) or the
type checker aborted (R2-A-01). Most findings here are recoverable from
the ESLint output once the config exists, but the agent runs the same
scans independently so missing-config gaps do not hide them.

## What it covers

| Concern | Scanner |
|---|---|
| `no-undef` references; likely runtime ReferenceError | `scripts/eslint_scan.js` (filter by rule) |
| Dead event handlers / dead helper functions | `scripts/eslint_scan.js` (no-unused-vars cluster) |
| Computed properties / functions missing return paths | `scripts/eslint_scan.js` (vue/return-in-computed-property + consistent-return) |
| `console.*` leakage in production code | `scripts/console_log_scan.js` |

## Severity guide

- `no-undef` in a production view → HIGH. The line is broken at
  runtime. The Lungfish ground-truth R2-B-03 pattern: `payload is not
  defined` in `UsersView.vue:1233:57`.
- Imported helper function that is never called → MEDIUM if the helper
  is in a security-relevant path (auth, RBAC, sync, quarantine); LOW
  otherwise.
- Imported state-machine validator never called → MEDIUM (data integrity
  may not be enforced where intended).
- Missing return in computed property → MEDIUM. Vue renders the
  resulting `undefined` as empty.
- High console-statement count (>50 across the project) → MEDIUM
  (information leakage; debug-via-console rather than observability).

## Pattern recognition

Several bug classes have signature patterns:

- **Workflow-page state-machine bypass**: imports of `canTransition`,
  `AIR_SAMPLE_STATES`, `TERMINAL_STATES`, `isTerminal` in a view file
  that never calls them. The state-machine validator is enforced in
  the composables; but the UI has no advance affordance. This is the
  Lungfish R2-A-02 refined finding: data integrity is protected, UI
  quality is not.

- **Auth store dead clearAllData**: import of `clearAllData` in
  `auth.ts` that is never called → MEDIUM. Logout may not clear
  IndexedDB or cached credentials. Frame in evidence as compliance
  risk if PII is implicated.

- **Console leakage in RBAC views**: 5+ `console.log` statements in
  user-management / RBAC views → flag as MEDIUM with R2-B-04 framing:
  may be shipping user IDs, organisation IDs, RBAC role names to the
  browser console.

## What this agent should NOT do

- Don't re-report findings already emitted by `eslint_scan` unless the
  framing differs (e.g., emit a separate "auth-flow `no-undef`"
  finding when the file is security-relevant).
- Don't recommend `no-console` as the fix in isolation. Pair with a
  `debug()` wrapper that becomes a no-op in prod builds.
- Don't flag every `console.log`; only flag clusters that suggest
  production code is being shipped with debug instrumentation.
