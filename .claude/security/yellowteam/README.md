# Yellow Team: AI-Smell Review

Deterministic style-integrity audit. Mirrors blueteam (defensive) /
redteam (offensive) / greenteam (code quality). Yellowteam catches the
patterns that mark prose as AI-generated and produces an **AI Smells
Report** with per-file findings (severity + concrete rewrites for each).

The 12 hard rules from `.claude/skills/style-guide/style-rules.md`:

1. No "this is not A, but B" constructions (the strongest AI tell)
2. No em dashes
3. No rhetorical tetracolons
4. No cinematic short-sentence flourishes
5. No "is the moment" or "is where" rhetorical anchors
6. No banned vocabulary (the list is in the style guide)
7. No three-item lists used as rhetorical flourish
8. No participial sentence-end flourishes
9. No "ensure" when "make" or a direct verb works
10. No vague intensifiers (the list is in the style guide)
11. No decorations (emojis, unrequested icons)
12. No AI smell (sycophantic, recap loops, hedge stacks)

## Quick start

```bash
cd .claude/security/yellowteam
node pipeline/run_all.js --target /path/to/repo --verbose
node scripts/report_generator.js
node scripts/validate_report.js
```

Output in `deliverables/`:

- `yellowteam_findings.json`; canonical
- `yellowteam_findings.md`; human-readable
- `yellowteam_findings.html`; AI Smells Report (browsable)
- `per-scanner/rule*.json`; raw per-rule output

## Layout

```
yellowteam/
├── CLAUDE.md             # mandatory execution protocol
├── README.md             # this file
├── package.json          # zero deps; pure Node 20+
├── pipeline/
│   ├── run_all.js        # orchestrator: drive every rule scanner
│   ├── output_schemas.js # Finding shape + RULES catalogue
│   └── walker.js         # shared file walk + prose-segment extraction
├── skills/               # AI-driven judgement agents (read deterministic output, decide real-vs-noise)
├── scripts/
│   ├── rule01..rule12_*.js   # 12 per-rule scanners
│   ├── report_generator.js
│   └── validate_report.js
└── deliverables/         # JSON + MD + HTML output
```

## Severity scale

`HIGH | MEDIUM | LOW | INFO`. No CRITICAL; worst-case AI prose is a
credibility risk, not a security risk. See `CLAUDE.md` for the rule-by-rule
default-severity table.

## Scope flags

- `--scope all`   (default); every prose-bearing file (`.md`, `.txt`, `.rst`, source comments)
- `--scope prose`; only Markdown / docs / README / textual files; skip source code
- `--scope code`: only source files (audits docstrings + block comments)

## When to invoke

| Situation | Run |
|---|---|
| Before publishing a README, ADR, release notes, training material | `/yellowteam` (prose scope) |
| Pre-commit style check on docs | `--scope prose` on changed files |
| Periodic codebase prose audit | `/yellowteam` (all scope) |
| Comment quality on a Go / Java module | `--scope code` |

## Cross-references

- Blueteam: `.claude/security/blueteam/`; defensive security
- Redteam: `.claude/security/redteam/`; offensive security
- Greenteam: `.claude/security/greenteam/`; code-quality multi-round review
- Style guide skill (interactive, single-file): `.claude/skills/style-guide/` —
  good for one-off "check this draft" use; yellowteam is the heavier batch
  audit with per-target deliverables.
