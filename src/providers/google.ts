import { GoogleGenerativeAI } from '@google/generative-ai';
import { BaseAIProvider } from './base';

export class GoogleProvider extends BaseAIProvider {
  private client: GoogleGenerativeAI;
  private model: string;

  constructor(apiKey: string, model: string = 'gemini-2.5-flash') {
    super();
    this.client = new GoogleGenerativeAI(apiKey);
    this.model = model;
  }

  async sendPrompt(prompt: string, context?: Record<string, any>): Promise<string> {
    try {
      const model = this.client.getGenerativeModel({ model: this.model });

      const result = await model.generateContent(prompt);
      const response = result.response;
      const text = response.text();

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
