import { AIProvider } from './base';
import { AnthropicProvider } from './anthropic';
import { getConfig } from '../config/manager';

export function createAIProvider(): AIProvider {
  const provider = getConfig('provider');
  const apiKey = getConfig('api-key');

  if (!provider) {
    throw new Error('AI provider not configured. Run: ai-review config set provider <anthropic|openai|google>');
  }

  if (!apiKey) {
    throw new Error('API key not configured. Run: ai-review config set api-key <your-key>');
  }

  switch (provider) {
    case 'anthropic':
      return new AnthropicProvider(apiKey);

    case 'openai':
      throw new Error('OpenAI provider not yet implemented');

    case 'google':
      throw new Error('Google provider not yet implemented');

    default:
      throw new Error(`Unknown provider: ${provider}`);
  }
}
