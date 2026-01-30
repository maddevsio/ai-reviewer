import { Command } from 'commander';
import chalk from 'chalk';
import { reviewPullRequest } from '../core/reviewer';
import { hasConfig } from '../config/manager';
import { initCommand } from './init';
import { SUCCESS_COLOR, WARNING_COLOR, ERROR_COLOR, SECONDARY_COLOR } from '../utils/colors';
import { askYesNo } from '../utils/prompts';
import { isValidStrictness } from '../utils/strictness';
import type { ReviewStrictness } from '../config/manager';

export const prCommand = new Command('pr')
  .description('Review pull requests with AI assistance')
  .argument('[id]', 'Pull request ID/number to review (optional, will show interactive selection if omitted)')
  .option('--post', 'Automatically post accepted comments without confirmation prompt')
  .option('--dry-run', 'Preview what comments would be posted without actually posting them')
  .option(
    '-s, --strictness <level>',
    'Review strictness level:\n' +
    '                            easy     - They\'re Too Young to Die (critical only)\n' +
    '                            normal   - Not Too Rough (important issues)\n' +
    '                            balanced - Hurt Them Plenty (recommended)\n' +
    '                            strict   - Ultra-Violence (strict quality)\n' +
    '                            pedantic - Watch Them Die (everything)'
  )
  .action(async (id: string | undefined, options: { post?: boolean; dryRun?: boolean; strictness?: string }) => {
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

      // Validate strictness level if provided
      let strictness: ReviewStrictness | undefined;
      if (options.strictness) {
        if (!isValidStrictness(options.strictness)) {
          console.error(chalk.hex(ERROR_COLOR)(`\n✗ Invalid strictness level: ${options.strictness}`));
          console.log(chalk.hex(WARNING_COLOR)('Valid levels: easy, normal, balanced, strict, pedantic\n'));
          process.exit(1);
        }
        strictness = options.strictness as ReviewStrictness;
      }

      await reviewPullRequest(id, { ...options, strictness });
    } catch (error) {
      if (error instanceof Error) {
        console.error(chalk.hex(ERROR_COLOR)(`\n✗ Error: ${error.message}`));
      }
      process.exit(1);
    }
  });
