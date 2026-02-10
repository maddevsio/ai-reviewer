import inquirer from 'inquirer';
import chalk from 'chalk';
import { ReviewStrictness } from '../config/manager';
import { STRICTNESS_LEVELS, StrictnessLevel } from '../config/constants';
import { SECONDARY_COLOR } from './colors';

/**
 * Interactive strictness level selection prompt.
 * @param options.includeSkip - adds a "Skip" option and returns null if chosen
 */
export async function askStrictnessLevel(options?: { includeSkip?: boolean }): Promise<ReviewStrictness | null> {
  const choices = Object.values(STRICTNESS_LEVELS).map((level) => ({
    name: `${level.doom} (${level.short}) - ${level.description}`,
    value: level.short,
  }));

  if (options?.includeSkip) {
    choices.push({
      name: chalk.hex(SECONDARY_COLOR)('Skip (will be asked with each review, can set later via config)'),
      value: 'skip' as ReviewStrictness,
    });
  }

  const { selectedStrictness } = await inquirer.prompt([
    {
      type: 'list',
      name: 'selectedStrictness',
      message: 'Select review strictness:',
      choices,
      default: 'balanced',
    },
  ]);

  if (selectedStrictness === 'skip') return null;
  return selectedStrictness as ReviewStrictness;
}

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
