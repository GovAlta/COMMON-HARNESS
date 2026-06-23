import { OpenAIProvider } from './openai.provider';
import { env } from '../../config/environment';

/**
 * xAI Grok AI provider.
 * Uses xAI's OpenAI-compatible endpoint, so we extend OpenAIProvider
 * and just change the base URL and default model.
 */
export class GrokProvider extends OpenAIProvider {
  override readonly name = 'grok';

  constructor(config?: { apiKey?: string; model?: string; maxTokens?: number }) {
    super({
      apiKey: config?.apiKey || env.AI_API_KEY,
      model: config?.model || env.AI_MODEL || 'grok-3-mini',
      maxTokens: config?.maxTokens,
      baseUrl: 'https://api.x.ai',
    });
  }
}
