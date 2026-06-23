import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Request, Response, NextFunction } from 'express';
import { csrf, csrfOrSkip, CSRF_EXEMPT_PATHS } from '../../middleware/csrf';
import { COOKIE_NAMES } from '../../utils/cookie-config';

describe('csrf middleware', () => {
  let req: Partial<Request>;
  let res: Partial<Response>;
  let next: NextFunction;

  beforeEach(() => {
    req = {
      method: 'POST',
      headers: {},
      cookies: {},
    };
    res = {};
    next = vi.fn();
  });

  it('should skip validation for GET requests', () => {
    req.method = 'GET';
    csrf(req as Request, res as Response, next);

    expect(next).toHaveBeenCalledWith();
  });

  it('should skip validation for HEAD requests', () => {
    req.method = 'HEAD';
    csrf(req as Request, res as Response, next);

    expect(next).toHaveBeenCalledWith();
  });

  it('should skip validation for OPTIONS requests', () => {
    req.method = 'OPTIONS';
    csrf(req as Request, res as Response, next);

    expect(next).toHaveBeenCalledWith();
  });

  it('should return 403 when CSRF header is missing', () => {
    req.method = 'POST';
    req.cookies = { [COOKIE_NAMES.CSRF_TOKEN]: 'valid-token' };
    req.headers = {}; // no x-csrf-token header

    csrf(req as Request, res as Response, next);

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: 403,
        code: 'CSRF_MISSING',
      })
    );
  });

  it('should return 403 when CSRF cookie is missing', () => {
    req.method = 'POST';
    req.headers = { 'x-csrf-token': 'some-token' };
    req.cookies = {}; // no csrf cookie

    csrf(req as Request, res as Response, next);

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: 403,
        code: 'CSRF_MISSING',
      })
    );
  });

  it('should return 403 when tokens do not match', () => {
    req.method = 'POST';
    req.headers = { 'x-csrf-token': 'header-token' };
    req.cookies = { [COOKIE_NAMES.CSRF_TOKEN]: 'different-cookie-token' };

    csrf(req as Request, res as Response, next);

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: 403,
        code: 'CSRF_MISMATCH',
      })
    );
  });

  it('should pass when header and cookie tokens match', () => {
    const token = 'matching-csrf-token';
    req.method = 'POST';
    req.headers = { 'x-csrf-token': token };
    req.cookies = { [COOKIE_NAMES.CSRF_TOKEN]: token };

    csrf(req as Request, res as Response, next);

    expect(next).toHaveBeenCalledWith();
  });

  it('should validate CSRF on DELETE requests', () => {
    const token = 'valid-token';
    req.method = 'DELETE';
    req.headers = { 'x-csrf-token': token };
    req.cookies = { [COOKIE_NAMES.CSRF_TOKEN]: token };

    csrf(req as Request, res as Response, next);

    expect(next).toHaveBeenCalledWith();
  });

  it('should validate CSRF on PUT requests', () => {
    req.method = 'PUT';
    req.headers = {};
    req.cookies = {};

    csrf(req as Request, res as Response, next);

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: 403,
        code: 'CSRF_MISSING',
      })
    );
  });
});

describe('csrfOrSkip dual-mount allow-list', () => {
  // Regression: csrfOrSkip is mounted at BOTH /api/v1 and /api in app.ts, so
  // for a POST /api/v1/auth/refresh request Express runs the middleware twice
  // with req.path = '/auth/refresh' (v1 mount) AND req.path = '/v1/auth/refresh'
  // (api mount). If the allow-list doesn't match BOTH shapes, the second
  // invocation falsely rejects with CSRF_MISSING and refresh-token rotation
  // breaks. See blueteam finding BT-CSRF-DUAL-MOUNT-001.
  const csrfExemptPathsThatMustWorkOnBothMounts = [
    '/auth/google',
    '/auth/google/callback',
    '/auth/microsoft',
    '/auth/microsoft/callback',
    '/auth/refresh',
  ];

  for (const p of csrfExemptPathsThatMustWorkOnBothMounts) {
    it(`should skip CSRF for v1-mount path ${p}`, () => {
      const req: Partial<Request> = { method: 'POST', path: p, headers: {}, cookies: {} };
      const next = vi.fn();
      csrfOrSkip(req as Request, {} as Response, next);
      expect(next).toHaveBeenCalledWith();
    });

    it(`should skip CSRF for api-mount path /v1${p}`, () => {
      const req: Partial<Request> = { method: 'POST', path: `/v1${p}`, headers: {}, cookies: {} };
      const next = vi.fn();
      csrfOrSkip(req as Request, {} as Response, next);
      expect(next).toHaveBeenCalledWith();
    });
  }

  it('should still enforce CSRF on non-exempt paths even with /v1 prefix', () => {
    const req: Partial<Request> = { method: 'POST', path: '/v1/admin/notifications/broadcast', headers: {}, cookies: {} };
    const next = vi.fn();
    csrfOrSkip(req as Request, {} as Response, next);
    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 403, code: 'CSRF_MISSING' })
    );
  });

  it('exempt-path table contains all 5 documented entries', () => {
    expect(CSRF_EXEMPT_PATHS.length).toBe(5);
  });
});
