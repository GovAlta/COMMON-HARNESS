import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock database pool
vi.mock('../../config/database', () => ({
  pool: {
    query: vi.fn(),
    connect: vi.fn(),
    end: vi.fn(),
  },
}));

// Mock logger to verify error logging on failure
vi.mock('../../utils/logger', () => ({
  default: {
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
  },
}));

import { logAuditEvent } from '../../utils/audit-logger';
import type { AuditEvent } from '../../utils/audit-logger';
import { pool } from '../../config/database';
import logger from '../../utils/logger';

describe('audit-logger', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should insert an audit record with correct parameters for LOGIN', async () => {
    vi.mocked(pool.query).mockResolvedValue({ rows: [], rowCount: 1 } as any);

    const event: AuditEvent = {
      action: 'LOGIN',
      tableName: 'user_account',
      recordId: 'user-123',
      userId: 'user-123',
      ipAddress: '127.0.0.1',
      userAgent: 'Mozilla/5.0',
      newData: { provider: 'google', email: 'test@example.com' },
    };

    await logAuditEvent(event);

    expect(pool.query).toHaveBeenCalledTimes(1);
    const [query, params] = vi.mocked(pool.query).mock.calls[0];
    expect(query).toContain('INSERT INTO audit_log');
    expect(params).toEqual([
      'user_account',
      'user-123',
      'LOGIN',
      null,
      JSON.stringify({ provider: 'google', email: 'test@example.com' }),
      'user-123',
      '127.0.0.1',
      'Mozilla/5.0',
    ]);
  });

  it('should insert an audit record for LOGOUT', async () => {
    vi.mocked(pool.query).mockResolvedValue({ rows: [], rowCount: 1 } as any);

    await logAuditEvent({
      action: 'LOGOUT',
      tableName: 'user_account',
      recordId: 'user-456',
      userId: 'user-456',
      ipAddress: '10.0.0.1',
    });

    expect(pool.query).toHaveBeenCalledTimes(1);
    const [, params] = vi.mocked(pool.query).mock.calls[0];
    expect(params![2]).toBe('LOGOUT');
    expect(params![5]).toBe('user-456');
  });

  it('should insert an audit record for AI_CHAT with metadata', async () => {
    vi.mocked(pool.query).mockResolvedValue({ rows: [], rowCount: 1 } as any);

    await logAuditEvent({
      action: 'AI_CHAT',
      tableName: 'ai_conversation',
      recordId: 'conv-789',
      userId: 'user-123',
      metadata: { model: 'gpt-4', messageLength: 42 },
    });

    expect(pool.query).toHaveBeenCalledTimes(1);
    const [, params] = vi.mocked(pool.query).mock.calls[0];
    expect(params![2]).toBe('AI_CHAT');
    // newData should include metadata
    const newData = JSON.parse(params![4] as string);
    expect(newData.model).toBe('gpt-4');
    expect(newData.messageLength).toBe(42);
  });

  it('should insert an audit record for AI_IMAGE', async () => {
    vi.mocked(pool.query).mockResolvedValue({ rows: [], rowCount: 1 } as any);

    await logAuditEvent({
      action: 'AI_IMAGE',
      tableName: 'ai_conversation',
      recordId: 'conv-101',
      userId: 'user-202',
      metadata: { model: 'gpt-4-vision', imageCount: 3 },
    });

    expect(pool.query).toHaveBeenCalledTimes(1);
    const [, params] = vi.mocked(pool.query).mock.calls[0];
    expect(params![2]).toBe('AI_IMAGE');
  });

  it('should insert an audit record for FORM_SUBMIT', async () => {
    vi.mocked(pool.query).mockResolvedValue({ rows: [], rowCount: 1 } as any);

    await logAuditEvent({
      action: 'FORM_SUBMIT',
      tableName: 'form_submission',
      recordId: 'sub-321',
      userId: 'user-654',
      newData: { formName: 'Test Form', referenceNumber: 'WF-20260315-12345' },
    });

    expect(pool.query).toHaveBeenCalledTimes(1);
    const [, params] = vi.mocked(pool.query).mock.calls[0];
    expect(params![2]).toBe('FORM_SUBMIT');
    const newData = JSON.parse(params![4] as string);
    expect(newData.formName).toBe('Test Form');
    expect(newData.referenceNumber).toBe('WF-20260315-12345');
  });

  it('should insert an audit record for LOGIN_FAILED', async () => {
    vi.mocked(pool.query).mockResolvedValue({ rows: [], rowCount: 1 } as any);

    await logAuditEvent({
      action: 'LOGIN_FAILED',
      tableName: 'user_account',
      ipAddress: '192.168.1.1',
      userAgent: 'curl/7.68.0',
      newData: { provider: 'google', error: 'Invalid token' },
    });

    expect(pool.query).toHaveBeenCalledTimes(1);
    const [, params] = vi.mocked(pool.query).mock.calls[0];
    expect(params![2]).toBe('LOGIN_FAILED');
    expect(params![5]).toBeNull(); // no userId for failed login
  });

  it('should insert an audit record for TOKEN_REFRESH', async () => {
    vi.mocked(pool.query).mockResolvedValue({ rows: [], rowCount: 1 } as any);

    await logAuditEvent({
      action: 'TOKEN_REFRESH',
      tableName: 'user_account',
      userId: 'user-999',
      ipAddress: '10.0.0.5',
    });

    expect(pool.query).toHaveBeenCalledTimes(1);
    const [, params] = vi.mocked(pool.query).mock.calls[0];
    expect(params![2]).toBe('TOKEN_REFRESH');
  });

  it('should not throw when database insert fails', async () => {
    vi.mocked(pool.query).mockRejectedValue(new Error('Connection refused'));

    await expect(
      logAuditEvent({
        action: 'LOGIN',
        tableName: 'user_account',
        userId: 'user-123',
      })
    ).resolves.toBeUndefined();

    // Should log the error via logger
    expect(logger.error).toHaveBeenCalledWith(
      'Audit logging failed',
      expect.objectContaining({ error: 'Connection refused', event: 'LOGIN' })
    );
  });

  it('should handle null optional fields gracefully', async () => {
    vi.mocked(pool.query).mockResolvedValue({ rows: [], rowCount: 1 } as any);

    await logAuditEvent({
      action: 'DELETE',
      tableName: 'some_table',
    });

    expect(pool.query).toHaveBeenCalledTimes(1);
    const [, params] = vi.mocked(pool.query).mock.calls[0];
    expect(params![1]).toBeNull(); // recordId
    expect(params![3]).toBeNull(); // oldData
    expect(params![4]).toBeNull(); // newData (no newData or metadata)
    expect(params![5]).toBeNull(); // userId
    expect(params![6]).toBeNull(); // ipAddress
  });

  it('should include oldData when provided', async () => {
    vi.mocked(pool.query).mockResolvedValue({ rows: [], rowCount: 1 } as any);

    await logAuditEvent({
      action: 'UPDATE',
      tableName: 'user_account',
      recordId: 'user-123',
      userId: 'admin-1',
      oldData: { role: 'user' },
      newData: { role: 'admin' },
    });

    const [, params] = vi.mocked(pool.query).mock.calls[0];
    expect(JSON.parse(params![3] as string)).toEqual({ role: 'user' });
    expect(JSON.parse(params![4] as string)).toMatchObject({ role: 'admin' });
  });
});
