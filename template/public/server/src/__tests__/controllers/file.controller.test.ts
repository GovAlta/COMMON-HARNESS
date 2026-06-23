import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Request, Response } from 'express';

// Mock file service
vi.mock('../../services/file.service', () => ({
  upload: vi.fn(),
}));

import * as fileService from '../../services/file.service';
import * as fileController from '../../controllers/file.controller';

const mockFileSvc = fileService as unknown as {
  upload: ReturnType<typeof vi.fn>;
};

function createMockReqRes(overrides: Partial<Request> = {}) {
  const req = {
    user: { id: 'user-123', email: 'test@test.com', role: 'user', displayName: 'Test User' },
    file: undefined as any,
    ...overrides,
  } as unknown as Request;

  const res = {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
  } as unknown as Response;

  return { req, res };
}

describe('File Controller', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('uploadFile', () => {
    it('should upload a valid file and return attachment info', async () => {
      const mockFile = {
        originalname: 'photo.jpg',
        mimetype: 'image/jpeg',
        buffer: Buffer.from([0xFF, 0xD8, 0xFF]),
        size: 1024,
      };

      const { req, res } = createMockReqRes({ file: mockFile } as any);

      mockFileSvc.upload.mockResolvedValue({
        pk_file_attachment: 'attach-1',
        file_original_name: 'photo.jpg',
        file_mime_type: 'image/jpeg',
        file_size_bytes: 1024,
      });

      await fileController.uploadFile(req, res);

      expect(res.status).toHaveBeenCalledWith(201);
      const jsonCall = (res.json as any).mock.calls[0][0];
      expect(jsonCall.data.pk_file_attachment).toBe('attach-1');
      expect(jsonCall.data.file_original_name).toBe('photo.jpg');
    });

    it('should return 400 when no file is provided', async () => {
      const { req, res } = createMockReqRes();

      await fileController.uploadFile(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      const jsonCall = (res.json as any).mock.calls[0][0];
      expect(jsonCall.success).toBe(false);
      expect(jsonCall.error.code).toBe('BAD_REQUEST');
      expect(jsonCall.error.message).toBe('No file provided');
    });

    it('should pass file data and user ID to upload service', async () => {
      const mockFile = {
        originalname: 'report.pdf',
        mimetype: 'application/pdf',
        buffer: Buffer.from([0x25, 0x50, 0x44, 0x46]),
        size: 2048,
      };

      const { req, res } = createMockReqRes({ file: mockFile } as any);

      mockFileSvc.upload.mockResolvedValue({
        pk_file_attachment: 'attach-2',
        file_original_name: 'report.pdf',
        file_mime_type: 'application/pdf',
        file_size_bytes: 2048,
      });

      await fileController.uploadFile(req, res);

      expect(mockFileSvc.upload).toHaveBeenCalledWith(
        {
          originalname: 'report.pdf',
          mimetype: 'application/pdf',
          buffer: expect.any(Buffer),
          size: 2048,
        },
        'user-123'
      );
    });

    it('should handle PNG files', async () => {
      const mockFile = {
        originalname: 'image.png',
        mimetype: 'image/png',
        buffer: Buffer.from([0x89, 0x50, 0x4E, 0x47]),
        size: 4096,
      };

      const { req, res } = createMockReqRes({ file: mockFile } as any);

      mockFileSvc.upload.mockResolvedValue({
        pk_file_attachment: 'attach-3',
        file_original_name: 'image.png',
        file_mime_type: 'image/png',
        file_size_bytes: 4096,
      });

      await fileController.uploadFile(req, res);

      expect(res.status).toHaveBeenCalledWith(201);
    });

    it('should propagate service errors', async () => {
      const mockFile = {
        originalname: 'bad.exe',
        mimetype: 'application/x-executable',
        buffer: Buffer.from([0x4D, 0x5A]),
        size: 1024,
      };

      const { req, res } = createMockReqRes({ file: mockFile } as any);

      mockFileSvc.upload.mockRejectedValue(new Error('File type not allowed'));

      await expect(fileController.uploadFile(req, res)).rejects.toThrow('File type not allowed');
    });
  });
});
