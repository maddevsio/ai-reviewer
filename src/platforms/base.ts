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
}

export abstract class BaseGitPlatform implements GitPlatform {
  abstract listPullRequests(): Promise<PullRequest[]>;
  abstract getPullRequestDetails(id: string): Promise<PullRequestDetails>;
  abstract postComment(prId: string, comment: CommentInput, commitSha?: string): Promise<void>;
  abstract submitReview(prId: string, action: ReviewAction, body?: string): Promise<void>;
  abstract submitReviewWithComments(prId: string, review: ReviewSubmission, commitSha: string): Promise<void>;
  abstract isAuthenticated(): Promise<boolean>;
  abstract getName(): string;

  protected parseDate(dateString: string): Date {
    return new Date(dateString);
  }
}
