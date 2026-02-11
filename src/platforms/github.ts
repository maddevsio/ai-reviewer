import execa from 'execa';
import { Octokit } from '@octokit/rest';
import {
  BaseGitPlatform,
  PullRequest,
  PullRequestDetails,
  CommentInput,
  Author,
  ReviewAction,
  ReviewSubmission,
} from './base';
import { parseFileChanges } from '../utils/diff-parser';

// GitHub CLI / API response shapes

interface GitHubCliAuthor {
  login: string;
  name?: string;
}

interface GitHubCliPullRequest {
  number: number;
  title: string;
  author: GitHubCliAuthor;
  state: string;
  updatedAt: string;
  createdAt: string;
  url: string;
  body?: string;
  comments?: GitHubCliComment[];
  headRefOid?: string;
}

interface GitHubCliComment {
  id: string;
  body: string;
  author: GitHubCliAuthor;
  createdAt: string;
}

interface GitHubReviewCommentParams {
  [key: string]: unknown;
  owner: string;
  repo: string;
  pull_number: number;
  body: string;
  commit_id: string;
  path: string;
  line: number;
  side: 'RIGHT';
  start_line?: number;
  start_side?: 'RIGHT';
}

interface GitHubReviewComment {
  path: string;
  body: string;
  line: number;
  side: 'RIGHT';
  start_line?: number;
  start_side?: 'RIGHT';
}

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
    } catch (error: any) {
      return this.handleAuthError(error);
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

      const prs: GitHubCliPullRequest[] = JSON.parse(stdout);

      return prs.map((pr) => ({
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
      return this.handleApiError(error, 'list pull requests');
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

      const metadata: GitHubCliPullRequest = JSON.parse(metadataJson);

      // Get PR diff
      const { stdout: diff } = await execa('gh', ['pr', 'diff', id]);

      const files = parseFileChanges(diff);

      const pr: PullRequest = {
        id: metadata.number.toString(),
        number: metadata.number,
        title: metadata.title,
        author: {
          username: metadata.author.login,
          name: metadata.author.name,
        },
        status: metadata.state.toLowerCase() as 'open' | 'closed' | 'merged',
        updatedAt: this.parseDate(metadata.updatedAt),
        createdAt: this.parseDate(metadata.createdAt),
        url: metadata.url,
      };

      return {
        pr,
        description: metadata.body || '',
        diff,
        files,
        comments: metadata.comments?.map((c) => ({
          id: c.id,
          body: c.body,
          author: {
            username: c.author.login,
            name: c.author.name,
          },
          createdAt: this.parseDate(c.createdAt),
        })) || [],
        headSha: metadata.headRefOid!,
      };
    } catch (error: any) {
      return this.handleApiError(error, 'get PR details');
    }
  }

  async postComment(prId: string, comment: CommentInput, commitSha?: string): Promise<void> {
    try {
      if (comment.path && comment.line !== undefined && commitSha) {
        // Inline comment on specific line(s) using GitHub API
        const octokit = await this.getOctokit();
        const repoInfo = await this.getRepoInfo();

        const reviewCommentParams: GitHubReviewCommentParams = {
          owner: repoInfo.owner,
          repo: repoInfo.repo,
          pull_number: parseInt(prId, 10),
          body: comment.body,
          commit_id: commitSha,
          path: comment.path,
          line: comment.line,
          side: 'RIGHT',
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
      return this.handleApiError(error, 'post comment');
    }
  }

  async submitReview(prId: string, action: ReviewAction, body?: string): Promise<void> {
    try {
      const octokit = await this.getOctokit();
      const repoInfo = await this.getRepoInfo();

      await octokit.pulls.createReview({
        owner: repoInfo.owner,
        repo: repoInfo.repo,
        pull_number: parseInt(prId, 10),
        event: action,
        body: body || '',
      });
    } catch (error: any) {
      return this.handleApiError(error, 'submit review');
    }
  }

  async submitReviewWithComments(prId: string, review: ReviewSubmission, commitSha: string): Promise<void> {
    try {
      const octokit = await this.getOctokit();
      const repoInfo = await this.getRepoInfo();

      // Build comments array for GitHub API
      const comments = review.comments.map((comment) => {
        const reviewComment: GitHubReviewComment = {
          path: comment.path!,
          body: comment.body,
          line: comment.line!,
          side: 'RIGHT',
        };

        // Add multi-line support if startLine is provided
        if (comment.startLine !== undefined && comment.startLine !== comment.line) {
          reviewComment.start_line = comment.startLine;
          reviewComment.start_side = 'RIGHT';
        }

        return reviewComment;
      });

      await octokit.pulls.createReview({
        owner: repoInfo.owner,
        repo: repoInfo.repo,
        pull_number: parseInt(prId, 10),
        commit_id: commitSha,
        event: review.action,
        body: review.body,
        comments: comments.length > 0 ? comments : undefined,
      });
    } catch (error: any) {
      return this.handleApiError(error, 'submit review with comments');
    }
  }

  getName(): string {
    return 'GitHub';
  }

}
