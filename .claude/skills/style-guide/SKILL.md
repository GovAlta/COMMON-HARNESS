---
name: style-guide
description: "Audit prose for the 12 hard rules of the harness writing style guide. Detects AI-tells (Not-X-but-Y patterns, em-dashes, tetracolons, cinematic short-sentence runs, rhetorical anchors, banned vocabulary, ensure-as-hedge, vague intensifiers, sentence-end participials, three-item rule-of-three flourishes, emoji/decoration noise, AI smell) and proposes rewrites. Use /style-guide <path-or-glob> for files, or invoke against the current draft. Auto-load when writing any user-facing prose."
user-invocable: true
---

# /style-guide: Prose Style Audit

Audit a written deliverable against the harness writing style guide. The
guide is short, enforceable, and built from real examples of what to avoid.
Every rule is a rejection criterion: if a sentence violates a rule, rewrite
it.

## Usage

```
/style-guide <path>              # Audit a single file
/style-guide "docs/**/*.md"      # Glob of files
/style-guide                     # Audit the active chat draft / last message
```

## How the audit works

The skill runs a two-pass review:

1. **Mechanical pre-pass**: `scripts/style-scan.mjs` greps the target text
   for regex signatures of the 12 hard rules (em-dashes, "Not X, but Y",
   banned vocabulary, sentence openers like `Moreover` / `Furthermore`,
   tetracolons, vague intensifiers, sentence-end participials, emoji /
   decoration). The script emits a JSON list of suspect lines.
2. **Judgement pass**: the skill reads the suspect lines plus surrounding
   context, decides which are real violations (vs. legitimate uses), and
   produces a rewrite for each. Catches violations the regex pre-pass
   missed by reading the whole document.

Output is a structured report: one entry per violation with the rule name,
the offending sentence quoted, the file:line reference, and a proposed
rewrite.

## The 12 rules (full text in `style-rules.md`)

1. **No "this is not A, but B" constructions**: the single most reliable signal of AI-generated prose.
2. **No em dashes or long dashes**: use commas, periods, parentheses, colons. Split into two sentences if needed.
3. **No rhetorical tetracolons**: four-part parallel listings used for rhythm. Convert to ordinary prose.
4. **No cinematic short-sentence flourishes**: runs of two or three short declarative sentences for dramatic effect.
5. **No "is the moment" or "is where" rhetorical anchors**.
6. **Banned vocabulary**: leverage (verb), unlock, robust, seamless, crucial, essential, holistic, intricate, comprehensive, significant, interlocking, tee up, navigate (metaphor), tapestry, landscape (metaphor), ecosystem (non-bio), realm, paradigm, synergy, journey (metaphor), fabric (metaphor), game-changing, cutting-edge, world-class, best-in-class, next-generation. Sentence openers: Moreover, Furthermore, In essence, At its core, Fundamentally, In today's world.
7. **No three-item lists used as rhetorical flourish**: the rule-of-three when only two items genuinely apply.
8. **No participial sentence-end flourishes**: a comma plus an -ing phrase that restates the sentence.
9. **No "ensure" when "make" or a direct verb works**: "Ensure" is a hedge.
10. **No vague intensifiers**: very, really, truly, deeply, profoundly, incredibly, extremely, particularly, notably, importantly.
11. **No decorations**: no emojis, icons, or unrequested decorators in documentation, code, READMEs, or UI.
12. **No AI smell**: no sycophantic praise, no over-explanation, no recap loops, no "as we will see below".

## When to invoke automatically

This skill SHOULD be invoked (without the user asking) before producing:
- READMEs
- Documentation pages
- Release notes
- Training material
- Marketing or external-facing copy
- ADRs / architecture decisions
- Any commit message intended for a non-internal audience

When invoked automatically, run only the mechanical pre-pass and surface
any HIGH-confidence violations inline before producing the final draft.
Full audit (with rewrites) only when the user invokes `/style-guide`
explicitly.

## Output format

```
style-guide audit: <path>
────────────────────────────────────────────────────
  N violations across M rules.

Rule 1 (Not-X-but-Y)   path:line
  > "<offending sentence>"
  Rewrite: "<proposed plain-language replacement>"

Rule 2 (em-dash)       path:line
  > "<offending sentence>"
  Rewrite: "<proposed replacement>"

...

Quick test:
  □ Read the draft aloud. Does any sentence sound like a movie trailer,
    a TED talk opening, or a LinkedIn post? Rewrite it.
```

## What this skill should NOT do

- Don't soften the rules. The style is direct and declarative; don't
  recommend "you might consider" rewrites.
- Don't add emojis to the report (Rule 11 applies to the audit itself).
- Don't tetracolon-summarize at the bottom of the report.
- Don't recap the rules at the end; the violations table already does that.
- Don't preserve a sentence "because it sounds good"; if it works only
  through rhythm, it is the wrong sentence.

## Reference

Full rule text and reviewer checklist: `style-rules.md` (in this skill dir).
Source of truth: `writing-style-guide.md` at the harness root.
