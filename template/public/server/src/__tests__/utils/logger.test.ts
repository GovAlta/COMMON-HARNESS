import { describe, it, expect } from 'vitest';
import winston from 'winston';
import logger from '../../utils/logger';

describe('logger', () => {
  it('should export a winston Logger instance', () => {
    expect(logger).toBeDefined();
    expect(logger).toBeInstanceOf(winston.Logger);
  });

  it('should have the expected log levels', () => {
    expect(typeof logger.error).toBe('function');
    expect(typeof logger.warn).toBe('function');
    expect(typeof logger.info).toBe('function');
    expect(typeof logger.debug).toBe('function');
  });

  it('should have a Console transport', () => {
    const consoleTransport = logger.transports.find(
      (t) => t instanceof winston.transports.Console
    );
    expect(consoleTransport).toBeDefined();
  });

  it('should have defaultMeta with service name and environment', () => {
    expect(logger.defaultMeta).toMatchObject({ service: 'app-template' });
    expect(typeof (logger.defaultMeta as Record<string, unknown>).environment).toBe('string');
  });

  it('should use debug level in test/development environment', () => {
    // In test env (NODE_ENV=test), isProduction is false, so level should be debug
    expect(logger.level).toBe('debug');
  });
});
