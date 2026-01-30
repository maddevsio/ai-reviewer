import { ReviewStrictness } from '../config/manager';

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

export function getStrictnessLevel(level: ReviewStrictness): StrictnessLevel {
  return STRICTNESS_LEVELS[level];
}

export function getStrictnessDisplayName(level: ReviewStrictness): string {
  const strictnessLevel = getStrictnessLevel(level);
  return `${strictnessLevel.doom} (${strictnessLevel.short})`;
}

export function getStrictnessInstructions(level: ReviewStrictness): string {
  return getStrictnessLevel(level).instructions;
}

export function isValidStrictness(value: string): value is ReviewStrictness {
  return ['easy', 'normal', 'balanced', 'strict', 'pedantic'].includes(value);
}
