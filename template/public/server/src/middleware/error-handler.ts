import { Request, Response, NextFunction } from 'express';
import { AppError } from '../utils/app-error';
import { sendError } from '../utils/response';
import logger from '../utils/logger';
import { env } from '../config/environment';

/**
 * PostgreSQL error code → { message, statusCode, code }.
 * Prevents information disclosure about database schema in production.
 */
const DB_ERROR_MAP: Record<string, { message: string; statusCode: number; code: string }> = {
  '23505': { message: 'A record with this information already exists', statusCode: 409, code: 'UNIQUE_VIOLATION' },
  '23503': { message: 'This operation references data that does not exist', statusCode: 400, code: 'FOREIGN_KEY_VIOLATION' },
  '23502': { message: 'Required information is missing', statusCode: 400, code: 'NOT_NULL_VIOLATION' },
  '23514': { message: 'The provided data does not meet validation requirements', statusCode: 422, code: 'CHECK_VIOLATION' },
  '08000': { message: 'Database connection failed. Please try again.', statusCode: 503, code: 'CONNECTION_ERROR' },
  '08003': { message: 'Database connection failed. Please try again.', statusCode: 503, code: 'CONNECTION_ERROR' },
  '08006': { message: 'Database connection failed. Please try again.', statusCode: 503, code: 'CONNECTION_ERROR' },
  '57P03': { message: 'The service is temporarily unavailable. Please try again.', statusCode: 503, code: 'DATABASE_UNAVAILABLE' },
};

/**
 * Sanitize an error for safe client consumption.
 * In production, strips stack traces, SQL details, and column names.
 */
function sanitizeError(err: Error & { code?: string }): AppError | Error {
  // Already an AppError — safe to send as-is
  if (err instanceof AppError) {
    return err;
  }

  // PostgreSQL errors — map to correct HTTP status codes
  if (err.code && DB_ERROR_MAP[err.code]) {
    const mapped = DB_ERROR_MAP[err.code];
    return new AppError(mapped.message, mapped.statusCode, mapped.code);
  }

  // Timeout / connection errors
  if (err.code === 'ETIMEDOUT') {
    return new AppError('The service is temporarily unavailable. Please try again.', 503, 'CONNECTION_TIMEOUT');
  }
  if (err.message?.includes('timeout')) {
    return new AppError('The request timed out. Please try again.', 503, 'TIMEOUT');
  }

  // In development, pass through the original error message
  if (env.NODE_ENV === 'development') {
    return new AppError(err.message, 500, 'INTERNAL_ERROR');
  }

  // In production, return generic message — never expose internals
  return new AppError('An unexpected error occurred', 500, 'INTERNAL_ERROR');
}

/**
 * Global error handler middleware.
 * Must have 4 parameters for Express to recognize it as an error handler.
 */
export function errorHandler(
  err: Error,
  req: Request,
  res: Response,
  _next: NextFunction
): void {
  const correlationId = req.headers['x-correlation-id'] || 'unknown';

  // Structured server-side logging (always log full details)
  logger.error(err.message, {
    correlationId,
    code: (err as any).code,
    path: req.path,
    method: req.method,
    ip: req.ip,
    userId: (req as any).user?.id,
    stack: !(err instanceof AppError) ? err.stack : undefined,
  });

  // Sanitize before sending to client
  const safeError = sanitizeError(err as Error & { code?: string });

  const statusCode = safeError instanceof AppError ? safeError.statusCode : 500;
  const code = safeError instanceof AppError ? safeError.code : 'INTERNAL_ERROR';
  const message = safeError instanceof AppError ? safeError.message : 'An unexpected error occurred';
  const details = safeError instanceof AppError ? safeError.details : [];

  // In production, drop url/method from the response envelope — they help
  // attackers map the surface and are already available via the X-Correlation-ID
  // header for legitimate debugging.
  const isProd = env.NODE_ENV === 'production';
  res.status(statusCode).json({
    success: false,
    error: {
      code,
      message,
      details: details.length > 0 ? details : undefined,
      url: isProd ? undefined : req.originalUrl,
      method: isProd ? undefined : req.method,
      timestamp: new Date().toISOString(),
    },
  });
}
