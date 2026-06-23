# Skill 03: Authentication

> Implement SSO authentication with Google OAuth 2.0 and Microsoft OIDC, JWT tokens in httpOnly cookies, refresh token rotation, and CSRF double-submit protection.

## Architecture Overview

- **No passwords**: SSO-only authentication via Google and Microsoft
- **Access tokens**: Short-lived JWTs (15 min) in httpOnly cookies
- **Refresh tokens**: Long-lived (7 days), hashed with SHA-256, stored in database, rotated on every use
- **CSRF protection**: Double-submit pattern with timing-safe comparison
- **OAuth state parameter**: Prevents CSRF on the OAuth flow itself

## Google OAuth 2.0 with Passport

### Strategy Configuration: `config/auth.ts`

```typescript
import passport from 'passport';
import { Strategy as GoogleStrategy } from 'passport-google-oauth20';
import { env } from './environment';

export interface SSOProfile {
  provider: 'google' | 'microsoft';
  providerId: string;
  email: string;
  displayName: string;
  avatarUrl?: string;
}

export function configurePassport(): void {
  passport.use(new GoogleStrategy({
    clientID: env.GOOGLE_CLIENT_ID,
    clientSecret: env.GOOGLE_CLIENT_SECRET,
    callbackURL: `${env.API_BASE_URL}/api/auth/google/callback`,
    scope: ['openid', 'profile', 'email'],
  }, (_accessToken, _refreshToken, profile, done) => {
    const ssoProfile: SSOProfile = {
      provider: 'google',
      providerId: profile.id,
      email: profile.emails?.[0]?.value || '',
      displayName: profile.displayName || '',
      avatarUrl: profile.photos?.[0]?.value,
    };
    done(null, ssoProfile);
  }));
}
```

### Login Initiation: `controllers/auth.controller.ts`

Generate a random OAuth state parameter and store it in an httpOnly cookie. This prevents CSRF attacks on the OAuth redirect.

```typescript
import crypto from 'crypto';
import passport from 'passport';
import { Request, Response, NextFunction } from 'express';
import { env } from '../config/environment';
import { COOKIE_NAMES, oauthStateCookieOptions, accessTokenCookieOptions, refreshTokenCookieOptions } from '../utils/cookie-config';
import * as authService from '../services/auth.service';

// Derive frontend URL from CORS_ORIGIN (first origin in comma-separated list)
const FRONTEND_URL = (env.CORS_ORIGIN || 'http://localhost:5173').split(',')[0].trim();

export const googleLogin = (req: Request, res: Response, next: NextFunction): void => {
  const state = crypto.randomBytes(32).toString('hex');
  res.cookie(COOKIE_NAMES.OAUTH_STATE, state, oauthStateCookieOptions);
  passport.authenticate('google', { session: false, state })(req, res, next);
};
```

### Callback Handler with State Verification

```typescript
export const googleCallback = (req: Request, res: Response, next: NextFunction): void => {
  // Verify OAuth state parameter to prevent CSRF
  const stateCookie = req.cookies?.[COOKIE_NAMES.OAUTH_STATE];
  const stateParam = req.query.state as string;
  res.clearCookie(COOKIE_NAMES.OAUTH_STATE, { path: '/' });

  if (!stateCookie || !stateParam || stateCookie !== stateParam) {
    res.redirect(`${FRONTEND_URL}/login?error=auth_failed`);
    return;
  }

  passport.authenticate('google', { session: false }, async (err: any, profile: SSOProfile) => {
    if (err || !profile) {
      res.redirect(`${FRONTEND_URL}/login?error=auth_failed`);
      return;
    }

    try {
      const user = await authService.findOrCreateUser(profile);
      const tokens = await authService.createTokens(user);

      res.cookie(COOKIE_NAMES.ACCESS_TOKEN, tokens.accessToken, accessTokenCookieOptions);
      res.cookie(COOKIE_NAMES.REFRESH_TOKEN, tokens.refreshToken, refreshTokenCookieOptions);

      res.redirect(`${FRONTEND_URL}/auth/callback?success=true`);
    } catch (error) {
      res.redirect(`${FRONTEND_URL}/login?error=auth_failed`);
    }
  })(req, res, next);
};
```

## Microsoft OIDC Flow

Uses `openid-client` for async OIDC discovery instead of Passport. This supports dynamic discovery of Microsoft's endpoints.

```typescript
import { env } from '../config/environment';
import { COOKIE_NAMES, oauthStateCookieOptions, accessTokenCookieOptions, refreshTokenCookieOptions } from '../utils/cookie-config';
import * as authService from '../services/auth.service';

// Derive frontend URL from CORS_ORIGIN (first origin in comma-separated list)
const FRONTEND_URL = (env.CORS_ORIGIN || 'http://localhost:5173').split(',')[0].trim();

export const microsoftLogin = async (req: Request, res: Response): Promise<void> => {
  try {
    const { Issuer } = await import('openid-client');
    const issuer = await Issuer.discover(
      `https://login.microsoftonline.com/${env.MICROSOFT_TENANT_ID}/v2.0`
    );
    const client = new issuer.Client({
      client_id: env.MICROSOFT_CLIENT_ID,
      client_secret: env.MICROSOFT_CLIENT_SECRET,
      redirect_uris: [`${env.API_BASE_URL}/api/auth/microsoft/callback`],
      response_types: ['code'],
    });

    const state = crypto.randomBytes(32).toString('hex');
    res.cookie(COOKIE_NAMES.OAUTH_STATE, state, oauthStateCookieOptions);

    const authUrl = client.authorizationUrl({
      scope: 'openid profile email',
      state,
    });
    res.redirect(authUrl);
  } catch (error) {
    res.redirect(`${FRONTEND_URL}/login?error=auth_failed`);
  }
};

export const microsoftCallback = async (req: Request, res: Response): Promise<void> => {
  try {
    // Verify OAuth state
    const stateCookie = req.cookies?.[COOKIE_NAMES.OAUTH_STATE];
    const stateParam = req.query.state as string;
    res.clearCookie(COOKIE_NAMES.OAUTH_STATE, { path: '/' });

    if (!stateCookie || !stateParam || stateCookie !== stateParam) {
      res.redirect(`${FRONTEND_URL}/login?error=auth_failed`);
      return;
    }

    const { Issuer } = await import('openid-client');
    const redirectUri = `${env.API_BASE_URL}/api/auth/microsoft/callback`;
    const issuer = await Issuer.discover(
      `https://login.microsoftonline.com/${env.MICROSOFT_TENANT_ID}/v2.0`
    );
    const client = new issuer.Client({
      client_id: env.MICROSOFT_CLIENT_ID,
      client_secret: env.MICROSOFT_CLIENT_SECRET,
      redirect_uris: [redirectUri],
      response_types: ['code'],
    });

    const params = client.callbackParams(req);
    const tokenSet = await client.callback(redirectUri, params, { state: stateParam });
    const claims = tokenSet.claims();

    const ssoProfile: SSOProfile = {
      provider: 'microsoft',
      providerId: claims.sub || claims.oid || '',
      email: (claims.email as string) || (claims.preferred_username as string) || '',
      displayName: (claims.name as string) || '',
    };

    const user = await authService.findOrCreateUser(ssoProfile);
    const tokens = await authService.createTokens(user);

    res.cookie(COOKIE_NAMES.ACCESS_TOKEN, tokens.accessToken, accessTokenCookieOptions);
    res.cookie(COOKIE_NAMES.REFRESH_TOKEN, tokens.refreshToken, refreshTokenCookieOptions);

    res.redirect(`${FRONTEND_URL}/auth/callback?success=true`);
  } catch (error) {
    res.redirect(`${FRONTEND_URL}/login?error=auth_failed`);
  }
};
```

## JWT Token Management

### Token Signing: `utils/token.ts`

The template uses **RS256 asymmetric signing** with separate RSA-2048 key pairs for access and refresh tokens. This is the default and recommended approach.

```typescript
import jwt, { type SignOptions } from 'jsonwebtoken';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { env } from '../config/environment';

export interface JwtPayload {
  sub: string;
  email: string;
  role: string;
}

// RSA key loading: files first (dev), env vars as fallback (prod)
const KEYS_DIR = path.resolve(__dirname, '..', '..', 'keys');

function loadKey(filename: string): string {
  const keyPath = path.join(KEYS_DIR, filename);
  if (fs.existsSync(keyPath)) {
    return fs.readFileSync(keyPath, 'utf-8');
  }
  // Fallback to env var (production deployment via Key Vault)
  if (filename.includes('private') && !filename.includes('refresh')) return env.JWT_PRIVATE_KEY || '';
  if (filename.includes('public') && !filename.includes('refresh')) return env.JWT_PUBLIC_KEY || '';
  if (filename.includes('refresh') && filename.includes('private')) return env.JWT_REFRESH_PRIVATE_KEY || '';
  if (filename.includes('refresh') && filename.includes('public')) return env.JWT_REFRESH_PUBLIC_KEY || '';
  return '';
}

const JWT_PRIVATE_KEY = loadKey('jwt-private.pem');
const JWT_PUBLIC_KEY = loadKey('jwt-public.pem');
const JWT_REFRESH_PRIVATE_KEY = loadKey('jwt-refresh-private.pem');
const JWT_REFRESH_PUBLIC_KEY = loadKey('jwt-refresh-public.pem');

const JWT_ISSUER = 'app-services';
const JWT_AUDIENCE = 'app-api';

export function signAccessToken(payload: JwtPayload): string {
  return jwt.sign(
    { sub: payload.sub, email: payload.email, role: payload.role },
    JWT_PRIVATE_KEY,
    { expiresIn: 900, algorithm: 'RS256', issuer: JWT_ISSUER, audience: JWT_AUDIENCE },
  );
}

export function signRefreshToken(userId: string): string {
  return jwt.sign(
    { sub: userId, type: 'refresh' },
    JWT_REFRESH_PRIVATE_KEY,
    { expiresIn: 604800, algorithm: 'RS256', issuer: JWT_ISSUER, audience: JWT_AUDIENCE },
  );
}
```

**Key management:**
- **Development:** Generate PEM files with `npm run generate-keys`. Keys are stored in `server/keys/` (gitignored). The `loadKey()` function loads them automatically.
- **Production:** Inject PEM keys as env vars (`JWT_PRIVATE_KEY`, `JWT_PUBLIC_KEY`, `JWT_REFRESH_PRIVATE_KEY`, `JWT_REFRESH_PUBLIC_KEY`) from Key Vault or a secrets manager. The Zod schema in `environment.ts` validates that either PEM env vars or PEM files exist in production.
- **Separate key pairs** for access and refresh tokens prevent a compromised refresh token from being used as an access token.

### Token Verification

**Algorithm pinning is critical**: it prevents `alg: none` and key-confusion attacks.

```typescript
export function verifyAccessToken(token: string): JwtPayload {
  return jwt.verify(token, JWT_PUBLIC_KEY, {
    algorithms: ['RS256'], issuer: JWT_ISSUER, audience: JWT_AUDIENCE,
  }) as JwtPayload;
}

export function verifyRefreshToken(token: string): { sub: string; type: string } {
  return jwt.verify(token, JWT_REFRESH_PUBLIC_KEY, {
    algorithms: ['RS256'], issuer: JWT_ISSUER, audience: JWT_AUDIENCE,
  }) as { sub: string; type: string };
}
```

### Differentiated Token Error Codes

Return differentiated 401 codes so the frontend can attempt silent refresh:

```typescript
try {
  const decoded = jwt.verify(token, publicKey, { algorithms: ['RS256'] });
  req.user = decoded;
  next();
} catch (err) {
  if (err instanceof jwt.TokenExpiredError) {
    return res.status(401).json({
      success: false,
      error: { code: 'TOKEN_EXPIRED', message: 'Access token expired' },
    });
  }
  return res.status(401).json({
    success: false,
    error: { code: 'UNAUTHORIZED', message: 'Authentication required' },
  });
}
```

### Token Hashing

Refresh tokens are stored as SHA-256 hashes. Even if the database is compromised, raw tokens cannot be recovered.

```typescript
export function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}
```

## Refresh Token Rotation: `services/auth.service.ts`

Every time a refresh token is used, the old one is revoked and a new one is issued. This limits the window of a stolen token.

```typescript
import { signAccessToken, signRefreshToken, verifyRefreshToken, hashToken, JwtPayload } from '../utils/token';
import * as refreshTokenModel from '../models/refresh-token.model';
import * as userModel from '../models/user.model';
import { AppError } from '../middleware/error-handler';
import { SSOProfile } from '../config/auth';

export async function findOrCreateUser(profile: SSOProfile) {
  // IMPORTANT: Normalize email to lowercase to prevent duplicate accounts
  // when providers return different casing (Google: lowercase, Microsoft: mixed case)
  profile.email = profile.email.toLowerCase().trim();

  // Look up user by provider ID or email, create if not found
  // Email lookup MUST use case-insensitive comparison: WHERE LOWER(email) = LOWER($1)
  let user = await userModel.findByProviderIdOrEmail(profile);
  if (!user) {
    user = await userModel.create({
      email: profile.email,
      displayName: profile.displayName,
      ssoProvider: profile.provider,
      providerId: profile.providerId,
      avatarUrl: profile.avatarUrl,
    });
  }
  // Update last login timestamp
  await userModel.updateLastLogin(user.pk_user_account);
  return user;
}

export async function createTokens(user: any) {
  const payload: JwtPayload = {
    sub: user.pk_user_account,
    email: user.user_email_address,
    role: user.user_role_name,
  };

  const accessToken = signAccessToken(payload);
  const refreshToken = signRefreshToken(user.pk_user_account);

  // Store hashed refresh token in database
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  await refreshTokenModel.create(user.pk_user_account, hashToken(refreshToken), expiresAt);

  return { accessToken, refreshToken };
}

export async function refreshAccessToken(refreshToken: string) {
  const decoded = verifyRefreshToken(refreshToken);
  const tokenHash = hashToken(refreshToken);

  // Verify the refresh token exists in the database
  const storedToken = await refreshTokenModel.findByHash(tokenHash);
  if (!storedToken) {
    throw AppError.unauthorized('Refresh token not found');
  }

  // Token theft detection: if the token was already revoked,
  // an attacker is replaying a stolen token. Revoke ALL tokens
  // for this user to force re-authentication on all devices.
  if (storedToken.is_revoked) {
    await refreshTokenModel.revokeAllForUser(decoded.sub);
    throw AppError.unauthorized('Token reuse detected; all sessions revoked');
  }

  const user = await userModel.findById(decoded.sub);
  if (!user || !user.is_active) {
    throw AppError.unauthorized('User account is inactive');
  }

  // ROTATE: revoke old token, issue new one
  await refreshTokenModel.revoke(tokenHash);

  const newRefreshToken = signRefreshToken(user.pk_user_account);
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  await refreshTokenModel.create(user.pk_user_account, hashToken(newRefreshToken), expiresAt);

  const payload: JwtPayload = {
    sub: user.pk_user_account,
    email: user.user_email_address,
    role: user.user_role_name,
  };

  return {
    accessToken: signAccessToken(payload),
    newRefreshToken,
    user,
  };
}

export async function logout(refreshToken: string): Promise<void> {
  if (refreshToken) {
    await refreshTokenModel.revoke(hashToken(refreshToken));
  }
}
```

## Cookie Configuration: `utils/cookie-config.ts`

```typescript
import { CookieOptions } from 'express';

const isProduction = process.env.NODE_ENV === 'production';

export const COOKIE_NAMES = {
  ACCESS_TOKEN: 'access_token',
  REFRESH_TOKEN: 'refresh_token',
  CSRF_TOKEN: 'csrf_token',
  OAUTH_STATE: 'oauth_state',
} as const;

export const accessTokenCookieOptions: CookieOptions = {
  httpOnly: true,
  secure: isProduction,
  // 'lax' allows cookies on top-level navigations (e.g., OAuth redirects back
  // from Google/Microsoft) while still blocking cross-site POST requests.
  // 'strict' would break OAuth: the browser won't send cookies on the redirect
  // back from the identity provider, so the callback handler can't read state.
  sameSite: 'lax',
  maxAge: 15 * 60 * 1000,         // 15 minutes
  path: '/',
};

export const refreshTokenCookieOptions: CookieOptions = {
  httpOnly: true,
  secure: isProduction,
  sameSite: 'lax',                 // Same reasoning as access token; see comment above
  maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
  path: '/',
};

export const csrfCookieOptions: CookieOptions = {
  httpOnly: true,   // httpOnly; frontend fetches token via GET /auth/csrf-token response body
  secure: isProduction,
  // 'strict' for CSRF cookies: they must never be sent on cross-site requests,
  // which is the entire point of CSRF protection. Unlike auth cookies, the CSRF
  // cookie is not needed during OAuth redirects: it is fetched fresh via
  // GET /auth/csrf-token after the user lands back on our origin.
  sameSite: 'strict',
  path: '/',
  // No maxAge: session cookie; expires when browser closes.
  // Token is re-fetched on app bootstrap and on 403 CSRF retry.
};

export const oauthStateCookieOptions: CookieOptions = {
  httpOnly: true,
  secure: isProduction,
  sameSite: 'lax',                 // Must be 'lax'; read on OAuth callback redirect
  maxAge: 10 * 60 * 1000,         // 10 minutes
  path: '/',
};
```

**Why auth cookies use `sameSite: 'lax'` but CSRF uses `'strict'`**: Auth cookies (access, refresh, OAuth state) use `'lax'` because OAuth SSO redirects are cross-site top-level navigations; with `'strict'`, the browser would not send these cookies on the return redirect, breaking the OAuth flow. The CSRF cookie uses `'strict'` because it should never be sent on any cross-site request; it is only needed for same-origin API calls and is fetched fresh after the user returns to the app.

### sameSite and OAuth SSO

Use `sameSite: 'lax'` (not `'strict'`) for auth cookies when using OAuth SSO. SSO callbacks are cross-site navigations; with `'strict'`, the browser will not send cookies when redirected back from Google/Microsoft, silently breaking authentication.

For logout, `clearCookie` options must match the `path` and `domain` of the original cookie.

## CSRF Double-Submit Pattern

### Server: Token Generation; `controllers/auth.controller.ts`

```typescript
export const getCsrfToken = async (req: Request, res: Response): Promise<void> => {
  const token = crypto.randomBytes(32).toString('hex');
  res.cookie(COOKIE_NAMES.CSRF_TOKEN, token, csrfCookieOptions);
  sendSuccess(res, { token });
};
```

### Server: Token Validation; `middleware/csrf.ts`

Uses timing-safe comparison to prevent timing attacks that could leak token bytes.

```typescript
import crypto from 'crypto';
import { Request, Response, NextFunction } from 'express';
import { COOKIE_NAMES } from '../utils/cookie-config';
import { AppError } from './error-handler';

const EXEMPT_METHODS = ['GET', 'HEAD', 'OPTIONS'];

export function csrfProtection(req: Request, _res: Response, next: NextFunction): void {
  if (EXEMPT_METHODS.includes(req.method)) {
    return next();
  }

  const headerToken = req.headers['x-csrf-token'] as string;
  const cookieToken = req.cookies?.[COOKIE_NAMES.CSRF_TOKEN];

  if (!headerToken || !cookieToken) {
    return next(new AppError('CSRF token missing', 403, 'CSRF_MISSING'));
  }

  const headerBuf = Buffer.from(headerToken);
  const cookieBuf = Buffer.from(cookieToken);

  if (headerBuf.length !== cookieBuf.length || !crypto.timingSafeEqual(headerBuf, cookieBuf)) {
    return next(new AppError('CSRF token mismatch', 403, 'CSRF_MISMATCH'));
  }

  next();
}
```

## Authentication Middleware: `middleware/authenticate.ts`

```typescript
import jwt from 'jsonwebtoken';
import { Request, Response, NextFunction } from 'express';
import { verifyAccessToken } from '../utils/token';
import { COOKIE_NAMES } from '../utils/cookie-config';
import { AppError } from './error-handler';

export interface AuthenticatedUser {
  id: string;
  email: string;
  role: string;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthenticatedUser;
    }
  }
}

export function authenticate(req: Request, _res: Response, next: NextFunction): void {
  const token = req.cookies?.[COOKIE_NAMES.ACCESS_TOKEN];

  if (!token) {
    return next(AppError.unauthorized('Authentication required'));
  }

  try {
    const decoded = verifyAccessToken(token);
    req.user = {
      id: decoded.sub,
      email: decoded.email,
      role: decoded.role,
    };
    next();
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      // Client should intercept this code and trigger a refresh
      return next(new AppError('Token expired', 401, 'TOKEN_EXPIRED'));
    }
    return next(AppError.unauthorized('Invalid token'));
  }
}
```

## Authorization Middleware: `middleware/authorize.ts`

```typescript
import { Request, Response, NextFunction } from 'express';
import { AppError } from './error-handler';

export function authorize(...roles: string[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user) {
      return next(AppError.unauthorized('Authentication required'));
    }
    if (!roles.includes(req.user.role)) {
      return next(AppError.forbidden('Insufficient permissions'));
    }
    next();
  };
}
```

Usage in routes:

```typescript
router.get('/admin/users', authenticate, authorize('admin'), userController.listUsers);
router.patch('/admin/users/:id/role', authenticate, authorize('admin'), userController.updateRole);
```

## Auth Routes: `routes/auth.routes.ts`

```typescript
import { Router } from 'express';
import * as authController from '../controllers/auth.controller';
import { authenticate } from '../middleware/authenticate';
import { csrfProtection } from '../middleware/csrf';

const router = Router();

// Google OAuth
router.get('/google', authController.googleLogin);
router.get('/google/callback', authController.googleCallback);

// Microsoft OAuth
router.get('/microsoft', authController.microsoftLogin);
router.get('/microsoft/callback', authController.microsoftCallback);

// Token management
router.post('/refresh', authController.refreshToken);
router.post('/logout', authenticate, authController.logout);

// User info
router.get('/me', authenticate, authController.getCurrentUser);

// CSRF token: no authenticate middleware; must be callable before auth is established
router.get('/csrf-token', authController.getCsrfToken);

export default router;
```

## Client-Side Auth Flow

### OAuth Callback Page

After the OAuth provider redirects back to `/auth/callback?success=true`, the client fetches the current user (cookies are sent automatically) and redirects to the app.

```typescript
// On mount of the OAuth callback page:
async function handleCallback() {
  const params = new URLSearchParams(window.location.search);

  if (params.get('success') === 'true') {
    // Cookies were set by the server: fetch user info
    await authStore.fetchCurrentUser();  // GET /api/auth/me
    const redirect = safeRedirect(params.get('redirect'));
    router.replace(redirect);
  } else {
    router.replace('/login?error=auth_failed');
  }
}
```

### Safe Redirect Validation

Prevents open redirect attacks by ensuring the target is a relative path.

```typescript
function safeRedirect(target: string | null | undefined): string {
  if (!target || !target.startsWith('/') || target.startsWith('//')) {
    return '/';
  }
  return target;
}
```

### Client API Interceptors

> The canonical frontend API client implementation is in **skill 07 (API Client & Security Interceptors)**. The pattern below summarizes the key interceptors for Node.js backend alignment.

```typescript
// CSRF: token fetched from backend endpoint (httpOnly cookie; JS cannot read it directly)
let csrfToken: string | null = null;

async function fetchCsrfToken(): Promise<void> {
  const res = await api.get('/auth/csrf-token');
  csrfToken = res.data?.data?.token || res.data?.token || null;
}

// Request interceptor: attach CSRF token to all mutation requests
api.interceptors.request.use((config) => {
  config.headers['X-Request-ID'] = crypto.randomUUID();
  if (csrfToken && config.method !== 'get') {
    config.headers['X-CSRF-Token'] = csrfToken;
  }
  return config;
});

// Response interceptor: handle token expiry and CSRF errors
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;
    const errorCode = error.response?.data?.error?.code || error.response?.data?.code;

    // Auto-refresh expired access tokens (retry once)
    if (errorCode === 'TOKEN_EXPIRED' && !originalRequest._retry) {
      originalRequest._retry = true;
      await api.post('/auth/refresh');
      return api(originalRequest);
    }

    // Re-fetch CSRF token on mismatch (retry once)
    if ((errorCode === 'CSRF_MISSING' || errorCode === 'CSRF_MISMATCH') && !originalRequest._csrfRetry) {
      originalRequest._csrfRetry = true;
      await fetchCsrfToken();
      if (csrfToken) {
        originalRequest.headers['X-CSRF-Token'] = csrfToken;
      }
      return api(originalRequest);
    }

    return Promise.reject(error);
  },
);
```

## Account Lockout (Optional)

For additional security, track failed login attempts and temporarily lock accounts:

```typescript
// In the user_account table, add:
//   failed_login_attempts INTEGER NOT NULL DEFAULT 0,
//   locked_until TIMESTAMPTZ

const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_DURATION_MS = 15 * 60 * 1000; // 15 minutes

export async function checkAccountLock(user: any): Promise<void> {
  if (user.locked_until && new Date(user.locked_until) > new Date()) {
    throw new AppError('Account temporarily locked. Try again later.', 423, 'ACCOUNT_LOCKED');
  }
}

export async function recordFailedLogin(userId: string): Promise<void> {
  const user = await userModel.incrementFailedAttempts(userId);
  if (user.failed_login_attempts >= MAX_FAILED_ATTEMPTS) {
    const lockedUntil = new Date(Date.now() + LOCKOUT_DURATION_MS);
    await userModel.lockAccount(userId, lockedUntil);
  }
}

export async function resetFailedAttempts(userId: string): Promise<void> {
  await userModel.resetFailedAttempts(userId);
}
```

## Password Reset Flow (Optional)

For applications that support email/password authentication alongside SSO, implement a time-limited password reset flow.

### Database Schema Addition

```sql
-- Add to migrations
CREATE TABLE password_reset_token (
  pk_password_reset_token UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fk_user_account         UUID NOT NULL REFERENCES user_account(pk_user_account),
  token_hash              VARCHAR(64) NOT NULL,
  expires_at              TIMESTAMPTZ NOT NULL,
  used_at                 TIMESTAMPTZ,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_password_reset_token_hash ON password_reset_token (token_hash);
```

### Service: `services/password-reset.service.ts`

```typescript
import crypto from 'crypto';
import bcrypt from 'bcrypt';
import { hashToken } from '../utils/token';
import * as userModel from '../models/user.model';
import * as passwordResetModel from '../models/password-reset.model';
import { sendEmail } from '../utils/email';
import { AppError } from '../middleware/error-handler';
import { env } from '../config/environment';

const RESET_TOKEN_EXPIRY_MS = 60 * 60 * 1000; // 1 hour
const BCRYPT_ROUNDS = 12;

export async function requestPasswordReset(email: string): Promise<void> {
  // Always return success to prevent email enumeration
  const user = await userModel.findByEmail(email);
  if (!user) return;

  // Generate a cryptographically random token
  const rawToken = crypto.randomBytes(32).toString('hex');
  const tokenHash = hashToken(rawToken); // SHA-256
  const expiresAt = new Date(Date.now() + RESET_TOKEN_EXPIRY_MS);

  // Invalidate any existing reset tokens for this user
  await passwordResetModel.revokeAllForUser(user.pk_user_account);

  // Store hashed token in DB: raw token is never persisted
  await passwordResetModel.create(user.pk_user_account, tokenHash, expiresAt);

  // Send reset email with raw token in the link
  const frontendUrl = (env.CORS_ORIGIN || 'http://localhost:5173').split(',')[0].trim();
  const resetUrl = `${frontendUrl}/reset-password?token=${rawToken}`;
  await sendEmail({
    to: user.user_email_address,
    subject: 'Password Reset Request',
    text: `Reset your password: ${resetUrl}\n\nThis link expires in 1 hour. If you didn't request this, ignore this email.`,
  });
}

export async function resetPassword(rawToken: string, newPassword: string): Promise<void> {
  const tokenHash = hashToken(rawToken);

  const resetRecord = await passwordResetModel.findByHash(tokenHash);
  if (!resetRecord) {
    throw AppError.badRequest('Invalid or expired reset token');
  }

  if (resetRecord.used_at || new Date(resetRecord.expires_at) < new Date()) {
    throw AppError.badRequest('Invalid or expired reset token');
  }

  // Hash new password with bcrypt and update the user record
  const passwordHash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);
  await userModel.updatePassword(resetRecord.fk_user_account, passwordHash);

  // Mark token as used so it cannot be replayed
  await passwordResetModel.markUsed(tokenHash);

  // Revoke all refresh tokens to force re-authentication on all devices
  const { default: refreshTokenModel } = await import('../models/refresh-token.model');
  await refreshTokenModel.revokeAllForUser(resetRecord.fk_user_account);
}
```

### Controller: `controllers/auth.controller.ts`

```typescript
export const forgotPassword = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { email } = req.body;
    if (!email || typeof email !== 'string') {
      throw AppError.badRequest('Email is required');
    }

    await passwordResetService.requestPasswordReset(email.toLowerCase().trim());

    // Always return 200 to prevent email enumeration
    res.json({ message: 'If an account with that email exists, a reset link has been sent.' });
  } catch (error) {
    next(error);
  }
};

export const resetPassword = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { token, password } = req.body;
    if (!token || !password) {
      throw AppError.badRequest('Token and new password are required');
    }
    if (password.length < 12) {
      throw AppError.badRequest('Password must be at least 12 characters');
    }

    await passwordResetService.resetPassword(token, password);

    res.json({ message: 'Password has been reset successfully.' });
  } catch (error) {
    next(error);
  }
};
```

### Routes: `routes/auth.routes.ts`

Apply stricter rate limiting on the forgot-password endpoint to prevent abuse (email flooding).

```typescript
import rateLimit from 'express-rate-limit';

// Strict rate limit: 5 requests per 15 minutes per IP
const forgotPasswordLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: { message: 'Too many requests, please try again later.', code: 'RATE_LIMITED' } },
});

router.post('/forgot-password', forgotPasswordLimiter, authController.forgotPassword);
router.post('/reset-password', authController.resetPassword);
```
