import chalk from 'chalk';
import inquirer from 'inquirer';
import { setConfig } from '../config/manager';
import { SUCCESS_COLOR, INFO_COLOR } from '../config/colors';
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

  setConfig('bitbucket-workspace', workspace, configScope);
  console.log(chalk.hex(SUCCESS_COLOR)(`✓ Workspace set to: ${workspace}`));

  setConfig('bitbucket-repo-slug', repoSlug, configScope);
  console.log(chalk.hex(SUCCESS_COLOR)(`✓ Repository slug set to: ${repoSlug}\n`));

  // Prompt for account email (used as username in Basic auth)
  const { bbUsername } = await inquirer.prompt([
    {
      type: 'input',
      name: 'bbUsername',
      message: 'Enter your Bitbucket account email:',
      validate: (input: string) => {
        if (!input || input.trim().length === 0) {
          return 'Account email is required';
        }
        return true;
      },
    },
  ]);

  setConfig('bitbucket-username', bbUsername.trim(), configScope);
  console.log(chalk.hex(SUCCESS_COLOR)(`✓ Username set to: ${bbUsername.trim()}\n`));

  // Show token info before prompting, so user knows where to create one
  console.log(chalk.hex(INFO_COLOR)('ℹ️  Personal API Token required. To create one:'));
  console.log(chalk.hex(INFO_COLOR)('   1. Go to: https://id.atlassian.com/manage-profile/'));
  console.log(chalk.hex(INFO_COLOR)('   2. Navigate to: Security → API tokens → Create and manage API tokens → Create API token with scopes'));
  console.log(chalk.hex(INFO_COLOR)('   3. Create a new token with the following scopes:'));
  console.log(chalk.hex(INFO_COLOR)('      - read:user:bitbucket'));
  console.log(chalk.hex(INFO_COLOR)('      - read:pullrequest:bitbucket'));
  console.log(chalk.hex(INFO_COLOR)('      - read:repository:bitbucket'));
  console.log(chalk.hex(INFO_COLOR)('      - write:pullrequest:bitbucket'));
  console.log(chalk.hex(INFO_COLOR)('      - write:repository:bitbucket\n'));

  const { bbApiToken } = await inquirer.prompt([
    {
      type: 'password',
      name: 'bbApiToken',
      message: 'Enter your Bitbucket Personal API Token:',
      mask: '*',
      validate: (input: string) => {
        if (!input || input.trim().length === 0) {
          return 'Personal API Token is required';
        }
        return true;
      },
    },
  ]);

  setConfig('bitbucket-api-token', bbApiToken, configScope);
  console.log(chalk.hex(SUCCESS_COLOR)('✓ Bitbucket Personal API Token saved\n'));
}
