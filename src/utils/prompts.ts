import * as readline from 'readline';
import chalk from 'chalk';
import {DISABLED_COLOR} from './colors';

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
