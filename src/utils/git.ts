import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';

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

/**
 * Get git remote URL for the specified remote name
 * @param remoteName Remote name (defaults to 'origin')
 * @returns Remote URL or null if not found
 */
export function getGitRemoteUrl(remoteName: string = 'origin'): string | null {
  try {
    const url = execSync(`git remote get-url ${remoteName}`, {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'ignore'] // Suppress stderr
    }).trim();
    return url || null;
  } catch {
    return null;
  }
}

export interface BitbucketRepoInfo {
  workspace: string;
  repoSlug: string;
}

/**
 * Parse Bitbucket remote URL to extract workspace and repo slug
 * Supports both HTTPS and SSH formats:
 * - HTTPS: https://bitbucket.org/workspace/repo.git
 * - SSH: git@bitbucket.org:workspace/repo.git
 *
 * @param remoteUrl Git remote URL
 * @returns Bitbucket repo info or null if not a Bitbucket URL
 */
export function parseBitbucketUrl(remoteUrl: string): BitbucketRepoInfo | null {
  if (!remoteUrl || !remoteUrl.includes('bitbucket.org')) {
    return null;
  }

  // Try HTTPS format: https://bitbucket.org/workspace/repo.git
  const httpsMatch = remoteUrl.match(/bitbucket\.org\/([^\/]+)\/([^\/]+?)(?:\.git)?$/);
  if (httpsMatch) {
    return {
      workspace: httpsMatch[1],
      repoSlug: httpsMatch[2],
    };
  }

  // Try SSH format: git@bitbucket.org:workspace/repo.git
  const sshMatch = remoteUrl.match(/bitbucket\.org:([^\/]+)\/([^\/]+?)(?:\.git)?$/);
  if (sshMatch) {
    return {
      workspace: sshMatch[1],
      repoSlug: sshMatch[2],
    };
  }

  return null;
}

/**
 * Detect which git platform a remote URL belongs to.
 * @param remoteUrl Git remote URL
 * @returns Detected platform name or null if unrecognised
 */
export function detectPlatformFromUrl(remoteUrl: string): 'github' | 'gitlab' | 'bitbucket' | null {
  if (!remoteUrl) return null;
  if (remoteUrl.includes('github.com')) return 'github';
  if (remoteUrl.includes('bitbucket.org')) return 'bitbucket';
  if (remoteUrl.includes('gitlab')) return 'gitlab';
  return null;
}

export interface GitLabRepoInfo {
  namespace: string;
  project: string;
  host: string;
}

/**
 * Parse GitLab remote URL to extract namespace and project name
 * Supports both HTTPS and SSH formats:
 * - HTTPS: https://gitlab.com/namespace/project.git
 * - SSH: git@gitlab.com:namespace/project.git
 * - Self-hosted: https://gitlab.example.com/namespace/project.git
 *
 * @param remoteUrl Git remote URL
 * @returns GitLab repo info or null if not a GitLab URL
 */
export function parseGitLabUrl(remoteUrl: string): GitLabRepoInfo | null {
  if (!remoteUrl || !remoteUrl.includes('gitlab')) {
    return null;
  }

  // Try HTTPS format: https://gitlab.com/namespace/project.git
  const httpsMatch = remoteUrl.match(/^(https?:\/\/[^\/]+)\/([^\/]+)\/([^\/]+?)(?:\.git)?$/);
  if (httpsMatch) {
    return {
      host: httpsMatch[1],
      namespace: httpsMatch[2],
      project: httpsMatch[3],
    };
  }

  // Try SSH format: git@gitlab.com:namespace/project.git
  const sshMatch = remoteUrl.match(/^git@([^:]+):([^\/]+)\/([^\/]+?)(?:\.git)?$/);
  if (sshMatch) {
    return {
      host: `https://${sshMatch[1]}`,
      namespace: sshMatch[2],
      project: sshMatch[3],
    };
  }

  return null;
}
