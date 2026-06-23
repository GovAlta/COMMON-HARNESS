# eval_framework

Reusable evaluation framework for security pipeline agent deliverables. Supports both objective (deterministic) and subjective (LLM-as-judge) evaluation.

## Quick Start

```bash
# Evaluate a code-analysis deliverable (objective + subjective)
.venv/bin/python -m eval_framework code-analysis deliverables/code_analysis_deliverable_myapp.md \
    --target /path/to/target/codebase

# Objective only (fast, no LLM cost)
.venv/bin/python -m eval_framework code-analysis deliverables/code_analysis_deliverable_myapp.md \
    --skip-subjective

# Custom judge model and output path
.venv/bin/python -m eval_framework code-analysis deliverables/code_analysis_deliverable_myapp.md \
    --judge-model claude-opus-4-6 --output my_eval.json

# List available agents
.venv/bin/python -m eval_framework --help
```

The backward-compatible shim also works:

```bash
.venv/bin/python eval_code_analysis.py deliverables/code_analysis_deliverable_myapp.md --target /path/to/codebase
```

## CLI Options

| Option | Description |
|---|---|
| `<agent>` | Agent name (e.g. `code-analysis`) |
| `<deliverable>` | Path to the deliverable file (Markdown or JSON) |
| `--target PATH` | Target codebase directory (enables file-path existence checks) |
| `--skip-subjective` | Skip the LLM judge, run objective checks only |
| `--judge-model MODEL` | Override the judge model (default per agent, usually `claude-sonnet-4-6`) |
| `--output, -o PATH` | Output path for the JSON eval report (auto-generated if omitted) |

## Pipeline Integration

Call `run_eval()` directly after an agent produces its deliverable:

```python
from eval_framework import run_eval

# Inside your async pipeline
eval_report = await run_eval(
    agent_name='code-analysis',
    deliverable_path='deliverables/code_analysis_deliverable_myapp.md',
    target_path='/path/to/target/codebase',
    skip_subjective=False,
)

print(eval_report.overall_score)  # 0-100
print(eval_report.agent_name)     # 'code-analysis'
```

## Package Structure

```
eval_framework/
  __init__.py          # Public API exports, triggers agent registration
  types.py             # CheckResult, EvalReport, EvalContext
  parsing.py           # parse_sections(), extract_file_paths(), extract_endpoints(), count_term_hits()
  filetree.py          # build_suffix_index(), path_in_index()
  scoring.py           # compute_scores(), grade(), build_report(), report_to_dict(), print_report()
  subjective.py        # SubjectiveEvaluator, _try_parse_json()
  runner.py            # run_eval() orchestrator, CLI helpers
  __main__.py          # python -m eval_framework <agent> <deliverable> [options]
  agents/
    __init__.py        # AgentEvalConfig dataclass, register/get/list registry
    code_analysis.py   # Config + checks for CODE-ANALYSIS agent
```

## Adding a New Agent Evaluation

Each agent eval is a single file in `eval_framework/agents/`. No base classes to subclass; just define a config plus check functions and judge prompts.

### 1. Create the agent file

```python
# eval_framework/agents/sast_analysis.py
from __future__ import annotations

import re

from ..types import CheckResult, EvalContext
from ..parsing import extract_file_paths, count_term_hits
from . import AgentEvalConfig, register_agent

# ── Constants (what this agent's deliverable should contain) ─────────

EXPECTED_SECTIONS = {
    'executive_summary': ['executive summary'],
    'scan_config':       ['scan configuration'],
    'p1_p2_findings':    ['critical', 'high priority', 'p1', 'p2'],
    'p3_table':          ['medium', 'p3'],
    'false_positive_log': ['false positive'],
    'tool_log':          ['tool execution', 'tool log'],
    'next_steps':        ['next steps', 'recommendation'],
}

REQUIRED_SECTION_KEYS = ['executive_summary', 'scan_config', 'p1_p2_findings']


# ── Check functions ──────────────────────────────────────────────────
# Signature: (ctx: EvalContext) -> list[CheckResult]

def check_sections_present(ctx: EvalContext) -> list[CheckResult]:
    found = set(ctx.sections.keys())
    expected = set(EXPECTED_SECTIONS.keys())
    missing = expected - found
    score = len(found) / len(expected) if expected else 0
    return [CheckResult(
        name='sections_present',
        passed=not any(s in missing for s in REQUIRED_SECTION_KEYS),
        score=score,
        details=f'{len(found)}/{len(expected)} sections found.',
        category='objective',
        suggestions=[f'Missing: {s}' for s in missing],
    )]


def check_cwe_mapping(ctx: EvalContext) -> list[CheckResult]:
    """P1/P2 findings should reference CWE IDs."""
    body = ctx.sections.get('p1_p2_findings', '')
    cwes = re.findall(r'CWE-\d{1,4}', body)
    score = min(1.0, len(cwes) / 3) if body else 0.0
    return [CheckResult(
        name='cwe_mapping',
        passed=len(cwes) >= 1,
        score=score,
        details=f'{len(cwes)} CWE reference(s) found in P1/P2 findings.',
        category='objective',
    )]


def check_tool_execution_log(ctx: EvalContext) -> list[CheckResult]:
    """Tool execution log should document commands and exit codes."""
    body = ctx.sections.get('tool_log', '')
    has_commands = bool(re.search(r'(semgrep|bandit|eslint|gosec|brakeman)', body, re.I))
    has_exit_codes = bool(re.search(r'exit.code|return.code|status', body, re.I))
    score = 0.5 * has_commands + 0.5 * has_exit_codes
    return [CheckResult(
        name='tool_execution_log',
        passed=score >= 0.5,
        score=score,
        details=f'Commands: {"yes" if has_commands else "no"}, '
                f'exit codes: {"yes" if has_exit_codes else "no"}.',
        category='objective',
    )]


# ── Judge configuration ──────────────────────────────────────────────

JUDGE_SYSTEM_PROMPT = """\
You are a senior application security engineer evaluating the output of an
automated SAST analysis agent. Evaluate honestly and critically.
"""

JUDGE_CRITERIA_PROMPT = """\
1. **Finding Quality** (max 5): Specific CWE mapping, code snippets, file+line refs?
2. **Triage Accuracy** (max 5): Reasonable severity? False positives documented?
3. **Tool Coverage** (max 5): Appropriate tools used and documented?
4. **Actionability** (max 5): Could a developer fix each finding from the info provided?
"""


# ── Registration ─────────────────────────────────────────────────────

register_agent(AgentEvalConfig(
    agent_name='sast',
    display_name='SAST ANALYSIS',
    deliverable_format='markdown',
    expected_sections=EXPECTED_SECTIONS,
    required_section_keys=REQUIRED_SECTION_KEYS,
    objective_checks_markdown=[
        check_sections_present,
        check_cwe_mapping,
        check_tool_execution_log,
    ],
    judge_system_prompt=JUDGE_SYSTEM_PROMPT,
    judge_criteria_prompt=JUDGE_CRITERIA_PROMPT,
))
```

### 2. Register it in the package

Add the import to both `eval_framework/__init__.py` and `eval_framework/__main__.py`:

```python
from .agents import sast_analysis as _sast_analysis  # noqa: F401
```

### 3. Run it

```bash
.venv/bin/python -m eval_framework sast deliverables/sast_analysis_deliverable_myapp.md --skip-subjective
```

## Check Function Pattern

Every check function has the same signature:

```python
def check_something(ctx: EvalContext) -> list[CheckResult]:
```

`EvalContext` provides all pre-parsed deliverable data:

| Field | Type | Description |
|---|---|---|
| `ctx.raw_content` | `str` | Full deliverable text |
| `ctx.sections` | `dict[str, str]` | Matched sections (keyed by your `expected_sections` keys) |
| `ctx.raw_sections` | `dict[str, str]` | All headings found (keyed by raw heading text) |
| `ctx.json_data` | `dict \| None` | Parsed JSON (for JSON deliverables) |
| `ctx.target_path` | `str \| None` | Target codebase path (if `--target` provided) |
| `ctx.suffix_index` | `set[str] \| None` | File-tree suffix index (if target provided) |
| `ctx.fmt` | `str` | `'markdown'` or `'json'` |

Return one or more `CheckResult` per function. Most return exactly one. Return an empty list to silently skip a check (for example, when `--target` wasn't provided).

## Shared Utilities

Available from `eval_framework` or their respective modules:

```python
from eval_framework import (
    # Text parsing
    parse_sections,        # (content, expected_sections) -> (mapped, raw)
    extract_file_paths,    # (text) -> set[str]
    extract_endpoints,     # (text) -> list[(method, route)]
    count_term_hits,       # (text, terms) -> int

    # File tree validation
    build_suffix_index,    # (target_path) -> set[str]
    path_in_index,         # (ref_path, suffix_index) -> bool

    # Scoring
    compute_scores,        # (checks, obj_weight, subj_weight) -> (obj, subj, overall)
    grade,                 # (score) -> 'EXCELLENT' | 'GOOD' | ...
)
```

## Scoring

- Each check produces a score on a 0.0 to 1.0 scale
- Objective and subjective scores are averaged separately, then weighted:
  - Default: 40% objective + 60% subjective
  - Configurable per agent via `objective_weight` / `subjective_weight`
  - When subjective is skipped, overall = objective score
- Grade thresholds: EXCELLENT (90+), GOOD (75+), ADEQUATE (60+), NEEDS IMPROVEMENT (40+), POOR (<40)

## History Tracking

Track evaluation scores across runs to measure iteration progress.

### View history for an agent

```bash
.venv/bin/python -m eval_framework history code-analysis
```

```
CODE ANALYSIS; Evaluation History (5 runs)

  #  Timestamp           Hash      Obj   Subj  Overall  Grade              Delta
  -------------------------------------------------------------------------------
  1  2026-02-27 13:02: 94.8: 94.8   EXCELLENT            —
  2  2026-02-27 13:10: 94.8: 94.8   EXCELLENT          +0.0
  3  2026-02-27 13:25: 94.8  96.7    95.9   EXCELLENT          +1.1
  4  2026-02-27 13:39: 97.6  96.7    97.1   EXCELLENT          +1.1
  5  2026-02-27 15:41    a0ee99eb  97.6: 97.6   EXCELLENT          +0.5

  Best: #4 (97.1)  Worst: #1 (94.8)  Trend: +2.8 over 5 runs
```

The `Hash` column is a short SHA-256 of the deliverable content. Same hash = same deliverable re-evaluated. Different hash = the agent was re-run and produced new output.

### Compare two runs

```bash
.venv/bin/python -m eval_framework history code-analysis --compare 1 5
```

Shows per-check score deltas between two runs. It marks the largest improvement and the largest regression.

### Per-check trends

```bash
.venv/bin/python -m eval_framework history code-analysis --checks
```

Shows every check's score across all runs with trend indicators (improving/declining/stable).

### All agents summary

```bash
.venv/bin/python -m eval_framework history
```

Shows a one-line summary per agent: run count, latest score, latest grade, and overall trend.

### History options

| Option | Description |
|---|---|
| `history [agent]` | Show history table (omit agent for all-agents summary) |
| `--dir PATH` | Directory containing eval reports (default: `deliverables/`) |
| `--compare A B` | Compare two runs by number (e.g. `--compare 1 3`) |
| `--checks` | Show per-check score trends across all runs |

## Output Format

The JSON eval report saved to disk:

```json
{
  "agent_name": "code-analysis",
  "deliverable_path": "deliverables/code_analysis_deliverable_myapp.md",
  "target_path": "myapp",
  "timestamp": "2026-02-27T15:06:05.812137",
  "detected_format": "markdown",
  "scores": {
    "objective": 97.6,
    "subjective": null,
    "overall": 97.6
  },
  "grade": "EXCELLENT",
  "summary": "Grade: EXCELLENT (97.6/100). Objective: 97.6/100.",
  "checks": [
    {
      "name": "sections_present",
      "category": "objective",
      "passed": true,
      "score": 1.0,
      "details": "10/10 sections found.",
      "suggestions": []
    }
  ],
  "raw_judge_output": null,
  "deliverable_hash": "a0ee99eb",
  "config_snapshot": {
    "objective_weight": 0.4,
    "subjective_weight": 0.6,
    "judge_model": "claude-sonnet-4-6",
    "skip_subjective": false
  }
}
```
