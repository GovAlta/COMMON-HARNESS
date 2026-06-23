import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Request, Response, NextFunction } from 'express';
import { authenticate } from '../../middleware/authenticate';
import { signAccessToken } from '../../utils/token';
import { COOKIE_NAMES } from '../../utils/cookie-config';
import jwt from 'jsonwebtoken';

describe('authenticate middleware', () => {
  let req: Partial<Request>;
  let res: Partial<Response>;
  let next: NextFunction;

  beforeEach(() => {
    req = {
      cookies: {},
    };
    res = {};
    next = vi.fn();
  });

  it('should call next with error when no token is present', () => {
    authenticate(req as Request, res as Response, next);

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: 401,
        message: 'Authentication required',
      })
    );
  });

  it('should attach user to request with valid token', () => {
    const token = signAccessToken({
      sub: 'user-123',
      email: 'test@example.com',
      role: 'user',
    });

    req.cookies = { [COOKIE_NAMES.ACCESS_TOKEN]: token };

    authenticate(req as Request, res as Response, next);

    expect(next).toHaveBeenCalledWith();
    expect(req.user).toBeDefined();
    expect(req.user!.id).toBe('user-123');
    expect(req.user!.email).toBe('test@example.com');
    expect(req.user!.role).toBe('user');
  });

  it('should return TOKEN_EXPIRED for expired tokens', () => {
    // Create an already-expired token using RS256 with the actual private key
    const fs = require('fs');
    const path = require('path');
    const keyPath = path.resolve(__dirname, '../../../keys/jwt-private.pem');
    const privateKey = fs.readFileSync(keyPath, 'utf-8');
    const token = jwt.sign(
      { sub: 'user-123', email: 'test@example.com', role: 'user' },
      privateKey,
      { algorithm: 'RS256', expiresIn: 0, issuer: 'app-template', audience: 'app-template-api' }
    );

    req.cookies = { [COOKIE_NAMES.ACCESS_TOKEN]: token };

    authenticate(req as Request, res as Response, next);

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: 401,
        code: 'TOKEN_EXPIRED',
      })
    );
  });

  it('should return 401 for malformed tokens', () => {
    req.cookies = { [COOKIE_NAMES.ACCESS_TOKEN]: 'not-a-valid-jwt' };

    authenticate(req as Request, res as Response, next);

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: 401,
        message: 'Invalid token',
      })
    );
  });

  it('should return 401 for tokens signed with wrong secret', () => {
    const token = jwt.sign(
      { sub: 'user-123', email: 'test@example.com', role: 'user' },
      'wrong-secret',
      { expiresIn: 900 }
    );

    req.cookies = { [COOKIE_NAMES.ACCESS_TOKEN]: token };

    authenticate(req as Request, res as Response, next);

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: 401,
        message: 'Invalid token',
      })
    );
  });
});
