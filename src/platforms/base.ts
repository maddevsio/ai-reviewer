import { logger } from '../utils/logger';

/**
 * Base interface for git platforms (GitHub, GitLab, Bitbucket)
 * All platform adapters must implement this interface
 */

export interface PullRequest {
  id: string;
  number: number;
  title: string;
  author: Author;
  status: 'open' | 'closed' | 'merged';
  updatedAt: Date;
  createdAt: Date;
  url: string;
}

export interface Author {
  username: string;
  name?: string;
  avatar?: string;
}

export interface PullRequestDetails {
  pr: PullRequest;
  description: string;
  diff: string;
  files: FileChange[];
  comments: Comment[];
  headSha: string; // Commit SHA of the PR head
  baseSha?: string; // Base commit SHA (for GitLab positioning)
  startSha?: string; // Start commit SHA (for GitLab positioning)
}

export interface FileChange {
  path: string;
  additions: number;
  deletions: number;
  patch: string;
  status: 'added' | 'modified' | 'deleted' | 'renamed';
}

export interface Comment {
  id: string;
  body: string;
  author: Author;
  path?: string;
  line?: number;
  createdAt: Date;
}

export interface CommentInput {
  body: string;
  path?: string;
  line?: number;
  startLine?: number;  // For multi-line comments
  position?: number;
}

export type ReviewAction = 'APPROVE' | 'REQUEST_CHANGES' | 'COMMENT';

export interface ReviewSubmission {
  action: ReviewAction;
  body?: string; // Optional - only for general review comments
  comments: CommentInput[];
}

export interface GitPlatform {
  /**
   * List all open pull requests
   */
  listPullRequests(): Promise<PullRequest[]>;

  /**
   * Get detailed information about a specific pull request
   */
  getPullRequestDetails(id: string): Promise<PullRequestDetails>;

  /**
   * Post a comment on a pull request
   */
  postComment(prId: string, comment: CommentInput, commitSha?: string): Promise<void>;

  /**
   * Submit a review with approval status
   */
  submitReview(prId: string, action: ReviewAction, body?: string): Promise<void>;

  /**
   * Submit a review with comments and approval status in one request
   */
  submitReviewWithComments(prId: string, review: ReviewSubmission, commitSha: string): Promise<void>;

  /**
   * Check if the platform CLI/API is properly authenticated
   */
  isAuthenticated(): Promise<boolean>;

  /**
   * Get the name of this platform
   */
  getName(): string;

  /**
   * Format commit reference for this platform's API.
   * Each platform may need SHAs in a different format for comment positioning.
   */
  getCommitRef(details: PullRequestDetails): string;
}

export abstract class BaseGitPlatform implements GitPlatform {
  abstract listPullRequests(): Promise<PullRequest[]>;
  abstract getPullRequestDetails(id: string): Promise<PullRequestDetails>;
  abstract postComment(prId: string, comment: CommentInput, commitSha?: string): Promise<void>;
  abstract submitReview(prId: string, action: ReviewAction, body?: string): Promise<void>;
  abstract isAuthenticated(): Promise<boolean>;
  abstract getName(): string;

  /**
   * Default: return headSha. Platforms needing additional SHAs (e.g. GitLab) override this.
   */
  getCommitRef(details: PullRequestDetails): string {
    return details.headSha;
  }

  /**
   * Default implementation: post comments individually, then submit review action.
   * GitHub overrides this to batch everything in a single API call.
   */
  async submitReviewWithComments(prId: string, review: ReviewSubmission, commitSha: string): Promise<void> {
    try {
      for (const comment of review.comments) {
        await this.postComment(prId, comment, commitSha);
      }
      await this.submitReview(prId, review.action, review.body);
    } catch (error: any) {
      return this.handleApiError(error, 'submit review with comments');
    }
  }

  protected parseDate(dateString: string): Date {
    return new Date(dateString);
  }

  /**
   * Shared error handler for API operations. Logs details via logger, then throws.
   */
  protected handleApiError(error: any, operation: string): never {
    const platform = this.getName();
    if (error.response) {
      logger.logApiResponse(platform, error.response.status, JSON.stringify(error.response.data).length, error.response.data);
      logger.log('api', `${platform} API Error: ${error.response.status} - ${JSON.stringify(error.response.data)}`);
    } else if (error.request) {
      logger.log('api', `${platform}: No response received`);
    } else {
      logger.log('api', `${platform} request error: ${error.message}`);
    }
    throw new Error(`Failed to ${operation}: ${error.message}`);
  }

  /**
   * Shared error handler for authentication checks. Logs details via logger, returns false.
   */
  protected handleAuthError(error: any): false {
    const platform = this.getName();
    if (error.response) {
      logger.logApiResponse(platform, error.response.status, JSON.stringify(error.response.data).length, error.response.data);
      logger.log('api', `${platform} auth error: ${error.response.status} ${error.response.statusText}`);
    } else if (error.request) {
      logger.log('api', `${platform}: No response received during auth check`);
    } else {
      logger.log('api', `${platform} auth error: ${error.message}`);
    }
    return false;
  }
}
