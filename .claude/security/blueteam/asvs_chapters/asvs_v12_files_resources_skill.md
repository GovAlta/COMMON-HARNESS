---
id: asvs-v12-files-resources-subskill
name: ASVS V12 Files and Resources Sub-Skill
description: ASVS chapter V12 files and resources assessment logic consumed by the ASVS Level 2 assessment workflow.
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

> Sub-skill for **V12 Files and Resources**. Finding IDs: `[V12-NNN]`. Tactics: `shared/reference/attack-chain-reference.md` §2. Phase 6 normalizes IDs.

---

## Exclusion Conditions

| Condition                            | Sub-requirements excluded                                     | Justification              |
| ------------------------------------ | ------------------------------------------------------------- | -------------------------- |
| No file upload functionality         | V12.1 File Upload, V12.2 File Integrity, V12.3 File Execution | No upload path to assess   |
| No file download functionality       | V12.5 File Download                                           | No download path to assess |
| No user-controllable URL/path inputs | V12.6 SSRF Protection                                         | No SSRF surface present    |

**This chapter is excluded by default if `has_file_uploads: false` in the application map AND no file download / user-controllable URL inputs exist.** Write `[V12 CHAPTER EXCLUDED — no file upload, download, or SSRF surface]` and stop.

If only partial exclusions apply, assess only the applicable sub-categories.

---

> Environment assumptions for this chapter: see `shared/reference/environment-baseline.md` § "ASVS Chapter Assumption Mapping."

---

## V12 Requirements and Verification Rules

### V12.1 — File Upload

*Only assess if `has_file_uploads: true` in the application map.*

**V12.1.1** — Verify that the application will not accept large files that could fill up storage or cause a denial of service.
- **CAS Rule:** None.
- **Verification:** Check file upload handlers for size limits (`MaxRequestBodySize`, `maxFileSize`, `Content-Length` validation). Verify limits are enforced server-side, not only in the UI.
- **ATT&CK Tactic:** TA0040 — Impact
- **Severity if failed:** High

**V12.1.2** — Verify that compressed files are checked for "zip bombs" — small files that will decompress into huge amounts of data thus exhausting file storage.
- **CAS Rule:** None.
- **Verification:** Check archive decompression code for size limits on extracted content.
- **ATT&CK Tactic:** TA0040 — Impact
- **Severity if failed:** High

**V12.1.3** — Verify that a file size quota and maximum number of files per user is enforced to ensure that a single user cannot fill the storage with too many files.
- **CAS Rule:** None.
- **Verification:** Check for per-user file count and total storage limits in upload handlers.
- **ATT&CK Tactic:** TA0040 — Impact
- **Severity if failed:** Medium

---

### V12.2 — File Integrity

*Only assess if `has_file_uploads: true` in the application map.*

**V12.2.1** — Verify that files obtained from untrusted sources are validated to be of expected type based on the file's content.
- **CAS Rule:** None.
- **Verification:** Check file type validation approach — content-based validation (reading magic bytes/file signatures) is required; filename extension or `Content-Type` header alone is NOT sufficient. Check for libraries like `file-type`, `MimeKit`, or manual magic byte inspection.
- **ATT&CK Tactic:** TA0002 — Execution
- **Severity if failed:** Critical (if executable files can be uploaded with false extension)

---

### V12.3 — File Execution Prevention

*Only assess if `has_file_uploads: true`.*

**V12.3.1** — Verify that user-submitted filenames are not used directly in file system or framework operations, and that a URL parser is used to prevent path traversal attacks.
- **CAS Rule:** None.
- **Verification:** Check file operation code for user-supplied filename usage: `Path.Combine(baseDir, userFilename)` without path traversal protection, `fs.readFile(userFilename)`. Check for `..` in path sanitization. Use `Path.GetFullPath` / `realpath` and verify the result is within the allowed base directory.
- **ATT&CK Tactic:** TA0007 — Discovery (path traversal → file system reading)
- **Severity if failed:** Critical

**V12.3.2** — Verify that user-submitted filenames are validated or ignored to prevent the disclosure, creation, updating or removal of local files (LFI).
- **CAS Rule:** None.
- **Verification:** Same as V12.3.1. Check that uploaded filenames are replaced with server-generated safe filenames (UUID + sanitized extension).
- **ATT&CK Tactic:** TA0002 — Execution
- **Severity if failed:** Critical

**V12.3.3** — Verify that user-submitted filenames are validated or ignored to prevent the disclosure, creation, updating or removal of remote files (RFI).
- **CAS Rule:** None.
- **Verification:** Check for remote file inclusion patterns where user-supplied URLs are fetched server-side.
- **ATT&CK Tactic:** TA0002 — Execution
- **Severity if failed:** Critical

**V12.3.4** — Verify that the application protects against Reflective File Download (RFD) by validating or ignoring user-submitted filenames in a JSON, JSONP, or URL parameter, the response Content-Type header should be set to text/plain, and the Content-Disposition header should have a fixed filename.
- **CAS Rule:** None.
- **Verification:** Check download endpoints for user-controlled filenames in `Content-Disposition: attachment; filename=...` header.
- **ATT&CK Tactic:** TA0001 — Initial Access
- **Severity if failed:** Medium

**V12.3.5** — Verify that untrusted file metadata is not used directly with system APIs or libraries to protect against OS command injection.
- **CAS Rule:** None.
- **Verification:** Check for file metadata (name, EXIF, description) being passed to system commands or external processing tools.
- **ATT&CK Tactic:** TA0002 — Execution
- **Severity if failed:** Critical

**V12.3.6** — Verify that the application does not include and execute functionality from untrusted sources.
- **CAS Rule:** None.
- **Verification:** Check for dynamic code loading from user-supplied or external sources.
- **ATT&CK Tactic:** TA0002 — Execution
- **Severity if failed:** Critical

---

### V12.4 — File Storage Security

**V12.4.1** — Verify that files obtained from untrusted sources are stored outside the web root, with limited permissions.
- **CAS Rule:** None.
- **Verification:** Check upload storage path configuration. Files should be stored outside the web root or in a dedicated storage service (S3, Azure Blob, Supabase Storage). Direct serving from the web root enables bypassing access controls.
- **ATT&CK Tactic:** TA0002 — Execution
- **Severity if failed:** Critical (if executable extensions can be served from web root)

**V12.4.2** — Verify that files obtained from untrusted sources are scanned by antivirus scanners to prevent upload and serving of known malicious content.
- **CAS Rule:** None.
- **Verification:** Check for antivirus scanning integration on file uploads. Note as Medium if absent for public-facing applications.
- **ATT&CK Tactic:** TA0002 — Execution
- **Severity if failed:** Medium

**V12.4.3** — Verify that file upload paths are not served from the same hostname and port as the main application.
- **CAS Rule:** None.
- **Verification:** Check whether uploaded files are served from a separate domain/CDN or from the same origin as the main application. Same-origin serving enables XSS via uploaded HTML/SVG.
- **ATT&CK Tactic:** TA0001 — Initial Access (stored XSS via uploaded file)
- **Severity if failed:** High

**V12.4.4** — Verify that cloud storage bucket policies restrict access to authorized users and prevent unauthenticated public access, public listing, or public write operations.
- **CAS Rule:** Same as V8.1.8 — cross-reference.
- **Verification:** Cross-reference with V8.1.8 findings. Write `[V12-NNN: duplicate of V8-NNN]` if already captured.
- **ATT&CK Tactic:** TA0009 — Collection
- **Severity if failed:** Critical (public bucket with sensitive data), High (public listing)

---

### V12.5 — File Download Security

*Only assess if file download functionality exists.*

**V12.5.1** — Verify that the web tier is configured to serve only files with specific file extensions to prevent unintentional information and source code leakage.
- **CAS Rule:** None.
- **Verification:** Check static file serving configuration for extension allowlisting. Flag if source code files (`.cs`, `.py`, `.env`, `.json`) can be served directly.
- **ATT&CK Tactic:** TA0043 — Reconnaissance
- **Severity if failed:** High

**V12.5.2** — Verify that direct requests to uploaded files will never be executed as HTML or JavaScript content.
- **CAS Rule:** None.
- **Verification:** Check that uploaded files are served with appropriate `Content-Type` and `Content-Disposition: attachment` to prevent browser execution.
- **ATT&CK Tactic:** TA0001 — Initial Access
- **Severity if failed:** Critical

---

### V12.6 — SSRF Protection

*Only assess if user-controllable URL inputs or external resource fetching exists.*

**V12.6.1** — Verify that the web or application server is configured with an allowlist of resources or systems to which the server can send requests or load data/files from.
- **CAS Rule:** None.
- **Verification:** Check URL validation for externally-fetched resources. Verify allowlist of domains/IPs for outbound requests. Block cloud metadata endpoints (169.254.169.254, 100.100.100.200) and internal RFC-1918 address ranges. Cross-reference with V5.2.6 if already captured.
- **ATT&CK Tactic:** TA0008 — Lateral Movement
- **Severity if failed:** Critical

---

## ATT&CK Tactic Summary

Note: Derived from `shared/reference/attack-chain-reference.md` Section 2. Update this file if that file changes.

| Finding Pattern                          | Primary Tactic          | Kill Chain Stage                             |
| ---------------------------------------- | ----------------------- | -------------------------------------------- |
| Path traversal via user filename         | TA0007 Discovery        | Read arbitrary files from server file system |
| File type bypass (extension vs. content) | TA0002 Execution        | Upload executable as image → RCE             |
| SSRF via user URL                        | TA0008 Lateral Movement | Access internal services / cloud metadata    |
| Public bucket with uploads               | TA0009 Collection       | Direct download of all uploaded files        |
| Web root file serving                    | TA0002 Execution        | Execute uploaded scripts from web root       |

---

## Cross-Chapter Reference Notes

| This chapter finding   | Combines with               | Combined chain risk                                                                 |
| ---------------------- | --------------------------- | ----------------------------------------------------------------------------------- |
| V12.6.1 SSRF           | V5.2.6 SSRF via input       | Same root cause — consolidate; write `[V12-NNN: duplicate of V5-NNN]` or vice versa |
| V12.4.4 bucket access  | V8.1.8 cloud storage access | Same root cause — write `[V12-NNN: duplicate of V8-NNN]`                            |
| V12.3.1 path traversal | V5.3.9 LFI                  | Same root cause — consolidate                                                       |

---

> **ASSESSMENT ORCHESTRATOR: STOP READING HERE.** The `## Secure Implementation Guide` section below is for `skills/14-asvs-compliant-builder.md` only. Assessment skills do not need implementation patterns.

## Secure Implementation Guide

> **For builder skills only.** Assessment skills use the full chapter file above. This section provides implementation patterns for generating ASVS V12-compliant code.

### When to apply this chapter
Load V12 when implementing file upload, file download, or any endpoint that fetches external URLs or reads user-supplied file paths.

### Secure File Upload (V12.1, V12.2, V12.3)

```typescript
// middleware/fileUpload.ts — ✓ V12.1, V12.2, V12.3 compliant
import multer from 'multer';
import { fileTypeFromBuffer } from 'file-type';
import { v4 as uuidv4 } from 'uuid';
import path from 'path';

const ALLOWED_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'application/pdf']);
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB ✓ V12.1.1

// ✓ V12.3.1, V12.3.2: use memory storage — rename before persisting to avoid user filename
export const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_SIZE }, // ✓ V12.1.1
});

export async function validateAndStoreFile(buffer: Buffer, originalName: string): Promise<string> {
  // ✓ V12.2.1: content-based type validation (magic bytes), NOT extension or Content-Type header
  const detected = await fileTypeFromBuffer(buffer);
  if (!detected || !ALLOWED_MIME_TYPES.has(detected.mime)) {
    throw new Error(`File type not allowed: ${detected?.mime ?? 'unknown'}`);
  }

  // ✓ V12.3.2: generate server-side safe filename — never use original user filename
  const ext = path.extname(originalName).toLowerCase().replace(/[^.a-z0-9]/g, '');
  const safeFilename = `${uuidv4()}${ext}`;  // e.g. "a1b2-c3d4-....pdf"
  return safeFilename;
}
```

### Azure Blob Storage Upload (V12.4.1, V12.4.4)

```typescript
// storage/blobStorage.ts — ✓ V12.4.1, V12.4.4: private container + SAS token access
import { BlobServiceClient } from '@azure/storage-blob';
import { DefaultAzureCredential } from '@azure/identity';

const blobClient = new BlobServiceClient(
  `https://${process.env.STORAGE_ACCOUNT}.blob.core.windows.net`,
  new DefaultAzureCredential()  // ✓ V12.4.4: Managed Identity — no access keys
);

// ✓ V12.4.1: files stored in private container (not $web or public access container)
const containerClient = blobClient.getContainerClient(process.env.UPLOADS_CONTAINER!);

export async function uploadFile(filename: string, buffer: Buffer): Promise<string> {
  const blockBlobClient = containerClient.getBlockBlobClient(filename);
  await blockBlobClient.uploadData(buffer, {
    blobHTTPHeaders: { blobContentDisposition: 'attachment' }, // ✓ V12.5.2: force download
  });
  return filename;
}

// ✓ V12.4.4: generate short-lived SAS token for authorized access (not public URL)
export async function generateDownloadUrl(filename: string, userId: string): Promise<string> {
  // Verify ownership before generating URL ✓ V4.2.1 BOLA
  const record = await db('uploads').where({ filename, user_id: userId }).first();
  if (!record) throw new Error('Not found');

  const blockBlobClient = containerClient.getBlockBlobClient(filename);
  const expiresOn = new Date(Date.now() + 5 * 60 * 1000); // 5-min SAS
  const sasUrl = await blockBlobClient.generateSasUrl({
    permissions: { read: true },
    expiresOn,
  });
  return sasUrl;
}
```

### File Download Headers (V12.5.2)

```typescript
// ✓ V12.5.2: force browser to download rather than render uploaded files
res.setHeader('Content-Disposition', `attachment; filename="download"`);
res.setHeader('Content-Type', 'application/octet-stream');
res.setHeader('X-Content-Type-Options', 'nosniff');
// NEVER: res.setHeader('Content-Type', userSuppliedMimeType) — enables XSS via SVG/HTML upload
```

### Common anti-patterns
- Accepting user-supplied filename in `Content-Disposition` header (RFD attack vector)
- Validating file type by extension or `Content-Type` header only — use magic byte detection
- Storing uploaded files in the web root — enables direct URL access bypassing auth
- Public Azure Blob container for upload storage
- Passing user-supplied filename to `execFile` without sanitization

### Organization-specific patterns
- Cloud Landing Zone: all user-uploaded files must go to Azure Blob private containers with Managed Identity access
- File serving: always generate short-lived SAS tokens (5–15 min); never expose permanent public URLs for user uploads
- Antivirus: Cloud Landing Zone Defender for Storage provides automatic AV scanning on Blob uploads — no app-level scanner required
- For uploads containing Protected B data (e.g., uploaded SIN documents): apply field-level encryption at rest (V6.1.1) in addition to Blob storage
