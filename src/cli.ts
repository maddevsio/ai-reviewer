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
  $ ai-review init                    # Run setup wizard (local config in git repo)
  $ ai-review init --global           # Create global config (user-wide)
  $ ai-review pr                      # Review PR (interactive selection)
  $ ai-review pr 342                  # Review specific PR #342
  $ ai-review pr 342 --post           # Auto-post accepted comments
  $ ai-review pr 342 --dry-run        # Preview comments without posting
  $ ai-review config list             # Show current configuration & source
  $ ai-review config set provider     # Set AI provider (interactive)
  $ ai-review config set api-key      # Set API key (interactive)
  $ ai-review config set platform     # Set git platform (interactive)

Commands:
  demo [id]        Try the tool with mock data (no setup required)
                   Experience the review workflow without API keys or real PRs
                   Perfect for testing and exploring features

  init             Interactive setup wizard for first-time configuration
                   Guides you through AI provider selection, API key setup, and platform choice

                   Configuration Scope:
                   • In git repo: Creates local config at {repo-root}/.ai-review/config.json
                   • Outside repo: Warns and offers to create local or switch to global
                   • --global flag: Forces global config at ~/.config/ai-code-review-nodejs/

                   Hierarchy: Local config (if exists) overrides global config

  pr [id]          Review pull requests with AI assistance
    Options:
      --post       Automatically post accepted comments without confirmation
      --dry-run    Preview what comments would be posted without posting them

  config <action>  Manage configuration settings
                   Uses hierarchical resolution: local > global > defaults
    Actions:
      set <key> [value]    Set a configuration value (provider, api-key, platform)
      get <key>            Get a configuration value
      list                 Show all configuration settings and active config source
      delete <key>         Delete a configuration value
`);

// Register commands
program.addCommand(demoCommand); // Demo mode - no setup required
program.addCommand(initCommand);
program.addCommand(configCommand);
program.addCommand(prCommand);
