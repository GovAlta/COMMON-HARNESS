---
id: api-security
name: API Security Skill
description: Provides consolidated API security requirements for REST / SOAP / GraphQL / gRPC / WebSocket assessments used by higher-level compliance skills.
type: sub-agent
version: 1.0.0
tools_required:
  - Read
tools_optional:
  - Glob
  - Grep
references:
  - asvs-level2-security-assessment
upstream: []
outputs: []
call_sequence_hard:
  - Must resolve declared upstream dependencies before execution, or fail fast with a dependency error.
  - Must be loaded before ASVS V13 API and web service requirement assessment.
---

## Overview

This skill provides comprehensive API security requirements applicable to all API types (REST, SOAP, GraphQL, gRPC, WebSocket) and deployment patterns (traditional, BaaS, serverless, microservice). It consolidates API security guidance from the OWASP ASVS, the organizational Web API Standard, and the OWASP API Security Top 10.

This is a **referenced skill**: it is invoked by other skills that need API security assessment or compliance capabilities. Consuming skills include:

- **ASVS Level 2 Assessment Skill**: V13 (API and Web Service) requirements map to this skill
- **Web API Standards Compliance Skill**: Section 6 (Security) requirements map to this skill
- **REST API Standards Compliance Skill**: security aspects of REST API design map to this skill

### ASVS V13 Requirement Mapping

When this skill is invoked from an ASVS assessment, the following mapping applies:

| ASVS Sub-Category | Sections in This Skill |
|---|---|
| V13.1 Generic Web Service Security | 1.1, 7.2, 8 |
| V13.2 RESTful Web Service | 4.2, 4.3, 8.1 |
| V13.3 SOAP Web Service | 8.2 |
| V13.4 GraphQL | 5.5, 8.3 |
| V13.5 API Authentication and Token Security | 1.2, 1.3, 1.4 |
| V13.6 API Rate Limiting and Resource Protection | 5, 6 |
| V13.7 API Discovery and Inventory | 11 |
| V13.8 Inter-Service API Security | 2 |
| OWASP API Security Top 10 Cross-Reference | 12 |

---

## 1. API Authentication & Authorization

### 1.1 General Requirements

- Consistent authentication mechanism across all API types (REST, GraphQL, SOAP, gRPC, WebSocket)
- Authorization checks enforced server-side for every API endpoint
- All API endpoints require authentication unless explicitly designed to be public: document justification for any unauthenticated endpoints
- API responses do not expose unnecessary internal implementation details (stack traces, internal IDs, database column names)
- Always authenticate and authorize before any operation: restricts access to permitted individuals and systems

### 1.2 OAuth 2.0 / OpenID Connect (OIDC)

- Validate tokens server-side on every request: signature / issuer / audience / expiry / scope
- Do not rely solely on client-side token validation
- Use appropriate grant types:
  - **Authorization code + PKCE** for public clients (SPAs, mobile apps)
  - **Client credentials** for service-to-service communication

### 1.3 API Key Security

- Store keys securely: never in source code, client-side code, or URL parameters
- Implement key rotation mechanisms
- Scope keys to minimum required permissions
- Set expiration dates
- Transmit only in HTTP headers: never in query strings

### 1.4 JWT Security

- Validate all claims: `iss` (issuer), `aud` (audience), `exp` (expiry), `nbf` (not before), `iat` (issued at)
- Reject the `none` algorithm
- Use asymmetric signing (RS256/ES256) for distributed verification
- Keep token payloads minimal: no sensitive data in claims
- Implement token revocation for long-lived tokens
- Use signed JWT tokens with secure algorithms (not `none`)

### 1.5 Object-Level Authorization: BOLA (OWASP API1:2023)

Broken Object Level Authorization: API endpoints expose object IDs without verifying the requesting user owns or can access that object.

- Check every endpoint that accepts an object ID: verify server-side ownership/permission check before returning or modifying data
- Implement per-object authorization checks on every endpoint that accepts an object identifier

### 1.6 Function-Level Authorization: BFLA (OWASP API5:2023)

Broken Function Level Authorization: Users can access admin or privileged API functions.

- Verify role-based access control on every endpoint
- Check that admin endpoints are not discoverable by unprivileged users

### 1.7 Object Property-Level Authorization and Mass Assignment (OWASP API3:2023)

Broken Object Property Level Authorization: API exposes object properties the user shouldn't see or allows mass assignment of properties.

- Check API responses don't include fields the user lacks permission for
- Verify update endpoints use allowlists (not blocklists) for writable fields
- Filter API responses to include only fields the requesting user is authorized to see: use explicit allowlists for serialization (not blocklists)
- Implement mass assignment protection: use allowlists for writable fields on update/create endpoints; reject unexpected fields

### 1.8 Organization-Specific: Authentication & Authorization Infrastructure

**For Client-to-Service Traffic (North/South):**
- MUST use the API Gateway to enforce edge security
- MUST use organizational standard IAM services:
  - Corporate OIDC Provider
  - External Identity Gateway Service

**Exceptions:**
- **Open data APIs**: Fully anonymous access allowed at Information Controller's discretion: throttling still required
- **Low-trust APIs**: API keys acceptable as alternative to definitive identification
- **Liveness tests**: May be fully anonymous: throttling still required

---

## 2. Inter-Service (East-West) API Security

### 2.1 Service-to-Service Authentication

- Service-to-service authentication is enforced (mTLS, signed tokens, service mesh identity)
- Internal APIs do not rely solely on network perimeter for security
- Validate service identity on every request
- Do not rely on network location alone for trust

### 2.2 Internal API Authorization

- Internal API endpoints enforce authorization appropriate to the calling service's role
- Service mesh or API gateway policies enforce least-privilege access between services
- Sensitive data transmitted between services is encrypted in transit
- Internal APIs are not accidentally exposed to external networks

### 2.3 Security Context Propagation

- The user's security context MUST be propagated across different APIs during service-to-service communication
- **Exception**: When a 3rd party controls the called API and the contract does not include security context propagation

### 2.4 Organization-Specific: Approved East-West Authentication Options

The following service-to-service authentication mechanisms are approved for the organization:
- Service account authentication
- API key authentication
- JWT-based authentication
- OAuth 2.0 with Client Credential grant
- Service mesh pattern with Mutual TLS (mTLS)

---

## 3. Transport Security

### 3.1 TLS Requirements

- TLS 1.2 or higher required for all connections
- Use strong cipher suites
- Certificate validation required for all connections

### 3.2 HTTP Rejection Policy

- HTTP requests to HTTPS APIs MUST be rejected, not redirected
- Request URL strings can be tracked and compromised even with encryption: rejection prevents any data leakage through the initial cleartext request

### 3.3 Backend Connection Security

- Encrypted connections to all external systems
- Certificate validation for all backend/outbound connections: not just client-facing connections

### 3.4 Quantum-Resistant Encryption

- All encryption used must be quantum-resistant, per NIST guidance
- This applies to both transport encryption and any encryption of data at rest handled via API operations

---

## 4. Input Validation & Output Encoding

### 4.1 Zero-Trust Input Validation

- Web APIs MUST NOT trust inputs and MUST re-validate all inputs: aligns with zero-trust security strategy
- Must re-validate the caller's authentication and authorization, not just data inputs
- **Exception**: May defer validation for inputs that are simply forwarded to 3rd party APIs without local processing
- Treat all submitted data as untrusted: validate before processing
- Use schema and data models for validation

### 4.2 Content-Type Validation

- Validate `Content-Type` header matches expected media type on every request
- Reject requests with unexpected content types: return `415 Unsupported Media Type`
- Validate that response `Content-Type` matches the actual response body

### 4.3 Request Size and Parameter Validation

- Enforce request body size limits per endpoint
- Validate path parameters and query parameters with strict typing and allowlists where possible
- Use proper HTTP methods and reject method overrides unless explicitly required

### 4.4 Schema Validation

- Validate all API request bodies against a strict schema (OpenAPI spec, JSON Schema, Zod, Joi)
- Reject requests that don't conform to the defined schema
- Use framework-based validation with proper data typing

### 4.5 Output Encoding

- Context-aware output encoding to prevent XSS: HTML / JavaScript / CSS / URL encoding as appropriate
- Sanitize untrusted HTML input (e.g., DOMPurify)
- Handle SVG scriptable content appropriately
- HTTP parameter pollution protection

### 4.6 Deserialization Prevention

- Integrity checks on serialized data
- Strict type enforcement during deserialization
- Isolation of deserialization code from business logic
- Do not deserialize untrusted data without validation

### 4.7 SSRF Protection (OWASP API7:2023)

Server-Side Request Forgery: API accepts URLs/URIs and fetches them server-side without validation.

- Verify URL inputs are validated against allowlists
- Check that internal network addresses are blocked
- Validate and sanitize all URLs before server-side fetching
- Protect against SSRF attacks targeting cloud metadata endpoints

---

## 5. API Rate Limiting & Resource Protection

### 5.1 General Rate Limiting

- Implement rate limiting per endpoint, per client, and per user
- Rate limiting is required for ALL endpoints, including anonymous and health check endpoints
- May be implemented at the service level or via associated infrastructure

### 5.2 Endpoint-Specific Rate Limits

- Apply stricter rate limits to authentication and sensitive data endpoints
- Apply stricter rate limits to write operations and endpoints consuming paid third-party services
- Implement request body size limits appropriate to each endpoint's function

### 5.3 Response Headers

- Return `429 Too Many Requests` with `Retry-After` header when limits are exceeded

### 5.4 Batch and Bulk Operation Protection

- Protect against batch/bulk operation abuse
- Limit array sizes in request bodies
- Enforce pagination bounds (maximum page size)
- Enforce request size limits per endpoint

### 5.5 GraphQL-Specific Rate Limiting

- Limit query depth / breadth / computed complexity
- Rate limit by query complexity, not just request count
- Implement query cost/complexity analysis to prevent resource exhaustion

### 5.6 Unrestricted Resource Consumption (OWASP API4:2023)

No rate limiting, pagination limits, or query complexity controls.

- Verify rate limiting, pagination bounds, file upload size limits, and query complexity limits exist

### 5.7 Organization-Specific: Infrastructure-Level Protection

Rate limiting and throttling can be achieved via the service itself or via associated infrastructure:
- **Cloudflare**: infrastructure-level endpoint protection
- **F5 Shape**: infrastructure-level protection with behavioral analysis

Throttling is required to prevent denial-of-service attacks: even for anonymous and health check endpoints.

---

## 6. Resource Consumption & Financial Exposure

### 6.1 Third-Party Service Protection

- Require authentication on all endpoints that consume paid third-party services (AI/LLM APIs, email services, SMS providers, cloud compute)
- Implement per-user and per-endpoint rate limiting on resource-consuming endpoints with stricter limits than general API endpoints

### 6.2 Budget and Monitoring Controls

- Set budget alerts and hard spending caps on third-party API accounts (Anthropic, OpenAI, Google AI, email providers)
- Monitor API usage for anomalous consumption patterns
- Quantify estimated cost impact where possible (e.g., "unauthenticated access to LLM API at $15/M output tokens, estimated $X/hour at sustained abuse")

### 6.3 Resource Consumption Risk Factors

When assessing resource consumption risks, consider:
- Third-party API credit abuse (AI/LLM APIs, email/SMS services, cloud compute)
- Storage quota exhaustion
- Bandwidth abuse
- Compute resource exhaustion via complex queries or large payloads

---

## 7. Sensitive Data Protection in APIs

### 7.1 URL Parameter Protection

- Web APIs MUST NOT expose sensitive data in request URLs
- Request URL strings can be tracked and compromised even with encryption
- Pass sensitive data (e.g., SIN, personal info, PHN) as JSON payload, not URL parameters

### 7.2 Error Response Protection

- Generic error messages to users: do not expose internal details
- No stack traces, internal IDs, or database column names in API responses
- No sensitive data (personal info, Protected data) in error responses
- Consistent error handling across all API endpoints
- Avoid `500 Internal Server Error`: implement proper error handling and log stack traces server-side

### 7.3 API Response Filtering

- Filter API responses to include only fields the requesting user is authorized to see
- Use explicit allowlists for serialization: not blocklists
- Check that API responses don't include fields the user lacks permission for

### 7.4 Classification-Driven Controls

- When a vulnerability directly affects data classified as Protected B or higher, elevate the severity accordingly
- Trace high-sensitivity data elements through their complete API lifecycle: input (API request) -> processing -> storage -> output (API response) -> transmission (inter-service call, external API)
- Detailed classification methodology is provided in the Information Security Classification Skill

---

## 8. API-Type-Specific Security

### 8.1 RESTful Web Service Security

- Validate `Content-Type` header matches expected media type on every request
- Reject requests with unexpected content types (return `415 Unsupported Media Type`)
- Use proper HTTP methods and reject method overrides unless explicitly required
- Validate that response `Content-Type` matches the actual response body
- Enforce request body size limits per endpoint
- Validate path parameters and query parameters with strict typing and allowlists where possible

### 8.2 SOAP Web Service Security

- Validate SOAP envelope structure against XSD schema
- Protect against XXE (XML External Entity) attacks by disabling external entity processing in XML parsers
- Validate WS-Security headers if used

### 8.3 GraphQL Security

- Implement query depth limiting to prevent nested query abuse
- Implement query cost/complexity analysis to prevent resource exhaustion
- Enforce per-field authorization (not just per-query)
- Disable introspection in production environments
- Implement persisted queries or query allowlisting where feasible
- Rate limit by query complexity, not just request count

### 8.4 WebSocket / SSE / Webhook Security

- WebSocket and Server-Sent Events (SSE) endpoints require authentication on connection establishment
- Verify webhook signatures using HMAC-SHA256 or equivalent before processing webhook payloads
- Webhook receivers must validate the source before processing

---

## 9. CORS Configuration

### 9.1 Origin Allowlists

- Configure CORS with explicit origin allowlists per endpoint group
- Never use wildcard origins (`*`) with credentials
- Permissive CORS is a security misconfiguration (OWASP API8:2023)

### 9.2 Security Misconfiguration Checks (OWASP API8:2023)

- Check CORS policy
- Verify security headers are present
- Confirm error responses do not leak implementation details
- Verify only necessary HTTP methods are enabled
- Disable unnecessary features and debug modes

---

## 10. Audit, Logging & Monitoring

### 10.1 Mandatory Audit Log Fields

All web APIs MUST audit incoming requests. The following fields are required:

| Item | Mandatory |
|------|-----------|
| HTTP Request URL | Yes |
| HTTP Request Method | Yes |
| HTTP Request Timestamp | Yes |
| Client Principal (except anonymous APIs) | Yes |
| HTTP Request Headers | Recommended |
| HTTP Request Body | No |
| Client IP Address | No (see note) |

**Note on Client IP**: Can be unreliable due to load balancers and may constitute personal information. Confirm reliability and PI status before logging.

### 10.2 Correlation ID

- Correlation ID MUST appear in audit log for APIs in web service call sequences
- Required for security investigation / monitoring / debugging across service boundaries

### 10.3 Security Event Logging

Log security-relevant events including:
- Authentication failures
- Access control failures
- Input validation failures
- Rate limiting triggers
- Unusual patterns of API access

### 10.4 Log Protection

- Prevent log injection attacks
- Protect logs against truncation
- Protect logs from unauthorized access
- Preserve log integrity

### 10.5 Telemetry

- APIs should be instrumented for full telemetry data (in-bound and out-bound)

### 10.6 Organization-Specific: Log Management Standard

- Must follow the Log Management Standard
- Audit logging must meet same security requirements as any other organizational solution

---

## 11. API Discovery & Inventory

### 11.1 Technical API Surface Inventory

During assessment or design, all API surfaces MUST be identified and inventoried:

- Locate and analyze OpenAPI/Swagger specifications, GraphQL schemas, WSDL files, and protobuf definitions
- Map all route/endpoint definitions from framework routing configuration (e.g., Express routes, Spring controllers, ASP.NET controllers, FastAPI routers)
- Identify API gateway or reverse proxy configurations (e.g., Kong, AWS API Gateway, Nginx, Envoy, Azure API Management)
- Catalog middleware chains for each endpoint (authentication, authorization, validation, rate limiting)
- Identify WebSocket endpoints, Server-Sent Events endpoints, and webhook receivers
- Document any undocumented/shadow endpoints found in code but absent from API specifications
- Note API versioning strategy and whether deprecated versions remain accessible

### 11.2 Improper Inventory Management (OWASP API9:2023)

Undocumented, deprecated, or shadow API endpoints remain accessible.

- Compare code routes against API documentation
- Check for deprecated API versions still serving traffic
- Identify endpoints that exist in code but are not documented in API specifications

### 11.3 Organization-Specific: API Cataloguing

Owners of reusable APIs MUST catalogue their APIs in the most appropriate location:
- organizational common capabilities listing
- organizational configuration management database (CMDB)
- organizational ITSM service catalogue (BERNIE)

Applicable to APIs intended for use beyond a single solution and/or exposed externally.

---

## 12. OWASP API Security Top 10 (2023) Cross-Reference

When assessing API security, explicitly verify against each of these risks. The "Skill Section" column maps each risk to the relevant section of this skill for detailed requirements.

| OWASP API Risk | Description | Key Verification Points | Skill Section |
|---|---|---|---|
| **API1:2023: Broken Object Level Authorization (BOLA)** | API endpoints expose object IDs without verifying the requesting user owns/can access that object | Check every endpoint that accepts an object ID: verify server-side ownership/permission check before returning or modifying data | 1.5 |
| **API2:2023: Broken Authentication** | Weak or missing authentication on API endpoints | Verify all non-public endpoints require valid authentication; check token validation is complete (signature, expiry, audience, issuer) | 1.1, 1.2, 1.3, 1.4 |
| **API3:2023: Broken Object Property Level Authorization** | API exposes object properties the user shouldn't see or allows mass assignment | Check API responses don't include fields the user lacks permission for; verify update endpoints use allowlists (not blocklists) for writable fields | 1.7, 7.3 |
| **API4:2023: Unrestricted Resource Consumption** | No rate limiting, pagination limits, or query complexity controls | Verify rate limiting, pagination bounds, file upload size limits, and query complexity limits exist | 5, 6 |
| **API5:2023: Broken Function Level Authorization** | Users can access admin or privileged API functions | Verify role-based access control on every endpoint; check that admin endpoints are not discoverable by unprivileged users | 1.6 |
| **API6:2023: Unrestricted Access to Sensitive Business Flows** | Automated abuse of legitimate business flows (scraping, ticket scalping) | Check anti-automation controls on business-critical flows | 5.1, 5.2 |
| **API7:2023: Server-Side Request Forgery (SSRF)** | API accepts URLs/URIs and fetches them server-side without validation | Verify URL inputs are validated against allowlists; check that internal network addresses are blocked | 4.7 |
| **API8:2023: Security Misconfiguration** | Permissive CORS, missing security headers, verbose errors, unnecessary HTTP methods | Check CORS policy, security headers, error responses, enabled HTTP methods | 9, 7.2 |
| **API9:2023: Improper Inventory Management** | Undocumented, deprecated, or shadow API endpoints remain accessible | Compare code routes against API documentation; check for deprecated API versions still serving traffic | 11 |
| **API10:2023: Unsafe Consumption of APIs** | Application trusts third-party API responses without validation | Verify the application validates / sanitizes / applies appropriate timeouts when consuming external APIs | 4.1 |

---

## 13. BaaS / Serverless Platform Security

When assessing applications built on Backend-as-a-Service (BaaS) or serverless platforms, the following platform-specific configuration checks supplement the generic API security requirements. These platforms shift many security controls out of application code and into platform configuration: a misconfiguration at the platform level can bypass all application-layer security.

### 13.1 Supabase

- **Edge Function JWT Verification**: Check `supabase/config.toml` for `verify_jwt` setting on every function: `verify_jwt = false` disables platform-level authentication enforcement, meaning the Supabase gateway passes all requests through without validating the Authorization header
- **Row-Level Security (RLS) Policies**: Review all SQL migration files for RLS policy definitions: check for overly permissive policies such as `FOR ALL USING (true)` which grant unrestricted access; verify RLS is enabled on every table containing sensitive data; check that policies reference `auth.uid()` or equivalent for user-scoped access
- **Anon Key vs Service Role Key**: Verify the anon key (public, low-privilege) is not used where the service role key (private, full-access) is required, and vice versa; verify the service role key is never exposed in client-side code or git history
- **Storage Bucket Policies**: Check Supabase Storage bucket RLS policies: default buckets may allow public access; verify `storage.objects` policies enforce authentication
- **Auth Configuration**: Review Supabase Auth settings for email confirmation requirements, password strength policies, OAuth provider configuration, and redirect URL allowlists

### 13.2 Firebase / Google Cloud

- **Firestore Security Rules**: Review `firestore.rules` for overly permissive rules (e.g., `allow read, write: if true`); verify rules enforce user-scoped access via `request.auth.uid`
- **Firebase Storage Rules**: Review `storage.rules` for public read/write access on sensitive buckets
- **Cloud Function Authentication**: Check whether Cloud Functions require authentication via IAM or allow unauthenticated invocation (`--allow-unauthenticated`)
- **Firebase Auth Configuration**: Review sign-in providers, email enumeration protection, and authorized domains

### 13.3 AWS (Lambda, API Gateway, Cognito, S3, IAM)

- **API Gateway Authorizers**: Verify all API Gateway routes have authorizers configured (Cognito, Lambda, IAM); check for routes with `NONE` authorization
- **Lambda Function URLs**: Check whether Lambda function URLs allow unauthenticated access (`AuthType: NONE`)
- **S3 Bucket Policies**: Review bucket policies for public access; check Block Public Access settings; verify no `Principal: *` grants on sensitive buckets
- **Cognito User Pool Configuration**: Review password policies, MFA settings, attribute permissions, and app client settings (client secret usage, OAuth scopes)
- **IAM Roles**: Verify Lambda execution roles follow least privilege: no `*` resource permissions on sensitive services

### 13.4 Azure (Static Web Apps, Functions, Cosmos DB)

- **Azure Function Authentication**: Check `function.json` and host-level settings for authentication requirements; verify no anonymous access on sensitive functions
- **Cosmos DB Access Policies**: Review connection string exposure and RBAC configuration; check for primary key usage vs Azure AD authentication
- **Azure Blob Storage**: Review container access levels (private vs blob vs container); check shared access signature (SAS) expiration and permissions
- **API Management Policies**: Verify authentication, rate limiting, and CORS policies on all API routes

### 13.5 General BaaS/Serverless Security Checks

- **Environment Variable Exposure**: Verify secrets are stored in the platform's secrets manager (not in configuration files committed to source control)
- **Function Timeout and Memory Limits**: Check that functions have appropriate timeout and memory limits to prevent resource exhaustion attacks
- **Cold Start Security**: Verify that authentication checks are not bypassed during function cold starts or initialization
- **Platform-Managed vs Application-Managed Auth**: Identify whether authentication is enforced at the platform gateway level, the application code level, or both: a gap in either layer can create a bypass

---

## 14. Cloud Storage and Object Storage Security

- Restrict storage bucket policies to require authentication: no public read/write on buckets containing internal or sensitive data
- Implement per-bucket access control policies scoped to authenticated users or roles
- Disable public bucket listing/enumeration
- Audit storage bucket policies as part of access control review (they are often overlooked when database access control is the focus)
- **Supabase Storage**: Configure RLS policies on `storage.objects`
- **S3**: Review bucket policies and ACLs; check Block Public Access settings
- **GCS**: Review IAM bindings
- **Azure Blob**: Review shared access signatures and access policies

---

## 15. organizational Organizational Security Requirements

### 15.1 General Security Posture

- Web APIs used beyond a single solution must meet the same security requirements as any other organizational solution
- See organizational security-oriented IMT policy instruments
- APIs must be secure by design: security is NOT an afterthought
- Every new or changed API changes the organizational attack surface

### 15.2 Penetration Testing

- External web APIs MUST be penetration tested before public availability
- Available via organizational tooling
- Request via BERNIE penetration testing service
- Contact: cybersecurity@example.com

### 15.3 Security Assurance

- APIs must follow the same security assurance practices as any externally exposed solution
- Level determined by the security assurance level of the solution

### 15.4 OWASP Resilience

APIs MUST be resilient to common attacks including:
- OWASP API Security Top 10 (see Section 12 of this skill)
- OWASP Top 10 (general web application vulnerabilities)

### 15.5 organizational Security Tools

The organizational provides the following tools to assist with API security compliance:

| Tool | Purpose |
|------|---------|
| API Skeletons | Ease compliance with standards |
| Cloudflare | Infrastructure-level endpoint protection |
| F5 Shape | Infrastructure-level protection with behavioral analysis |
| SonarQube | Static code analysis, basic vulnerability scanning |
| Visual Studio / VS Code | Static code analysis and SAST plugins |
| CodeQL | Static application security testing (SAST) |
| Dependabot | Software composition analysis (SCA) |
| Tenable | Dynamic application security testing (DAST), vulnerability scanning |

---

## 16. API Security Remediation Patterns

When findings are identified against the requirements in this skill, the following remediation patterns apply.

### 16.1 Authentication Remediation

- Implement per-object authorization checks on every endpoint that accepts an object identifier: verify the requesting user/service owns or is permitted to access the object before returning or modifying data
- Use an API gateway or centralized middleware for authentication / rate limiting / logging / request validation where architecture supports it

### 16.2 Authorization Remediation

- Implement server-side authorization checks on every endpoint
- Use indirect object references
- Apply principle of least privilege
- Centralize access control logic

### 16.3 API-Specific Remediation

- Validate all API request bodies against a strict schema (OpenAPI spec, JSON Schema, Zod, Joi); reject requests that don't conform
- Filter API responses to include only fields the requesting user is authorized to see; use explicit allowlists for serialization (not blocklists)
- Implement per-endpoint rate limiting with appropriate thresholds (stricter for auth endpoints, sensitive data, and write operations)
- Verify webhook signatures using HMAC-SHA256 or equivalent before processing webhook payloads
- Configure CORS with explicit origin allowlists per endpoint group; never use wildcard origins with credentials
- Enforce request size limits, pagination bounds (maximum page size), and array size limits to prevent resource exhaustion
- For GraphQL: implement query depth limits, complexity scoring, and disable introspection in production
- For inter-service APIs: implement mTLS or signed JWT authentication; do not rely on network perimeter alone
- Implement mass assignment protection: use allowlists for writable fields on update/create endpoints; reject unexpected fields

### 16.4 Cloud Storage and Object Storage Remediation

- Restrict storage bucket policies to require authentication: no public read/write on buckets containing internal or sensitive data
- Implement per-bucket access control policies scoped to authenticated users or roles
- Disable public bucket listing/enumeration
- Audit storage bucket policies as part of access control review (they are often overlooked when database access control is the focus)
- For Supabase Storage: configure RLS policies on `storage.objects`; for S3: review bucket policies and ACLs; for GCS: review IAM bindings; for Azure Blob: review shared access signatures and access policies

### 16.5 Resource Consumption and Third-Party Service Abuse Remediation

- Require authentication on all endpoints that consume paid third-party services (AI/LLM APIs, email services, SMS providers, cloud compute)
- Implement per-user and per-endpoint rate limiting on resource-consuming endpoints with stricter limits than general API endpoints
- Set budget alerts and hard spending caps on third-party API accounts (Anthropic, OpenAI, Google AI, email providers)
- Monitor API usage for anomalous consumption patterns

---

## 17. CWE Quick Reference for API Security

| Security Area | Common CWEs |
|---|---|
| API Security (General) | CWE-284 (Improper Access Control), CWE-285 (Improper Authorization), CWE-346 (Origin Validation Error), CWE-352 (CSRF), CWE-400 (Uncontrolled Resource Consumption), CWE-434 (Unrestricted Upload), CWE-611 (XXE), CWE-799 (Improper Control of Interaction Frequency), CWE-918 (SSRF), CWE-942 (Permissive CORS), CWE-1270 (Object-Level Authorization Bypass: BOLA), CWE-269 (Improper Privilege Management: BFLA), CWE-915 (Mass Assignment) |
| Cloud Storage | CWE-284 (Improper Access Control), CWE-732 (Incorrect Permission Assignment), CWE-552 (Files Accessible to External Parties) |
| Resource Consumption | CWE-400 (Uncontrolled Resource Consumption), CWE-799 (Improper Control of Interaction Frequency), CWE-770 (Allocation of Resources Without Limits) |

---

## References

- OWASP Application Security Verification Standard (ASVS) 4.0.3
- OWASP API Security Top 10 (2023)
- organizational Web API Standard v1.0 (November 2024)
- REST API Standard v1.0 (November 2024)
- Information Security Management Directives (ISMD)
- organizational Cybersecurity Policy
- Log Management Standard
- NIST Post-Quantum Cryptography Standards
