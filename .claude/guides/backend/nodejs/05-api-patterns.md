# Skill 05: API Endpoint Patterns

> Implement RESTful API endpoints with layered architecture, Zod validation, consistent response formats, and audit logging.

## Route File Structure

Each domain gets a route file in `server/src/routes/` that composes middleware chains onto an Express router:

```typescript
import { Router } from 'express';
import { asyncHandler } from '../utils/async-handler';
import { authenticate } from '../middleware/authenticate';
import { authorize } from '../middleware/authorize';
import { csrf } from '../middleware/csrf';
import { validate } from '../middleware/validate';
import { apiRateLimiter } from '../middleware/rate-limit';
import { createSchema, listQuerySchema, idSchema } from '../validators/domain.validator';
import * as controller from '../controllers/domain.controller';

const router = Router();

// Public reads: no auth required
router.get('/', validate({ query: listQuerySchema }), asyncHandler(controller.list));
router.get('/:id', validate({ params: idSchema }), asyncHandler(controller.getById));

// Authenticated writes: user must be logged in
router.post('/', authenticate, csrf, validate({ body: createSchema }), asyncHandler(controller.create));
router.put('/:id', authenticate, csrf, validate({ params: idSchema, body: createSchema }), asyncHandler(controller.update));
router.delete('/:id', authenticate, csrf, validate({ params: idSchema }), asyncHandler(controller.remove));

export default router;
```

Register in `server/src/app.ts`:

```typescript
import domainRoutes from './routes/domain.routes';
app.use('/api/domains', domainRoutes);
```

## Middleware Composition Patterns

### Public Read Endpoints
```
validate(query/params) -> asyncHandler(controller)
```

### Authenticated Read Endpoints
```
authenticate -> validate(query/params) -> asyncHandler(controller)
```

### Authenticated Write Endpoints
```
authenticate -> csrf -> validate(body) -> asyncHandler(controller)
```

### Admin-Only Endpoints
```
authenticate -> authorize('admin') -> csrf -> validate(body) -> asyncHandler(controller)
```

### Rate-Limited Endpoints (AI, Auth)
```
authenticate -> csrf -> rateLimiter -> validate(body) -> asyncHandler(controller)
```

### File Upload Endpoints
```
authenticate -> csrf -> multer.single('file') -> asyncHandler(controller)
```

## Thin Controller Pattern

Controllers extract input, delegate to services, and format responses. They contain no business logic:

```typescript
import { Request, Response } from 'express';
import * as service from '../services/domain.service';
import { sendSuccess, sendPaginated } from '../utils/response';

export async function list(req: Request, res: Response): Promise<void> {
  const { page, limit, search, category, sort, order } = req.query;
  const result = await service.list({
    page: Number(page),
    limit: Number(limit),
    search: search as string,
    category: category as string,
    sort: sort as string,
    order: order as string,
  });
  sendPaginated(res, result.data, result.pagination);
}

export async function getById(req: Request, res: Response): Promise<void> {
  const result = await service.getById(req.params.id);
  sendSuccess(res, result);
}

export async function create(req: Request, res: Response): Promise<void> {
  const userId = req.user!.id;
  const result = await service.create(req.body, userId, req.ip || null);
  sendSuccess(res, result, 201);
}

export async function update(req: Request, res: Response): Promise<void> {
  const userId = req.user!.id;
  const result = await service.update(req.params.id, req.body, userId, req.ip || null);
  sendSuccess(res, result);
}

export async function remove(req: Request, res: Response): Promise<void> {
  const userId = req.user!.id;
  await service.remove(req.params.id, userId, req.ip || null);
  sendSuccess(res, null, 204);
}
```

## Zod Schema Validation

### Validator File (`validators/domain.validator.ts`)

```typescript
import { z } from 'zod';

// UUID parameter validation
export const idSchema = z.object({
  id: z.string().uuid('Invalid ID format'),
});

// Pagination + filtering query
export const listQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().trim().max(200).optional(),
  category: z.string().trim().optional(),
  sort: z.enum(['title', 'created_at', 'updated_at']).optional().default('updated_at'),
  order: z.enum(['asc', 'desc']).optional().default('desc'),
});

// Create/update body
export const createSchema = z.object({
  title: z.string().trim().min(1, 'Title is required').max(200),
  category: z.enum(['guide', 'announcement', 'policy', 'reference', 'bulletin']),
  content: z.string().trim().min(1, 'Content is required'),
  tags: z.array(z.string().trim()).optional().default([]),
});
```

### Validate Middleware (`middleware/validate.ts`)

Catches `ZodError` and returns a structured 422 response:

```typescript
import { Request, Response, NextFunction } from 'express';
import { ZodSchema, ZodError } from 'zod';
import { AppError } from '../utils/errors';

export function validate(schema: {
  body?: ZodSchema;
  query?: ZodSchema;
  params?: ZodSchema;
}) {
  return (req: Request, _res: Response, next: NextFunction) => {
    try {
      if (schema.body) req.body = schema.body.parse(req.body);
      if (schema.query) req.query = schema.query.parse(req.query);
      if (schema.params) req.params = schema.params.parse(req.params);
      next();
    } catch (error) {
      if (error instanceof ZodError) {
        next(
          AppError.validation(
            error.errors.map((e) => ({
              field: e.path.join('.'),
              message: e.message,
            }))
          )
        );
      } else {
        next(error);
      }
    }
  };
}
```

### AppError Validation Helper

```typescript
export class AppError extends Error {
  constructor(
    message: string,
    public statusCode: number = 500,
    public code?: string,
    public details?: { field: string; message: string }[]
  ) {
    super(message);
    this.name = 'AppError';
  }

  static validation(details: { field: string; message: string }[]): AppError {
    return new AppError('Validation failed', 422, 'VALIDATION_ERROR', details);
  }

  static notFound(message = 'Resource not found'): AppError {
    return new AppError(message, 404, 'NOT_FOUND');
  }

  static badRequest(message: string): AppError {
    return new AppError(message, 400, 'BAD_REQUEST');
  }

  static forbidden(message = 'Access denied'): AppError {
    return new AppError(message, 403, 'FORBIDDEN');
  }
}
```

## Response Formats

### Response Helpers (`utils/response.ts`)

```typescript
import { Response } from 'express';

interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export function sendSuccess(res: Response, data: unknown, statusCode = 200): void {
  res.status(statusCode).json({ success: true, data });
}

export function sendPaginated(res: Response, data: unknown[], pagination: PaginationMeta): void {
  res.json({ success: true, data, pagination });
}

export function sendError(res: Response, code: string, message: string, statusCode: number, details?: unknown): void {
  res.status(statusCode).json({
    success: false,
    error: { code, message, ...(details ? { details } : {}) },
  });
}
```

### Success Response
```json
{ "success": true, "data": { "id": "uuid", "title": "Example" } }
```

### Paginated Response
```json
{
  "success": true,
  "data": [{ "id": "uuid", "title": "Example" }],
  "pagination": { "page": 1, "limit": 20, "total": 45, "totalPages": 3 }
}
```

### Error Response
```json
{ "success": false, "error": { "code": "NOT_FOUND", "message": "Resource not found" } }
```

### Validation Error Response (422)
```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Validation failed",
    "details": [
      { "field": "title", "message": "Title is required" },
      { "field": "category", "message": "Invalid enum value" }
    ]
  }
}
```

## Pagination Logic (Model Layer)

Build dynamic queries with parameterized SQL, offset/limit pagination, and a total count:

```typescript
import pool from '../config/database';

interface ListOptions {
  page?: number;
  limit?: number;
  search?: string;
  category?: string;
  sort?: string;
  order?: string;
}

const ALLOWED_SORT_COLUMNS: Record<string, string> = {
  title: 'item_title',
  created_at: 'created_at',
  updated_at: 'updated_at',
};

export async function list(options: ListOptions): Promise<{ data: any[]; total: number }> {
  const { page = 1, limit = 20, search, category, sort = 'updated_at', order = 'desc' } = options;
  const offset = (page - 1) * limit;

  const conditions: string[] = ['is_deleted = false'];
  const params: unknown[] = [];
  let paramIndex = 1;

  if (search) {
    conditions.push(`item_title ILIKE $${paramIndex++}`);
    params.push(`%${search}%`);
  }
  if (category) {
    conditions.push(`item_category = $${paramIndex++}`);
    params.push(category);
  }

  const sortColumn = ALLOWED_SORT_COLUMNS[sort] || 'updated_at';
  const sortOrder = order === 'asc' ? 'ASC' : 'DESC';
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  // Count query
  const countResult = await pool.query(`SELECT COUNT(*) FROM items ${where}`, params);
  const total = parseInt(countResult.rows[0].count, 10);

  // Data query
  params.push(limit, offset);
  const result = await pool.query(
    `SELECT * FROM items ${where} ORDER BY ${sortColumn} ${sortOrder} LIMIT $${paramIndex++} OFFSET $${paramIndex}`,
    params
  );

  return { data: result.rows, total };
}
```

The service layer computes pagination metadata:

```typescript
export async function list(options: ListOptions) {
  const { page = 1, limit = 20 } = options;
  const { data, total } = await model.list(options);

  return {
    data,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  };
}
```

## Audit Logging on Mutations

Every create/update/delete logs to an `audit_log` table:

```typescript
import { logAuditEvent } from '../utils/audit';

// Inside a service method after a successful mutation:
await logAuditEvent({
  action: 'INSERT',       // INSERT | UPDATE | DELETE
  tableName: 'items',
  recordId: result.id,
  userId,
  ipAddress: req.ip || null,
  userAgent: req.headers['user-agent'] || null,
  newData: { title: data.title, category: data.category },
});
```

The audit utility:

```typescript
import pool from '../config/database';

interface AuditEvent {
  action: 'INSERT' | 'UPDATE' | 'DELETE';
  tableName: string;
  recordId: string;
  userId: string;
  ipAddress: string | null;
  userAgent: string | null;
  oldData?: Record<string, unknown>;
  newData?: Record<string, unknown>;
}

export async function logAuditEvent(event: AuditEvent): Promise<void> {
  await pool.query(
    `INSERT INTO audit_log (action, table_name, record_id, user_id, ip_address, user_agent, old_data, new_data)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [
      event.action,
      event.tableName,
      event.recordId,
      event.userId,
      event.ipAddress,
      event.userAgent,
      event.oldData ? JSON.stringify(event.oldData) : null,
      event.newData ? JSON.stringify(event.newData) : null,
    ]
  );
}
```

## OpenAPI Specification

The architecture standard requires all REST APIs to be documented with an OpenAPI Specification (OAS 3.0+). For Node.js backends, use a **handwritten `openapi.yaml`** file; this is simpler and more reliable than code-generated specs.

### Creating the spec

Create `server/openapi.yaml` at the server root:

```yaml
openapi: 3.0.3
info:
  title: My Application API
  version: 1.0.0
  description: RESTful API for the application.
servers:
  - url: /api/v1
    description: API v1
paths:
  /health:
    get:
      summary: Health check
      operationId: healthCheck
      responses:
        '200':
          description: Service is healthy
          content:
            application/json:
              schema:
                type: object
                properties:
                  success: { type: boolean }
                  data:
                    type: object
                    properties:
                      status: { type: string, example: ok }
  /resources:
    get:
      summary: List resources
      operationId: listResources
      parameters:
        - name: page
          in: query
          schema: { type: integer, default: 1 }
        - name: limit
          in: query
          schema: { type: integer, default: 20 }
      responses:
        '200':
          description: Paginated list
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/PaginatedResponse'
components:
  schemas:
    PaginatedResponse:
      type: object
      properties:
        success: { type: boolean }
        data: { type: array, items: {} }
        meta:
          type: object
          properties:
            page: { type: integer }
            limit: { type: integer }
            total: { type: integer }
            totalPages: { type: integer }
  securitySchemes:
    bearerAuth:
      type: http
      scheme: bearer
      bearerFormat: JWT
```

### Serving the spec

Mount the spec as a static endpoint in `app.ts`:

```typescript
import fs from 'fs';
import path from 'path';

// Serve OpenAPI spec
const openapiPath = path.resolve(__dirname, '..', 'openapi.yaml');
if (fs.existsSync(openapiPath)) {
  app.get('/api/v1/docs', (_req, res) => {
    res.type('text/yaml').send(fs.readFileSync(openapiPath, 'utf-8'));
  });
}
```

### Keeping the spec in sync

- **Update the spec when you add or change an endpoint.** The spec is a contract; if the code and spec disagree, fix the spec.
- **Match Zod validators to OpenAPI schemas.** If your Zod body schema requires `{ name: z.string().min(1), priority: z.enum(['high', 'medium', 'low']) }`, the OpenAPI schema should declare the same constraints.
- **Include error responses.** Document 400 (validation), 401 (unauthorized), 403 (forbidden), 404 (not found), and 429 (rate limited) responses.

## Checklist: Adding a New API Domain

When adding a completely new resource domain (e.g., "projects", "comments"), follow this order:

### Server

1. **Migration**: Create a migration file in `server/migrations/` with `CREATE TABLE`, indexes, and `audit_log` trigger if needed
2. **Types**: Define TypeScript interfaces in `server/src/types/domain.types.ts`
3. **Model**: Create `server/src/models/domain.model.ts` with parameterized SQL for CRUD + list with pagination
4. **Validator**: Create `server/src/validators/domain.validator.ts` with Zod schemas for body/query/params
5. **Service**: Create `server/src/services/domain.service.ts` with business logic, audit logging, and pagination metadata
6. **Controller**: Create `server/src/controllers/domain.controller.ts` with thin handlers that extract/delegate/respond
7. **Routes**: Create `server/src/routes/domain.routes.ts` with middleware chains
8. **Register**: Mount the routes in `server/src/app.ts`
9. **Tests**: Write tests for controller/model/service/middleware

### Client

10. **Types**: Create client-side TypeScript interfaces in `client/src/types/`
11. **API composable**: Create data-fetching logic in `client/src/composables/`
12. **Components**: Create UI components in `client/src/components/domain/`
13. **Page**: Create the page view in `client/src/pages/`
14. **Route**: Register the route in `client/src/router/index.ts`
