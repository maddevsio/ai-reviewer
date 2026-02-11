import { Command } from 'commander';
import chalk from 'chalk';
import inquirer from 'inquirer';
import { getConfig, setConfig, deleteConfig, listConfig, ConfigSchema, getConfigInfo, getConfigScope, AIProvider } from '../config/manager';
import { SUCCESS_COLOR, ERROR_COLOR, WARNING_COLOR, SECONDARY_COLOR, HIGHLIGHT_COLOR } from '../utils/colors';
import { askStrictnessLevel } from '../utils/strictness';
import { askGoogleModel } from '../utils/models';
import { PROVIDER_DISPLAY_NAMES, API_KEY_VALIDATION } from '../config/constants';
import { configCleanup, isSensitiveKey, maskApiKey } from '../utils/config';
import { askProviderSelection } from '../utils/prompts';
import { setupBitbucketConfig } from './init-bitbucket';
import { setupGitLabConfig } from './init-gitlab';

const VALID_KEYS: Array<keyof ConfigSchema> = [
  'provider',
  'api-key',
  'platform',
  'review-strictness',
  'google-model',
  'bitbucket-workspace',
  'bitbucket-repo-slug',
  'bitbucket-api-token',
  'bitbucket-reviewer-uuid',
  'gitlab-token',
  'gitlab-project-id',
  'gitlab-url',
];

function isValidConfigKey(key: string): key is keyof ConfigSchema {
  return VALID_KEYS.includes(key as keyof ConfigSchema);
}

export const configCommand = new Command('config')
  .description('Manage configuration settings (provider, api-key, platform)');

configCommand
  .command('set <key> [value]')
  .description('Set a configuration value. Valid keys: provider, api-key, platform, review-strictness, google-model, bitbucket-workspace, bitbucket-repo-slug, bitbucket-api-token, bitbucket-reviewer-uuid, gitlab-token, gitlab-project-id, gitlab-url. Omit value for interactive input.')
  .action(async (key: string, value?: string) => {
    if (!isValidConfigKey(key)) {
      console.log(chalk.hex(ERROR_COLOR)(`✗ Invalid config key: ${key}`));
      console.log(chalk.hex(WARNING_COLOR)(`Valid keys: ${VALID_KEYS.join(', ')}`));
      process.exit(1);
    }

    // Interactive provider selection
    if (key === 'provider' && !value) {
      value = await askProviderSelection();

      // Automatically prompt for API key after provider selection
      const providerName = PROVIDER_DISPLAY_NAMES[value as AIProvider];
      const { newApiKey } = await inquirer.prompt([
        {
          type: 'password',
          name: 'newApiKey',
          message: `Enter your ${providerName} API key:`,
          mask: '*',
          validate: (input: string) => {
            if (!input || input.trim().length === 0) {
              return 'API key is required';
            }
            return API_KEY_VALIDATION[value as AIProvider].validate(input);
          },
        },
      ]);

      // Set the provider first
      const existingScope = getConfigScope(key) || 'global';
      setConfig(key, value,existingScope);
      configCleanup('provider', existingScope);
      console.log(chalk.hex(SUCCESS_COLOR)(`✓ Set ${key} = ${value}`));

      // Then set the API key
      const apiKeyScope = getConfigScope('api-key') || existingScope;
      setConfig('api-key', newApiKey,apiKeyScope);
      const maskedKey = maskApiKey(newApiKey);
      console.log(chalk.hex(SUCCESS_COLOR)(`✓ Set api-key = ${maskedKey}`));

      // Early return since we've already set both values
      return;
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
              name: `${chalk.hex(SUCCESS_COLOR)('✓')} GitLab - Available`,
              value: 'gitlab',
            },
          ],
        },
      ]);

      const existingScope = getConfigScope(key) || 'global';
      setConfig(key, selectedPlatform, existingScope);
      configCleanup('platform', existingScope);
      console.log(chalk.hex(SUCCESS_COLOR)(`✓ Set ${key} = ${selectedPlatform}\n`));

      // Guide through platform-specific setup
      if (selectedPlatform === 'bitbucket') {
        await setupBitbucketConfig(existingScope);
      } else if (selectedPlatform === 'gitlab') {
        await setupGitLabConfig(existingScope);
      }

      return;
    }

    // Interactive Google model selection
    if (key === 'google-model' && !value) {
      value = await askGoogleModel();
    }

    // Interactive review strictness selection
    if (key === 'review-strictness' && !value) {
      const selected = await askStrictnessLevel();
      value = selected ?? undefined;
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

    // For bitbucket-api-token, require value
    if (key === 'bitbucket-api-token' && !value) {
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

    // For gitlab-token, require value
    if (key === 'gitlab-token' && !value) {
      const { gitlabToken } = await inquirer.prompt([
        {
          type: 'password',
          name: 'gitlabToken',
          message: 'Enter your GitLab Personal Access Token:',
          mask: '*',
          validate: (input: string) => {
            if (!input || input.trim().length === 0) {
              return 'Personal Access Token is required';
            }
            return true;
          },
        },
      ]);
      value = gitlabToken;
    }

    if (!value) {
      console.log(chalk.hex(ERROR_COLOR)('✗ Value is required'));
      process.exit(1);
    }

    // Detect which config scope to update (update existing location, or default to global)
    const existingScope = getConfigScope(key) || 'global';
    setConfig(key, value,existingScope);

    // Clean up redundant config when provider or platform changes
    if (key === 'provider' || key === 'platform') {
      configCleanup(key, existingScope);
    }

    // Mask sensitive values for display (same format as config list)
    let displayValue = value;
    if (isSensitiveKey(key)) {
      displayValue = maskApiKey(value);
    }
    console.log(chalk.hex(SUCCESS_COLOR)(`✓ Set ${key} = ${displayValue}`));

    // Guide through platform-specific setup when value was provided directly
    if (key === 'platform' && value === 'bitbucket') {
      console.log();
      await setupBitbucketConfig(existingScope);
    } else if (key === 'platform' && value === 'gitlab') {
      console.log();
      await setupGitLabConfig(existingScope);
    }
  });

configCommand
  .command('get <key>')
  .description('Get a specific configuration value. Valid keys: provider, api-key, platform, review-strictness, google-model, bitbucket-workspace, bitbucket-repo-slug, bitbucket-api-token, bitbucket-reviewer-uuid, gitlab-token, gitlab-project-id, gitlab-url.')
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
        const displayValue = isSensitiveKey(key) && value ? maskApiKey(value) : value;
        console.log(`  ${chalk.hex(HIGHLIGHT_COLOR)(key)}: ${displayValue}`);
      }
    }
  });

configCommand
  .command('delete <key>')
  .description('Remove a configuration value. Valid keys: provider, api-key, platform, review-strictness, google-model, bitbucket-workspace, bitbucket-repo-slug, bitbucket-api-token, bitbucket-reviewer-uuid, gitlab-token, gitlab-project-id, gitlab-url.')
  .action((key: string) => {
    if (!isValidConfigKey(key)) {
      console.log(chalk.hex(ERROR_COLOR)(`✗ Invalid config key: ${key}`));
      console.log(chalk.hex(WARNING_COLOR)(`Valid keys: ${VALID_KEYS.join(', ')}`));
      process.exit(1);
    }
    deleteConfig(key);
    console.log(chalk.hex(SUCCESS_COLOR)(`✓ Deleted ${key}`));
  });
