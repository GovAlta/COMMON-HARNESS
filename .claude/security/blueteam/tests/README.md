# BlueTeam Security Assessment: Regression Test Suite

## Overview

This test suite validates the BlueTeam security assessment toolchain against
known-good fixtures and behavioral expectations. It covers two distinct tiers:

**Tier 1: Python unit tests** (`tests/unit/`)
Automated tests for the Python scripts that produce HTML reports from assessment
artifacts. These tests invoke the scripts as subprocesses and assert on the
generated HTML. Fully automated; no Claude involvement required. Suitable for CI.

**Tier 2: Skill integration tests** (`tests/integration/`)
Semi-automated tests for the AI-powered assessment skills (threat model, ASVS,
CAS, kill chain aggregator, etc.). The skill is run manually (or via a future
CI automation layer) against a known-good fixture. The test suite then checks the
generated `.ai/` artifacts against a set of assertion YAML files that define
expected structural and behavioral properties. The check phase requires no
Claude invocation and is CI-compatible.

The two tiers are designed to complement each other: unit tests guard the
deterministic Python layer; integration assertions guard the AI layer against
regressions that would prevent key findings from being detected or reported.

---

## Quick Start

### Prerequisites

- Python 3.10 or later
- Install Python dependencies:

```bash
pip install -r tests/requirements.txt
```

Dependencies: `pytest`, `jsonschema`, `beautifulsoup4`, `pyyaml` (see
`tests/requirements.txt` for pinned minimum versions).

The `markdown` package is also required by `generate_report_html.py`:

```bash
pip install markdown
```

### Running Python unit tests

```bash
python run_tests.py --python
```

This runs all tests under `tests/unit/` using pytest and reports pass/fail/skip
counts. Exit code 0 = all tests passed.

### Running a skill integration test (3-step process)

**Step 1: Prepare the fixture**

```bash
python run_tests.py --prepare --skill asvs --fixture basic_webapp
```

This copies the fixture into a temporary working directory and sets up the
`.ai/blueteam/data/application_map.json` pre-seed (if present).

**Step 2: Run the skill manually**

Point your Claude session at the prepared fixture directory and invoke the
skill. For example:
```
/skills/05-asvs-level2-assessment.md
```
Wait for the skill to complete and write `.ai/` artifacts.

**Step 3: Check the results**

```bash
python run_tests.py --check --skill asvs --fixture basic_webapp
```

The checker validates all assertion YAML files for the skill against the
generated artifacts. Exit code 0 = all assertions passed.

---

## Available Skills

| Skill key | Skill file | Fixture | Requires |
|-----------|-----------|---------|---------|
| `app_map` | `skills/01-application-map.md` | `basic_webapp` | Nothing |
| `threat_model` | `skills/04-threat-model.md` | `basic_webapp` | `app_map` complete |
| `asvs` | `skills/05-asvs-level2-assessment.md` | `basic_webapp` | `app_map` complete |
| `cas` | `skills/06-cas-compliance.md` | `basic_webapp` | `app_map` complete |
| `kill_chain` | `skills/07-kill-chain-aggregator.md` | `basic_webapp` | `threat_model`, `asvs`, `cas` complete |
| `risk_acceptance` | `skills/05-asvs-level2-assessment.md` | `risk_acceptance_app` | `app_map` complete |
| `overview_report` | `skills/12-security-overview-report.md` | `basic_webapp` | All assessments complete |

---

## CLI Reference

| Command | Description |
|---------|-------------|
| `python run_tests.py --python` | Run all Python unit tests (fully automated) |
| `python run_tests.py --prepare --skill <key> --fixture <name>` | Prepare fixture working directory for skill invocation |
| `python run_tests.py --check --skill <key> --fixture <name>` | Validate skill output against assertion YAML files |
| `python run_tests.py --all --fixture <name>` | Run all check phases for a fixture (after all skills have been run) |
| `python run_tests.py --status` | Show skill version vs. assertion YAML version for all skills |
| `python run_tests.py --diff --skill <key> --fixture <name>` | Show diff between current output and last accepted baseline |
| `python run_tests.py --accept --skill <key> --fixture <name>` | Accept current output as new baseline (updates assertion YAML) |
| `python run_tests.py --lint-assertions` | Validate assertion YAML files against the assertion schema |
| `python run_tests.py --list` | List all registered skills / fixtures / assertion files |

---

## Fixture Overview

### `basic_webapp`

A organizational Employee Directory application (TypeScript/Express/SQLite) with:
- 24 intentional security vulnerabilities distributed across all ASVS chapters,
  CAS domains, and threat model scenarios
- 14 intentional pass controls to verify the assessments do not over-report
- Realistic Protected A data classification (employee names, internal IDs)
- Standard organizational authentication via Enterprise IdP JWT (e.g. MS Entra ID)

Use this fixture to validate: `app_map`, `threat_model`, `asvs`, `cas`,
`kill_chain`, `overview_report`.

### `risk_acceptance_app`

A small Node.js application with a pre-populated `.ai/blueteam/data/risk_acceptances.json`
register containing entries in all four states (`active`, `pending`, `expired`,
`withdrawn`). The source code contains the corresponding `// RISK_ACCEPTED: RA-NNN`
inline markers.

Subsumed from `risk_acceptance_tests.zip`: that file is now superseded by this
test suite. Use this fixture to validate: `risk_acceptance` (run `asvs` skill
against this fixture).

---

## Understanding Results

### Failure categories

| Category | Meaning | Action required |
|----------|---------|----------------|
| `STABLE` | A guaranteed output (file created, ID format, required field) was not found | Investigate skill regression; do not accept without root cause analysis |
| `STRUCTURAL` | A section heading, panel ID, or required report section is absent | Check if the skill was refactored; update assertion YAML if intentional |
| `BEHAVIORAL` | An expected finding was not detected, or an unexpected finding was detected | Review skill output; determine if the finding is genuinely missing or the assertion needs updating |

### Exit codes

| Code | Meaning |
|------|---------|
| `0` | All assertions passed |
| `1` | One or more STABLE assertions failed |
| `2` | One or more STRUCTURAL assertions failed (no STABLE failures) |
| `3` | One or more BEHAVIORAL assertions failed (no STABLE/STRUCTURAL failures) |
| `10` | Configuration error (unknown skill key, missing fixture, etc.) |

---

## CI/CD Integration

The `--check` phase (checking artifact outputs against assertion YAML files) is
fully CI-compatible: it reads files from disk and performs deterministic
assertions with no Claude invocation.

The `--python` phase (unit tests) is also fully automated and CI-compatible.

**TODO: Full CI pipeline integration (skill invocation automation) is a future
enhancement.** The `--prepare` and skill invocation steps currently require
manual Claude session interaction. Automating these steps via the Claude API or
Claude Code CLI is planned but not yet implemented.

---

## Project Structure

```
tests/
├── README.md                    # This file
├── MAINTENANCE.md               # Maintenance and update procedures
├── CHANGELOG.md                 # Test suite version history
├── ASSERTION_AUTHORING.md       # Reference guide for writing assertion YAML files
├── requirements.txt             # Python test dependencies
│
├── schemas/                     # JSON Schema (draft-07) files for artifact validation
│   ├── application_map.schema.json
│   ├── security_requirements.schema.json
│   ├── code_changes.schema.json
│   ├── kill_chains.schema.json
│   ├── verification_tests.schema.json
│   ├── environment_assumptions.schema.json
│   └── risk_register.schema.json
│
├── unit/                        # Python unit tests (pytest)
│   ├── __init__.py
│   ├── test_generate_report_html.py          # Tests for scripts/generate_report_html.py
│   ├── test_generate_overview_html.py        # Tests for scripts/generate_overview_html.py
│   ├── test_generate_requirements_report.py  # Tests for scripts/generate_requirements_report.py
│   ├── test_generate_code_changes_report.py  # Tests for scripts/generate_code_changes_report.py
│   ├── test_validate_reports.py              # Tests for scripts/validate_reports.py
│   └── test_check_skill_coverage.py         # Tests for scripts/check_skill_coverage.py
│
├── integration/                 # Skill integration test infrastructure
│   ├── __init__.py
│   ├── checker.py               # Assertion YAML evaluator
│   └── assertions/              # Per-skill assertion YAML files
│       ├── app_map.assertions.yaml
│       ├── threat_model.assertions.yaml
│       ├── asvs.assertions.yaml
│       ├── cas.assertions.yaml
│       ├── kill_chain.assertions.yaml
│       ├── risk_acceptance.assertions.yaml
│       └── overview_report.assertions.yaml
│
├── fixtures/                    # Test fixture source code
│   ├── basic_webapp/            # organizational Employee Directory (24 vulns, 14 pass controls)
│   │   ├── FIXTURE_MANIFEST.md  # Intentional vulnerability/control inventory
│   │   └── src/                 # Application source code
│   └── risk_acceptance_app/     # Risk acceptance test harness (13 TCs)
│       ├── FIXTURE_MANIFEST.md
│       └── src/
│
└── golden/                      # Accepted baseline artifacts for diff/accept workflow
    ├── basic_webapp/
    │   └── .ai/                 # Last-accepted .ai/ output for basic_webapp fixture
    └── risk_acceptance_app/
        └── .ai/
```
