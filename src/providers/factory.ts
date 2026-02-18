import { AIProvider } from './base';
import { AnthropicProvider } from './anthropic';
import { OpenAIProvider } from './openai';
import { GoogleProvider } from './google';
import { GroqProvider } from './groq';
import { getConfig } from '../config/manager';

export function createAIProvider(): AIProvider {
  const provider = getConfig('provider');
  const apiKey = getConfig('api-key');

  if (!provider) {
    throw new Error('AI provider not configured. Run: ai-review config set provider <anthropic|google|groq>');
  }

  if (!apiKey) {
    throw new Error('API key not configured. Run: ai-review config set api-key <your-key>');
  }

  switch (provider) {
    case 'anthropic':
      return new AnthropicProvider(apiKey);

    case 'openai':
      return new OpenAIProvider(apiKey);

    case 'google':
      const googleModel = getConfig('google-model');
      return new GoogleProvider(apiKey, googleModel);

    case 'groq':
      const groqModel = getConfig('groq-model');
      return new GroqProvider(apiKey, groqModel);

    default:
      throw new Error(`Unknown provider: ${provider}`);
  }
}
