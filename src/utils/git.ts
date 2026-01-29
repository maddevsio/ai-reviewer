import * as fs from 'fs';
import * as path from 'path';

/**
 * Find git repository root by walking up the directory tree
 * @param startPath Starting directory (defaults to current working directory)
 * @returns Git repo root path or null if not in a git repo
 */
export function findGitRepoRoot(startPath: string = process.cwd()): string | null {
  let currentPath = path.resolve(startPath);
  const root = path.parse(currentPath).root;

  while (currentPath !== root) {
    const gitPath = path.join(currentPath, '.git');

    if (fs.existsSync(gitPath)) {
      return currentPath;
    }

    currentPath = path.dirname(currentPath);
  }

  return null;
}

/**
 * Check if current directory is inside a git repository
 * @param startPath Starting directory (defaults to current working directory)
 * @returns true if inside a git repo, false otherwise
 */
export function isInGitRepo(startPath: string = process.cwd()): boolean {
  return findGitRepoRoot(startPath) !== null;
}
