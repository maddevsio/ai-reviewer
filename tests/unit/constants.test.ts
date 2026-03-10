import { describe, it, expect } from 'vitest';
import { API_KEY_VALIDATION, STRICTNESS_LEVELS } from '../../src/config/constants';

describe('API_KEY_VALIDATION', () => {
  describe('anthropic', () => {
    const { validate } = API_KEY_VALIDATION.anthropic;

    it('accepts a key starting with sk-ant-', () => {
      expect(validate('sk-ant-api01-xxxxxxxxxxxx')).toBe(true);
    });

    it('rejects a key not starting with sk-ant-', () => {
      const result = validate('sk-other-xxxx');
      expect(typeof result).toBe('string');
      expect(result as string).toContain('sk-ant-');
    });

    it('rejects an empty string', () => {
      const result = validate('');
      expect(typeof result).toBe('string');
    });

    it('rejects a key with only the sk- prefix (not sk-ant-)', () => {
      const result = validate('sk-xxxx');
      expect(typeof result).toBe('string');
    });
  });

  describe('google', () => {
    const { validate } = API_KEY_VALIDATION.google;

    it('accepts a key starting with AIza', () => {
      expect(validate('AIzaSyXXXXXXXXXX')).toBe(true);
    });

    it('rejects a key not starting with AIza', () => {
      const result = validate('sk-google-xxxx');
      expect(typeof result).toBe('string');
      expect(result as string).toContain('AIza');
    });

    it('rejects an empty string', () => {
      expect(typeof validate('')).toBe('string');
    });
  });

  describe('openai', () => {
    const { validate } = API_KEY_VALIDATION.openai;

    it('accepts a key starting with sk-', () => {
      expect(validate('sk-proj-xxxx')).toBe(true);
    });

    it('accepts any key starting with sk- prefix', () => {
      expect(validate('sk-xxxx')).toBe(true);
    });

    it('rejects a key not starting with sk-', () => {
      const result = validate('pk-xxxx');
      expect(typeof result).toBe('string');
      expect(result as string).toContain('sk-');
    });

    it('rejects an empty string', () => {
      expect(typeof validate('')).toBe('string');
    });
  });

  describe('groq', () => {
    const { validate } = API_KEY_VALIDATION.groq;

    it('accepts a key starting with gsk_', () => {
      expect(validate('gsk_xxxxxxxxxxxx')).toBe(true);
    });

    it('rejects a key not starting with gsk_', () => {
      const result = validate('sk-groq-xxxx');
      expect(typeof result).toBe('string');
      expect(result as string).toContain('gsk_');
    });

    it('rejects an empty string', () => {
      expect(typeof validate('')).toBe('string');
    });
  });
});

describe('STRICTNESS_LEVELS', () => {
  it('defines all five levels', () => {
    expect(Object.keys(STRICTNESS_LEVELS)).toEqual(['easy', 'normal', 'balanced', 'strict', 'pedantic']);
  });

  it('each level has the required fields', () => {
    for (const level of Object.values(STRICTNESS_LEVELS)) {
      expect(typeof level.short).toBe('string');
      expect(typeof level.doom).toBe('string');
      expect(typeof level.description).toBe('string');
      expect(typeof level.instructions).toBe('string');
      expect(level.instructions.length).toBeGreaterThan(0);
    }
  });

  it('short keys match the map keys', () => {
    for (const [key, level] of Object.entries(STRICTNESS_LEVELS)) {
      expect(level.short).toBe(key);
    }
  });

  it('all instructions are distinct', () => {
    const instructions = Object.values(STRICTNESS_LEVELS).map((l) => l.instructions);
    const unique = new Set(instructions);
    expect(unique.size).toBe(instructions.length);
  });
});
