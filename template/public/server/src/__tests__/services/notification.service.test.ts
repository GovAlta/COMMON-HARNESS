import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock modules before imports
vi.mock('../../config/database', () => ({
  pool: {
    query: vi.fn(),
    connect: vi.fn(),
    end: vi.fn(),
  },
}));

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
import * as notificationService from '../../services/notification.service';
import { notificationStreamManager } from '../../sse/notification-stream';

const mockPool = pool as unknown as { query: ReturnType<typeof vi.fn> };
const mockSSE = notificationStreamManager as unknown as {
  sendToUser: ReturnType<typeof vi.fn>;
  sendToUsers: ReturnType<typeof vi.fn>;
};

const userId = '11111111-1111-1111-1111-111111111111';
const resourceId = '22222222-2222-2222-2222-222222222222';
const messageId = '33333333-3333-3333-3333-333333333333';
const deliveryId = '44444444-4444-4444-4444-444444444444';

describe('NotificationService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('listForUser', () => {
    it('should return paginated notifications with filters', async () => {
      const mockNotifs = [
        { pk_notification_delivery: deliveryId, message_title: 'Test' },
      ];

      mockPool.query.mockResolvedValueOnce({ rows: mockNotifs });
      mockPool.query.mockResolvedValueOnce({ rows: [{ count: '1' }] });

      const result = await notificationService.listForUser(
        userId,
        { page: 1, limit: 20 },
        { filter: 'all' }
      );

      expect(result.data).toHaveLength(1);
      expect(result.pagination.page).toBe(1);
      expect(result.pagination.total).toBe(1);
    });
  });

  describe('markAsRead', () => {
    it('should mark notification as read for own notification', async () => {
      mockPool.query.mockResolvedValueOnce({
        rows: [{
          pk_notification_delivery: deliveryId,
          fk_notification_delivery_user_account: userId,
          is_read: false,
        }],
      });
      mockPool.query.mockResolvedValueOnce({
        rows: [{
          pk_notification_delivery: deliveryId,
          is_read: true,
          read_at: new Date().toISOString(),
        }],
      });

      await expect(notificationService.markAsRead(deliveryId, userId)).resolves.toBeUndefined();
    });

    it('should throw 404 for non-existent notification', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [] });

      await expect(notificationService.markAsRead(deliveryId, userId))
        .rejects.toThrow('Notification not found');
    });

    it('should throw 403 for another user\'s notification', async () => {
      mockPool.query.mockResolvedValueOnce({
        rows: [{
          pk_notification_delivery: deliveryId,
          fk_notification_delivery_user_account: '99999999-9999-9999-9999-999999999999',
        }],
      });

      await expect(notificationService.markAsRead(deliveryId, userId))
        .rejects.toThrow(/another user/);
    });
  });

  describe('getUnreadCount', () => {
    it('should return the unread count', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [{ count: '7' }] });

      const count = await notificationService.getUnreadCount(userId);
      expect(count).toBe(7);
    });
  });

  describe('broadcast', () => {
    it('should create message and deliver to broadcast subscribers', async () => {
      // createMessage
      mockPool.query.mockResolvedValueOnce({
        rows: [{
          pk_notification_message: messageId,
          message_title: 'Service Announcement',
          message_body: 'Important update',
          message_type: 'emergency_broadcast',
          created_at: new Date().toISOString(),
        }],
      });
      // findAllActiveUserIds (broadcasts deliver to all active users)
      mockPool.query.mockResolvedValueOnce({
        rows: [
          { pk_user_account: userId },
          { pk_user_account: '55555555-5555-5555-5555-555555555555' },
        ],
      });
      // createDeliveries
      mockPool.query.mockResolvedValueOnce({
        rows: [
          { pk_notification_delivery: deliveryId },
          { pk_notification_delivery: '66666666-6666-6666-6666-666666666666' },
        ],
      });

      const result = await notificationService.broadcast(
        'Service Announcement',
        'Important update',
        'emergency_broadcast',
        null,
        null,
        userId
      );

      expect(result.messageId).toBe(messageId);
      expect(result.deliveryCount).toBe(2);
      expect(mockSSE.sendToUsers).toHaveBeenCalledWith(
        [userId, '55555555-5555-5555-5555-555555555555'],
        expect.objectContaining({ title: 'Service Announcement' })
      );
    });

    it('should return 0 deliveries when no subscribers', async () => {
      // createMessage
      mockPool.query.mockResolvedValueOnce({
        rows: [{
          pk_notification_message: messageId,
          message_title: 'Test',
          message_body: 'No subscribers',
          message_type: 'general',
          created_at: new Date().toISOString(),
        }],
      });
      // findAllActiveUserIds (no active users)
      mockPool.query.mockResolvedValueOnce({ rows: [] });

      const result = await notificationService.broadcast(
        'Test',
        'No subscribers',
        'general',
        null,
        null,
        null
      );

      expect(result.deliveryCount).toBe(0);
      expect(mockSSE.sendToUsers).not.toHaveBeenCalled();
    });
  });

  describe('notifyResourceSubscribers', () => {
    it('should create message and deliver to resource subscribers', async () => {
      // createMessage
      mockPool.query.mockResolvedValueOnce({
        rows: [{
          pk_notification_message: messageId,
          message_title: 'Resource Update',
          message_body: 'Resource has been updated',
          message_type: 'general',
          created_at: new Date().toISOString(),
        }],
      });
      // findResourceSubscribers (resource subscribers)
      mockPool.query.mockResolvedValueOnce({
        rows: [{ fk_notification_subscription_user_account: userId }],
      });
      // createDeliveries
      mockPool.query.mockResolvedValueOnce({
        rows: [{ pk_notification_delivery: deliveryId }],
      });

      const result = await notificationService.notifyResourceSubscribers(
        resourceId,
        'Resource Update',
        'Resource has been updated'
      );

      expect(result.messageId).toBe(messageId);
      expect(result.deliveryCount).toBe(1);
      expect(mockSSE.sendToUsers).toHaveBeenCalledWith(
        [userId],
        expect.objectContaining({ title: 'Resource Update', resourceId })
      );
    });
  });

  describe('notifyRegionSubscribers', () => {
    it('should create message and deliver to region subscribers', async () => {
      // createMessage
      mockPool.query.mockResolvedValueOnce({
        rows: [{
          pk_notification_message: messageId,
          message_title: 'Region Alert',
          message_body: 'New update for Edmonton region',
          message_type: 'general',
          created_at: new Date().toISOString(),
        }],
      });
      // findRegionSubscribers
      mockPool.query.mockResolvedValueOnce({
        rows: [{ fk_notification_subscription_user_account: userId }],
      });
      // createDeliveries
      mockPool.query.mockResolvedValueOnce({
        rows: [{ pk_notification_delivery: deliveryId }],
      });

      const result = await notificationService.notifyRegionSubscribers(
        'Edmonton',
        'Region Alert',
        'New update for Edmonton region'
      );

      expect(result.messageId).toBe(messageId);
      expect(result.deliveryCount).toBe(1);
      expect(mockSSE.sendToUsers).toHaveBeenCalledWith(
        [userId],
        expect.objectContaining({ regionName: 'Edmonton' })
      );
    });
  });

  describe('createSubscription', () => {
    it('should create a subscription when no duplicate exists', async () => {
      // findByUserTypeTarget (no duplicate)
      mockPool.query.mockResolvedValueOnce({ rows: [] });
      // create
      mockPool.query.mockResolvedValueOnce({
        rows: [{
          pk_notification_subscription: '77777777-7777-7777-7777-777777777777',
          subscription_type: 'broadcast',
        }],
      });

      const sub = await notificationService.createSubscription(
        userId,
        'broadcast',
        null,
        null,
        {}
      );

      expect(sub.subscription_type).toBe('broadcast');
    });

    it('should throw on duplicate subscription', async () => {
      mockPool.query.mockResolvedValueOnce({
        rows: [{ pk_notification_subscription: '77777777-7777-7777-7777-777777777777' }],
      });

      await expect(
        notificationService.createSubscription(userId, 'broadcast', null, null, {})
      ).rejects.toThrow('Subscription already exists');
    });
  });

  describe('deleteSubscription', () => {
    it('should delete own subscription', async () => {
      // findById
      mockPool.query.mockResolvedValueOnce({
        rows: [{
          pk_notification_subscription: '77777777-7777-7777-7777-777777777777',
          fk_notification_subscription_user_account: userId,
        }],
      });
      // deleteById
      mockPool.query.mockResolvedValueOnce({ rowCount: 1 });

      await expect(
        notificationService.deleteSubscription('77777777-7777-7777-7777-777777777777', userId)
      ).resolves.toBeUndefined();
    });

    it('should throw 403 when deleting another user\'s subscription', async () => {
      mockPool.query.mockResolvedValueOnce({
        rows: [{
          pk_notification_subscription: '77777777-7777-7777-7777-777777777777',
          fk_notification_subscription_user_account: '99999999-9999-9999-9999-999999999999',
        }],
      });

      await expect(
        notificationService.deleteSubscription('77777777-7777-7777-7777-777777777777', userId)
      ).rejects.toThrow(/another user/);
    });
  });
});
