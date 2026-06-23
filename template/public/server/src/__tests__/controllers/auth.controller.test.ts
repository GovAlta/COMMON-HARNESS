import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import cookieParser from 'cookie-parser';

// Mock modules before imports
vi.mock('../../config/database', () => ({
  pool: {
    query: vi.fn(),
    connect: vi.fn(),
    end: vi.fn(),
  },
}));

vi.mock('../../utils/logger', () => ({
  default: {
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
  },
}));

vi.mock('../../utils/audit-logger', () => ({
  logAuditEvent: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../models/user.model', () => ({
  findById: vi.fn(),
  findByEmail: vi.fn(),
  findByProviderId: vi.fn(),
  createUser: vi.fn(),
  updateUser: vi.fn(),
  updateLastLogin: vi.fn(),
}));

vi.mock('../../models/refresh-token.model', () => ({
  create: vi.fn(),
  findByHash: vi.fn(),
  revoke: vi.fn(),
  revokeAllForUser: vi.fn(),
  deleteExpired: vi.fn(),
}));

vi.mock('../../config/auth', () => ({
  configurePassport: vi.fn(),
  isGoogleConfigured: vi.fn().mockReturnValue(false),
  isMicrosoftConfigured: vi.fn().mockReturnValue(false),
  getMicrosoftConfig: vi.fn().mockReturnValue({ enabled: false }),
}));

vi.mock('passport', () => {
  const mockPassport = {
    initialize: vi.fn(() => (_req: unknown, _res: unknown, next: () => void) => next()),
    authenticate: vi.fn(),
    use: vi.fn(),
    serializeUser: vi.fn(),
    deserializeUser: vi.fn(),
  };
  return { default: mockPassport };
});

import * as userModel from '../../models/user.model';
import * as refreshTokenModel from '../../models/refresh-token.model';
import { isGoogleConfigured } from '../../config/auth';
import { signAccessToken, signRefreshToken, hashToken } from '../../utils/token';
import { COOKIE_NAMES } from '../../utils/cookie-config';
import { authenticate } from '../../middleware/authenticate';
import * as authController from '../../controllers/auth.controller';
import { logAuditEvent } from '../../utils/audit-logger';

function createTestApp() {
  const app = express();
  app.use(express.json());
  app.use(cookieParser());

  // CSRF endpoint
  app.get('/api/auth/csrf-token', authController.getCsrfToken);

  // Me endpoint with real authenticate middleware
  app.get('/api/auth/me', authenticate, authController.getMe);

  // Refresh endpoint
  app.post('/api/auth/refresh', authController.refreshToken);

  // Logout endpoint with authenticate (no csrf for simpler testing)
  app.post('/api/auth/logout', authenticate, authController.logout);

  // Google login
  app.get('/api/auth/google', authController.googleLogin);

  // Error handler
  app.use((err: Error & { statusCode?: number; code?: string }, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    res.status(err.statusCode || 500).json({
      success: false,
      error: { code: err.code || 'INTERNAL_ERROR', message: err.message },
    });
  });

  return app;
}

describe('Auth Controller', () => {
  let app: express.Express;

  beforeEach(() => {
    vi.clearAllMocks();
    app = createTestApp();
  });

  describe('GET /api/auth/csrf-token', () => {
    it('should return a CSRF token and set cookie', async () => {
      const res = await request(app).get('/api/auth/csrf-token');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.token).toBeDefined();
      expect(typeof res.body.data.token).toBe('string');
      expect(res.body.data.token.length).toBeGreaterThan(0);

      // Check cookie is set
      const cookies = res.headers['set-cookie'];
      expect(cookies).toBeDefined();
      const csrfCookie = Array.isArray(cookies)
        ? cookies.find((c: string) => c.startsWith('csrf_token='))
        : cookies?.startsWith('csrf_token=') ? cookies : undefined;
      expect(csrfCookie).toBeDefined();
    });
  });

  describe('GET /api/auth/me', () => {
    it('should return user profile when authenticated', async () => {
      const mockUser = {
        pk_user_account: 'user-123',
        user_email_address: 'test@example.com',
        user_display_name: 'Test User',
        user_role_name: 'user',
        avatar_url: null,
        sso_provider_name: 'google',
        is_active: true,
        last_login_at: '2024-01-01T00:00:00Z',
        created_at: '2024-01-01T00:00:00Z',
      };

      vi.mocked(userModel.findById).mockResolvedValue(mockUser as any);

      const accessToken = signAccessToken({
        sub: 'user-123',
        email: 'test@example.com',
        role: 'user',
      });

      const res = await request(app)
        .get('/api/auth/me')
        .set('Cookie', [`${COOKIE_NAMES.ACCESS_TOKEN}=${accessToken}`]);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.id).toBe('user-123');
      expect(res.body.data.email).toBe('test@example.com');
      // Controller maps user_display_name → name and normalises legacy
      // 'user' role to 'viewer' on the way out so the client only ever
      // sees canonical members of ROLE_HIERARCHY.
      expect(res.body.data.name).toBe('Test User');
      expect(res.body.data.role).toBe('viewer');
    });

    it('should return 401 when not authenticated', async () => {
      const res = await request(app).get('/api/auth/me');

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });
  });

  describe('POST /api/auth/refresh', () => {
    it('should return 401 when no refresh token cookie', async () => {
      const res = await request(app).post('/api/auth/refresh');

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });

    it('should refresh access token with valid refresh token', async () => {
      const refreshToken = signRefreshToken('user-123');
      const tokenHash = hashToken(refreshToken);

      vi.mocked(refreshTokenModel.findByHash).mockResolvedValue({
        pk_refresh_token: 'rt-1',
        fk_refresh_token_user_account: 'user-123',
        token_hash_value: tokenHash,
        token_expires_at: new Date(Date.now() + 86400000).toISOString(),
        token_revoked_at: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });

      vi.mocked(userModel.findById).mockResolvedValue({
        pk_user_account: 'user-123',
        user_email_address: 'test@example.com',
        user_display_name: 'Test User',
        user_role_name: 'user',
        is_active: true,
      } as any);

      const res = await request(app)
        .post('/api/auth/refresh')
        .set('Cookie', [`${COOKIE_NAMES.REFRESH_TOKEN}=${refreshToken}`]);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      // Should set a new access token cookie
      const cookies = res.headers['set-cookie'];
      expect(cookies).toBeDefined();
    });

    it('should create a TOKEN_REFRESH audit event on successful refresh', async () => {
      const refreshToken = signRefreshToken('user-123');
      const tokenHash = hashToken(refreshToken);

      vi.mocked(refreshTokenModel.findByHash).mockResolvedValue({
        pk_refresh_token: 'rt-1',
        fk_refresh_token_user_account: 'user-123',
        token_hash_value: tokenHash,
        token_expires_at: new Date(Date.now() + 86400000).toISOString(),
        token_revoked_at: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });

      vi.mocked(userModel.findById).mockResolvedValue({
        pk_user_account: 'user-123',
        user_email_address: 'test@example.com',
        user_display_name: 'Test User',
        user_role_name: 'user',
        is_active: true,
      } as any);

      await request(app)
        .post('/api/auth/refresh')
        .set('Cookie', [`${COOKIE_NAMES.REFRESH_TOKEN}=${refreshToken}`]);

      expect(logAuditEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'TOKEN_REFRESH',
          tableName: 'user_account',
          userId: 'user-123',
        })
      );
    });
  });

  describe('POST /api/auth/logout', () => {
    it('should clear cookies on logout', async () => {
      const accessToken = signAccessToken({
        sub: 'user-123',
        email: 'test@example.com',
        role: 'user',
      });
      const refreshToken = signRefreshToken('user-123');

      vi.mocked(refreshTokenModel.revoke).mockResolvedValue(undefined);

      const res = await request(app)
        .post('/api/auth/logout')
        .set('Cookie', [
          `${COOKIE_NAMES.ACCESS_TOKEN}=${accessToken}`,
          `${COOKIE_NAMES.REFRESH_TOKEN}=${refreshToken}`,
        ]);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.message).toBe('Logged out successfully');

      // Check cookies are cleared (set to empty/expired)
      const cookies = res.headers['set-cookie'];
      expect(cookies).toBeDefined();
    });

    it('should create a LOGOUT audit event', async () => {
      const accessToken = signAccessToken({
        sub: 'user-123',
        email: 'test@example.com',
        role: 'user',
      });
      const refreshToken = signRefreshToken('user-123');

      vi.mocked(refreshTokenModel.revoke).mockResolvedValue(undefined);

      await request(app)
        .post('/api/auth/logout')
        .set('Cookie', [
          `${COOKIE_NAMES.ACCESS_TOKEN}=${accessToken}`,
          `${COOKIE_NAMES.REFRESH_TOKEN}=${refreshToken}`,
        ]);

      expect(logAuditEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'LOGOUT',
          tableName: 'user_account',
          userId: 'user-123',
        })
      );
    });
  });

  describe('GET /api/auth/google', () => {
    it('should return 503 when Google SSO is not configured', async () => {
      vi.mocked(isGoogleConfigured).mockReturnValue(false);

      const res = await request(app).get('/api/auth/google');
      expect(res.status).toBe(503);
      expect(res.body.error.code).toBe('SSO_NOT_CONFIGURED');
    });
  });
});
