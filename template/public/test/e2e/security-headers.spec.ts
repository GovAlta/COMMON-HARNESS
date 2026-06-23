import { test, expect } from '@playwright/test';

/**
 * Security-headers E2E. Covers NFR-SEC-005 (rate limit), NFR-SEC-008 (HTTPS + HSTS + CSP).
 */

test.describe('NFR-SEC-008 HTTPS + HSTS + CSP + security headers', () => {
  test('NFR-SEC-008.1 GET /centres has HSTS + CSP + nosniff + X-Frame-Options', async ({ request }) => {
    const res = await request.get('/centres');
    const headers = res.headers();
    // Note: HSTS only applies on https — skip the check on http
    if (res.url().startsWith('https://')) {
      expect(headers['strict-transport-security']).toMatch(/max-age=\d+/);
    }
    expect(headers['x-content-type-options']).toBe('nosniff');
    expect(headers['x-frame-options']).toMatch(/DENY|SAMEORIGIN/i);
    expect(headers['content-security-policy'] || headers['content-security-policy-report-only']).toBeTruthy();
  });
});

test.describe('NFR-SEC-005 rate limiting', () => {
  test.skip(true, 'Rate-limit verification requires sustained load; run manually per app/test/manual/05-rbac-csrf-rate-limit.md step 7 against the deployed app.');

  // Skipped in CI; the manual script covers this verification because the threshold is 200 req per 15 min
  // and burning that in CI on every PR is wasteful. We trust the middleware's unit tests for the math.
});
