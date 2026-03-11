import { GitPlatform } from './base';
import { GitHubPlatform } from './github';
import { BitbucketPlatform } from './bitbucket';
import { GitLabPlatform } from './gitlab';
import { getConfig } from '../config/manager';
import { checkGitHubCLI, showGitHubCLIInstallInstructions, showGitHubCLIAuthInstructions } from '../utils/cli-check';

export async function createGitPlatform(): Promise<GitPlatform> {
  const platform = getConfig('platform') || 'github';

  switch (platform) {
    case 'github': {
      const { installed, authenticated } = await checkGitHubCLI();

      if (!installed) {
        showGitHubCLIInstallInstructions();
        process.exit(1);
      }

      if (!authenticated) {
        showGitHubCLIAuthInstructions();
        process.exit(1);
      }

      return new GitHubPlatform();
    }

    case 'bitbucket': {
      // Bitbucket uses direct API access (no CLI)
      const bitbucket = new BitbucketPlatform();

      // Verify authentication
      if (!(await bitbucket.isAuthenticated())) {
        console.error('Error: Bitbucket authentication failed.');
        console.error('Please check your configuration:');
        console.error('  - bitbucket-workspace');
        console.error('  - bitbucket-repo-slug');
        console.error('  - bitbucket-username');
        console.error('  - bitbucket-api-token (Personal API Token)');
        console.error('\nRun: ai-review init');
        process.exit(1);
      }

      return bitbucket;
    }

    case 'gitlab': {
      // GitLab uses direct API access (no CLI)
      const gitlab = new GitLabPlatform();

      // Verify authentication
      if (!(await gitlab.isAuthenticated())) {
        console.error('Error: GitLab authentication failed.');
        console.error('Please check your configuration:');
        console.error('  - gitlab-project-id');
        console.error('  - gitlab-token (Personal Access Token)');
        console.error('  - gitlab-url (optional, defaults to https://gitlab.com)');
        console.error('\nRun: ai-review init');
        process.exit(1);
      }

      return gitlab;
    }

    default:
      throw new Error(`Unknown platform: ${platform}`);
  }
}
