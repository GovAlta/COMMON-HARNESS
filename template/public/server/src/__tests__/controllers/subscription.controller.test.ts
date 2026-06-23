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
import {
  createSubscriptionSchema,
  subscriptionIdSchema,
  listSubscriptionsSchema,
} from '../../validators/notification.validator';
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
    '/api/subscriptions',
    validate({ query: listSubscriptionsSchema }),
    asyncHandler(notificationController.listSubscriptions)
  );

  app.post(
    '/api/subscriptions',
    validate({ body: createSubscriptionSchema }),
    asyncHandler(notificationController.createSubscription)
  );

  app.delete(
    '/api/subscriptions/:id',
    validate({ params: subscriptionIdSchema }),
    asyncHandler(notificationController.deleteSubscription)
  );

  app.use(errorHandler);
  return app;
}

const mockSubId = '22222222-2222-2222-2222-222222222222';
const mockResourceId = '33333333-3333-3333-3333-333333333333';

describe('SubscriptionController', () => {
  let app: express.Express;

  beforeEach(() => {
    vi.clearAllMocks();
    app = createTestApp();
  });

  describe('GET /api/subscriptions', () => {
    it('should return paginated user subscriptions with target names', async () => {
      const mockSubscriptions = [
        {
          pk_notification_subscription: mockSubId,
          fk_notification_subscription_user_account: mockUser.id,
          subscription_type: 'resource',
          subscription_target_id: mockResourceId,
          subscription_region_name: null,
          filter_criteria: {},
          target_name: 'Edmonton Transit Guide',
          created_at: '2024-01-15T10:00:00Z',
          updated_at: '2024-01-15T10:00:00Z',
        },
        {
          pk_notification_subscription: '44444444-4444-4444-4444-444444444444',
          fk_notification_subscription_user_account: mockUser.id,
          subscription_type: 'broadcast',
          subscription_target_id: null,
          subscription_region_name: null,
          filter_criteria: {},
          target_name: null,
          created_at: '2024-01-14T10:00:00Z',
          updated_at: '2024-01-14T10:00:00Z',
        },
      ];

      // findByUser (page+limit aware)
      mockPool.query.mockResolvedValueOnce({ rows: mockSubscriptions });
      // countByUser
      mockPool.query.mockResolvedValueOnce({ rows: [{ count: '2' }] });

      const res = await request(app).get('/api/subscriptions');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveLength(2);
      expect(res.body.data[0].target_name).toBe('Edmonton Transit Guide');
      expect(res.body.data[1].subscription_type).toBe('broadcast');
      // Pagination envelope present
      expect(res.body.pagination).toBeDefined();
      expect(res.body.pagination.page).toBe(1);
      expect(res.body.pagination.limit).toBe(20);
      expect(res.body.pagination.total).toBe(2);
    });

    it('should return empty paginated result when no subscriptions', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [] });
      mockPool.query.mockResolvedValueOnce({ rows: [{ count: '0' }] });

      const res = await request(app).get('/api/subscriptions');

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(0);
      expect(res.body.pagination.total).toBe(0);
    });
  });

  describe('POST /api/subscriptions', () => {
    it('should create a resource subscription', async () => {
      // findByUserTypeTarget (check duplicate)
      mockPool.query.mockResolvedValueOnce({ rows: [] });
      // Resource exists check
      mockPool.query.mockResolvedValueOnce({ rows: [{ pk_resource_item: mockResourceId }] });
      // create subscription
      mockPool.query.mockResolvedValueOnce({
        rows: [{
          pk_notification_subscription: mockSubId,
          fk_notification_subscription_user_account: mockUser.id,
          subscription_type: 'resource',
          subscription_target_id: mockResourceId,
          subscription_region_name: null,
          filter_criteria: {},
          created_at: '2024-01-15T10:00:00Z',
          updated_at: '2024-01-15T10:00:00Z',
        }],
      });

      const res = await request(app)
        .post('/api/subscriptions')
        .send({ type: 'resource', targetId: mockResourceId });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.subscription_type).toBe('resource');
    });

    it('should create a broadcast subscription', async () => {
      // findByUserTypeTarget (check duplicate)
      mockPool.query.mockResolvedValueOnce({ rows: [] });
      // create subscription
      mockPool.query.mockResolvedValueOnce({
        rows: [{
          pk_notification_subscription: mockSubId,
          subscription_type: 'broadcast',
          subscription_target_id: null,
          created_at: '2024-01-15T10:00:00Z',
          updated_at: '2024-01-15T10:00:00Z',
        }],
      });

      const res = await request(app)
        .post('/api/subscriptions')
        .send({ type: 'broadcast' });

      expect(res.status).toBe(201);
      expect(res.body.data.subscription_type).toBe('broadcast');
    });

    it('should create a region subscription', async () => {
      // findByUserTypeTarget (check duplicate)
      mockPool.query.mockResolvedValueOnce({ rows: [] });
      // create subscription
      mockPool.query.mockResolvedValueOnce({
        rows: [{
          pk_notification_subscription: mockSubId,
          subscription_type: 'region',
          subscription_region_name: 'Northwest',
          created_at: '2024-01-15T10:00:00Z',
          updated_at: '2024-01-15T10:00:00Z',
        }],
      });

      const res = await request(app)
        .post('/api/subscriptions')
        .send({ type: 'region', regionName: 'Northwest' });

      expect(res.status).toBe(201);
    });

    it('should prevent duplicate subscriptions', async () => {
      // findByUserTypeTarget returns existing subscription
      mockPool.query.mockResolvedValueOnce({
        rows: [{
          pk_notification_subscription: mockSubId,
          fk_notification_subscription_user_account: mockUser.id,
          subscription_type: 'broadcast',
        }],
      });

      const res = await request(app)
        .post('/api/subscriptions')
        .send({ type: 'broadcast' });

      expect(res.status).toBe(409);
    });

    it('should validate resource subscription requires targetId', async () => {
      const res = await request(app)
        .post('/api/subscriptions')
        .send({ type: 'resource' }); // Missing targetId

      expect(res.status).toBe(422);
    });

    it('should validate region subscription requires regionName', async () => {
      const res = await request(app)
        .post('/api/subscriptions')
        .send({ type: 'region' }); // Missing regionName

      expect(res.status).toBe(422);
    });

    it('should return 404 when resource does not exist', async () => {
      // findByUserTypeTarget (no duplicate)
      mockPool.query.mockResolvedValueOnce({ rows: [] });
      // Resource does not exist
      mockPool.query.mockResolvedValueOnce({ rows: [] });

      const res = await request(app)
        .post('/api/subscriptions')
        .send({ type: 'resource', targetId: mockResourceId });

      expect(res.status).toBe(404);
    });
  });

  describe('DELETE /api/subscriptions/:id', () => {
    it('should delete own subscription', async () => {
      // findById
      mockPool.query.mockResolvedValueOnce({
        rows: [{
          pk_notification_subscription: mockSubId,
          fk_notification_subscription_user_account: mockUser.id,
        }],
      });
      // deleteById
      mockPool.query.mockResolvedValueOnce({ rowCount: 1 });

      const res = await request(app)
        .delete(`/api/subscriptions/${mockSubId}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('should return 404 for non-existent subscription', async () => {
      const fakeId = '55555555-5555-5555-5555-555555555555';
      mockPool.query.mockResolvedValueOnce({ rows: [] });

      const res = await request(app)
        .delete(`/api/subscriptions/${fakeId}`);

      expect(res.status).toBe(404);
    });

    it('should return 403 when deleting another user\'s subscription', async () => {
      mockPool.query.mockResolvedValueOnce({
        rows: [{
          pk_notification_subscription: mockSubId,
          fk_notification_subscription_user_account: '99999999-9999-9999-9999-999999999999',
        }],
      });

      const res = await request(app)
        .delete(`/api/subscriptions/${mockSubId}`);

      expect(res.status).toBe(403);
    });

    it('should reject invalid UUID format', async () => {
      const res = await request(app)
        .delete('/api/subscriptions/not-a-uuid');

      expect(res.status).toBe(422);
    });
  });
});
