import { z } from 'zod';

/**
 * Zod schemas for auth-related request validation.
 */

// Currently auth endpoints use cookies and SSO redirects,
// so there are no body params that need Zod validation.
// This file serves as a placeholder and will be extended
// if any auth endpoints accept body parameters.

export const authSchemas = {
  // Future: if we add local email/password auth
  // login: z.object({
  //   email: z.string().email(),
  //   password: z.string().min(8),
  // }),
};
