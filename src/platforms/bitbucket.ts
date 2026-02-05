import axios, { AxiosInstance } from 'axios';
import { getConfig } from '../config/manager';
import { logger } from '../utils/logger';
import {
  BaseGitPlatform,
  PullRequest,
  PullRequestDetails,
  CommentInput,
  ReviewAction,
  ReviewSubmission,
  FileChange,
  Comment,
  Author,
} from './base';

interface BitbucketConfig {
  workspace: string;
  repoSlug: string;
  username: string;
  appPassword: string;
  reviewerUuid: string;
}

export class BitbucketPlatform extends BaseGitPlatform {
  private api: AxiosInstance;
  private config: BitbucketConfig;

  constructor() {
    super();

    // Load Bitbucket-specific config
    const workspace = getConfig('bitbucket-workspace');
    const repoSlug = getConfig('bitbucket-repo-slug');
    const apiToken = getConfig('bitbucket-app-password'); // Still using old field name for now
    const reviewerUuid = getConfig('bitbucket-reviewer-uuid');

    if (!workspace || !repoSlug || !apiToken || !reviewerUuid) {
      throw new Error(
        'Bitbucket configuration incomplete. Please run: ai-review init\n' +
        'Required: bitbucket-workspace, bitbucket-repo-slug, bitbucket-app-password, bitbucket-reviewer-uuid\n' +
        'Note: Only API Tokens (ATATT...) are supported. App Passwords are deprecated.'
      );
    }

    this.config = {
      workspace,
      repoSlug,
      username: '', // Not needed for Bearer auth
      appPassword: apiToken,
      reviewerUuid,
    };

    // Use Bearer token authentication (API Tokens only)
    this.api = axios.create({
      baseURL: 'https://api.bitbucket.org/2.0',
      headers: {
        'Authorization': `Bearer ${apiToken}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
    });
  }

  getName(): string {
    return 'Bitbucket';
  }

  async isAuthenticated(): Promise<boolean> {
    try {
      // Test authentication by fetching workspace info
      await this.api.get(`/workspaces/${this.config.workspace}`);
      return true;
    } catch (error: any) {
      // Log detailed error for debugging
      if (error.response) {
        console.error(`Bitbucket API Error: ${error.response.status} ${error.response.statusText}`);
        if (error.response.data?.error?.message) {
          console.error(`Message: ${error.response.data.error.message}`);
        }
        console.error(`Response data:`, JSON.stringify(error.response.data, null, 2));
      } else if (error.request) {
        console.error('No response received from Bitbucket API');
      } else {
        console.error(`Error: ${error.message}`);
      }
      return false;
    }
  }

  async listPullRequests(): Promise<PullRequest[]> {
    try {
      logger.logPlatform('listPullRequests', `Fetching open PRs from ${this.config.workspace}/${this.config.repoSlug}`);

      const response = await this.api.get(
        `/repositories/${this.config.workspace}/${this.config.repoSlug}/pullrequests`,
        {
          params: {
            state: 'OPEN',
            pagelen: 50, // Get up to 50 PRs
          },
        }
      );

      logger.logPlatform('listPullRequests', `Found ${response.data.values.length} open PRs`);

      return response.data.values.map((pr: any) => this.mapPullRequest(pr));
    } catch (error: any) {
      throw new Error(`Failed to list pull requests: ${error.message}`);
    }
  }

  async getPullRequestDetails(id: string): Promise<PullRequestDetails> {
    try {
      logger.logPlatform('getPullRequestDetails', `Fetching PR #${id} with diff and comments`);

      // Fetch PR details, diff, and comments in parallel
      const [prResponse, diffResponse, commentsResponse] = await Promise.all([
        this.api.get(`/repositories/${this.config.workspace}/${this.config.repoSlug}/pullrequests/${id}`),
        this.api.get(`/repositories/${this.config.workspace}/${this.config.repoSlug}/pullrequests/${id}/diff`, {
          headers: { Accept: 'text/plain' }, // Get raw diff
        }),
        this.api.get(`/repositories/${this.config.workspace}/${this.config.repoSlug}/pullrequests/${id}/comments`),
      ]);

      const prData = prResponse.data;
      const diff = diffResponse.data;
      const comments = commentsResponse.data.values.map((c: any) => this.mapComment(c));

      // Bitbucket doesn't provide per-file stats in the PR object, so we'll parse from diff
      const files = this.parseFilesFromDiff(diff);

      logger.logPlatform('getPullRequestDetails', `Fetched PR #${id}: ${files.length} files, ${comments.length} existing comments`);

      return {
        pr: this.mapPullRequest(prData),
        description: prData.description || '',
        diff,
        files,
        comments,
        headSha: prData.source.commit.hash,
      };
    } catch (error: any) {
      throw new Error(`Failed to get PR details: ${error.message}`);
    }
  }

  async postComment(prId: string, comment: CommentInput, commitSha?: string): Promise<void> {
    try {
      const commentType = comment.path && comment.line ? 'inline' : 'general';
      const location = comment.path && comment.line ? `${comment.path}:${comment.line}` : 'PR';
      const rangeInfo = comment.startLine && comment.startLine !== comment.line
        ? ` (range: ${comment.startLine}-${comment.line})`
        : comment.startLine
          ? ` (single line, startLine=${comment.startLine} equals line=${comment.line})`
          : ' (no startLine)';
      logger.logPlatform('postComment', `Posting ${commentType} comment to PR #${prId} at ${location}${rangeInfo}`);

      // Append reviewer mention to comment for attribution and notifications
      const commentWithMention = `${comment.body}\n\n---\n_👤 Reviewed by @{${this.config.reviewerUuid}}_`;

      const payload: any = {
        content: {
          raw: commentWithMention,
        },
      };

      // Inline comment (specific file and line)
      if (comment.path && comment.line) {
        payload.inline = {
          path: comment.path,
          to: comment.line, // Ending line in NEW version (after PR changes)
        };

        // Multi-line comment support
        // start_to = starting line in NEW version (for multi-line comments)
        // to = ending line in NEW version
        // Note: 'from' and 'start_from' are for OLD version (deleted code), not used here
        if (comment.startLine && comment.startLine !== comment.line) {
          payload.inline.start_to = comment.startLine;
        }
      }

      const url = `/repositories/${this.config.workspace}/${this.config.repoSlug}/pullrequests/${prId}/comments`;
      logger.logPlatformApiRequest('POST', url, undefined, payload);

      await this.api.post(url, payload);

      logger.logPlatform('postComment', `Comment posted successfully`);
    } catch (error: any) {
      throw new Error(`Failed to post comment: ${error.message}`);
    }
  }

  async submitReview(prId: string, action: ReviewAction, body?: string): Promise<void> {
    try {
      logger.logPlatform('submitReview', `Submitting review for PR #${prId} with action: ${action}`);

      if (action === 'APPROVE') {
        const url = `/repositories/${this.config.workspace}/${this.config.repoSlug}/pullrequests/${prId}/approve`;
        const headers = { 'Content-Type': undefined };

        logger.logPlatformApiRequest('POST', url, headers, undefined);

        // Approve the PR (remove Content-Type header as Bitbucket approve endpoint expects no body)
        await this.api.post(url, undefined, { headers });

        logger.logPlatform('submitReview', `PR #${prId} approved successfully`);
      } else if (action === 'REQUEST_CHANGES') {
        const url = `/repositories/${this.config.workspace}/${this.config.repoSlug}/pullrequests/${prId}/request-changes`;
        const headers = { 'Content-Type': undefined };

        logger.logPlatformApiRequest('POST', url, headers, undefined);

        // Request changes on the PR (remove Content-Type header, similar to approve)
        await this.api.post(url, undefined, { headers });

        logger.logPlatform('submitReview', `Changes requested for PR #${prId}`);
      } else if (action === 'COMMENT') {
        // For Bitbucket, all comments are already posted individually via postComment()
        // No need to post an additional general comment
        // (Unlike GitHub which bundles everything in a single review)
      }
    } catch (error: any) {
      // Enhanced error logging
      if (error.response) {
        console.error(`Bitbucket API Error: ${error.response.status} ${error.response.statusText}`);
        console.error('Response data:', JSON.stringify(error.response.data, null, 2));
        console.error('Request URL:', error.config?.url);
        console.error('Request method:', error.config?.method);
      }
      throw new Error(`Failed to submit review: ${error.message}`);
    }
  }

  async submitReviewWithComments(
    prId: string,
    review: ReviewSubmission,
    commitSha: string
  ): Promise<void> {
    try {
      // Post all inline comments first
      for (const comment of review.comments) {
        await this.postComment(prId, comment, commitSha);
      }

      // Then submit the review action
      await this.submitReview(prId, review.action, review.body);
    } catch (error: any) {
      throw new Error(`Failed to submit review with comments: ${error.message}`);
    }
  }

  private mapPullRequest(pr: any): PullRequest {
    let status: 'open' | 'closed' | 'merged' = 'open';
    if (pr.state === 'MERGED') {
      status = 'merged';
    } else if (pr.state === 'DECLINED' || pr.state === 'SUPERSEDED') {
      status = 'closed';
    }

    return {
      id: pr.id.toString(),
      number: pr.id,
      title: pr.title,
      author: this.mapAuthor(pr.author),
      status,
      updatedAt: this.parseDate(pr.updated_on),
      createdAt: this.parseDate(pr.created_on),
      url: pr.links.html.href,
    };
  }

  private mapAuthor(user: any): Author {
    return {
      username: user.nickname || user.username || user.display_name,
      name: user.display_name,
      avatar: user.links?.avatar?.href,
    };
  }

  private mapComment(comment: any): Comment {
    return {
      id: comment.id.toString(),
      body: comment.content?.raw || '',
      author: this.mapAuthor(comment.user),
      path: comment.inline?.path,
      line: comment.inline?.to,
      createdAt: this.parseDate(comment.created_on),
    };
  }

  private parseFilesFromDiff(diff: string): FileChange[] {
    const files: FileChange[] = [];
    let currentFile: FileChange | null = null;

    const lines = diff.split('\n');
    let i = 0;

    while (i < lines.length) {
      const line = lines[i];

      // New file detected
      if (line.startsWith('diff --git')) {
        if (currentFile) {
          files.push(currentFile);
        }

        const fileMatch = line.match(/^diff --git a\/(.*?) b\/(.*?)$/);
        if (fileMatch) {
          const path = fileMatch[2];
          currentFile = {
            path,
            additions: 0,
            deletions: 0,
            patch: '',
            status: 'modified',
          };

          // Collect patch until next file
          let patchLines: string[] = [line];
          i++;
          while (i < lines.length && !lines[i].startsWith('diff --git')) {
            patchLines.push(lines[i]);

            // Count additions and deletions
            if (lines[i].startsWith('+') && !lines[i].startsWith('+++')) {
              currentFile.additions++;
            } else if (lines[i].startsWith('-') && !lines[i].startsWith('---')) {
              currentFile.deletions++;
            }

            // Detect file status
            if (lines[i].startsWith('new file mode')) {
              currentFile.status = 'added';
            } else if (lines[i].startsWith('deleted file mode')) {
              currentFile.status = 'deleted';
            } else if (lines[i].startsWith('rename from')) {
              currentFile.status = 'renamed';
            }

            i++;
          }
          currentFile.patch = patchLines.join('\n');
          continue;
        }
      }
      i++;
    }

    // Add last file
    if (currentFile) {
      files.push(currentFile);
    }

    return files;
  }
}
