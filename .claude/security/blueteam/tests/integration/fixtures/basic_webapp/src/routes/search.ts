import { Router } from 'express';
import { authenticateToken } from '../auth/middleware';
import { getDb } from '../db/queries';

export const searchRouter = Router();

// F-V5-01: SQL injection via string concatenation — user-supplied `q` and
// `department` parameters are interpolated directly into the SQL string.
// Example exploits:
//   GET /api/search?q=' OR '1'='1     → dumps all employees
//   GET /api/search?q=a' UNION SELECT username,password_hash,email,id,role,'' FROM users--
//     → extracts bcrypt hashes from the users table
//
// F-V5-02: No input length limit on q — an arbitrarily long string is accepted,
// enabling denial-of-service via expensive LIKE operations on large inputs.
//
// Note: validateSearchQuery is defined in src/utils/validation.ts but is
// deliberately NOT imported or applied here, making F-V5-01 and F-V5-02 visible.
searchRouter.get('/', authenticateToken, (req, res) => {
  const { q, department } = req.query;
  if (!q) return res.status(400).json({ error: 'Search query required' });

  const db = getDb();

  // F-V5-01: Direct string interpolation — SQL injection possible
  // e.g. q = "' OR '1'='1" dumps all records
  let sql = `SELECT id, name, email, department, employee_id FROM employees WHERE name LIKE '%${q}%'`;

  if (department) {
    // Second injection point in the same query
    sql += ` AND department = '${department}'`;
  }

  try {
    const results = db.prepare(sql).all();
    res.json(results);
  } catch (err: any) {
    // F-V7-02: DB error (e.g. syntax error from a malformed injection attempt)
    // returned verbatim, leaking query structure to the attacker
    res.status(500).json({ error: err.message });
  }
});
