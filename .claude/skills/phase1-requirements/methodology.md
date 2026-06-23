# Methodology: Phase 1: Requirements

> Companion to `SKILL.md` in this directory. Loaded on demand by `/phase1-requirements`.
> No frontmatter, this file is a methodology reference, not a discoverable skill.

Reads all relevant source documents the user has placed in the local inputs directory, performs deep analysis, and produces a consistently structured requirements document with functional requirements (FR), non-functional requirements (NFR), and module decomposition.

---

## Scope

This skill operates at two levels:

1. **Project level**: Analyze all source content across the project. Produce a master requirements document covering the full scope, with recommended module decomposition.
2. **Module level**: Analyze project-level requirements + module-specific source content. Produce a focused requirements document for a single module.

---

## Prerequisites

- `./phases/phase1-requirements/inputs/` exists and contains the source documents the user wants analyzed.
- Source documents are present in that directory (business cases, briefs, RFPs, meeting notes, etc.).

---

## Phase 1: Document Intake

### 1.1 Discover the inputs directory

The user populates `./phases/phase1-requirements/inputs/` before running this skill. Discover its contents:

```bash
ls -la ./phases/phase1-requirements/inputs/
```

If the directory is empty or missing, hard-block with a message asking the user to drop the project's source documents there before re-running.

### 1.2 Enumerate all files

Walk the inputs directory recursively, capturing filename/size/detected MIME type for each candidate file; sub-folders are allowed (e.g., `inputs/business-case/`, `inputs/meeting-notes/`).

### 1.3 Filter for requirements-relevant documents

Read files matching these criteria:

| Criterion | Rationale |
|-----------|-----------|
| MIME type `text/plain` | Plain-text documents (briefs, notes, transcripts) |
| Any `.md` or `.txt` file | Text-based requirements content |
| Any `.pdf` file | Business cases, RFPs, formal specifications |
| Any `.docx` file | Stakeholder-authored Word documents |

Read each matching file in place, there's no need to copy or download anything; the inputs directory IS the local working copy.

### 1.4 Workspace layout

```
phases/
└── phase1-requirements/
    ├── inputs/                 # User-supplied source documents (read-only during analysis)
    │   ├── project-brief.md
    │   ├── user-stories.md
    │   ├── meeting-notes.txt
    │   └── business-case.pdf
    └── output/                 # Generated requirements documents
        ├── requirements.md     # Master requirements document
        └── modules/            # Per-module requirements (if decomposed)
            ├── module-a-requirements.md
            └── module-b-requirements.md
```

Create the output directory if needed:
```bash
mkdir -p ./phases/phase1-requirements/output/modules
```

---

## Phase 2: Document Analysis

### 2.1 Read and catalog all source documents

For each document:
1. Read the full content
2. Classify it: `business_case | user_stories | meeting_notes | technical_brief | regulatory | scope_statement | other`
3. Extract key themes/stakeholders/constraints/assumptions
4. Note any contradictions or ambiguities between documents

### 2.2 Identify the application profile

Determine from the source documents:

| Decision | Options | How to Determine |
|----------|---------|-----------------|
| **Architectural pattern** | Simple (3-comp), BFF (5-comp), Enterprise (5+) | Load `.claude/standards/07-architectural-patterns.md` and match against complexity signals |
| **Hosting platform** | Azure (default), AWS, GCP | Explicit mention, or default to Azure |
| **Public SSO providers** | Google, Microsoft, other public IdPs | Based on target audience |
| **Internal SSO** | Entra ID (or equivalent) | Always for internal/admin components |
| **Platform integrations** | Identity providers, ticketing systems, document stores, line-of-business apps | Based on business process needs |

### 2.3 Cross-reference with standards

Load and cross-reference against:
- `.claude/standards/07-architectural-patterns.md`: Pattern selection and component architecture
- `.claude/standards/02-security.md`: Security requirements (OWASP ASVS L2, auth, RBAC)
- `.claude/standards/05-accessibility.md`: WCAG 2.1 AA requirements
- `.claude/standards/06-pwa.md`: PWA requirements (if applicable)

These standards generate **default NFRs** that apply to every project unless explicitly excluded.

---

## Phase 3: Requirements Structuring

### 3.1 Master Requirements Document Structure

Every requirements document MUST follow this structure:

```markdown
# {Project Name}: Requirements Document

## Document Control
- **Version:** 1.0
- **Date:** {date}
- **Project:** {project name}
- **Module:** {module name or "Project-Level"}
- **Architectural Pattern:** {Simple | BFF | Enterprise}
- **Status:** Draft | Review | Approved

---

## 1. Executive Summary
{2-3 paragraphs summarizing the project purpose, target users, and key outcomes}

## 2. Stakeholders
| Role | Description | Primary Concerns |
|------|-------------|-----------------|
| ... | ... | ... |

## 3. Application Profile
### 3.1 Architectural Pattern
{Pattern name and justification referencing 07-architectural-patterns.md}

### 3.2 Component Architecture
{Diagram/description of specific components for this project}

### 3.3 Hosting & Infrastructure
- **Platform:** {Azure | AWS | GCP}
- **Justification:** {why this platform}

### 3.4 Authentication & SSO
| Context | Provider | Protocol |
|---------|----------|----------|
| Public | {Google, Microsoft, other public IdPs} | OAuth 2.0 / OIDC |
| Internal | Entra ID (or equivalent) | OAuth 2.0 / OIDC |

### 3.5 Platform Integrations
| Platform | Purpose | Required | Priority |
|----------|---------|----------|----------|
| Identity provider | {specific use} | Yes/No | P1/P2/P3 |
| Ticketing system | {specific use} | Yes/No | P1/P2/P3 |
| Line-of-business app | {specific use} | Yes/No | P1/P2/P3 |
| Document store | Document storage | Yes/No | P1/P2/P3 |

## 4. Functional Requirements

### 4.1 {Feature Area 1}
| ID | Requirement | Priority | Module | Acceptance Criteria |
|----|------------|----------|--------|-------------------|
| FR-001 | {requirement} | Must/Should/Could | {module} | {testable criteria} |
| FR-002 | ... | ... | ... | ... |

### 4.2 {Feature Area 2}
| ID | Requirement | Priority | Module | Acceptance Criteria |
|----|------------|----------|--------|-------------------|
| ... | ... | ... | ... | ... |

{Repeat for each feature area}

## 5. Non-Functional Requirements

### 5.1 Security
| ID | Requirement | Standard Reference | Priority |
|----|------------|-------------------|----------|
| NFR-SEC-001 | OWASP ASVS Level 2 compliance | 02-security.md | Must |
| NFR-SEC-002 | httpOnly cookies for all tokens | 02-security.md | Must |
| NFR-SEC-003 | Parameterized SQL only | 02-security.md | Must |
| NFR-SEC-004 | RBAC with role hierarchy | 02-security.md | Must |
| NFR-SEC-005 | Rate limiting (200/15min general, 30/15min auth) | 02-security.md | Must |
| ... | {project-specific security requirements} | ... | ... |

### 5.2 Accessibility
| ID | Requirement | Standard Reference | Priority |
|----|------------|-------------------|----------|
| NFR-A11Y-001 | WCAG 2.1 AA compliance | 05-accessibility.md | Must |
| NFR-A11Y-002 | Keyboard navigation for all interactive elements | 05-accessibility.md | Must |
| NFR-A11Y-003 | 4.5:1 contrast ratio (normal text) | 05-accessibility.md | Must |
| ... | {project-specific a11y requirements} | ... | ... |

### 5.3 Performance
| ID | Requirement | Priority |
|----|------------|----------|
| NFR-PERF-001 | Page load < 3s on 3G connection | Should |
| NFR-PERF-002 | API response < 500ms (p95) | Should |
| ... | {project-specific performance requirements} | ... |

### 5.4 Reliability & Availability
| ID | Requirement | Priority |
|----|------------|----------|
| NFR-REL-001 | Health check endpoints (/health/live, /health/ready) | Must |
| NFR-REL-002 | Graceful shutdown with connection draining | Must |
| ... | ... | ... |

### 5.5 Data & Storage
| ID | Requirement | Priority |
|----|------------|----------|
| NFR-DATA-001 | Dedicated document store for all unstructured document storage | Must |
| NFR-DATA-002 | PostgreSQL for structured relational data only | Must |
| NFR-DATA-003 | Soft deletes with audit logging | Must |
| ... | {project-specific data requirements} | ... |

### 5.6 Testing
| ID | Requirement | Standard Reference | Priority |
|----|------------|-------------------|----------|
| NFR-TEST-001 | Backend unit test coverage >= 80% | 04-testing.md | Must |
| NFR-TEST-002 | Frontend unit test coverage >= 70% | 04-testing.md | Must |
| NFR-TEST-003 | Security-critical path coverage >= 90% | 04-testing.md | Must |
| ... | ... | ... | ... |

### 5.7 PWA (if applicable)
| ID | Requirement | Standard Reference | Priority |
|----|------------|-------------------|----------|
| NFR-PWA-001 | Installable with web app manifest | 06-pwa.md | Should |
| NFR-PWA-002 | Offline shell caching | 06-pwa.md | Should |
| ... | ... | ... | ... |

## 6. Module Decomposition

### 6.1 Recommended Modules
| Module | Description | Priority | Dependencies |
|--------|-------------|----------|-------------|
| {Module A} | {scope description} | P1 | None |
| {Module B} | {scope description} | P2 | Module A |
| ... | ... | ... | ... |

### 6.2 Module-Feature Mapping
| Module | Functional Requirements | Key NFRs |
|--------|----------------------|----------|
| {Module A} | FR-001, FR-002, FR-003 | NFR-SEC-*, NFR-A11Y-* |
| ... | ... | ... |

## 7. Constraints & Assumptions
### 7.1 Constraints
- {constraint from source documents or standards}

### 7.2 Assumptions
- {assumption that needs validation}

## 8. Risks & Open Questions
| ID | Risk/Question | Impact | Mitigation/Action |
|----|--------------|--------|-------------------|
| RISK-001 | {risk} | {impact} | {mitigation} |
| Q-001 | {open question} | {impact if unresolved} | {who to ask} |

## 9. Source Document Traceability
| Document | Classification | Key Contributions |
|----------|---------------|------------------|
| {filename} | {classification} | {what FRs/NFRs were derived from this} |
| ... | ... | ... |
```

### 3.2 Requirement ID Convention

| Prefix | Category |
|--------|----------|
| `FR-NNN` | Functional requirement |
| `NFR-SEC-NNN` | Security NFR |
| `NFR-A11Y-NNN` | Accessibility NFR |
| `NFR-PERF-NNN` | Performance NFR |
| `NFR-REL-NNN` | Reliability NFR |
| `NFR-DATA-NNN` | Data & storage NFR |
| `NFR-TEST-NNN` | Testing NFR |
| `NFR-PWA-NNN` | PWA NFR |
| `RISK-NNN` | Risk |
| `Q-NNN` | Open question |

### 3.3 Priority Levels (MoSCoW)

| Priority | Meaning |
|----------|---------|
| **Must** | Non-negotiable; project fails without it |
| **Should** | Important; expected in the deliverable |
| **Could** | Desirable; include if time/budget allows |
| **Won't** | Explicitly out of scope for this iteration |

---

## Phase 4: Module-Level Requirements

When working at the module level:

1. Load the master project-level requirements document
2. Filter to the FRs and NFRs mapped to this module (Section 6.2)
3. Expand each FR with detailed acceptance criteria, edge cases, and UI/UX notes
4. Add module-specific NFRs (e.g., specific integration requirements)
5. Produce a standalone module requirements document following the same structure
6. Include a traceability section mapping back to project-level FR IDs

---

## Phase 5: Delivery

Write the generated requirements document(s) to the local output directory:

```
./phases/phase1-requirements/output/requirements.md            # Master requirements document
./phases/phase1-requirements/output/modules/<module>-requirements.md   # Per-module (if decomposed)
```

That file IS the deliverable. The user reviews it in place; no upload or board move is required.

---

## Default NFRs (Always Included)

These NFRs are derived from the harness standards (`.claude/standards/`) and are included in every project unless explicitly excluded with justification:

### From 02-security.md
- OWASP ASVS Level 2 compliance
- httpOnly cookies for all tokens (never localStorage/sessionStorage)
- Parameterized SQL only (no string interpolation)
- RBAC with role hierarchy (guest → viewer → user → manager → admin → super_admin)
- Rate limiting (200 req/15min general, 30 req/15min auth)
- CSRF protection with HMAC tokens
- Input validation (whitelisting, type coercion)
- HTTPS with TLS 1.2+ and HSTS
- JWT with RS256, 15-min access tokens, 7-day refresh tokens

### From 05-accessibility.md
- WCAG 2.1 AA compliance
- Keyboard navigation for all interactive elements
- Screen reader compatibility
- 4.5:1 contrast ratio (normal text), 3:1 (large text/UI)
- 44x44px minimum touch targets
- Skip navigation links
- Semantic HTML and ARIA landmarks

### From 04-testing.md
- Backend test coverage >= 80%
- Frontend test coverage >= 70%
- Security-critical path coverage >= 90%
- RBAC test matrix for all protected endpoints

### From 07-architectural-patterns.md
- A dedicated document store for unstructured documents (never BYTEA at scale)
- PostgreSQL for structured data only
- Containerized deployment (Docker)
- Health check endpoints (/health/live, /health/ready)
- Graceful shutdown with connection draining

---

## Analysis Quality Checklist

Before delivering, verify:

- [ ] All source documents have been read and cataloged
- [ ] Architectural pattern is explicitly stated with justification
- [ ] Every FR has an ID, priority, module assignment, and testable acceptance criteria
- [ ] Default NFRs from all standards are included
- [ ] Project-specific NFRs are identified beyond defaults
- [ ] Module decomposition is provided with dependency ordering
- [ ] Contradictions between source documents are flagged in Risks
- [ ] Open questions are captured with impact assessment
- [ ] Source document traceability is complete
- [ ] Document follows the exact structure defined in Phase 3.1
