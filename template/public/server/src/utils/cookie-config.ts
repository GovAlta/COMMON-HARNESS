import type { CookieOptions } from 'express';

const isProduction = process.env.NODE_ENV === 'production';

/**
 * Cookie name constants.
 */
export const COOKIE_NAMES = {
  ACCESS_TOKEN: 'access_token',
  REFRESH_TOKEN: 'refresh_token',
  CSRF_TOKEN: 'csrf_token',
} as const;

/**
 * Cookie options for the JWT access token.
 * httpOnly, secure (in production), sameSite=lax, 15 minutes.
 *
 * sameSite must be 'lax' (not 'strict') because OAuth SSO redirects are
 * cross-site navigations. With 'strict', the browser would not send these
 * cookies when redirected back from Google/Microsoft, breaking the auth flow.
 * 'lax' sends cookies on top-level navigations (GET) but not on cross-site
 * POST/fetch — which is the correct security tradeoff for OAuth.
 */
export const accessTokenCookieOptions: CookieOptions = {
  httpOnly: true,
  secure: isProduction,
  sameSite: 'lax',
  maxAge: 15 * 60 * 1000, // 15 minutes
  path: '/',
};

/**
 * Cookie options for the JWT refresh token.
 * httpOnly, secure (in production), sameSite=lax, 7 days.
 */
export const refreshTokenCookieOptions: CookieOptions = {
  httpOnly: true,
  secure: isProduction,
  sameSite: 'lax',
  maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
  path: '/',
};

/**
 * Cookie options for the CSRF token (double-submit pattern).
 * httpOnly: true — the client NEVER reads this cookie directly.
 * Instead, the client receives the token value from the GET /api/auth/csrf-token
 * response body and stores it in memory only (never localStorage/sessionStorage).
 * The client sends the in-memory token in the x-csrf-token header.
 * The server compares the header value against this httpOnly cookie.
 */
export const csrfCookieOptions: CookieOptions = {
  httpOnly: true,
  secure: isProduction,
  sameSite: 'lax',
  path: '/',
};

/**
 * Cookie options for OAuth state parameter.
 * Short-lived (10 minutes) — OAuth flow should complete within this window.
 */
export const oauthStateCookieOptions: CookieOptions = {
  httpOnly: true,
  secure: isProduction,
  sameSite: 'lax',
  maxAge: 10 * 60 * 1000, // 10 minutes
  path: '/',
};

/**
 * Options for clearing cookies (used during logout).
 * Must match the path and domain of the original cookies.
 */
export const clearCookieOptions: CookieOptions = {
  httpOnly: true,
  secure: isProduction,
  sameSite: 'lax',
  path: '/',
};
