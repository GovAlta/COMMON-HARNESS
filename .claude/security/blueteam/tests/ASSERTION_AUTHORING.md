# Assertion Authoring Reference Guide

This document is the canonical reference for writing and maintaining assertion
YAML files in `tests/integration/assertions/`. Read this before creating a new
assertion file or adding assertions to an existing one.

---

## File Header Fields

Every assertion YAML file must begin with a header block. All four fields are
required.

```yaml
skill_version: "1.2.0"
last_validated: "2026-03-05"
fixture: basic_webapp
description: "ASVS Level 2 assessment against the organizational Employee Directory fixture: verifies artifact creation, report structure, and detection of the 24 intentional vulnerabilities."
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `skill_version` | string | Yes | Must match the `version:` front-matter field in the skill's `.md` file. Used by `--status` to detect drift. |
| `last_validated` | string (ISO date) | Yes | Date the assertion file was last reviewed against actual skill output. Update whenever you run `--accept` or manually review. |
| `fixture` | string | Yes | Key of the fixture this assertion set targets (e.g., `basic_webapp`, `risk_acceptance_app`). |
| `description` | string | Yes | One sentence describing the scope of this assertion file. |

---

## Assertion ID Conventions

Each assertion entry must have a unique `id` field. Use the format:

```
<SKILL>-<CATEGORY_CODE>-<NN>
```

Where:
- `<SKILL>` is the skill key (e.g., `ASVS`, `TM`, `CAS`, `KC`, `RA`, `OV`, `AM`)
- `<CATEGORY_CODE>` is one of the codes in the table below
- `<NN>` is a two-digit sequential number within that skill+category combination

### Category codes

| Code | Category | Example ID |
|------|----------|------------|
| `OUT` | Output artifacts (file creation, file existence) | `ASVS-OUT-01` |
| `RPT` | Report structure (section headings, panel IDs, MD headings) | `ASVS-RPT-01` |
| `BEH` | Behavioral (finding detection, non-suppressible findings) | `ASVS-BEH-01` |
| `ID` | ID format validation (SR-NNN, CC-NNN, KC-NNN patterns) | `ASVS-ID-01` |
| `CNT` | Count assertions (minimum number of entries) | `ASVS-CNT-01` |
| `STR` | Structural (JSON field presence, schema compliance) | `ASVS-STR-01` |

---

## Categories

### STABLE

STABLE assertions cover invariant outputs: things that MUST always be true
regardless of AI variation. If a STABLE assertion fails, it indicates a genuine
skill regression, not normal output variation.

Use STABLE for:
- File existence checks (does `code_changes.json` exist after the skill runs?)
- ID format checks (do all entries have IDs matching `SR-\d+`?)
- Required JSON field presence (is `schema_version` present?)
- Schema compliance (does the file parse as valid JSON matching the schema?)
- Non-suppressible finding categories that must always be reported

Example:
```yaml
- id: ASVS-OUT-01
  category: STABLE
  type: file_exists
  path: ".ai/blueteam/data/code_changes.json"
  description: "ASVS skill must write code_changes.json"
```

### STRUCTURAL

STRUCTURAL assertions cover report structure: section headings, panel IDs,
required sections in Markdown reports. These should be stable across skill
runs but may need updating if the skill is intentionally refactored.

Use STRUCTURAL for:
- Markdown H2/H3 headings that must be present in reports
- HTML panel IDs in the security overview SPA
- Required sub-sections within a report (e.g., Executive Summary)
- The presence of kill chain sections when chains are expected

Example:
```yaml
- id: ASVS-RPT-01
  category: STRUCTURAL
  type: section_present
  file: ".ai/blueteam/reports/asvs_level2_security_assessment.md"
  heading: "Executive Summary"
  description: "ASVS report must have an Executive Summary section"
```

### BEHAVIORAL

BEHAVIORAL assertions cover detection quality: whether the skill identifies
specific vulnerabilities in the fixture, flags non-suppressible findings, and
produces kill chains for known attack paths. These assertions are the most
valuable for regression detection but may need occasional tuning as skill
output format evolves.

Use BEHAVIORAL for:
- Asserting that a known vulnerability in the fixture is reported as a finding
- Asserting that non-suppressible categories are always reported (even with RA entries)
- Asserting that a specific kill chain is identified (by tactic sequence or name fragment)
- Asserting that a fixture's intentional pass controls do NOT generate findings

Example:
```yaml
- id: ASVS-BEH-01
  category: BEHAVIORAL
  type: text_present
  file: ".ai/blueteam/reports/asvs_level2_security_assessment.md"
  patterns:
    - "SQL injection"
    - "parameterized"
  case_insensitive: true
  description: "ASVS skill must detect the SQL injection vulnerability in src/routes/search.ts"
```

---

## Assertion Types Reference

### `file_exists`

Asserts that a file exists at the given path (relative to the fixture working directory).

```yaml
- id: ASVS-OUT-01
  category: STABLE
  type: file_exists
  path: ".ai/blueteam/data/code_changes.json"
  description: "code_changes.json must be written by the ASVS skill"
```

Required fields: `path`

---

### `json_valid`

Asserts that a file is parseable as JSON and optionally validates it against a
schema from `tests/schemas/`.

```yaml
- id: ASVS-STR-01
  category: STABLE
  type: json_valid
  path: ".ai/blueteam/data/code_changes.json"
  schema: "code_changes.schema.json"
  description: "code_changes.json must be valid JSON and conform to the schema"
```

Required fields: `path`
Optional fields: `schema` (filename in `tests/schemas/`; omit to skip schema validation)

---

### `json_field_present`

Asserts that a dot-notation field path is present in a JSON file and is non-null /
non-empty.

```yaml
- id: ASVS-STR-02
  category: STABLE
  type: json_field_present
  path: ".ai/blueteam/data/code_changes.json"
  field: "schema_version"
  description: "code_changes.json must have a schema_version field"
```

Required fields: `path`, `field`

Array indexing is supported via `[0]` notation: `changes[0].id`

---

### `json_id_format`

Asserts that all entries in a JSON array have IDs matching a given regular
expression. This is the canonical way to verify ID sequencing conventions.

```yaml
- id: ASVS-ID-01
  category: STABLE
  type: json_id_format
  path: ".ai/blueteam/data/code_changes.json"
  array_field: "changes"
  id_field: "id"
  pattern: "^CC-\\d{3}$"
  description: "All code change IDs must match CC-NNN format"
```

Required fields: `path`, `array_field`, `id_field`, `pattern`

---

### `json_min_count`

Asserts that a JSON array has at least `min_count` entries. Use sparingly: prefer
BEHAVIORAL assertions that assert on specific finding content rather than counts.

```yaml
- id: ASVS-CNT-01
  category: BEHAVIORAL
  type: json_min_count
  path: ".ai/blueteam/data/code_changes.json"
  array_field: "changes"
  min_count: 5
  description: "ASVS skill must produce at least 5 code changes for the basic_webapp fixture"
```

Required fields: `path`, `array_field`, `min_count`

---

### `text_present`

Asserts that all listed patterns appear in a text file. All patterns in the
`patterns` list must be present (AND logic). Use `case_insensitive: true`
for finding descriptions that may vary in capitalization.

```yaml
- id: ASVS-BEH-01
  category: BEHAVIORAL
  type: text_present
  file: ".ai/blueteam/reports/asvs_level2_security_assessment.md"
  patterns:
    - "SQL injection"
    - "search"
  case_insensitive: true
  description: "ASVS must detect SQL injection in the search route"
```

Required fields: `file`, `patterns` (list with at least one entry)
Optional fields: `case_insensitive` (default: false)

---

### `text_absent`

Asserts that a pattern does NOT appear in a text file. Use for pass-control
assertions (known-good code should not generate findings) and for verifying
that non-suppressible findings are not suppressed.

```yaml
- id: ASVS-BEH-15
  category: BEHAVIORAL
  type: text_absent
  file: ".ai/blueteam/reports/asvs_level2_security_assessment.md"
  pattern: "SUPPRESSION_REJECTED"
  description: "No suppression rejections expected for standard findings in basic_webapp"
```

Required fields: `file`, `pattern`
Optional fields: `case_insensitive` (default: false)

---

### `section_present`

Asserts that a section heading (H2 or H3) containing the given text is present
in a Markdown report file. Matching is fuzzy (substring, case-insensitive) to
tolerate minor heading wording changes.

```yaml
- id: ASVS-RPT-02
  category: STRUCTURAL
  type: section_present
  file: ".ai/blueteam/reports/asvs_level2_security_assessment.md"
  heading: "Attack Chains"
  description: "ASVS report must include an Attack Chains section (Phase 3b)"
```

Required fields: `file`, `heading`

---

### `schema_valid`

Validates a JSON artifact against one of the JSON Schema files in `tests/schemas/`.
This is the most thorough STABLE assertion for artifact correctness.

```yaml
- id: AM-STR-01
  category: STABLE
  type: schema_valid
  path: ".ai/blueteam/data/application_map.json"
  schema: "application_map.schema.json"
  description: "application_map.json must conform to the application_map schema"
```

Required fields: `path`, `schema`

---

## Pattern Matching Tips

### Multiple patterns (AND logic)

When using `text_present` with multiple patterns, ALL patterns must match.
This is useful for asserting on a specific finding that is identified by two
co-occurring terms:

```yaml
patterns:
  - "JWT"
  - "algorithm"
  - "none"
```

This asserts the report mentions JWT algorithm confusion (all three terms present).
Do not use this to assert that terms appear near each other: the checker only
verifies each pattern appears somewhere in the file.

### Case-insensitive matching

Always use `case_insensitive: true` for BEHAVIORAL assertions on finding content.
Skill output varies in capitalization ("SQL injection" vs "SQL Injection" vs
"sql injection") and this flag avoids false negatives.

```yaml
case_insensitive: true
```

### `section_present` fuzzy heading match

The `section_present` type uses a case-insensitive substring match on heading
text. This means `heading: "Authentication"` will match any of:
- `## V2 Authentication`
- `## Authentication Findings`
- `## AUTHENTICATION AND SESSION MANAGEMENT`

Keep headings specific enough to avoid false positives.

---

## Common Patterns

### Artifact file creation (use STABLE)

```yaml
- id: SKILL-OUT-01
  category: STABLE
  type: file_exists
  path: ".ai/blueteam/data/code_changes.json"
  description: "Skill must write code_changes.json"
```

### JSON ID format check (use STABLE)

```yaml
- id: SKILL-ID-01
  category: STABLE
  type: json_id_format
  path: ".ai/blueteam/data/security_requirements.json"
  array_field: "requirements"
  id_field: "id"
  pattern: "^SR-\\d+$"
  description: "All security requirement IDs must match SR-NNN format"
```

### Finding detected (use BEHAVIORAL with case_insensitive true)

```yaml
- id: SKILL-BEH-01
  category: BEHAVIORAL
  type: text_present
  file: ".ai/blueteam/reports/assessment_report.md"
  patterns:
    - "hardcoded secret"
    - "JWT_SECRET"
  case_insensitive: true
  description: "Skill must detect hardcoded JWT secret in src/config/index.ts"
```

### Section present (use STRUCTURAL)

```yaml
- id: SKILL-RPT-01
  category: STRUCTURAL
  type: section_present
  file: ".ai/blueteam/reports/assessment_report.md"
  heading: "Executive Summary"
  description: "Report must include an Executive Summary section"
```

---

## What NOT to Assert

Avoid the following in assertion files, as they lead to brittle tests that fail
on every skill run due to non-deterministic output:

- **Exact finding descriptions**: AI generates slightly different prose each
  run. Use pattern matching on key terms instead.
- **Exact line numbers**: Source code line numbers change with every edit.
  Assert on file paths and function/symbol names instead.
- **Specific DREAD or risk scores**: Numeric scores vary between runs. Assert
  on the overall severity category (critical/high/medium/low) or the presence
  of a score range instead.
- **Exact SR-NNN or CC-NNN ID assignments**: IDs are allocated sequentially
  and will shift when new findings are added. Assert on ID format and count,
  not on specific ID values.
- **Exact date or timestamp strings**: Use `last_updated` field presence
  assertions, not value assertions.
- **Markdown heading punctuation**: Headings may gain or lose trailing colons,
  em-dashes, or emoji. Use fuzzy `section_present` matching.
