import passport from 'passport';
import { Strategy as GoogleStrategy, type Profile as GoogleProfile, type VerifyCallback } from 'passport-google-oauth20';
import type { SSOProfile } from '../types/auth';
import logger from '../utils/logger';
import { env } from './environment';

const GOOGLE_CLIENT_ID = env.GOOGLE_CLIENT_ID || '';
const GOOGLE_CLIENT_SECRET = env.GOOGLE_CLIENT_SECRET || '';
const MICROSOFT_CLIENT_ID = env.MICROSOFT_CLIENT_ID || '';
const MICROSOFT_CLIENT_SECRET = env.MICROSOFT_CLIENT_SECRET || '';
// Microsoft tenant — NEVER default to 'common' here. Multi-tenant ('common',
// 'organizations', 'consumers') allows ANY Microsoft account in the world to
// authenticate against this app. Production deploys MUST set a specific tenant
// GUID; the env-validation refine in environment.ts rejects 'common' in prod.
// The empty default below is only useful for local dev where Microsoft SSO is
// disabled — getMicrosoftConfig() short-circuits when MICROSOFT_TENANT_ID is
// empty so the strategy never registers.
const MICROSOFT_TENANT_ID = env.MICROSOFT_TENANT_ID || '';

// API_BASE_URL is the public-facing URL of this server.
// Used for OAuth callback URLs that Google/Microsoft redirect back to.
const API_BASE = env.API_BASE_URL || `http://localhost:${env.PORT}`;

/**
 * Configure Passport strategies.
 * Only registers strategies if credentials are available.
 */
export function configurePassport(): void {
  // Passport serialization (not used with JWT, but required by Passport)
  passport.serializeUser((user: Express.User, done) => {
    done(null, user);
  });

  passport.deserializeUser((user: Express.User, done) => {
    done(null, user);
  });

  // Google OAuth 2.0 Strategy
  if (GOOGLE_CLIENT_ID && GOOGLE_CLIENT_SECRET) {
    passport.use(
      new GoogleStrategy(
        {
          clientID: GOOGLE_CLIENT_ID,
          clientSecret: GOOGLE_CLIENT_SECRET,
          callbackURL: `${API_BASE}/api/auth/google/callback`,
          scope: ['openid', 'profile', 'email'],
        },
        (
          _accessToken: string,
          _refreshToken: string,
          profile: GoogleProfile,
          done: VerifyCallback
        ) => {
          const ssoProfile: SSOProfile = {
            provider: 'google',
            providerId: profile.id,
            email: profile.emails?.[0]?.value || '',
            displayName: profile.displayName || '',
            avatarUrl: profile.photos?.[0]?.value,
          };
          done(null, ssoProfile as unknown as Express.User);
        }
      )
    );
    logger.info('Google OAuth strategy configured');
  } else {
    logger.warn('Google OAuth credentials not configured — Google SSO disabled');
  }

  // Microsoft OIDC Strategy (using openid-client approach)
  // We'll configure Microsoft SSO dynamically via openid-client in the auth controller
  // because openid-client uses async OIDC discovery
  if (MICROSOFT_CLIENT_ID && MICROSOFT_CLIENT_SECRET) {
    logger.info('Microsoft OIDC credentials available — will configure on first request');
  } else {
    logger.warn('Microsoft OIDC credentials not configured — Microsoft SSO disabled');
  }
}

/**
 * Get Microsoft OIDC configuration for dynamic setup.
 */
export function getMicrosoftConfig() {
  return {
    clientId: MICROSOFT_CLIENT_ID,
    clientSecret: MICROSOFT_CLIENT_SECRET,
    tenantId: MICROSOFT_TENANT_ID,
    redirectUri: `${API_BASE}/api/auth/microsoft/callback`,
    // Microsoft SSO requires BOTH credentials AND a specific tenant. Single-tenant
    // is mandatory because multi-tenant accepts any Microsoft account globally —
    // a CRITICAL identity-federation finding (IDPV-001 + tid verification).
    enabled: !!(MICROSOFT_CLIENT_ID && MICROSOFT_CLIENT_SECRET && MICROSOFT_TENANT_ID),
  };
}

/**
 * Check if Google SSO is configured.
 */
export function isGoogleConfigured(): boolean {
  return !!(GOOGLE_CLIENT_ID && GOOGLE_CLIENT_SECRET);
}

/**
 * Check if Microsoft SSO is configured.
 */
export function isMicrosoftConfigured(): boolean {
  return !!(MICROSOFT_CLIENT_ID && MICROSOFT_CLIENT_SECRET);
}

export default passport;
