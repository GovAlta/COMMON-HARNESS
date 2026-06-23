import { Request, Response, NextFunction } from 'express';

export function securityHeaders(req: Request, res: Response, next: NextFunction) {
  // P-V14-01: X-Frame-Options prevents clickjacking by disallowing iframe embedding
  res.setHeader('X-Frame-Options', 'DENY');

  // P-V14-01: X-Content-Type-Options prevents MIME-type sniffing attacks
  res.setHeader('X-Content-Type-Options', 'nosniff');

  // Legacy XSS protection header — kept for older browser compatibility
  res.setHeader('X-XSS-Protection', '1; mode=block');

  // F-V9-02: HSTS not set — required for all HTTPS deployments to prevent
  // protocol downgrade attacks and SSL-stripping. Must be added before launch.
  // Missing: res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');

  // F-V14-02: CSP not set here — also disabled in helmet config in src/app.ts.
  // A Content Security Policy is required to mitigate XSS impact.
  // Missing: res.setHeader('Content-Security-Policy', "default-src 'self'");

  next();
}
