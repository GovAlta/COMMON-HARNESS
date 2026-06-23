import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock all dependencies
vi.mock('../../models/admin.model', () => ({
  getResourceCount: vi.fn(),
  getPublishedResourceCount: vi.fn(),
  getServiceLocationCount: vi.fn(),
  getOpenAssistanceCount: vi.fn(),
  getPendingSubmissionCount: vi.fn(),
  getResourcesOverTime: vi.fn(),
  getSubmissionsOverTime: vi.fn(),
  getRecentSubmissions: vi.fn(),
  createResource: vi.fn(),
  updateResource: vi.fn(),
  findResourceById: vi.fn(),
  createResourceUpdate: vi.fn(),
  createFormDefinition: vi.fn(),
  updateFormDefinition: vi.fn(),
  findFormById: vi.fn(),
  findAllSubmissions: vi.fn(),
  countAllSubmissions: vi.fn(),
  findSubmissionById: vi.fn(),
  findSubmissionByIdWithForm: vi.fn(),
  updateSubmissionStatus: vi.fn(),
  findAllForms: vi.fn(),
}));

vi.mock('../../models/file.model', () => ({
  findBySubmission: vi.fn(),
}));

vi.mock('../../models/audit.model', () => ({
  createAuditEntry: vi.fn().mockResolvedValue({ pk_audit_log: 'audit-id' }),
}));

vi.mock('../../services/notification.service', () => ({
  broadcast: vi.fn().mockResolvedValue({ messageId: 'msg-id', deliveryCount: 5 }),
  notifyResourceSubscribers: vi.fn().mockResolvedValue({ messageId: 'msg-id', deliveryCount: 3 }),
}));

import * as adminModel from '../../models/admin.model';
import * as fileModel from '../../models/file.model';
import * as auditModel from '../../models/audit.model';
import * as notificationService from '../../services/notification.service';
import * as adminService from '../../services/admin.service';

const mockAdminModel = adminModel as unknown as Record<string, ReturnType<typeof vi.fn>>;
const mockFileModel = fileModel as unknown as Record<string, ReturnType<typeof vi.fn>>;
const mockAuditModel = auditModel as unknown as Record<string, ReturnType<typeof vi.fn>>;
const mockNotificationService = notificationService as unknown as Record<string, ReturnType<typeof vi.fn>>;

const userId = '11111111-1111-1111-1111-111111111111';
const ip = '127.0.0.1';

describe('AdminService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getDashboardStats', () => {
    it('should aggregate all stats', async () => {
      mockAdminModel.getResourceCount.mockResolvedValue(10);
      mockAdminModel.getPublishedResourceCount.mockResolvedValue(7);
      mockAdminModel.getServiceLocationCount.mockResolvedValue(12);
      mockAdminModel.getOpenAssistanceCount.mockResolvedValue(10);
      mockAdminModel.getPendingSubmissionCount.mockResolvedValue(7);
      mockAdminModel.getResourcesOverTime.mockResolvedValue([{ date: '2024-01-01', value: 1 }]);
      mockAdminModel.getSubmissionsOverTime.mockResolvedValue([{ date: '2024-01-01', value: 2 }]);
      mockAdminModel.getRecentSubmissions.mockResolvedValue([]);

      const stats = await adminService.getDashboardStats(30);

      expect(stats.totalResourceCount).toBe(10);
      expect(stats.publishedResourceCount).toBe(7);
      expect(stats.serviceLocationCount).toBe(12);
      expect(stats.openAssistanceRequests).toBe(10);
      expect(stats.pendingSubmissions).toBe(7);
      expect(stats.resourcesOverTime).toHaveLength(1);
      expect(stats.submissionsOverTime).toHaveLength(1);
    });
  });

  describe('createResource', () => {
    it('should create resource and audit log', async () => {
      const mockResource = { pk_resource_item: 'res-1', resource_title: 'Test Resource' };
      mockAdminModel.createResource.mockResolvedValue(mockResource);

      const result = await adminService.createResource(
        {
          resource_title: 'Test Resource',
          resource_status: 'published',
          resource_region: 'Edmonton',
          resource_category: 'General',
        },
        userId,
        ip
      );

      expect(result).toEqual(mockResource);
      expect(mockAuditModel.createAuditEntry).toHaveBeenCalledWith(
        'resource_item', 'res-1', 'INSERT', null, expect.any(Object), userId, ip
      );
    });
  });

  describe('updateResource', () => {
    const mockExisting = { pk_resource_item: 'res-1', resource_title: 'Old', resource_status: 'published' };
    const mockUpdated = { pk_resource_item: 'res-1', resource_title: 'Old', resource_status: 'draft' };

    it('should update resource', async () => {
      mockAdminModel.findResourceById.mockResolvedValue(mockExisting);
      mockAdminModel.updateResource.mockResolvedValue(mockUpdated);

      const result = await adminService.updateResource(
        'res-1',
        { resource_status: 'draft' },
        userId,
        ip
      );

      expect(result).toEqual(mockUpdated);
      expect(mockAuditModel.createAuditEntry).toHaveBeenCalled();
    });

    it('should audit the status change', async () => {
      mockAdminModel.findResourceById.mockResolvedValue(mockExisting);
      mockAdminModel.updateResource.mockResolvedValue(mockUpdated);

      await adminService.updateResource('res-1', { resource_status: 'draft' }, userId, ip);

      expect(mockAuditModel.createAuditEntry).toHaveBeenCalledWith(
        'resource_item',
        'res-1',
        'UPDATE',
        expect.any(Object),
        expect.any(Object),
        userId,
        ip
      );
    });

    it('should throw 404 if resource not found', async () => {
      mockAdminModel.findResourceById.mockResolvedValue(null);

      await expect(adminService.updateResource('nonexistent', {}, userId, ip))
        .rejects.toThrow('Resource not found');
    });
  });

  describe('addResourceUpdate', () => {
    it('should create resource update and audit', async () => {
      mockAdminModel.findResourceById.mockResolvedValue({ pk_resource_item: 'res-1' });
      mockAdminModel.createResourceUpdate.mockResolvedValue({ pk_resource_update: 'update-1' });

      const result = await adminService.addResourceUpdate(
        'res-1',
        { update_title: 'Test', update_description: 'Desc', update_type: 'general' },
        userId,
        ip
      );

      expect(result).toBeDefined();
      expect(mockAuditModel.createAuditEntry).toHaveBeenCalledWith(
        'resource_update', 'update-1', 'INSERT', null, expect.any(Object), userId, ip
      );
    });

    it('should throw 404 if resource not found', async () => {
      mockAdminModel.findResourceById.mockResolvedValue(null);

      await expect(adminService.addResourceUpdate('nonexistent', { update_title: 'T', update_description: 'D', update_type: 'general' }, userId, ip))
        .rejects.toThrow('Resource not found');
    });
  });

  describe('updateSubmissionStatus', () => {
    it('should update status for valid transition', async () => {
      mockAdminModel.findSubmissionById.mockResolvedValue({
        pk_form_submission: 'sub-1',
        submission_status: 'submitted',
      });
      mockAdminModel.updateSubmissionStatus.mockResolvedValue({
        pk_form_submission: 'sub-1',
        submission_status: 'in-review',
      });

      const result = await adminService.updateSubmissionStatus('sub-1', 'in-review', userId, ip);

      expect(result.submission_status).toBe('in-review');
      expect(mockAuditModel.createAuditEntry).toHaveBeenCalled();
    });

    it('should reject invalid status transition', async () => {
      mockAdminModel.findSubmissionById.mockResolvedValue({
        pk_form_submission: 'sub-1',
        submission_status: 'submitted',
      });

      await expect(adminService.updateSubmissionStatus('sub-1', 'completed', userId, ip))
        .rejects.toThrow(/Invalid status transition/);
    });

    it('should throw 404 for non-existent submission', async () => {
      mockAdminModel.findSubmissionById.mockResolvedValue(null);

      await expect(adminService.updateSubmissionStatus('nonexistent', 'in-review', userId, ip))
        .rejects.toThrow('Submission not found');
    });
  });

  describe('broadcastNotification', () => {
    it('should delegate to notification service and create audit', async () => {
      const result = await adminService.broadcastNotification(
        'Test Title',
        'Test Body',
        'general',
        null,
        userId,
        ip
      );

      expect(result.messageId).toBe('msg-id');
      expect(result.deliveryCount).toBe(5);
      expect(mockNotificationService.broadcast).toHaveBeenCalledWith(
        'Test Title', 'Test Body', 'general', null, null, userId
      );
      expect(mockAuditModel.createAuditEntry).toHaveBeenCalled();
    });
  });

  describe('listAllSubmissions', () => {
    it('should return paginated submissions', async () => {
      mockAdminModel.findAllSubmissions.mockResolvedValue([{ pk_form_submission: 'sub-1' }]);
      mockAdminModel.countAllSubmissions.mockResolvedValue(15);

      const result = await adminService.listAllSubmissions({ status: 'submitted' }, 1, 10);

      expect(result.data).toHaveLength(1);
      expect(result.pagination.total).toBe(15);
      expect(result.pagination.totalPages).toBe(2);
    });
  });

  describe('getSubmissionDetail', () => {
    it('should return {submission, form, attachments} triple', async () => {
      mockAdminModel.findSubmissionByIdWithForm.mockResolvedValue({
        pk_form_submission: 'sub-1',
        fk_form_submission_form_definition: 'form-1',
        form_name: 'Test Form',
        submission_data: { name: 'Alice' },
      });
      mockAdminModel.findFormById.mockResolvedValue({
        pk_form_definition: 'form-1',
        form_schema: { fields: [] },
      });
      mockFileModel.findBySubmission.mockResolvedValue([
        { pk_file_attachment: 'file-1' },
      ]);

      const result = await adminService.getSubmissionDetail('sub-1');

      expect(result.submission.pk_form_submission).toBe('sub-1');
      expect(result.form.pk_form_definition).toBe('form-1');
      expect(result.attachments).toHaveLength(1);
      expect(mockFileModel.findBySubmission).toHaveBeenCalledWith('sub-1');
    });

    it('should throw 404 for missing submission', async () => {
      mockAdminModel.findSubmissionByIdWithForm.mockResolvedValue(null);

      await expect(adminService.getSubmissionDetail('nope'))
        .rejects.toThrow('Submission not found');
    });

    it('should throw 404 if form definition is missing', async () => {
      mockAdminModel.findSubmissionByIdWithForm.mockResolvedValue({
        pk_form_submission: 'sub-1',
        fk_form_submission_form_definition: 'form-1',
      });
      mockAdminModel.findFormById.mockResolvedValue(null);

      await expect(adminService.getSubmissionDetail('sub-1'))
        .rejects.toThrow('Form definition not found');
    });
  });
});
