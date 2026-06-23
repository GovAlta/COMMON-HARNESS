import type { AiChatMessage, AiProviderOptions, OnChunkCallback } from '../../types/ai';

/**
 * AI provider adapter interface.
 * All AI providers must implement this interface to be used by the AI service.
 * Supports both non-streaming and streaming chat, as well as image analysis.
 */
export interface AiProvider {
  /** Provider name identifier */
  readonly name: string;

  /**
   * Non-streaming chat — sends messages and returns the complete response.
   */
  chat(messages: AiChatMessage[], options?: AiProviderOptions): Promise<string>;

  /**
   * Streaming chat — sends messages and calls onChunk for each token received.
   */
  streamChat(
    messages: AiChatMessage[],
    options: AiProviderOptions | undefined,
    onChunk: OnChunkCallback
  ): Promise<void>;

  /**
   * Multi-image analysis — sends one or more images to the AI for analysis.
   * Can optionally stream the response via onChunk callback.
   */
  analyzeImages(
    images: Array<{ buffer: Buffer; mimeType: string }>,
    prompt: string,
    onChunk?: OnChunkCallback
  ): Promise<string>;

  /**
   * Check if the provider is available/configured.
   */
  isAvailable(): boolean;
}
