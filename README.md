# Claude Build Harness

A reusable, opinionated Claude Code harness for full-stack web application development. MIT licensed.

Two systems in one repo:

- **8-phase lifecycle pipeline**: `/phase1-requirements` through `/phase8-deployment`. Each phase reads the prior phase's local deliverable, runs its analytical methodology, writes a structured `.md` to `./phases/<phase>/output/`, and hard-blocks if the upstream artifact is missing or any mechanical gate fails.
- **Build framework**: a production-tested template, sequential build guides, cross-cutting standards, and four review frameworks (blueteam defensive, redteam offensive, greenteam code review, yellowteam AI-smell prose).

> **Check catalogue:** `CHECKS.md` lists every individual check the four review frameworks run, with a deterministic vs probabilistic marker and the external-tool dependency for each. Use it when sizing a build agent or triaging a finding.

---

## What this gives you

A guided 8-phase skill chain (`/phase1-requirements` → `/phase8-deployment`) that ingests local input documents, produces structured deliverables, and never silently skips dependencies. A battle-tested template, 31 sequential build guides, 7 cross-cutting standards (security, a11y, PWA, etc.), and four review frameworks (blueteam defensive, redteam offensive, greenteam code review, yellowteam writing-style and AI-smell). Skills auto-discover, drift detection runs on every push, and the whole thing is structured to scale to 100+ developers with predictable output shapes.

---

## Quick start

```bash
# 1. Clone (or copy) this harness into your working directory
git clone <this-repo> my-project && cd my-project

# 2. Open Claude Code in this directory.
#    All skills, hooks, references auto-discover.
```

In Claude Code:

```
/phase1-requirements            # Drop input docs in ./phases/phase1-requirements/inputs/ first
/build frontend                 # Scaffold a frontend from template/
/sync-docs                      # Audit README/openapi.yaml/CLAUDE.md/code drift
/blueteam                       # Run the defensive security pipeline
/greenteam                      # Run the code-review pipeline
/style-guide path/to/draft.md   # Audit prose against the writing style rules
```

---

## The 8-phase flow

```
phase1-requirements ──FRs/NFRs/modules──▶ phase2-planning ──tasks/critical path──▶ phase3-architecture
                                                                                       │
                                                                                       │
phase4-prototyping ◀──validated tracer-bullet path── architecture+ADRs ◀──────────────┘
        │
        ▼
phase5-development (delegates to /build, follows guides 01-08, applies all standards)
        │
        ▼
phase6-user-testing ──issues──▶ phase7-user-acceptance ──sign-off──▶ phase8-deployment ──▶ live
                  └─ critical issues trigger send-back to phase5
```

Every phase:
- **Hard-blocks** if the prior phase's deliverable is missing (no winging it).
- Reads inputs from `./phases/<prior>/output/<artifact>.md` directly.
- Produces a structured `.md` with the same 7-section skeleton (Executive Summary · Inputs · Body · Compliance · Risks · Handoff · Traceability).
- Writes to `./phases/<this>/output/<artifact>.md` and runs `check-step-gates.mjs <phase>` to verify mechanical gates before claiming done.

---

## Skills cheat-sheet

| Skill | Slash | What it does |
|-------|-------|--------------|
| **Lifecycle phases** (sequential, prefixed `phase1-` … `phase8-`) ||
| Requirements | `/phase1-requirements` | Read inputs → structured FR/NFR/modules |
| Planning | `/phase2-planning` | Decompose to 0.5-3d tasks, critical path |
| Architecture | `/phase3-architecture` | Components, data model, API sketch, ADRs, threat model |
| Prototyping | `/phase4-prototyping` | Tracer-bullet validation slice |
| Development | `/phase5-development` | Production code via `/build` + guides + standards |
| User Testing | `/phase6-user-testing` | Test plan + sessions + issue triage |
| User Acceptance | `/phase7-user-acceptance` | UAT script, demo, stakeholder sign-off |
| Deployment | `/phase8-deployment` | Runbook, smoke tests, release notes |
| **General** (no prefix) ||
| Build | `/build` | Scaffold from `template/` into `./app/` |
| Sync Docs | `/sync-docs` | Drift audit across README/openapi/CLAUDE.md/code |
| Blue Team | `/blueteam` | OWASP ASVS L2 + CAS defensive assessment |
| Red Team | `/redteam` | Recon + code analysis + PoC + remediation |
| Green Team | `/greenteam` | Multi-round deterministic code review (dependency hygiene + coverage + CI gaps + runtime bugs + refinement) |
| Yellow Team | `/yellowteam` | 12-rule AI-smell audit; produces AI Smells Report per target |
| Style Guide | `/style-guide` | Single-file ad-hoc check against the writing style guide |

---

## Templates and `/build`

| Template | When to use |
|----------|-------------|
| `template/public/` | Full-stack Vue 3 (PrimeVue + Tailwind) + Express + TS + Postgres. Copy and strip. |

`/build` is the harness's **only sanctioned way** to create `./app/`. It copies the chosen template subtree into `./app/`, includes the root orchestration files (`package.json`, `Dockerfile`, `.env.example`, `test/`), then walks you through the sequential guides (01-08 backend, 01-12 frontend) and the cross-cutting standards. `/phase5-development` delegates to `/build` and hard-blocks with `Run /build first` if `./app/` doesn't yet exist. Re-running on an existing `./app/` is a hard-block — re-scaffolding must be explicit (`rm -rf ./app/` first).

`/build` accepts:
```
/build              (alias for /build fullstack)
/build fullstack    (client + server + test + root files)
/build frontend     (just client/)
/build backend      (just server/)
```

---

## Standards (cross-cutting; check throughout)

| Standard | Scope |
|----------|-------|
| 01-architecture | Monorepo layout, layers, health checks |
| 02-security | OWASP ASVS L2, JWT, CSRF, RBAC, headers, CAS |
| 03-coding-conventions | Naming, formatting, imports, errors (Go + TS + Vue) |
| 04-testing | Unit/integration/E2E + coverage targets |
| 05-accessibility | WCAG 2.1 AA |
| 06-pwa | Manifest, service worker, install/update prompts |
| 07-architectural-patterns | Simple / BFF / Enterprise selection |

Standards live at `.claude/standards/` and are referenced from skills, guides, and `harness.html`.

---

## Review frameworks

Four complementary tracks under `.claude/security/`:

**Blue team** (defensive): ASVS L2 + CAS + threat model + scans. Run via `/blueteam`. Outputs to `.ai/reports/`.

**Red team** (offensive): recon + code analysis + PoC + remediation. Run via `/redteam`. Outputs to `deliverables/`.

**Green team** (code review): dependency hygiene, secrets, test coverage, CI gaps, runtime bugs, refinement, modeled on real human-led reviews. Run via `/greenteam`. Outputs to `deliverables/`.

**Yellow team** (writing style and AI smell): 12 deterministic rules covering em dashes, "not X but Y" constructions, banned vocabulary, participial tails, and 8 other AI-prose tics. Run via `/yellowteam`. Outputs to `deliverables/`.

Each has its own `CLAUDE.md` execution protocol; read those before running. For the canonical per-check catalogue across all four teams, see `CHECKS.md` at the harness root.

---

## Distribution

This harness ships as a clonable repository. `git clone` it into your workspace, open Claude Code in the dir, and every skill / hook / standard / guide auto-discovers. That model works for any number of users (each clones, each gets a private working copy, updates land via `git pull`).

A plugin manifest stub lives at `.claude-plugin/plugin.json` for forward compatibility with the Claude Code plugin layout.

---

## How to extend

This harness is meant to grow. To add a new skill:

1. Create `.claude/skills/<name>/SKILL.md` (lowercase + hyphens, max 64 chars, under 500 lines).
2. Add a `methodology.md` companion if the skill has substantive analysis.
3. Add an `output-template.md` if the skill produces a structured deliverable.
4. Update the skill index in `CLAUDE.md`.
5. Add the skill to `harnessData.skills` in `harness.html`.
6. Run `/sync-docs` to confirm no drift.

Lifecycle-phase skills MUST use the `phase<N>-<name>` prefix. General skills MUST NOT use a numeric prefix.

For details on the skill anatomy, output skeleton, validation pattern, and Claude Code conventions used here, see `CLAUDE.md`.

---

## The Velocity White Papers

This harness is published alongside **The Velocity White Papers**, an open collection on building software in the AI era. The methodology behind it is described in [The Well-Built Harness](https://thevelocitywhitepapers.com/paper/p7p2k). Browse the full collection at [thevelocitywhitepapers.com](https://thevelocitywhitepapers.com).

## License

MIT. See [LICENSE](LICENSE).
