import type { AiProvider } from './ai-provider.interface';
import { OpenAIProvider } from './openai.provider';
import { GeminiProvider } from './gemini.provider';
import { ClaudeProvider } from './claude.provider';
import { GrokProvider } from './grok.provider';
import { env } from '../../config/environment';

/**
 * Registry of available AI providers.
 * Each provider uses the AI_API_KEY and AI_MODEL environment variables.
 *
 * Supported providers:
 *   - openai:  OpenAI API (gpt-4o-mini, gpt-4o, etc.)
 *   - gemini:  Google Gemini via OpenAI-compatible endpoint (gemini-2.0-flash, etc.)
 *   - claude:  Anthropic Claude via Messages API (claude-sonnet-4-20250514, etc.)
 *   - grok:    xAI Grok via OpenAI-compatible endpoint (grok-3-mini, etc.)
 */
const providerRegistry: Record<string, () => AiProvider> = {
  openai: () => new OpenAIProvider(),
  gemini: () => new GeminiProvider(),
  claude: () => new ClaudeProvider(),
  grok: () => new GrokProvider(),
};

// Cached singleton instance
let cachedProvider: AiProvider | null = null;
let cachedProviderName: string | null = null;

/**
 * Get the AI provider based on the AI_PROVIDER environment variable.
 * Returns a singleton instance.
 *
 * @throws Error if the provider is not supported
 */
export function getAiProvider(): AiProvider {
  const providerName = env.AI_PROVIDER;

  // Return cached instance if same provider
  if (cachedProvider && cachedProviderName === providerName) {
    return cachedProvider;
  }

  const factory = providerRegistry[providerName];
  if (!factory) {
    throw new Error(
      `Unsupported AI provider: "${providerName}". Available providers: ${Object.keys(providerRegistry).join(', ')}`
    );
  }

  cachedProvider = factory();
  cachedProviderName = providerName;
  return cachedProvider;
}

/**
 * Register a new AI provider.
 * Allows extending the system with custom providers.
 */
export function registerProvider(name: string, factory: () => AiProvider): void {
  providerRegistry[name] = factory;
  if (cachedProviderName === name) {
    cachedProvider = null;
    cachedProviderName = null;
  }
}

/**
 * Clear the cached provider instance (useful for testing).
 */
export function clearProviderCache(): void {
  cachedProvider = null;
  cachedProviderName = null;
}

/**
 * Get list of available provider names.
 */
export function getAvailableProviders(): string[] {
  return Object.keys(providerRegistry);
}
