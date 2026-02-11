import { getConfig, deleteConfig, ConfigSchema } from '../config/manager';
import { SENSITIVE_KEYS, PROVIDER_CONFIG_KEYS, PLATFORM_CONFIG_KEYS } from '../config/constants';
import { logger } from './logger';

// --- Config cleanup ---

export type CleanupTarget = 'provider' | 'platform';

/**
 * Clean up redundant config fields when provider or platform changes.
 *
 * Driven by PROVIDER_CONFIG_KEYS and PLATFORM_CONFIG_KEYS mappings in constants.
 * Adding a new provider/platform only requires updating those mappings.
 *
 * @param target - What to clean: 'provider', 'platform', or undefined for both
 * @param configScope - Which config to clean: 'global' or 'local'
 */
export function configCleanup(
  target?: CleanupTarget,
  configScope: 'global' | 'local' = 'global'
): void {
  const cleaned: string[] = [];

  if (!target || target === 'provider') {
    const currentProvider = getConfig('provider');
    for (const [provider, keys] of Object.entries(PROVIDER_CONFIG_KEYS)) {
      if (provider !== currentProvider && keys) {
        for (const key of keys) {
          if (getConfig(key) !== undefined) {
            deleteConfig(key, configScope);
            cleaned.push(key);
          }
        }
      }
    }
  }

  if (!target || target === 'platform') {
    const currentPlatform = getConfig('platform');
    for (const [platform, keys] of Object.entries(PLATFORM_CONFIG_KEYS)) {
      if (platform !== currentPlatform && keys) {
        for (const key of keys as Array<keyof ConfigSchema>) {
          if (getConfig(key) !== undefined) {
            deleteConfig(key, configScope);
            cleaned.push(key);
          }
        }
      }
    }
  }

  if (cleaned.length > 0) {
    logger.log('config', `Cleaned up redundant config keys: ${cleaned.join(', ')}`);
  }
}

// --- Sensitive key helpers ---

export function isSensitiveKey(key: string): boolean {
  return SENSITIVE_KEYS.includes(key as any);
}

export function maskApiKey(key: string): string {
  if (key.length <= 10) {
    return '***';
  }
  return `${key.slice(0, 8)}...${key.slice(-4)}`;
}
