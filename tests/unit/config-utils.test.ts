import { describe, it, expect, vi, beforeEach } from 'vitest';
import { isSensitiveKey, maskApiKey, configCleanup } from '../../src/utils/config';

// Mock config/manager to prevent Conf from reading/writing real files and to
// give tests full control over what getConfig returns.
vi.mock('../../src/config/manager', () => ({
  getConfig: vi.fn(),
  deleteConfig: vi.fn(),
}));

import { getConfig, deleteConfig } from '../../src/config/manager';
const mockGetConfig = vi.mocked(getConfig);
const mockDeleteConfig = vi.mocked(deleteConfig);

describe('isSensitiveKey', () => {
  it('returns true for api-key', () => {
    expect(isSensitiveKey('api-key')).toBe(true);
  });

  it('returns true for bitbucket-api-token', () => {
    expect(isSensitiveKey('bitbucket-api-token')).toBe(true);
  });

  it('returns true for gitlab-token', () => {
    expect(isSensitiveKey('gitlab-token')).toBe(true);
  });

  it('returns false for provider', () => {
    expect(isSensitiveKey('provider')).toBe(false);
  });

  it('returns false for platform', () => {
    expect(isSensitiveKey('platform')).toBe(false);
  });

  it('returns false for google-model', () => {
    expect(isSensitiveKey('google-model')).toBe(false);
  });

  it('returns false for groq-model', () => {
    expect(isSensitiveKey('groq-model')).toBe(false);
  });

  it('returns false for review-strictness', () => {
    expect(isSensitiveKey('review-strictness')).toBe(false);
  });
});

describe('maskApiKey', () => {
  it('returns *** for a key with 10 or fewer characters', () => {
    expect(maskApiKey('1234567890')).toBe('***');
  });

  it('returns *** for a key with exactly 10 characters', () => {
    expect(maskApiKey('1234567890')).toBe('***');
  });

  it('returns *** for a very short key', () => {
    expect(maskApiKey('abc')).toBe('***');
  });

  it('masks a key longer than 10 chars as first-8 + ... + last-4', () => {
    // 'sk-ant-api01-xxxx' → first 8 = 'sk-ant-a', last 4 = 'xxxx'
    expect(maskApiKey('sk-ant-api01-xxxx')).toBe('sk-ant-a...xxxx');
  });

  it('masks a 20-character key correctly', () => {
    const key = 'ABCDEFGHIJKLMNOPQRST'; // 20 chars
    expect(maskApiKey(key)).toBe('ABCDEFGH...QRST');
  });

  it('masks a real-looking API key', () => {
    const key = 'sk-ant-api01-AAAAAAAABBBBCCCC';
    // slice(0,8) = 'sk-ant-a', slice(-4) = 'CCCC'
    expect(maskApiKey(key)).toBe('sk-ant-a...CCCC');
  });
});

describe('configCleanup', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default: config values don't exist
    mockGetConfig.mockReturnValue(undefined);
  });

  describe('target=provider', () => {
    it('deletes google-model when current provider is not google', () => {
      mockGetConfig.mockImplementation((key: any) => {
        if (key === 'provider') return 'anthropic';
        if (key === 'google-model') return 'gemini-3-flash-preview';
        return undefined;
      });

      configCleanup('provider');

      expect(mockDeleteConfig).toHaveBeenCalledWith('google-model', 'global');
    });

    it('deletes groq-model when current provider is not groq', () => {
      mockGetConfig.mockImplementation((key: any) => {
        if (key === 'provider') return 'anthropic';
        if (key === 'groq-model') return 'llama-3.3-70b-versatile';
        return undefined;
      });

      configCleanup('provider');

      expect(mockDeleteConfig).toHaveBeenCalledWith('groq-model', 'global');
    });

    it('does not delete google-model when current provider is google', () => {
      mockGetConfig.mockImplementation((key: any) => {
        if (key === 'provider') return 'google';
        if (key === 'google-model') return 'gemini-3-flash-preview';
        return undefined;
      });

      configCleanup('provider');

      expect(mockDeleteConfig).not.toHaveBeenCalledWith('google-model', expect.anything());
    });

    it('does not call deleteConfig for keys that do not exist in config', () => {
      mockGetConfig.mockImplementation((key: any) => {
        if (key === 'provider') return 'anthropic';
        return undefined; // google-model and groq-model don't exist
      });

      configCleanup('provider');

      expect(mockDeleteConfig).not.toHaveBeenCalled();
    });
  });

  describe('target=platform', () => {
    it('deletes all bitbucket-* keys when current platform is github', () => {
      mockGetConfig.mockImplementation((key: any) => {
        if (key === 'platform') return 'github';
        if (key === 'bitbucket-workspace') return 'myworkspace';
        if (key === 'bitbucket-repo-slug') return 'my-repo';
        if (key === 'bitbucket-api-token') return 'tok';
        if (key === 'bitbucket-reviewer-uuid') return 'uuid';
        return undefined;
      });

      configCleanup('platform');

      expect(mockDeleteConfig).toHaveBeenCalledWith('bitbucket-workspace', 'global');
      expect(mockDeleteConfig).toHaveBeenCalledWith('bitbucket-repo-slug', 'global');
      expect(mockDeleteConfig).toHaveBeenCalledWith('bitbucket-api-token', 'global');
      expect(mockDeleteConfig).toHaveBeenCalledWith('bitbucket-reviewer-uuid', 'global');
    });

    it('deletes all gitlab-* keys when current platform is github', () => {
      mockGetConfig.mockImplementation((key: any) => {
        if (key === 'platform') return 'github';
        if (key === 'gitlab-token') return 'tok';
        if (key === 'gitlab-project-id') return '123';
        if (key === 'gitlab-url') return 'https://gitlab.com';
        return undefined;
      });

      configCleanup('platform');

      expect(mockDeleteConfig).toHaveBeenCalledWith('gitlab-token', 'global');
      expect(mockDeleteConfig).toHaveBeenCalledWith('gitlab-project-id', 'global');
      expect(mockDeleteConfig).toHaveBeenCalledWith('gitlab-url', 'global');
    });

    it('does not delete bitbucket-* keys when current platform is bitbucket', () => {
      mockGetConfig.mockImplementation((key: any) => {
        if (key === 'platform') return 'bitbucket';
        if (key === 'bitbucket-workspace') return 'myworkspace';
        return undefined;
      });

      configCleanup('platform');

      expect(mockDeleteConfig).not.toHaveBeenCalledWith('bitbucket-workspace', expect.anything());
    });
  });

  describe('target=undefined (cleans both)', () => {
    it('cleans both provider and platform keys', () => {
      mockGetConfig.mockImplementation((key: any) => {
        if (key === 'provider') return 'anthropic';
        if (key === 'platform') return 'github';
        if (key === 'google-model') return 'gemini-3-flash';
        if (key === 'gitlab-token') return 'tok';
        return undefined;
      });

      configCleanup(undefined, 'global');

      expect(mockDeleteConfig).toHaveBeenCalledWith('google-model', 'global');
      expect(mockDeleteConfig).toHaveBeenCalledWith('gitlab-token', 'global');
    });
  });
});
