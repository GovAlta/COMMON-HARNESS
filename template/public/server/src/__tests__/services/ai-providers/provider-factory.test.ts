import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  getAiProvider,
  registerProvider,
  clearProviderCache,
  getAvailableProviders,
} from '../../../services/ai-providers/provider-factory';
import { OpenAIProvider } from '../../../services/ai-providers/openai.provider';
import type { AiProvider } from '../../../services/ai-providers/ai-provider.interface';
import { env } from '../../../config/environment';

// The factory reads env.AI_PROVIDER (cached from process.env at module load).
// Tests mutate the cached `env` object directly so the factory sees the change
// — mutating process.env after load would have no effect.

describe('Provider Factory', () => {
  const originalEnvProvider = env.AI_PROVIDER;

  beforeEach(() => {
    clearProviderCache();
    env.AI_PROVIDER = originalEnvProvider;
  });

  afterEach(() => {
    env.AI_PROVIDER = originalEnvProvider;
    clearProviderCache();
  });

  describe('getAiProvider', () => {
    it('should return OpenAI provider by default', () => {
      env.AI_PROVIDER = 'openai';
      const provider = getAiProvider();
      expect(provider).toBeInstanceOf(OpenAIProvider);
      expect(provider.name).toBe('openai');
    });

    it('should return OpenAI provider when AI_PROVIDER=openai', () => {
      env.AI_PROVIDER = 'openai';
      const provider = getAiProvider();
      expect(provider).toBeInstanceOf(OpenAIProvider);
    });

    it('should throw for unsupported provider', () => {
      env.AI_PROVIDER = 'unknown-provider';
      expect(() => getAiProvider()).toThrow('Unsupported AI provider: "unknown-provider"');
    });

    it('should return cached instance on subsequent calls', () => {
      env.AI_PROVIDER = 'openai';
      const provider1 = getAiProvider();
      const provider2 = getAiProvider();
      expect(provider1).toBe(provider2);
    });

    it('should create new instance after cache cleared', () => {
      env.AI_PROVIDER = 'openai';
      const provider1 = getAiProvider();
      clearProviderCache();
      const provider2 = getAiProvider();
      expect(provider1).not.toBe(provider2);
    });
  });

  describe('registerProvider', () => {
    it('should register a custom provider', () => {
      const customProvider: AiProvider = {
        name: 'custom',
        isAvailable: () => true,
        chat: async () => 'custom response',
        streamChat: async () => {},
        analyzeImage: async () => 'custom analysis',
      };

      registerProvider('custom', () => customProvider);
      env.AI_PROVIDER = 'custom';

      const provider = getAiProvider();
      expect(provider.name).toBe('custom');
    });

    it('should clear cache when registering existing provider name', () => {
      env.AI_PROVIDER = 'openai';
      getAiProvider();

      registerProvider('openai', () => ({
        name: 'openai-v2',
        isAvailable: () => true,
        chat: async () => '',
        streamChat: async () => {},
        analyzeImage: async () => '',
      }));

      const provider2 = getAiProvider();
      expect(provider2.name).toBe('openai-v2');
    });
  });

  describe('getAvailableProviders', () => {
    it('should return list of registered providers', () => {
      const providers = getAvailableProviders();
      expect(providers).toContain('openai');
    });

    it('should include custom registered providers', () => {
      registerProvider('anthropic', () => ({
        name: 'anthropic',
        isAvailable: () => true,
        chat: async () => '',
        streamChat: async () => {},
        analyzeImage: async () => '',
      }));

      const providers = getAvailableProviders();
      expect(providers).toContain('openai');
      expect(providers).toContain('anthropic');
    });
  });
});
