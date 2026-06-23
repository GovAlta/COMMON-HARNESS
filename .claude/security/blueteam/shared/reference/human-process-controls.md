# Unified Human Process Controls

**Date:** 2026-02-20
**Sources:**
- Protected B Controls Framework (organizational, NIST SP 800-53 derived)
- CCCS Cloud Security Control Recommendations (Medium Profile, 31-May-2019)

---

## Purpose

This document unifies all security controls that **require human processes** -- organizational policies, management decisions, physical actions, training, personnel procedures, or manual operational activities -- from both the Protected B and CCCS Medium frameworks. These controls are outside the scope of AI-generated application code and must be addressed through organizational organizational processes.

Each control is tagged with its source framework(s). Controls unique to one framework are highlighted for easy identification.

---

## Source Legend

| Tag | Meaning |
|---|---|
| **Both** | Control appears as human/operational in both PB and CCCS Medium analyses |
| **PB** | Control appears as human/operational only in the Protected B analysis |
| **CCCS** | Control appears as human/operational only in the CCCS Medium analysis |

**Note on classification differences:** A small number of controls are classified as "human process" in one framework but "AI-implementable" in the other. These are documented in the Cross-Classification Notes section.

---

## Summary Statistics

| Category | Count |
|---|---|
| Total unique human process controls (unified) | ~327 |
| Controls in both frameworks | ~230 |
| Controls unique to CCCS Medium | ~91 |
| Controls unique to Protected B | ~6 |
| Cross-classification differences | 2 |

### Unique Controls by Family

| Family | Both | CCCS Only | PB Only | Total |
|---|---|---|---|---|
| Access Control (AC) | 18 | 12 | 1 | 31 |
| Awareness and Training (AT) | 5 | 0 | 0 | 5 |
| Audit and Accountability (AU) | 0 | 13 | 0 | 13 |
| Assessment, Authorization, Monitoring (CA) | 15 | 0 | 0 | 15 |
| Configuration Management (CM) | 29 | 0 | 0 | 29 |
| Contingency Planning (CP) | 35 | 0 | 0 | 35 |
| Identification and Authentication (IA) | 7 | 12 | 0 | 19 |
| Incident Response (IR) | 19 | 0 | 0 | 19 |
| Maintenance (MA) | 14 | 0 | 0 | 14 |
| Media Protection (MP) | 14 | 0 | 0 | 14 |
| Physical and Environmental (PE) | 22 | 0 | 0 | 22 |
| Planning (PL) | 6 | 0 | 0 | 6 |
| Personnel Security (PS) | 9 | 0 | 0 | 9 |
| Risk Assessment (RA) | 10 | 0 | 0 | 10 |
| System and Services Acquisition (SA) | 22 | 0 | 0 | 22 |
| System and Communications Protection (SC) | 0 | 31 | 0 | 31 |
| System and Information Integrity (SI) | 5 | 23 | 1 | 29 |
| Secure SDLC (ASVS Custom) | 0 | 0 | 4 | 4 |
| **Total** | **~230** | **~91** | **~6** | **~327** |

---

## Quick Reference: Controls Unique to Each Framework

### Controls Unique to CCCS Medium (Human Process)

These 91 controls are categorized as human/operational in the CCCS Medium analysis but were not listed as human process controls in the Protected B analysis. Most are infrastructure, tooling, or monitoring controls that the CCCS analysis explicitly categorized. Some are noted as already covered by skill files (indicated in Notes).

#### AC (Access Control) -- 12 unique

| Control ID | Title | Summary | Notes |
|---|---|---|---|
| AC-2 | Account Management | Identify account types, assign managers, establish conditions, monitor use | Organizational governance |
| AC-2(1) | Automated Account Management | Employ automated mechanisms to support account management | Infrastructure/tooling |
| AC-2(5) | Inactivity Logout | Require users to log out at end of work period | Policy enforcement |
| AC-2(7) | Role-Based Schemes | Establish/administer privileged accounts per role-based scheme | Organizational role management |
| AC-4 | Information Flow Enforcement | Enforce approved authorizations for info flow (deny all, approve by exception) | Network/infrastructure policy |
| AC-4(21) | Physical/Logical Separation of Info Flows | Separate information flows via session encryption | Network architecture |
| AC-6(1) | Authorize Access to Security Functions | Explicitly authorize access to security functions | Organizational authorization |
| AC-6(5) | Privileged Accounts | Restrict privileged accounts to minimum personnel | Personnel decisions |
| AC-6(9) | Auditing Use of Privileged Functions | Audit execution of privileged functions | SIEM configuration |
| AC-6(10) | Prohibit Non-Privileged Executing Privileged | Prevent non-privileged users from executing privileged functions | Covered by AUTHZ-001/002 |
| AC-11 | Session Lock | Initiate session lock after 15 minutes inactivity | OS/endpoint control |
| AC-11(1) | Pattern-Hiding Displays | Conceal info via session lock with publicly viewable image | OS/endpoint control |

#### AU (Audit and Accountability) -- 13 unique (entire section)

| Control ID | Title | Summary | Notes |
|---|---|---|---|
| AU-1 | Audit and Accountability Policy | Develop, document, disseminate audit policy | Policy development |
| AU-2 | Auditable Events | Determine auditable events; coordinate audit function | Organizational determination |
| AU-2(3) | Reviews and Updates | Review and update audited events annually | Organizational review |
| AU-6 | Audit Review, Analysis, Reporting | Review/analyze audit records every 7 days | Human analysis process |
| AU-6(1) | Process Integration | Automated mechanisms to integrate audit review | Infrastructure/tooling |
| AU-6(3) | Correlate Audit Repositories | Correlate analysis across repositories | Infrastructure/tooling |
| AU-7 | Audit Reduction and Report Generation | On-demand audit review/analysis capability | Infrastructure/tooling |
| AU-7(1) | Automatic Processing | Process audit records for events of interest | Infrastructure/tooling |
| AU-8 | Time Stamps | Internal clocks mapped to UTC within 1 second | Infrastructure configuration |
| AU-8(1) | Synchronization with Authoritative Source | Compare clocks every 24 hours; sync when >1ms difference | Infrastructure configuration |
| AU-9 | Protection of Audit Information | Protect audit info from unauthorized access/modification | Covered by LOG-002 |
| AU-9(2) | Audit Backup on Separate Systems | Back up audit records weekly to separate system | Infrastructure |
| AU-12 | Audit Generation | Provide audit generation capability for defined events | Covered by LOG-001 |

#### IA (Identification and Authentication) -- 12 unique

| Control ID | Title | Summary | Notes |
|---|---|---|---|
| IA-2 | Identification and Authentication (Org Users) | Uniquely identify and authenticate organizational users | Covered by AUTH-001/002 |
| IA-3 | Device Identification and Authentication | Uniquely identify/authenticate devices before network connection | Infrastructure |
| IA-5 | Authenticator Management | Manage authenticators: verify identity, establish content, protect | Organizational process |
| IA-5(1) | Password-Based Authentication | Enforce password complexity and lifetime requirements | See policy tension note |
| IA-5(2) | PKI-Based Authentication | Validate certifications, enforce private key access | Infrastructure |
| IA-5(4) | Automated Password Strength | Automated tools for password strength determination | Infrastructure/tooling |
| IA-5(6) | Protection of Authenticators | Protect authenticators per security category | Organizational/infrastructure |
| IA-5(7) | No Embedded Unencrypted Static Authenticators | No unencrypted static authenticators in apps/scripts | Covered by SEC-001/002 |
| IA-5(11) | Hardware Token-Based Authentication | Mechanisms satisfying CCCS ITSP.30.031 token requirements | Infrastructure |
| IA-6 | Authenticator Feedback | Obscure feedback of authentication info | Covered by ASVS V2 |
| IA-7 | Cryptographic Module Authentication | Implement mechanisms for authentication to crypto modules | Infrastructure |
| IA-8 | ID and Auth (Non-Org Users) | Uniquely identify and authenticate non-organizational users | Covered by AUTH-002/003 |

#### SC (System and Communications Protection) -- 31 unique (entire section)

| Control ID | Title | Summary | Notes |
|---|---|---|---|
| SC-1 | SC Policy and Procedures | Develop, document, disseminate SC policy | Policy development |
| SC-4 | Information in Shared Resources | Prevent unauthorized info transfer via shared resources | Infrastructure |
| SC-5 | Denial of Service Protection | Protect against/limit DoS | Covered by BOT-001/WAF-001 |
| SC-6 | Resource Availability | Protect availability by allocating resources by priority/quota | Infrastructure |
| SC-7 | Boundary Protection | Monitor/control communications at boundaries | Infrastructure |
| SC-7(3) | Access Points | Limit external network connection points | Network architecture |
| SC-7(4) | External Telecommunications Services | Managed interface for each external telecom service | Network architecture |
| SC-7(5) | Deny by Default/Allow by Exception | Deny network traffic by default at managed interfaces | Network architecture |
| SC-7(7) | Prevent Split Tunneling | Prevent split tunneling for remote devices | Infrastructure/endpoint |
| SC-7(8) | Route Traffic to Authenticated Proxy | Route internal traffic to external networks through proxy | Network architecture |
| SC-7(12) | Host-Based Protection | Implement host-based boundary protection | Infrastructure/endpoint |
| SC-7(13) | Isolation of Security Tools | Isolate security tools on separate sub-networks | Network architecture |
| SC-8 | Transmission Confidentiality and Integrity | Protect confidentiality/integrity of transmitted info | Covered by ENC standards |
| SC-8(1) | Cryptographic or Alternate Physical Protection | Implement crypto per SC-13 for transmission protection | Covered by ENC |
| SC-10 | Network Disconnect | Terminate connections: 30 min RAS, 60 min non-interactive | Infrastructure |
| SC-12 | Cryptographic Key Establishment/Management | Establish/manage keys per CSE-approved crypto | Covered by SEC-003 |
| SC-12(1) | Availability | Maintain info availability in event of key loss | Infrastructure |
| SC-12(2) | Symmetric Keys | Produce/control symmetric keys per CSE-compliant processes | Infrastructure |
| SC-12(3) | Asymmetric Keys | Produce/control asymmetric keys per CSE-approved processes | Infrastructure |
| SC-13 | Cryptographic Protection | Implement CSE-approved cryptography | Covered by ENC |
| SC-15 | Collaborative Computing Devices | Prohibit remote activation; provide use indication | Infrastructure/endpoint |
| SC-17 | PKI Certificates | Issue/obtain certificates per policy | Infrastructure |
| SC-18 | Mobile Code | Define acceptable/unacceptable mobile code technologies | Organizational policy |
| SC-18(3) | Prevent Downloading/Execution | Prevent download/execution of unacceptable mobile code | Infrastructure/endpoint |
| SC-18(4) | Prevent Automatic Execution | Prevent automatic execution of mobile code | Infrastructure/endpoint |
| SC-19 | Voice over Internet Protocol | Establish VoIP usage restrictions and guidance | Organizational policy |
| SC-20 | Secure Name Resolution (Authoritative) | Data origin authentication for DNS responses | Infrastructure (DNS) |
| SC-21 | Secure Name Resolution (Recursive/Caching) | Data origin authentication on DNS responses | Infrastructure (DNS) |
| SC-22 | Architecture for Name Resolution | Fault-tolerant DNS with internal/external role separation | Infrastructure (DNS) |
| SC-23 | Session Authenticity | Protect authenticity of communications sessions | Covered by SESSION-001 |
| SC-39 | Process Isolation | Maintain separate execution domain for each process | OS/infrastructure |

#### SI (System and Information Integrity) -- 23 unique

| Control ID | Title | Summary | Notes |
|---|---|---|---|
| SI-3 | Malicious Code Protection | Employ malware protection at entry/exit points | Infrastructure |
| SI-3(1) | Central Management | Centrally manage malware protection | Infrastructure |
| SI-3(2) | Automatic Updates | Automatically update malware protection | Infrastructure |
| SI-3(7) | Non-Signature-Based Detection | Implement non-signature malware detection | Infrastructure |
| SI-4 | Information System Monitoring | Monitor system for attacks and unauthorized connections | Infrastructure/tooling |
| SI-4(1) | System-Wide Intrusion Detection | Connect IDS tools into system-wide IDS | Infrastructure |
| SI-4(2) | Automated Tools for Real-Time Analysis | Employ tools for near real-time analysis | Infrastructure/tooling |
| SI-4(4) | Inbound and Outbound Traffic | Monitor traffic continuously for anomalies | Infrastructure |
| SI-4(5) | System-Generated Alerts | Alert personnel on indicators of compromise | Infrastructure/tooling |
| SI-4(7) | Automated Response to Suspicious Events | Automated least-disruptive actions on suspicious events | Infrastructure/tooling |
| SI-4(11) | Analyze Traffic Anomalies | Analyze outbound traffic for anomalies | Infrastructure/tooling |
| SI-4(14) | Wireless Intrusion Detection | Wireless IDS for rogue devices and attacks | Infrastructure |
| SI-4(16) | Correlate Monitoring Information | Correlate info from monitoring tools system-wide | Infrastructure/tooling |
| SI-4(20) | Privileged User | Implement privileged user authorization per IAM policies | Organizational process |
| SI-4(23) | Host-Based Devices | System logging on components running general-purpose OS | Infrastructure |
| SI-7(7) | Integration of Detection and Response | Incorporate unauthorized change detection into IR capability | Operational/tooling |
| SI-8 | Spam Protection | Employ spam protection at entry/exit points | Infrastructure |
| SI-8(1) | Central Management | Centrally manage spam protection | Infrastructure |
| SI-8(2) | Automatic Updates | Automatically update spam protection | Infrastructure |
| SI-10 | Information Input Validation | Check validity of information inputs | Covered by ASVS V5 |
| SI-11 | Error Handling | Generate error messages without revealing exploitable info | Covered by ASVS V7 |
| SI-12 | Information Output Handling/Retention | Handle/retain info per organizational policies | Organizational process |
| SI-16 | Memory Protection | Safeguards to protect memory from unauthorized code execution | OS/infrastructure (DEP, ASLR) |

### Controls Unique to Protected B (Human Process) -- 6 controls

#### AC (Access Control) -- 1 unique

| Control ID | Title | Summary | organizational Status | Notes |
|---|---|---|---|---|
| AC-2(9) | Restrictions on Shared/Group Accounts | Permit shared accounts only under defined conditions | Met (organization prohibits) | *See Cross-Classification Notes* |

#### SI (System and Information Integrity) -- 1 unique

| Control ID | Title | Summary | organizational Status | Notes |
|---|---|---|---|---|
| SI-6 | Security Function Verification | Verify security function operation at startup and monthly | Met | *See Cross-Classification Notes* |

#### Secure SDLC (ASVS Custom) -- 4 unique

| Control ID | Title | Summary | organizational Status |
|---|---|---|---|
| ASVS-SDLC-1 | Threat Modeling | Maintain current threat model to guide countermeasures | Each solution |
| ASVS-SDLC-2 | Threat Model Contents | Threat model contains trust boundaries, components, information flows | Each solution |
| ASVS-SDLC-3 | Secure Coding | Secure coding policy/checklist used in development | Each solution |
| ASVS-DESIGN-15 | Re-encryption | Defined process for re-encrypting data when keys change | Each solution |

---

## Cross-Classification Notes

Two controls are classified differently between the two frameworks' analyses:

| Control ID | PB Classification | CCCS Classification | Explanation |
|---|---|---|---|
| AC-2(9) | Human process (Met -- organizational prohibits shared accounts) | AI-implementable gap (CCCS Gap 19) | PB treats this as an organizational policy (already met). CCCS identifies an application-level need: apps that support shared/group accounts must manage credential rotation when members leave. |
| SI-6 | Human process (Met) | AI-implementable gap (CCCS Gap 22) | PB treats this as an operational verification process (already met at infrastructure level). CCCS identifies an application-level need: apps should implement startup health checks for security functions. |

**Implication:** These controls have both human/organizational and AI-implementable aspects. The AI-implementable aspects are addressed in `unified_ai_implementable_gaps.md` (Gaps 19 and 22). The human/organizational aspects remain in this document.

---

## Full Unified Controls by Family

### Access Control (AC) -- Policy and Organizational

*18 controls in both frameworks + 12 CCCS only + 1 PB only = 31 total*

| Control ID | Title | Summary | Source | organizational Status |
|---|---|---|---|---|
| AC-1 | Access Control Policy and Procedures | Develop, document, disseminate AC policy; review every 3 years | Both | Met |
| AC-2 | Account Management | Identify account types, assign managers, establish conditions, monitor use, review annually | **CCCS** | -- |
| AC-2(1) | Automated System Account Management | Employ automated mechanisms to support account management | **CCCS** | -- |
| AC-2(5) | Inactivity Logout | Require users to log out at end of work period | **CCCS** | -- |
| AC-2(7) | Role-Based Schemes | Establish/administer privileged accounts per role-based scheme; revoke within 24 hours | **CCCS** | -- |
| AC-2(9) | Restrictions on Shared/Group Accounts | Permit shared accounts only under defined conditions | **PB** | Met (organization prohibits) |
| AC-4 | Information Flow Enforcement | Enforce approved authorizations for controlling info flow (deny all, approve by exception) | **CCCS** | -- |
| AC-4(21) | Physical/Logical Separation of Info Flows | Separate info flows via session encryption | **CCCS** | -- |
| AC-6(1) | Authorize Access to Security Functions | Explicitly authorize access to all security functions not publicly accessible | **CCCS** | -- |
| AC-6(5) | Privileged Accounts | Restrict privileged accounts to minimum personnel | **CCCS** | -- |
| AC-6(9) | Auditing Use of Privileged Functions | Audit execution of privileged functions | **CCCS** | -- |
| AC-6(10) | Prohibit Non-Privileged Executing Privileged Functions | Prevent non-privileged users from executing privileged functions | **CCCS** | -- |
| AC-11 | Session Lock | Initiate session lock after 15 minutes of inactivity | **CCCS** | -- |
| AC-11(1) | Pattern-Hiding Displays | Conceal info via session lock with publicly viewable image | **CCCS** | -- |
| AC-14 | Permitted Actions Without Authentication | Identify and document actions not requiring authentication | Both | Each solution |
| AC-17 | Remote Access | Establish and document remote access restrictions/requirements | Both | Met |
| AC-17(1) | Automated Monitoring/Control | Monitor and control remote access methods | Both | Met |
| AC-17(2) | Protection of Confidentiality/Integrity via Encryption | Implement cryptographic mechanisms for remote access | Both | Met |
| AC-17(3) | Managed Access Control Points | Route all remote access through approved managed points | Both | Met |
| AC-17(4) | Privileged Commands/Access | Authorize execution of privileged commands via remote access | Both | Met |
| AC-17(9) | Disconnect/Disable Access | Capability to disconnect/disable remote access within 15 minutes | Both | Met |
| AC-17(100) | Dedicated Management Console | Remote access to privileged accounts on dedicated management consoles | Both | Partial (cloud gap) |
| AC-18 | Wireless Access | Establish usage restrictions, authorize wireless access | Both | Met |
| AC-18(1) | Authentication and Encryption | Protect wireless access using auth and encryption | Both | Met |
| AC-18(4) | Restrict Configurations by Users | Authorize users allowed to configure wireless | Both | Met |
| AC-19 | Access Control for Mobile Devices | Establish usage restrictions, authorize mobile device connections | Both | Met |
| AC-20 | Use of External Information Systems | Establish terms/conditions for external system access | Both | Met |
| AC-20(1) | Limits on Authorized Use | Verify security controls on external systems before permitting access | Both | Partial |
| AC-20(2) | Portable Storage Devices | Restrict org-controlled portable devices on external systems | Both | Met |
| AC-21 | User-Based Information Sharing | Enable authorized users to determine access authorization matches | Both | Met |
| AC-22 | Publicly Accessible Content | Designate authorized posters; train; review content quarterly | Both | Met |

---

### Awareness and Training (AT)

*All 5 controls appear in both frameworks.*

| Control ID | Title | Summary | organizational Status |
|---|---|---|---|
| AT-1 | Security Awareness and Training Policy | Develop, document, disseminate training policy; review every 3 years | Met |
| AT-2 | Security Awareness Training | Basic security awareness training; initial + annual | Met |
| AT-2(2) | Insider Threat | Include insider threat recognition in awareness training | **Not Met** |
| AT-3 | Role-Based Security Training | Role-based training before access and annually | **Not Met** |
| AT-4 | Security Training Records | Document and monitor training; retain records 1 year | Met |

---

### Audit and Accountability (AU)

*All 13 controls are unique to the CCCS Medium analysis. The PB analysis did not include a separate AU human process section; AU controls in PB were classified as AI-implementable gaps (AU-3, AU-3(1), AU-5, AU-9(4), AU-11) or already covered.*

| Control ID | Title | Summary | Source | Why Human/Operational |
|---|---|---|---|---|
| AU-1 | Audit and Accountability Policy | Develop, document, disseminate audit policy | **CCCS** | Policy development |
| AU-2 | Auditable Events | Determine auditable events; coordinate audit function; provide rationale | **CCCS** | Organizational determination |
| AU-2(3) | Reviews and Updates | Review and update audited events annually or on threat change | **CCCS** | Organizational review |
| AU-6 | Audit Review, Analysis, Reporting | Review/analyze audit records every 7 days for indicators of compromise | **CCCS** | Human analysis process |
| AU-6(1) | Process Integration | Automated mechanisms to integrate audit review processes | **CCCS** | Infrastructure/tooling |
| AU-6(3) | Correlate Audit Repositories | Correlate analysis across repositories for situational awareness | **CCCS** | Infrastructure/tooling |
| AU-7 | Audit Reduction and Report Generation | On-demand audit review/analysis capability | **CCCS** | Infrastructure/tooling |
| AU-7(1) | Automatic Processing | Process audit records for events of interest | **CCCS** | Infrastructure/tooling |
| AU-8 | Time Stamps | Internal clocks mapped to UTC within 1 second | **CCCS** | Infrastructure configuration |
| AU-8(1) | Synchronization with Authoritative Source | Compare clocks every 24 hours; sync when >1ms difference | **CCCS** | Infrastructure configuration |
| AU-9 | Protection of Audit Information | Protect audit info from unauthorized access/modification/deletion | **CCCS** | Covered by LOG-002 |
| AU-9(2) | Audit Backup on Separate Systems | Back up audit records weekly to separate system | **CCCS** | Infrastructure |
| AU-12 | Audit Generation | Provide audit generation capability for defined events | **CCCS** | Covered by LOG-001 |

---

### Assessment / Authorization / Monitoring (CA)

*All 15 controls appear in both frameworks.*

| Control ID | Title | Summary | organizational Status |
|---|---|---|---|
| CA-1 | Security Assessment and Authorization Policy | Develop, document, disseminate SA&A policy; review every 3 years | Met (?) |
| CA-2 | Security Assessments | Develop assessment plan; assess controls annually; produce report | Met (?) |
| CA-2(1) | Independent Assessors | Use external independent organization for assessments | Met (?) |
| CA-2(2) | Specialized Assessments | Annual vulnerability scanning and penetration testing | Met |
| CA-2(3) | External Organizations | CSP accepts external assessment results | N/A |
| CA-3 | System Interconnections | Authorize connections via ISAs; document interfaces; review annually | **Not Met** |
| CA-3(3) | Unclassified Non-National Security Connections | Prohibit direct internal-external connections without approved controls | Met |
| CA-3(5) | Restrictions on External System Connections | Allow-all/deny-by-exception or deny-all policy | Met |
| CA-5 | Plan of Action and Milestones | Develop POA&M for remediation; update monthly | Met |
| CA-6 | Security Authorization | Assign authorizing official; authorize before operations; update every 3 years | Met (partial) |
| CA-7 | Continuous Monitoring | Develop strategy; implement program; monthly scans minimum | Met (partial) |
| CA-7(1) | Independent Assessment | Use fully independent assessors for ongoing monitoring | **Not Met** |
| CA-8 | Penetration Testing | Conduct penetration testing annually | Met |
| CA-8(1) | Independent Penetration Testing | Use independent penetration agent or team | Met |
| CA-9 | Internal System Connections | Authorize and document internal system connections | **Not Met** |

---

### Configuration Management (CM)

*All 29 controls appear in both frameworks.*

| Control ID | Title | Summary | organizational Status |
|---|---|---|---|
| CM-1 | Configuration Management Policy | Develop, document, disseminate CM policy; review every 3 years | Met |
| CM-2 | Baseline Configuration | Develop, document, maintain baseline configuration | Each solution |
| CM-2(1) | Reviews and Updates | Review/update baseline annually or on significant changes | Each solution |
| CM-2(2) | Automation Support | Automated mechanisms for baseline maintenance | Met |
| CM-2(3) | Retention of Previous Configurations | Retain 2 most recent baseline versions for rollback | **Not Met** |
| CM-2(7) | High-Risk Areas | Issue devices with specific configs for high-risk travel | Unknown |
| CM-3 | Configuration Change Control | Determine, review, approve, implement, audit changes | Met |
| CM-3(4) | Security Representative | Security representative on change control board | Met |
| CM-3(6) | Cryptography Management | Crypto mechanisms under configuration management | Met |
| CM-4 | Security Impact Analysis | Analyze changes for security impacts before implementation | **Not Met** |
| CM-5 | Access Restrictions for Change | Define, document, enforce access restrictions for changes | Met |
| CM-5(1) | Automated Enforcement/Auditing | Enforce and audit access restrictions for changes | Each solution |
| CM-5(5) | Limit Production/Operational Privileges | Limit privileges to change production; review quarterly | **Not Met** |
| CM-5(6) | Limit Library Privileges | Limit privileges to change software in libraries | **Not Met** |
| CM-6 | Configuration Settings | Establish settings per CIS/NIST/DISA benchmarks | **Not Met** |
| CM-6(1) | Automated Central Management | Centrally manage, apply, verify configuration settings | **Not Met** |
| CM-6(2) | Respond to Unauthorized Changes | Safeguards for unauthorized configuration changes | **Not Met** |
| CM-7 | Least Functionality | Configure for required capabilities only; restrict functions/ports/protocols | **Not Met** |
| CM-7(1) | Periodic Review | Annual review of unnecessary functions/ports/protocols | **Not Met** |
| CM-7(5) | Authorized Software/Whitelisting | Deny-all/permit-by-exception software execution policy | **Not Met** |
| CM-8 | Component Inventory | Maintain component inventory; review monthly | **Not Met** |
| CM-8(1) | Updates During Installations/Removals | Update inventory during installs/removals | **Not Met** |
| CM-8(2) | Automated Maintenance | Automated mechanisms for inventory maintenance | Met |
| CM-8(3) | Automated Unauthorized Component Detection | Detect unauthorized components within 5 minutes | **Not Met** |
| CM-8(5) | No Duplicate Accounting | Verify no duplicate component accounting | **Not Met** |
| CM-9 | Configuration Management Plan | Develop, document, implement CM plan | Each solution |
| CM-10 | Software Usage Restrictions | Use software per contracts/copyright; track licenses | Met |
| CM-10(1) | Open Source Software | Establish restrictions on open source software use | **Not Met** |
| CM-11 | User-Installed Software | Establish policies governing software installation | Met |

---

### Contingency Planning (CP)

*All controls appear in both frameworks. PB used combined rows (CP-7(1-4), CP-8(1-5), CP-9(1-7)); CCCS lists sub-controls individually. The individual CCCS listing is used below.*

| Control ID | Title | Summary | organizational Status |
|---|---|---|---|
| CP-1 | Contingency Planning Policy | Develop, document, disseminate CP policy; review every 3 years | Met |
| CP-2 | Contingency Plan | Develop plan with recovery objectives, roles, restoration priorities | Each solution |
| CP-2(1) | Coordinate with Related Plans | Coordinate CP with related organizational plans | Met |
| CP-2(2) | Capacity Planning | Conduct capacity planning for contingency operations | Each solution |
| CP-2(3) | Resume Critical Functions within 24 Hours | Plan for 24-hour resumption of critical functions | Met |
| CP-2(4) | Resume All Functions | Plan for full resumption within defined period | Met |
| CP-2(5) | Continue Critical Functions | Continuance with little/no loss of operational continuity | Met |
| CP-2(6) | Alternate Processing/Storage Site | Plan for transfer to alternate sites | Each solution |
| CP-2(8) | Identify Critical Assets | Identify critical information system assets | Each solution |
| CP-3 | Contingency Training | Provide training within 10 days of role assignment, annually | Met |
| CP-4 | Contingency Plan Testing | Test contingency plan annually | Met |
| CP-4(1) | Coordinate with Related Plans | Coordinate testing with related plan owners | Met |
| CP-4(2) | Alternate Processing Site | Test CP at alternate processing site | Met |
| CP-6 | Alternate Storage Site | Establish alternate storage site with equivalent security | Met |
| CP-6(1) | Separation from Primary Site | Maintain geographic separation from primary | Met |
| CP-6(2) | Recovery Times/Point Objectives | Configure alternate site for RTO/RPO | Each solution |
| CP-6(3) | Accessibility | Identify accessibility problems for area-wide disruptions | Met |
| CP-7 | Alternate Processing Site | Establish alternate processing site for critical operations | Met |
| CP-7(1) | Separation from Primary Site | Maintain geographic separation | Met |
| CP-7(2) | Accessibility | Identify accessibility problems | Met |
| CP-7(3) | Priority of Service | Develop priority-of-service agreements | Met |
| CP-7(4) | Preparation for Use | Prepare alternate site for operational use | Met |
| CP-8 | Telecommunications Services | Establish alternate telecom for critical operations | Met |
| CP-8(1) | Priority of Service Provisions | Develop priority-of-service telecom agreements | Met |
| CP-8(2) | Single Points of Failure | Reduce shared single points of failure | Met |
| CP-8(3) | Separation of Primary/Alternate Providers | Separate telecom providers to reduce shared threats | Met |
| CP-8(5) | Alternate Telecommunication Testing | Test alternate telecom services annually | Met |
| CP-9 | Information System Backup | Daily incremental, weekly full backups; protect backup info | Met |
| CP-9(1) | Testing for Reliability/Integrity | Test backup info annually | Met |
| CP-9(2) | Test Restoration Using Sampling | Use backup sample in restoration testing | Met |
| CP-9(3) | Separate Storage for Critical Information | Store backup copies in separate facility | Met |
| CP-9(5) | Transfer to Alternate Storage Site | Transfer backup info per RTO/RPO | Met |
| CP-9(7) | Dual Authorization | Dual authorization for backup deletion/destruction | Met |
| CP-10 | System Recovery and Reconstitution | Recover and reconstitute to known state | Met |
| CP-10(2) | Transaction Recovery | Transaction recovery for transaction-based systems | Each solution |
| CP-10(4) | Restore within Time Period | Restore components within defined period from known-good state | Met |

---

### Identification and Authentication (IA)

*7 controls in both frameworks + 12 CCCS only = 19 total*

| Control ID | Title | Summary | Source | organizational Status |
|---|---|---|---|---|
| IA-1 | IA Policy and Procedures | Develop, document, disseminate IA policy; review every 3 years | Both | Met |
| IA-2 | ID and Auth (Organizational Users) | Uniquely identify and authenticate organizational users | **CCCS** | Covered by AUTH-001/002 |
| IA-3 | Device Identification and Authentication | Uniquely identify/authenticate devices before network connection | **CCCS** | Infrastructure |
| IA-4 | Identifier Management | Manage identifiers: authorize, assign, prevent reuse (2 yrs), disable after 90 days | Both | Met (partial D, E) |
| IA-4(2) | Supervisor Authorization | Require supervisor authorization for identifier registration | Both | Met |
| IA-4(3) | Multiple Forms of Certification | Require multiple forms of ID for registration | Both | Met |
| IA-4(4) | Identify User Status | Uniquely identify user status (employee, contractor, etc.) | Both | Met |
| IA-5 | Authenticator Management | Manage authenticators: verify identity, establish content, protect | **CCCS** | Organizational process |
| IA-5(1) | Password-Based Authentication | Enforce password complexity and lifetime requirements | **CCCS** | See policy tension note |
| IA-5(2) | PKI-Based Authentication | Validate certifications, enforce private key access | **CCCS** | Infrastructure |
| IA-5(3) | In-Person Registration | Require in-person registration process | Both | Met |
| IA-5(4) | Automated Password Strength | Automated tools for password strength determination | **CCCS** | Infrastructure/tooling |
| IA-5(6) | Protection of Authenticators | Protect authenticators per security category | **CCCS** | Organizational/infrastructure |
| IA-5(7) | No Embedded Unencrypted Static Authenticators | No unencrypted static authenticators in apps/scripts | **CCCS** | Covered by SEC-001/002 |
| IA-5(8) | Multiple System Accounts | Manage risk of compromise from accounts on multiple systems | Both | Met |
| IA-5(11) | Hardware Token-Based Authentication | Mechanisms satisfying CCCS ITSP.30.031 token requirements | **CCCS** | Infrastructure |
| IA-6 | Authenticator Feedback | Obscure feedback of authentication info | **CCCS** | Covered by ASVS V2 |
| IA-7 | Cryptographic Module Authentication | Implement mechanisms for authentication to crypto modules | **CCCS** | Infrastructure |
| IA-8 | ID and Auth (Non-Org Users) | Uniquely identify and authenticate non-organizational users | **CCCS** | Covered by AUTH-002/003 |

---

### Incident Response (IR)

*All 19 controls appear in both frameworks.*

| Control ID | Title | Summary | organizational Status |
|---|---|---|---|
| IR-1 | Incident Response Policy | Develop, document, disseminate IR policy; review every 3 years | Met |
| IR-2 | Incident Response Training | IR training within 30 days of role assignment, annually | Met |
| IR-3 | Incident Response Testing | Test IR capability annually per NIST SP 800-61 | **Not Met** |
| IR-3(2) | Coordination with Related Plans | Coordinate IR testing with related plan owners | Unknown |
| IR-4 | Incident Handling | Implement capability: preparation, detection, containment, eradication, recovery | Met |
| IR-4(1) | Automated Incident Handling | Automated mechanisms for IR process support | Met |
| IR-4(3) | Continuity of Operations | Identify incident classes and response actions | Met |
| IR-5 | Incident Monitoring | Track and document security incidents | Met |
| IR-6 | Incident Reporting | Report suspected incidents within 2 hours | Met |
| IR-6(1) | Automated Reporting | Automated mechanisms for IR reporting | Met |
| IR-7 | Incident Response Assistance | Provide IR support resource for users | Met |
| IR-7(1) | Automation Support for Availability | Automated mechanisms for IR info availability | Met |
| IR-7(2) | Coordination with External Providers | Cooperative relationships with external providers | Met |
| IR-8 | Incident Response Plan | Develop IR plan with structure, approach, metrics, resources | Met |
| IR-9 | Information Spillage Response | Respond to spills: identify, alert, isolate, eradicate | Unknown |
| IR-9(1) | Responsible Personnel | Assign personnel responsible for spillage response | Met |
| IR-9(2) | Training | Provide spillage response training annually | Unknown |
| IR-9(3) | Post-Spill Operations | Procedures for continued operations during corrective actions | Unknown |
| IR-9(4) | Exposure to Unauthorized Personnel | Safeguards for personnel exposed to unauthorized info | Unknown |

---

### Maintenance (MA)

*All 14 controls appear in both frameworks.*

| Control ID | Title | Summary | organizational Status |
|---|---|---|---|
| MA-1 | System Maintenance Policy | Develop, document, disseminate maintenance policy; review every 3 years | Met |
| MA-2 | Controlled Maintenance | Schedule, perform, document maintenance; approve off-site removal | Partial |
| MA-3 | Maintenance Tools | Approve, control, monitor maintenance tools | Unknown |
| MA-3(1) | Inspect Tools | Inspect tools for unauthorized modifications | Unknown |
| MA-3(2) | Inspect Media | Check diagnostic media for malicious code | Unknown |
| MA-3(3) | Prevent Unauthorized Removal | Prevent unauthorized removal of equipment with org info | Met |
| MA-4 | Non-Local Maintenance | Approve/monitor non-local maintenance; use strong authenticators | Met |
| MA-4(1) | Auditing and Review | Audit non-local maintenance sessions; review records | Unknown |
| MA-4(2) | Documentation | Document policies for non-local maintenance connections | Each solution |
| MA-4(3) | Comparable Security/Sanitization | Comparable security for non-local maintenance systems | Met |
| MA-4(6) | Cryptographic Protection | Encrypt non-local maintenance communications | Met |
| MA-5 | Maintenance Personnel | Maintain list of authorized maintenance organizations/personnel | Met |
| MA-5(1) | Without Appropriate Access | Escort/supervise maintenance personnel without clearances | Unknown |
| MA-6 | Timely Maintenance | Obtain maintenance support/spare parts for availability | Unknown |

---

### Media Protection (MP)

*All 14 controls appear in both frameworks.*

| Control ID | Title | Summary | organizational Status |
|---|---|---|---|
| MP-1 | Media Protection Policy | Develop, document, disseminate media protection policy | Met |
| MP-2 | Media Access | Restrict access to media containing non-public information | Met |
| MP-3 | Media Marking | Mark media with distribution limitations and security markings | Partial |
| MP-4 | Media Storage | Physically control and securely store media | Partial |
| MP-5 | Media Transport | Protect and control media during transport | Partial |
| MP-5(4) | Cryptographic Protection | Encrypt digital media during transport per SC-13 | Partial |
| MP-6 | Media Sanitization | Sanitize media before disposal/release/reuse | Met |
| MP-6(1) | Review/Approve/Track/Document/Verify | Full lifecycle tracking of sanitization | Met |
| MP-6(2) | Equipment Testing | Test sanitization equipment annually | Unknown |
| MP-6(3) | Non-destructive Techniques | Non-destructive sanitization for portable storage | Unknown |
| MP-7 | Media Use | Prohibit unauthorized removable media via technical safeguards | **Not Met** |
| MP-7(1) | Prohibit Use Without Owner | Prohibit unidentified portable storage devices | **Not Met** |
| MP-8 | Media Downgrading | Establish media downgrading process | Unknown |
| MP-8(1) | Documentation | Document media downgrading actions | Unknown |

---

### Physical and Environmental Protection (PE)

*All 22 controls appear in both frameworks.*

| Control ID | Title | Summary | organizational Status |
|---|---|---|---|
| PE-1 | Physical and Environmental Protection Policy | Develop, document, disseminate PE policy | Met |
| PE-2 | Physical Access Authorizations | Maintain authorized access list; issue credentials; review annually | Met |
| PE-3 | Physical Access Control | Verify authorizations; control ingress/egress; maintain audit logs | Met |
| PE-3(1) | Information System Access | Physical access authorizations for system component spaces | Met |
| PE-4 | Access Control for Transmission Medium | Control physical access to transmission lines | Unknown |
| PE-5 | Access Control for Output Devices | Control physical access to output devices | **Not Met** |
| PE-6 | Monitoring Physical Access | Monitor physical access; review logs monthly | Met |
| PE-6(1) | Intrusion Alarms/Surveillance | Monitor alarms and surveillance equipment | Met |
| PE-6(4) | System-Specific Monitoring | Monitor physical access to information systems specifically | Met |
| PE-8 | Visitor Access Records | Maintain visitor records for 1 year; review monthly | Met |
| PE-9 | Power Equipment and Cabling | Protect power equipment/cabling from damage | Met |
| PE-10 | Emergency Shutoff | Provide emergency power shutoff capability | Met |
| PE-11 | Emergency Power | Short-term UPS for transition to alternate power | Met |
| PE-12 | Emergency Lighting | Automatic emergency lighting for exits/evacuation routes | Met |
| PE-13 | Fire Protection | Fire suppression and detection with independent power | Met |
| PE-13(2) | Suppression Devices/Systems | Automatic notification on activation | Met |
| PE-13(3) | Automatic Suppression | Automatic suppression when facility is unstaffed | Met |
| PE-14 | Temperature and Humidity Controls | Maintain and continuously monitor acceptable levels | Met |
| PE-14(2) | Monitoring with Alarms | Alarm/notification for harmful changes | Met |
| PE-15 | Water Damage Protection | Master shutoff/isolation valves accessible and known | Met |
| PE-16 | Delivery and Removal | Authorize, monitor, control component movement | Met |
| PE-17 | Alternate Work Site | Security controls at alternate work sites; assess effectiveness | Met |

---

### Planning (PL)

*All 6 controls appear in both frameworks.*

| Control ID | Title | Summary | organizational Status |
|---|---|---|---|
| PL-1 | Security Planning Policy | Develop, document, disseminate planning policy | Met |
| PL-2 | System Security Plan | Develop security plan consistent with enterprise architecture | Each solution |
| PL-2(3) | Coordinate with Other Entities | Coordinate security activities with other entities | Each solution |
| PL-4 | Rules of Behaviour | Establish rules of behaviour; obtain signed acknowledgement | **Not Met** |
| PL-4(1) | Social Media Restrictions | Restrict social media/networking and public posting of org info | Met |
| PL-8 | Information Security Architecture | Develop security architecture; review annually | Each solution |

---

### Personnel Security (PS)

*All 9 controls appear in both frameworks.*

| Control ID | Title | Summary | organizational Status |
|---|---|---|---|
| PS-1 | Personnel Security Policy | Develop, document, disseminate personnel security policy | Met |
| PS-2 | Position Risk Designation | Categorize positions by harm potential; select screening; review annually | Unknown |
| PS-3 | Personnel Screening | Screen individuals before authorizing access; rescreen per TBS standard | Met |
| PS-3(3) | Special Protection Measures | Valid access authorizations for special-protection info | Met |
| PS-4 | Personnel Termination | Disable access same day; revoke credentials; exit interview; retrieve property | Met |
| PS-5 | Personnel Transfer | Review access on transfer; modify within 5 days; notify manager | Partial |
| PS-6 | Access Agreements | Develop/document access agreements; review annually; signed acknowledgement | **Not Met** |
| PS-7 | Third-Party Personnel Security | Establish 3rd-party security requirements; monitor compliance | Partial |
| PS-8 | Personnel Sanctions | Formal sanctions process for non-compliance; notify within 1 day | Unknown |

---

### Risk Assessment (RA)

*All 10 controls appear in both frameworks.*

| Control ID | Title | Summary | organizational Status |
|---|---|---|---|
| RA-1 | Risk Assessment Policy | Develop, document, disseminate RA policy; review every 3 years | Met |
| RA-2 | Security Categorization | Categorize information and systems; document rationale; obtain approval | Met |
| RA-3 | Risk Assessment | Conduct risk assessment; document results; review annually | Met |
| RA-5 | Vulnerability Scanning | Monthly scanning (OS/web/DB); analyze results; remediate per benchmarks | Partial |
| RA-5(1) | Update Tool Capability | Scanning tools with updatable vulnerability definitions | Met |
| RA-5(2) | Update Before Scan | Update vulnerability definitions before new scans | Met |
| RA-5(3) | Breadth/Depth Coverage | Procedures identifying breadth and depth of scanning | Met |
| RA-5(5) | Privileged Access | Privileged access scanning for OS, web apps, databases | Met |
| RA-5(6) | Automated Trend Analyses | Automated comparison of scan results over time | Unknown |
| RA-5(8) | Review Historic Audit Logs | Determine if identified vulnerabilities were exploited | Unknown |

---

### System and Services Acquisition (SA)

*All 22 controls appear in both frameworks.*

| Control ID | Title | Summary | organizational Status |
|---|---|---|---|
| SA-1 | SA Policy and Procedures | Develop, document, disseminate SA policy; review every 3 years | Met |
| SA-2 | Allocation of Resources | Determine security requirements in planning; allocate resources | Partial |
| SA-3 | System Development Lifecycle | Manage system using SDLC with security considerations | Each solution |
| SA-4 | Acquisition Process | Include security requirements in acquisition contracts | Each solution |
| SA-4(1) | Functional Properties of Security Controls | Require description of security control functional properties | Each solution |
| SA-4(2) | Design/Implementation Information | Require design/implementation info for security controls | Each solution |
| SA-4(8) | Continuous Monitoring Plan | Require developer continuous monitoring plan | Each solution |
| SA-4(9) | Functions/Ports/Protocols/Services | Require identification early in SDLC | Each solution |
| SA-5 | Information System Documentation | Obtain admin and user documentation | Each solution |
| SA-8 | Security Engineering Principles | Apply security engineering principles in design/development | Each solution |
| SA-9 | External Information System Services | Require external providers to comply with security requirements | Met |
| SA-9(1) | Risk Assessments/Approvals | Risk assessment before outsourcing; CIO approval | Met |
| SA-9(2) | Identification of Functions/Ports/Protocols | Require external providers to identify functions/ports/protocols | **Not Met** |
| SA-9(4) | Consistent Interests | Align external provider interests with organizational interests | Unknown |
| SA-9(5) | Processing/Storage Location | Restrict to Canadian locations per ITPIN 2017-02 | -- |
| SA-10 | Developer Configuration Management | Require developer CM during SDLC | Partial |
| SA-10(1) | Software/Firmware Integrity Verification | Enable integrity verification of software/firmware | **Not Met** |
| SA-11 | Developer Security Testing | Require security assessment plan and testing | **Not Met** |
| SA-11(1) | Static Code Analysis | Require static code analysis tools | **Not Met** |
| SA-11(2) | Threat/Vulnerability Analysis | Require threat/vulnerability analysis of as-built system | **Not Met** |
| SA-11(8) | Dynamic Code Analysis | Require dynamic code analysis tools | **Not Met** |
| SA-15 | Development Process, Standards, Tools | Require documented development process addressing security | **Not Met** |

---

### System and Communications Protection (SC)

*All 31 controls are unique to the CCCS Medium analysis. The PB analysis did not include a separate SC human process section; SC controls in PB were classified as AI-implementable gaps (SC-2, SC-7(18), SC-28) or already covered by skill files.*

| Control ID | Title | Summary | Source | Why Human/Operational |
|---|---|---|---|---|
| SC-1 | SC Policy and Procedures | Develop, document, disseminate SC policy | **CCCS** | Policy development |
| SC-4 | Information in Shared Resources | Prevent unauthorized info transfer via shared resources | **CCCS** | Infrastructure |
| SC-5 | Denial of Service Protection | Protect against/limit DoS | **CCCS** | Covered by BOT-001/WAF-001 |
| SC-6 | Resource Availability | Protect availability by allocating resources by priority/quota | **CCCS** | Infrastructure |
| SC-7 | Boundary Protection | Monitor/control communications at boundaries; DMZ for public | **CCCS** | Infrastructure |
| SC-7(3) | Access Points | Limit external network connection points | **CCCS** | Network architecture |
| SC-7(4) | External Telecom Services | Managed interface for each external telecom service | **CCCS** | Network architecture |
| SC-7(5) | Deny by Default/Allow by Exception | Deny network traffic by default at managed interfaces | **CCCS** | Network architecture |
| SC-7(7) | Prevent Split Tunneling | Prevent split tunneling for remote devices | **CCCS** | Infrastructure/endpoint |
| SC-7(8) | Route Traffic to Authenticated Proxy | Route internal traffic to external networks through proxy | **CCCS** | Network architecture |
| SC-7(12) | Host-Based Protection | Implement host-based boundary protection | **CCCS** | Infrastructure/endpoint |
| SC-7(13) | Isolation of Security Tools | Isolate security tools on separate sub-networks | **CCCS** | Network architecture |
| SC-8 | Transmission Confidentiality/Integrity | Protect confidentiality/integrity of transmitted info | **CCCS** | Covered by ENC standards |
| SC-8(1) | Cryptographic/Alternate Physical Protection | Implement crypto per SC-13 for transmission protection | **CCCS** | Covered by ENC |
| SC-10 | Network Disconnect | Terminate connections: 30 min RAS, 60 min non-interactive | **CCCS** | Infrastructure |
| SC-12 | Cryptographic Key Establishment/Management | Establish/manage keys per CSE-approved crypto | **CCCS** | Covered by SEC-003 |
| SC-12(1) | Availability | Maintain info availability in event of key loss | **CCCS** | Infrastructure |
| SC-12(2) | Symmetric Keys | Produce/control symmetric keys per CSE-compliant processes | **CCCS** | Infrastructure |
| SC-12(3) | Asymmetric Keys | Produce/control asymmetric keys per CSE-approved processes | **CCCS** | Infrastructure |
| SC-13 | Cryptographic Protection | Implement CSE-approved cryptography | **CCCS** | Covered by ENC |
| SC-15 | Collaborative Computing Devices | Prohibit remote activation; provide use indication | **CCCS** | Infrastructure/endpoint |
| SC-17 | PKI Certificates | Issue/obtain certificates per policy | **CCCS** | Infrastructure |
| SC-18 | Mobile Code | Define acceptable/unacceptable mobile code technologies | **CCCS** | Organizational policy |
| SC-18(3) | Prevent Downloading/Execution | Prevent download/execution of unacceptable mobile code | **CCCS** | Infrastructure/endpoint |
| SC-18(4) | Prevent Automatic Execution | Prevent automatic execution of mobile code | **CCCS** | Infrastructure/endpoint |
| SC-19 | Voice over Internet Protocol | Establish VoIP usage restrictions and guidance | **CCCS** | Organizational policy |
| SC-20 | Secure Name Resolution (Authoritative) | Data origin authentication for DNS responses | **CCCS** | Infrastructure (DNS) |
| SC-21 | Secure Name Resolution (Recursive/Caching) | Data origin authentication on DNS responses | **CCCS** | Infrastructure (DNS) |
| SC-22 | Architecture for Name Resolution | Fault-tolerant DNS with internal/external role separation | **CCCS** | Infrastructure (DNS) |
| SC-23 | Session Authenticity | Protect authenticity of communications sessions | **CCCS** | Covered by SESSION-001 |
| SC-39 | Process Isolation | Maintain separate execution domain for each process | **CCCS** | OS/infrastructure |

---

### System and Information Integrity (SI)

*5 controls in both frameworks + 23 CCCS only + 1 PB only = 29 total*

| Control ID | Title | Summary | Source | organizational Status |
|---|---|---|---|---|
| SI-1 | SI Policy and Procedures | Develop, document, disseminate SI policy; review every 3 years | Both | **Not Met** |
| SI-2 | Flaw Remediation | Identify, report, correct flaws; install updates within 30 days | Both | **Not Met** |
| SI-2(2) | Automated Flaw Remediation Status | Automated determination of flaw remediation state monthly | Both | Partial |
| SI-2(3) | Time to Remediate/Benchmarks | Measure time; 30 days high, 90 days moderate | Both | Partial |
| SI-3 | Malicious Code Protection | Employ malware protection at entry/exit points | **CCCS** | Partial |
| SI-3(1) | Central Management | Centrally manage malware protection | **CCCS** | -- |
| SI-3(2) | Automatic Updates | Automatically update malware protection | **CCCS** | -- |
| SI-3(7) | Non-Signature-Based Detection | Implement non-signature malware detection | **CCCS** | -- |
| SI-4 | Information System Monitoring | Monitor system for attacks and unauthorized connections | **CCCS** | -- |
| SI-4(1) | System-Wide Intrusion Detection | Connect IDS tools into system-wide IDS | **CCCS** | -- |
| SI-4(2) | Automated Tools for Real-Time Analysis | Employ tools for near real-time analysis | **CCCS** | -- |
| SI-4(4) | Inbound and Outbound Traffic | Monitor traffic continuously for anomalies | **CCCS** | Partial |
| SI-4(5) | System-Generated Alerts | Alert personnel on indicators of compromise | **CCCS** | -- |
| SI-4(7) | Automated Response to Suspicious Events | Automated least-disruptive actions on suspicious events | **CCCS** | -- |
| SI-4(11) | Analyze Traffic Anomalies | Analyze outbound traffic for anomalies | **CCCS** | Partial |
| SI-4(14) | Wireless Intrusion Detection | Wireless IDS for rogue devices and attacks | **CCCS** | -- |
| SI-4(16) | Correlate Monitoring Information | Correlate info from monitoring tools system-wide | **CCCS** | Partial |
| SI-4(20) | Privileged User | Implement privileged user monitoring per IAM policies | **CCCS** | -- |
| SI-4(23) | Host-Based Devices | System logging on components running general-purpose OS | **CCCS** | -- |
| SI-5 | Security Alerts, Advisories, Directives | Receive/generate/disseminate security alerts; implement directives | Both | Met |
| SI-6 | Security Function Verification | Verify security function operation at startup and monthly | **PB** | Met |
| SI-7(7) | Integration of Detection and Response | Incorporate unauthorized change detection into IR capability | **CCCS** | -- |
| SI-8 | Spam Protection | Employ spam protection at entry/exit points | **CCCS** | -- |
| SI-8(1) | Central Management | Centrally manage spam protection | **CCCS** | -- |
| SI-8(2) | Automatic Updates | Automatically update spam protection | **CCCS** | -- |
| SI-10 | Information Input Validation | Check validity of information inputs | **CCCS** | Covered by ASVS V5 |
| SI-11 | Error Handling | Generate error messages without revealing exploitable info | **CCCS** | Covered by ASVS V7 |
| SI-12 | Information Output Handling/Retention | Handle/retain info per organizational policies | **CCCS** | -- |
| SI-16 | Memory Protection | Safeguards against unauthorized code execution in memory | **CCCS** | -- |

---

### Secure SDLC (ASVS Custom)

*All 4 controls are unique to the Protected B analysis. These are derived from OWASP ASVS 4.0.3 (not NIST SP 800-53) and are not part of the CCCS Medium profile.*

| Control ID | Title | Summary | Source | organizational Status |
|---|---|---|---|---|
| ASVS-SDLC-1 | Threat Modeling | Maintain current threat model to guide countermeasures | **PB** | Each solution |
| ASVS-SDLC-2 | Threat Model Contents | Threat model contains trust boundaries, components, info flows | **PB** | Each solution |
| ASVS-SDLC-3 | Secure Coding | Secure coding policy/checklist used in development | **PB** | Each solution |
| ASVS-DESIGN-15 | Re-encryption | Defined process for re-encrypting data when keys change | **PB** | Each solution |

---

## organizational Status Summary (from Protected B analysis)

For controls where organizational status was assessed in the PB framework:

| organizational Status | Count | Notes |
|---|---|---|
| Met | ~121 | organizational has met these requirements |
| Not Met | ~34 | organizational has not met these requirements -- priority remediation items |
| Partial / Unknown | ~36 | organizational partially meets or status is not assessed |
| Each Solution | ~23 | Status depends on individual solution implementation |
| Not assessed (CCCS-only controls) | ~91 | No organizational status available -- CCCS-only controls without PB cross-reference |
| Not assessed (PB-only ASVS) | 4 | Per-solution controls from ASVS framework |

**Note:** The 91 CCCS-only human process controls do not have organizational status annotations because organizational status was only documented in the Protected B framework. Some of these controls may be met by infrastructure but have not been formally assessed.

---

## Key Observations

1. **High overlap (70%):** ~230 of ~327 controls appear in both frameworks, reflecting their common NIST SP 800-53 foundation.

2. **CCCS adds breadth:** The 91 CCCS-unique controls are predominantly infrastructure / monitoring / cryptographic controls (AU, SC, SI families) that the PB analysis classified differently or did not include in the human process category.

3. **PB adds SDLC depth:** The 4 PB-unique ASVS custom controls address secure development lifecycle practices not covered by the CCCS Medium NIST-based profile.

4. **Classification differences are minimal:** Only 2 controls (AC-2(9), SI-6) are classified as human process in one framework but AI-implementable in the other. Both aspects are covered across the unified document set.

5. **CCCS-only controls lack organizational status:** The 91 CCCS-unique controls have not been assessed for organizational compliance status. A separate assessment effort may be warranted for these controls.

6. **Many CCCS-only controls are already covered:** Several CCCS-unique controls are noted as already covered by existing skill files (e.g., AU-9/LOG-002, AU-12/LOG-001, SC-5/BOT-001, SC-23/SESSION-001). These are included in this document because they also have human/operational aspects beyond the AI-implementable portions.
