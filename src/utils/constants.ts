import { AIProvider, Platform } from '../config/manager';

/**
 * Human-readable display names for AI providers
 */
export const PROVIDER_DISPLAY_NAMES: Record<AIProvider, string> = {
  anthropic: 'Anthropic',
  google: 'Google',
  openai: 'OpenAI',
};

/**
 * Human-readable display names for git platforms
 */
export const PLATFORM_DISPLAY_NAMES: Record<Platform, string> = {
  github: 'GitHub',
  gitlab: 'GitLab',
  bitbucket: 'Bitbucket',
};

/**
 * API key validation rules for different providers
 */
export const API_KEY_VALIDATION: Record<
  AIProvider,
  {
    prefix: string;
    validate: (key: string) => boolean | string;
  }
> = {
  anthropic: {
    prefix: 'sk-ant-',
    validate: (key: string) => {
      if (!key.startsWith('sk-ant-')) {
        return 'Anthropic API keys should start with "sk-ant-"';
      }
      return true;
    },
  },
  google: {
    prefix: 'AIza',
    validate: (key: string) => {
      if (!key.startsWith('AIza')) {
        return 'Google API keys should start with "AIza"';
      }
      return true;
    },
  },
  openai: {
    prefix: 'sk-',
    validate: (key: string) => {
      if (!key.startsWith('sk-')) {
        return 'OpenAI API keys should start with "sk-"';
      }
      return true;
    },
  },
};
