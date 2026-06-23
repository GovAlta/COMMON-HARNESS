# Architectural Patterns Standard

## Overview

All projects follow one of three tiered architectural patterns based on complexity, public exposure, and integration requirements. The pattern is determined during the **requirements** step and governs all subsequent architecture/development/deployment decisions.

---

## Technology Stack (Non-Negotiable)

| Layer | Technology |
|-------|-----------|
| **Frontend** | Vue 3 + Vite + PrimeVue + Tailwind CSS |
| **Backend** | Node.js + Express + TypeScript |
| **Database** | PostgreSQL 17+ |
| **Hosting** | Azure (default), AWS, or GCP |
| **Document Storage** | SharePoint (unstructured/uploaded content: never BYTEA in Postgres) |
| **SSO: Public-facing** | Generic OIDC IdP (Google, Microsoft, government identity provider, etc.) |
| **SSO: Internal** | Entra ID (Azure AD) or equivalent organizational IdP |

---

## Pattern 1: Simple (3 Components)

**When to use:** Public-facing applications with low-complexity administration.

```
┌─────────────────────────────────────────────────┐
│                   Internet                       │
└──────────────────────┬──────────────────────────┘
                       │
          ┌────────────▼────────────┐
          │   Client (Vue 3 SPA)    │  ← Public-facing UI
          └────────────┬────────────┘
                       │ API calls
          ┌────────────▼────────────┐
          │   Server (Express/TS)   │  ← API + Admin + SSO
          └────────────┬────────────┘
                       │ SQL
          ┌────────────▼────────────┐
          │   PostgreSQL Database   │
          └─────────────────────────┘
```

### Components (3)
1. **Client**: Vue 3 SPA serving both public and admin views (route-guarded)
2. **Server**: Express API handling business logic/auth/admin paths
3. **Database**: PostgreSQL with role-based row filtering

### Characteristics
- Single monorepo (`client/` + `server/`)
- SSO integration (public OIDC providers for end users; organizational IdP such as Entra ID for admin roles)
- RBAC within a single server instance (admin routes protected by role middleware)
- Direct database access from the server
- Suitable for: informational portals, simple form-based apps, dashboards with basic admin

### Repository Structure
```
app/
├── client/              # Vue 3 SPA
├── server/              # Express + TypeScript API
├── migrations/          # PostgreSQL migrations
├── package.json         # Monorepo workspace root
└── docker-compose.yml
```

---

## Pattern 2: BFF / Medium Complexity (5 Components)

**When to use:** Public-facing applications with medium complexity where the database must never be directly accessible from the public-facing server.

```
┌─────────────────────────────────────────────────┐
│                   Internet                       │
└──────────────────────┬──────────────────────────┘
                       │
          ┌────────────▼────────────┐
          │  Public Client (Vue 3)  │  ← Public-facing UI
          └────────────┬────────────┘
                       │ API calls
          ┌────────────▼────────────┐
          │  Public Server (BFF)    │  ← Public API gateway (no DB access)
          └────────────┬────────────┘
                       │ Internal API calls
          ┌────────────▼────────────┐
          │  Internal Client (Vue 3)│  ← Admin/operations UI
          ├────────────┬────────────┘
          │            │
          │  ┌─────────▼────────────┐
          │  │  Internal Server     │  ← Core API + business logic
          │  └─────────┬────────────┘
          │            │ SQL
          │  ┌─────────▼────────────┐
          │  │  PostgreSQL Database  │
          │  └──────────────────────┘
          └─────────────────────────┘
              Private Network Zone
```

### Components (5)
1. **Public Client**: Vue 3 SPA for external users (citizens, public)
2. **Public Server (BFF)**: Backend-for-Frontend; proxies requests to internal server, handles public SSO (generic OIDC IdPs), performs request shaping. **Has NO direct database access.**
3. **Internal Client**: Vue 3 SPA for admin/operations staff (Entra ID SSO)
4. **Internal Server**: Core Express API with full business logic, database access, and Entra ID auth
5. **Database**: PostgreSQL, accessible only from the internal server

### Characteristics
- Database is NEVER accessible from the public network zone
- Public server acts as a gateway that validates/transforms/forwards requests
- Internal server is the single source of truth for business logic
- Two separate SSO flows: public (generic OIDC IdPs) and internal (organizational IdP, e.g. Entra ID)
- Suitable for: end-user-facing services with staff administration, medium-risk data handling

### Repository Structure
```
app/
├── public/
│   ├── client/          # Public Vue 3 SPA
│   └── server/          # BFF gateway (no DB)
├── internal/
│   ├── client/          # Admin Vue 3 SPA
│   └── server/          # Core API + business logic
├── migrations/          # PostgreSQL migrations
├── package.json         # Monorepo workspace root
└── docker-compose.yml
```

### BFF Server Rules
- No direct database connection, all data flows through the internal server API
- Validates and sanitizes public input before forwarding
- Transforms internal API responses for public consumption (strips internal fields)
- Handles public SSO token exchange
- Rate limiting and abuse prevention at this layer
- May cache read-heavy responses to reduce internal API load

---

## Pattern 3: Enterprise / High Complexity (5+ Components)

**When to use:** Highly complex applications requiring integration with enterprise platforms and legacy systems.

```
┌─────────────────────────────────────────────────┐
│                   Internet                       │
└──────────────────────┬──────────────────────────┘
                       │
          ┌────────────▼────────────┐
          │  Public Client (Vue 3)  │
          └────────────┬────────────┘
                       │
          ┌────────────▼────────────┐
          │  Public Server (BFF)    │
          └────────────┬────────────┘
                       │
     ┌─────────────────┼─────────────────┐
     │     Private Network Zone          │
     │                                   │
     │  ┌──────────────▼──────────────┐  │
     │  │  Internal Client (Vue 3)    │  │
     │  └──────────────┬──────────────┘  │
     │                 │                 │
     │  ┌──────────────▼──────────────┐  │
     │  │  Internal Server            │  │
     │  └──┬───┬───┬───┬───┬─────────┘  │
     │     │   │   │   │   │             │
     │     │   │   │   │   └──► PostgreSQL
     │     │   │   │   │                 │
     │     │   │   │   └──► SharePoint   │
     │     │   │   │       (Documents)   │
     │     │   │   │                     │
     │     │   │   └──► External IdP    │
     │     │   │       (SSO)             │
     │     │   │                         │
     │     │   └──► ITSM Platform        │
     │     │       (Ticket Management)   │
     │     │                             │
     │     └──► ERP / Payments           │
     │         (Financial transactions)  │
     └──────────────────────────────────┘
```

### Base Components (5: same as Pattern 2)
1. **Public Client**: Vue 3 SPA
2. **Public Server (BFF)**: Gateway, no DB access
3. **Internal Client**: Admin Vue 3 SPA
4. **Internal Server**: Core API + business logic
5. **Database**: PostgreSQL

### Platform Integrations (as needed)

| Platform | Purpose | Integration Pattern |
|----------|---------|-------------------|
| **ERP / Payments** | Payments, ERP, financial transactions | REST API / SOAP adapter, async reconciliation |
| **ITSM (e.g. ServiceNow)** | Ticket management, ITSM, workflow automation | REST API, webhook callbacks |
| **External IdP** | SSO for end users, shared identity services | OAuth 2.0 / OIDC, SAML fallback |
| **SharePoint** | Official document repository for unstructured content | Microsoft Graph API |

### Additional Integration Types (ad-hoc)
- **Legacy systems**: SOAP/XML adapters, file-based integration (SFTP), database links
- **Message queues**: Azure Service Bus, RabbitMQ for async processing
- **External APIs**: Third-party services (geocoding, notification, payment gateways)

### Characteristics
- All Pattern 2 characteristics apply
- Service layer in internal server uses adapter pattern for each integration
- Circuit breaker and retry logic for all external calls
- Integration health checks exposed via `/health/ready`
- Async processing for long-running integration operations
- Audit logging for all cross-system data flows

### Repository Structure
```
app/
├── public/
│   ├── client/          # Public Vue 3 SPA
│   └── server/          # BFF gateway
├── internal/
│   ├── client/          # Admin Vue 3 SPA
│   └── server/          # Core API + integrations
│       └── src/
│           ├── integrations/
│           │   ├── erp/           # ERP / payments adapter
│           │   ├── itsm/          # ITSM (e.g. ServiceNow) adapter
│           │   ├── idp/           # External IdP adapter
│           │   └── sharepoint/    # SharePoint adapter
│           └── ...
├── migrations/
├── package.json
└── docker-compose.yml
```

---

## Pattern Selection Criteria

| Factor | Pattern 1 (Simple) | Pattern 2 (BFF) | Pattern 3 (Enterprise) |
|--------|-------------------|------------------|----------------------|
| **Public exposure** | Yes, low risk | Yes, medium risk | Yes, high risk |
| **Admin complexity** | Basic (role-guarded routes) | Dedicated admin UI | Dedicated admin UI |
| **Database isolation** | Server-only access | Private zone only | Private zone only |
| **SSO requirements** | Single SSO flow | Dual SSO flows | Dual SSO + external IdP federation |
| **External integrations** | None or minimal | Limited | ERP, ITSM, SharePoint, external IdP |
| **Data sensitivity** | Low,medium | Medium,high | High |
| **Team size** | 1,3 developers | 3,6 developers | 5+ developers |
| **Typical examples** | Info portals, dashboards | Citizen service apps | Permitting, licensing, case management |

---

## Document Storage Rule

**SharePoint is the official document repository** for all unstructured and uploaded content. Never store file content as BYTEA in PostgreSQL. Instead:

1. Upload files to SharePoint via Microsoft Graph
2. Store the SharePoint `driveItemId` and metadata in PostgreSQL
3. Retrieve files through Microsoft Graph when needed

This applies to: user uploads, generated reports, exported documents/attachments, and any file content that isn't structured relational data.

---

## SSO Configuration by Context

| Context | SSO Provider | Protocol |
|---------|-------------|----------|
| Public-facing (end users) | Google | OAuth 2.0 / OIDC |
| Public-facing (end users) | Microsoft | OAuth 2.0 / OIDC |
| Public-facing (end users) | Organizational / government IdP | OAuth 2.0 / OIDC / SAML |
| Internal (staff) | Entra ID (Azure AD) or equivalent | OAuth 2.0 / OIDC |

Pattern 1 apps may use a single SSO flow. Pattern 2 and 3 apps always separate public and internal SSO.

---

## Hosting

| Provider | When to Use |
|----------|------------|
| **Azure** (default) | Standard choice; best integration with Entra ID and SharePoint |
| **AWS** | When project has existing AWS infrastructure or specific AWS service requirements |
| **GCP** | When project has existing GCP infrastructure or specific GCP service requirements |

All patterns use containerized deployment (Docker) regardless of hosting provider. See `08-deployment` guide for container and orchestration details.
