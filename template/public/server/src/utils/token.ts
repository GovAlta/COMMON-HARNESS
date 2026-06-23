import jwt, { type SignOptions, type VerifyOptions } from 'jsonwebtoken';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import type { JwtPayload } from '../types/auth';
import { env } from '../config/environment';

// RSA key loading for RS256 asymmetric signing
// In production, keys should be injected via Azure Key Vault or mounted secrets.
// For development, keys are generated in server/keys/ via: node -e "..."
const KEYS_DIR = path.resolve(__dirname, '..', '..', 'keys');

function loadKey(filename: string): string {
  const keyPath = path.join(KEYS_DIR, filename);
  if (fs.existsSync(keyPath)) {
    return fs.readFileSync(keyPath, 'utf-8');
  }
  // Fallback to env var (for production deployment via Key Vault)
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

const JWT_ISSUER = 'app-template';
const JWT_AUDIENCE = 'app-template-api';

const JWT_ACCESS_EXPIRES_SECONDS = 15 * 60;
const JWT_REFRESH_EXPIRES_SECONDS = 7 * 24 * 60 * 60;

export function signAccessToken(payload: JwtPayload): string {
  const options: SignOptions = {
    expiresIn: JWT_ACCESS_EXPIRES_SECONDS,
    algorithm: 'RS256',
    issuer: JWT_ISSUER,
    audience: JWT_AUDIENCE,
  };
  return jwt.sign(
    { sub: payload.sub, email: payload.email, role: payload.role },
    JWT_PRIVATE_KEY,
    options
  );
}

export function signRefreshToken(userId: string): string {
  const options: SignOptions = {
    expiresIn: JWT_REFRESH_EXPIRES_SECONDS,
    algorithm: 'RS256',
    issuer: JWT_ISSUER,
    audience: JWT_AUDIENCE,
  };
  return jwt.sign(
    { sub: userId, type: 'refresh' },
    JWT_REFRESH_PRIVATE_KEY,
    options
  );
}

export function verifyAccessToken(token: string): JwtPayload {
  const decoded = jwt.verify(token, JWT_PUBLIC_KEY, {
    algorithms: ['RS256'],
    issuer: JWT_ISSUER,
    audience: JWT_AUDIENCE,
  }) as JwtPayload;
  return decoded;
}

export function verifyRefreshToken(token: string): { sub: string; type: string } {
  const decoded = jwt.verify(token, JWT_REFRESH_PUBLIC_KEY, {
    algorithms: ['RS256'],
    issuer: JWT_ISSUER,
    audience: JWT_AUDIENCE,
  }) as { sub: string; type: string };
  return decoded;
}

export function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export function generateRandomToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

export function generateCsrfToken(sessionId?: string): string {
  const timestamp = Date.now().toString();
  const id = sessionId || crypto.randomBytes(16).toString('hex');
  const signature = crypto.createHmac('sha256', env.CSRF_SECRET).update(id + timestamp).digest('hex');
  return `${signature}.${timestamp}`;
}
