import Groq from 'groq-sdk';
import { BaseAIProvider } from './base';
import { logger } from '../utils/logger';
import { GROQ_LLAMA_70B_MODEL, MAX_REVIEW_TOKENS, VALIDATION_MAX_TOKENS } from '../config/constants';

export class GroqProvider extends BaseAIProvider {
  private client: Groq;
  private model: string;

  constructor(apiKey: string, model: string = GROQ_LLAMA_70B_MODEL) {
    super();
    this.client = new Groq({ apiKey });
    this.model = model;
  }

  async sendPrompt(prompt: string, context?: Record<string, any>): Promise<string> {
    try {
      logger.logApiRequest('Groq', this.model, { promptLength: prompt.length });

      const response = await this.client.chat.completions.create({
        model: this.model,
        max_tokens: MAX_REVIEW_TOKENS,
        messages: [
          {
            role: 'user',
            content: prompt,
          },
        ],
      });

      const text = response.choices[0]?.message?.content;

      logger.logApiResponse('Groq', 200, text?.length ?? 0);
      logger.log('api', `Tokens: input=${response.usage?.prompt_tokens}, output=${response.usage?.completion_tokens}`);

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
      await this.client.chat.completions.create({
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
    return 'Groq (Llama)';
  }
}
