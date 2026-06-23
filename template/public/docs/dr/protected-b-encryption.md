# Protected B Encryption (opt-in)

The template stores form submission data in a plain JSONB column by default,
because the majority of apps built from this template (services catalogue,
public information portal, anonymous submission intake) never carry Protected
B data. If your deployment **does** process Protected B fields (PHN, SIN,
medical / financial data, etc.), enable the bundled pgcrypto migration before
you start accepting submissions.

This addresses the CAS finding **ENC-002 / ENC-003 (Critical)**, "Protected B
data at rest in unencrypted JSONB column", which the threat model also flags
as T-004.

## Why pgcrypto vs database-level TDE

Database-level encryption (TDE: Azure DB transparent data encryption, RDS
encryption-at-rest, Postgres disk-level encryption) only protects against
stolen-disk scenarios. It does NOT protect against:

- A leaked application DB password
- A compromised application container
- A misconfigured backup that lands in an unencrypted bucket
- A read replica that gets snapshotted into a less-protected environment

Column-level encryption with pgcrypto means the cipher text is what lives on
disk AND what gets dumped by `pg_dump` AND what the app credential reads.
The decryption key lives in your secrets manager and is consumed at app
runtime only.

## Enabling

### 1. Rename the migration

```bash
cd server/migrations
mv 020_optional_pgcrypto.sql.example 020_optional_pgcrypto.sql
```

### 2. Generate and store the key

```bash
# 256-bit symmetric key, base64-encoded
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

Store the output in your secrets manager as `PGCRYPTO_DATA_KEY`. Azure Key
Vault, AWS Secrets Manager, and Doppler all work. **Do not commit the key.**

### 3. Add to `.env.example` (already documented placeholder)

```
# Required if migration 020_optional_pgcrypto.sql is enabled.
# Generate with: node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
PGCRYPTO_DATA_KEY=
```

### 4. Update `submission.model.ts` read + write paths

The starter model uses `INSERT … submission_data = $2::jsonb`. After enabling
the migration, switch to:

```typescript
import { env } from '../config/environment';

// WRITE
await pool.query(
  `INSERT INTO form_submission (..., submission_data_encrypted)
   VALUES (..., enc_submission($N::jsonb, $N+1))`,
  [..., submissionDataJsonb, env.PGCRYPTO_DATA_KEY]
);

// READ
const { rows } = await pool.query(
  `SELECT ..., dec_submission(submission_data_encrypted, $1) AS submission_data
   FROM form_submission WHERE id = $2`,
  [env.PGCRYPTO_DATA_KEY, submissionId]
);
```

### 5. Run the migration

```bash
npm run db:migrate
```

### 6. Backfill any existing rows (if migrating in place)

Out of scope for this template. Write a one-off script that reads
`submission_data`, encrypts it, writes `submission_data_encrypted`, and then
drops the plaintext column once verified.

## Key rotation

Rotating `PGCRYPTO_DATA_KEY` requires re-encrypting all rows under the new
key. This is a one-off batch job: read with old key, write with new key,
swap the env var, restart. Schedule for off-hours.

## Retiring the risk acceptance

After the migration is enabled and submissions are actually being encrypted,
remove the corresponding entry from `.ai/data/risk_acceptances.json`. The
blueteam ENC-002 finding will then be marked COMPLIANT.
