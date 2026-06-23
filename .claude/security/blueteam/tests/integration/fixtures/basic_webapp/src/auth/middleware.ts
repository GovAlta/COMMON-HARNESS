import jwt from 'jsonwebtoken';
import { JWT_SECRET } from '../config';
import { Request, Response, NextFunction } from 'express';

declare global {
  namespace Express {
    interface Request {
      user?: any;
      legacyUser?: any;
    }
  }
}

// P-V4-01: JWT signature verification — uses jwt.verify which validates both the
// signature and any embedded claims (exp, iat). Tokens with invalid signatures
// or expired timestamps are rejected with 401.
export function authenticateToken(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  const token = authHeader?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Authentication required' });
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

// P-V4-01: Admin role enforcement — checks req.user.role === 'admin' after
// authenticateToken has already validated the token signature. Role claim is
// therefore trustworthy (not client-supplied without signature).
export function requireAdmin(req: Request, res: Response, next: NextFunction) {
  if (!req.user || req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
}

// F-V3-01: Legacy endpoint — uses jwt.decode instead of jwt.verify.
// jwt.decode performs NO signature verification and NO expiry checking.
// An attacker can craft an arbitrary payload, base64-encode it, and this
// middleware will accept it as a valid "user". Allows complete auth bypass
// on any route using this middleware.
export function authenticateLegacyToken(req: Request, res: Response, next: NextFunction) {
  const token = req.headers['x-legacy-token'] as string;
  if (!token) return next();
  try {
    // jwt.decode does NOT verify signature — vulnerable to token forgery
    req.legacyUser = jwt.decode(token);
  } catch { /* ignore */ }
  next();
}
