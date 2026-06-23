import { Router, Request, Response } from 'express'
import { verifyToken } from '../auth/middleware'
import { runReport } from '../db/queries'

const router = Router()

router.use(verifyToken)

// Report endpoint — pagination is now implemented (RA-007 was WITHDRAWN after fix was applied)
// No RISK_ACCEPTED marker here — RA-007 is in the register with status=withdrawn.
// TC-07: verifies WITHDRAWN entries are shown in the appendix without triggering STALE anomaly.
router.get('/', (req: Request, res: Response) => {
  const page = parseInt(req.query.page as string) || 1
  const limit = Math.min(parseInt(req.query.limit as string) || 20, 100)
  const offset = (page - 1) * limit
  const rows = runReport(limit, offset)
  return res.json({ page, limit, data: rows })
})

export { router as reportRouter }
