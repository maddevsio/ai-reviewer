import { Command } from 'commander';
import chalk from 'chalk';
import inquirer from 'inquirer';
import { platform } from 'os';
import { setConfig, listConfig, getConfigInfo, AIProvider } from '../config/manager';
import { SUCCESS_COLOR, INFO_COLOR, SECONDARY_COLOR, HIGHLIGHT_COLOR, WARNING_COLOR } from '../utils/colors';
import { findGitRepoRoot, getGitRemoteUrl, parseBitbucketUrl, parseGitLabUrl } from '../utils/git';
import { STRICTNESS_LEVELS } from '../utils/strictness';
import { PROVIDER_DISPLAY_NAMES, API_KEY_VALIDATION } from '../utils/constants';
import { configCleanup } from '../utils/config-cleanup';
import { askYesNo } from '../utils/prompts';

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

interface RepoIdentifierPrompts {
  field1Name: string;
  field1Message: string;
  field2Name: string;
  field2Message: string;
}

async function promptForRepoIdentifiers(prompts: RepoIdentifierPrompts): Promise<{ field1: string; field2: string }> {
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
            name: `${chalk.hex(SUCCESS_COLOR)('✓')} GitLab - Available`,
            value: 'gitlab',
          },
        ],
      },
    ]);

    setConfig('platform', gitPlatform as never, configScope);
    configCleanup('platform', configScope);
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

      // Try to auto-extract workspace and repo from git remote
      const remoteUrl = getGitRemoteUrl();
      const parsedBitbucket = remoteUrl ? parseBitbucketUrl(remoteUrl) : null;

      let workspace: string;
      let repoSlug: string;

      if (parsedBitbucket) {
        console.log(chalk.hex(SUCCESS_COLOR)(`✓ Detected from git remote: ${parsedBitbucket.workspace}/${parsedBitbucket.repoSlug}\n`));

        const useDetected = await askYesNo('Use detected workspace and repository?');

        if (useDetected) {
          workspace = parsedBitbucket.workspace;
          repoSlug = parsedBitbucket.repoSlug;
        } else {
          const result = await promptForRepoIdentifiers({
            field1Name: 'Workspace',
            field1Message: 'Enter your Bitbucket workspace',
            field2Name: 'Repository slug',
            field2Message: 'Enter your repository slug',
          });
          workspace = result.field1;
          repoSlug = result.field2;
        }
      } else {
        const result = await promptForRepoIdentifiers({
          field1Name: 'Workspace',
          field1Message: 'Enter your Bitbucket workspace',
          field2Name: 'Repository slug',
          field2Message: 'Enter your repository slug',
        });
        workspace = result.field1;
        repoSlug = result.field2;
      }

      setConfig('bitbucket-workspace', workspace as never, configScope);
      console.log(chalk.hex(SUCCESS_COLOR)(`✓ Workspace set to: ${workspace}`));

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

      // Prompt for reviewer UUID for @mentions
      console.log(chalk.hex(INFO_COLOR)('ℹ️  Reviewer UUID is used for @mentions in review comments'));
      console.log(chalk.hex(INFO_COLOR)('   This allows team members to be notified of comment discussions'));
      console.log(chalk.hex(INFO_COLOR)('   Find your UUID: Visit https://bitbucket.org/!api/2.0/user'));
      console.log(chalk.hex(INFO_COLOR)('   Look for the "account_id" field in the JSON response\n'));

      const { reviewerUuid } = await inquirer.prompt([
        {
          type: 'input',
          name: 'reviewerUuid',
          message: 'Enter your Bitbucket account UUID (e.g., 1a2b3c4d5e6f7890abcdef12):',
          validate: (input: string) => {
            if (!input || input.trim().length === 0) {
              return 'UUID is required for review attribution';
            }
            // Basic validation: should be alphanumeric, typically 24 characters
            if (!/^[a-f0-9]{24}$/i.test(input.trim())) {
              return 'UUID should be a 24-character hexadecimal string';
            }
            return true;
          },
        },
      ]);

      setConfig('bitbucket-reviewer-uuid', reviewerUuid.trim() as never, configScope);
      console.log(chalk.hex(SUCCESS_COLOR)('✓ Reviewer UUID saved\n'));

      // Info about API tokens
      console.log(chalk.hex(INFO_COLOR)('ℹ️  API Token permissions required:'));
      console.log(chalk.hex(INFO_COLOR)('   - Repositories: Read, Write'));
      console.log(chalk.hex(INFO_COLOR)('   - Pull requests: Read, Write'));
      console.log(chalk.hex(INFO_COLOR)('   Create at: https://bitbucket.org/account/settings/api-tokens/\n'));
    }

    // Step 5b: GitLab-specific configuration
    if (gitPlatform === 'gitlab') {
      console.log(chalk.hex(INFO_COLOR)('GitLab requires additional configuration:\n'));

      // Try to auto-extract namespace and project from git remote
      const remoteUrl = getGitRemoteUrl();
      const parsedGitLab = remoteUrl ? parseGitLabUrl(remoteUrl) : null;

      let gitlabNamespace: string;
      let gitlabProject: string;

      if (parsedGitLab) {
        console.log(chalk.hex(SUCCESS_COLOR)(`✓ Detected from git remote: ${parsedGitLab.namespace}/${parsedGitLab.project}\n`));

        const useDetected = await askYesNo('Use detected namespace and project?');

        if (useDetected) {
          gitlabNamespace = parsedGitLab.namespace;
          gitlabProject = parsedGitLab.project;
        } else {
          const result = await promptForRepoIdentifiers({
            field1Name: 'Namespace',
            field1Message: 'Enter your GitLab namespace (username or group)',
            field2Name: 'Project name',
            field2Message: 'Enter your GitLab project name',
          });
          gitlabNamespace = result.field1;
          gitlabProject = result.field2;
        }
      } else {
        const result = await promptForRepoIdentifiers({
          field1Name: 'Namespace',
          field1Message: 'Enter your GitLab namespace (username or group)',
          field2Name: 'Project name',
          field2Message: 'Enter your GitLab project name',
        });
        gitlabNamespace = result.field1;
        gitlabProject = result.field2;
      }

      // Concatenate namespace and project name to form project ID
      const gitlabProjectId = `${gitlabNamespace}/${gitlabProject}`;
      setConfig('gitlab-project-id', gitlabProjectId as never, configScope);
      console.log(chalk.hex(SUCCESS_COLOR)(`✓ Project ID set to: ${gitlabProjectId}\n`));

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

      setConfig('gitlab-token', gitlabToken as never, configScope);
      console.log(chalk.hex(SUCCESS_COLOR)('✓ GitLab Personal Access Token saved\n'));

      const { gitlabUrl } = await inquirer.prompt([
        {
          type: 'input',
          name: 'gitlabUrl',
          message: 'Enter your GitLab instance URL (leave empty for https://gitlab.com):',
          default: 'https://gitlab.com',
        },
      ]);

      if (gitlabUrl && gitlabUrl.trim().length > 0) {
        setConfig('gitlab-url', gitlabUrl as never, configScope);
        console.log(chalk.hex(SUCCESS_COLOR)(`✓ GitLab URL set to: ${gitlabUrl}\n`));
      } else {
        console.log(chalk.hex(SECONDARY_COLOR)('✓ Using default GitLab URL: https://gitlab.com\n'));
      }

      // Info about Personal Access Token
      console.log(chalk.hex(INFO_COLOR)('ℹ️  Personal Access Token scopes required:'));
      console.log(chalk.hex(INFO_COLOR)('   - api (full API access)'));
      console.log(chalk.hex(INFO_COLOR)('   Or specific scopes: read_api, write_repository'));
      console.log(chalk.hex(INFO_COLOR)('   Create at: https://gitlab.com/-/user_settings/personal_access_tokens\n'));
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
    } else if (gitPlatform === 'gitlab') {
      console.log(chalk.hex(SECONDARY_COLOR)('   1. Your Personal Access Token must have the following scopes:'));
      console.log(chalk.hex(SECONDARY_COLOR)('      - api (full API access)'));
      console.log(chalk.hex(SECONDARY_COLOR)('      - Or specific: read_api, write_repository'));
      console.log(chalk.hex(SECONDARY_COLOR)('   2. Create token at: https://gitlab.com/-/user_settings/personal_access_tokens'));
      console.log(chalk.hex(SECONDARY_COLOR)('   3. Navigate to a repo with merge requests'));
      console.log(chalk.hex(SECONDARY_COLOR)('   4. Run: ai-review pr\n'));
    }
  });
