CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL UNIQUE,
  email TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  password_hash_legacy TEXT,           -- F-V2-02: stores MD5 hash for legacy login
  role TEXT NOT NULL DEFAULT 'user',   -- values: 'user', 'admin'
  failed_attempts INTEGER DEFAULT 0,  -- tracked in schema but never incremented (F-V2-01)
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS employees (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  phone TEXT,
  department TEXT,
  employee_id TEXT UNIQUE NOT NULL,
  manager_id INTEGER REFERENCES employees(id),
  salary DECIMAL(10,2),               -- Protected A: compensation data
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  action TEXT NOT NULL,
  user_id INTEGER,
  resource_type TEXT,
  resource_id INTEGER,
  timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
  details TEXT
);
