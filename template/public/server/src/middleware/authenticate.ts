import { Request, Response, NextFunction } from 'express';
import { verifyAccessToken } from '../utils/token';
import { COOKIE_NAMES } from '../utils/cookie-config';
import { AppError } from '../utils/app-error';
import type { JwtPayload } from '../types/auth';
import jwt from 'jsonwebtoken';

/**
 * Authentication middleware.
 * Extracts JWT from httpOnly cookie, verifies, and attaches user info to req.user.
 * Returns 401 with TOKEN_EXPIRED code on expired tokens (enables auto-refresh).
 * Returns 401 UNAUTHORIZED on missing or invalid tokens.
 */
export function authenticate(req: Request, _res: Response, next: NextFunction): void {
  const token = req.cookies?.[COOKIE_NAMES.ACCESS_TOKEN];

  if (!token) {
    next(AppError.unauthorized('Authentication required'));
    return;
  }

  try {
    const decoded: JwtPayload = verifyAccessToken(token);

    // Attach user info to request
    req.user = {
      id: decoded.sub,
      email: decoded.email,
      role: decoded.role,
      displayName: decoded.email, // Will be enriched by controller if needed
    };

    next();
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      // Specific code so the client knows to attempt a refresh
      next(new AppError('Token expired', 401, 'TOKEN_EXPIRED'));
      return;
    }

    next(AppError.unauthorized('Invalid token'));
  }
}
