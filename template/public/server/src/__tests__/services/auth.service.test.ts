import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock database
vi.mock('../../config/database', () => ({
  pool: {
    query: vi.fn(),
    connect: vi.fn(),
    end: vi.fn(),
  },
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

import * as authService from '../../services/auth.service';
import * as userModel from '../../models/user.model';
import * as refreshTokenModel from '../../models/refresh-token.model';
import { hashToken, verifyAccessToken, signRefreshToken } from '../../utils/token';
import type { SSOProfile, UserRecord } from '../../types/auth';

const mockUser: UserRecord = {
  pk_user_account: 'user-123',
  user_email_address: 'test@example.com',
  user_display_name: 'Test User',
  sso_provider_name: 'google',
  sso_provider_id: 'google-123',
  google_id: 'google-123',
  microsoft_id: null,
  user_role_name: 'user',
  avatar_url: null,
  is_active: true,
  last_login_at: null,
  created_at: '2024-01-01T00:00:00Z',
  updated_at: '2024-01-01T00:00:00Z',
  created_by: null,
  updated_by: null,
  deleted_at: null,
  is_deleted: false,
};

describe('Auth Service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('findOrCreateUser', () => {
    const profile: SSOProfile = {
      provider: 'google',
      providerId: 'google-123',
      email: 'test@example.com',
      displayName: 'Test User',
      avatarUrl: 'https://example.com/avatar.jpg',
    };

    it('should return existing user found by provider ID', async () => {
      vi.mocked(userModel.findByProviderId).mockResolvedValue(mockUser);
      vi.mocked(userModel.updateUser).mockResolvedValue(mockUser);
      vi.mocked(userModel.findById).mockResolvedValue(mockUser);

      const result = await authService.findOrCreateUser(profile);

      expect(userModel.findByProviderId).toHaveBeenCalledWith('google', 'google-123');
      expect(result.pk_user_account).toBe('user-123');
    });

    it('should link account when found by email but different provider', async () => {
      vi.mocked(userModel.findByProviderId).mockResolvedValue(null);
      vi.mocked(userModel.findByEmail).mockResolvedValue(mockUser);
      vi.mocked(userModel.updateUser).mockResolvedValue(mockUser);
      vi.mocked(userModel.findById).mockResolvedValue(mockUser);

      const result = await authService.findOrCreateUser(profile);

      expect(userModel.findByEmail).toHaveBeenCalledWith('test@example.com');
      expect(userModel.updateUser).toHaveBeenCalled();
      expect(result.pk_user_account).toBe('user-123');
    });

    it('should create new user when no existing user found', async () => {
      vi.mocked(userModel.findByProviderId).mockResolvedValue(null);
      vi.mocked(userModel.findByEmail).mockResolvedValue(null);
      vi.mocked(userModel.createUser).mockResolvedValue(mockUser);

      const result = await authService.findOrCreateUser(profile);

      expect(userModel.createUser).toHaveBeenCalledWith(profile);
      expect(result.pk_user_account).toBe('user-123');
    });
  });

  describe('createTokens', () => {
    it('should return access and refresh tokens', async () => {
      vi.mocked(refreshTokenModel.create).mockResolvedValue({
        pk_refresh_token: 'rt-1',
        fk_refresh_token_user_account: 'user-123',
        token_hash_value: 'hash',
        token_expires_at: new Date(Date.now() + 86400000).toISOString(),
        token_revoked_at: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });

      const result = await authService.createTokens(mockUser);

      expect(result.accessToken).toBeDefined();
      expect(result.refreshToken).toBeDefined();
      expect(typeof result.accessToken).toBe('string');
      expect(typeof result.refreshToken).toBe('string');

      // Verify the access token is valid
      const decoded = verifyAccessToken(result.accessToken);
      expect(decoded.sub).toBe('user-123');
      expect(decoded.email).toBe('test@example.com');
      expect(decoded.role).toBe('user');

      // Verify refresh token was stored in DB
      expect(refreshTokenModel.create).toHaveBeenCalledWith(
        'user-123',
        expect.any(String),
        expect.any(Date)
      );
    });
  });

  describe('refreshAccessToken', () => {
    it('should issue new access token with valid refresh token', async () => {
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

      vi.mocked(userModel.findById).mockResolvedValue(mockUser);

      const result = await authService.refreshAccessToken(refreshToken);

      expect(result.accessToken).toBeDefined();
      expect(result.user.pk_user_account).toBe('user-123');
    });

    it('should throw when refresh token not found in DB', async () => {
      const refreshToken = signRefreshToken('user-123');
      vi.mocked(refreshTokenModel.findByHash).mockResolvedValue(null);

      await expect(authService.refreshAccessToken(refreshToken))
        .rejects.toThrow('Refresh token not found or revoked');
    });

    it('should throw when user is inactive', async () => {
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
        ...mockUser,
        is_active: false,
      });

      await expect(authService.refreshAccessToken(refreshToken))
        .rejects.toThrow('User not found or inactive');
    });
  });

  describe('revokeRefreshToken', () => {
    it('should revoke a token by hash', async () => {
      vi.mocked(refreshTokenModel.revoke).mockResolvedValue(undefined);

      await authService.revokeRefreshToken('some-token-value');

      const expectedHash = hashToken('some-token-value');
      expect(refreshTokenModel.revoke).toHaveBeenCalledWith(expectedHash);
    });
  });

  describe('revokeAllUserTokens', () => {
    it('should revoke all tokens for a user', async () => {
      vi.mocked(refreshTokenModel.revokeAllForUser).mockResolvedValue(undefined);

      await authService.revokeAllUserTokens('user-123');

      expect(refreshTokenModel.revokeAllForUser).toHaveBeenCalledWith('user-123');
    });
  });
});
