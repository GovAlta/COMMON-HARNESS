import { describe, it, expect } from 'vitest';
import { listServicesSchema, serviceIdSchema } from '../../validators/service.validator';

describe('Service Validator', () => {
  describe('listServicesSchema', () => {
    it('should accept valid query params', () => {
      const result = listServicesSchema.parse({
        page: '1',
        limit: '20',
      });

      expect(result.page).toBe(1);
      expect(result.limit).toBe(20);
    });

    it('should apply defaults when params are missing', () => {
      const result = listServicesSchema.parse({});

      expect(result.page).toBe(1);
      expect(result.limit).toBe(20);
    });

    it('should coerce string page and limit to numbers', () => {
      const result = listServicesSchema.parse({
        page: '3',
        limit: '10',
      });

      expect(result.page).toBe(3);
      expect(result.limit).toBe(10);
      expect(typeof result.page).toBe('number');
      expect(typeof result.limit).toBe('number');
    });

    it('should accept category filter', () => {
      const result = listServicesSchema.parse({
        category: 'Emergency Services',
      });

      expect(result.category).toBe('Emergency Services');
    });

    it('should accept search filter', () => {
      const result = listServicesSchema.parse({
        search: 'permit',
      });

      expect(result.search).toBe('permit');
    });

    it('should reject page less than 1', () => {
      expect(() => listServicesSchema.parse({ page: '0' })).toThrow();
    });

    it('should reject limit greater than 100', () => {
      expect(() => listServicesSchema.parse({ limit: '101' })).toThrow();
    });

    it('should reject non-integer page', () => {
      expect(() => listServicesSchema.parse({ page: '1.5' })).toThrow();
    });
  });

  describe('serviceIdSchema', () => {
    it('should accept valid UUID', () => {
      const result = serviceIdSchema.parse({
        id: '11111111-1111-1111-1111-111111111111',
      });

      expect(result.id).toBe('11111111-1111-1111-1111-111111111111');
    });

    it('should reject invalid UUID', () => {
      expect(() => serviceIdSchema.parse({ id: 'not-a-uuid' })).toThrow();
    });

    it('should reject missing id', () => {
      expect(() => serviceIdSchema.parse({})).toThrow();
    });

    it('should reject empty string', () => {
      expect(() => serviceIdSchema.parse({ id: '' })).toThrow();
    });
  });
});
