import { describe, it, expect } from 'vitest';
import {
  detectMimeType,
  isAllowedMimeType,
  validateMimeType,
  validateFileSize,
  MAX_FILE_SIZE_BYTES,
  ALLOWED_MIME_TYPES,
} from '../../utils/file-validation';

describe('File Validation Utility', () => {
  describe('detectMimeType', () => {
    it('should detect JPEG from magic bytes', () => {
      const buffer = Buffer.from([0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10]);
      expect(detectMimeType(buffer)).toBe('image/jpeg');
    });

    it('should detect PNG from magic bytes', () => {
      const buffer = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);
      expect(detectMimeType(buffer)).toBe('image/png');
    });

    it('should detect WEBP from magic bytes', () => {
      const buffer = Buffer.from([
        0x52, 0x49, 0x46, 0x46, // RIFF
        0x00, 0x00, 0x00, 0x00, // file size placeholder
        0x57, 0x45, 0x42, 0x50, // WEBP
      ]);
      expect(detectMimeType(buffer)).toBe('image/webp');
    });

    it('should detect PDF from magic bytes', () => {
      const buffer = Buffer.from([0x25, 0x50, 0x44, 0x46, 0x2D, 0x31, 0x2E, 0x34]);
      expect(detectMimeType(buffer)).toBe('application/pdf');
    });

    it('should return null for unknown magic bytes', () => {
      const buffer = Buffer.from([0x4D, 0x5A, 0x90, 0x00]); // EXE header
      expect(detectMimeType(buffer)).toBeNull();
    });

    it('should return null for empty buffer', () => {
      expect(detectMimeType(Buffer.from([]))).toBeNull();
    });

    it('should return null for buffer too short', () => {
      expect(detectMimeType(Buffer.from([0xFF]))).toBeNull();
    });

    it('should not detect RIFF without WEBP signature as WEBP', () => {
      const buffer = Buffer.from([
        0x52, 0x49, 0x46, 0x46, // RIFF
        0x00, 0x00, 0x00, 0x00,
        0x41, 0x56, 0x49, 0x20, // AVI (not WEBP)
      ]);
      expect(detectMimeType(buffer)).not.toBe('image/webp');
    });
  });

  describe('isAllowedMimeType', () => {
    it('should allow JPEG', () => {
      expect(isAllowedMimeType('image/jpeg')).toBe(true);
    });

    it('should allow PNG', () => {
      expect(isAllowedMimeType('image/png')).toBe(true);
    });

    it('should allow WEBP', () => {
      expect(isAllowedMimeType('image/webp')).toBe(true);
    });

    it('should allow PDF', () => {
      expect(isAllowedMimeType('application/pdf')).toBe(true);
    });

    it('should allow GIF', () => {
      expect(isAllowedMimeType('image/gif')).toBe(true);
    });

    it('should allow text/plain and CSV', () => {
      expect(isAllowedMimeType('text/plain')).toBe(true);
      expect(isAllowedMimeType('text/csv')).toBe(true);
    });

    it('should allow Office Open XML formats', () => {
      expect(isAllowedMimeType('application/vnd.openxmlformats-officedocument.wordprocessingml.document')).toBe(true);
      expect(isAllowedMimeType('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')).toBe(true);
    });

    it('should reject executable', () => {
      expect(isAllowedMimeType('application/x-executable')).toBe(false);
    });

    it('should reject text/html (XSS vector)', () => {
      expect(isAllowedMimeType('text/html')).toBe(false);
    });

    it('should reject SVG (script-execution vector)', () => {
      expect(isAllowedMimeType('image/svg+xml')).toBe(false);
    });
  });

  describe('validateMimeType', () => {
    it('should validate matching JPEG content and declared type', () => {
      const buffer = Buffer.from([0xFF, 0xD8, 0xFF, 0xE0]);
      expect(validateMimeType(buffer, 'image/jpeg')).toBe(true);
    });

    it('should validate matching PNG content and declared type', () => {
      const buffer = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);
      expect(validateMimeType(buffer, 'image/png')).toBe(true);
    });

    it('should validate matching PDF content and declared type', () => {
      const buffer = Buffer.from([0x25, 0x50, 0x44, 0x46]);
      expect(validateMimeType(buffer, 'application/pdf')).toBe(true);
    });

    it('should reject mismatched JPEG declared vs PNG content', () => {
      const buffer = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]); // PNG
      expect(validateMimeType(buffer, 'image/jpeg')).toBe(false);
    });

    it('should reject disallowed declared MIME type', () => {
      const buffer = Buffer.from([0xFF, 0xD8, 0xFF]);
      expect(validateMimeType(buffer, 'application/x-executable')).toBe(false);
    });

    it('should reject unrecognizable content', () => {
      const buffer = Buffer.from([0x00, 0x00, 0x00, 0x00]);
      expect(validateMimeType(buffer, 'image/jpeg')).toBe(false);
    });
  });

  describe('validateFileSize', () => {
    it('should accept file within size limit', () => {
      expect(validateFileSize(1024)).toBe(true);
    });

    it('should accept file at exact size limit', () => {
      expect(validateFileSize(MAX_FILE_SIZE_BYTES)).toBe(true);
    });

    it('should reject file exceeding size limit', () => {
      expect(validateFileSize(MAX_FILE_SIZE_BYTES + 1)).toBe(false);
    });

    it('should reject zero-size file', () => {
      expect(validateFileSize(0)).toBe(false);
    });

    it('should reject negative size', () => {
      expect(validateFileSize(-1)).toBe(false);
    });
  });

  describe('constants', () => {
    it('should have correct MAX_FILE_SIZE_BYTES (10 MB)', () => {
      expect(MAX_FILE_SIZE_BYTES).toBe(10 * 1024 * 1024);
    });

    it('should include the core image + document set', () => {
      // Strict count keeps a guard against accidental allowlist drift.
      expect(ALLOWED_MIME_TYPES).toHaveLength(21);
      // Core types every consumer of this allowlist relies on.
      for (const t of [
        'image/jpeg',
        'image/png',
        'image/webp',
        'image/gif',
        'application/pdf',
        'text/plain',
        'text/csv',
        'application/json',
        'application/zip',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      ]) {
        expect(ALLOWED_MIME_TYPES).toContain(t);
      }
    });
  });
});
