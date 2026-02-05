import { getConfig, deleteConfig } from '../config/manager';
import { logger } from './logger';

export type CleanupTarget = 'provider' | 'platform';

/**
 * Clean up redundant config fields when provider or platform changes
 *
 * Silently removes config keys that don't belong to the current provider/platform.
 * Logs cleanup operations when --verbose=config is enabled.
 *
 * @param target - What to clean: 'provider', 'platform', or undefined for both
 * @param configScope - Which config to clean: 'global' or 'local'
 */
export function configCleanup(
  target?: CleanupTarget,
  configScope: 'global' | 'local' = 'global'
): void {
  const cleaned = {
    provider: [] as string[],
    platform: [] as string[],
  };

  // Clean provider-specific fields
  if (!target || target === 'provider') {
    const currentProvider = getConfig('provider');

    // Clean up fields that don't belong to current provider
    if (currentProvider !== 'google') {
      // If not using Google, remove google-model
      if (getConfig('google-model')) {
        deleteConfig('google-model', configScope);
        cleaned.provider.push('google-model');
      }
    }

    // Future: When OpenAI is added, clean up openai-model if not using OpenAI
    // if (currentProvider !== 'openai') {
    //   if (getConfig('openai-model')) {
    //     deleteConfig('openai-model', configScope);
    //     cleaned.provider.push('openai-model');
    //   }
    // }
  }

  // Clean platform-specific fields
  if (!target || target === 'platform') {
    const currentPlatform = getConfig('platform');

    // Clean up fields that don't belong to current platform
    if (currentPlatform !== 'bitbucket') {
      // If not using Bitbucket, remove bitbucket-* fields
      if (getConfig('bitbucket-workspace')) {
        deleteConfig('bitbucket-workspace', configScope);
        cleaned.platform.push('bitbucket-workspace');
      }
      if (getConfig('bitbucket-repo-slug')) {
        deleteConfig('bitbucket-repo-slug', configScope);
        cleaned.platform.push('bitbucket-repo-slug');
      }
      if (getConfig('bitbucket-app-password')) {
        deleteConfig('bitbucket-app-password', configScope);
        cleaned.platform.push('bitbucket-app-password');
      }
      if (getConfig('bitbucket-reviewer-uuid')) {
        deleteConfig('bitbucket-reviewer-uuid', configScope);
        cleaned.platform.push('bitbucket-reviewer-uuid');
      }
    }

    if (currentPlatform !== 'gitlab') {
      // If not using GitLab, remove gitlab-* fields
      if (getConfig('gitlab-token')) {
        deleteConfig('gitlab-token', configScope);
        cleaned.platform.push('gitlab-token');
      }
      if (getConfig('gitlab-project-id')) {
        deleteConfig('gitlab-project-id', configScope);
        cleaned.platform.push('gitlab-project-id');
      }
      if (getConfig('gitlab-url')) {
        deleteConfig('gitlab-url', configScope);
        cleaned.platform.push('gitlab-url');
      }
    }

    // GitHub has no platform-specific keys to clean up
  }

  // Log cleanup operations when verbose logging is enabled
  const allCleaned = [...cleaned.provider, ...cleaned.platform];
  if (allCleaned.length > 0) {
    logger.log('config', `Cleaned up redundant config keys: ${allCleaned.join(', ')}`);
  }
}
