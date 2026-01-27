import { Command } from 'commander';
import chalk from 'chalk';
import inquirer from 'inquirer';
import { getConfig, setConfig, deleteConfig, listConfig, ConfigSchema } from '../config/manager';
import { SUCCESS_COLOR, ERROR_COLOR, WARNING_COLOR, SECONDARY_COLOR, HIGHLIGHT_COLOR } from '../utils/colors';

const VALID_KEYS: Array<keyof ConfigSchema> = ['provider', 'api-key', 'platform'];

function isValidConfigKey(key: string): key is keyof ConfigSchema {
  return VALID_KEYS.includes(key as keyof ConfigSchema);
}

export const configCommand = new Command('config')
  .description('Manage configuration settings (provider, api-key, platform)');

configCommand
  .command('set <key> [value]')
  .description('Set a configuration value. Valid keys: provider, api-key, platform. Omit value for interactive input.')
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
      value = selectedPlatform;
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

    if (!value) {
      console.log(chalk.hex(ERROR_COLOR)('✗ Value is required'));
      process.exit(1);
    }

    setConfig(key, value as never);
    console.log(chalk.hex(SUCCESS_COLOR)(`✓ Set ${key} = ${key === 'api-key' ? '***' : value}`));
  });

configCommand
  .command('get <key>')
  .description('Get a specific configuration value. Valid keys: provider, api-key, platform.')
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
    if (Object.keys(config).length === 0) {
      console.log(chalk.hex(WARNING_COLOR)('No configuration found. Use "ai-review config set <key> <value>" to add settings.'));
    } else {
      console.log(chalk.bold('Current Configuration:'));
      for (const [key, value] of Object.entries(config)) {
        const displayValue = key === 'api-key' && value ? maskApiKey(value) : value;
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
  .description('Remove a configuration value. Valid keys: provider, api-key, platform.')
  .action((key: string) => {
    if (!isValidConfigKey(key)) {
      console.log(chalk.hex(ERROR_COLOR)(`✗ Invalid config key: ${key}`));
      console.log(chalk.hex(WARNING_COLOR)(`Valid keys: ${VALID_KEYS.join(', ')}`));
      process.exit(1);
    }
    deleteConfig(key);
    console.log(chalk.hex(SUCCESS_COLOR)(`✓ Deleted ${key}`));
  });
