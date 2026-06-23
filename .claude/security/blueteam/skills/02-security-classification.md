---
id: application-data-store-security-classification
name: Application and Data Store Security Classification Skill
description: Classifies application and data-store information according to organizational information security standards and writes persistent classification artifacts.
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
  - information-security-classification-skill
upstream:
  - ref: information-security-classification-skill
    artifacts: []
outputs:
  - artifact: .ai/blueteam/data/security-classification.yaml
    format: yaml
  - artifact: .ai/blueteam/data/security-classification-details.yaml
    format: yaml
  - artifact: .ai/blueteam/reports/security-classification.md
    format: markdown
  - artifact: .ai/blueteam/reports/security-classification.html
    format: html
call_sequence_hard:
  - Must resolve declared upstream dependencies before execution, or fail fast with a dependency error.
  - Must read shared/skills/information-classification.md before any assessment step.
  - Must run Phase 0 incremental assessment check before repository exploration.
---

BEFORE proceeding, you MUST read the [shared/skills/information-classification.md] skill file and gain the associated organizational information security classification skill. If that fails: STOP. Report an error condition; this skill is required before classifying an application or data store.

## MUST COMPLY
The classification framework uses organizational security classification levels, so apply the appropriate privacy legislation for your jurisdiction and do NOT reference FOIP in any generated materials.

## Purpose
This skill enables AI agents to internally categorize and understand the security sensitivity of applications and data stores according to organizational standards. This classification informs AI reasoning and security analysis - it is NOT for modifying the application itself.

**Standards Reference:** Uses organizational information security classification framework.

**Important:** This skill is NOT intended to:
- Modify application code, UI, or data models
- Add classification labels to user interfaces
- Implement user-facing classification features

## Usage
When analyzing requirements, code, configurations, or architecture, use this skill to:
- Identify data stores (databases, caches, file systems, cloud storage)
- Assess the sensitivity level of data per organizational classification levels (Public, Protected A, Protected B, Protected C)
- Inform security recommendations and vulnerability prioritization
- Guide secure coding suggestions based on data sensitivity

**Classification Storage:** 
Save security classification summary results to `.ai/blueteam/data/security-classification.yaml` in the associated code repository for reference across AI sessions, if a repository exists. If no repository exists, save the application's overall information security classification as a requirement.

Save security classification details to `.ai/blueteam/data/security-classification-details.yaml` in the associated code repository for reference across AI sessions, if a repository exists.

## Analysis Process
When provided with application requirements, code, database schema, or other data store layout or contents, follow these steps:

## Phase 0: Incremental Assessment Check

Run this phase first, before any code exploration. It determines whether a full assessment, a
partial re-assessment, or a reuse of the existing classification is appropriate.

**Safety principle:** When in doubt, err toward re-assessment. The cost of unnecessary
re-assessment is time; the cost of a missed change is an incorrect security posture that
misleads downstream security tools and skills.

### Step 0.1: Check for existing classification files

Check whether both `.ai/blueteam/data/security-classification.yaml` and `.ai/blueteam/data/security-classification-details.yaml`
exist in the repository.

- **If neither exists**: set mode = `FULL`. Skip to Phase 1.
- **If only one exists**: set mode = `FULL` (inconsistent state). Skip to Phase 1.
- **If both exist**: continue to Step 0.2.

### Step 0.2: Check for assessment metadata

Read `.ai/blueteam/data/security-classification-details.yaml`. Check whether each data store entry contains
an `assessment_metadata.last_assessed_commit` field.

- **If any store is missing `assessment_metadata`** (file predates this feature):
  set mode = `FULL`. Note: "Existing classification predates incremental assessment support; running full assessment." Skip to Phase 1.
- **If all stores have `assessment_metadata`**: continue to Step 0.3.

### Step 0.3: Determine changed files via git

Find the oldest `last_assessed_commit` across all data stores (use the minimum as the
baseline; if stores were assessed at different times, use the earliest).

Run: `git diff --name-only <baseline_commit>..HEAD`

- **If git is unavailable**: set mode = `FULL`. Note: "Git unavailable; cannot determine
  changes. Running full assessment." Skip to Phase 1.
- **If the commit is not found in history** (e.g., shallow clone, rebased history):
  set mode = `FULL`. Note: "Baseline commit not in git history; running full assessment." Skip to Phase 1.
- **If git diff returns no files**: continue to Step 0.4 with an empty change set.
- **If git diff returns files**: continue to Step 0.4 with the list of changed files.

### Step 0.4: Map changed files to data stores

For each changed file from Step 0.3, determine which data store(s) it affects by matching
against each store's `assessment_metadata.watch_paths` list (prefix match).

- **Files matched to one or more stores**: mark those stores as `needs_reassessment`.
- **Files not matched to any store's watch_paths**: these are "unclaimed changes". They may
  indicate a new data store (e.g., a new migration file, a new service with a new database).
  Inspect them briefly to determine if they introduce new data elements or a new storage
  mechanism.
  - If yes: set mode = `FULL`. Note the new data store candidate.
  - If no (e.g., UI-only changes, test files, documentation): treat as non-material.

### Step 0.5: Determine assessment mode and proceed

| Condition                                                                             | Mode      | Action                                                                                                                                                                                                             |
| ------------------------------------------------------------------------------------- | --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| No stores marked `needs_reassessment` AND no unclaimed changes introducing new stores | `REUSE`   | Skip Phase 1 and Phase 2. Go directly to Phase 3: update timestamps and commit hash only. Log: "No relevant changes detected since commit `<hash>`. Reusing existing classification."                              |
| Some stores marked `needs_reassessment`, others not                                   | `PARTIAL` | In Phase 1 and Phase 2, assess only the marked stores. Carry forward unchanged stores verbatim from the existing details YAML. In Phase 3, merge results. Log which stores were re-assessed and which were reused. |
| All stores marked OR mode already set to `FULL`                                       | `FULL`    | Run Phase 1, Phase 2, and Phase 3 in full.                                                                                                                                                                         |

**Document the chosen mode and its rationale** before proceeding.

### Watch path guidance (for first-time assessors)

When writing `watch_paths` for a data store during a FULL or PARTIAL assessment, use the
following heuristics to select appropriate paths. These are relative path prefixes; any
changed file whose path starts with a listed prefix is considered relevant to that store.

| Data store type            | Typical watch paths                                                       |
| -------------------------- | ------------------------------------------------------------------------- |
| Relational database        | Migration files dir, ORM model files, schema definition files             |
| File / object storage      | File upload/download service files, storage configuration                 |
| Session store              | Session middleware, auth driver files, session configuration              |
| Cache (Redis, Memcached)   | Cache service files, cache configuration                                  |
| External API / third-party | API client files, integration service files                               |
| Browser storage            | Frontend files writing to `localStorage` / `sessionStorage` / `IndexedDB` |

Be inclusive rather than exclusive when choosing watch paths. A false positive (unnecessary
re-assessment) is always safer than a false negative (missed data element change).

---

## Phase 1: Discovery (Can be parallelized)
- Extract relevant information from:
  - Requirements documents (functional specifications, user stories)
  - Database schemas (tables, columns, data types)
  - JSON and XML schemas or files, if available
  - Source code (data models, API endpoints, forms, data structures)
- Scan all data sources and destinations (databases, files, cloud storage BLOB storage, SharePoint, etc.) simultaneously
- Identify high-sensitivity indicators (PHN, SIN, medical or mental health diagnosis, bank account number)
- Flag potential personal information

## Phase 2: Classification
- Apply classification rules to discovered elements
  - Note the specific criterion that applies
  - Document the reference location (requirement, table name, code file/line)
- Determine store-level classifications as HIGHEST classification of any element
- Determine application-level classification as HIGHEST classification of all stores
- Check for aggregate risk
- Assess potential impact scenarios
- Review for edge cases or special considerations
- Validate classification

## Phase 2b: Security Posture Gap Check

After completing Phase 2, run this check for every data store classified as **Protected B or higher**. This phase detects stores where the data classification level requires controls that are absent from the currently identified control set (a "classification-level compliance gap").

This check exists because container-level encryption (SQL Server TDE, PostgreSQL data file encryption, cloud managed-disk encryption) does NOT protect high-sensitivity data elements against authenticated database access, SQL injection, or insider threats. Applications storing PHN, SIN, health/mental health diagnosis, or bank account numbers must use **field-level encryption** for those specific columns; TDE alone is insufficient and does not satisfy ENC-002/003.

**For each store where `sensitivity_classification` is Protected B or higher:**

1. **Identify high-sensitivity data elements in that store.** High-sensitivity means any of:
   - Personal Health Number (PHN)
   - Social Insurance Number (SIN)
   - Health or mental health diagnosis
   - Bank account number
   - Any data element whose `handling_requirements[]` includes `field_level_encryption` or `column_level_encryption`

2. **Check whether field-level encryption is present for that store.** Look for:
   - Evidence in the codebase: `AesGcm`, `DataProtectionProvider`, column encryption in migration files, key vault-backed column encryption, `Always Encrypted`, `pgcrypto` column-level functions
   - A `field_level_encryption` or `column_level_encryption` entry in `security_controls.current[]`
   - **TDE alone does NOT count.** `transparent_data_encryption`, `sql_server_tde`, `encryption_at_rest` (where the mechanism is disk/container-level) must NOT be treated as field-level encryption.

3. **If high-sensitivity data elements ARE present AND field-level encryption is absent:**
   - Generate a security posture gap entry (see format below)
   - This gap is a **mandatory pre-confirmed finding**. It does not depend on whether other encryption exists (TDE, in-transit TLS, etc.). The gap is present if field-level encryption for the specific column is absent.
   - Set `security_posture.has_posture_gaps: true` in the summary YAML
   - Add a high-priority recommendation entry to the details YAML for each gap

**Security Posture Gap entry format** (populate in `security_posture_gaps[]` in `security-classification.yaml`):

```yaml
security_posture_gaps:
  - store: "[store name]"
    data_elements: ["[element name, e.g., Personal Health Number (PHN)]"]
    gap: "Field-level encryption absent. Container-level encryption (TDE/disk encryption) provides no protection against authenticated DB access, SQL injection, or insider threats"
    exposure: "Any penetration of the data store (SQL injection, compromised DB credentials, insider access, or backup file access) exposes all [element] data in plaintext"
    required_control: "ENC-002/003: field-level encryption for [element] regardless of TDE or other container-level encryption"
    classification_implication: "Protected B classification cannot be satisfied by container-level encryption alone for [element] columns. Field-level encryption is mandatory and must be confirmed before this application handles real Protected B data in production."
    recommendation: "Implement field-level encryption (e.g., Azure Key Vault-backed AES-256-GCM on [element] columns; SQL Server Always Encrypted; or application-layer encryption before persistence) for all identified high-sensitivity columns."
```

**Scope:** This check applies in all assessment modes (FULL / PARTIAL / REUSE). On a REUSE run, check whether `security_posture_gaps` is already populated; if it is, carry it forward unchanged. On a FULL or PARTIAL run that covers the affected store, regenerate the gaps list.

## Phase 3: Output Generation
- Generate summary file first
- Generate details file
- List security recommendations

## Phase 4: MD Report Generation

After writing both YAML artifacts, produce `.ai/blueteam/reports/security-classification.md`: a
human-readable summary required by the assessment report suite.

**Required sections:**

1. **Title and summary table**: application name, overall classification, privacy legislation applicability,
   legislative basis, assessment date, and assessment mode (FULL/PARTIAL/REUSE).

2. **Classification Rationale**: the `classification_rationale` text from the details YAML.

3. **High Sensitivity Indicators**: table derived from `high_sensitivity_indicators` in the
   summary YAML. Include PHN, SIN, health info, financial info, and government evaluations rows.

4. **Data Store Classification Summary**: one row per store from `data_stores_summary.stores`,
   with columns: Store Name / Technology / Classification / Classification Driver (drawn from
   the `classification_driver` field in the details YAML).

5. **Security Controls Assessment**: two sub-tables:
   - *Controls Present*: drawn from `security_controls.current` across all stores, de-duplicated.
     Flag any control noted as partial or broken.
   - *Controls Recommended*: drawn from `security_controls.recommended` across all stores,
     de-duplicated, with priority (Critical/High/Medium).

6. **Security Posture Gaps** (include only if `security_posture.has_posture_gaps: true`):
   one card per gap entry in `security_posture_gaps[]`, showing store / data elements / gap
   description / exposure / required control.

7. **Incremental Assessment Configuration**: `assessment_commit`, `last_assessment_date`,
   `last_assessment_mode`, and watch paths summary for future incremental runs.

After writing the `.md`, generate `.ai/blueteam/reports/security-classification.html` by running:

```bash
node <BlueTeam>/scripts/generate_report_html.js --repo-root /path/to/repo
```

Replace `<BlueTeam>` with the path to the BlueTeam skills directory.

---

## Input Handling

You may receive:
- **Requirements documents**: Extract data types mentioned in features, user stories, use cases
- **Source code**: Analyze data models, database migrations, API schemas, form definitions
- **Database schemas**: Review table structures, column names, data types, constraints, relationships
- **JSON or XML schemas**: Review structures, field names, data types, constraints, relationships
- **Mixed inputs**: Synthesize information from multiple sources

If information is incomplete:
- State assumptions clearly
- Request specific additional information if needed
- Provide conditional classifications ("If X contains Y, then classification is Z")

## Additional Key Principles
In addition to the key principles for information security classification, use the following:

1. **Be specific**: Always reference exact locations (table.column, file:line, requirement ID)
2. **Explain your reasoning**: Each classification must have clear justification
 
## Required Output Format
You MUST use the system date as the "last updated" date, not your training date.

#### Tier 1: security-classification.yaml (Summary)

**Save rules:**
- Mode = `FULL` or `PARTIAL`: always write this file.
- Mode = `REUSE`: write this file only to update `incremental_assessment.assessment_commit`,
  `incremental_assessment.last_assessment_date`, and `incremental_assessment.last_assessment_mode`.
  Do NOT change any classification fields.

**Purpose:** Quick reference for AI agents needing only the classification level
**Size Target:** < 60 lines

```yaml
# .ai/blueteam/data/security-classification.yaml
# Quick reference - see security-classification-details.yaml for full analysis
version: "1.0"
last_updated: "2025-01-14"

application:
  name: "Service Request Portal"
  overall_classification: "Protected A"
  privacy_legislation_applies: true
  conditional_elevation: "Protected B if attachments contain sensitive documents"

data_stores_summary:
  count: 4
  highest_classification: "Protected A"
  stores:
    - name: "Primary Application Database"
      classification: "Protected A"
    - name: "Audit Log Storage"
      classification: "Protected A"
    - name: "File Attachment Storage"
      classification: "Protected A (conditional Protected B)"
    - name: "Browser Local Storage"
      classification: "Protected A"

high_sensitivity_indicators:
  phn_present: false
  sin_present: false
  health_info_present: false
  financial_info_present: false

security_posture:
  high_priority_recommendations: 3
  medium_priority_recommendations: 3
  has_posture_gaps: false            # true when Phase 2b finds field-level encryption absent for PHN/SIN/health/bank data
  details_file: ".ai/blueteam/data/security-classification-details.yaml"

security_posture_gaps: []
# Populated by Phase 2b when high-sensitivity data (PHN, SIN, health diagnosis, bank account)
# is stored in a Protected B data store without field-level encryption. Format:
#   - store: "database name"
#     data_elements: ["PHN", "health diagnosis"]
#     gap: "Field-level encryption absent; TDE provides no protection against authenticated DB access"
#     exposure: "SQL injection or insider access exposes all PHN/health data in plaintext"
#     required_control: "ENC-002/003: field-level encryption regardless of TDE"
#     classification_implication: "Protected B cannot be satisfied by TDE alone for these columns"
#     recommendation: "Implement column-level AES-256-GCM encryption backed by a key vault"

incremental_assessment:
  assessment_commit: "abc1234"        # git HEAD hash at time of last assessment
  last_assessment_date: "2025-01-14"  # system date at time of last assessment
  last_assessment_mode: "full"        # full | partial | reuse
  # If mode was partial, list which stores were re-assessed (others were reused):
  partial_stores_reassessed: []
```

#### Tier 2: security-classification-details.yaml (Full Analysis)

**Save rules:**
- Mode = `FULL`: write the entire file from scratch.
- Mode = `PARTIAL`: write the entire file, replacing re-assessed stores with new analysis
  and carrying forward unchanged stores verbatim (update only their
  `assessment_metadata.reuse_status` to `"reused-unchanged"`).
- Mode = `REUSE`: write this file only to update the top-level `incremental_assessment`
  block and each store's `assessment_metadata.last_assessed_commit` and
  `assessment_metadata.last_assessed_date`. Do NOT change any classification fields.

**Purpose:** Complete details when deep analysis is needed
**Contains:** All data elements, locations, rationale, full recommendations

```yaml
# .ai/blueteam/data/security-classification-details.yaml
# Full security classification analysis
# Summary available in: security-classification.yaml

version: "1.0"
last_updated: "2025-01-14"
references:
  summary_file: ".ai/blueteam/data/security-classification.yaml"
  standards:
    - "organizational Information Security Classification"
    - "applicable privacy legislation"

incremental_assessment:
  last_full_assessment: "2025-01-14"   # date of last full assessment
  assessment_commit: "abc1234"         # git HEAD at time of last full assessment
  last_assessment_mode: "full"         # full | partial | reuse
  partial_stores_reassessed: []        # populated when mode=partial

# Full classification rationale
classification_rationale: |
  This application processes personal information as defined in applicable access to information
  applicable information/privacy legislation...

# Detailed data stores analysis
data_stores:
  - name: "Primary Application Database"
    type: "relational"
    sensitivity_classification: "Protected A"
    privacy_classification: "Contains Personal Information"
    description: "Main database storing users, requests, catalog items..."
    data_types:
      - "user_profiles"
      - "personal_information"
      # ... full list
    security_controls:
      current:
        - "encryption_in_transit"
        - "bearer_token_authentication"
      recommended:
        - "encryption_at_rest"
        - "database_access_auditing"
    assessment_metadata:
      last_assessed_commit: "abc1234"  # git HEAD when this store was last assessed
      last_assessed_date: "2025-01-14"
      reuse_status: "assessed"         # assessed | reused-unchanged
      watch_paths:                     # file path prefixes that govern this store's classification
        - "scripts/migrations/"        # example: migration files
        - "src/models/"                # example: ORM model files
        # Add paths specific to this store. Any changed file matching a prefix
        # will trigger re-assessment of this store in future runs.

# Detailed data elements with locations
data_elements:
  - name: "User Email"
    sensitivity_classification: "Protected A"
    privacy_category: "Personal Information"
    description: "User email addresses used for identification and communication"
    handling_requirements:
      - "mask_in_logs"
      - "encrypt_in_transit"
      - "consent_required_for_disclosure"
    locations:
      - file: "src/api/controllers/UserController.js"
        context: "search function"
      - file: "src/composables/useUsers.js"
        context: "searchUsers function"
  # ... all other elements

# Full security recommendations with rationale
security_recommendations:
  high_priority:
    - id: "SEC-001"
      description: "Implement encryption at rest for database and file storage"
      rationale: "Protects personal information from unauthorized access if storage is compromised"
      affected_stores:
        - "Primary Application Database"
        - "File Attachment Storage"
  # ... all recommendations
```

---

## Completion Checklist

Before declaring this skill execution complete, verify every item below. Do not mark the skill done if any required output is missing; generate it first.

### Outputs written by this skill

- [ ] `.ai/blueteam/data/security-classification.yaml`: written with canonical schema: `application:` top-level key, `details_file:` cross-reference, `high_sensitivity_indicators:` section, `security_posture:` section.
- [ ] `.ai/blueteam/data/security-classification-details.yaml`: written with `data_stores:` and `data_elements:` arrays; each data store has `missing_controls:` list.
- [ ] `.ai/blueteam/reports/security-classification.md`: written (Phase 4).
- [ ] `.ai/blueteam/reports/security-classification.html`: generated by `generate_report_html.js` (Phase 4).

### Schema conformance checks

- [ ] `security-classification.yaml` does NOT use `classification:` as a top-level key (that is the inline-bypass schema; it must use `application:` instead).
- [ ] `security-classification-details.yaml` has at least one entry in `data_stores:`.
- [ ] All data stores with missing encryption, access control, or non-approved location have these recorded in `missing_controls:`.

### Verification

After writing all four outputs (both YAML artifacts and both report files), run the validator to confirm the report pair is present and the HTML was generated correctly:

```bash
node <BlueTeam>/scripts/validate_reports.js --repo-root /path/to/repo
```

The validator checks for `security-classification.md` and `security-classification.html` as a required pair. If either is missing, generate it before declaring this skill complete.
