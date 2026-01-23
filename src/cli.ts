import { Command } from 'commander';
import { initCommand } from './commands/init';
import { configCommand } from './commands/config';
import { prCommand } from './commands/pr';
import { demoCommand } from './commands/demo';

export const program = new Command();

program
  .name('ai-review')
  .description('AI-powered code review CLI tool')
  .version('0.1.0');

// Register commands
program.addCommand(initCommand);
program.addCommand(configCommand);
program.addCommand(prCommand);
program.addCommand(demoCommand, { hidden: true }); // Hidden from help
