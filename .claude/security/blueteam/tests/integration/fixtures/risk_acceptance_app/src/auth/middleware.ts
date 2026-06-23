import { Request, Response, NextFunction } from 'express'
import jwt from 'jsonwebtoken'
import { getConfig } from '../config'

// RISK_ACCEPTED: RA-099
// TC-06: RA-099 has NO entry in risk_acceptances.json — UNAUTHORIZED_SUPPRESSION anomaly expected.
export function verifyToken(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers['authorization']
  const token = authHeader && authHeader.split(' ')[1]
  if (!token) {
    res.status(401).json({ error: 'No token provided' })
    return
  }
  const config = getConfig()
  try {
    const decoded = jwt.verify(token, config.jwtSecret)
    ;(req as any).user = decoded
    next()
  } catch {
    res.status(403).json({ error: 'Invalid token' })
  }
}

// RISK_ACCEPTED: RA-008
// TC-08: RA-008 register entry has scope pointing at users.ts:31 (different file).
// This marker at middleware.ts:20 is therefore OUT_OF_SCOPE for RA-008.
// Expected anomaly: OUT_OF_SCOPE_SUPPRESSION for this marker.
export function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  const user = (req as any).user
  if (!user || user.role !== 'admin') {
    res.status(403).json({ error: 'Admin access required' })
    return
  }
  next()
}
