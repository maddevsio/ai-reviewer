import OpenAI from 'openai';
import { BaseAIProvider } from './base';
import { logger } from '../utils/logger';
import { GPT_51_MODEL, MAX_REVIEW_TOKENS, VALIDATION_MAX_TOKENS } from '../config/constants';

export class OpenAIProvider extends BaseAIProvider {
  private client: OpenAI;
  private model: string;

  constructor(apiKey: string, model: string = GPT_51_MODEL) {
    super();
    this.client = new OpenAI({ apiKey });
    this.model = model;
  }

  async sendPrompt(prompt: string, context?: Record<string, any>): Promise<string> {
    try {
      const instructions = context?.systemPrompt as string | undefined;
      const input = context?.userPrompt as string ?? prompt;

      logger.logApiRequest('OpenAI', this.model, { promptLength: input.length });

      const response = await this.client.responses.create({
        model: this.model,
        max_output_tokens: MAX_REVIEW_TOKENS,
        instructions: instructions ?? undefined,
        input,
      });

      const text = response.output_text;

      logger.logApiResponse('OpenAI', 200, text?.length ?? 0);
      logger.log('api', `Tokens: input=${response.usage?.input_tokens}, output=${response.usage?.output_tokens}`);

      if (!text) {
        throw new Error('No text content in response');
      }

      return text;
    } catch (error) {
      this.handleError(error);
    }
  }

  async validateCredentials(): Promise<boolean> {
    try {
      await this.client.responses.create({
        model: this.model,
        max_output_tokens: VALIDATION_MAX_TOKENS,
        input: 'test',
      });
      return true;
    } catch (error) {
      return false;
    }
  }

  getName(): string {
    return 'OpenAI (GPT)';
  }
}
