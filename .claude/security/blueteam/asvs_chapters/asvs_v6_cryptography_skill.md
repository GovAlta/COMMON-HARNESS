---
id: asvs-v6-cryptography-subskill
name: ASVS V6 Cryptography Sub-Skill
description: ASVS chapter V6 stored cryptography assessment logic consumed by the ASVS Level 2 assessment workflow.
type: sub-agent
version: 1.0.0
tools_required:
  - Read
  - Glob
  - Grep
tools_optional: []
references:
  - asvs-level2-security-assessment
  - attack-chain-reference
upstream:
  - ref: asvs-level2-security-assessment
    artifacts:
      - .ai/blueteam/data/application_map.json
outputs: []
call_sequence_hard:
  - Must resolve declared upstream dependencies before execution, or fail fast with a dependency error.
  - Must run only within ASVS Level 2 Phase 2 chapter dispatch.
---

> Sub-skill for **V6 Stored Cryptography**. Finding IDs: `[V6-NNN]`. Tactics: `shared/reference/attack-chain-reference.md` §2. Phase 6 normalizes IDs.

---

## Exclusion Conditions

| Condition                                       | Sub-requirements excluded | Justification                                            |
| ----------------------------------------------- | ------------------------- | -------------------------------------------------------- |
| No cryptographic operations in application code | V6.2 Algorithms (partial) | No custom crypto to audit; note library-managed defaults |
| No secrets or keys managed in application       | V6.4 Secret Management    | Fully managed via platform services                      |

---

> Environment assumptions for this chapter: see `shared/reference/environment-baseline.md` § "ASVS Chapter Assumption Mapping."

---

## V6 Requirements and Verification Rules

### V6.1 — Data Classification

**V6.1.1** — Verify that regulated private data is stored encrypted while at rest, such as Personally Identifiable Information (PII), sensitive personal information, or data assessed as likely to be subject to applicable privacy legislation (e.g. GDPR, CCPA, PIPEDA).
- **CAS Rule:** Protected B data (including PHN, medical and mental health diagnoses, SIN, bank account numbers) MUST be encrypted in transit and at rest. Cloud Landing Zone provides TDE for managed database services — note this assumption where applicable. However, PHN/SIN/medical and mental health diagnosis/bank account number fields require **field-level encryption** (ENC-002/003) even when TDE is present. TDE is container-level only — it does NOT protect data against authenticated DB access, SQL injection, or insider threats.
- **Pre-confirmed findings fast path:** Before searching code, read `.ai/blueteam/data/security-classification.yaml`. If `security_posture.has_posture_gaps: true`, read each entry in `security_posture_gaps[]`. Every entry where `gap` mentions field-level encryption is a **pre-confirmed V6.1.1 Critical finding** — report it directly without re-deriving from code. Include the `store`, `data_elements`, `exposure`, and `required_control` fields verbatim in the Evidence block, and reference the classification YAML as the source.
- **Verification (when not pre-confirmed):** For each Protected B field stored in the database: check for field-level encryption in the data access layer (`AesGcm`, `DataProtectionProvider`, column-level encryption, `Always Encrypted`, `pgcrypto`). TDE (`transparent_data_encryption`, disk encryption) does NOT satisfy this requirement and must be flagged if it is the only protection for PHN/SIN/health diagnosis/bank account columns. Check connection strings for SQL Server TDE / PostgreSQL encryption settings.
- **Classification posture gap:** If PHN/SIN/health diagnosis/bank account data is found with only container-level protection, this is not just a V6 finding — it is a **classification-level compliance gap**. Note in the finding that the Protected B classification for this store cannot be satisfied until field-level encryption is implemented. This finding should appear in the cross-domain kill chain as a confirmed data exposure path.
- **ATT&CK Tactic:** TA0009 — Collection
- **Severity if failed:** Critical (PHN/SIN/health diagnosis/bank account number without field-level encryption), High (other Protected B data without any encryption at rest)

**V6.1.2** — Verify that regulated health data is stored encrypted while at rest, such as medical records, medical device details, or de-anonymized research records.
- **CAS Rule:** PHN (Personal Health Number) is Protected B and requires field-level encryption (ENC-002).
- **Verification:** Same as V6.1.1 — specifically check PHN storage with field-level encryption.
- **ATT&CK Tactic:** TA0009 — Collection
- **Severity if failed:** Critical

**V6.1.3** — Verify that regulated financial data is stored encrypted while at rest, such as financial accounts, defaults or credit history, tax records, pay history, beneficiaries, or de-anonymized market or research records.
- **CAS Rule:** None beyond standard.
- **Verification:** Same as V6.1.1 for financial data.
- **ATT&CK Tactic:** TA0009 — Collection
- **Severity if failed:** High

---

### V6.2 — Algorithms

**V6.2.1** — Verify that all cryptographic modules fail securely, and errors are handled in a way that does not enable Padding Oracle attacks.
- **CAS Rule:** None.
- **Verification:** Check exception handling in decryption operations. Verify that exceptions from decryption do not leak padding error details.
- **ATT&CK Tactic:** TA0006 — Credential Access
- **Severity if failed:** High

**V6.2.2** — Verify that industry-proven or government-approved cryptographic algorithms, modes, and libraries are used, rather than custom-developed cryptography.
- **CAS Rule:** Approved algorithms: AES-256 (GCM mode preferred), RSA-2048+, SHA-256+. Algorithms must be quantum-resistant per NIST guidance. Deprecated: MD5, SHA1, DES, 3DES, RC4, ECB mode.
- **Verification:** Search for cryptographic algorithm identifiers in code: `MD5`, `SHA1`, `DES`, `3DES`, `RC4`, `ECB`, `AES-128`. Check `HashAlgorithmName`, `SymmetricAlgorithm` implementations. Flag any deprecated algorithm usage.
- **ATT&CK Tactic:** TA0006 — Credential Access
- **Severity if failed:** High (deprecated algorithm in active use), Critical (if protecting PHN/SIN with deprecated algorithm)

**V6.2.3** — Verify that encryption initialization vector, cipher configuration, and block modes are configured securely using the latest advice.
- **CAS Rule:** None.
- **Verification:** Check AES mode configuration — ECB mode is a Critical finding. Check IV generation for CBC/GCM modes (must be random, not hardcoded). Verify GCM authentication tag is checked.
- **ATT&CK Tactic:** TA0009 — Collection
- **Severity if failed:** Critical (ECB mode, hardcoded IV)

**V6.2.4** — Verify that random number, encryption or hashing algorithms, key lengths, rounds, ciphers or modes, can be reconfigured, upgraded, or swapped at any time, to protect against cryptographic breaks.
- **CAS Rule:** Crypto agility required for quantum readiness (NIST guidance on post-quantum cryptography).
- **Verification:** Check whether the cryptographic algorithm selection is hardcoded deep in the implementation or configurable. Note crypto agility gaps as a roadmap finding.
- **ATT&CK Tactic:** TA0006 — Credential Access
- **Severity if failed:** Medium (roadmap / quantum readiness)

**V6.2.5** — Verify that known insecure block modes (i.e., ECB) are not used.
- **CAS Rule:** None.
- **Verification:** Same check as V6.2.3 ECB mode.
- **ATT&CK Tactic:** TA0009 — Collection
- **Severity if failed:** Critical

**V6.2.6** — Verify that nonces, initialization vectors, and other single-use numbers must not be used more than once with a given encryption key.
- **CAS Rule:** None.
- **Verification:** Check for IV/nonce reuse in encryption code. Counter-based or random IV generation is required.
- **ATT&CK Tactic:** TA0009 — Collection
- **Severity if failed:** High

**V6.2.7** — Verify that encrypted data is authenticated via signatures, authenticated cipher modes or HMAC to ensure that ciphertext is not altered by an unauthorized party.
- **CAS Rule:** None.
- **Verification:** Check for unauthenticated encryption (CBC without MAC/HMAC). AES-GCM is preferred as it provides authenticated encryption.
- **ATT&CK Tactic:** TA0009 — Collection
- **Severity if failed:** High

**V6.2.8** — Verify that all cryptographic operations are constant-time, with no 'short-circuit' operations in comparisons, key derivations, or encryptions to avoid information leakage.
- **CAS Rule:** None.
- **Verification:** Check for timing-safe comparison functions for secrets (HMAC comparison, password comparison). Flag standard `==` or string comparison on secrets — should use `CryptographicOperations.FixedTimeEquals` or equivalent.
- **ATT&CK Tactic:** TA0006 — Credential Access
- **Severity if failed:** Medium

---

### V6.3 — Random Values

**V6.3.1** — Verify that all random numbers, random file names, random GUIDs, and random strings are generated using the cryptographic module's approved cryptographically secure random number generator when these random values are intended to be not guessable by an attacker.
- **CAS Rule:** None.
- **Verification:** Search for `Math.random()`, `Random()`, `rand()` used in security-sensitive contexts (token generation, session IDs, password reset codes). These are NOT cryptographically secure. Flag any security-sensitive random value generation using non-CSPRNG sources.
- **ATT&CK Tactic:** TA0006 — Credential Access
- **Severity if failed:** High

**V6.3.2** — Verify that random GUIDs are created using the GUID v4 algorithm, and a Cryptographically-secure Pseudorandom Number Generator (CSPRNG). GUIDs created using other pseudorandom number generators may be predictable.
- **CAS Rule:** None.
- **Verification:** Check GUID generation for security-sensitive identifiers. `Guid.NewGuid()` in .NET uses a CSPRNG; `uuid.v4()` in Node uses `crypto.randomBytes`. Flag `uuid.v1()` (timestamp-based) for security-sensitive use.
- **ATT&CK Tactic:** TA0006 — Credential Access
- **Severity if failed:** High

**V6.3.3** — Verify that random numbers are created with proper entropy even when the application is under heavy load, or that the application degrades gracefully in such circumstances.
- **CAS Rule:** None.
- **Verification:** Note whether entropy depletion is mitigated. This is typically handled by the OS CSPRNG — note as N/A for most applications.
- **ATT&CK Tactic:** TA0006 — Credential Access
- **Severity if failed:** Low

---

### V6.4 — Secret Management

**V6.4.1** — Verify that a secrets management solution such as a key vault is used to securely create, store, control access to and destroy secrets. (NIST SP 800-57)
- **CAS Rule:** Deployments should use Azure Key Vault, AWS Secrets Manager, or equivalent. Secrets in environment variables are acceptable if managed via approved secret injection.
- **Verification:** Check `appsettings.json`, `config.json`, source code for hardcoded credentials. Cross-reference `secrets_findings[]` from the application map — each entry with `current_head: true` is a confirmed finding. Check for key vault SDK usage (`SecretClient`, `ISecretClient`, `AWS::SecretsManager`).
- **ATT&CK Tactic:** TA0006 — Credential Access
- **Severity if failed:** Critical (production credentials), High (development/test credentials in production path)

**V6.4.2** — Verify that key material is not exposed to the application but instead uses an isolated security module like a vault for cryptographic operations.
- **CAS Rule:** None.
- **Verification:** Check whether encryption keys are loaded into application memory from a vault (acceptable) vs. embedded in application config or source code (finding).
- **ATT&CK Tactic:** TA0006 — Credential Access
- **Severity if failed:** High

---

## ATT&CK Tactic Summary

Note: Derived from `shared/reference/attack-chain-reference.md` Section 2. Update this file if that file changes.

| Finding Pattern                                 | Primary Tactic                               | Kill Chain Stage                                     |
| ----------------------------------------------- | -------------------------------------------- | ---------------------------------------------------- |
| Weak/deprecated algorithm (MD5, SHA1, DES, ECB) | TA0006 Credential Access / TA0009 Collection | Enables offline cracking or data decryption          |
| Hardcoded secrets in source or config           | TA0006 Credential Access                     | Direct credential theft from source                  |
| Non-CSPRNG for security tokens                  | TA0006 Credential Access                     | Predictable tokens enable guessing attacks           |
| PHN/SIN without field-level encryption          | TA0009 Collection                            | Protected B data readable after DB exfil without key |
| Unauthenticated encryption (CBC, no MAC)        | TA0009 Collection                            | Ciphertext tampering → padding oracle                |

---

## Cross-Chapter Reference Notes

| This chapter finding                      | Combines with                         | Combined chain risk                                                          |
| ----------------------------------------- | ------------------------------------- | ---------------------------------------------------------------------------- |
| V6.4.1 hardcoded secrets                  | V2.10.4 service credentials in source | Same root cause — use single finding; V2 chapter should reference this       |
| V6.1.1 PHN without field-level encryption | V8.1 data protection                  | Same data protection gap — consolidate or cross-reference                    |
| V6.2.2 deprecated algorithm               | V9.1 TLS/communication security       | Weak crypto at storage + weak crypto at transport = full data exposure chain |

---

> **ASSESSMENT ORCHESTRATOR: STOP READING HERE.** The `## Secure Implementation Guide` section below is for `skills/14-asvs-compliant-builder.md` only. Assessment skills do not need implementation patterns.

## Secure Implementation Guide

> **For builder skills only.** Assessment skills use the full chapter file above. This section provides implementation patterns for generating ASVS V6-compliant code.

### When to apply this chapter
Load V6 when storing or transmitting Protected B data (PHN, SIN, medical diagnosis, bank/credit card), implementing any encryption, managing secrets/keys, or generating cryptographic tokens. Also load when any Protected B field exists in a database schema.

### Field-level Encryption for Protected B Data (V6.1.1, V6.1.2)

TDE (Transparent Data Encryption) does NOT satisfy the Protected B requirement — field-level encryption is required for PHN, SIN, medical diagnosis, and financial account numbers:

```typescript
// crypto/fieldEncryption.ts — ✓ V6.1.1, ENC-002 compliant
import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

// Key loaded from Azure Key Vault — never hardcoded ✓ V6.4.1
const ENCRYPTION_KEY = Buffer.from(process.env.FIELD_ENCRYPTION_KEY!, 'base64'); // 32 bytes for AES-256

export function encryptField(plaintext: string): string {
  const iv = randomBytes(12);           // 96-bit IV for GCM ✓ V6.2.3, V6.2.6
  const cipher = createCipheriv('aes-256-gcm', ENCRYPTION_KEY, iv);

  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag(); // Authenticated encryption ✓ V6.2.7

  // Format: iv(12) + authTag(16) + ciphertext — all base64 encoded
  return Buffer.concat([iv, authTag, encrypted]).toString('base64');
}

export function decryptField(ciphertext: string): string {
  const buf = Buffer.from(ciphertext, 'base64');
  const iv = buf.subarray(0, 12);
  const authTag = buf.subarray(12, 28);
  const encrypted = buf.subarray(28);

  const decipher = createDecipheriv('aes-256-gcm', ENCRYPTION_KEY, iv);
  decipher.setAuthTag(authTag); // Verify integrity ✓ V6.2.7

  return decipher.update(encrypted) + decipher.final('utf8');
}
```

Use at the data access layer for every Protected B field:

```typescript
// services/employeeService.ts
async function createEmployee(data: CreateEmployeeDto) {
  await db.query(
    'INSERT INTO employees (name, phn_encrypted) VALUES ($1, $2)',
    [data.name, encryptField(data.phn)]  // ✓ V6.1.1: PHN encrypted before storage
  );
}
```

### Password Hashing (V2.4 cross-reference, V6.2.2)

```typescript
// ✓ V6.2.2 compliant: argon2id (NIST-approved, quantum-resistant roadmap)
import argon2 from 'argon2';

export const hashPassword = (password: string) =>
  argon2.hash(password, { type: argon2.argon2id, memoryCost: 65536, timeCost: 3 });

// NEVER use: MD5, SHA1, bcrypt-with-factor<10, DES, 3DES, RC4 ✓ V6.2.2
```

### Cryptographically Secure Random Values (V6.3.1, V6.3.2)

```typescript
// ✓ V6.3.1 compliant: use Node.js crypto module for all security tokens
import { randomBytes, randomUUID } from 'crypto';

// Secure session ID generation
export const generateSessionId = () => randomBytes(32).toString('hex'); // 256 bits

// Secure UUID for object IDs
export const generateId = () => randomUUID(); // Uses CSPRNG ✓ V6.3.2

// Password reset token
export const generateResetToken = () => randomBytes(48).toString('base64url'); // 384 bits

// NEVER use for security-sensitive values: ✗ Math.random(), ✗ uuid.v1()
```

### Timing-safe Secret Comparison (V6.2.8)

```typescript
// ✓ V6.2.8 compliant: constant-time comparison for secrets
import { timingSafeEqual } from 'crypto';

export function safeCompare(a: string, b: string): boolean {
  const bufA = Buffer.from(a, 'utf8');
  const bufB = Buffer.from(b, 'utf8');
  // Must be same length for timingSafeEqual
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

// Use for: API key comparison, HMAC comparison, token comparison
// NEVER use: === for secret comparison (timing oracle)
```

### Secret Management (V6.4.1, V6.4.2)

```typescript
// config/secrets.ts — ✓ V6.4.1 compliant: Azure Key Vault
import { SecretClient } from '@azure/keyvault-secrets';
import { DefaultAzureCredential } from '@azure/identity';

const vaultClient = new SecretClient(
  process.env.AZURE_KEY_VAULT_URL!,
  new DefaultAzureCredential() // Managed Identity — no credentials in code ✓ V6.4.1
);

// Load secrets at startup — never at each request
export async function loadSecrets() {
  return {
    fieldEncryptionKey: (await vaultClient.getSecret('field-encryption-key')).value!,
    dbPassword: (await vaultClient.getSecret('db-password')).value!,
    jwtSigningKey: (await vaultClient.getSecret('jwt-signing-key')).value!,
  };
}

// secrets.ts is never imported in client-side code ✓ V1.6.4
```

### Common anti-patterns
- MD5, SHA1, DES, 3DES, RC4, or AES in ECB mode for any encryption
- Hardcoded encryption keys or IVs in source code or config files
- `Math.random()` for password reset tokens, session IDs, or API keys
- AES-CBC without HMAC authentication (use AES-GCM instead)
- Same IV reused across multiple encryptions with the same key
- `===` for comparing HMAC signatures or API keys (use `timingSafeEqual`)
- Encryption keys loaded from environment variables at every request (load once at startup)

### Organization-specific patterns
- Protected B fields (PHN, SIN, medical diagnosis, bank/credit card): MUST use field-level AES-256-GCM encryption. TDE alone is insufficient.
- Use Azure Key Vault + Managed Identity for all key material. Never put keys in `.env` files or `appsettings.json`.
- ENC-001 (CAS): encryption is required both at rest (field-level) and in transit (TLS) for Protected B data
- Crypto agility (V6.2.4): store algorithm name alongside ciphertext to enable future migration to post-quantum algorithms
