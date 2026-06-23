import * as userModel from '../models/user.model';
import * as refreshTokenModel from '../models/refresh-token.model';
import { signAccessToken, signRefreshToken, verifyRefreshToken, hashToken } from '../utils/token';
import { AppError } from '../utils/app-error';
import type { SSOProfile, JwtPayload, UserRecord } from '../types/auth';

/**
 * Find or create a user from an SSO profile.
 * If a user exists with the same email, link the new provider.
 * If the user doesn't exist, create a new account.
 */
export async function findOrCreateUser(profile: SSOProfile): Promise<UserRecord> {
  // Normalize email to lowercase to prevent case-sensitive duplicates across SSO providers
  profile.email = profile.email.toLowerCase().trim();

  // First, check by provider-specific ID
  const existingByProvider = await userModel.findByProviderId(profile.provider, profile.providerId);
  if (existingByProvider) {
    // Update last login and return
    await userModel.updateUser(existingByProvider.pk_user_account, profile);
    const updated = await userModel.findById(existingByProvider.pk_user_account);
    return updated!;
  }

  // Check by email (link accounts across providers)
  const existingByEmail = await userModel.findByEmail(profile.email);
  if (existingByEmail) {
    // Link the new provider to existing account
    await userModel.updateUser(existingByEmail.pk_user_account, profile);
    const updated = await userModel.findById(existingByEmail.pk_user_account);
    return updated!;
  }

  // Create new user
  return userModel.createUser(profile);
}

/**
 * Create access and refresh tokens for a user.
 * Returns { accessToken, refreshToken } and stores the refresh token hash in the database.
 */
export async function createTokens(user: UserRecord): Promise<{
  accessToken: string;
  refreshToken: string;
}> {
  const payload: JwtPayload = {
    sub: user.pk_user_account,
    email: user.user_email_address,
    role: user.user_role_name,
  };

  const accessToken = signAccessToken(payload);
  const refreshToken = signRefreshToken(user.pk_user_account);

  // Hash and store the refresh token
  const tokenHash = hashToken(refreshToken);
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days
  await refreshTokenModel.create(user.pk_user_account, tokenHash, expiresAt);

  return { accessToken, refreshToken };
}

/**
 * Refresh an access token using a refresh token.
 * Validates the refresh token, checks the hash in the database, and issues a new access token.
 */
export async function refreshAccessToken(refreshToken: string): Promise<{
  accessToken: string;
  newRefreshToken: string;
  user: UserRecord;
}> {
  // Verify the JWT signature
  let decoded: { sub: string; type: string };
  try {
    decoded = verifyRefreshToken(refreshToken);
  } catch {
    throw AppError.unauthorized('Invalid refresh token');
  }

  if (decoded.type !== 'refresh') {
    throw AppError.unauthorized('Invalid token type');
  }

  // Check the hash exists in DB and is not revoked
  const tokenHash = hashToken(refreshToken);
  const storedToken = await refreshTokenModel.findByHash(tokenHash);
  if (!storedToken) {
    throw AppError.unauthorized('Refresh token not found or revoked');
  }

  // Find the user
  const user = await userModel.findById(decoded.sub);
  if (!user || !user.is_active) {
    throw AppError.unauthorized('User not found or inactive');
  }

  // Rotate: revoke old refresh token and issue new one
  await refreshTokenModel.revoke(tokenHash);
  const newRefreshToken = signRefreshToken(user.pk_user_account);
  const newTokenHash = hashToken(newRefreshToken);
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days
  await refreshTokenModel.create(user.pk_user_account, newTokenHash, expiresAt);

  // Issue a new access token
  const payload: JwtPayload = {
    sub: user.pk_user_account,
    email: user.user_email_address,
    role: user.user_role_name,
  };

  const accessToken = signAccessToken(payload);
  return { accessToken, newRefreshToken, user };
}

/**
 * Revoke a refresh token by its raw value.
 */
export async function revokeRefreshToken(refreshToken: string): Promise<void> {
  const tokenHash = hashToken(refreshToken);
  await refreshTokenModel.revoke(tokenHash);
}

/**
 * Revoke all refresh tokens for a user.
 */
export async function revokeAllUserTokens(userId: string): Promise<void> {
  await refreshTokenModel.revokeAllForUser(userId);
}
