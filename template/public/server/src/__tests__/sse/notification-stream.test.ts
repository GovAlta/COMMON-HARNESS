import { describe, it, expect, vi, beforeEach } from 'vitest';

// We're testing the actual NotificationStreamManager class, not a mock
// Import fresh instance pattern
describe('NotificationStreamManager', () => {
  let NotificationStreamManager: any;
  let manager: any;

  beforeEach(async () => {
    // Dynamically import to get fresh instance each time
    vi.resetModules();
    const module = await import('../../sse/notification-stream');
    manager = module.notificationStreamManager;
    // Clear any leftover clients
    manager.disconnectAll();
  });

  function createMockRes() {
    return {
      write: vi.fn(),
      end: vi.fn(),
      setHeader: vi.fn(),
      flushHeaders: vi.fn(),
    } as any;
  }

  describe('addClient / removeClient', () => {
    it('should add a client for a user', () => {
      const res = createMockRes();
      manager.addClient('user-1', res);

      expect(manager.isConnected('user-1')).toBe(true);
      expect(manager.getClientCount()).toBe(1);
    });

    it('should support multiple clients per user (multiple tabs)', () => {
      const res1 = createMockRes();
      const res2 = createMockRes();

      manager.addClient('user-1', res1);
      manager.addClient('user-1', res2);

      expect(manager.isConnected('user-1')).toBe(true);
      expect(manager.getClientCount()).toBe(2);
    });

    it('should remove a specific client', () => {
      const res1 = createMockRes();
      const res2 = createMockRes();

      manager.addClient('user-1', res1);
      manager.addClient('user-1', res2);

      manager.removeClient('user-1', res1);

      expect(manager.isConnected('user-1')).toBe(true);
      expect(manager.getClientCount()).toBe(1);
    });

    it('should remove user entry when last client disconnects', () => {
      const res = createMockRes();
      manager.addClient('user-1', res);
      manager.removeClient('user-1', res);

      expect(manager.isConnected('user-1')).toBe(false);
      expect(manager.getClientCount()).toBe(0);
    });

    it('should handle removing non-existent client gracefully', () => {
      const res = createMockRes();
      expect(() => manager.removeClient('nonexistent', res)).not.toThrow();
    });
  });

  describe('sendToUser', () => {
    it('should send SSE event to all connected clients for a user', () => {
      const res1 = createMockRes();
      const res2 = createMockRes();

      manager.addClient('user-1', res1);
      manager.addClient('user-1', res2);

      const notification = { id: 'n-1', title: 'Test' };
      manager.sendToUser('user-1', notification);

      expect(res1.write).toHaveBeenCalledWith(
        expect.stringContaining('event: notification')
      );
      expect(res2.write).toHaveBeenCalledWith(
        expect.stringContaining('event: notification')
      );
    });

    it('should not throw when sending to non-connected user', () => {
      expect(() => manager.sendToUser('nonexistent', { test: true })).not.toThrow();
    });

    it('should remove errored clients on send', () => {
      const res = createMockRes();
      res.write.mockImplementation(() => {
        throw new Error('Connection reset');
      });

      manager.addClient('user-1', res);
      manager.sendToUser('user-1', { id: 'n-1' });

      expect(manager.isConnected('user-1')).toBe(false);
    });
  });

  describe('sendToUsers', () => {
    it('should send to multiple users', () => {
      const res1 = createMockRes();
      const res2 = createMockRes();

      manager.addClient('user-1', res1);
      manager.addClient('user-2', res2);

      const notification = { id: 'n-1', title: 'Broadcast' };
      manager.sendToUsers(['user-1', 'user-2'], notification);

      expect(res1.write).toHaveBeenCalledWith(
        expect.stringContaining('Broadcast')
      );
      expect(res2.write).toHaveBeenCalledWith(
        expect.stringContaining('Broadcast')
      );
    });
  });

  describe('disconnectAll', () => {
    it('should disconnect all clients and clear the map', () => {
      const res1 = createMockRes();
      const res2 = createMockRes();

      manager.addClient('user-1', res1);
      manager.addClient('user-2', res2);

      manager.disconnectAll();

      expect(res1.end).toHaveBeenCalled();
      expect(res2.end).toHaveBeenCalled();
      expect(manager.getClientCount()).toBe(0);
    });
  });

  describe('isConnected', () => {
    it('should return false for unconnected user', () => {
      expect(manager.isConnected('nobody')).toBe(false);
    });

    it('should return true for connected user', () => {
      const res = createMockRes();
      manager.addClient('user-1', res);
      expect(manager.isConnected('user-1')).toBe(true);
    });
  });

  describe('per-user connection limit', () => {
    it('should evict the oldest connection when limit is reached', () => {
      const connections: any[] = [];
      // Add 10 connections (the limit)
      for (let i = 0; i < 10; i++) {
        const res = createMockRes();
        connections.push(res);
        manager.addClient('user-1', res);
      }

      expect(manager.getClientCount()).toBe(10);

      // Add an 11th — should evict the oldest (connections[0])
      const newRes = createMockRes();
      manager.addClient('user-1', newRes);

      expect(manager.getClientCount()).toBe(10);
      expect(connections[0].end).toHaveBeenCalled();
    });

    it('should not evict connections below the limit', () => {
      const res1 = createMockRes();
      const res2 = createMockRes();
      manager.addClient('user-1', res1);
      manager.addClient('user-1', res2);

      expect(manager.getClientCount()).toBe(2);
      expect(res1.end).not.toHaveBeenCalled();
      expect(res2.end).not.toHaveBeenCalled();
    });

    it('should enforce limit per user, not globally', () => {
      // Fill user-1 to 10
      for (let i = 0; i < 10; i++) {
        manager.addClient('user-1', createMockRes());
      }
      // user-2 should still be able to connect
      const res = createMockRes();
      manager.addClient('user-2', res);

      expect(manager.getClientCount()).toBe(11);
      expect(res.end).not.toHaveBeenCalled();
    });
  });
});
