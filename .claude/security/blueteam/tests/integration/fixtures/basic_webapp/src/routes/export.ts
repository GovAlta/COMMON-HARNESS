import { Router } from 'express';
import { authenticateToken, requireAdmin } from '../auth/middleware';
import path from 'path';
import fs from 'fs';

export const exportRouter = Router();

// F-V12-01: Path traversal — the filename query parameter is joined to the
// exports/ base path using path.join(), which does NOT strip ../ sequences.
// An attacker can supply filename=../../../../etc/passwd to read arbitrary
// files on the server that the Node.js process has read access to.
// Example: GET /api/export/file?filename=../../../src/config/index.ts
//   → returns the config file containing the hardcoded JWT secret.
//
// F-V12-02: No file type or extension validation — any file extension is served,
// including .ts, .js, .env, .db, and binary files. A type allowlist (e.g. only
// .csv and .xlsx) should be enforced before path resolution.
exportRouter.get('/file', authenticateToken, requireAdmin, (req, res) => {
  const { filename } = req.query;
  if (!filename) return res.status(400).json({ error: 'filename parameter required' });

  // F-V12-01: path.join does not prevent traversal with ../
  // A safe implementation would use path.resolve() + check that the result
  // starts with the intended base directory after resolution.
  const filePath = path.join('./exports', filename as string);

  // F-V12-02: No extension/type check — any file type served
  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: 'File not found' });
  }

  res.sendFile(path.resolve(filePath));
});
