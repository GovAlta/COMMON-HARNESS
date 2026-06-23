import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Request, Response } from 'express';

// Mock service modules
vi.mock('../../services/form.service', () => ({
  listPublished: vi.fn(),
  getSchema: vi.fn(),
  submitForm: vi.fn(),
  listUserSubmissions: vi.fn(),
  getSubmission: vi.fn(),
  getSubmissionDetail: vi.fn(),
}));

import * as formService from '../../services/form.service';
import * as formController from '../../controllers/form.controller';

const mockFormSvc = formService as unknown as {
  listPublished: ReturnType<typeof vi.fn>;
  getSchema: ReturnType<typeof vi.fn>;
  submitForm: ReturnType<typeof vi.fn>;
  listUserSubmissions: ReturnType<typeof vi.fn>;
  getSubmission: ReturnType<typeof vi.fn>;
  getSubmissionDetail: ReturnType<typeof vi.fn>;
};

function createMockReqRes(overrides: Partial<Request> = {}) {
  const req = {
    query: {},
    params: {},
    body: {},
    user: { id: 'user-123', email: 'test@test.com', role: 'user', displayName: 'Test User' },
    ...overrides,
  } as unknown as Request;

  const res = {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
  } as unknown as Response;

  return { req, res };
}

const mockForm = {
  pk_form_definition: '11111111-1111-1111-1111-111111111111',
  form_name: 'Service Feedback Report',
  form_version_number: 1,
  form_description: 'Submit feedback about a service',
  is_published: true,
  form_schema: {
    title: 'Service Feedback Report',
    fields: [
      { name: 'description', type: 'textarea', label: 'Description', required: true },
    ],
  },
};

describe('Form Controller', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('listPublishedForms', () => {
    it('should return paginated published form metadata without schema', async () => {
      const { req, res } = createMockReqRes({
        query: { page: 1, limit: 20 } as any,
      });
      mockFormSvc.listPublished.mockResolvedValue({
        data: [mockForm],
        pagination: { page: 1, limit: 20, total: 1, totalPages: 1 },
      });

      await formController.listPublishedForms(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(mockFormSvc.listPublished).toHaveBeenCalledWith(1, 20);
      const jsonCall = (res.json as any).mock.calls[0][0];
      expect(jsonCall.success).toBe(true);
      expect(jsonCall.data).toHaveLength(1);
      expect(jsonCall.data[0].pk_form_definition).toBe(mockForm.pk_form_definition);
      expect(jsonCall.data[0].form_name).toBe('Service Feedback Report');
      // Schema should not be in metadata response
      expect(jsonCall.data[0].form_schema).toBeUndefined();
      // Pagination envelope present
      expect(jsonCall.pagination).toBeDefined();
      expect(jsonCall.pagination.page).toBe(1);
      expect(jsonCall.pagination.total).toBe(1);
    });

    it('should return empty paginated result when no published forms', async () => {
      const { req, res } = createMockReqRes();
      mockFormSvc.listPublished.mockResolvedValue({
        data: [],
        pagination: { page: 1, limit: 20, total: 0, totalPages: 1 },
      });

      await formController.listPublishedForms(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      // No query params provided → controller defaults to page=1, limit=20
      expect(mockFormSvc.listPublished).toHaveBeenCalledWith(1, 20);
      const jsonCall = (res.json as any).mock.calls[0][0];
      expect(jsonCall.data).toHaveLength(0);
      expect(jsonCall.pagination.total).toBe(0);
    });
  });

  describe('getFormSchema', () => {
    it('should return full form including schema', async () => {
      const { req, res } = createMockReqRes({
        params: { id: mockForm.pk_form_definition },
      } as any);
      mockFormSvc.getSchema.mockResolvedValue(mockForm);

      await formController.getFormSchema(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(mockFormSvc.getSchema).toHaveBeenCalledWith(mockForm.pk_form_definition);
      const jsonCall = (res.json as any).mock.calls[0][0];
      expect(jsonCall.data).toEqual(mockForm);
    });

    it('should call getSchema with the correct ID', async () => {
      const { req, res } = createMockReqRes({
        params: { id: '22222222-2222-2222-2222-222222222222' },
      } as any);
      mockFormSvc.getSchema.mockResolvedValue(mockForm);

      await formController.getFormSchema(req, res);

      expect(mockFormSvc.getSchema).toHaveBeenCalledWith('22222222-2222-2222-2222-222222222222');
    });
  });

  describe('submitForm', () => {
    it('should submit form and return reference number', async () => {
      const { req, res } = createMockReqRes({
        params: { id: mockForm.pk_form_definition },
        body: { data: { description: 'Smoke spotted' }, fileIds: [] },
      } as any);

      mockFormSvc.submitForm.mockResolvedValue({
        submission: { ...mockForm, pk_form_submission: 'sub-1', submission_reference_number: 'WF-20240101-12345' },
        referenceNumber: 'WF-20240101-12345',
      });

      await formController.submitForm(req, res);

      expect(res.status).toHaveBeenCalledWith(201);
      const jsonCall = (res.json as any).mock.calls[0][0];
      expect(jsonCall.data.referenceNumber).toBe('WF-20240101-12345');
    });

    it('should pass form ID, user ID, data, and file IDs to service', async () => {
      const { req, res } = createMockReqRes({
        params: { id: 'form-1' },
        body: { data: { name: 'Test' }, fileIds: ['file-1', 'file-2'] },
      } as any);

      mockFormSvc.submitForm.mockResolvedValue({
        submission: {},
        referenceNumber: 'WF-20240101-00001',
      });

      await formController.submitForm(req, res);

      expect(mockFormSvc.submitForm).toHaveBeenCalledWith(
        'form-1',
        'user-123',
        { name: 'Test' },
        ['file-1', 'file-2']
      );
    });

    it('should handle missing data and fileIds gracefully', async () => {
      const { req, res } = createMockReqRes({
        params: { id: 'form-1' },
        body: {},
      } as any);

      mockFormSvc.submitForm.mockResolvedValue({
        submission: {},
        referenceNumber: 'WF-20240101-00001',
      });

      await formController.submitForm(req, res);

      expect(mockFormSvc.submitForm).toHaveBeenCalledWith(
        'form-1',
        'user-123',
        {},
        []
      );
    });
  });

  describe('listSubmissions', () => {
    it('should return paginated submissions for current user', async () => {
      const { req, res } = createMockReqRes({
        query: { page: 1, limit: 20 } as any,
      });

      const mockSubmissions = [
        {
          pk_form_submission: 'sub-1',
          form_name: 'Service Feedback Report',
          submission_reference_number: 'WF-20240101-12345',
          submission_status: 'submitted',
        },
      ];

      mockFormSvc.listUserSubmissions.mockResolvedValue({
        data: mockSubmissions,
        pagination: { page: 1, limit: 20, total: 1, totalPages: 1 },
      });

      await formController.listSubmissions(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(mockFormSvc.listUserSubmissions).toHaveBeenCalledWith('user-123', 1, 20);
    });
  });

  describe('getSubmission', () => {
    it('should return {submission, form, attachments} triple', async () => {
      const { req, res } = createMockReqRes({
        params: { id: 'sub-1' },
      } as any);

      const mockDetail = {
        submission: {
          pk_form_submission: 'sub-1',
          form_name: 'Test Form',
          submission_data: { name: 'Test' },
        },
        form: { pk_form_definition: 'form-1', form_schema: { fields: [] } },
        attachments: [],
      };

      mockFormSvc.getSubmissionDetail.mockResolvedValue(mockDetail);

      await formController.getSubmission(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(mockFormSvc.getSubmissionDetail).toHaveBeenCalledWith('sub-1', 'user-123');
    });
  });
});
