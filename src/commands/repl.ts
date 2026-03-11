import { Command } from 'commander';
import chalk from 'chalk';
import { createGitPlatform } from '../platforms/factory';
import { createAIProvider } from '../providers/factory';
import { hasConfig } from '../config/manager';
import { runReplSession } from '../core/repl-runner';
import { WARNING_COLOR, ERROR_COLOR, SECONDARY_COLOR, SUCCESS_COLOR } from '../config/colors';
import { enableVerboseLogging } from '../utils/logger';
import { askYesNo } from '../utils/prompts';
import { initCommand } from './init';

export const replCommand = new Command('repl')
  .description('Start an interactive REPL session for reviewing pull requests')
  .option(
    '-v, --verbose [categories]',
    'Enable verbose logging (optional: api, api-detailed, config, prompt, diff, platform)'
  )
  .action(async (options: { verbose?: string | boolean }) => {
    try {
      if (options.verbose !== undefined) {
        enableVerboseLogging(options.verbose);
      }

      // Check config
      const hasProvider = hasConfig('provider');
      const hasApiKey = hasConfig('api-key');

      if (!hasProvider || !hasApiKey) {
        console.log(chalk.hex(WARNING_COLOR)('\n⚠ Configuration not found\n'));
        console.log('You need to configure AI Code Reviewer before starting a REPL session.\n');

        const shouldInit = await askYesNo('Would you like to run the setup wizard now?');

        if (shouldInit) {
          await initCommand.parseAsync(['', '', 'init'], { from: 'user' });
          console.log(chalk.hex(SUCCESS_COLOR)('\n✓ Configuration complete. Starting REPL...\n'));
        } else {
          console.log(chalk.hex(SECONDARY_COLOR)('\nRun "ai-review init" when you\'re ready to set up.\n'));
          process.exit(0);
        }
      }

      // Initialize platform and provider once for the entire session
      const platform = await createGitPlatform();
      const aiProvider = createAIProvider();

      await runReplSession({ platform, aiProvider });
    } catch (err) {
      if (err instanceof Error) {
        console.error(chalk.hex(ERROR_COLOR)(`\n✗ Error: ${err.message}`));
      }
      process.exit(1);
    }
  });
