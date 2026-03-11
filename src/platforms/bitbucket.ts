import axios, { AxiosInstance } from 'axios';
import { getConfig } from '../config/manager';
import { logger } from '../utils/logger';
import { BITBUCKET_API_BASE_URL, DEFAULT_PAGINATION_SIZE } from '../config/constants';
import {
  BaseGitPlatform,
  PullRequest,
  PullRequestDetails,
  CommentInput,
  ReviewAction,
  Comment,
  Author,
} from './base';
import { parseFileChanges } from '../utils/diff-parser';

// Bitbucket API response shapes

interface BitbucketApiUser {
  nickname?: string;
  username?: string;
  display_name: string;
  links?: { avatar?: { href: string } };
}

interface BitbucketApiPullRequest {
  id: number;
  title: string;
  state: string;
  description?: string;
  author: BitbucketApiUser;
  source: { commit: { hash: string } };
  updated_on: string;
  created_on: string;
  links: { html: { href: string } };
}

interface BitbucketApiComment {
  id: number;
  content?: { raw?: string };
  user: BitbucketApiUser;
  inline?: { path?: string; to?: number };
  created_on: string;
}

interface BitbucketCommentPayload {
  content: { raw: string };
  inline?: {
    path: string;
    to: number;
    start_to?: number;
  };
}

interface BitbucketConfig {
  workspace: string;
  repoSlug: string;
  username: string;
  apiToken: string;
}

export class BitbucketPlatform extends BaseGitPlatform {
  private api: AxiosInstance;
  private config: BitbucketConfig;

  constructor() {
    super();

    // Load Bitbucket-specific config
    const workspace = getConfig('bitbucket-workspace');
    const repoSlug = getConfig('bitbucket-repo-slug');
    const username = getConfig('bitbucket-username');
    const apiToken = getConfig('bitbucket-api-token');

    if (!workspace || !repoSlug || !username || !apiToken) {
      throw new Error(
        'Bitbucket configuration incomplete. Please run: ai-review init\n' +
        'Required: bitbucket-workspace, bitbucket-repo-slug, bitbucket-username, bitbucket-api-token'
      );
    }

    this.config = {
      workspace,
      repoSlug,
      username,
      apiToken,
    };

    // Use Basic auth with Personal API Token (username:token)
    const basicAuth = Buffer.from(`${username}:${apiToken}`).toString('base64');
    this.api = axios.create({
      baseURL: BITBUCKET_API_BASE_URL,
      headers: {
        'Authorization': `Basic ${basicAuth}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
    });

    this.api.interceptors.request.use((config) => {
      logger.logPlatformApiRequest(
        config.method?.toUpperCase() ?? 'REQUEST',
        `${config.baseURL ?? ''}${config.url ?? ''}`,
        { ...config.headers, Authorization: 'Basic [redacted]' },
        config.data,
      );
      return config;
    });

    this.api.interceptors.response.use(
      (response) => {
        logger.logApiResponse('Bitbucket', response.status, JSON.stringify(response.data).length, response.data);
        return response;
      },
      (error) => {
        if (error.response) {
          logger.logApiResponse('Bitbucket', error.response.status, JSON.stringify(error.response.data).length, error.response.data);
        }
        return Promise.reject(error);
      },
    );
  }

  getName(): string {
    return 'Bitbucket';
  }

  async isAuthenticated(): Promise<boolean> {
    try {
      await this.api.get('/user');
      return true;
    } catch (error: any) {
      return this.handleAuthError(error);
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
            pagelen: DEFAULT_PAGINATION_SIZE,
          },
        }
      );

      logger.logPlatform('listPullRequests', `Found ${response.data.values.length} open PRs`);

      return (response.data.values as BitbucketApiPullRequest[]).map((pr) => this.mapPullRequest(pr));
    } catch (error: any) {
      return this.handleApiError(error, 'list pull requests');
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
      const comments = (commentsResponse.data.values as BitbucketApiComment[]).map((c) => this.mapComment(c));

      const files = parseFileChanges(diff);

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
      return this.handleApiError(error, 'get PR details');
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

      const payload: BitbucketCommentPayload = {
        content: {
          raw: comment.body,
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
      return this.handleApiError(error, 'post comment');
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
      return this.handleApiError(error, 'submit review');
    }
  }

  private mapPullRequest(pr: BitbucketApiPullRequest): PullRequest {
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

  private mapAuthor(user: BitbucketApiUser): Author {
    return {
      username: user.nickname || user.username || user.display_name,
      name: user.display_name,
      avatar: user.links?.avatar?.href,
    };
  }

  private mapComment(comment: BitbucketApiComment): Comment {
    return {
      id: comment.id.toString(),
      body: comment.content?.raw || '',
      author: this.mapAuthor(comment.user),
      path: comment.inline?.path,
      line: comment.inline?.to,
      createdAt: this.parseDate(comment.created_on),
    };
  }

}
