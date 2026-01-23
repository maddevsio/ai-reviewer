import { Command } from 'commander';
import chalk from 'chalk';
import inquirer from 'inquirer';
import { platform } from 'os';
import { setConfig, listConfig } from '../config/manager';
import { SUCCESS_COLOR, INFO_COLOR, SECONDARY_COLOR, HIGHLIGHT_COLOR } from '../utils/colors';

function getGitHubCLIInstallCommand(): string {
  const os = platform();

  switch (os) {
    case 'darwin':
      return 'brew install gh';
    case 'win32':
      return 'winget install --id GitHub.cli';
    case 'linux':
      return 'sudo apt install gh  # or: sudo dnf install gh';
    default:
      return 'See: https://cli.github.com';
  }
}

export const initCommand = new Command('init')
  .description('Interactive setup wizard for first-time configuration')
  .action(async () => {
    console.log(chalk.bold.hex(INFO_COLOR)('\n🚀 Welcome to AI Code Reviewer!\n'));
    console.log(chalk.hex(SECONDARY_COLOR)('Let\'s set up your configuration...\n'));

    // Step 1: AI Provider
    const { provider } = await inquirer.prompt([
      {
        type: 'list',
        name: 'provider',
        message: 'Select your AI provider:',
        choices: [
          {
            name: `${chalk.hex(SUCCESS_COLOR)('✓')} Anthropic (Claude) - Available`,
            value: 'anthropic',
          },
          {
            name: chalk.hex(SECONDARY_COLOR)('🚧 OpenAI (GPT) - Coming soon'),
            value: 'openai',
            disabled: true,
          },
          {
            name: chalk.hex(SECONDARY_COLOR)('🚧 Google (Gemini) - Coming soon'),
            value: 'google',
            disabled: true,
          },
        ],
      },
    ]);

    setConfig('provider', provider as never);
    console.log(chalk.hex(SUCCESS_COLOR)(`✓ Provider set to: ${provider}\n`));

    // Step 2: API Key
    const { apiKey } = await inquirer.prompt([
      {
        type: 'password',
        name: 'apiKey',
        message: `Enter your ${provider === 'anthropic' ? 'Anthropic' : provider} API key:`,
        mask: '*',
        validate: (input: string) => {
          if (!input || input.trim().length === 0) {
            return 'API key is required';
          }
          if (provider === 'anthropic' && !input.startsWith('sk-ant-')) {
            return 'Anthropic API keys should start with "sk-ant-"';
          }
          if (provider === 'openai' && !input.startsWith('sk-')) {
            return 'OpenAI API keys should start with "sk-"';
          }
          return true;
        },
      },
    ]);

    setConfig('api-key', apiKey as never);
    console.log(chalk.hex(SUCCESS_COLOR)('✓ API key saved\n'));

    // Step 3: Platform
    const { gitPlatform } = await inquirer.prompt([
      {
        type: 'list',
        name: 'gitPlatform',
        message: 'Select your git platform:',
        choices: [
          {
            name: `${chalk.hex(SUCCESS_COLOR)('✓')} GitHub - Available`,
            value: 'github',
          },
          {
            name: chalk.hex(SECONDARY_COLOR)('🚧 GitLab - Coming soon'),
            value: 'gitlab',
            disabled: true,
          },
          {
            name: chalk.hex(SECONDARY_COLOR)('🚧 Bitbucket - Coming soon'),
            value: 'bitbucket',
            disabled: true,
          },
        ],
      },
    ]);

    setConfig('platform', gitPlatform as never);
    console.log(chalk.hex(SUCCESS_COLOR)(`✓ Platform set to: ${gitPlatform}\n`));

    // Summary
    console.log(chalk.bold.hex(SUCCESS_COLOR)('✨ Configuration complete!\n'));
    console.log(chalk.bold('Your configuration:'));
    const config = listConfig();
    for (const [key, value] of Object.entries(config)) {
      const displayValue = key === 'api-key' && value
        ? `${value.slice(0, 8)}...${value.slice(-4)}`
        : value;
      console.log(`  ${chalk.hex(HIGHLIGHT_COLOR)(key)}: ${displayValue}`);
    }

    const installCommand = getGitHubCLIInstallCommand();

    console.log(chalk.hex(SECONDARY_COLOR)('\n💡 Next steps:'));
    console.log(chalk.hex(SECONDARY_COLOR)(`   1. Make sure you have GitHub CLI installed: ${installCommand}`));
    console.log(chalk.hex(SECONDARY_COLOR)('   2. Authenticate with GitHub: gh auth login'));
    console.log(chalk.hex(SECONDARY_COLOR)('   3. Navigate to a repo with PRs'));
    console.log(chalk.hex(SECONDARY_COLOR)('   4. Run: ai-review pr\n'));
  });
