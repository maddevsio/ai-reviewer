import { vi } from 'vitest';

/**
 * Mock the `conf` package globally so no test ever writes to the real user config directory.
 * The MockConf class mimics the subset of conf's API used by config/manager.ts.
 */
vi.mock('conf', () => {
  const MockConf = class {
    private _store: Record<string, any> = {};
    path = '/tmp/mock-ai-review-config.json';

    get(key: string) {
      return this._store[key];
    }
    set(key: string, value: any) {
      this._store[key] = value;
    }
    delete(key: string) {
      delete this._store[key];
    }
    has(key: string): boolean {
      return Object.prototype.hasOwnProperty.call(this._store, key);
    }
    get store() {
      return { ...this._store };
    }
  };
  return { default: MockConf };
});
