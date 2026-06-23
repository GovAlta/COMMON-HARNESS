import { Router } from 'express';
import { body, param, validationResult } from 'express-validator';
import { authenticateToken } from '../auth/middleware';
import { getAllEmployees, getEmployeeById, updateEmployee } from '../db/queries';
import { logger } from '../utils/logger';

export const employeeRouter = Router();

// F-V11-02: getAllEmployees() has no LIMIT — returns every row in the employees
// table. A single authenticated request extracts the entire Protected A dataset.
// Pagination (limit/offset query params) must be implemented.
employeeRouter.get('/', authenticateToken, (_req, res) => {
  const employees = getAllEmployees();
  res.json(employees);
});

// F-V4-02: IDOR — any authenticated user can retrieve any employee's full record
// (including salary) by supplying an arbitrary integer ID. There is no check that
// req.user.id corresponds to the requested employee, nor is admin role required.
// Example exploit: GET /api/employees/1 by a junior staff member returns the
// CEO's salary and contact details.
employeeRouter.get(
  '/:id',
  authenticateToken,
  [param('id').isInt({ min: 1 })],
  (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const employee = getEmployeeById(parseInt(req.params.id)) as any;
    if (!employee) return res.status(404).json({ error: 'Employee not found' });

    // F-V8-01: Full employee record including salary field passed to JSON.stringify
    // and written to the application log. This causes Protected A data (compensation
    // information) to appear in log files, log aggregators, and potentially SIEMs
    // where it should not be retained.
    logger.info(`Employee record accessed: ${JSON.stringify(employee)}`);

    res.json(employee);
  }
);

// P-V4-02: Ownership enforced — users can only update their own record.
// Admin role bypasses the ownership check to allow HR/admin operations.
// P-V5-03: express-validator rules applied to all mutable fields.
employeeRouter.put(
  '/:id',
  authenticateToken,
  [
    param('id').isInt({ min: 1 }),
    body('email').optional().isEmail().normalizeEmail(),
    body('phone').optional().isMobilePhone('any'),
    body('department').optional().isString().trim().isLength({ max: 100 }),
  ],
  (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const targetId = parseInt(req.params.id);

    // P-V4-02: Enforce ownership — non-admins may only update their own record
    if (req.user.id !== targetId && req.user.role !== 'admin') {
      return res.status(403).json({ error: "Cannot modify another employee's record" });
    }

    const { email, phone, department } = req.body;
    updateEmployee(targetId, email, phone, department);

    logger.info('Employee updated', { updatedBy: req.user.id, targetId });
    res.json({ success: true });
  }
);
