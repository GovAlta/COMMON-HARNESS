import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock dependencies
vi.mock('../../models/form.model', () => ({
  findPublished: vi.fn(),
  countPublished: vi.fn(),
  findById: vi.fn(),
  createSubmission: vi.fn(),
  createDraft: vi.fn(),
  updateSubmissionData: vi.fn(),
  updateSubmissionStatus: vi.fn(),
  findSubmissions: vi.fn(),
  countSubmissions: vi.fn(),
  findSubmission: vi.fn(),
}));

vi.mock('../../utils/audit-logger', () => ({
  logAuditEvent: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../models/file.model', () => ({
  linkToSubmission: vi.fn(),
}));

import * as formModel from '../../models/form.model';
import * as fileModel from '../../models/file.model';
import { logAuditEvent } from '../../utils/audit-logger';
import * as formService from '../../services/form.service';

const mockLogAuditEvent = logAuditEvent as ReturnType<typeof vi.fn>;

const mockFormModel = formModel as unknown as {
  findPublished: ReturnType<typeof vi.fn>;
  countPublished: ReturnType<typeof vi.fn>;
  findById: ReturnType<typeof vi.fn>;
  createSubmission: ReturnType<typeof vi.fn>;
  createDraft: ReturnType<typeof vi.fn>;
  updateSubmissionData: ReturnType<typeof vi.fn>;
  updateSubmissionStatus: ReturnType<typeof vi.fn>;
  findSubmissions: ReturnType<typeof vi.fn>;
  countSubmissions: ReturnType<typeof vi.fn>;
  findSubmission: ReturnType<typeof vi.fn>;
};

const mockFileModel = fileModel as unknown as {
  linkToSubmission: ReturnType<typeof vi.fn>;
};

const mockFormDefinition = {
  pk_form_definition: '11111111-1111-1111-1111-111111111111',
  form_name: 'Service Feedback Report',
  form_version_number: 1,
  is_published: true,
  form_schema: {
    title: 'Service Feedback Report',
    fields: [
      { name: 'description', type: 'textarea', label: 'Description', required: true },
      { name: 'severity', type: 'select', label: 'Severity', required: true, options: [
        { label: 'Low', value: 'low' },
        { label: 'High', value: 'high' },
      ]},
      { name: 'optional_notes', type: 'text', label: 'Notes', required: false },
    ],
  },
};

describe('Form Service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('listPublished', () => {
    it('should return paginated published forms', async () => {
      mockFormModel.findPublished.mockResolvedValue([mockFormDefinition]);
      mockFormModel.countPublished.mockResolvedValue(1);

      const result = await formService.listPublished(1, 20);

      expect(result.data).toHaveLength(1);
      expect(result.data[0].form_name).toBe('Service Feedback Report');
      expect(result.pagination.page).toBe(1);
      expect(result.pagination.limit).toBe(20);
      expect(result.pagination.total).toBe(1);
      expect(result.pagination.totalPages).toBe(1);
    });

    it('should calculate total pages correctly', async () => {
      mockFormModel.findPublished.mockResolvedValue([]);
      mockFormModel.countPublished.mockResolvedValue(45);

      const result = await formService.listPublished(1, 20);

      expect(result.pagination.totalPages).toBe(3);
    });
  });

  describe('getSchema', () => {
    it('should return form definition with schema', async () => {
      mockFormModel.findById.mockResolvedValue(mockFormDefinition);

      const result = await formService.getSchema(mockFormDefinition.pk_form_definition);

      expect(result.form_schema.title).toBe('Service Feedback Report');
      expect(result.form_schema.fields).toHaveLength(3);
    });

    it('should throw 404 for non-existent form', async () => {
      mockFormModel.findById.mockResolvedValue(null);

      await expect(formService.getSchema('nonexistent')).rejects.toThrow('Form not found');
    });
  });

  describe('submitForm', () => {
    it('should create a submission with valid data', async () => {
      mockFormModel.findById.mockResolvedValue(mockFormDefinition);
      mockFormModel.createSubmission.mockResolvedValue({
        pk_form_submission: 'sub-1',
        submission_reference_number: 'APP-20240101-00001',
      });

      const result = await formService.submitForm(
        mockFormDefinition.pk_form_definition,
        'user-123',
        { description: 'Smoke spotted', severity: 'high' }
      );

      expect(result.referenceNumber).toMatch(/^APP-\d{8}-\d{5}$/);
      expect(mockFormModel.createSubmission).toHaveBeenCalled();
    });

    it('should reject invalid data (missing required field)', async () => {
      mockFormModel.findById.mockResolvedValue(mockFormDefinition);

      await expect(
        formService.submitForm(
          mockFormDefinition.pk_form_definition,
          'user-123',
          { severity: 'high' } // missing required 'description'
        )
      ).rejects.toThrow('Validation failed');
    });

    it('should link file attachments to submission', async () => {
      mockFormModel.findById.mockResolvedValue(mockFormDefinition);
      mockFormModel.createSubmission.mockResolvedValue({
        pk_form_submission: 'sub-1',
        submission_reference_number: 'APP-20240101-00001',
      });
      mockFileModel.linkToSubmission.mockResolvedValue(undefined);

      await formService.submitForm(
        mockFormDefinition.pk_form_definition,
        'user-123',
        { description: 'Test', severity: 'low' },
        ['file-1', 'file-2']
      );

      expect(mockFileModel.linkToSubmission).toHaveBeenCalledWith(
        ['file-1', 'file-2'],
        'sub-1'
      );
    });

    it('should not link files when no fileIds provided', async () => {
      mockFormModel.findById.mockResolvedValue(mockFormDefinition);
      mockFormModel.createSubmission.mockResolvedValue({
        pk_form_submission: 'sub-1',
        submission_reference_number: 'APP-20240101-00001',
      });

      await formService.submitForm(
        mockFormDefinition.pk_form_definition,
        'user-123',
        { description: 'Test', severity: 'low' }
      );

      expect(mockFileModel.linkToSubmission).not.toHaveBeenCalled();
    });

    it('should throw 404 for non-existent form', async () => {
      mockFormModel.findById.mockResolvedValue(null);

      await expect(
        formService.submitForm('nonexistent', 'user-123', {})
      ).rejects.toThrow('Form not found');
    });
  });

  describe('generateReferenceNumber', () => {
    it('should generate reference number in APP-YYYYMMDD-XXXXX format', async () => {
      const refNum = await formService.generateReferenceNumber();
      expect(refNum).toMatch(/^APP-\d{8}-\d{5}$/);
    });

    it('should use current date in reference number', async () => {
      const now = new Date();
      const year = now.getFullYear();
      const month = String(now.getMonth() + 1).padStart(2, '0');
      const day = String(now.getDate()).padStart(2, '0');
      const expectedDatePart = `${year}${month}${day}`;

      const refNum = await formService.generateReferenceNumber();
      expect(refNum).toContain(expectedDatePart);
    });
  });

  describe('listUserSubmissions', () => {
    it('should return paginated submissions for user', async () => {
      const mockSubmissions = [
        { pk_form_submission: 'sub-1', form_name: 'Test Form' },
      ];
      mockFormModel.findSubmissions.mockResolvedValue(mockSubmissions);
      mockFormModel.countSubmissions.mockResolvedValue(1);

      const result = await formService.listUserSubmissions('user-123', 1, 20);

      expect(result.data).toHaveLength(1);
      expect(result.pagination.total).toBe(1);
      expect(result.pagination.totalPages).toBe(1);
    });

    it('should calculate total pages correctly', async () => {
      mockFormModel.findSubmissions.mockResolvedValue([]);
      mockFormModel.countSubmissions.mockResolvedValue(45);

      const result = await formService.listUserSubmissions('user-123', 1, 20);

      expect(result.pagination.totalPages).toBe(3);
    });
  });

  describe('getSubmission', () => {
    it('should return submission for owner', async () => {
      mockFormModel.findSubmission.mockResolvedValue({
        pk_form_submission: 'sub-1',
        fk_form_submission_user_account: 'user-123',
        form_name: 'Test Form',
        attachments: [],
      });

      const result = await formService.getSubmission('sub-1', 'user-123');

      expect(result.pk_form_submission).toBe('sub-1');
    });

    it('should throw 404 for non-existent submission', async () => {
      mockFormModel.findSubmission.mockResolvedValue(null);

      await expect(
        formService.getSubmission('nonexistent', 'user-123')
      ).rejects.toThrow('Submission not found');
    });

    it('should throw 403 for non-owner access', async () => {
      mockFormModel.findSubmission.mockResolvedValue({
        pk_form_submission: 'sub-1',
        fk_form_submission_user_account: 'other-user',
        form_name: 'Test Form',
      });

      await expect(
        formService.getSubmission('sub-1', 'user-123')
      ).rejects.toThrow('You can only view your own submissions');
    });
  });

  describe('getSubmissionDetail', () => {
    it('should return {submission, form, attachments} triple for owner', async () => {
      mockFormModel.findSubmission.mockResolvedValue({
        pk_form_submission: 'sub-1',
        fk_form_submission_form_definition: mockFormDefinition.pk_form_definition,
        fk_form_submission_user_account: 'user-123',
        form_name: 'Service Feedback Report',
        form_schema: mockFormDefinition.form_schema,
        attachments: [{ pk_file_attachment: 'file-1' }],
      });
      mockFormModel.findById.mockResolvedValue(mockFormDefinition);

      const result = await formService.getSubmissionDetail('sub-1', 'user-123');

      expect(result.submission.pk_form_submission).toBe('sub-1');
      expect(result.form.pk_form_definition).toBe(mockFormDefinition.pk_form_definition);
      expect(result.attachments).toHaveLength(1);
      // form_schema should be on form, not on submission
      expect((result.submission as Record<string, unknown>).form_schema).toBeUndefined();
    });

    it('should throw 404 for non-existent submission', async () => {
      mockFormModel.findSubmission.mockResolvedValue(null);

      await expect(
        formService.getSubmissionDetail('nonexistent', 'user-123')
      ).rejects.toThrow('Submission not found');
    });

    it('should throw 403 for non-owner access', async () => {
      mockFormModel.findSubmission.mockResolvedValue({
        pk_form_submission: 'sub-1',
        fk_form_submission_form_definition: mockFormDefinition.pk_form_definition,
        fk_form_submission_user_account: 'other-user',
        form_name: 'Test Form',
        attachments: [],
      });

      await expect(
        formService.getSubmissionDetail('sub-1', 'user-123')
      ).rejects.toThrow('You can only view your own submissions');
    });

    it('should throw 404 if form definition is missing', async () => {
      mockFormModel.findSubmission.mockResolvedValue({
        pk_form_submission: 'sub-1',
        fk_form_submission_form_definition: 'missing-form',
        fk_form_submission_user_account: 'user-123',
        form_name: 'Test Form',
        attachments: [],
      });
      mockFormModel.findById.mockResolvedValue(null);

      await expect(
        formService.getSubmissionDetail('sub-1', 'user-123')
      ).rejects.toThrow('Form definition not found');
    });
  });

  describe('saveDraft', () => {
    it('should create a draft submission', async () => {
      mockFormModel.findById.mockResolvedValue(mockFormDefinition);
      mockFormModel.createDraft.mockResolvedValue({
        pk_form_submission: 'draft-1',
        submission_status: 'draft',
        submission_reference_number: 'APP-20240101-00001',
      });

      const result = await formService.saveDraft(
        mockFormDefinition.pk_form_definition,
        'user-123',
        { description: 'Partial data' }
      );

      expect(mockFormModel.createDraft).toHaveBeenCalledWith(
        mockFormDefinition.pk_form_definition,
        'user-123',
        { description: 'Partial data' },
        expect.stringMatching(/^APP-\d{8}-\d{5}$/)
      );
      expect(result.form_name).toBe('Service Feedback Report');
    });

    it('should generate a reference number', async () => {
      mockFormModel.findById.mockResolvedValue(mockFormDefinition);
      mockFormModel.createDraft.mockResolvedValue({
        pk_form_submission: 'draft-1',
        submission_reference_number: 'APP-20240101-00001',
      });

      await formService.saveDraft(
        mockFormDefinition.pk_form_definition,
        'user-123',
        {}
      );

      expect(mockFormModel.createDraft).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(String),
        expect.any(Object),
        expect.stringMatching(/^APP-\d{8}-\d{5}$/)
      );
    });

    it('should log an audit event', async () => {
      mockFormModel.findById.mockResolvedValue(mockFormDefinition);
      mockFormModel.createDraft.mockResolvedValue({
        pk_form_submission: 'draft-1',
        submission_reference_number: 'APP-20240101-00001',
      });

      await formService.saveDraft(
        mockFormDefinition.pk_form_definition,
        'user-123',
        { description: 'Test' }
      );

      expect(mockLogAuditEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'FORM_DRAFT_SAVE',
          tableName: 'form_submission',
          recordId: 'draft-1',
          userId: 'user-123',
        })
      );
    });

    it('should throw 404 for non-existent form', async () => {
      mockFormModel.findById.mockResolvedValue(null);

      await expect(
        formService.saveDraft('nonexistent', 'user-123', {})
      ).rejects.toThrow('Form not found');
    });
  });

  describe('updateDraft', () => {
    it('should update draft data', async () => {
      mockFormModel.findSubmission.mockResolvedValue({
        pk_form_submission: 'draft-1',
        fk_form_submission_user_account: 'user-123',
        submission_status: 'draft',
      });
      mockFormModel.updateSubmissionData.mockResolvedValue(undefined);

      await formService.updateDraft('draft-1', 'user-123', { description: 'Updated' });

      expect(mockFormModel.updateSubmissionData).toHaveBeenCalledWith(
        'draft-1',
        { description: 'Updated' },
        'user-123'
      );
    });

    it('should reject if not draft status', async () => {
      mockFormModel.findSubmission.mockResolvedValue({
        pk_form_submission: 'sub-1',
        fk_form_submission_user_account: 'user-123',
        submission_status: 'submitted',
      });

      await expect(
        formService.updateDraft('sub-1', 'user-123', { description: 'Updated' })
      ).rejects.toThrow('Only draft submissions can be updated');
    });

    it('should reject if not owner', async () => {
      mockFormModel.findSubmission.mockResolvedValue({
        pk_form_submission: 'draft-1',
        fk_form_submission_user_account: 'other-user',
        submission_status: 'draft',
      });

      await expect(
        formService.updateDraft('draft-1', 'user-123', { description: 'Updated' })
      ).rejects.toThrow('You can only update your own drafts');
    });

    it('should throw 404 for non-existent submission', async () => {
      mockFormModel.findSubmission.mockResolvedValue(null);

      await expect(
        formService.updateDraft('nonexistent', 'user-123', {})
      ).rejects.toThrow('Submission not found');
    });

    it('should log an audit event', async () => {
      mockFormModel.findSubmission.mockResolvedValue({
        pk_form_submission: 'draft-1',
        fk_form_submission_user_account: 'user-123',
        submission_status: 'draft',
      });
      mockFormModel.updateSubmissionData.mockResolvedValue(undefined);

      await formService.updateDraft('draft-1', 'user-123', { description: 'Updated' });

      expect(mockLogAuditEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'FORM_DRAFT_UPDATE',
          tableName: 'form_submission',
          recordId: 'draft-1',
          userId: 'user-123',
        })
      );
    });
  });

  describe('submitDraft', () => {
    it('should validate and change status to submitted', async () => {
      mockFormModel.findSubmission.mockResolvedValue({
        pk_form_submission: 'draft-1',
        fk_form_submission_user_account: 'user-123',
        fk_form_submission_form_definition: mockFormDefinition.pk_form_definition,
        submission_status: 'draft',
        submission_data: { description: 'Valid data', severity: 'high' },
        submission_reference_number: 'APP-20240101-00001',
      });
      mockFormModel.findById.mockResolvedValue(mockFormDefinition);
      mockFormModel.updateSubmissionStatus.mockResolvedValue(undefined);

      const result = await formService.submitDraft('draft-1', 'user-123');

      expect(mockFormModel.updateSubmissionStatus).toHaveBeenCalledWith(
        'draft-1',
        'submitted',
        'user-123'
      );
      expect(result.referenceNumber).toBe('APP-20240101-00001');
    });

    it('should reject invalid data (missing required fields)', async () => {
      mockFormModel.findSubmission.mockResolvedValue({
        pk_form_submission: 'draft-1',
        fk_form_submission_user_account: 'user-123',
        fk_form_submission_form_definition: mockFormDefinition.pk_form_definition,
        submission_status: 'draft',
        submission_data: { optional_notes: 'Some notes' }, // missing required fields
        submission_reference_number: 'APP-20240101-00001',
      });
      mockFormModel.findById.mockResolvedValue(mockFormDefinition);

      await expect(
        formService.submitDraft('draft-1', 'user-123')
      ).rejects.toThrow('Validation failed');
    });

    it('should reject if not draft status', async () => {
      mockFormModel.findSubmission.mockResolvedValue({
        pk_form_submission: 'sub-1',
        fk_form_submission_user_account: 'user-123',
        submission_status: 'submitted',
      });

      await expect(
        formService.submitDraft('sub-1', 'user-123')
      ).rejects.toThrow('Only draft submissions can be submitted');
    });

    it('should reject if not owner', async () => {
      mockFormModel.findSubmission.mockResolvedValue({
        pk_form_submission: 'draft-1',
        fk_form_submission_user_account: 'other-user',
        submission_status: 'draft',
      });

      await expect(
        formService.submitDraft('draft-1', 'user-123')
      ).rejects.toThrow('You can only submit your own drafts');
    });

    it('should log an audit event on successful submit', async () => {
      mockFormModel.findSubmission.mockResolvedValue({
        pk_form_submission: 'draft-1',
        fk_form_submission_user_account: 'user-123',
        fk_form_submission_form_definition: mockFormDefinition.pk_form_definition,
        submission_status: 'draft',
        submission_data: { description: 'Valid data', severity: 'high' },
        submission_reference_number: 'APP-20240101-00001',
      });
      mockFormModel.findById.mockResolvedValue(mockFormDefinition);
      mockFormModel.updateSubmissionStatus.mockResolvedValue(undefined);

      await formService.submitDraft('draft-1', 'user-123');

      expect(mockLogAuditEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'FORM_DRAFT_SUBMIT',
          tableName: 'form_submission',
          recordId: 'draft-1',
          userId: 'user-123',
        })
      );
    });
  });

  describe('retractSubmission', () => {
    it('should change status from submitted to retracted', async () => {
      mockFormModel.findSubmission.mockResolvedValue({
        pk_form_submission: 'sub-1',
        fk_form_submission_user_account: 'user-123',
        submission_status: 'submitted',
        submission_reference_number: 'APP-20240101-00001',
      });
      mockFormModel.updateSubmissionStatus.mockResolvedValue(undefined);

      await formService.retractSubmission('sub-1', 'user-123');

      expect(mockFormModel.updateSubmissionStatus).toHaveBeenCalledWith(
        'sub-1',
        'retracted',
        'user-123'
      );
    });

    it('should reject if not submitted status', async () => {
      mockFormModel.findSubmission.mockResolvedValue({
        pk_form_submission: 'draft-1',
        fk_form_submission_user_account: 'user-123',
        submission_status: 'draft',
      });

      await expect(
        formService.retractSubmission('draft-1', 'user-123')
      ).rejects.toThrow('Only submitted submissions can be retracted');
    });

    it('should reject if not owner', async () => {
      mockFormModel.findSubmission.mockResolvedValue({
        pk_form_submission: 'sub-1',
        fk_form_submission_user_account: 'other-user',
        submission_status: 'submitted',
      });

      await expect(
        formService.retractSubmission('sub-1', 'user-123')
      ).rejects.toThrow('You can only retract your own submissions');
    });

    it('should throw 404 for non-existent submission', async () => {
      mockFormModel.findSubmission.mockResolvedValue(null);

      await expect(
        formService.retractSubmission('nonexistent', 'user-123')
      ).rejects.toThrow('Submission not found');
    });

    it('should log an audit event', async () => {
      mockFormModel.findSubmission.mockResolvedValue({
        pk_form_submission: 'sub-1',
        fk_form_submission_user_account: 'user-123',
        submission_status: 'submitted',
        submission_reference_number: 'APP-20240101-00001',
      });
      mockFormModel.updateSubmissionStatus.mockResolvedValue(undefined);

      await formService.retractSubmission('sub-1', 'user-123');

      expect(mockLogAuditEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'FORM_RETRACT',
          tableName: 'form_submission',
          recordId: 'sub-1',
          userId: 'user-123',
        })
      );
    });
  });
});
