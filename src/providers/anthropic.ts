import Anthropic from '@anthropic-ai/sdk';
import { BaseAIProvider } from './base';

export class AnthropicProvider extends BaseAIProvider {
  private client: Anthropic;
  private model: string;

  constructor(apiKey: string, model: string = 'claude-sonnet-4-5-20250929') {
    super();
    this.client = new Anthropic({ apiKey });
    this.model = model;
  }

  async sendPrompt(prompt: string, context?: Record<string, any>): Promise<string> {
    try {
      const response = await this.client.messages.create({
        model: this.model,
        max_tokens: 4096,
        messages: [
          {
            role: 'user',
            content: prompt,
          },
        ],
      });

      // Extract text from response
      const textContent = response.content.find((block) => block.type === 'text');
      if (!textContent || textContent.type !== 'text') {
        throw new Error('No text content in response');
      }

      return textContent.text;
    } catch (error) {
      this.handleError(error);
    }
  }

  async validateCredentials(): Promise<boolean> {
    try {
      // Try a minimal API call to check if credentials work
      await this.client.messages.create({
        model: this.model,
        max_tokens: 10,
        messages: [{ role: 'user', content: 'test' }],
      });
      return true;
    } catch (error) {
      return false;
    }
  }

  getName(): string {
    return 'Anthropic (Claude)';
  }
}
