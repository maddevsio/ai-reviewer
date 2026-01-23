import Conf from 'conf';

export type AIProvider = 'anthropic' | 'openai' | 'google';
export type Platform = 'github' | 'gitlab' | 'bitbucket';

export interface ConfigSchema {
  provider?: AIProvider;
  'api-key'?: string;
  platform?: Platform;
}

// Initialize configuration store
const config = new Conf<ConfigSchema>({
  projectName: 'ai-code-review',
});

export function getConfig<K extends keyof ConfigSchema>(key: K): ConfigSchema[K] | undefined {
  return config.get(key);
}

export function setConfig<K extends keyof ConfigSchema>(key: K, value: NonNullable<ConfigSchema[K]>): void {
  config.set(key, value);
}

export function deleteConfig<K extends keyof ConfigSchema>(key: K): void {
  config.delete(key);
}

export function listConfig(): ConfigSchema {
  return config.store;
}

export function hasConfig<K extends keyof ConfigSchema>(key: K): boolean {
  return config.has(key);
}
