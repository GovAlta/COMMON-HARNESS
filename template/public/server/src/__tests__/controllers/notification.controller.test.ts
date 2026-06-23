import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';

// Mock modules before imports
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
import * as notificationController from '../../controllers/notification.controller';
import { validate } from '../../middleware/validate';
import { asyncHandler } from '../../utils/async-handler';
import { notificationQuerySchema, notificationIdSchema } from '../../validators/notification.validator';
import { errorHandler } from '../../middleware/error-handler';

const mockPool = pool as unknown as { query: ReturnType<typeof vi.fn> };

const mockUser = {
  id: '11111111-1111-1111-1111-111111111111',
  email: 'test@example.com',
  role: 'user',
  displayName: 'Test User',
};

function createTestApp() {
  const app = express();
  app.use(express.json());

  // Inject mock user
  app.use((req, _res, next) => {
    req.user = mockUser as any;
    next();
  });

  app.get(
    '/api/notifications',
    validate({ query: notificationQuerySchema }),
    asyncHandler(notificationController.listNotifications)
  );

  app.get(
    '/api/notifications/unread-count',
    asyncHandler(notificationController.getUnreadCount)
  );

  app.put(
    '/api/notifications/:id/read',
    validate({ params: notificationIdSchema }),
    asyncHandler(notificationController.markAsRead)
  );

  app.use(errorHandler);
  return app;
}

const mockDeliveryId = '22222222-2222-2222-2222-222222222222';

const mockNotifications = [
  {
    pk_notification_delivery: mockDeliveryId,
    is_read: false,
    read_at: null,
    delivered_at: '2024-01-15T10:00:00Z',
    message_title: 'Resource Update',
    message_body: 'The resource has been updated.',
    message_type: 'service_update',
    message_region_filter: null,
    fk_notification_message_resource_item: null,
    message_created_at: '2024-01-15T10:00:00Z',
  },
];

describe('NotificationController', () => {
  let app: express.Express;

  beforeEach(() => {
    vi.clearAllMocks();
    app = createTestApp();
  });

  describe('GET /api/notifications', () => {
    it('should return paginated notifications for current user', async () => {
      // Mock findForUser query
      mockPool.query.mockResolvedValueOnce({ rows: mockNotifications });
      // Mock countForUser query
      mockPool.query.mockResolvedValueOnce({ rows: [{ count: '1' }] });

      const res = await request(app)
        .get('/api/notifications')
        .query({ page: 1, limit: 20, filter: 'all' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0].message_title).toBe('Resource Update');
      expect(res.body.pagination).toBeDefined();
      expect(res.body.pagination.page).toBe(1);
    });

    it('should filter by unread status', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: mockNotifications });
      mockPool.query.mockResolvedValueOnce({ rows: [{ count: '1' }] });

      const res = await request(app)
        .get('/api/notifications')
        .query({ filter: 'unread' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      // Verify the query was called (filter applied in model)
      expect(mockPool.query).toHaveBeenCalled();
    });

    it('should use default pagination when no params provided', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [] });
      mockPool.query.mockResolvedValueOnce({ rows: [{ count: '0' }] });

      const res = await request(app).get('/api/notifications');

      expect(res.status).toBe(200);
      expect(res.body.pagination.page).toBe(1);
      expect(res.body.pagination.limit).toBe(20);
    });
  });

  describe('GET /api/notifications/unread-count', () => {
    it('should return unread count for current user', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [{ count: '5' }] });

      const res = await request(app).get('/api/notifications/unread-count');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.count).toBe(5);
    });

    it('should return 0 when no unread notifications', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [{ count: '0' }] });

      const res = await request(app).get('/api/notifications/unread-count');

      expect(res.status).toBe(200);
      expect(res.body.data.count).toBe(0);
    });
  });

  describe('PUT /api/notifications/:id/read', () => {
    it('should mark notification as read for current user', async () => {
      // findDeliveryById
      mockPool.query.mockResolvedValueOnce({
        rows: [{
          pk_notification_delivery: mockDeliveryId,
          fk_notification_delivery_user_account: mockUser.id,
          is_read: false,
        }],
      });
      // markAsRead
      mockPool.query.mockResolvedValueOnce({
        rows: [{
          pk_notification_delivery: mockDeliveryId,
          is_read: true,
          read_at: new Date().toISOString(),
        }],
      });

      const res = await request(app)
        .put(`/api/notifications/${mockDeliveryId}/read`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('should return 404 for non-existent notification', async () => {
      const fakeId = '33333333-3333-3333-3333-333333333333';
      mockPool.query.mockResolvedValueOnce({ rows: [] });

      const res = await request(app)
        .put(`/api/notifications/${fakeId}/read`);

      expect(res.status).toBe(404);
    });

    it('should return 403 when trying to mark another user\'s notification', async () => {
      mockPool.query.mockResolvedValueOnce({
        rows: [{
          pk_notification_delivery: mockDeliveryId,
          fk_notification_delivery_user_account: '99999999-9999-9999-9999-999999999999',
          is_read: false,
        }],
      });

      const res = await request(app)
        .put(`/api/notifications/${mockDeliveryId}/read`);

      expect(res.status).toBe(403);
    });

    it('should reject invalid UUID format', async () => {
      const res = await request(app)
        .put('/api/notifications/not-a-uuid/read');

      expect(res.status).toBe(422);
    });
  });
});
