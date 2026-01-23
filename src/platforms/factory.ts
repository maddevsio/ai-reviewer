import { GitPlatform } from './base';
import { GitHubPlatform } from './github';
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

    case 'gitlab':
      throw new Error('GitLab platform not yet implemented');

    case 'bitbucket':
      throw new Error('Bitbucket platform not yet implemented');

    default:
      throw new Error(`Unknown platform: ${platform}`);
  }
}
