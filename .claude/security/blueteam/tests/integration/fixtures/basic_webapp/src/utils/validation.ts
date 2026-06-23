import { body, param, query } from 'express-validator';

// P-V5-02: Validation rules are defined here for both search and employee update.
// These rules are applied in employees PUT /:id (see src/routes/employees.ts).
//
// IMPORTANT: validateSearchQuery is defined here but is deliberately NOT imported
// or applied in src/routes/search.ts. This makes F-V5-01 (SQL injection) and
// F-V5-02 (no input length limit) visible for assessment purposes. The existence
// of this file demonstrates the controls are known and available — the failure
// is in non-application, not in non-existence.

export const validateSearchQuery = [
  query('q').isString().trim().isLength({ min: 1, max: 100 }),
  query('department').optional().isString().trim().isLength({ max: 50 }),
];

export const validateEmployeeUpdate = [
  param('id').isInt({ min: 1 }),
  body('email').optional().isEmail().normalizeEmail(),
  body('phone').optional().isMobilePhone('any'),
  body('department').optional().isString().trim().isLength({ max: 100 }),
];
