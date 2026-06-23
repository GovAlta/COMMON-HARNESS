import { Request, Response, NextFunction, RequestHandler } from 'express';

/**
 * Wraps an async Express route handler to automatically catch
 * promise rejections and pass them to the Express error handler.
 */
export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<void | Response>
): RequestHandler {
  return (req: Request, res: Response, next: NextFunction): void => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}
