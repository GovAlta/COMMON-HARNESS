import Database from 'better-sqlite3';
import { DB_PATH } from '../config';

let _db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (!_db) _db = new Database(DB_PATH);
  return _db;
}

// P-DB-01: All queries below use parameterized statements with ? placeholders.
// better-sqlite3 prepared statements prevent SQL injection by separating query
// structure from user-supplied data at the driver level.

export function getUserByUsername(username: string) {
  return getDb().prepare('SELECT * FROM users WHERE username = ?').get(username);
}

export function getUserById(id: number) {
  return getDb().prepare(
    'SELECT id, username, email, role FROM users WHERE id = ?'
  ).get(id);
}

export function getEmployeeById(id: number) {
  return getDb().prepare('SELECT * FROM employees WHERE id = ?').get(id);
}

export function getAllEmployees() {
  // F-V11-02 NOTE: No LIMIT applied here — called from employees GET / route
  // without pagination, returning every row in the table. On a large directory
  // this constitutes bulk Protected A data extraction in a single request.
  return getDb().prepare(
    'SELECT id, name, email, phone, department, employee_id FROM employees'
  ).all();
}

export function updateEmployee(
  id: number,
  email: string,
  phone: string,
  department: string
) {
  return getDb()
    .prepare(
      'UPDATE employees SET email = ?, phone = ?, department = ? WHERE id = ?'
    )
    .run(email, phone, department, id);
}
