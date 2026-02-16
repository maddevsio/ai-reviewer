import { Command } from 'commander';
import chalk from 'chalk';
import inquirer from 'inquirer';
import { platform } from 'os';
import { setConfig, listConfig, getConfigInfo, AIProvider } from '../config/manager';
import { SUCCESS_COLOR, INFO_COLOR, SECONDARY_COLOR, HIGHLIGHT_COLOR, WARNING_COLOR } from '../config/colors';
import { findGitRepoRoot } from '../utils/git';
import { askStrictnessLevel } from '../utils/strictness';
import { askGoogleModel, askGroqModel } from '../utils/models';
import { PROVIDER_DISPLAY_NAMES, API_KEY_VALIDATION } from '../config/constants';
import { configCleanup, isSensitiveKey, maskApiKey } from '../utils/config';
import { askYesNo, askProviderSelection } from '../utils/prompts';
import { setupBitbucketConfig } from './init-bitbucket';
import { setupGitLabConfig } from './init-gitlab';
import { scanAndSaveProjectDocs } from './scan-docs';

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

export interface RepoIdentifierPrompts {
  field1Name: string;
  field1Message: string;
  field2Name: string;
  field2Message: string;
}

export async function promptForRepoIdentifiers(prompts: RepoIdentifierPrompts): Promise<{ field1: string; field2: string }> {
  const field1Input = await inquirer.prompt([
    {
      type: 'input',
      name: 'value',
      message: `${prompts.field1Message} (e.g., "mycompany"):`,
      validate: (input: string) => {
        if (!input || input.trim().length === 0) {
          return `${prompts.field1Name} is required`;
        }
        return true;
      },
    },
  ]);

  const field2Input = await inquirer.prompt([
    {
      type: 'input',
      name: 'value',
      message: `${prompts.field2Message} (e.g., "my-repo"):`,
      validate: (input: string) => {
        if (!input || input.trim().length === 0) {
          return `${prompts.field2Name} is required`;
        }
        return true;
      },
    },
  ]);

  return {
    field1: field1Input.value,
    field2: field2Input.value,
  };
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

      const proceed = await askYesNo('Create local config anyway?');

      if (!proceed) {
        console.log(chalk.hex(INFO_COLOR)('\nCreating global configuration instead...\n'));
        configScope = 'global';
      } else {
        configScope = 'local';
      }
    }

    console.log(chalk.hex(SECONDARY_COLOR)('Let\'s set up your configuration...\n'));

    // Step 1: AI Provider
    const provider = await askProviderSelection();

    setConfig('provider', provider, configScope);
    configCleanup('provider', configScope);
    console.log(chalk.hex(SUCCESS_COLOR)(`✓ Provider set to: ${provider}\n`));

    // Step 2: API Key
    const providerName = PROVIDER_DISPLAY_NAMES[provider as AIProvider];
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
          return API_KEY_VALIDATION[provider as AIProvider].validate(input);
        },
      },
    ]);

    setConfig('api-key', apiKey, configScope);
    console.log(chalk.hex(SUCCESS_COLOR)('✓ API key saved\n'));

    // Step 3: Provider-specific model configuration
    if (provider === 'google') {
      console.log(chalk.hex(INFO_COLOR)('Google Gemini model selection:\n'));

      const googleModel = await askGoogleModel();
      setConfig('google-model', googleModel, configScope);
      console.log(chalk.hex(SUCCESS_COLOR)(`✓ Model set to: ${googleModel}\n`));
    }

    if (provider === 'groq') {
      console.log(chalk.hex(INFO_COLOR)('Groq model selection:\n'));

      const groqModel = await askGroqModel();
      setConfig('groq-model', groqModel, configScope);
      console.log(chalk.hex(SUCCESS_COLOR)(`✓ Model set to: ${groqModel}\n`));
    }

    // Step 4: Platform
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
            name: `${chalk.hex(SUCCESS_COLOR)('✓')} GitLab - Available`,
            value: 'gitlab',
          },
        ],
      },
    ]);

    setConfig('platform', gitPlatform, configScope);
    configCleanup('platform', configScope);
    console.log(chalk.hex(SUCCESS_COLOR)(`✓ Platform set to: ${gitPlatform}\n`));

    // Step 5: Platform-specific configuration
    if (gitPlatform === 'bitbucket') {
      await setupBitbucketConfig(configScope);
    }

    if (gitPlatform === 'gitlab') {
      await setupGitLabConfig(configScope);
    }

    // Step 6: Review strictness (optional)
    console.log(chalk.hex(INFO_COLOR)('Review strictness configuration (optional):\n'));

    const strictness = await askStrictnessLevel({ includeSkip: true });

    if (strictness) {
      setConfig('review-strictness', strictness, configScope);
      console.log(chalk.hex(SUCCESS_COLOR)(`✓ Default strictness set to: ${strictness}\n`));
    } else {
      console.log(chalk.hex(SECONDARY_COLOR)('⊘ Skipped strictness configuration (will be asked during each review)\n'));
    }

    // Step 7: Documentation scanning (local scope only)
    if (configScope === 'local' && repoRoot) {
      console.log(chalk.hex(INFO_COLOR)('Project documentation scanning (optional):\n'));
      const wantsScan = await askYesNo('Scan project for documentation files (.md) to use as review context?');

      if (wantsScan) {
        console.log();
        await scanAndSaveProjectDocs(repoRoot);
      } else {
        console.log(chalk.hex(SECONDARY_COLOR)('\n⊘ Skipped documentation scanning\n'));
      }
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
      const displayValue = isSensitiveKey(key) && value
        ? maskApiKey(value)
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
    } else if (gitPlatform === 'gitlab') {
      console.log(chalk.hex(SECONDARY_COLOR)('   1. Your Personal Access Token must have the following scopes:'));
      console.log(chalk.hex(SECONDARY_COLOR)('      - api (full API access)'));
      console.log(chalk.hex(SECONDARY_COLOR)('      - Or specific: read_api, write_repository'));
      console.log(chalk.hex(SECONDARY_COLOR)('   2. Create token at: https://gitlab.com/-/user_settings/personal_access_tokens'));
      console.log(chalk.hex(SECONDARY_COLOR)('   3. Navigate to a repo with merge requests'));
      console.log(chalk.hex(SECONDARY_COLOR)('   4. Run: ai-review pr\n'));
    }
  });
