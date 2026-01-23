/**
 * Base interface for AI providers
 * All AI providers (Anthropic, OpenAI, Google) must implement this interface
 */

export interface AIProvider {
  /**
   * Send a prompt to the AI provider and get a response
   */
  sendPrompt(prompt: string, context?: Record<string, any>): Promise<string>;

  /**
   * Validate that the provider is properly configured with credentials
   */
  validateCredentials(): Promise<boolean>;

  /**
   * Get the name of this provider
   */
  getName(): string;
}

export abstract class BaseAIProvider implements AIProvider {
  abstract sendPrompt(prompt: string, context?: Record<string, any>): Promise<string>;
  abstract validateCredentials(): Promise<boolean>;
  abstract getName(): string;

  protected handleError(error: any): never {
    if (error.response?.status === 401) {
      throw new Error('Invalid API key. Please check your configuration.');
    } else if (error.response?.status === 429) {
      throw new Error('Rate limit exceeded. Please try again later.');
    } else if (error.code === 'ENOTFOUND' || error.code === 'ECONNREFUSED') {
      throw new Error('Network error. Please check your internet connection.');
    }
    throw error;
  }
}
