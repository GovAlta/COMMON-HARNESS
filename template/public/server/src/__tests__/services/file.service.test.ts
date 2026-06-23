import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock file model
vi.mock('../../models/file.model', () => ({
  create: vi.fn(),
  linkToSubmission: vi.fn(),
}));

import * as fileModel from '../../models/file.model';
import * as fileService from '../../services/file.service';

const mockFileModel = fileModel as unknown as {
  create: ReturnType<typeof vi.fn>;
  linkToSubmission: ReturnType<typeof vi.fn>;
};

describe('File Service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('generateStoredName', () => {
    it('should generate a UUID-based filename with original extension', () => {
      const result = fileService.generateStoredName('photo.jpg');
      expect(result).toMatch(/^[0-9a-f-]+\.jpg$/);
    });

    it('should preserve .pdf extension', () => {
      const result = fileService.generateStoredName('report.pdf');
      expect(result).toMatch(/^[0-9a-f-]+\.pdf$/);
    });

    it('should preserve .png extension', () => {
      const result = fileService.generateStoredName('screenshot.PNG');
      expect(result).toMatch(/^[0-9a-f-]+\.png$/);
    });

    it('should generate unique names for same original filename', () => {
      const name1 = fileService.generateStoredName('photo.jpg');
      const name2 = fileService.generateStoredName('photo.jpg');
      expect(name1).not.toBe(name2);
    });
  });

  describe('upload', () => {
    it('should upload a valid JPEG file', async () => {
      const jpegBuffer = Buffer.from([0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 0x4A, 0x46]);
      const mockFile = {
        originalname: 'photo.jpg',
        mimetype: 'image/jpeg',
        buffer: jpegBuffer,
        size: 1024,
      };

      mockFileModel.create.mockResolvedValue({
        pk_file_attachment: 'attach-1',
        file_original_name: 'photo.jpg',
        file_mime_type: 'image/jpeg',
        file_size_bytes: 1024,
      });

      const result = await fileService.upload(mockFile, 'user-123');

      expect(result.pk_file_attachment).toBe('attach-1');
      expect(mockFileModel.create).toHaveBeenCalledWith(
        expect.objectContaining({
          originalName: 'photo.jpg',
          mimeType: 'image/jpeg',
          sizeBytes: 1024,
          storageProvider: 'database',
          createdBy: 'user-123',
        })
      );
    });

    it('should upload a valid PDF file', async () => {
      const pdfBuffer = Buffer.from([0x25, 0x50, 0x44, 0x46, 0x2D, 0x31, 0x2E, 0x34]);
      const mockFile = {
        originalname: 'report.pdf',
        mimetype: 'application/pdf',
        buffer: pdfBuffer,
        size: 2048,
      };

      mockFileModel.create.mockResolvedValue({
        pk_file_attachment: 'attach-2',
        file_original_name: 'report.pdf',
      });

      const result = await fileService.upload(mockFile, 'user-123');
      expect(result.pk_file_attachment).toBe('attach-2');
    });

    it('should reject disallowed MIME type', async () => {
      const mockFile = {
        originalname: 'malware.exe',
        mimetype: 'application/x-executable',
        buffer: Buffer.from([0x4D, 0x5A]),
        size: 1024,
      };

      await expect(fileService.upload(mockFile, 'user-123'))
        .rejects.toThrow('File type not allowed');
    });

    it('should reject file exceeding max size', async () => {
      const mockFile = {
        originalname: 'large.jpg',
        mimetype: 'image/jpeg',
        buffer: Buffer.from([0xFF, 0xD8, 0xFF]),
        size: 11 * 1024 * 1024, // 11 MB
      };

      await expect(fileService.upload(mockFile, 'user-123'))
        .rejects.toThrow('File size exceeds maximum');
    });

    it('should reject when magic bytes do not match declared type', async () => {
      // Declare as JPEG but content is actually PNG
      const pngBuffer = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);
      const mockFile = {
        originalname: 'fake.jpg',
        mimetype: 'image/jpeg',
        buffer: pngBuffer,
        size: 1024,
      };

      await expect(fileService.upload(mockFile, 'user-123'))
        .rejects.toThrow('File content does not match');
    });

    it('should generate a random stored name', async () => {
      const jpegBuffer = Buffer.from([0xFF, 0xD8, 0xFF, 0xE0]);
      const mockFile = {
        originalname: 'photo.jpg',
        mimetype: 'image/jpeg',
        buffer: jpegBuffer,
        size: 1024,
      };

      mockFileModel.create.mockResolvedValue({ pk_file_attachment: 'attach-1' });

      await fileService.upload(mockFile, 'user-123');

      const createArg = mockFileModel.create.mock.calls[0][0];
      expect(createArg.storedName).not.toBe('photo.jpg');
      expect(createArg.storedName).toMatch(/^[0-9a-f-]+\.jpg$/);
    });
  });

  describe('linkToSubmission', () => {
    it('should delegate to file model', async () => {
      mockFileModel.linkToSubmission.mockResolvedValue(undefined);

      await fileService.linkToSubmission(['file-1', 'file-2'], 'sub-1');

      expect(mockFileModel.linkToSubmission).toHaveBeenCalledWith(
        ['file-1', 'file-2'],
        'sub-1'
      );
    });
  });
});
