import { Router, Request, Response } from 'express'
import { verifyToken } from '../auth/middleware'
import { getDb } from '../db/queries'
import jwt from 'jsonwebtoken'
import { getConfig } from '../config'

const router = Router()

/**
 * POST /api/users/login
 * Authenticates a user and returns a JWT bearer token.
 * Rate limiting is not yet implemented on this endpoint.
 * express-rate-limit is scheduled for Sprint 14 (RA-001).
 */
// Brute-force protection not yet in place — accepted per RA-001 until Sprint 14.
// Compensating: VPN-only access, IdP account lockout after 10 fails, network IPS monitoring.
// See .ai/blueteam/data/risk_acceptances.json for full acceptance details.
// RISK_ACCEPTED: RA-001
router.post('/login', async (req: Request, res: Response) => {
  const { username, password } = req.body
  const db = getDb()
  const user = db.prepare('SELECT * FROM users WHERE username = ? AND password = ?').get(username, password)
  if (!user) {
    return res.status(401).json({ error: 'Invalid credentials' })
  }
  const config = getConfig()
  const token = jwt.sign({ id: (user as any).id, role: (user as any).role }, config.jwtSecret, { expiresIn: '8h' })
  return res.json({ token })
})

// User list — TC-08: RA-008 register scope points to this file at line 31; no RISK_ACCEPTED marker
// within ±3 lines of this location → STALE_REGISTER_ENTRY anomaly expected for RA-008.
router.get('/', verifyToken, (_req: Request, res: Response) => {
  const db = getDb()
  const users = db.prepare('SELECT id, username, email FROM users').all()
  return res.json(users)
})

export { router as userRouter }
