import { describe, it, expect, vi } from 'vitest';
import { sendSuccess, sendPaginated, sendError } from '../../utils/response';
import { AppError } from '../../utils/app-error';
import type { Response } from 'express';

function createMockResponse(): Response {
  const res: Partial<Response> = {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
  };
  return res as Response;
}

describe('Response Utilities', () => {
  describe('sendSuccess', () => {
    it('should send success response with default 200 status', () => {
      const res = createMockResponse();
      const data = { name: 'test' };

      sendSuccess(res, data);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        data: { name: 'test' },
      });
    });

    it('should send success response with custom status code', () => {
      const res = createMockResponse();
      const data = { id: '123' };

      sendSuccess(res, data, 201);

      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        data: { id: '123' },
      });
    });

    it('should send success response with null data', () => {
      const res = createMockResponse();

      sendSuccess(res, null);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        data: null,
      });
    });
  });

  describe('sendPaginated', () => {
    it('should send paginated response with data and pagination info', () => {
      const res = createMockResponse();
      const data = [{ id: '1' }, { id: '2' }];
      const pagination = { page: 1, limit: 20, total: 100, totalPages: 5 };

      sendPaginated(res, data, pagination);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        data: [{ id: '1' }, { id: '2' }],
        pagination: { page: 1, limit: 20, total: 100, totalPages: 5 },
      });
    });

    it('should send paginated response with empty data', () => {
      const res = createMockResponse();
      const pagination = { page: 1, limit: 20, total: 0, totalPages: 0 };

      sendPaginated(res, [], pagination);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        data: [],
        pagination: { page: 1, limit: 20, total: 0, totalPages: 0 },
      });
    });
  });

  describe('sendError', () => {
    it('should send AppError with correct status and code', () => {
      const res = createMockResponse();
      const error = new AppError('Not found', 404, 'NOT_FOUND');

      sendError(res, error);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'Not found',
        },
      });
    });

    it('should send AppError with details array', () => {
      const res = createMockResponse();
      const error = AppError.validation([
        { field: 'email', message: 'Must be a valid email address' },
        { field: 'name', message: 'Required' },
      ]);

      sendError(res, error);

      expect(res.status).toHaveBeenCalledWith(422);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Validation failed',
          details: [
            { field: 'email', message: 'Must be a valid email address' },
            { field: 'name', message: 'Required' },
          ],
        },
      });
    });

    it('should send generic error for non-AppError instances', () => {
      const res = createMockResponse();
      const error = new Error('Something unexpected');

      sendError(res, error);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: 'An unexpected error occurred',
        },
      });
    });
  });
});
