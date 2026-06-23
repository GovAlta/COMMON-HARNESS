import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import passport from 'passport';
import { asyncHandler } from '../utils/async-handler';
import { sendSuccess } from '../utils/response';
import { AppError } from '../utils/app-error';
import { generateCsrfToken } from '../utils/token';
import {
  COOKIE_NAMES,
  accessTokenCookieOptions,
  refreshTokenCookieOptions,
  csrfCookieOptions,
  clearCookieOptions,
  oauthStateCookieOptions,
} from '../utils/cookie-config';
import * as authService from '../services/auth.service';
import * as userModel from '../models/user.model';
import type { SSOProfile } from '../types/auth';
import { isGoogleConfigured, isMicrosoftConfigured, getMicrosoftConfig } from '../config/auth';
import logger from '../utils/logger';
import { logAuditEvent } from '../utils/audit-logger';
import { env } from '../config/environment';

// Use the first origin from CORS_ORIGIN as the frontend redirect target.
// CORS_ORIGIN may be comma-separated (e.g. "http://localhost:5173,http://localhost:3000").
const FRONTEND_URL = (env.CORS_ORIGIN || 'http://localhost:5173').split(',')[0].trim();
const isProduction = env.NODE_ENV === 'production';

/** OAuth state cookie name */
const OAUTH_STATE_COOKIE = 'oauth_state';

/**
 * GET /api/auth/google
 * Initiates Google OAuth 2.0 flow via Passport.
 */
export const googleLogin = (req: Request, res: Response, next: NextFunction): void => {
  if (!isGoogleConfigured()) {
    next(new AppError('Google SSO not configured', 503, 'SSO_NOT_CONFIGURED'));
    return;
  }
  // Generate and store OAuth state parameter to prevent CSRF (RFC 6749 Section 10.12)
  const state = crypto.randomBytes(32).toString('hex');
  res.cookie(OAUTH_STATE_COOKIE, state, oauthStateCookieOptions);
  passport.authenticate('google', { scope: ['openid', 'profile', 'email'], session: false, state })(req, res, next);
};

/**
 * GET /api/auth/google/callback
 * Handles Google OAuth callback, creates/updates user, issues JWT cookies, redirects to frontend.
 */
export const googleCallback = (req: Request, res: Response, next: NextFunction): void => {
  // Verify OAuth state parameter to prevent CSRF
  const stateCookie = req.cookies?.[OAUTH_STATE_COOKIE];
  const stateParam = req.query.state as string | undefined;
  res.clearCookie(OAUTH_STATE_COOKIE, { path: '/' });
  if (!stateCookie || !stateParam ||
      stateCookie.length !== stateParam.length ||
      !crypto.timingSafeEqual(Buffer.from(stateCookie), Buffer.from(stateParam))) {
    logger.warn('OAuth state mismatch', { hasStateCookie: !!stateCookie, hasStateParam: !!stateParam });
    res.redirect(`${FRONTEND_URL}/auth?error=google_failed`);
    return;
  }

  passport.authenticate('google', { session: false, failureRedirect: `${FRONTEND_URL}/auth?error=google_failed` }, async (err: Error | null, profile: SSOProfile | false) => {
    try {
      if (err || !profile) {
        res.redirect(`${FRONTEND_URL}/auth?error=google_failed`);
        return;
      }

      const user = await authService.findOrCreateUser(profile as SSOProfile);
      const tokens = await authService.createTokens(user);

      // Set cookies
      res.cookie(COOKIE_NAMES.ACCESS_TOKEN, tokens.accessToken, accessTokenCookieOptions);
      res.cookie(COOKIE_NAMES.REFRESH_TOKEN, tokens.refreshToken, refreshTokenCookieOptions);

      await logAuditEvent({
        action: 'LOGIN',
        tableName: 'user_account',
        recordId: user.pk_user_account,
        userId: user.pk_user_account,
        ipAddress: req.ip || null,
        userAgent: req.headers['user-agent'] || null,
        newData: { provider: 'google', email: user.user_email_address },
      });

      res.redirect(`${FRONTEND_URL}/?signed_in=true`);
    } catch (error) {
      logger.error('Google callback error', { error: (error as Error).message });
      await logAuditEvent({
        action: 'LOGIN_FAILED',
        tableName: 'user_account',
        ipAddress: req.ip || null,
        userAgent: req.headers['user-agent'] || null,
        newData: { provider: 'google', error: (error as Error).message },
      });
      res.redirect(`${FRONTEND_URL}/auth?error=server_error`);
    }
  })(req, res, next);
};

/**
 * GET /api/auth/microsoft
 * Initiates Microsoft OIDC flow.
 * Uses openid-client for OIDC discovery and authorization.
 */
export const microsoftLogin = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  if (!isMicrosoftConfigured()) {
    throw new AppError('Microsoft SSO not configured', 503, 'SSO_NOT_CONFIGURED');
  }

  const config = getMicrosoftConfig();
  const { Issuer } = await import('openid-client');

  const issuer = await Issuer.discover(
    `https://login.microsoftonline.com/${config.tenantId}/v2.0`
  );

  const client = new issuer.Client({
    client_id: config.clientId,
    client_secret: config.clientSecret,
    redirect_uris: [config.redirectUri],
    response_types: ['code'],
  });

  // Generate and store OAuth state parameter to prevent CSRF (RFC 6749 Section 10.12)
  const state = crypto.randomBytes(32).toString('hex');
  res.cookie(OAUTH_STATE_COOKIE, state, oauthStateCookieOptions);

  const authUrl = client.authorizationUrl({
    scope: 'openid profile email',
    response_type: 'code',
    state,
  });

  res.redirect(authUrl);
});

/**
 * GET /api/auth/microsoft/callback
 * Handles Microsoft OIDC callback, creates/updates user, issues JWT cookies, redirects to frontend.
 */
export const microsoftCallback = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  // Verify OAuth state parameter to prevent CSRF
  const stateCookie = req.cookies?.[OAUTH_STATE_COOKIE];
  const stateParam = req.query.state as string | undefined;
  res.clearCookie(OAUTH_STATE_COOKIE, { path: '/' });
  if (!stateCookie || !stateParam ||
      stateCookie.length !== stateParam.length ||
      !crypto.timingSafeEqual(Buffer.from(stateCookie), Buffer.from(stateParam))) {
    logger.warn('Microsoft OAuth state mismatch', { hasStateCookie: !!stateCookie, hasStateParam: !!stateParam });
    res.redirect(`${FRONTEND_URL}/auth?error=microsoft_failed`);
    return;
  }

  try {
    const config = getMicrosoftConfig();
    const { Issuer } = await import('openid-client');

    const issuer = await Issuer.discover(
      `https://login.microsoftonline.com/${config.tenantId}/v2.0`
    );

    const client = new issuer.Client({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      redirect_uris: [config.redirectUri],
      response_types: ['code'],
    });

    const params = client.callbackParams(req);
    const tokenSet = await client.callback(config.redirectUri, params, {
      state: stateCookie, // Required by openid-client for state verification
    });
    const claims = tokenSet.claims();

    // Verify the `tid` (tenant id) claim matches the configured tenant.
    // Without this check, a token from ANY Microsoft tenant that knows our
    // client_id could authenticate (since openid-client validates only the
    // signature + issuer-pattern, not the specific tenant). This is the second
    // half of the IDPV-001 / Critical-finding defense; the first half is in
    // environment.ts (reject 'common'/'organizations'/'consumers' in prod).
    if (claims.tid !== config.tenantId) {
      logger.warn('Microsoft OIDC tid mismatch', {
        configuredTenant: config.tenantId,
        tokenTid: claims.tid,
        sub: claims.sub,
      });
      res.redirect(`${FRONTEND_URL}/auth?error=tenant_mismatch`);
      return;
    }

    const profile: SSOProfile = {
      provider: 'microsoft',
      providerId: claims.sub || '',
      email: (claims.email as string) || (claims.preferred_username as string) || '',
      displayName: (claims.name as string) || '',
      avatarUrl: undefined,
    };

    const user = await authService.findOrCreateUser(profile);
    const tokens = await authService.createTokens(user);

    // Set cookies
    res.cookie(COOKIE_NAMES.ACCESS_TOKEN, tokens.accessToken, accessTokenCookieOptions);
    res.cookie(COOKIE_NAMES.REFRESH_TOKEN, tokens.refreshToken, refreshTokenCookieOptions);

    await logAuditEvent({
      action: 'LOGIN',
      tableName: 'user_account',
      recordId: user.pk_user_account,
      userId: user.pk_user_account,
      ipAddress: req.ip || null,
      userAgent: req.headers['user-agent'] || null,
      newData: { provider: 'microsoft', email: user.user_email_address },
    });

    res.redirect(`${FRONTEND_URL}/?signed_in=true`);
  } catch (error) {
    logger.error('Microsoft callback error', { error: (error as Error).message });
    await logAuditEvent({
      action: 'LOGIN_FAILED',
      tableName: 'user_account',
      ipAddress: req.ip || null,
      userAgent: req.headers['user-agent'] || null,
      newData: { provider: 'microsoft', error: (error as Error).message },
    });
    res.redirect(`${FRONTEND_URL}/auth?error=microsoft_failed`);
  }
});

/**
 * GET /api/auth/csrf-token
 * Generates and returns a CSRF token (sets double-submit cookie).
 */
export const getCsrfToken = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const token = generateCsrfToken();

  // Set the CSRF cookie (readable by JavaScript)
  res.cookie(COOKIE_NAMES.CSRF_TOKEN, token, csrfCookieOptions);

  sendSuccess(res, { token });
});

/**
 * GET /api/auth/me
 * Returns the current authenticated user profile from JWT.
 */
export const getMe = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  if (!req.user) {
    throw AppError.unauthorized('Not authenticated');
  }

  // Fetch full user details from DB
  const user = await userModel.findById(req.user.id);
  if (!user) {
    throw AppError.notFound('User not found');
  }

  // Normalise the legacy 'user' role to 'viewer' so the client only ever
  // sees roles that are members of the canonical ROLE_HIERARCHY. Keeps the
  // client's hasMinRole() arithmetic correct without a duplicate alias map.
  const role = user.user_role_name === 'user' ? 'viewer' : user.user_role_name;

  // Field names mirror the client's User interface (name + role + avatarUrl)
  // so the auth store can consume the unwrapped envelope directly.
  sendSuccess(res, {
    id: user.pk_user_account,
    email: user.user_email_address,
    name: user.user_display_name,
    role,
    avatarUrl: user.avatar_url,
    ssoProvider: user.sso_provider_name,
    isActive: user.is_active,
    lastLoginAt: user.last_login_at,
    createdAt: user.created_at,
  });
});

/**
 * POST /api/auth/refresh
 * Validates refresh token cookie, issues new access token.
 */
export const refreshToken = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const refreshTokenValue = req.cookies?.[COOKIE_NAMES.REFRESH_TOKEN];

  if (!refreshTokenValue) {
    throw AppError.unauthorized('Refresh token required');
  }

  const result = await authService.refreshAccessToken(refreshTokenValue);

  // Set new access token and rotated refresh token cookies
  res.cookie(COOKIE_NAMES.ACCESS_TOKEN, result.accessToken, accessTokenCookieOptions);
  res.cookie(COOKIE_NAMES.REFRESH_TOKEN, result.newRefreshToken, refreshTokenCookieOptions);

  await logAuditEvent({
    action: 'TOKEN_REFRESH',
    tableName: 'user_account',
    userId: result.user.pk_user_account,
    ipAddress: req.ip || null,
    userAgent: req.headers['user-agent'] || null,
  });

  sendSuccess(res, { message: 'Token refreshed successfully' });
});

/**
 * POST /api/auth/logout
 * Clears all cookies and revokes refresh token in database.
 */
export const logout = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const refreshTokenValue = req.cookies?.[COOKIE_NAMES.REFRESH_TOKEN];

  await logAuditEvent({
    action: 'LOGOUT',
    tableName: 'user_account',
    recordId: req.user?.id,
    userId: req.user?.id,
    ipAddress: req.ip || null,
    userAgent: req.headers['user-agent'] || null,
  });

  // Revoke refresh token in DB if present
  if (refreshTokenValue) {
    try {
      await authService.revokeRefreshToken(refreshTokenValue);
    } catch (error) {
      // Log but don't fail — we still want to clear cookies
      logger.error('Error revoking refresh token', { error: (error as Error).message });
    }
  }

  // Clear all auth cookies
  res.clearCookie(COOKIE_NAMES.ACCESS_TOKEN, clearCookieOptions);
  res.clearCookie(COOKIE_NAMES.REFRESH_TOKEN, clearCookieOptions);
  res.clearCookie(COOKIE_NAMES.CSRF_TOKEN, clearCookieOptions);

  sendSuccess(res, { message: 'Logged out successfully' });
});
