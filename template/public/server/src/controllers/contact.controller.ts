import { Request, Response } from 'express';
import * as contactModel from '../models/contact.model';
import { sendSuccess } from '../utils/response';
import { logAuditEvent } from '../utils/audit-logger';

/**
 * POST /api/contact
 * Public — anyone can submit a contact inquiry. No auth, but rate-limited by
 * the global apiRateLimiter and protected by CSRF (handled at the mount).
 */
export async function submit(req: Request, res: Response): Promise<void> {
  const { name, email, subject, message } = req.body;

  const ipAddress = req.ip || null;
  const userAgent = (req.headers['user-agent'] as string) || null;

  const inquiry = await contactModel.create({
    name,
    email,
    subject: subject ?? null,
    message,
    ipAddress,
    userAgent,
  });

  // Audit anonymous inquiries with userId null so an admin can correlate
  // spam waves by IP/user-agent later.
  await logAuditEvent({
    action: 'INSERT',
    tableName: 'contact_inquiry',
    recordId: inquiry.pk_contact_inquiry,
    userId: req.user?.id,
    ipAddress,
    userAgent,
    newData: { name, email, subject: subject || null },
    metadata: { source: 'public_contact_form' },
  });

  // Don't echo the IP / handler fields back to the client; they're metadata.
  sendSuccess(
    res,
    {
      pk_contact_inquiry: inquiry.pk_contact_inquiry,
      created_at: inquiry.created_at,
    },
    201
  );
}
