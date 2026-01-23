import execa from 'execa';
import { Octokit } from '@octokit/rest';
import {
  BaseGitPlatform,
  PullRequest,
  PullRequestDetails,
  CommentInput,
  Author,
  FileChange,
} from './base';

interface RepoInfo {
  owner: string;
  repo: string;
}

export class GitHubPlatform extends BaseGitPlatform {
  private octokit: Octokit | null = null;

  async isAuthenticated(): Promise<boolean> {
    try {
      await execa('gh', ['auth', 'status']);
      return true;
    } catch (error) {
      return false;
    }
  }

  private async getOctokit(): Promise<Octokit> {
    if (this.octokit) {
      return this.octokit;
    }

    // Get auth token from gh CLI
    const { stdout } = await execa('gh', ['auth', 'token']);
    const token = stdout.trim();

    this.octokit = new Octokit({ auth: token });
    return this.octokit;
  }

  private async getRepoInfo(): Promise<RepoInfo> {
    // Get current repo from git remote
    const { stdout } = await execa('git', ['remote', 'get-url', 'origin']);
    const remoteUrl = stdout.trim();

    // Parse GitHub URL (supports both HTTPS and SSH)
    // HTTPS: https://github.com/owner/repo.git
    // SSH: git@github.com:owner/repo.git
    const match = remoteUrl.match(/github\.com[:/]([^/]+)\/(.+?)(\.git)?$/);
    if (!match) {
      throw new Error('Could not parse GitHub repository from git remote');
    }

    return {
      owner: match[1],
      repo: match[2],
    };
  }

  async listPullRequests(): Promise<PullRequest[]> {
    try {
      const { stdout } = await execa('gh', [
        'pr',
        'list',
        '--json',
        'number,title,author,state,updatedAt,createdAt,url',
      ]);

      const prs = JSON.parse(stdout);

      return prs.map((pr: any) => ({
        id: pr.number.toString(),
        number: pr.number,
        title: pr.title,
        author: {
          username: pr.author.login,
          name: pr.author.name,
        } as Author,
        status: pr.state.toLowerCase() as 'open' | 'closed' | 'merged',
        updatedAt: this.parseDate(pr.updatedAt),
        createdAt: this.parseDate(pr.createdAt),
        url: pr.url,
      }));
    } catch (error: any) {
      if (error.stderr?.includes('no pull requests')) {
        return [];
      }
      throw new Error(`Failed to list pull requests: ${error.message}`);
    }
  }

  async getPullRequestDetails(id: string): Promise<PullRequestDetails> {
    try {
      // Get PR metadata including headRefOid (commit SHA)
      const { stdout: metadataJson } = await execa('gh', [
        'pr',
        'view',
        id,
        '--json',
        'number,title,author,state,updatedAt,createdAt,url,body,comments,headRefOid',
      ]);

      const metadata = JSON.parse(metadataJson);

      // Get PR diff
      const { stdout: diff } = await execa('gh', ['pr', 'diff', id]);

      // Parse files from diff (simplified - in real implementation, parse diff properly)
      const files: FileChange[] = this.parseDiffFiles(diff);

      const pr: PullRequest = {
        id: metadata.number.toString(),
        number: metadata.number,
        title: metadata.title,
        author: {
          username: metadata.author.login,
          name: metadata.author.name,
        },
        status: metadata.state.toLowerCase(),
        updatedAt: this.parseDate(metadata.updatedAt),
        createdAt: this.parseDate(metadata.createdAt),
        url: metadata.url,
      };

      return {
        pr,
        description: metadata.body || '',
        diff,
        files,
        comments: metadata.comments?.map((c: any) => ({
          id: c.id,
          body: c.body,
          author: {
            username: c.author.login,
            name: c.author.name,
          },
          createdAt: this.parseDate(c.createdAt),
        })) || [],
        headSha: metadata.headRefOid,
      };
    } catch (error: any) {
      throw new Error(`Failed to get PR details: ${error.message}`);
    }
  }

  async postComment(prId: string, comment: CommentInput, commitSha?: string): Promise<void> {
    try {
      if (comment.path && comment.line !== undefined && commitSha) {
        // Inline comment on specific line(s) using GitHub API
        const octokit = await this.getOctokit();
        const repoInfo = await this.getRepoInfo();

        const reviewCommentParams: any = {
          owner: repoInfo.owner,
          repo: repoInfo.repo,
          pull_number: parseInt(prId, 10),
          body: comment.body,
          commit_id: commitSha,
          path: comment.path,
          line: comment.line,
          side: 'RIGHT', // Comment on the new version of the file
        };

        // Add multi-line support if startLine is provided
        if (comment.startLine !== undefined && comment.startLine !== comment.line) {
          reviewCommentParams.start_line = comment.startLine;
          reviewCommentParams.start_side = 'RIGHT';
        }

        await octokit.pulls.createReviewComment(reviewCommentParams);
      } else {
        // General PR comment using gh CLI
        await execa('gh', ['pr', 'comment', prId, '--body', comment.body]);
      }
    } catch (error: any) {
      throw new Error(`Failed to post comment: ${error.message}`);
    }
  }

  getName(): string {
    return 'GitHub';
  }

  private parseDiffFiles(diff: string): FileChange[] {
    const files: FileChange[] = [];
    const fileRegex = /^diff --git a\/(.*?) b\/(.*?)$/gm;
    let match;

    while ((match = fileRegex.exec(diff)) !== null) {
      const path = match[2];

      // Simple stats extraction (in real implementation, properly parse diff)
      const additions = (diff.match(/^\+[^+]/gm) || []).length;
      const deletions = (diff.match(/^-[^-]/gm) || []).length;

      files.push({
        path,
        additions,
        deletions,
        patch: '', // Simplified for now
        status: 'modified',
      });
    }

    return files;
  }
}
