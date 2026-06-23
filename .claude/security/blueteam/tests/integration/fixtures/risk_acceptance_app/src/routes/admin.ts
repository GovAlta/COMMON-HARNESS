import { Router, Request, Response } from 'express'
import { verifyToken } from '../auth/middleware'
import { getDb } from '../db/queries'

const router = Router()

router.use(verifyToken)

// PUT /api/admin/users/:id — update a user's role.
// Server-side input validation on 'role' is pending Sprint 14 (RA-003 PENDING).
// Admin-only: requires Enterprise IdP JWT; database audit log captures all role changes.
//
// RISK_ACCEPTED: RA-003
router.put('/users/:id', (req: Request, res: Response) => {
  const { id } = req.params
  const { role } = req.body
  // No input validation on 'role' field; RA-003 is PENDING — treated as active finding.
  const db = getDb()
  db.prepare('UPDATE users SET role = ? WHERE id = ?').run(role, id)
  return res.json({ success: true })
})

router.get('/stats', (_req: Request, res: Response) => {
  const db = getDb()
  const count = db.prepare('SELECT COUNT(*) as count FROM users').get() as { count: number }
  return res.json({ userCount: count.count })
})

export { router as adminRouter }
