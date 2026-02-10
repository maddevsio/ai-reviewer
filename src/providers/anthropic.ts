import Anthropic from '@anthropic-ai/sdk';
import { BaseAIProvider } from './base';
import { logger } from '../utils/logger';
import { SONNET_45_MODEL, MAX_REVIEW_TOKENS, VALIDATION_MAX_TOKENS } from '../config/constants';

export class AnthropicProvider extends BaseAIProvider {
  private client: Anthropic;
  private model: string;

  constructor(apiKey: string, model: string = SONNET_45_MODEL) {
    super();
    this.client = new Anthropic({ apiKey });
    this.model = model;
  }

  async sendPrompt(prompt: string, context?: Record<string, any>): Promise<string> {
    try {
      logger.logApiRequest('Anthropic', this.model, { promptLength: prompt.length });

      const response = await this.client.messages.create({
        model: this.model,
        max_tokens: MAX_REVIEW_TOKENS,
        messages: [
          {
            role: 'user',
            content: prompt,
          },
        ],
      });

      logger.logApiResponse('Anthropic', 200, JSON.stringify(response).length);
      logger.log('api', `Tokens: input=${response.usage.input_tokens}, output=${response.usage.output_tokens}`);

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
        max_tokens: VALIDATION_MAX_TOKENS,
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
