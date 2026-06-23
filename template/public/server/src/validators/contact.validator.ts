import { z } from 'zod';

/**
 * Zod schemas for the public /api/contact endpoint.
 *
 * Conservative max lengths keep payloads small; longer is rarely legitimate
 * for a contact inquiry and accepting unbounded text invites abuse.
 */
export const submitContactSchema = {
  body: z.object({
    name: z.string().trim().min(1, 'Name is required').max(255),
    email: z
      .string()
      .trim()
      .toLowerCase()
      .email('A valid email address is required')
      .max(320),
    subject: z.string().trim().max(300).optional().or(z.literal('')),
    message: z.string().trim().min(1, 'Message is required').max(5000),
  }),
};
