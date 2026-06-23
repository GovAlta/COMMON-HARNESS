import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { COOKIE_NAMES } from '../utils/cookie-config';
import { AppError } from '../utils/app-error';

/**
 * CSRF protection middleware using double-submit cookie pattern.
 *
 * Validates that the `x-csrf-token` header matches the value of the CSRF cookie.
 * The CSRF cookie is httpOnly (not readable by JavaScript). The client receives
 * the token value from the GET /api/auth/csrf-token JSON response body and stores it
 * in memory only. The client sends the in-memory token in the x-csrf-token header,
 * and this middleware compares it to the httpOnly cookie value.
 *
 * Applied to all state-changing requests (POST, PUT, PATCH, DELETE).
 */
export function csrf(req: Request, _res: Response, next: NextFunction): void {
  // Only validate on state-changing methods
  const method = req.method.toUpperCase();
  if (['GET', 'HEAD', 'OPTIONS'].includes(method)) {
    next();
    return;
  }

  const headerToken = req.headers['x-csrf-token'] as string | undefined;
  const cookieToken = req.cookies?.[COOKIE_NAMES.CSRF_TOKEN] as string | undefined;

  if (!headerToken || !cookieToken) {
    next(new AppError('CSRF token missing', 403, 'CSRF_MISSING'));
    return;
  }

  // Constant-time comparison to prevent timing side-channel attacks
  const headerBuf = Buffer.from(headerToken);
  const cookieBuf = Buffer.from(cookieToken);
  if (headerBuf.length !== cookieBuf.length || !crypto.timingSafeEqual(headerBuf, cookieBuf)) {
    next(new AppError('CSRF token mismatch', 403, 'CSRF_MISMATCH'));
    return;
  }

  next();
}

/**
 * Endpoints that LEGITIMATELY skip CSRF protection. Each entry MUST have a
 * documented reason. Adding a new entry is a security-relevant change and
 * should be reviewed in PR. The path regex is matched against the URL
 * suffix AFTER the /api/v1 (or /api) mount prefix is stripped — i.e. it
 * starts at the next slash.
 *
 * GET / HEAD / OPTIONS are always skipped (no state change) and are NOT
 * listed here; only state-changing methods (POST/PUT/PATCH/DELETE) on these
 * paths fall through to alternate protections.
 */
// csrfOrSkip is mounted at BOTH /api/v1 and /api in app.ts (versioned canonical
// + legacy alias). Express runs both middlewares on every request, so the
// allow-list must match against either form of req.path:
//   - Request to /api/v1/auth/refresh: mount-stripped path is /auth/refresh (v1 mount) AND /v1/auth/refresh (api mount).
// If either form fails the allow-list, the request is rejected. We accept the
// optional /v1 prefix so both mount paths skip CSRF for these exempt endpoints.
export const CSRF_EXEMPT_PATHS: ReadonlyArray<{ pattern: RegExp; reason: string }> = [
  { pattern: /^(\/v1)?\/auth\/google\/?$/,               reason: 'OAuth init — no authenticated session yet; state cookie protects forgery' },
  { pattern: /^(\/v1)?\/auth\/google\/callback\/?$/,     reason: 'OAuth callback — protected by `state` + `nonce` parameter verification' },
  { pattern: /^(\/v1)?\/auth\/microsoft\/?$/,            reason: 'OAuth init — no authenticated session yet; state cookie protects forgery' },
  { pattern: /^(\/v1)?\/auth\/microsoft\/callback\/?$/,  reason: 'OAuth callback — protected by `state` + `nonce` + `tid` claim verification' },
  { pattern: /^(\/v1)?\/auth\/refresh\/?$/,              reason: 'Refresh-token rotation — only the httpOnly refresh cookie is consumed; SameSite=Lax + rotation defends against CSRF' },
];

/**
 * Global CSRF wrapper. Switches the project default from "opt-in per route"
 * to "opt-out via explicit allow-list". Mount this once at the /api prefix
 * in app.ts BEFORE the routers; it short-circuits for the documented
 * exemptions and otherwise delegates to the standard `csrf` validator.
 *
 * This closes the Node ASVS finding "CSRF middleware not globally mounted":
 * any newly added route that forgets to opt-in to csrf is now safe by default.
 */
export function csrfOrSkip(req: Request, res: Response, next: NextFunction): void {
  const method = req.method.toUpperCase();
  if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') {
    next();
    return;
  }
  // req.path here is the path AFTER the mount prefix, so it starts with '/'
  for (const { pattern } of CSRF_EXEMPT_PATHS) {
    if (pattern.test(req.path)) {
      next();
      return;
    }
  }
  csrf(req, res, next);
}
