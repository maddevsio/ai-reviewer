import { describe, it, expect } from 'vitest';
import {
  getStrictnessDisplayName,
  getStrictnessInstructions,
  isValidStrictness,
} from '../../src/utils/strictness';

describe('getStrictnessDisplayName', () => {
  it('returns the DOOM name and short name for easy', () => {
    const result = getStrictnessDisplayName('easy');
    expect(result).toContain("They're Too Young to Die");
    expect(result).toContain('easy');
  });

  it('returns the DOOM name and short name for normal', () => {
    const result = getStrictnessDisplayName('normal');
    expect(result).toContain('Not Too Rough');
    expect(result).toContain('normal');
  });

  it('returns the DOOM name and short name for balanced', () => {
    const result = getStrictnessDisplayName('balanced');
    expect(result).toContain('Hurt Them Plenty');
    expect(result).toContain('balanced');
  });

  it('returns the DOOM name and short name for strict', () => {
    const result = getStrictnessDisplayName('strict');
    expect(result).toContain('Ultra-Violence');
    expect(result).toContain('strict');
  });

  it('returns the DOOM name and short name for pedantic', () => {
    const result = getStrictnessDisplayName('pedantic');
    expect(result).toContain('Watch Them Die');
    expect(result).toContain('pedantic');
  });
});

describe('getStrictnessInstructions', () => {
  const levels = ['easy', 'normal', 'balanced', 'strict', 'pedantic'] as const;

  it.each(levels)('returns a non-empty string for %s', (level) => {
    expect(getStrictnessInstructions(level).length).toBeGreaterThan(0);
  });

  it('easy instructions focus on critical issues only', () => {
    expect(getStrictnessInstructions('easy').toLowerCase()).toContain('critical');
  });

  it('pedantic instructions cover everything', () => {
    expect(getStrictnessInstructions('pedantic').toUpperCase()).toContain('EVERYTHING');
  });

  it('balanced instructions mention recommended', () => {
    expect(getStrictnessInstructions('balanced').toLowerCase()).toContain('recommended');
  });

  it('all five instructions are distinct from each other', () => {
    const all = levels.map(getStrictnessInstructions);
    const unique = new Set(all);
    expect(unique.size).toBe(5);
  });
});

describe('isValidStrictness', () => {
  it.each(['easy', 'normal', 'balanced', 'strict', 'pedantic'])('returns true for "%s"', (v) => {
    expect(isValidStrictness(v)).toBe(true);
  });

  it('returns false for an unknown value', () => {
    expect(isValidStrictness('medium')).toBe(false);
  });

  it('returns false for an empty string', () => {
    expect(isValidStrictness('')).toBe(false);
  });

  it('returns false for a value with wrong casing', () => {
    expect(isValidStrictness('EASY')).toBe(false);
    expect(isValidStrictness('Balanced')).toBe(false);
  });

  it('returns false for a partially matching value', () => {
    expect(isValidStrictness('eas')).toBe(false);
  });
});
