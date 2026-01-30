import { Command } from 'commander';
import chalk from 'chalk';
import inquirer from 'inquirer';
import { getConfig, setConfig, deleteConfig, listConfig, ConfigSchema, getConfigInfo, getConfigScope } from '../config/manager';
import { SUCCESS_COLOR, ERROR_COLOR, WARNING_COLOR, SECONDARY_COLOR, HIGHLIGHT_COLOR } from '../utils/colors';
import { STRICTNESS_LEVELS } from '../utils/strictness';

const VALID_KEYS: Array<keyof ConfigSchema> = [
  'provider',
  'api-key',
  'platform',
  'review-strictness',
  'google-model',
  'bitbucket-workspace',
  'bitbucket-repo-slug',
  'bitbucket-app-password',
];

function isValidConfigKey(key: string): key is keyof ConfigSchema {
  return VALID_KEYS.includes(key as keyof ConfigSchema);
}

export const configCommand = new Command('config')
  .description('Manage configuration settings (provider, api-key, platform)');

configCommand
  .command('set <key> [value]')
  .description('Set a configuration value. Valid keys: provider, api-key, platform, review-strictness, google-model, bitbucket-workspace, bitbucket-repo-slug, bitbucket-username, bitbucket-app-password. Omit value for interactive input.')
  .action(async (key: string, value?: string) => {
    if (!isValidConfigKey(key)) {
      console.log(chalk.hex(ERROR_COLOR)(`✗ Invalid config key: ${key}`));
      console.log(chalk.hex(WARNING_COLOR)(`Valid keys: ${VALID_KEYS.join(', ')}`));
      process.exit(1);
    }

    // Interactive provider selection
    if (key === 'provider' && !value) {
      const { selectedProvider } = await inquirer.prompt([
        {
          type: 'list',
          name: 'selectedProvider',
          message: 'Select AI provider:',
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
      value = selectedProvider;
    }

    // Interactive platform selection
    if (key === 'platform' && !value) {
      const { selectedPlatform } = await inquirer.prompt([
        {
          type: 'list',
          name: 'selectedPlatform',
          message: 'Select git platform:',
          choices: [
            {
              name: `${chalk.hex(SUCCESS_COLOR)('✓')} GitHub - Available`,
              value: 'github',
            },
            {
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
      value = selectedPlatform;
    }

    // Interactive Google model selection
    if (key === 'google-model' && !value) {
      const { selectedModel } = await inquirer.prompt([
        {
          type: 'list',
          name: 'selectedModel',
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
      value = selectedModel;
    }

    // Interactive review strictness selection
    if (key === 'review-strictness' && !value) {
      const { selectedStrictness } = await inquirer.prompt([
        {
          type: 'list',
          name: 'selectedStrictness',
          message: 'Select review strictness:',
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
          ],
          default: 'balanced',
        },
      ]);
      value = selectedStrictness;
    }

    // For api-key, require value
    if (key === 'api-key' && !value) {
      const { apiKey } = await inquirer.prompt([
        {
          type: 'password',
          name: 'apiKey',
          message: 'Enter your API key:',
          mask: '*',
        },
      ]);
      value = apiKey;
    }

    // For bitbucket-app-password, require value
    if (key === 'bitbucket-app-password' && !value) {
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
      value = bbApiToken;
    }

    if (!value) {
      console.log(chalk.hex(ERROR_COLOR)('✗ Value is required'));
      process.exit(1);
    }

    // Detect which config scope to update (update existing location, or default to global)
    const existingScope = getConfigScope(key) || 'global';
    setConfig(key, value as never, existingScope);

    // Mask sensitive values for display (same format as config list)
    let displayValue = value;
    if (key === 'api-key' || key === 'bitbucket-app-password') {
      displayValue = maskApiKey(value);
    }
    console.log(chalk.hex(SUCCESS_COLOR)(`✓ Set ${key} = ${displayValue}`));
  });

configCommand
  .command('get <key>')
  .description('Get a specific configuration value. Valid keys: provider, api-key, platform, review-strictness, google-model, bitbucket-workspace, bitbucket-repo-slug, bitbucket-username, bitbucket-app-password.')
  .action((key: string) => {
    if (!isValidConfigKey(key)) {
      console.log(chalk.hex(ERROR_COLOR)(`✗ Invalid config key: ${key}`));
      console.log(chalk.hex(WARNING_COLOR)(`Valid keys: ${VALID_KEYS.join(', ')}`));
      process.exit(1);
    }
    const value = getConfig(key);
    if (value !== undefined) {
      console.log(value);
    } else {
      console.log(chalk.hex(WARNING_COLOR)(`⚠ Key '${key}' not found`));
    }
  });

configCommand
  .command('list')
  .description('Display all current configuration settings (API keys are masked for security)')
  .action(() => {
    const config = listConfig();
    const configInfo = getConfigInfo();

    // Show config source
    if (configInfo.activeSource === 'local') {
      console.log(chalk.hex(SECONDARY_COLOR)(`Using config from: ${configInfo.localPath}\n`));
    } else if (configInfo.activeSource === 'global') {
      console.log(chalk.hex(SECONDARY_COLOR)(`Using config from: ${configInfo.globalPath}\n`));
    }

    if (Object.keys(config).length === 0) {
      console.log(chalk.hex(WARNING_COLOR)('No configuration found. Run "ai-review init" to set up.'));
    } else {
      console.log(chalk.bold('Current Configuration:'));
      for (const [key, value] of Object.entries(config)) {
        const displayValue = (key === 'api-key' || key === 'bitbucket-app-password') && value ? maskApiKey(value) : value;
        console.log(`  ${chalk.hex(HIGHLIGHT_COLOR)(key)}: ${displayValue}`);
      }
    }
  });

function maskApiKey(key: string): string {
  if (key.length <= 10) {
    return '***';
  }
  const start = key.slice(0, 8);
  const end = key.slice(-4);
  return `${start}...${end}`;
}

configCommand
  .command('delete <key>')
  .description('Remove a configuration value. Valid keys: provider, api-key, platform, review-strictness, google-model, bitbucket-workspace, bitbucket-repo-slug, bitbucket-username, bitbucket-app-password.')
  .action((key: string) => {
    if (!isValidConfigKey(key)) {
      console.log(chalk.hex(ERROR_COLOR)(`✗ Invalid config key: ${key}`));
      console.log(chalk.hex(WARNING_COLOR)(`Valid keys: ${VALID_KEYS.join(', ')}`));
      process.exit(1);
    }
    deleteConfig(key);
    console.log(chalk.hex(SUCCESS_COLOR)(`✓ Deleted ${key}`));
  });
