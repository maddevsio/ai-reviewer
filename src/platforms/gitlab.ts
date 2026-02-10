import axios, { AxiosInstance } from 'axios';
import crypto from 'crypto';
import { getConfig } from '../config/manager';
import { logger } from '../utils/logger';
import { DEFAULT_GITLAB_URL, DEFAULT_PAGINATION_SIZE } from '../config/constants';
import {
  BaseGitPlatform,
  PullRequest,
  PullRequestDetails,
  CommentInput,
  ReviewAction,
  FileChange,
  Comment,
  Author,
} from './base';

interface GitLabConfig {
  projectId: string;
  token: string;
  url: string;
}

export class GitLabPlatform extends BaseGitPlatform {
  private api: AxiosInstance;
  private config: GitLabConfig;

  constructor() {
    super();

    // Load GitLab-specific config
    const projectId = getConfig('gitlab-project-id');
    const token = getConfig('gitlab-token');
    const url = getConfig('gitlab-url') || DEFAULT_GITLAB_URL;

    if (!projectId || !token) {
      throw new Error(
        'GitLab configuration incomplete. Please run: ai-review init\n' +
        'Required: gitlab-project-id, gitlab-token'
      );
    }

    this.config = {
      projectId,
      token,
      url,
    };

    logger.log('config', `GitLab config: projectId=${projectId}, url=${url}, token=${token ? `${token.slice(0, 8)}...` : 'missing'}`);

    // Use Personal Access Token authentication
    this.api = axios.create({
      baseURL: `${url}/api/v4`,
      headers: {
        'PRIVATE-TOKEN': token,
        'Content-Type': 'application/json',
      },
    });

    logger.log('api-detailed', `GitLab API baseURL: ${url}/api/v4`);
    logger.log('api-detailed', `GitLab API headers: PRIVATE-TOKEN=${token ? `${token.slice(0, 8)}...` : 'missing'}`);
  }

  getName(): string {
    return 'GitLab';
  }

  async isAuthenticated(): Promise<boolean> {
    try {
      const url = `${this.config.url}/api/v4/user`;
      logger.logPlatformApiRequest('GET', url, { 'PRIVATE-TOKEN': `${this.config.token.slice(0, 8)}...` });
      const response = await this.api.get('/user');
      logger.logApiResponse('GitLab', response.status, JSON.stringify(response.data).length, response.data);
      return true;
    } catch (error: any) {
      return this.handleAuthError(error);
    }
  }

  async listPullRequests(): Promise<PullRequest[]> {
    try {
      logger.logPlatform('listPullRequests', `Fetching open MRs from project ${this.config.projectId}`);

      const url = `/projects/${encodeURIComponent(this.config.projectId)}/merge_requests`;
      const fullUrl = `${this.config.url}/api/v4${url}`;
      const params = { state: 'opened', per_page: DEFAULT_PAGINATION_SIZE };

      logger.logApiRequest('GitLab', fullUrl, params);

      const response = await this.api.get(url, { params });

      logger.logApiResponse('GitLab', response.status, JSON.stringify(response.data).length, response.data);
      logger.logPlatform('listPullRequests', `Found ${response.data.length} open MRs`);

      return response.data.map((mr: any) => this.mapMergeRequest(mr));
    } catch (error: any) {
      this.handleApiError(error, 'list merge requests');
    }
  }

  async getPullRequestDetails(id: string): Promise<PullRequestDetails> {
    try {
      logger.logPlatform('getPullRequestDetails', `Fetching MR !${id} with diff and comments`);

      const projectPath = `/projects/${encodeURIComponent(this.config.projectId)}`;
      logger.logApiRequest('GitLab', `${this.config.url}/api/v4${projectPath}/merge_requests/${id}`);
      logger.logApiRequest('GitLab', `${this.config.url}/api/v4${projectPath}/merge_requests/${id}/diffs`);
      logger.logApiRequest('GitLab', `${this.config.url}/api/v4${projectPath}/merge_requests/${id}/discussions`);

      // Fetch MR details, diff, and discussions in parallel
      const [mrResponse, diffResponse, discussionsResponse] = await Promise.all([
        this.api.get(`${projectPath}/merge_requests/${id}`),
        this.api.get(`${projectPath}/merge_requests/${id}/diffs`),
        this.api.get(`${projectPath}/merge_requests/${id}/discussions`),
      ]);

      const summaryData = { files: diffResponse.data.length, discussions: discussionsResponse.data.length };
      logger.logApiResponse('GitLab', mrResponse.status, JSON.stringify(summaryData).length, summaryData);

      const mrData = mrResponse.data;
      const diffs = diffResponse.data;

      // Convert diffs to unified diff format
      const diff = this.convertToUnifiedDiff(diffs);

      // Parse files from diffs
      const files = this.parseFilesFromDiffs(diffs);

      // Extract comments from discussions
      const comments = this.extractComments(discussionsResponse.data);

      logger.logPlatform('getPullRequestDetails', `Fetched MR !${id}: ${files.length} files, ${comments.length} existing comments`);

      // Get diff refs for comment positioning
      const diffRefs = mrData.diff_refs || {};
      const headSha = diffRefs.head_sha || mrData.sha;
      const baseSha = diffRefs.base_sha || mrData.diff_refs?.base_sha;
      const startSha = diffRefs.start_sha || diffRefs.base_sha;

      logger.log('api-detailed', `MR diff refs: base_sha=${baseSha}, start_sha=${startSha}, head_sha=${headSha}`);

      return {
        pr: this.mapMergeRequest(mrData),
        description: mrData.description || '',
        diff,
        files,
        comments,
        headSha,
        baseSha,
        startSha,
      };
    } catch (error: any) {
      this.handleApiError(error, 'get MR details');
    }
  }

  async postComment(prId: string, comment: CommentInput, commitSha?: string): Promise<void> {
    try {
      const commentType = comment.path && comment.line ? 'inline' : 'general';
      const location = comment.path && comment.line ? `${comment.path}:${comment.line}` : 'MR';
      logger.logPlatform('postComment', `Posting ${commentType} comment to MR !${prId} at ${location}`);

      const projectPath = `/projects/${encodeURIComponent(this.config.projectId)}`;

      if (comment.path && comment.line && commitSha) {
        // Parse commitSha - it should be in format "base:start:head"
        const [baseSha, startSha, headSha] = commitSha.includes(':')
          ? commitSha.split(':')
          : [commitSha, commitSha, commitSha];

        // Inline comment using discussions API
        const position: any = {
          position_type: 'text',
          old_path: comment.path,  // Same as new_path for modified files
          new_path: comment.path,
          old_line: null,  // null for new/modified lines
          new_line: comment.line,
          base_sha: baseSha,
          start_sha: startSha,
          head_sha: headSha,
        };

        // Multi-line support
        if (comment.startLine && comment.startLine !== comment.line) {
          position.line_range = {
            start: {
              line_code: this.generateLineCode(comment.path, comment.startLine),
              type: 'new',
              old_line: null,
              new_line: comment.startLine,
            },
            end: {
              line_code: this.generateLineCode(comment.path, comment.line),
              type: 'new',
              old_line: null,
              new_line: comment.line,
            },
          };
        }

        const url = `${projectPath}/merge_requests/${prId}/discussions`;
        const fullUrl = `${this.config.url}/api/v4${url}`;
        const payload = { body: comment.body, position };
        logger.logApiRequest('GitLab', fullUrl, payload);

        const response = await this.api.post(url, payload);
        logger.logApiResponse('GitLab', response.status, JSON.stringify(response.data).length, response.data);
      } else {
        // General comment (note)
        const url = `${projectPath}/merge_requests/${prId}/notes`;
        const fullUrl = `${this.config.url}/api/v4${url}`;
        const payload = { body: comment.body };
        logger.logApiRequest('GitLab', fullUrl, payload);

        const response = await this.api.post(url, payload);
        logger.logApiResponse('GitLab', response.status, JSON.stringify(response.data).length, response.data);
      }

      logger.logPlatform('postComment', 'Comment posted successfully');
    } catch (error: any) {
      this.handleApiError(error, 'post comment');
    }
  }

  async submitReview(prId: string, action: ReviewAction, body?: string): Promise<void> {
    try {
      logger.logPlatform('submitReview', `Submitting review for MR !${prId} with action: ${action}`);

      const projectPath = `/projects/${encodeURIComponent(this.config.projectId)}`;

      if (action === 'APPROVE') {
        // Approve the MR
        const url = `${projectPath}/merge_requests/${prId}/approve`;
        const fullUrl = `${this.config.url}/api/v4${url}`;
        logger.logApiRequest('GitLab', fullUrl);

        const response = await this.api.post(url);
        logger.logApiResponse('GitLab', response.status, JSON.stringify(response.data).length, response.data);
        logger.logPlatform('submitReview', `MR !${prId} approved successfully`);
      } else if (action === 'REQUEST_CHANGES') {
        // Note: GitLab doesn't support "Request changes" via public API v4
        // This is only reachable if called programmatically (not from UI menu)
        // We'll post a general note as a fallback, but this doesn't set any special status
        logger.log('platform', 'WARNING: REQUEST_CHANGES not supported by GitLab API - posting as general note');

        const message = body || 'Changes requested. Please address the review comments.';
        const url = `${projectPath}/merge_requests/${prId}/notes`;
        const fullUrl = `${this.config.url}/api/v4${url}`;
        const payload = { body: message };
        logger.logApiRequest('GitLab', fullUrl, payload);

        const response = await this.api.post(url, payload);
        logger.logApiResponse('GitLab', response.status, JSON.stringify(response.data).length, response.data);
        logger.logPlatform('submitReview', `Posted change request note to MR !${prId} (no special status)`);
      } else if (action === 'COMMENT') {
        // Post general comment if body provided (skip if empty/undefined)
        if (body && body.trim().length > 0) {
          const url = `${projectPath}/merge_requests/${prId}/notes`;
          const fullUrl = `${this.config.url}/api/v4${url}`;
          const payload = { body };
          logger.logApiRequest('GitLab', fullUrl, payload);

          const response = await this.api.post(url, payload);
          logger.logApiResponse('GitLab', response.status, JSON.stringify(response.data).length, response.data);
        } else {
          logger.logPlatform('submitReview', 'Skipping general comment (no body provided)');
        }
      }
    } catch (error: any) {
      this.handleApiError(error, 'submit review');
    }
  }

  private mapMergeRequest(mr: any): PullRequest {
    let status: 'open' | 'closed' | 'merged' = 'open';
    if (mr.state === 'merged') {
      status = 'merged';
    } else if (mr.state === 'closed') {
      status = 'closed';
    }

    return {
      id: mr.iid.toString(),
      number: mr.iid,
      title: mr.title,
      author: this.mapAuthor(mr.author),
      status,
      updatedAt: this.parseDate(mr.updated_at),
      createdAt: this.parseDate(mr.created_at),
      url: mr.web_url,
    };
  }

  private mapAuthor(user: any): Author {
    return {
      username: user.username,
      name: user.name,
      avatar: user.avatar_url,
    };
  }

  private extractComments(discussions: any[]): Comment[] {
    const comments: Comment[] = [];

    for (const discussion of discussions) {
      for (const note of discussion.notes || []) {
        comments.push({
          id: note.id.toString(),
          body: note.body,
          author: this.mapAuthor(note.author),
          path: note.position?.new_path,
          line: note.position?.new_line,
          createdAt: this.parseDate(note.created_at),
        });
      }
    }

    return comments;
  }

  private convertToUnifiedDiff(diffs: any[]): string {
    let unifiedDiff = '';

    for (const file of diffs) {
      unifiedDiff += `diff --git a/${file.old_path} b/${file.new_path}\n`;

      if (file.new_file) {
        unifiedDiff += `new file mode 100644\n`;
      } else if (file.deleted_file) {
        unifiedDiff += `deleted file mode 100644\n`;
      } else if (file.renamed_file) {
        unifiedDiff += `rename from ${file.old_path}\n`;
        unifiedDiff += `rename to ${file.new_path}\n`;
      }

      unifiedDiff += `--- a/${file.old_path}\n`;
      unifiedDiff += `+++ b/${file.new_path}\n`;
      unifiedDiff += file.diff || '';
      unifiedDiff += '\n';
    }

    return unifiedDiff;
  }

  private parseFilesFromDiffs(diffs: any[]): FileChange[] {
    return diffs.map((file: any) => ({
      path: file.new_path,
      additions: this.countLines(file.diff, '+'),
      deletions: this.countLines(file.diff, '-'),
      patch: file.diff || '',
      status: file.new_file ? 'added' :
              file.deleted_file ? 'deleted' :
              file.renamed_file ? 'renamed' : 'modified',
    }));
  }

  private countLines(diff: string, prefix: string): number {
    if (!diff) return 0;
    const regex = new RegExp(`^\\${prefix}[^${prefix}]`, 'gm');
    return (diff.match(regex) || []).length;
  }

  private generateLineCode(path: string, line: number): string {
    // GitLab line code format: SHA1(path)_oldLine_newLine
    // For new lines, we use the format: hash_lineNumber_lineNumber
    const hash = crypto.createHash('sha1').update(path).digest('hex');
    return `${hash}_${line}_${line}`;
  }

}
