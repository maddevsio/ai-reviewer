import { Command } from 'commander';
import chalk from 'chalk';
import inquirer from 'inquirer';
import { platform } from 'os';
import { setConfig, listConfig, getConfigInfo } from '../config/manager';
import { SUCCESS_COLOR, INFO_COLOR, SECONDARY_COLOR, HIGHLIGHT_COLOR, WARNING_COLOR } from '../utils/colors';
import { findGitRepoRoot } from '../utils/git';
import { STRICTNESS_LEVELS } from '../utils/strictness';

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

interface InitOptions {
  global?: boolean;
}

export const initCommand = new Command('init')
  .description('Interactive setup wizard for first-time configuration')
  .option('-g, --global', 'Create global configuration (default: local if in git repo)')
  .action(async (options: InitOptions) => {
    console.log(chalk.bold.hex(INFO_COLOR)('\n🚀 Welcome to AI Code Reviewer!\n'));

    // Determine config scope
    const repoRoot = findGitRepoRoot();
    const isInGitRepo = repoRoot !== null;
    let configScope: 'global' | 'local';

    if (options.global) {
      // Explicit global flag
      configScope = 'global';
      console.log(chalk.hex(INFO_COLOR)('Configuring: Global (user-wide)\n'));
    } else if (isInGitRepo) {
      // In git repo: default to local
      configScope = 'local';
      console.log(chalk.hex(INFO_COLOR)(`Configuring: Local project (${repoRoot}/.ai-review/)\n`));
    } else {
      // Not in git repo: warn and ask
      console.log(chalk.hex(WARNING_COLOR)('⚠️  Warning: Not a git repository'));
      console.log(chalk.hex(WARNING_COLOR)(`Local config will only apply when running commands from ${process.cwd()}/`));
      console.log(chalk.hex(WARNING_COLOR)('If you have git repos inside this directory, they will NOT use this config.\n'));

      const { proceed } = await inquirer.prompt([
        {
          type: 'confirm',
          name: 'proceed',
          message: 'Create local config anyway?',
          default: false,
        },
      ]);

      if (!proceed) {
        console.log(chalk.hex(INFO_COLOR)('\nCreating global configuration instead...\n'));
        configScope = 'global';
      } else {
        configScope = 'local';
      }
    }

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
            name: `${chalk.hex(SUCCESS_COLOR)('✓')} Google (Gemini) - Available (Free tier)`,
            value: 'google',
          },
          {
            name: chalk.hex(SECONDARY_COLOR)('🚧 OpenAI (GPT) - Coming soon'),
            value: 'openai',
            disabled: true,
          },
        ],
      },
    ]);

    setConfig('provider', provider as never, configScope);
    console.log(chalk.hex(SUCCESS_COLOR)(`✓ Provider set to: ${provider}\n`));

    // Step 2: API Key
    const providerName = provider === 'anthropic' ? 'Anthropic' : provider === 'google' ? 'Google' : provider;
    const { apiKey } = await inquirer.prompt([
      {
        type: 'password',
        name: 'apiKey',
        message: `Enter your ${providerName} API key:`,
        mask: '*',
        validate: (input: string) => {
          if (!input || input.trim().length === 0) {
            return 'API key is required';
          }
          if (provider === 'anthropic' && !input.startsWith('sk-ant-')) {
            return 'Anthropic API keys should start with "sk-ant-"';
          }
          if (provider === 'google' && !input.startsWith('AIza')) {
            return 'Google API keys should start with "AIza"';
          }
          if (provider === 'openai' && !input.startsWith('sk-')) {
            return 'OpenAI API keys should start with "sk-"';
          }
          return true;
        },
      },
    ]);

    setConfig('api-key', apiKey as never, configScope);
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
          configScope === 'global'
            ? {
                name: chalk.hex(SECONDARY_COLOR)('Bitbucket - Requires local config (workspace/repo needed)'),
                value: 'bitbucket',
                disabled: true,
              }
            : {
                name: `${chalk.hex(SUCCESS_COLOR)('✓')} Bitbucket - Available`,
                value: 'bitbucket',
              },
          {
            name: chalk.hex(SECONDARY_COLOR)('🚧 GitLab - Coming soon'),
            value: 'gitlab',
            disabled: true,
          },
        ],
      },
    ]);

    setConfig('platform', gitPlatform as never, configScope);
    console.log(chalk.hex(SUCCESS_COLOR)(`✓ Platform set to: ${gitPlatform}\n`));

    // Step 4: Google-specific configuration
    if (provider === 'google') {
      console.log(chalk.hex(INFO_COLOR)('Google Gemini model selection:\n'));

      const { googleModel } = await inquirer.prompt([
        {
          type: 'list',
          name: 'googleModel',
          message: 'Select Google Gemini model:',
          choices: [
            {
              name: 'Gemini 3 Flash (Most balanced model)',
              value: 'gemini-3-flash-preview',
            },
            {
              name: 'Gemini 2.5 Flash (Best model in terms of price-performance)',
              value: 'gemini-2.5-flash',
            },
          ],
        },
      ]);

      setConfig('google-model', googleModel as never, configScope);
      console.log(chalk.hex(SUCCESS_COLOR)(`✓ Model set to: ${googleModel}\n`));
    }

    // Step 5: Bitbucket-specific configuration
    if (gitPlatform === 'bitbucket') {
      console.log(chalk.hex(INFO_COLOR)('Bitbucket requires additional configuration:\n'));

      const { workspace } = await inquirer.prompt([
        {
          type: 'input',
          name: 'workspace',
          message: 'Enter your Bitbucket workspace (e.g., "mycompany"):',
          validate: (input: string) => {
            if (!input || input.trim().length === 0) {
              return 'Workspace is required';
            }
            return true;
          },
        },
      ]);

      setConfig('bitbucket-workspace', workspace as never, configScope);
      console.log(chalk.hex(SUCCESS_COLOR)(`✓ Workspace set to: ${workspace}\n`));

      const { repoSlug } = await inquirer.prompt([
        {
          type: 'input',
          name: 'repoSlug',
          message: 'Enter your repository slug (e.g., "my-repo"):',
          validate: (input: string) => {
            if (!input || input.trim().length === 0) {
              return 'Repository slug is required';
            }
            return true;
          },
        },
      ]);

      setConfig('bitbucket-repo-slug', repoSlug as never, configScope);
      console.log(chalk.hex(SUCCESS_COLOR)(`✓ Repository slug set to: ${repoSlug}\n`));

      const { bbApiToken } = await inquirer.prompt([
        {
          type: 'password',
          name: 'bbApiToken',
          message: 'Enter your Bitbucket API Token:',
          mask: '*',
          validate: (input: string) => {
            if (!input || input.trim().length === 0) {
              return 'API Token is required';
            }
            return true;
          },
        },
      ]);

      setConfig('bitbucket-app-password', bbApiToken as never, configScope);
      console.log(chalk.hex(SUCCESS_COLOR)('✓ Bitbucket API Token saved\n'));

      // Info about API tokens
      console.log(chalk.hex(INFO_COLOR)('ℹ️  API Token permissions required:'));
      console.log(chalk.hex(INFO_COLOR)('   - Repositories: Read, Write'));
      console.log(chalk.hex(INFO_COLOR)('   - Pull requests: Read, Write'));
      console.log(chalk.hex(INFO_COLOR)('   Create at: https://bitbucket.org/account/settings/api-tokens/\n'));
    }

    // Step 6: Review strictness (optional)
    console.log(chalk.hex(INFO_COLOR)('Review strictness configuration (optional):\n'));

    const { strictness } = await inquirer.prompt([
      {
        type: 'list',
        name: 'strictness',
        message: 'Select default review strictness:',
        choices: [
          {
            name: `${STRICTNESS_LEVELS.easy.doom} (easy) - ${STRICTNESS_LEVELS.easy.description}`,
            value: 'easy',
          },
          {
            name: `${STRICTNESS_LEVELS.normal.doom} (normal) - ${STRICTNESS_LEVELS.normal.description}`,
            value: 'normal',
          },
          {
            name: `${STRICTNESS_LEVELS.balanced.doom} (balanced) - ${STRICTNESS_LEVELS.balanced.description}`,
            value: 'balanced',
          },
          {
            name: `${STRICTNESS_LEVELS.strict.doom} (strict) - ${STRICTNESS_LEVELS.strict.description}`,
            value: 'strict',
          },
          {
            name: `${STRICTNESS_LEVELS.pedantic.doom} (pedantic) - ${STRICTNESS_LEVELS.pedantic.description}`,
            value: 'pedantic',
          },
          {
            name: chalk.hex(SECONDARY_COLOR)('Skip (will be asked with each review, can set later via config)'),
            value: 'skip',
          },
        ],
        default: 'skip',
      },
    ]);

    if (strictness !== 'skip') {
      setConfig('review-strictness', strictness as never, configScope);
      console.log(chalk.hex(SUCCESS_COLOR)(`✓ Default strictness set to: ${strictness}\n`));
    } else {
      console.log(chalk.hex(SECONDARY_COLOR)('⊘ Skipped strictness configuration (will be asked during each review)\n'));
    }

    // Summary
    console.log(chalk.bold.hex(SUCCESS_COLOR)('✨ Configuration complete!\n'));

    // Show where config was saved
    const configInfo = getConfigInfo();
    if (configScope === 'local' && configInfo.localPath) {
      console.log(chalk.hex(INFO_COLOR)(`Saved to: ${configInfo.localPath}\n`));
    } else {
      console.log(chalk.hex(INFO_COLOR)(`Saved to: ${configInfo.globalPath}\n`));
    }

    console.log(chalk.bold('Your configuration:'));
    const config = listConfig();
    for (const [key, value] of Object.entries(config)) {
      const displayValue = (key === 'api-key' || key === 'bitbucket-app-password') && value
        ? `${value.slice(0, 8)}...${value.slice(-4)}`
        : value;
      console.log(`  ${chalk.hex(HIGHLIGHT_COLOR)(key)}: ${displayValue}`);
    }

    console.log(chalk.hex(SECONDARY_COLOR)('\n💡 Next steps:'));

    if (gitPlatform === 'github') {
      const installCommand = getGitHubCLIInstallCommand();
      console.log(chalk.hex(SECONDARY_COLOR)(`   1. Make sure you have GitHub CLI installed: ${installCommand}`));
      console.log(chalk.hex(SECONDARY_COLOR)('   2. Authenticate with GitHub: gh auth login'));
      console.log(chalk.hex(SECONDARY_COLOR)('   3. Navigate to a repo with PRs'));
      console.log(chalk.hex(SECONDARY_COLOR)('   4. Run: ai-review pr\n'));
    } else if (gitPlatform === 'bitbucket') {
      console.log(chalk.hex(SECONDARY_COLOR)('   1. Your API Token must have the following permissions:'));
      console.log(chalk.hex(SECONDARY_COLOR)('      - Repositories: Read, Write'));
      console.log(chalk.hex(SECONDARY_COLOR)('      - Pull requests: Read, Write'));
      console.log(chalk.hex(SECONDARY_COLOR)('   2. Create API Token at: https://bitbucket.org/account/settings/api-tokens/'));
      console.log(chalk.hex(SECONDARY_COLOR)('   3. Navigate to a repo with PRs'));
      console.log(chalk.hex(SECONDARY_COLOR)('   4. Run: ai-review pr\n'));
    }
  });
