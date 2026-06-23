# Yellow Team AI-Smell Review: Mandatory Execution Protocol

This directory is the yellowteam framework: a deterministic AI-prose smell
audit modeled on the 12 hard rules in
`.claude/skills/style-guide/style-rules.md`. It is the third of three review
frameworks: blueteam (defensive security), redteam (offensive security),
greenteam (code quality), yellowteam (writing-style integrity).

Yellowteam catches the patterns that mark a document as AI-generated:
"Not X, but Y" constructions, em dashes, rhetorical tetracolons, cinematic
short-sentence runs, banned vocabulary, sentence-end participials,
"ensure" hedges, vague intensifiers, emoji noise, sycophantic openings,
recap loops.

Output: `<target>/.ai/yellowteam/yellowteam_findings.json` (canonical),
`yellowteam_findings.md` (human-readable), `yellowteam_findings.html`
(browsable AI Smells Report).

---

## Mandatory Dual-Analysis Protocol

Every yellowteam review MUST combine:

1. **Deterministic script execution**: the 12 rule scanners under
   `scripts/rule*.js`. Each implements one of the hard rules.
2. **AI-driven judgement pass**: the LLM reads the deterministic findings
   and decides which are real violations (rule 7 and rule 10 over-fire by
   design; some rule-6 matches are legitimate when used non-metaphorically;
   the rule-9 hedge word inside test names is fine).

The deterministic pass IS NOT sufficient on its own; it will over-fire.
The judgement pass IS NOT sufficient on its own; it will miss patterns
buried in long documents. Both are required.

---

## Setup

```bash
cd .claude/security/yellowteam && npm install   # no third-party deps; this is a no-op
```

The framework has zero npm dependencies. Pure Node 20+.

---

## Execution Order

Outputs land under `<target>/.ai/yellowteam/` so the harness
stays pristine across runs. Override with `--out-dir <path>` if needed.

```bash
# 1. Full pipeline against a target
node pipeline/run_all.js --target /path/to/repo --verbose

# 2. Limit scope to prose-only (README, .md, docs; skip code)
node pipeline/run_all.js --target /path/to/repo --scope prose

# 3. Limit scope to code (comments + docstrings only)
node pipeline/run_all.js --target /path/to/repo --scope code

# 4. Skip noisy rules (e.g. rule 7 + rule 10 over-fire on legitimate prose)
node pipeline/run_all.js --target /path/to/repo --skip rule07_rule_of_three,rule10_intensifier

# 5. Generate reports (must pass --target so it can find the JSON)
node scripts/report_generator.js --target /path/to/repo --md --html

# 6. Validate the canonical deliverable
node scripts/validate_report.js --target /path/to/repo
```

Outputs:
- `<target>/.ai/yellowteam/yellowteam_findings.json`
- `<target>/.ai/yellowteam/yellowteam_findings.md`
- `<target>/.ai/yellowteam/yellowteam_findings.html`
- `<target>/.ai/yellowteam/per-scanner/<rule>.json`

The target repo should `.gitignore` `.ai/` so scan output is never
committed.

---

## Critical Safety Rules

- **Do NOT modify the target's source files**; yellowteam is read-only.
- **Do NOT skip the judgement pass** for documents that will be published.
  The deterministic pass alone produces over-counted noise on rules 7 and 10.
- **Do NOT delete cleared findings**; keep them with `status: cleared` so
  the audit reader can see what was reviewed-and-dismissed vs. what wasn't
  reviewed at all.

---

## Scripts That MUST Run

| Script | Rule | Purpose |
|---|---|---|
| `pipeline/run_all.js` | orchestrator | Drive every rule scanner, aggregate findings, emit canonical JSON |
| `scripts/rule01_not_x_but_y.js` | 1 | "Not X, but Y" constructions |
| `scripts/rule02_em_dash.js` | 2 | Em dashes / en dashes |
| `scripts/rule03_tetracolon.js` | 3 | Rhetorical four-part parallel listings |
| `scripts/rule04_cinematic_sentences.js` | 4 | Runs of 2-3 short declarative sentences for drama |
| `scripts/rule05_rhetorical_anchor.js` | 5 | rhetorical anchors (`this`/`that` + `is` + `the moment` / `where` / `<adj> piece`) |
| `scripts/rule06_banned_vocabulary.js` | 6 | Banned words + sentence openers |
| `scripts/rule07_rule_of_three.js` | 7 | Three-item flourish lists (over-fires; LOW severity) |
| `scripts/rule08_participial_tail.js` | 8 | Sentence-end comma + -ing phrase |
| `scripts/rule09_ensure_hedge.js` | 9 | "Ensure" as a verb hedge |
| `scripts/rule10_intensifier.js` | 10 | Vague intensifiers (LOW severity) |
| `scripts/rule11_decorations_emoji.js` | 11 | Emojis, decorative ASCII art |
| `scripts/rule12_ai_smell.js` | 12 | Sycophantic openings, recap loops, hedge stacks, `as`-an-`AI` disclaimers |
| `scripts/report_generator.js` | output | JSON → MD + HTML AI Smells Report |
| `scripts/validate_report.js` | validation | Schema check on canonical deliverable |

---

## Finding Schema

Each finding carries:

```js
{
  id: "Y-R01-001",
  rule: 1,
  rule_name: "rule-1-pattern",
  severity: "HIGH",
  title: "Rule 1: negated-pivot pattern in CLAUDE.md",
  location: { file: "CLAUDE.md", line: 87 },
  match: "[negated-pivot match captured here]",
  quote: "[full quoted line goes here]",
  rewrite: "State what the thing IS. Drop the negated half...",
  why: "The negated-pivot pattern is the single most reliable AI-prose tell...",
  scanner: "rule01_not_x_but_y",
  status: "open"
}
```

ID format: `Y-R<rule>-NNN` where rule is the two-digit rule number.

Severity scale: `HIGH | MEDIUM | LOW | INFO`. No CRITICAL is used here, because even the worst AI prose is a credibility risk rather than a security risk.

Status: `open | cleared`. The judgement pass sets `cleared` when a
deterministic match is a legitimate use (e.g., "ensure" inside a Jest
`expect(...).toEqual(...)` chain).

---

## When yellowteam blocks a publication

A doc that fails yellowteam should be blocked from publication when:

- Any HIGH rule fires more than 3 times in the doc
- Any rule-1 (Not-X-but-Y) match appears in a heading or opening paragraph
- Any rule-11 (decoration / emoji) match in production / external docs

LOW findings are informational; review but don't block.

---

## Rule severities (defaults: can override per finding)

| Rule | Severity | Why |
|---|---|---|
| 1 (not-X-but-Y) | HIGH | The single most reliable AI tell |
| 2 (em dash) | MEDIUM | Strong tell but has legitimate uses |
| 3 (tetracolon) | HIGH | Almost never reads as anything but rhetorical filler |
| 4 (cinematic sentences) | MEDIUM | Sometimes effective; over-applied is suspect |
| 5 (rhetorical anchor) | HIGH | the rhetorical-anchor phrase (this/that + `is` + `the moment`) almost never reads as anything but AI |
| 6 (banned vocabulary) | MEDIUM | Individual words; cumulative effect matters |
| 7 (rule of three) | LOW | Over-fires; judgement pass required |
| 8 (participial tail) | MEDIUM | Strong tell; the trailing -ing phrase usually restates |
| 9 (hedge verb `ensure`) | MEDIUM | Over-fires in code (test assertions); judgement filters |
| 10 (vague intensifier) | LOW | Sometimes a legitimate emphasis; LOW by default |
| 11 (decoration / emoji) | HIGH | Style guide bans entirely |
| 12 (AI smell; sycophantic / recap) | MEDIUM | Various; some patterns near-certain tells |
