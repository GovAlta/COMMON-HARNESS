import { Request, Response, NextFunction } from 'express';
import { ZodSchema, ZodError } from 'zod';
import { AppError } from '../utils/app-error';
import { env } from '../config/environment';
import logger from '../utils/logger';

/**
 * Paths that get verbose validation-failure diagnostics in non-production.
 * Add a path fragment here when investigating a reproducible 422 in the wild.
 *
 * Strings here are tested via String.includes() against `req.originalUrl`, so
 * a fragment like `/broadcast` matches `/api/v1/admin/notifications/broadcast`.
 */
const VERBOSE_VALIDATE_PATHS = ['/broadcast'];

function shouldLogVerbose(req: Request): boolean {
  if (env.NODE_ENV === 'production') return false;
  const url = req.originalUrl || req.url || '';
  return VERBOSE_VALIDATE_PATHS.some((fragment) => url.includes(fragment));
}

/**
 * Redact sensitive-looking values so we never log secrets even in dev. The
 * broadcast body is short text, but the diagnostic helper is reused so we
 * keep the same hygiene as auth/audit logs.
 */
function redactBody(body: unknown): unknown {
  if (!body || typeof body !== 'object') return body;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(body as Record<string, unknown>)) {
    const lower = k.toLowerCase();
    if (
      lower.includes('password') ||
      lower.includes('token') ||
      lower.includes('secret') ||
      lower.includes('authorization')
    ) {
      out[k] = '[REDACTED]';
    } else if (typeof v === 'string' && v.length > 500) {
      // Trim long fields for readability — caller knows the schema cap.
      out[k] = `${v.slice(0, 500)}…[+${v.length - 500} chars]`;
    } else {
      out[k] = v;
    }
  }
  return out;
}

/**
 * Zod schema validation middleware factory.
 *
 * Validates request body, query, and/or params against provided Zod schemas.
 * Returns 422 VALIDATION_ERROR with field-level details on failure.
 *
 * In non-production environments, validation failures on flagged paths
 * (currently `/broadcast`) emit a structured `validation_failure` log entry
 * with the (redacted) request body, the field errors, and the Zod path.
 * Production never logs the body, only the field error list — keeping the
 * diagnostic surface intentionally tight.
 *
 * @param schema - Object with optional body, query, and params Zod schemas
 */
export function validate(schema: {
  body?: ZodSchema;
  query?: ZodSchema;
  params?: ZodSchema;
}) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    try {
      if (schema.body) {
        req.body = schema.body.parse(req.body);
      }
      if (schema.query) {
        req.query = schema.query.parse(req.query) as typeof req.query;
      }
      if (schema.params) {
        req.params = schema.params.parse(req.params);
      }
      next();
    } catch (error) {
      if (error instanceof ZodError) {
        const details = error.errors.map((e) => ({
          field: e.path.join('.'),
          message: e.message,
        }));
        if (shouldLogVerbose(req)) {
          logger.warn('validation_failure', {
            path: req.originalUrl,
            method: req.method,
            details,
            body: redactBody(req.body),
            bodyKeys: req.body && typeof req.body === 'object'
              ? Object.keys(req.body as Record<string, unknown>)
              : [],
          });
        }
        next(AppError.validation(details));
        return;
      }
      next(error);
    }
  };
}
