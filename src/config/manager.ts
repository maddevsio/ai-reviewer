import Conf from 'conf';
import * as fs from 'fs';
import * as path from 'path';
import { findGitRepoRoot } from '../utils/git';
import { logger } from '../utils/logger';

export type AIProvider = 'anthropic' | 'openai' | 'google';
export type Platform = 'github' | 'gitlab' | 'bitbucket';
export type ReviewStrictness = 'easy' | 'normal' | 'balanced' | 'strict' | 'pedantic';

export interface ConfigSchema {
  provider?: AIProvider;
  'api-key'?: string;
  platform?: Platform;
  // Review settings
  'review-strictness'?: ReviewStrictness;
  // Google-specific fields
  'google-model'?: string;
  // Bitbucket-specific fields
  'bitbucket-workspace'?: string;
  'bitbucket-repo-slug'?: string;
  'bitbucket-username'?: string;
  'bitbucket-api-token'?: string;
  'bitbucket-reviewer-uuid'?: string;
  // GitLab-specific fields
  'gitlab-token'?: string;
  'gitlab-project-id'?: string;
  'gitlab-url'?: string;
}

// Global configuration store (using conf package)
const globalConfig = new Conf<ConfigSchema>({
  projectName: 'ai-code-review',
});

const LOCAL_CONFIG_DIR = '.ai-review';
const LOCAL_CONFIG_FILE = 'config.json';

// Cache for local config to avoid redundant fs.readFileSync + JSON.parse on every getConfig() call.
// Invalidated on saveLocalConfig().
let localConfigCache: ConfigSchema | null = null;

/**
 * Get the path to the local config directory (in git repo root)
 * @returns Path to .ai-review directory or null if not in a git repo
 */
export function getLocalConfigDir(): string | null {
  const repoRoot = findGitRepoRoot();
  if (!repoRoot) {
    return null;
  }
  return path.join(repoRoot, LOCAL_CONFIG_DIR);
}

/**
 * Get the path to the local config file
 * @returns Path to .ai-review/config.json or null if not in a git repo
 */
export function getLocalConfigPath(): string | null {
  const configDir = getLocalConfigDir();
  if (!configDir) {
    return null;
  }
  return path.join(configDir, LOCAL_CONFIG_FILE);
}

/**
 * Get the path to the global config file
 * @returns Path to global config file
 */
export function getGlobalConfigPath(): string {
  return globalConfig.path;
}

/**
 * Load local config from .ai-review/config.json
 * @returns Local config object or empty object if not found
 */
function loadLocalConfig(): ConfigSchema {
  if (localConfigCache !== null) {
    return localConfigCache;
  }

  const localConfigPath = getLocalConfigPath();
  if (!localConfigPath || !fs.existsSync(localConfigPath)) {
    localConfigCache = {};
    return localConfigCache;
  }

  try {
    const content = fs.readFileSync(localConfigPath, 'utf-8');
    localConfigCache = JSON.parse(content);
    logger.logConfigLoad('local', localConfigPath, Object.keys(localConfigCache!));
    return localConfigCache!;
  } catch (error) {
    console.warn(`Warning: Failed to parse local config at ${localConfigPath}`);
    localConfigCache = {};
    return localConfigCache;
  }
}

/**
 * Save local config to .ai-review/config.json
 * @param config Config object to save
 */
function saveLocalConfig(config: ConfigSchema): void {
  const localConfigPath = getLocalConfigPath();
  if (!localConfigPath) {
    throw new Error('Not in a git repository. Cannot save local config.');
  }

  const configDir = path.dirname(localConfigPath);
  if (!fs.existsSync(configDir)) {
    fs.mkdirSync(configDir, { recursive: true });
  }

  fs.writeFileSync(localConfigPath, JSON.stringify(config, null, 2), 'utf-8');
  localConfigCache = config;
}

/**
 * Get config value with hierarchical resolution (local > global)
 * @param key Config key
 * @returns Config value or undefined if not found
 */
export function getConfig<K extends keyof ConfigSchema>(key: K): ConfigSchema[K] | undefined {
  // Check local config first
  const localConfig = loadLocalConfig();
  if (localConfig[key] !== undefined) {
    logger.log('config', `Resolved '${key}' from local config`);
    return localConfig[key];
  }

  // Fall back to global config
  const value = globalConfig.get(key);
  if (value !== undefined) {
    logger.log('config', `Resolved '${key}' from global config (${globalConfig.path})`);
  } else {
    logger.log('config', `Key '${key}' not found in any config`);
  }
  return value;
}

/**
 * Set config value (saves to global config by default)
 * @param key Config key
 * @param value Config value
 * @param scope 'global' or 'local' (default: 'global')
 */
export function setConfig(
  key: keyof ConfigSchema,
  value: string,
  scope: 'global' | 'local' = 'global'
): void {
  if (scope === 'local') {
    const localConfig = loadLocalConfig();
    (localConfig as Record<string, string>)[key] = value;
    saveLocalConfig(localConfig);
  } else {
    globalConfig.set(key as any, value);
  }
}

/**
 * Delete config value (from global config by default)
 * @param key Config key
 * @param scope 'global' or 'local' (default: 'global')
 */
export function deleteConfig<K extends keyof ConfigSchema>(
  key: K,
  scope: 'global' | 'local' = 'global'
): void {
  if (scope === 'local') {
    const localConfig = loadLocalConfig();
    delete localConfig[key];
    saveLocalConfig(localConfig);
  } else {
    globalConfig.delete(key);
  }
}

/**
 * List all config values with hierarchical resolution
 * @returns Merged config object (local overrides global)
 */
export function listConfig(): ConfigSchema {
  const localConfig = loadLocalConfig();
  const global = globalConfig.store;

  // Merge configs (local overrides global)
  return { ...global, ...localConfig };
}

/**
 * Check if a config key exists (checks both local and global)
 * @param key Config key
 * @returns true if key exists in either config
 */
export function hasConfig<K extends keyof ConfigSchema>(key: K): boolean {
  const localConfig = loadLocalConfig();
  return localConfig[key] !== undefined || globalConfig.has(key);
}

/**
 * Detect which config scope currently has a key
 * @param key Config key
 * @returns 'local' if key exists in local config, 'global' if in global, undefined if not found
 */
export function getConfigScope<K extends keyof ConfigSchema>(key: K): 'local' | 'global' | undefined {
  const localConfig = loadLocalConfig();
  if (localConfig[key] !== undefined) {
    return 'local';
  }
  if (globalConfig.has(key)) {
    return 'global';
  }
  return undefined;
}

/**
 * Get information about active config location
 * @returns Object with config source info
 */
export function getConfigInfo(): {
  hasLocal: boolean;
  hasGlobal: boolean;
  localPath: string | null;
  globalPath: string;
  activeSource: 'local' | 'global' | 'none';
} {
  const localPath = getLocalConfigPath();
  const hasLocal = localPath !== null && fs.existsSync(localPath);
  const hasGlobal = Object.keys(globalConfig.store).length > 0;

  let activeSource: 'local' | 'global' | 'none' = 'none';
  if (hasLocal) {
    activeSource = 'local';
  } else if (hasGlobal) {
    activeSource = 'global';
  }

  return {
    hasLocal,
    hasGlobal,
    localPath,
    globalPath: globalConfig.path,
    activeSource,
  };
}
