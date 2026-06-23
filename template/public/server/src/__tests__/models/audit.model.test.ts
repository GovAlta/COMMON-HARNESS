import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../config/database', () => ({
  pool: {
    query: vi.fn(),
  },
}));

import { pool } from '../../config/database';
import { createAuditEntry } from '../../models/audit.model';

const mockPool = pool as unknown as { query: ReturnType<typeof vi.fn> };

describe('AuditModel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('createAuditEntry', () => {
    const mockAuditEntry = {
      pk_audit_log: '11111111-1111-1111-1111-111111111111',
      table_name: 'resource_item',
      record_id: '22222222-2222-2222-2222-222222222222',
      action: 'INSERT',
      old_data: null,
      new_data: { resource_title: 'Test Resource' },
      user_id: '33333333-3333-3333-3333-333333333333',
      ip_address: '127.0.0.1',
      user_agent: null,
      created_at: '2024-01-15T10:00:00Z',
    };

    it('should create an INSERT audit log entry', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [mockAuditEntry] });

      const result = await createAuditEntry(
        'resource_item',
        '22222222-2222-2222-2222-222222222222',
        'INSERT',
        null,
        { resource_title: 'Test Resource' },
        '33333333-3333-3333-3333-333333333333',
        '127.0.0.1'
      );

      expect(result).toEqual(mockAuditEntry);
      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO audit_log'),
        expect.arrayContaining([
          'resource_item',
          '22222222-2222-2222-2222-222222222222',
          'INSERT',
        ])
      );
    });

    it('should create an UPDATE audit log entry with old and new data', async () => {
      const updateEntry = {
        ...mockAuditEntry,
        action: 'UPDATE',
        old_data: { resource_status: 'published' },
        new_data: { resource_status: 'draft' },
      };
      mockPool.query.mockResolvedValueOnce({ rows: [updateEntry] });

      const result = await createAuditEntry(
        'resource_item',
        '22222222-2222-2222-2222-222222222222',
        'UPDATE',
        { resource_status: 'published' },
        { resource_status: 'draft' },
        '33333333-3333-3333-3333-333333333333',
        '127.0.0.1'
      );

      expect(result.action).toBe('UPDATE');
      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO audit_log'),
        expect.arrayContaining(['UPDATE'])
      );
    });

    it('should create a DELETE audit log entry', async () => {
      const deleteEntry = {
        ...mockAuditEntry,
        action: 'DELETE',
        old_data: { resource_title: 'Deleted Resource' },
        new_data: null,
      };
      mockPool.query.mockResolvedValueOnce({ rows: [deleteEntry] });

      const result = await createAuditEntry(
        'resource_item',
        '22222222-2222-2222-2222-222222222222',
        'DELETE',
        { resource_title: 'Deleted Resource' },
        null,
        '33333333-3333-3333-3333-333333333333',
        null
      );

      expect(result.action).toBe('DELETE');
    });

    it('should handle null user id and ip address', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [{ ...mockAuditEntry, user_id: null, ip_address: null }] });

      const result = await createAuditEntry(
        'resource_item',
        '22222222-2222-2222-2222-222222222222',
        'INSERT',
        null,
        { resource_title: 'System Resource' },
        null,
        null
      );

      expect(result).toBeDefined();
      expect(mockPool.query).toHaveBeenCalledWith(
        expect.any(String),
        expect.arrayContaining([null, null])
      );
    });

    it('should serialize old and new data as JSON strings', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [mockAuditEntry] });

      await createAuditEntry(
        'form_submission',
        '22222222-2222-2222-2222-222222222222',
        'UPDATE',
        { submission_status: 'submitted' },
        { submission_status: 'in-review' },
        '33333333-3333-3333-3333-333333333333',
        '192.168.1.1'
      );

      const callArgs = mockPool.query.mock.calls[0][1] as unknown[];
      // Old data param should be serialized JSON
      expect(callArgs[3]).toBe(JSON.stringify({ submission_status: 'submitted' }));
      // New data param should be serialized JSON
      expect(callArgs[4]).toBe(JSON.stringify({ submission_status: 'in-review' }));
    });
  });
});
