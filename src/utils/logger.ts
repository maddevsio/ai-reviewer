import chalk from 'chalk';

export type LogCategory = 'api' | 'api-detailed' | 'config' | 'prompt' | 'diff' | 'platform';

class Logger {
  private enabledCategories: Set<LogCategory> = new Set();
  private isVerbose: boolean = false;

  /**
   * Enable verbose logging for specific categories
   * @param categories Array of categories to enable, or 'all' for everything
   */
  enable(categories: LogCategory[] | 'all'): void {
    this.isVerbose = true;
    if (categories === 'all') {
      this.enabledCategories = new Set(['api', 'api-detailed', 'config', 'prompt', 'diff', 'platform']);
    } else {
      categories.forEach((cat) => this.enabledCategories.add(cat));

      // Auto-enable 'api' when 'api-detailed' is requested
      if (categories.includes('api-detailed') && !categories.includes('api')) {
        this.enabledCategories.add('api');
      }
    }
  }

  /**
   * Disable verbose logging
   */
  disable(): void {
    this.isVerbose = false;
    this.enabledCategories.clear();
  }

  /**
   * Check if a category is enabled
   */
  isEnabled(category: LogCategory): boolean {
    return this.isVerbose && this.enabledCategories.has(category);
  }

  /**
   * Log a verbose message for a specific category
   */
  log(category: LogCategory, message: string, data?: any): void {
    if (!this.isEnabled(category)) {
      return;
    }

    const categoryColor = this.getCategoryColor(category);
    const prefix = chalk.hex(categoryColor)(`[${category.toUpperCase()}]`);
    console.log(`${prefix} ${chalk.dim(message)}`);

    if (data !== undefined) {
      console.log(chalk.dim(typeof data === 'string' ? data : JSON.stringify(data, null, 2)));
    }
  }

  /**
   * Log API request details
   */
  logApiRequest(provider: string, endpoint: string, payload?: any): void {
    this.log('api', `→ ${provider} request: ${endpoint}`);
    if (payload && this.isEnabled('api-detailed')) {
      console.log(chalk.dim('Request payload:'));
      console.log(chalk.dim(JSON.stringify(payload, null, 2)));
    }
  }

  /**
   * Log API response details
   */
  logApiResponse(provider: string, status: number, responseSize?: number, responseData?: any): void {
    const statusColor = status >= 200 && status < 300 ? '#00FF00' : '#FF0000';
    const sizeInfo = responseSize ? ` (${responseSize} bytes)` : '';
    this.log('api', `← ${provider} response: ${chalk.hex(statusColor)(status)}${sizeInfo}`);

    if (responseData && this.isEnabled('api-detailed')) {
      console.log(chalk.dim('Response data:'));
      console.log(chalk.dim(typeof responseData === 'string' ? responseData : JSON.stringify(responseData, null, 2)));
    }
  }

  /**
   * Log detailed platform API request (method, URL, headers, body)
   */
  logPlatformApiRequest(method: string, url: string, headers?: any, body?: any): void {
    if (!this.isEnabled('api-detailed')) {
      return;
    }

    this.log('api-detailed', `${method} ${url}`);
    if (headers) {
      console.log(chalk.dim('Headers:'));
      console.log(chalk.dim(JSON.stringify(headers, null, 2)));
    }
    if (body !== undefined) {
      console.log(chalk.dim('Body:'));
      console.log(chalk.dim(typeof body === 'string' ? body : JSON.stringify(body, null, 2)));
    }
  }

  /**
   * Log configuration loading
   */
  logConfigLoad(source: string, path: string, keys: string[]): void {
    this.log('config', `Loaded config from: ${source}`);
    if (this.isEnabled('config')) {
      console.log(chalk.dim(`  Path: ${path}`));
      console.log(chalk.dim(`  Keys: ${keys.join(', ')}`));
    }
  }

  /**
   * Log prompt construction
   */
  logPrompt(size: number, strictness: string, fileCount: number): void {
    this.log('prompt', `Constructed AI prompt: ${size} tokens, strictness=${strictness}, files=${fileCount}`);
  }

  /**
   * Log diff parsing
   */
  logDiff(files: number, additions: number, deletions: number): void {
    this.log('diff', `Parsed diff: ${files} files, +${additions} -${deletions} lines`);
  }

  /**
   * Log platform operations
   */
  logPlatform(operation: string, details: string): void {
    this.log('platform', `${operation}: ${details}`);
  }

  private getCategoryColor(category: LogCategory): string {
    const colors: Record<LogCategory, string> = {
      api: '#00BFFF',          // Deep sky blue
      'api-detailed': '#0080FF', // Slightly darker blue
      config: '#FFD700',       // Gold
      prompt: '#FF69B4',       // Hot pink
      diff: '#32CD32',         // Lime green
      platform: '#FF8C00',     // Dark orange
    };
    return colors[category];
  }
}

// Singleton instance
export const logger = new Logger();

/**
 * Parse --verbose flag value and enable appropriate categories
 * @param value String like "api,config" or true for all
 */
export function enableVerboseLogging(value: string | boolean): void {
  if (value === true || value === 'true') {
    logger.enable('all');
  } else if (typeof value === 'string') {
    const categories = value.split(',').map((c) => c.trim()) as LogCategory[];
    const validCategories = categories.filter((c) =>
      ['api', 'api-detailed', 'config', 'prompt', 'diff', 'platform'].includes(c)
    );

    if (validCategories.length === 0) {
      console.warn(chalk.yellow('⚠ Invalid verbose categories. Valid: api, api-detailed, config, prompt, diff, platform'));
      console.warn(chalk.yellow('  Using --verbose without value enables all categories'));
      return;
    }

    logger.enable(validCategories);
  }
}
