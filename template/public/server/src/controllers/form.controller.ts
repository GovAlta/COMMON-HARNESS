import { Request, Response } from 'express';
import * as formService from '../services/form.service';
import { sendSuccess, sendPaginated } from '../utils/response';

/**
 * GET /api/forms/published
 * List published form definitions (metadata only, no schema), paginated.
 * Public endpoint.
 */
export async function listPublishedForms(req: Request, res: Response): Promise<void> {
  const { page, limit } = req.query as Record<string, any>;

  const result = await formService.listPublished(
    Number(page) || 1,
    Number(limit) || 20
  );

  // Strip schema from response — return metadata only
  const metadata = result.data.map((f) => ({
    pk_form_definition: f.pk_form_definition,
    form_name: f.form_name,
    form_description: f.form_description,
    form_version_number: f.form_version_number,
    is_published: f.is_published,
  }));

  sendPaginated(res, metadata, result.pagination);
}

/**
 * GET /api/forms/:id/schema
 * Get full JSON Schema for form rendering.
 * Requires authentication.
 */
export async function getFormSchema(req: Request, res: Response): Promise<void> {
  const id = req.params.id as string;
  const form = await formService.getSchema(id);
  sendSuccess(res, form);
}

/**
 * POST /api/forms/:id/submissions
 * Submit a form with validated data.
 * Requires authentication + CSRF.
 */
export async function submitForm(req: Request, res: Response): Promise<void> {
  const formId = req.params.id as string;
  const userId = req.user!.id;
  const { data, fileIds } = req.body;

  const result = await formService.submitForm(formId, userId, data || {}, fileIds || []);

  sendSuccess(res, {
    submission: result.submission,
    referenceNumber: result.referenceNumber,
  }, 201);
}

/**
 * POST /api/forms/:id/drafts
 * Save form data as a draft.
 * Requires authentication + CSRF.
 */
export async function saveDraft(req: Request, res: Response): Promise<void> {
  const formId = req.params.id as string;
  const userId = req.user!.id;
  const { data } = req.body;

  const result = await formService.saveDraft(formId, userId, data || {});

  sendSuccess(res, result, 201);
}

/**
 * PUT /api/submissions/:id/draft
 * Update an existing draft's data.
 * Requires authentication + CSRF.
 */
export async function updateDraft(req: Request, res: Response): Promise<void> {
  const submissionId = req.params.id as string;
  const userId = req.user!.id;
  const { data } = req.body;

  await formService.updateDraft(submissionId, userId, data || {});

  sendSuccess(res, { message: 'Draft updated' });
}

/**
 * POST /api/submissions/:id/submit
 * Submit a previously saved draft.
 * Requires authentication + CSRF.
 */
export async function submitDraft(req: Request, res: Response): Promise<void> {
  const submissionId = req.params.id as string;
  const userId = req.user!.id;

  const result = await formService.submitDraft(submissionId, userId);

  sendSuccess(res, result);
}

/**
 * POST /api/submissions/:id/retract
 * Retract a submitted submission.
 * Requires authentication + CSRF.
 */
export async function retractSubmission(req: Request, res: Response): Promise<void> {
  const submissionId = req.params.id as string;
  const userId = req.user!.id;

  await formService.retractSubmission(submissionId, userId);

  sendSuccess(res, { message: 'Submission retracted' });
}

/**
 * GET /api/submissions
 * List current user's submissions (paginated).
 * Requires authentication.
 */
export async function listSubmissions(req: Request, res: Response): Promise<void> {
  const userId = req.user!.id;
  const { page, limit } = req.query as Record<string, any>;

  const result = await formService.listUserSubmissions(userId, Number(page), Number(limit));

  sendPaginated(res, result.data, result.pagination);
}

/**
 * GET /api/submissions/:id
 * Get submission detail (own submissions only).
 * Returns the {submission, form, attachments} triple — same shape as the
 * admin detail endpoint — so the client can reuse a single render component.
 * Requires authentication.
 */
export async function getSubmission(req: Request, res: Response): Promise<void> {
  const submissionId = req.params.id as string;
  const userId = req.user!.id;

  const detail = await formService.getSubmissionDetail(submissionId, userId);

  sendSuccess(res, detail);
}
