import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';

// Mock all dependencies before importing
vi.mock('../../config/database', () => ({
  pool: {
    query: vi.fn(),
    connect: vi.fn(),
    end: vi.fn(),
  },
}));

vi.mock('../../config/auth', () => ({
  configurePassport: vi.fn(),
  isGoogleConfigured: vi.fn().mockReturnValue(false),
  isMicrosoftConfigured: vi.fn().mockReturnValue(false),
  getMicrosoftConfig: vi.fn().mockReturnValue({ enabled: false }),
}));

vi.mock('passport', () => {
  const mockPassport = {
    initialize: vi.fn(() => (_req: unknown, _res: unknown, next: () => void) => next()),
    authenticate: vi.fn(),
    use: vi.fn(),
    serializeUser: vi.fn(),
    deserializeUser: vi.fn(),
  };
  return { default: mockPassport };
});

vi.mock('../../sse/notification-stream', () => ({
  notificationStreamManager: {
    addClient: vi.fn(),
    removeClient: vi.fn(),
    sendToUser: vi.fn(),
    sendToUsers: vi.fn(),
    isConnected: vi.fn().mockReturnValue(false),
    getClientCount: vi.fn().mockReturnValue(0),
    disconnectAll: vi.fn(),
  },
}));

import { pool } from '../../config/database';
import * as adminController from '../../controllers/admin.controller';
import { validate } from '../../middleware/validate';
import { asyncHandler } from '../../utils/async-handler';
import { errorHandler } from '../../middleware/error-handler';
import {
  dashboardStatsQuerySchema,
  createResourceSchema,
  updateResourceSchema,
  createResourceUpdateSchema,
  createFormSchema,
  updateFormSchema,
  adminSubmissionsQuerySchema,
  updateSubmissionStatusSchema,
  broadcastNotificationSchema,
} from '../../validators/admin.validator';

const mockPool = pool as unknown as { query: ReturnType<typeof vi.fn> };

const mockAdminUser = {
  id: '11111111-1111-1111-1111-111111111111',
  email: 'admin@example.com',
  role: 'admin',
  displayName: 'Admin User',
};

const mockNonAdmin = {
  id: '22222222-2222-2222-2222-222222222222',
  email: 'user@example.com',
  role: 'user',
  displayName: 'Regular User',
};

function createTestApp(user?: typeof mockAdminUser) {
  const app = express();
  app.use(express.json());

  // Inject mock user
  if (user) {
    app.use((req, _res, next) => {
      req.user = user as any;
      next();
    });
  }

  // Dashboard
  app.get('/api/admin/dashboard/stats',
    validate(dashboardStatsQuerySchema),
    asyncHandler(adminController.getDashboardStats)
  );

  // Resource CRUD
  app.post('/api/admin/resources',
    validate(createResourceSchema),
    asyncHandler(adminController.createResource)
  );
  app.put('/api/admin/resources/:id',
    validate(updateResourceSchema),
    asyncHandler(adminController.updateResource)
  );
  app.post('/api/admin/resources/:id/updates',
    validate(createResourceUpdateSchema),
    asyncHandler(adminController.addResourceUpdate)
  );

  // Form CRUD
  app.post('/api/admin/forms',
    validate(createFormSchema),
    asyncHandler(adminController.createForm)
  );
  app.put('/api/admin/forms/:id',
    validate(updateFormSchema),
    asyncHandler(adminController.updateForm)
  );

  // Submissions
  app.get('/api/admin/submissions',
    validate(adminSubmissionsQuerySchema),
    asyncHandler(adminController.listAllSubmissions)
  );
  app.put('/api/admin/submissions/:id/status',
    validate(updateSubmissionStatusSchema),
    asyncHandler(adminController.updateSubmissionStatus)
  );

  // Broadcast
  app.post('/api/admin/notifications/broadcast',
    validate(broadcastNotificationSchema),
    asyncHandler(adminController.broadcastNotification)
  );

  app.use(errorHandler);
  return app;
}

const mockResourceId = '33333333-3333-3333-3333-333333333333';
const mockFormId = '44444444-4444-4444-4444-444444444444';
const mockSubId = '55555555-5555-5555-5555-555555555555';

const mockResource = {
  pk_resource_item: mockResourceId,
  resource_title: 'Test Resource',
  resource_status: 'published',
  resource_region: 'Edmonton',
  resource_category: 'guide',
  resource_summary: 'A test resource',
  created_at: '2024-01-15T10:00:00Z',
};

describe('AdminController', () => {
  let app: express.Express;

  beforeEach(() => {
    vi.resetAllMocks();
    app = createTestApp(mockAdminUser);
  });

  describe('GET /api/admin/dashboard/stats', () => {
    it('should return dashboard stats', async () => {
      // total resource count
      mockPool.query.mockResolvedValueOnce({ rows: [{ count: '10' }] });
      // published resource count
      mockPool.query.mockResolvedValueOnce({ rows: [{ count: '7' }] });
      // service location count
      mockPool.query.mockResolvedValueOnce({ rows: [{ count: '12' }] });
      // open assistance
      mockPool.query.mockResolvedValueOnce({ rows: [{ count: '10' }] });
      // pending submissions
      mockPool.query.mockResolvedValueOnce({ rows: [{ count: '7' }] });
      // resources over time
      mockPool.query.mockResolvedValueOnce({ rows: [{ date: '2024-01-01', value: '1' }] });
      // submissions over time
      mockPool.query.mockResolvedValueOnce({ rows: [{ date: '2024-01-01', value: '2' }] });
      // recent submissions
      mockPool.query.mockResolvedValueOnce({ rows: [] });

      const res = await request(app).get('/api/admin/dashboard/stats');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.publishedResourceCount).toBe(7);
      expect(res.body.data.serviceLocationCount).toBe(12);
      expect(res.body.data.pendingSubmissions).toBe(7);
      expect(res.body.data.resourcesOverTime).toHaveLength(1);
    });
  });

  describe('POST /api/admin/resources', () => {
    it('should create a new resource', async () => {
      // createResource
      mockPool.query.mockResolvedValueOnce({ rows: [mockResource] });
      // audit log
      mockPool.query.mockResolvedValueOnce({ rows: [{ pk_audit_log: 'audit-1' }] });

      const res = await request(app)
        .post('/api/admin/resources')
        .send({
          resource_title: 'Test Resource',
          resource_status: 'published',
          resource_region: 'Edmonton',
          resource_category: 'guide',
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.resource_title).toBe('Test Resource');
    });

    it('should reject invalid resource data', async () => {
      const res = await request(app)
        .post('/api/admin/resources')
        .send({ resource_title: '' }); // missing required fields

      expect(res.status).toBe(422);
    });
  });

  describe('PUT /api/admin/resources/:id', () => {
    it('should update resource fields', async () => {
      // findResourceById
      mockPool.query.mockResolvedValueOnce({ rows: [mockResource] });
      // updateResource
      mockPool.query.mockResolvedValueOnce({ rows: [{ ...mockResource, resource_status: 'draft' }] });
      // audit
      mockPool.query.mockResolvedValueOnce({ rows: [{ pk_audit_log: 'audit-1' }] });
      // notifyResourceSubscribers - createMessage
      mockPool.query.mockResolvedValueOnce({ rows: [{ pk_notification_message: 'msg-1', message_title: 'x', message_body: 'y', message_type: 'resource_update', created_at: '2024-01-01' }] });
      // findResourceSubscribers (resource subscribers)
      mockPool.query.mockResolvedValueOnce({ rows: [] });

      const res = await request(app)
        .put(`/api/admin/resources/${mockResourceId}`)
        .send({ resource_status: 'draft' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('should reject invalid UUID', async () => {
      const res = await request(app)
        .put('/api/admin/resources/invalid-uuid')
        .send({ resource_status: 'draft' });

      expect(res.status).toBe(422);
    });
  });

  describe('POST /api/admin/resources/:id/updates', () => {
    it('should add a timeline entry', async () => {
      // findResourceById
      mockPool.query.mockResolvedValueOnce({ rows: [mockResource] });
      // createResourceUpdate
      mockPool.query.mockResolvedValueOnce({ rows: [{ pk_resource_update: 'upd-1', update_title: 'Test' }] });
      // audit
      mockPool.query.mockResolvedValueOnce({ rows: [{ pk_audit_log: 'audit-1' }] });

      const res = await request(app)
        .post(`/api/admin/resources/${mockResourceId}/updates`)
        .send({
          update_title: 'Test Update',
          update_description: 'Description',
          update_type: 'revision',
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
    });
  });

  describe('POST /api/admin/forms', () => {
    it('should create a form definition', async () => {
      mockPool.query.mockResolvedValueOnce({
        rows: [{ pk_form_definition: mockFormId, form_name: 'Test Form', is_published: false }],
      });
      mockPool.query.mockResolvedValueOnce({ rows: [{ pk_audit_log: 'audit-1' }] });

      const res = await request(app)
        .post('/api/admin/forms')
        .send({
          form_name: 'Test Form',
          form_schema: { title: 'Test', fields: [{ name: 'field1', type: 'text', label: 'Field 1' }] },
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.form_name).toBe('Test Form');
    });

    it('should reject invalid schema', async () => {
      const res = await request(app)
        .post('/api/admin/forms')
        .send({
          form_name: 'Test Form',
          form_schema: { fields: 'invalid' }, // missing title
        });

      expect(res.status).toBe(422);
    });
  });

  describe('PUT /api/admin/forms/:id', () => {
    it('should update a form definition', async () => {
      // findFormById
      mockPool.query.mockResolvedValueOnce({
        rows: [{ pk_form_definition: mockFormId, form_name: 'Old Name' }],
      });
      // updateFormDefinition
      mockPool.query.mockResolvedValueOnce({
        rows: [{ pk_form_definition: mockFormId, form_name: 'New Name' }],
      });
      // audit
      mockPool.query.mockResolvedValueOnce({ rows: [{ pk_audit_log: 'audit-1' }] });

      const res = await request(app)
        .put(`/api/admin/forms/${mockFormId}`)
        .send({ form_name: 'New Name' });

      expect(res.status).toBe(200);
    });
  });

  describe('GET /api/admin/submissions', () => {
    it('should return paginated submissions', async () => {
      // findAllSubmissions
      mockPool.query.mockResolvedValueOnce({
        rows: [{ pk_form_submission: mockSubId, form_name: 'Test', submission_status: 'submitted' }],
      });
      // countAllSubmissions
      mockPool.query.mockResolvedValueOnce({ rows: [{ count: '1' }] });

      const res = await request(app).get('/api/admin/submissions');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveLength(1);
      expect(res.body.pagination).toBeDefined();
    });

    it('should support status filter', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [] });
      mockPool.query.mockResolvedValueOnce({ rows: [{ count: '0' }] });

      const res = await request(app)
        .get('/api/admin/submissions')
        .query({ status: 'submitted' });

      expect(res.status).toBe(200);
    });
  });

  describe('PUT /api/admin/submissions/:id/status', () => {
    it('should update submission status', async () => {
      // findSubmissionById
      mockPool.query.mockResolvedValueOnce({
        rows: [{ pk_form_submission: mockSubId, submission_status: 'submitted' }],
      });
      // updateSubmissionStatus
      mockPool.query.mockResolvedValueOnce({
        rows: [{ pk_form_submission: mockSubId, submission_status: 'in-review' }],
      });
      // audit
      mockPool.query.mockResolvedValueOnce({ rows: [{ pk_audit_log: 'audit-1' }] });

      const res = await request(app)
        .put(`/api/admin/submissions/${mockSubId}/status`)
        .send({ status: 'in-review' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('should reject invalid transition', async () => {
      // findSubmissionById
      mockPool.query.mockResolvedValueOnce({
        rows: [{ pk_form_submission: mockSubId, submission_status: 'submitted' }],
      });

      const res = await request(app)
        .put(`/api/admin/submissions/${mockSubId}/status`)
        .send({ status: 'completed' }); // invalid: submitted -> completed

      expect(res.status).toBe(422);
    });
  });

  describe('POST /api/admin/notifications/broadcast', () => {
    it('should broadcast notification', async () => {
      // broadcast -> createMessage
      mockPool.query.mockResolvedValueOnce({
        rows: [{ pk_notification_message: 'msg-1', message_title: 'Test', message_body: 'Body', message_type: 'general', created_at: '2024-01-01' }],
      });
      // findBroadcastSubscribers
      mockPool.query.mockResolvedValueOnce({
        rows: [{ fk_notification_subscription_user_account: 'user-1' }],
      });
      // createDeliveries
      mockPool.query.mockResolvedValueOnce({ rows: [{ pk_notification_delivery: 'del-1' }] });
      // audit
      mockPool.query.mockResolvedValueOnce({ rows: [{ pk_audit_log: 'audit-1' }] });

      const res = await request(app)
        .post('/api/admin/notifications/broadcast')
        .send({
          title: 'Service Announcement',
          body: 'Important service update',
          type: 'emergency_broadcast',
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
    });

    it('should reject missing title or body', async () => {
      const res = await request(app)
        .post('/api/admin/notifications/broadcast')
        .send({ title: '' });

      expect(res.status).toBe(422);
    });
  });
});
