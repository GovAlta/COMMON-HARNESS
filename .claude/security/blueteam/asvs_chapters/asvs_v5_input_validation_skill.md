---
id: asvs-v5-input-validation-subskill
name: ASVS V5 Input Validation Sub-Skill
description: ASVS chapter V5 validation and sanitization assessment logic consumed by the ASVS Level 2 assessment workflow.
type: sub-agent
version: 1.1.0
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

> Sub-skill for **V5 Validation, Sanitization and Encoding**. Finding IDs: `[V5-NNN]`. Tactics: `shared/reference/attack-chain-reference.md` §2. Phase 6 normalizes IDs.

---

## Exclusion Conditions

| Condition                                            | Sub-requirements excluded         | Justification                     |
| ---------------------------------------------------- | --------------------------------- | --------------------------------- |
| Managed language (C#, Java, Python, JS/TS, Go, Ruby) | V5.4 Memory/String/Unmanaged Code | Memory safety provided by runtime |
| No user-generated HTML rendering                     | V5.2.1 (DOMPurify sanitization)   | No HTML rendering path present    |
| No deserialization of untrusted data                 | V5.5 Deserialization Prevention   | No untrusted data deserialization |

If all V5 sub-requirements are excluded, write `[V5 CHAPTER EXCLUDED — managed language, no HTML rendering, no deserialization]` and stop.

---

> Environment assumptions for this chapter: see `shared/reference/environment-baseline.md` § "ASVS Chapter Assumption Mapping."

---

## V5 Requirements and Verification Rules

### V5.1 — Input Validation

**V5.1.1** — Verify that the application has defenses against HTTP parameter pollution attacks, particularly if the application framework makes no distinction about the source of request parameters.
- **CAS Rule:** None.
- **Verification:** Check framework handling of duplicate query parameters. Verify that the application does not use the last/first value of a duplicated parameter in security-sensitive contexts (auth, access control, billing).
- **ATT&CK Tactic:** TA0001 — Initial Access
- **Severity if failed:** Medium

**V5.1.2** — Verify that frameworks protect against mass parameter assignment attacks, or that the application has countermeasures to protect against unsafe parameter assignment.
- **CAS Rule:** None.
- **Verification:** Check for mass assignment patterns: `Object.assign(dbRecord, req.body)`, `entity.Update(dto)` without field allowlisting, `[FromBody]` binding to database entity classes directly. Verify input DTOs restrict which fields can be set by the client.
- **ATT&CK Tactic:** TA0004 — Privilege Escalation
- **Severity if failed:** High

**V5.1.3** — Verify that all input (HTML form fields, REST requests, URL parameters, HTTP headers, cookies, batch files, RSS feeds, etc.) is validated using positive validation (allow lists).
- **CAS Rule:** None.
- **Verification:** Review API request handlers. Check for schema validation (Zod, Joi, FluentValidation, JSON Schema) on request bodies. Verify that validation is allow-list based (specifying allowed values/formats) rather than just deny-list based (blocking known bad inputs).
- **ATT&CK Tactic:** TA0002 — Execution
- **Severity if failed:** High

**V5.1.4** — Verify that structured data is strongly typed and validated against a defined schema including allowed characters, length and pattern.
- **CAS Rule:** None.
- **Verification:** Check API endpoint handlers for validation of structured data types (dates, identifiers, enums). Look for unvalidated `string` fields that should have constrained formats.
- **ATT&CK Tactic:** TA0002 — Execution
- **Severity if failed:** Medium

**V5.1.5** — Verify that URL redirects and forwards only allow destinations which appear on an allowlist, or show a warning when redirecting to potentially untrusted content.
- **CAS Rule:** None.
- **Verification:** Search for redirect operations using user-supplied URLs: `Response.Redirect(req.query.returnUrl)`, `HttpContext.Response.Redirect(returnUrl)`. Verify allowlist or origin validation on redirect target.
- **ATT&CK Tactic:** TA0001 — Initial Access (open redirect → phishing)
- **Severity if failed:** Medium

---

### V5.2 — Sanitization and Sandboxing

**V5.2.1** — Verify that all untrusted HTML input from WYSIWYG editors or similar is properly sanitized with an HTML sanitizer library or framework feature.
- **CAS Rule:** None.
- **Verification:** Search for HTML rendering of user-controlled content. Check for DOMPurify, HtmlSanitizer, Bleach, or equivalent sanitization library usage. Raw `innerHTML` assignment without sanitization is a Critical finding.
- **ATT&CK Tactic:** TA0001 — Initial Access (stored XSS)
- **Severity if failed:** Critical (stored XSS)

**V5.2.2** — Verify that unstructured data is sanitized to enforce safety measures such as allowed characters and length.
- **CAS Rule:** None.
- **Verification:** Check free-text fields for length enforcement and basic character restrictions.
- **ATT&CK Tactic:** TA0002 — Execution
- **Severity if failed:** Medium

**V5.2.3** — Verify that the application sanitizes user input before passing to mail systems to protect against SMTP or IMAP injection.
- **CAS Rule:** None.
- **Verification:** Search for email sending code that includes user-supplied data in headers or body without sanitization.
- **ATT&CK Tactic:** TA0002 — Execution
- **Severity if failed:** High

**V5.2.4** — Verify that the application avoids the use of `eval()` or other dynamic code execution features. Where there is no alternative, any user input being included must be sanitized or sandboxed.
- **CAS Rule:** None.
- **Verification:** Search for `eval(`, `exec(`, `Function(`, `process.binding(` in application code. Flag any usage with user-supplied input.
- **ATT&CK Tactic:** TA0002 — Execution
- **Severity if failed:** Critical

**V5.2.5** — Verify that the application protects against template injection attacks by ensuring that any user input being included is sanitized or sandboxed.
- **CAS Rule:** None.
- **Verification:** Search for template rendering with user-supplied input passed directly to template engine (e.g., `Handlebars.compile(userInput)`, `Template(userInput)`).
- **ATT&CK Tactic:** TA0002 — Execution
- **Severity if failed:** Critical

**V5.2.6** — Verify that the application protects against SSRF attacks, by validating or sanitizing untrusted data or HTTP file metadata.
- **CAS Rule:** None.
- **Verification:** Search for URL construction from user input used in HTTP requests or file operations. Check `fetch(url)`, `HttpClient.GetAsync(url)`, `WebClient.DownloadString(url)` where `url` originates from user input.
- **ATT&CK Tactic:** TA0008 — Lateral Movement (SSRF → internal services)
- **Severity if failed:** Critical

**V5.2.7** — Verify that the application sanitizes, disables, or sandboxes user-supplied SVG scriptable content.
- **CAS Rule:** None.
- **Verification:** Check SVG file upload or inline SVG rendering paths. SVG files can contain JavaScript.
- **ATT&CK Tactic:** TA0001 — Initial Access (XSS via SVG)
- **Severity if failed:** High

**V5.2.8** — Verify that the application sanitizes, disables, or sandboxes user-supplied scriptable or expression template language content.
- **CAS Rule:** None.
- **Verification:** Check for expression language injection (EL injection in Java, Jinja template injection in Python, etc.) via user-supplied content in template contexts.
- **ATT&CK Tactic:** TA0002 — Execution
- **Severity if failed:** Critical

---

### V5.3 — Output Encoding and Injection Prevention

**V5.3.1** — Verify that output encoding is relevant for the interpreter and context required, such as encoding HTML entities for HTML content, URL encoding for URL parameters, attribute encoding for CSS or URL, etc.
- **CAS Rule:** None.
- **Verification:** Check template rendering for context-aware encoding. In React: `dangerouslySetInnerHTML` without sanitization is Critical. In ASP.NET Razor: `@Html.Raw()` without sanitization is Critical. In Angular: `[innerHTML]` without DomSanitizer is Critical.
- **ATT&CK Tactic:** TA0001 — Initial Access (reflected/stored XSS)
- **Severity if failed:** Critical (if exploitable), High (if mitigated by CSP but encoding absent)

**V5.3.2** — Verify that output encoding preserves the user's chosen character set and locale, such that any Unicode character point is valid and safely handled.
- **CAS Rule:** None.
- **Verification:** Check character encoding configuration. Verify UTF-8 is used consistently.
- **ATT&CK Tactic:** TA0002 — Execution
- **Severity if failed:** Low

**V5.3.3** — Verify that context-aware, preferably automated output escaping protects against reflected, stored, and DOM XSS.
- **CAS Rule:** None.
- **Verification:** Same as V5.3.1. Ensure framework auto-escaping is not disabled.
- **ATT&CK Tactic:** TA0001 — Initial Access
- **Severity if failed:** Critical

**V5.3.4** — Verify that data selection or database queries (e.g., SQL, HQL, ORM, NoSQL) use parameterized queries, ORMs, entity frameworks or are otherwise protected from database injection attacks.
- **CAS Rule:** None.
- **Verification:** Search for string concatenation in database queries: `"SELECT * FROM ... WHERE id = " + userId`, f-string SQL construction. Check ORM usage — flag raw query methods with string interpolation: `context.Database.ExecuteSqlRaw($"... {input}")`.
- **ATT&CK Tactic:** TA0002 — Execution, TA0009 — Collection
- **Severity if failed:** Critical

**V5.3.5** — Verify that where parameterized or safer mechanisms are not present, context-specific output encoding is used to protect against injection attacks, such as the use of SQL escaping to protect against SQL Injection.
- **CAS Rule:** None.
- **Verification:** If parameterized queries are absent, check for manual escaping functions.
- **ATT&CK Tactic:** TA0002 — Execution
- **Severity if failed:** Critical

**V5.3.6** — Verify that the application protects against JavaScript or JSON injection attacks, including for eval attacks and remote JavaScript includes.
- **CAS Rule:** None.
- **Verification:** Check for JSON injection in JavaScript contexts. Verify JSON-encoded data is not passed to `eval()`.
- **ATT&CK Tactic:** TA0001 — Initial Access
- **Severity if failed:** High

**V5.3.7** — Verify that the application protects against LDAP injection vulnerabilities, or that specific security controls to prevent LDAP injection have been implemented.
- **CAS Rule:** None.
- **Verification:** If LDAP is used, check for parameterized LDAP queries or input sanitization on LDAP search filters.
- **ATT&CK Tactic:** TA0002 — Execution
- **Severity if failed:** Critical

**V5.3.8** — Verify that the application protects against OS command injection and that operating system calls use parameterized OS queries or use contextual command line output encoding.
- **CAS Rule:** None.
- **Verification:** Search for `Process.Start`, `subprocess.run`, `exec()`, `child_process.exec()` with user-supplied input.
- **ATT&CK Tactic:** TA0002 — Execution
- **Severity if failed:** Critical

**V5.3.9** — Verify that the application protects against Local File Inclusion (LFI) or Remote File Inclusion (RFI) attacks.
- **CAS Rule:** None.
- **Verification:** Search for file inclusion from user-supplied paths: `include(userInput)`, `require(userPath)`, dynamic imports with user data.
- **ATT&CK Tactic:** TA0002 — Execution
- **Severity if failed:** Critical

**V5.3.10** — Verify that the application protects against XPath injection or XML injection attacks.
- **CAS Rule:** None.
- **Verification:** Check XPath or XML processing code for user input incorporated without parameterization.
- **ATT&CK Tactic:** TA0002 — Execution
- **Severity if failed:** Critical

---

### V5.4 — Memory, String, and Unmanaged Code

*Only assess for native/unmanaged code (C, C++, Assembly). Exclude for managed languages: Python, JavaScript/TypeScript, C#, Java, Go, Ruby.*

**V5.4.1** — Verify that the application uses memory-safe string, buffer, and integer operations for managed/unmanaged code.
- **CAS Rule:** None.
- **Verification:** For unmanaged code: check for unsafe string functions (`strcpy`, `sprintf`, `gets`). For managed languages: EXCLUDED.
- **ATT&CK Tactic:** TA0002 — Execution
- **Severity if failed:** Critical

**V5.4.2** — Verify that format strings do not take potentially hostile input.
- **CAS Rule:** None.
- **Verification:** Check `printf`-family calls for user-controlled format strings.
- **ATT&CK Tactic:** TA0002 — Execution
- **Severity if failed:** Critical

**V5.4.3** — Verify that sign, range, and input validation techniques are used to prevent integer overflows.
- **CAS Rule:** None.
- **Verification:** For unmanaged code: check for integer overflow in arithmetic operations on user-supplied values.
- **ATT&CK Tactic:** TA0002 — Execution
- **Severity if failed:** High

---

### V5.5 — Deserialization Prevention

*Only assess if untrusted data deserialization is present.*

**V5.5.1** — Verify that serialized objects use integrity checks or are encrypted to prevent hostile object creation or data tampering.
- **CAS Rule:** None.
- **Verification:** Check deserialization code for integrity/signature verification before processing.
- **ATT&CK Tactic:** TA0002 — Execution
- **Severity if failed:** Critical

**V5.5.2** — Verify that the application correctly restricts XML parsers to only use the most restrictive configuration possible and to ensure that unsafe features such as resolving external entities are disabled to prevent XML External Entity (XXE) attacks.
- **CAS Rule:** None.
- **Verification:** Check XML parser configuration for `DOCTYPE` processing and external entity resolution. In .NET: `XmlReaderSettings.DtdProcessing = DtdProcessing.Prohibit`.
- **ATT&CK Tactic:** TA0002 — Execution, TA0008 — Lateral Movement (SSRF via XXE)
- **Severity if failed:** Critical

**V5.5.3** — Verify that deserialization of untrusted data is avoided or is protected in both custom code and third-party libraries.
- **CAS Rule:** None.
- **Verification:** Check for `BinaryFormatter`, `ObjectInputStream`, `pickle.loads`, `yaml.load` (without Loader restriction) with untrusted input.
- **ATT&CK Tactic:** TA0002 — Execution
- **Severity if failed:** Critical

**V5.5.4** — Verify that when parsing JSON in browsers or JavaScript-based backends, `JSON.parse` is used to parse the JSON document. Do not use `eval()` to parse JSON.
- **CAS Rule:** None.
- **Verification:** Search for `eval(` used to parse JSON.
- **ATT&CK Tactic:** TA0002 — Execution
- **Severity if failed:** High

---

## ATT&CK Tactic Summary

Note: Derived from `shared/reference/attack-chain-reference.md` Section 2. Update this file if that file changes.

| Finding Pattern        | Primary Tactic                             | Kill Chain Stage                            |
| ---------------------- | ------------------------------------------ | ------------------------------------------- |
| SQL Injection          | TA0002 Execution / TA0009 Collection       | Query manipulation → data extraction or RCE |
| Stored/Reflected XSS   | TA0001 Initial Access                      | Token theft or session hijacking            |
| SSRF via user URL      | TA0008 Lateral Movement                    | Internal service access / metadata endpoint |
| OS Command Injection   | TA0002 Execution                           | Server-side command execution               |
| XXE                    | TA0002 Execution / TA0008 Lateral Movement | SSRF via XML parser                         |
| Unsafe deserialization | TA0002 Execution                           | RCE via crafted serialized payload          |
| Open redirect          | TA0001 Initial Access                      | Phishing / credential harvesting            |

---

## Cross-Chapter Reference Notes

| This chapter finding | Combines with                            | Combined chain risk                                     |
| -------------------- | ---------------------------------------- | ------------------------------------------------------- |
| V5.2.6 SSRF          | V12 SSRF protection                      | Same root cause — consolidate into single finding       |
| V5.3.4 SQL injection | V8 data protection (unencrypted PHN/SIN) | SQLi on table storing Protected B data = Critical chain |
| V5.3.1/5.3.3 XSS     | V3.2.3 JWT in localStorage               | XSS + localStorage token = account takeover chain       |

---

## Taint Analysis Phase

Systematic source-to-sink tracing to find injection paths that pattern-matching alone may miss. Run after the V5.1–V5.5 requirement checks above, using the same finding IDs (V5.3.x, V5.2.x, etc.).

### Step T1: Identify Sources

Read `.ai/blueteam/data/application_map.json`. The `endpoints[]` array is the authoritative source list. Extract all endpoints that accept user-controlled input:

- All endpoints with `auth_level: "none"` and path/query parameters
- All POST/PUT/PATCH endpoints (request body as source)
- All GET endpoints with path parameters or query parameters
- Any file upload handlers identified in `endpoints[]`

If `application_map.json` is absent, fall back to grepping all route definition files for `router.get(`, `router.post(`, `app.get(`, `app.post(` patterns.

### Step T2: Identify Sinks

Scan the codebase for security-sensitive operations. Use Grep/Read on files referenced in `critical_files[]` first, then expand to the full repo:

| Sink category | Patterns to search for |
|---|---|
| SQL queries | `.query(`, `db.prepare(`, `knex.raw(`, backtick template literals in query strings |
| OS command execution | `exec(`, `execSync(`, `spawn(`, `spawnSync(`, `child_process` imports |
| File system access | `readFile(`, `writeFile(`, `createReadStream(`, `path.join(` with non-literal args |
| Dynamic HTML / response | `res.send(` with concatenated strings, `innerHTML =`, template rendering with unescaped vars |
| External HTTP calls | `fetch(`, `axios.get(`, `axios.post(`, `http.request(`, `https.request(` with non-literal URLs |
| Dynamic code execution | `eval(`, `new Function(`, `vm.runInContext(`, `vm.runInNewContext(` |

### Step T3: Trace Data Flow

For each source-sink pair identified in T1 and T2:

1. Follow the call chain from the route handler (source) to the sink — trace up to 3 function call hops
2. At each hop, check for sanitization: parameterized query, `execFile` with explicit args array, allowlist validation, `encodeURIComponent`, `DOMPurify.sanitize`
3. If user input reaches the sink without sanitization within the 3-hop window → record as a finding

**Stop tracing** when:
- Input passes through a strict allow-list validator (Zod enum, exact regex) before reaching the sink
- Input is never used in the sink (e.g., only used for logging)
- The endpoint is excluded from V5 scope (all inputs pre-validated by framework)

### Step T4: Record Taint Findings

Record taint-discovered issues as standard V5 findings with the appropriate requirement ID:

| Taint path type | Record as |
|---|---|
| User input → SQL string concatenation | V5.3.4 (parameterized queries) |
| User input → `exec()` / `spawn()` | V5.3.8 (OS command injection) |
| User input → file path | V5.3.9 (LFI/RFI) |
| User input → `res.send()` without encoding | V5.3.1 / V5.3.3 (XSS) |
| User input → external `fetch()` URL | V5.2.6 (SSRF) |
| User input → `eval()` / `new Function()` | V5.2.4 (eval prohibition) |
| User input → LDAP query | V5.3.7 (LDAP injection) |
| User input → XPath/XML query | V5.3.10 (XPath/XML injection) |

In the finding evidence section, include the data flow trace:
```
Source: GET /api/files/:filename (endpoints[].path)
  → handler: src/routes/files.ts:42 — passes req.params.filename to readFile()
  → Sink: fs.readFile(path.join(__dirname, req.params.filename))
  → No path validation or allowlist found in 3-hop search
```

---

> **ASSESSMENT ORCHESTRATOR: STOP READING HERE.** The `## Secure Implementation Guide` section below is for `skills/14-asvs-compliant-builder.md` only. Assessment skills do not need implementation patterns.

## Secure Implementation Guide

> **For builder skills only.** Assessment skills use the full chapter file above. This section provides implementation patterns for generating ASVS V5-compliant code.

### When to apply this chapter
Load V5 when building any endpoint that accepts user input, renders user-controlled content in HTML, constructs database queries, calls OS commands, processes XML, or fetches external URLs.

### Schema Validation at API Boundary (V5.1.3, V5.1.4)

Use Zod for allow-list validation on every request body and query parameter:

```typescript
// schemas/employee.ts — ✓ V5.1.3 allow-list validation
import { z } from 'zod';

export const CreateEmployeeSchema = z.object({
  name: z.string().min(1).max(100).regex(/^[\p{L}\s'-]+$/u), // Allow only name chars
  email: z.string().email().max(254),
  department: z.enum(['HR', 'IT', 'Finance', 'Operations']), // Strict enum
  // NEVER include: isAdmin, role, userId — mass assignment protection ✓ V5.1.2
});

export const EmployeeIdSchema = z.object({
  id: z.string().uuid(), // Strict UUID format — rejects injection attempts
});

// routes/employees.ts — ✓ V5.1.3 validate before processing
router.post('/employees', authenticate, async (req, res) => {
  const result = CreateEmployeeSchema.safeParse(req.body);
  if (!result.success) {
    return res.status(400).json({ error: 'Invalid input', details: result.error.flatten() });
  }
  const { name, email, department } = result.data; // Only validated fields ✓ V5.1.2
  await employeeService.create({ name, email, department });
  res.status(201).json({ success: true });
});
```

### SQL Injection Prevention (V5.3.4)

Always use parameterized queries. String concatenation in SQL is never acceptable:

```typescript
// ✓ V5.3.4 compliant: parameterized queries with pg
import { Pool } from 'pg';

// WRONG — SQL injection vulnerability:
// const employees = await pool.query(`SELECT * FROM employees WHERE name = '${name}'`);

// RIGHT — parameterized query ✓ V5.3.4
const employees = await pool.query(
  'SELECT id, name, email FROM employees WHERE department = $1 AND active = $2',
  [department, true]
);

// With an ORM (Prisma) — also safe ✓ V5.3.4
const employees = await prisma.employee.findMany({
  where: { department, active: true },
  select: { id: true, name: true, email: true }, // Explicit field selection ✓ V8.1.3
});

// If raw SQL is unavoidable with Prisma, use tagged template literal:
const result = await prisma.$queryRaw`
  SELECT * FROM employees WHERE id = ${id}::uuid
`; // Prisma's tagged template literal is safe ✓ V5.3.4
```

### XSS Prevention (V5.3.1, V5.3.3)

For React/TSX — use JSX's automatic escaping and avoid dangerouslySetInnerHTML:

```typescript
// ✓ V5.3.1 compliant: React auto-escapes in JSX
const EmployeeName = ({ name }: { name: string }) => (
  <span>{name}</span>  // Safe: React escapes this automatically
);

// WRONG — XSS vulnerability:
// <div dangerouslySetInnerHTML={{ __html: userContent }} />

// If you must render user HTML (WYSIWYG editor output), sanitize first ✓ V5.2.1
import DOMPurify from 'dompurify';
const SafeHtml = ({ html }: { html: string }) => (
  <div dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(html) }} />
);
```

For server-side rendering with Express/EJS or Handlebars, always use the auto-escaping default (`{{ }}` not `{{{ }}}`).

### SSRF Prevention (V5.2.6)

Never fetch user-supplied URLs without an allowlist:

```typescript
// utils/safeFetch.ts — ✓ V5.2.6 SSRF prevention
import { URL } from 'url';

const ALLOWED_DOMAINS = new Set([
  'api.example.gov.ab.ca',
  'cdn.example.com',
]);

// Block cloud metadata endpoints and internal addresses
function isBlockedHost(hostname: string): boolean {
  if (['169.254.169.254', '100.100.100.200', 'metadata.google.internal'].includes(hostname)) return true;
  if (/^(10\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.)/.test(hostname)) return true; // RFC-1918
  return false;
}

export async function safeFetch(userProvidedUrl: string): Promise<Response> {
  const url = new URL(userProvidedUrl); // Throws on invalid URL

  if (!ALLOWED_DOMAINS.has(url.hostname)) {
    throw new Error(`Domain not in allowlist: ${url.hostname}`);
  }
  if (isBlockedHost(url.hostname)) {
    throw new Error('Blocked destination');
  }
  if (url.protocol !== 'https:') {
    throw new Error('Only HTTPS allowed');
  }

  return fetch(url.toString());
}
```

### Open Redirect Prevention (V5.1.5)

```typescript
// ✓ V5.1.5 compliant: validate return URL on OAuth callback
const ALLOWED_RETURN_PATHS = /^\/[a-zA-Z0-9\-_/]*$/; // Relative paths only

router.get('/auth/callback', async (req, res) => {
  const returnUrl = req.query.returnUrl as string;

  // Only allow relative paths — no external URLs ✓ V5.1.5
  if (!returnUrl || !ALLOWED_RETURN_PATHS.test(returnUrl)) {
    return res.redirect('/dashboard'); // Safe default
  }
  res.redirect(returnUrl);
});
```

### OS Command Injection Prevention (V5.3.8)

```typescript
// ✓ V5.3.8 compliant: use execFile with explicit args array, never exec with user input
import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

// WRONG: exec(` convert ${userFilename} output.pdf`) — command injection
// RIGHT: execFile with separate args array ✓ V5.3.8
const { stdout } = await execFileAsync('/usr/bin/convert', [
  inputPath,  // Already validated and sandboxed path
  '-resize', '800x600',
  outputPath,
], { timeout: 30000, maxBuffer: 10 * 1024 * 1024 });
```

### Common anti-patterns
- Building SQL queries with string interpolation or `+` concatenation
- `dangerouslySetInnerHTML` without DOMPurify sanitization
- `eval()`, `new Function()`, or `setTimeout(string)` with user input
- Using `req.body` fields directly in database queries without validation (mass assignment)
- Fetching URLs from `req.body.url` or `req.query.url` without domain allowlist validation
- `child_process.exec(userInput)` — use `execFile` with explicit argument arrays

### Organization-specific patterns
- PHN/SIN fields: validate format with regex (`/^\d{9}$/` for SIN, `/^\d{9}$/` for PHN) before accepting
- All inputs accepted by public-facing apps should be validated server-side even when Cloudflare WAF is active — WAF is not a substitute for application-layer validation
- For file metadata fields (filename, description): strip null bytes and control characters before any processing
