import { AIProvider, Platform, ReviewStrictness, ConfigSchema } from './manager';

// --- Models ---
export const SONNET_45_MODEL = 'claude-sonnet-4-5-20250929';
export const GEMINI_25_FLASH_MODEL = 'gemini-2.5-flash';
export const GEMINI_3_FLASH_MODEL = 'gemini-3-flash-preview';
export const GROQ_LLAMA_70B_MODEL = 'llama-3.3-70b-versatile';
export const GROQ_LLAMA_4_SCOUT_MODEL = 'meta-llama/llama-4-scout-17b-16e-instruct';
export const GROQ_LLAMA_8B_MODEL = 'llama-3.1-8b-instant';

// --- API defaults ---
export const BITBUCKET_API_BASE_URL = 'https://api.bitbucket.org/2.0';
export const DEFAULT_GITLAB_URL = 'https://gitlab.com';
export const DEFAULT_PAGINATION_SIZE = 50;

// --- AI token limits ---
export const MAX_REVIEW_TOKENS = 4096;
export const VALIDATION_MAX_TOKENS = 10;
export const CHARS_PER_TOKEN_ESTIMATE = 4;

// --- UI ---
export const SEPARATOR_CHAR = '━';
export const SEPARATOR_WIDTH = 70;

// --- Sensitive config keys ---
export const SENSITIVE_KEYS: Array<keyof import('./manager').ConfigSchema> = [
  'api-key',
  'bitbucket-api-token',
  'gitlab-token',
];

/**
 * Config keys owned by each AI provider.
 * Used by configCleanup to remove stale keys when switching providers.
 */
export const PROVIDER_CONFIG_KEYS: Partial<Record<AIProvider, Array<keyof ConfigSchema>>> = {
  google: ['google-model'],
  groq: ['groq-model'],
};

/**
 * Config keys owned by each git platform.
 * Used by configCleanup to remove stale keys when switching platforms.
 */
export const PLATFORM_CONFIG_KEYS: Partial<Record<Platform, Array<keyof ConfigSchema>>> = {
  bitbucket: ['bitbucket-workspace', 'bitbucket-repo-slug', 'bitbucket-api-token', 'bitbucket-reviewer-uuid'],
  gitlab: ['gitlab-token', 'gitlab-project-id', 'gitlab-url'],
};

/**
 * Human-readable display names for AI providers
 */
export const PROVIDER_DISPLAY_NAMES: Record<AIProvider, string> = {
  anthropic: 'Anthropic',
  google: 'Google',
  openai: 'OpenAI',
  groq: 'Groq',
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
  groq: {
    prefix: 'gsk_',
    validate: (key: string) => {
      if (!key.startsWith('gsk_')) {
        return 'Groq API keys should start with "gsk_"';
      }
      return true;
    },
  },
};

/**
 * Strictness level definitions for AI code review
 */
export interface StrictnessLevel {
  short: ReviewStrictness;
  doom: string;
  description: string;
  instructions: string;
}

export const STRICTNESS_LEVELS: Record<ReviewStrictness, StrictnessLevel> = {
  easy: {
    short: 'easy',
    doom: "They're Too Young to Die",
    description: 'Only critical/breaking issues',
    instructions: 'Focus ONLY on critical bugs, security vulnerabilities, and breaking changes. Ignore style, conventions, and minor improvements.',
  },
  normal: {
    short: 'normal',
    doom: 'Not Too Rough',
    description: 'Important issues and best practices',
    instructions: 'Review important issues including bugs, security concerns, performance problems, and significant best practice violations. Minor style issues can be ignored.',
  },
  balanced: {
    short: 'balanced',
    doom: 'Hurt Them Plenty',
    description: 'Balanced, recommended',
    instructions: 'Provide balanced review covering bugs, security, performance, best practices, code maintainability, and important style issues. This is the recommended setting.',
  },
  strict: {
    short: 'strict',
    doom: 'Ultra-Violence',
    description: 'Strict code quality',
    instructions: 'Strict review including all issues from balanced mode plus thorough code quality checks, naming conventions, documentation completeness, and comprehensive test coverage.',
  },
  pedantic: {
    short: 'pedantic',
    doom: 'Watch Them Die',
    description: 'Everything matters',
    instructions: 'Pedantic review covering EVERYTHING: all code quality issues, every style inconsistency, all missing documentation, code formatting, variable naming, comment quality, and even minor optimizations.',
  },
};
