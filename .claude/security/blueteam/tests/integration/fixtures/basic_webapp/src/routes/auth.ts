import { Router } from 'express';
import jwt from 'jsonwebtoken';
import { getDb } from '../db/queries';
import { verifyPassword, verifyLegacyPassword } from '../auth/passwords';
import { JWT_SECRET, JWT_ALGORITHM } from '../config';
import { logger } from '../utils/logger';

export const authRouter = Router();

// F-V11-01: No rate limiter applied to this endpoint — an attacker can make
// unlimited login attempts without throttling or CAPTCHA.
// F-V2-01: No account lockout — failed_attempts column exists in schema but is
// never incremented here. An attacker can brute-force credentials indefinitely.
// F-V3-02: Token generated without expiresIn — issued JWTs never expire, meaning
// a stolen token remains valid forever with no forced re-authentication.
authRouter.post('/login', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password required' });
  }

  try {
    const user = getDb()
      .prepare('SELECT * FROM users WHERE username = ?')
      .get(username) as any;

    if (!user) return res.status(401).json({ error: 'Invalid credentials' });

    const valid = await verifyPassword(password, user.password_hash);
    if (!valid) {
      // F-V2-01: failed_attempts not incremented — no lockout logic implemented
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // F-V3-02: No expiresIn option — token never expires
    const token = jwt.sign(
      { id: user.id, username: user.username, role: user.role },
      JWT_SECRET,
      { algorithm: JWT_ALGORITHM as any }
    );

    logger.info('Login successful', { userId: user.id });
    res.json({ token });
  } catch (_err) {
    // P-V7-01: Generic message — does not leak stack trace or DB internals
    res.status(500).json({ error: 'Authentication failed' });
  }
});

// F-V2-02: Legacy login endpoint — verifies against MD5 hash stored in
// password_hash_legacy column. MD5 is not suitable for password storage.
// This endpoint should be removed and remaining MD5 hashes migrated to bcrypt.
authRouter.post('/login/legacy', (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password required' });
  }

  const user = getDb()
    .prepare('SELECT * FROM users WHERE username = ?')
    .get(username) as any;

  if (!user || !verifyLegacyPassword(password, user.password_hash_legacy)) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  // Also no expiresIn here
  const token = jwt.sign(
    { id: user.id, username: user.username, role: user.role },
    JWT_SECRET
  );

  res.json({
    token,
    warning: 'Legacy authentication — please migrate to current endpoint',
  });
});

// F-V5-03: Unvalidated open redirect — the redirect query parameter is passed
// directly to res.redirect() without any validation or allowlist check.
// An attacker can craft a link like /api/auth/callback?redirect=https://evil.com
// and use it in a phishing campaign targeting organizational staff, since the link appears
// to originate from a legitimate gov.ab.ca domain.
authRouter.get('/callback', (req, res) => {
  const { redirect } = req.query;
  // No URL validation — allows redirect to external malicious sites
  res.redirect((redirect as string) || '/');
});
