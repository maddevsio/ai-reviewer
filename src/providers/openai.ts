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
      // Use split system/user messages when available for better instruction following
      const systemPrompt = context?.systemPrompt as string | undefined;
      const userPrompt = context?.userPrompt as string | undefined;

      const messages: OpenAI.ChatCompletionMessageParam[] = systemPrompt && userPrompt
        ? [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt },
          ]
        : [
            { role: 'user', content: prompt },
          ];

      logger.logApiRequest('OpenAI', this.model, { promptLength: prompt.length });

      const response = await this.client.chat.completions.create({
        model: this.model,
        max_completion_tokens: MAX_REVIEW_TOKENS,
        messages,
      });

      const text = response.choices[0]?.message?.content;

      logger.logApiResponse('OpenAI', 200, text?.length ?? 0);
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
        max_completion_tokens: VALIDATION_MAX_TOKENS,
        messages: [{ role: 'user', content: 'test' }],
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
