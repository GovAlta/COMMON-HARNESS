import { pool } from '../config/database';

export interface ContactInquiryRecord {
  pk_contact_inquiry: string;
  inquiry_name: string;
  inquiry_email: string;
  inquiry_subject: string | null;
  inquiry_message: string;
  inquiry_ip_address: string | null;
  inquiry_user_agent: string | null;
  inquiry_status: 'new' | 'in_progress' | 'resolved' | 'spam';
  handled_by: string | null;
  handled_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

export async function create(data: {
  name: string;
  email: string;
  subject: string | null;
  message: string;
  ipAddress: string | null;
  userAgent: string | null;
}): Promise<ContactInquiryRecord> {
  const result = await pool.query<ContactInquiryRecord>(
    `INSERT INTO contact_inquiry (
       inquiry_name, inquiry_email, inquiry_subject, inquiry_message,
       inquiry_ip_address, inquiry_user_agent
     ) VALUES ($1, $2, $3, $4, $5::inet, $6)
     RETURNING *`,
    [
      data.name,
      data.email.toLowerCase().trim(),
      data.subject,
      data.message,
      data.ipAddress,
      data.userAgent,
    ]
  );
  return result.rows[0];
}

export async function listAll(opts: {
  page: number;
  limit: number;
  status?: string;
}): Promise<{ items: ContactInquiryRecord[]; total: number }> {
  const where: string[] = [];
  const params: unknown[] = [];
  if (opts.status) {
    params.push(opts.status);
    where.push(`inquiry_status = $${params.length}`);
  }
  const offset = (opts.page - 1) * opts.limit;
  params.push(opts.limit, offset);

  const sql = `
    SELECT *, COUNT(*) OVER() AS _total_count
    FROM contact_inquiry
    ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
    ORDER BY created_at DESC
    LIMIT $${params.length - 1} OFFSET $${params.length}
  `;
  const result = await pool.query<ContactInquiryRecord & { _total_count: string }>(sql, params);
  const total = result.rows.length > 0 ? parseInt(result.rows[0]._total_count, 10) : 0;
  const items = result.rows.map((row) => {
    const { _total_count: _t, ...rest } = row;
    return rest as ContactInquiryRecord;
  });
  return { items, total };
}
