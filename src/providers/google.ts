import { GoogleGenerativeAI } from '@google/generative-ai';
import { BaseAIProvider } from './base';
import { logger } from '../utils/logger';
import { GEMINI_25_FLASH_MODEL } from '../config/constants';

export class GoogleProvider extends BaseAIProvider {
  private client: GoogleGenerativeAI;
  private model: string;

  constructor(apiKey: string, model: string = GEMINI_25_FLASH_MODEL) {
    super();
    this.client = new GoogleGenerativeAI(apiKey);
    this.model = model;
  }

  async sendPrompt(prompt: string, context?: Record<string, any>): Promise<string> {
    try {
      logger.logApiRequest('Google Gemini', this.model, { promptLength: prompt.length });

      const model = this.client.getGenerativeModel({ model: this.model });

      const result = await model.generateContent(prompt);
      const response = result.response;
      const text = response.text();

      logger.logApiResponse('Google Gemini', 200, text.length);

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
      const model = this.client.getGenerativeModel({ model: this.model });
      await model.generateContent('test');
      return true;
    } catch (error) {
      return false;
    }
  }

  getName(): string {
    return 'Google (Gemini)';
  }
}
