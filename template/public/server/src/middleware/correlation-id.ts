import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';

/**
 * Middleware to generate and attach a correlation ID to each request.
 * If the request already has an X-Correlation-ID header, it is reused.
 * The correlation ID is also set on the response headers.
 */
export function correlationId(req: Request, res: Response, next: NextFunction): void {
  const id = (req.headers['x-correlation-id'] as string) || crypto.randomUUID();
  req.headers['x-correlation-id'] = id;
  res.setHeader('x-correlation-id', id);
  next();
}
