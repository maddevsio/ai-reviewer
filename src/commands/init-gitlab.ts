import chalk from 'chalk';
import inquirer from 'inquirer';
import { setConfig } from '../config/manager';
import { SUCCESS_COLOR, INFO_COLOR, SECONDARY_COLOR } from '../utils/colors';
import { getGitRemoteUrl, parseGitLabUrl } from '../utils/git';
import { askYesNo } from '../utils/prompts';
import { promptForRepoIdentifiers } from './init';

export async function setupGitLabConfig(configScope: 'global' | 'local'): Promise<void> {
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
  setConfig('gitlab-project-id', gitlabProjectId, configScope);
  console.log(chalk.hex(SUCCESS_COLOR)(`✓ Project ID set to: ${gitlabProjectId}\n`));

  const { gitlabUrl } = await inquirer.prompt([
    {
      type: 'input',
      name: 'gitlabUrl',
      message: 'Enter your GitLab instance URL (leave empty for https://gitlab.com):',
      default: 'https://gitlab.com',
    },
  ]);

  const resolvedUrl = gitlabUrl?.trim() || 'https://gitlab.com';
  if (resolvedUrl !== 'https://gitlab.com') {
    setConfig('gitlab-url', resolvedUrl, configScope);
    console.log(chalk.hex(SUCCESS_COLOR)(`✓ GitLab URL set to: ${resolvedUrl}\n`));
  } else {
    console.log(chalk.hex(SECONDARY_COLOR)('✓ Using default GitLab URL: https://gitlab.com\n'));
  }

  // Show token info before prompting, so user knows where to create one
  const tokenUrl = `${resolvedUrl}/${gitlabProjectId}/-/settings/access_tokens`;
  console.log(chalk.hex(INFO_COLOR)('ℹ️  Project Access Token scopes required:'));
  console.log(chalk.hex(INFO_COLOR)('   - api (full API access)'));
  console.log(chalk.hex(INFO_COLOR)('   Or specific scopes: read_api, write_repository'));
  console.log(chalk.hex(INFO_COLOR)(`   Create at: ${tokenUrl}\n`));

  const { gitlabToken } = await inquirer.prompt([
    {
      type: 'password',
      name: 'gitlabToken',
      message: 'Enter your GitLab Project Access Token:',
      mask: '*',
      validate: (input: string) => {
        if (!input || input.trim().length === 0) {
          return 'Project Access Token is required';
        }
        return true;
      },
    },
  ]);

  setConfig('gitlab-token', gitlabToken, configScope);
  console.log(chalk.hex(SUCCESS_COLOR)('✓ GitLab Project Access Token saved\n'));
}
