import * as readline from 'readline';
import chalk from 'chalk';
import inquirer from 'inquirer';
import { DISABLED_COLOR, WARNING_COLOR, SUCCESS_COLOR, SECONDARY_COLOR } from '../config/colors';

/**
 * Ask a yes/no question that requires explicit y or n keypress
 * Waits silently for valid input without showing error messages
 */
export async function askYesNo(message: string): Promise<boolean> {
  process.stdout.write(`? ${message} ${chalk.hex(DISABLED_COLOR)('(y/n)')} `);

  return new Promise((resolve) => {
    readline.emitKeypressEvents(process.stdin);

    if (process.stdin.isTTY) {
      process.stdin.setRawMode(true);
    }

    // Resume stdin to start listening
    process.stdin.resume();

    const onKeypress = (str: string, key: readline.Key) => {
      if (key && key.ctrl && key.name === 'c') {
        cleanup();
        process.exit(0);
      }

      const input = str?.toLowerCase();

      if (input === 'y') {
        cleanup();
        process.stdout.write('y\n');
        resolve(true);
      } else if (input === 'n') {
        cleanup();
        process.stdout.write('n\n');
        resolve(false);
      }
      // If any other key, just ignore and keep waiting
    };

    const cleanup = () => {
      process.stdin.removeListener('keypress', onKeypress);
      if (process.stdin.isTTY) {
        process.stdin.setRawMode(false);
      }
      process.stdin.pause();
    };

    process.stdin.on('keypress', onKeypress);
  });
}

/**
 * Ask for confirmation by requiring user to type 'yes'
 * User can press ESC to cancel
 */
export async function askConfirmation(message: string): Promise<boolean> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    readline.emitKeypressEvents(process.stdin);

    const handleEscape = (str: string, key: readline.Key) => {
      if (key && key.name === 'escape') {
        rl.close();
        process.stdout.write('\n');
        process.stdin.removeListener('keypress', handleEscape);
        resolve(false);
      }
    };

    process.stdin.on('keypress', handleEscape);

    rl.question(chalk.hex(WARNING_COLOR)(`${message} Type 'yes' to confirm (or press ESC to cancel): `), (answer) => {
      process.stdin.removeListener('keypress', handleEscape);
      rl.close();
      resolve(answer.toLowerCase() === 'yes');
    });
  });
}

/**
 * Interactive AI provider selection prompt
 */
export async function askProviderSelection(): Promise<string> {
  const { selectedProvider } = await inquirer.prompt([
    {
      type: 'list',
      name: 'selectedProvider',
      message: 'Select AI provider:',
      choices: [
        {
          name: `${chalk.hex(SUCCESS_COLOR)('✓')} Anthropic (Claude) - Available`,
          value: 'anthropic',
        },
        {
          name: `${chalk.hex(SUCCESS_COLOR)('✓')} Google (Gemini) - Available (Free tier)`,
          value: 'google',
        },
        {
          name: `${chalk.hex(SUCCESS_COLOR)('✓')} Groq (Llama) - Available (Free)`,
          value: 'groq',
        },
        {
          name: chalk.hex(SECONDARY_COLOR)('🚧 OpenAI (GPT) - Coming soon'),
          value: 'openai',
          disabled: true,
        },
      ],
    },
  ]);
  return selectedProvider;
}
