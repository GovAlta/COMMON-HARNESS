import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Request, Response, NextFunction } from 'express';
import { authorize } from '../../middleware/authorize';

describe('authorize middleware', () => {
  let req: Partial<Request>;
  let res: Partial<Response>;
  let next: NextFunction;

  beforeEach(() => {
    req = {};
    res = {};
    next = vi.fn();
  });

  it('should call next with 401 when no user is present', () => {
    const middleware = authorize('user', 'admin');
    middleware(req as Request, res as Response, next);

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: 401,
        message: 'Authentication required',
      })
    );
  });

  it('should allow user with matching role', () => {
    req.user = { id: 'user-123', email: 'test@example.com', role: 'user', displayName: 'Test' };
    const middleware = authorize('user', 'admin');
    middleware(req as Request, res as Response, next);

    expect(next).toHaveBeenCalledWith();
  });

  it('should allow admin with matching role', () => {
    req.user = { id: 'admin-1', email: 'admin@example.com', role: 'admin', displayName: 'Admin' };
    const middleware = authorize('admin');
    middleware(req as Request, res as Response, next);

    expect(next).toHaveBeenCalledWith();
  });

  it('should return 403 for user when only admin is allowed', () => {
    req.user = { id: 'user-123', email: 'test@example.com', role: 'user', displayName: 'Test' };
    const middleware = authorize('admin');
    middleware(req as Request, res as Response, next);

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: 403,
        message: 'Insufficient permissions',
      })
    );
  });

  it('should allow any role when multiple roles specified', () => {
    req.user = { id: 'user-123', email: 'test@example.com', role: 'user', displayName: 'Test' };
    const middleware = authorize('user', 'admin');
    middleware(req as Request, res as Response, next);

    expect(next).toHaveBeenCalledWith();
  });
});
