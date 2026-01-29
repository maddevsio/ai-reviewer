import { GitPlatform } from './base';
import { GitHubPlatform } from './github';
import { BitbucketPlatform } from './bitbucket';
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
        console.error('  - bitbucket-app-password (API Token)');
        console.error('\nRun: ai-review init');
        process.exit(1);
      }

      return bitbucket;
    }

    case 'gitlab':
      throw new Error('GitLab platform not yet implemented');

    default:
      throw new Error(`Unknown platform: ${platform}`);
  }
}
