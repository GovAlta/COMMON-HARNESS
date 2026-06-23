import bcrypt from 'bcrypt';
import crypto from 'crypto';

// P-V2-01: Proper bcrypt cost factor — SALT_ROUNDS=12 meets minimum requirements.
// bcrypt with 12 rounds provides adequate resistance to offline brute-force attacks.
const SALT_ROUNDS = 12;

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, SALT_ROUNDS);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

// F-V2-02: Legacy MD5 hashing — MD5 is a fast, cryptographically broken hash
// function wholly unsuitable for password storage. It provides no meaningful
// resistance to GPU-accelerated cracking. Legacy users must be migrated to bcrypt.
export function legacyHashPassword(password: string): string {
  return crypto.createHash('md5').update(password).digest('hex');
}

export function verifyLegacyPassword(password: string, legacyHash: string): boolean {
  return legacyHashPassword(password) === legacyHash;
}
