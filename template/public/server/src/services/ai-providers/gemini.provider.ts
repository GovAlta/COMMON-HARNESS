import { OpenAIProvider } from './openai.provider';
import { env } from '../../config/environment';

/**
 * Google Gemini AI provider.
 * Uses Google's OpenAI-compatible endpoint, so we extend OpenAIProvider
 * and change the base URL, chat path, and default model.
 *
 * Gemini's OpenAI-compatible endpoint:
 *   POST https://generativelanguage.googleapis.com/v1beta/openai/chat/completions
 */
export class GeminiProvider extends OpenAIProvider {
  override readonly name = 'gemini';

  constructor(config?: { apiKey?: string; model?: string; maxTokens?: number }) {
    super({
      apiKey: config?.apiKey || env.AI_API_KEY,
      model: config?.model || env.AI_MODEL || 'gemini-2.0-flash',
      maxTokens: config?.maxTokens,
      baseUrl: 'https://generativelanguage.googleapis.com',
      chatPath: '/v1beta/openai/chat/completions',
    });
  }
}
