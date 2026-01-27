import { Command } from 'commander';
import { initCommand } from './commands/init';
import { configCommand } from './commands/config';
import { prCommand } from './commands/pr';
import { demoCommand } from './commands/demo';

export const program = new Command();

program
  .name('ai-review')
  .description('AI-powered code review CLI tool for pull requests')
  .version('0.1.0')
  .addHelpText('after', `
Examples:
  $ ai-review demo                    # Try demo mode with mock data (no setup required)
  $ ai-review init                    # Run setup wizard
  $ ai-review pr                      # Review PR (interactive selection)
  $ ai-review pr 342                  # Review specific PR #342
  $ ai-review pr 342 --post           # Auto-post accepted comments
  $ ai-review pr 342 --dry-run        # Preview comments without posting
  $ ai-review config list             # Show current configuration
  $ ai-review config set provider     # Set AI provider (interactive)
  $ ai-review config set api-key      # Set API key (interactive)
  $ ai-review config set platform     # Set git platform (interactive)

Commands:
  demo [id]        Try the tool with mock data (no setup required)
                   Experience the review workflow without API keys or real PRs
                   Perfect for testing and exploring features

  init             Interactive setup wizard for first-time configuration
                   Guides you through AI provider selection, API key setup, and platform choice

  pr [id]          Review pull requests with AI assistance
    Options:
      --post       Automatically post accepted comments without confirmation
      --dry-run    Preview what comments would be posted without posting them

  config <action>  Manage configuration settings
    Actions:
      set <key> [value]    Set a configuration value (provider, api-key, platform)
      get <key>            Get a configuration value
      list                 Show all configuration settings
      delete <key>         Delete a configuration value

Documentation: https://github.com/anthropics/ai-code-review
`);

// Register commands
program.addCommand(demoCommand); // Demo mode - no setup required
program.addCommand(initCommand);
program.addCommand(configCommand);
program.addCommand(prCommand);
