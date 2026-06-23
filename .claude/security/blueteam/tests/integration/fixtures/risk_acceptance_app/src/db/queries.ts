import Database from 'better-sqlite3'
import path from 'path'

let db: Database.Database | null = null

export function getDb(): Database.Database {
  if (!db) {
    db = new Database(path.join(__dirname, '../../data/app.db'))
    db.exec('CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT NOT NULL UNIQUE, password TEXT NOT NULL, email TEXT, role TEXT DEFAULT \'user\');')
    db.exec('CREATE TABLE IF NOT EXISTS reports (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT, content TEXT, author_id INTEGER, created_at TEXT DEFAULT CURRENT_TIMESTAMP);')
  }
  return db
}

// Search users — admin-only function
// Wildcard LIKE query accepted for search performance and scope (admin-only).
// API gateway caps input at 50 chars; SQLite has a 1-second query timeout.
// Compensating controls documented in .ai/blueteam/data/risk_acceptances.json (RA-004).
// Review date: 2027-01-10 | Accepted by: Bob Lead
//
// Finding: FINDING-QUERY-02 (ASVS V5.3.4) — LIKE wildcard susceptible to ReDoS
// Severity at acceptance: high
// RISK_ACCEPTED: RA-004
export function searchUsers(term: string): unknown[] {
  const database = getDb()
  // Wildcard LIKE query — susceptible to ReDoS on pathological inputs; RA-004 accepted.
  return database.prepare('SELECT id, username, email FROM users WHERE username LIKE ?').all(`%${term}%`)
}

export function runReport(limit: number, offset: number): unknown[] {
  const database = getDb()
  return database.prepare('SELECT * FROM reports ORDER BY created_at DESC LIMIT ? OFFSET ?').all(limit, offset)
}
