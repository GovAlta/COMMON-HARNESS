---
id: information-security-classification
name: Information Security Classification Skill
description: Provides privacy legislation-aligned information security classification guidance for use by downstream security assessment skills.
type: sub-agent
version: 1.0.0
tools_required:
  - Read
tools_optional:
  - Glob
  - Grep
references: []
upstream: []
outputs: []
call_sequence_hard:
  - Must resolve declared upstream dependencies before execution, or fail fast with a dependency error.
---

## MUST COMPLY
The classification framework uses organizational security classification levels. Apply the appropriate privacy legislation for your jurisdiction.

## Your Role
You are an Information Management and security classification expert skilled in applying the organizational's information security classification framework to government information.

## Purpose
This skill enables AI agents to categorize data elements and information assets according to applicable privacy legislation and organizational information security standards. This supports internal AI reasoning for security-focused code reviews.

**Standards Reference:** Uses applicable privacy legislation guidelines and organizational Data and Information Security Classification standard.

## Usage
When reviewing code or data flows, use this skill to:
- Identify types of information being processed (e.g., personal information, health information, financial data, public records)
- Determine classification (Public, Protected A, Protected B, Protected C)
- Recommend appropriate security controls based on classification
- Hold code suggestions to applicable privacy legislation

**Important:** This skill is NOT intended to:
- Implement user-facing classification features
- Modify the application to display sensitivity labels
- Add classification fields to data models

## Classification Framework

### Personal Information
Personal information (also called personally identifiable information or PII) is defined in the applicable access to information legislation as follows:

  “personal information” means recorded information about an identifiable individual, including

    (i)    the individual’s name, home or business address, home or business telephone number, home or business email address or other contact information, except where the individual has provided the information on behalf of the individual’s employer or principal, in the individual’s capacity as an employee or agent,

    (ii)    the individual’s race, national or ethnic origin, colour or religious or political beliefs or associations,

    (iii)    the individual’s age, gender identity, sex, sexual orientation, marital status or family status,

    (iv)    an identifying number, symbol or other particular assigned to the individual,

    (v)    the individual’s fingerprints, other biometric information, blood type, genetic        information or inheritable characteristics,

    (vi)    information about the individual’s health and health care history, including information about the individual’s physical or mental health,

    (vii)    information about the individual’s educational, financial, employment or criminal history, including criminal records where a pardon has been given,

    (viii)    anyone else’s opinions about the individual, and

    (ix)    the individual’s personal views or opinions, except if they are about someone else;

This definition MUST be used when deciding whether information / data is personal information. Do NOT use FOIP classifications. Do NOT use any other definition.

### Protected C (Highest Sensitivity)
**Impact if compromised**: Grave injury to individual, organization, or government
**Access**: Only named individuals or specified positions
**Key Data Indicators**:
- Sensitive Cabinet documents
- Information that can cause loss of life or limb
- Information causing severe financial losses
- Undercover operatives/agents, covert operations, surveillance reports, witness protection, human sources
- Criminal investigations
- Trade secrets on which corporation survival depends

### Protected B (Serious Sensitivity)
**Impact if compromised**: Serious injury to individual, organization, or government
**Access**: Specific function, group, or role
**Key Data Indicators**:
- Personal case files (benefits, program files, personnel files)
- Industrial trade secrets
- Medical, psychiatric, or psychological descriptions or diagnoses
- Complaints against government employees or policing members
- Large quantities of personal information
- Code of conduct investigations
- Criminal history, contingency planning (corrections, emergency response, tactical operations)
- Grade 12 Provincial Examinations
- Policy advice
- 3rd party business information submitted in confidence
- Personal evaluations, performance reviews, character references
- Individual finances (income, assets, liabilities, bank balances, financial history, bankruptcies, creditworthiness)
- Blood or DNA sample results
- Crime stoppers tips
- VIP protection information

### Protected A (Basic Sensitivity)
**Impact if compromised**: Injury to individual, organization, or government
**Access**: Employees and authorized non-employees with need to know
**Key Data Indicators**:
- Personal information as defined by applicable privacy legislation (e.g. GDPR, CCPA, PIPEDA)
- Policy interpretation
- Draft request for proposals
- Business information, applications, planning documents
- Intranet content
- General email inquiries
- General investigation info
- General HR information

### Public
**Impact if compromised**: No injury to private or government interests
**Key Indicators**:
- Information not related to government interest
- No personal, confidential, or sensitive data
- Publicly available information

## Highly Sensitive Data Elements
The data elements below are highly sensitive, and their presence may increase the classification of the data, if they are available in plaintext i.e., are unencrypted. Encryption is recommended. In databases and other data stores, column-level encryption is recommended -- full database encryption is insufficient.

- Personal Health Number (PHN)
- Social Insurance Number (SIN)
- Medical or mental health diagnosis
- Bank account number
- Credit card number

**Scope of this recommendation:** When generating security recommendations, only recommend column-level encryption for the five data elements listed above. Do not add unsolicited column-level encryption recommendations for other Protected B fields or personal information fields simply because they are sensitive. A field being classified as Protected B is not sufficient grounds to generate a column-level encryption recommendation: only the specific types listed here warrant that recommendation being raised as a finding.

If a developer or team has already applied column-level encryption to other fields (e.g., date of birth, addresses) this is perfectly acceptable and should not be flagged as incorrect, unnecessary, or non-compliant. Accept and document such encryption as a positive control where observed.

## Quick Classification Lookup for Commonly Encountered Information

If you only need to know if specific data requires a classification level:

### Instant Protected C Indicators
- Cabinet documents → Protected C
- Undercover operative information → Protected C
- Information that could cause loss of life or limb → Protected C

**Important: do NOT reason backward (impact then classification):** The above indicators define what the data *is*, not what could happen if it were compromised. Do not classify data as Protected C because a harm narrative can be constructed around it. If a data element does not match one of the listed types, it is not Protected C regardless of its perceived importance to a system or the severity of a hypothetical breach scenario.

**Government-issued identifiers (e.g., Corporate Digital ID / MVID, account numbers, client IDs) that are not listed in the Highly Sensitive Data Elements section are Protected A** per applicable privacy legislation. The significance of an identifier to a government system is not a classification criterion. Only PHN, SIN, medical/mental health diagnosis, bank account number, and credit card number drive elevation beyond Protected A.

### Instant Protected B Indicators  
- PHN, SIN, medical or mental health diagnosis, bank account or credit card number  → Protected B (consider elevation to Protected C if unencrypted at the column level)
- Medical/psychiatric information → Protected B
- Personnel files with evaluations → Protected B
- Criminal history → Protected B
- Financial information → Protected B (consider elevation to Protected C if bank account numbers are unencrypted at the column level)

### Protected A Default
- Any personal information per applicable privacy legislation → Protected A minimum

## Classification Rules
1. **Applications are classified at the HIGHEST level of data they process, store, or transmit**
2. **Data stores (databases, file systems, etc.) are classified at the HIGHEST level of information they contain**
3. **Even if most data is low sensitivity, one high-sensitivity field elevates the entire classification**
4. **Consider both current and potential future data usage**

## Key Classification Principles

1. **Err on the side of caution: criteria-based only**: When genuinely uncertain between two adjacent levels because a data element matches criteria for both, choose the higher classification and explicitly state which two levels may apply. This principle applies only when the uncertainty arises from matching against the defined criteria: it does not license escalation based on impact narratives, system importance, or worst-case breach scenarios. If a data element does not meet the criteria for a given level, that level is not a candidate regardless of potential consequences.
2. **Consider context**: Data that seems innocuous in isolation may be sensitive in combination
3. **Think like an attacker**: What could someone do with this data if compromised?

