import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { logger, enableVerboseLogging } from '../../src/utils/logger';
import type { LogCategory } from '../../src/utils/logger';

const ALL_CATEGORIES: LogCategory[] = ['api', 'api-detailed', 'config', 'prompt', 'diff', 'platform'];

describe('Logger', () => {
  beforeEach(() => {
    logger.disable();
  });

  describe('initial state', () => {
    it('has no categories enabled by default', () => {
      for (const cat of ALL_CATEGORIES) {
        expect(logger.isEnabled(cat)).toBe(false);
      }
    });
  });

  describe('enable(categories)', () => {
    it('enables a single specific category', () => {
      logger.enable(['api']);
      expect(logger.isEnabled('api')).toBe(true);
    });

    it('does not enable other categories when enabling one', () => {
      logger.enable(['api']);
      for (const cat of ALL_CATEGORIES.filter((c) => c !== 'api')) {
        expect(logger.isEnabled(cat)).toBe(false);
      }
    });

    it('enables multiple categories at once', () => {
      logger.enable(['api', 'config']);
      expect(logger.isEnabled('api')).toBe(true);
      expect(logger.isEnabled('config')).toBe(true);
      expect(logger.isEnabled('diff')).toBe(false);
    });

    it('auto-enables api when api-detailed is requested', () => {
      logger.enable(['api-detailed']);
      expect(logger.isEnabled('api-detailed')).toBe(true);
      expect(logger.isEnabled('api')).toBe(true);
    });

    it('does not auto-enable api-detailed when only api is requested', () => {
      logger.enable(['api']);
      expect(logger.isEnabled('api')).toBe(true);
      expect(logger.isEnabled('api-detailed')).toBe(false);
    });

    it('accumulates categories across multiple enable calls', () => {
      logger.enable(['api']);
      logger.enable(['config']);
      expect(logger.isEnabled('api')).toBe(true);
      expect(logger.isEnabled('config')).toBe(true);
    });
  });

  describe('enable("all")', () => {
    it('enables all six categories', () => {
      logger.enable('all');
      for (const cat of ALL_CATEGORIES) {
        expect(logger.isEnabled(cat)).toBe(true);
      }
    });
  });

  describe('disable()', () => {
    it('clears all enabled categories', () => {
      logger.enable('all');
      logger.disable();
      for (const cat of ALL_CATEGORIES) {
        expect(logger.isEnabled(cat)).toBe(false);
      }
    });

    it('can be called when already disabled without throwing', () => {
      expect(() => logger.disable()).not.toThrow();
    });
  });
});

describe('enableVerboseLogging', () => {
  afterEach(() => {
    logger.disable();
  });

  it('enables all categories when passed true (boolean)', () => {
    enableVerboseLogging(true);
    for (const cat of ALL_CATEGORIES) {
      expect(logger.isEnabled(cat)).toBe(true);
    }
  });

  it('enables all categories when passed the string "true"', () => {
    enableVerboseLogging('true');
    for (const cat of ALL_CATEGORIES) {
      expect(logger.isEnabled(cat)).toBe(true);
    }
  });

  it('enables only specified categories from comma-separated string', () => {
    enableVerboseLogging('api,config');
    expect(logger.isEnabled('api')).toBe(true);
    expect(logger.isEnabled('config')).toBe(true);
    expect(logger.isEnabled('diff')).toBe(false);
    expect(logger.isEnabled('prompt')).toBe(false);
  });

  it('auto-enables api when api-detailed is in the string', () => {
    enableVerboseLogging('api-detailed');
    expect(logger.isEnabled('api-detailed')).toBe(true);
    expect(logger.isEnabled('api')).toBe(true);
  });

  it('filters out invalid categories silently when at least one valid category exists', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    enableVerboseLogging('api,invalid-category');
    expect(logger.isEnabled('api')).toBe(true);
    expect(warnSpy).not.toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it('prints a warning and enables nothing when all categories are invalid', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    enableVerboseLogging('totally-invalid');
    for (const cat of ALL_CATEGORIES) {
      expect(logger.isEnabled(cat)).toBe(false);
    }
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });
});
