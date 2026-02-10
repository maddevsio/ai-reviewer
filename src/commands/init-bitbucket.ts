import chalk from 'chalk';
import inquirer from 'inquirer';
import { setConfig } from '../config/manager';
import { SUCCESS_COLOR, INFO_COLOR } from '../utils/colors';
import { getGitRemoteUrl, parseBitbucketUrl } from '../utils/git';
import { askYesNo } from '../utils/prompts';
import { promptForRepoIdentifiers } from './init';

export async function setupBitbucketConfig(configScope: 'global' | 'local'): Promise<void> {
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

  setConfig('bitbucket-api-token', bbApiToken as never, configScope);
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
