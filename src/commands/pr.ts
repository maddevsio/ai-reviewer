import { Command } from 'commander';
import chalk from 'chalk';
import { reviewPullRequest } from '../core/reviewer';
import { hasConfig } from '../config/manager';
import { initCommand } from './init';
import { SUCCESS_COLOR, WARNING_COLOR, ERROR_COLOR, SECONDARY_COLOR } from '../utils/colors';
import { askYesNo } from '../utils/prompts';

export const prCommand = new Command('pr')
  .description('Review pull requests with AI assistance')
  .argument('[id]', 'Pull request ID/number to review (optional, will show interactive selection if omitted)')
  .option('--post', 'Automatically post accepted comments without confirmation prompt')
  .option('--dry-run', 'Preview what comments would be posted without actually posting them')
  .action(async (id: string | undefined, options: { post?: boolean; dryRun?: boolean }) => {
    try {
      // Check if configuration exists
      const hasProvider = hasConfig('provider');
      const hasApiKey = hasConfig('api-key');

      if (!hasProvider || !hasApiKey) {
        console.log(chalk.hex(WARNING_COLOR)('\n⚠ Configuration not found\n'));
        console.log('You need to configure AI Code Reviewer before reviewing PRs.\n');

        const shouldInit = await askYesNo('Would you like to run the setup wizard now?');

        if (shouldInit) {
          // Run init wizard
          await initCommand.parseAsync(['', '', 'init'], { from: 'user' });
          console.log(chalk.hex(SUCCESS_COLOR)('\n✓ Now you can run: ai-review pr\n'));
          return;
        } else {
          console.log(chalk.hex(SECONDARY_COLOR)('\nRun "ai-review init" when you\'re ready to set up.\n'));
          process.exit(0);
        }
      }

      await reviewPullRequest(id, options);
    } catch (error) {
      if (error instanceof Error) {
        console.error(chalk.hex(ERROR_COLOR)(`\n✗ Error: ${error.message}`));
      }
      process.exit(1);
    }
  });
