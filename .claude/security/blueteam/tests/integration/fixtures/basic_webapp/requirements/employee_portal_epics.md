# Employee Directory Portal — Requirements

**Project:** Employee Directory Portal
**Data Classification (provisional):** Protected A (employee personal information)
**Deployment Target:** Cloud Landing Zone (Azure)
**Primary Users:** organizational staff (internal), HR administrators

---

## Epic 1: Staff Authentication

organizational staff must authenticate using the the organization's enterprise identity provider
before accessing any directory features.

### Story 1.1 — organizational Staff Login
**As a** organizational staff member,
**I want to** log in using my Enterprise IdP account (e.g. Microsoft Entra ID) (SSO),
**so that** I do not need a separate username and password for the portal.

**Acceptance Criteria:**
- Login redirects to Enterprise IdP (e.g. Microsoft Entra ID) OIDC endpoint
- Valid valid credentials grant access; invalid credentials return an error
- Session is established only after successful IdP callback

### Story 1.2 — Session Timeout
**As a** organizational staff member,
**I want** my session to expire after a period of inactivity,
**so that** an unattended workstation does not leave the portal accessible.

**Acceptance Criteria:**
- Session expires after 30 minutes of inactivity
- User is redirected to login on next request after expiry
- No sensitive data is retained in browser storage after logout

---

## Epic 2: Employee Directory

organizational staff can browse and search the employee directory to find colleagues.

### Story 2.1 — View Employee List
**As a** organizational staff member,
**I want to** view a paginated list of employees,
**so that** I can browse the directory.

**Acceptance Criteria:**
- Authenticated users can view a paginated list (max 50 records per page)
- List shows: name, department, job title, work email
- Unauthenticated requests return HTTP 401

### Story 2.2 — Search by Name or Department
**As a** organizational staff member,
**I want to** search employees by name or department,
**so that** I can find a specific person quickly.

**Acceptance Criteria:**
- Search accepts partial name (first or last) and department name
- Results are paginated; no unfiltered bulk export available via search API
- Search is only available to authenticated users

### Story 2.3 — View Employee Profile
**As a** organizational staff member,
**I want to** view a detailed employee profile,
**so that** I can see contact information and reporting structure.

**Acceptance Criteria:**
- Profile shows: name, email, department, job title, manager, direct reports
- PHN (Personal Health Number) is NOT stored or displayed in the directory
- Authenticated users can view any employee profile (no need-to-know restriction at this tier)

---

## Epic 3: Employee Management (Admin Only)

HR administrators can manage employee records in the directory.

### Story 3.1 — Create Employee Record
**As an** HR administrator,
**I want to** create a new employee record,
**so that** new hires appear in the directory on their start date.

**Acceptance Criteria:**
- Only users with the `admin` role can access create/update/deactivate endpoints
- Required fields: first name, last name, work email, department, job title, start date
- Email must be a valid `@example.com` address
- Duplicate email addresses are rejected

### Story 3.2 — Update Employee Record
**As an** HR administrator,
**I want to** update an employee's information,
**so that** the directory reflects transfers and promotions.

**Acceptance Criteria:**
- Only `admin` role can update records
- All field changes are written to the audit log (Story 4.2)
- Email changes require manager approval (out of scope for this phase — future story)

### Story 3.3 — Deactivate Employee
**As an** HR administrator,
**I want to** deactivate an employee record,
**so that** departing employees no longer appear in the directory.

**Acceptance Criteria:**
- Deactivation sets `active: false`; record is retained for audit purposes (not deleted)
- Only `admin` role can deactivate
- Deactivation event is written to the audit log

---

## Epic 4: Reporting

HR administrators can export directory data and view audit reports.

### Story 4.1 — Export Employee List
**As an** HR administrator,
**I want to** export the employee list as CSV,
**so that** I can use the data in other HR systems.

**Acceptance Criteria:**
- Only `admin` role can trigger an export
- Export includes: name, email, department, job title, status
- Export is limited to active employees unless the admin explicitly requests all

### Story 4.2 — View Audit Report
**As an** HR administrator,
**I want to** view an audit log of all record changes,
**so that** I can review who made what changes and when.

**Acceptance Criteria:**
- Audit log records: timestamp, actor (who made the change), affected record, field changed, old value, new value
- Audit log is read-only; no entries can be deleted
- Only `admin` role can access the audit log

---

## Data Elements

| Field | Classification | Notes |
|-------|---------------|-------|
| Employee name | Protected A | personal information per applicable privacy legislation |
| Work email (`@example.com`) | Protected A | employee contact |
| Department | Protected A | Organizational structure |
| Job title | Protected A | Employment information |
| Manager / reporting structure | Protected A | Organizational hierarchy |
| Start date | Protected A | Employment record |
| Active status | Protected A | Employment status |
| Audit log entries | Protected A | Action accountability |

**Note:** PHN, SIN, health information, and financial data are explicitly out of scope for this portal.

---

## Integrations

| Integration | Direction | Purpose |
|-------------|-----------|---------|
| Enterprise IdP (e.g. Microsoft Entra ID) | Inbound (authentication) | OIDC/SAML SSO for all staff logins |
| Audit Log Service | Outbound (write) | Structured audit events for all admin actions |

---

## Non-Functional Security Requirements

- All data in transit must use TLS 1.2 or higher
- Employee records are stored in a managed database within the Cloud LZ
- The application must be deployed in the Cloud Landing Zone
- Access logs must be retained for a minimum of 1 year
