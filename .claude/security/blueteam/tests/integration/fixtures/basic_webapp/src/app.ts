// F-V13-01: No API versioning — all routes should be prefixed /api/v1/
// Current routes use /api/* without a version segment, making future breaking
// changes impossible to deploy alongside the current API.

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { securityHeaders } from './middleware/security';
import { authRouter } from './routes/auth';
import { employeeRouter } from './routes/employees';
import { adminRouter } from './routes/admin';
import { searchRouter } from './routes/search';
import { exportRouter } from './routes/export';
import { reportsRouter } from './routes/reports';

export const app = express();

// F-V9-01: CORS wildcard permits any origin — must be restricted to known organizational domains
app.use(cors({ origin: '*' }));

// P-V14-02: helmet() applied globally for baseline security headers
// F-V14-02: CSP disabled — must be re-enabled with proper directives before production
app.use(helmet({ contentSecurityPolicy: false }));

// F-V13-02: body limit too permissive; recommend ≤100kb for a directory API
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Custom security headers (X-Frame-Options, X-Content-Type-Options)
app.use(securityHeaders);

// Routes
app.use('/api/auth', authRouter);
app.use('/api/employees', employeeRouter);
app.use('/api/admin', adminRouter);
app.use('/api/search', searchRouter);
app.use('/api/export', exportRouter);
app.use('/api/reports', reportsRouter);

// Health check — unauthenticated, returns minimal info
app.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});
