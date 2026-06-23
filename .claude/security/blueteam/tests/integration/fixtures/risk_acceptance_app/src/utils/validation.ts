// Input validation utilities
// This module provides sanitization and validation helpers.
//
// TC-09: RA-006 STALE_REGISTER_ENTRY — register entry points to this file at line 12,
// but there is NO RISK_ACCEPTED marker here. The finding was remediated in Sprint 12
// but the register entry was never set to 'withdrawn'. Expected anomaly: STALE_REGISTER_ENTRY.
//
// Previously: sanitizeInput did not strip HTML tags (FINDING-INPUT-01, ASVS V5.1.1).
// Remediated in Sprint 12 — now strips HTML and trims whitespace. RA-006 in
// risk_acceptances.json should have been set to 'withdrawn' but was not.
//
export function sanitizeInput(input: string): string {
  // Proper sanitization now implemented — strips HTML tags and trims whitespace
  return input.replace(/<[^>]*>/g, '').trim()
}

export function validateEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  return emailRegex.test(email)
}

export function validateRole(role: string): boolean {
  const allowedRoles = ['user', 'admin', 'readonly']
  return allowedRoles.includes(role)
}

export function validatePaginationParams(page: unknown, limit: unknown): { page: number; limit: number } {
  const parsedPage = Math.max(1, parseInt(String(page)) || 1)
  const parsedLimit = Math.min(Math.max(1, parseInt(String(limit)) || 20), 100)
  return { page: parsedPage, limit: parsedLimit }
}
