import chalk from 'chalk';
import inquirer from 'inquirer';
import { displayCodeContext, displayMultiRegionCodeContext } from './code-display';
import { getCodeContext, getMultiRegionCodeContext, isLineInDiff } from './diff-parser';
import { askYesNo, askConfirmation } from './prompts';
import { exportToReviewFile } from './review-export';
import {
  ADDED_LINE_BG,
  REMOVED_LINE_BG,
  INFO_COLOR,
  SUCCESS_COLOR,
  WARNING_COLOR,
  SECONDARY_COLOR,
} from '../config/colors';
import type { ReviewStrictness } from '../config/manager';
import { SEPARATOR_CHAR, SEPARATOR_WIDTH } from '../config/constants';

export interface ReviewComment {
  file: string;
  line?: number; // Optional - undefined for general comments
  startLine?: number;
  comment: string;
  originalCode?: string;
  suggestedCode?: string;
  refLines?: [number, number][]; // Referenced line ranges from distant code (e.g. [[5, 8], [45, 47]])
  targetCode?: string; // Exact code text at LINE/START_LINE — AI self-verification field
  targetCodeEnd?: string; // Exact code text at END_LINE — AI self-verification for multi-line range end
}

export interface ReviewOptions {
  post?: boolean;
  dryRun?: boolean;
  strictness?: ReviewStrictness;
}

interface CommentReviewResult {
  acceptedComments: ReviewComment[];
  cancelled: boolean;
}

/**
 * Convert an inline comment to a general comment with line reference prefix
 * When a comment targets a line not in the diff, we convert it to a general
 * comment (no line number) and add a prefix explaining which line it refers to.
 */
function convertToGeneralComment(comment: ReviewComment): ReviewComment {
  const lineRef = comment.startLine && comment.startLine !== comment.line
    ? `lines ${comment.startLine}-${comment.line}`
    : `line ${comment.line}`;

  return {
    file: comment.file,
    line: undefined, // Remove line number to make it a general comment
    startLine: undefined,
    comment: `[About ${lineRef} - not modified in this PR] ${comment.comment}`,
    originalCode: comment.originalCode,
    suggestedCode: comment.suggestedCode,
  };
}

/**
 * Review comments interactively with the user
 */
export async function reviewCommentsInteractively(
  comments: ReviewComment[],
  parsedDiff: any,
  options: ReviewOptions
): Promise<CommentReviewResult> {
  const acceptedComments: ReviewComment[] = [];

  for (let i = 0; i < comments.length; i++) {
    const comment = comments[i];

    const lineRange = comment.startLine && comment.startLine !== comment.line
      ? `${comment.startLine}-${comment.line}`
      : `${comment.line}`;
    console.log(chalk.bold(`\n[${i + 1}/${comments.length}] ${comment.file}:${lineRange}`));

    // Check if the line exists in the diff
    const lineInDiff = comment.line ? isLineInDiff(parsedDiff, comment.file, comment.line) : false;
    const hasLineNotInDiff = comment.line && !lineInDiff;

    // Show code context from diff if line number is available
    if (comment.line) {
      // For multi-line comments, show context around the entire range
      let targetLine: number;
      let contextLines: number;

      if (comment.startLine && comment.startLine !== comment.line) {
        // Multi-line: show entire range + 3 lines on each side
        // Calculate middle of range and adjust context to cover full range
        targetLine = Math.floor((comment.startLine + comment.line) / 2);
        const halfRange = Math.ceil((comment.line - comment.startLine) / 2);
        contextLines = halfRange + 3; // Half range + 3 lines of context
      } else {
        // Single line: show 3 lines of context around it
        targetLine = comment.line;
        contextLines = 3;
      }

      // Use multi-region display when refLines are present
      if (comment.refLines && comment.refLines.length > 0) {
        const regions = getMultiRegionCodeContext(parsedDiff, comment.file, targetLine, contextLines, comment.refLines);
        if (regions.length > 1) {
          displayMultiRegionCodeContext(regions);
        } else if (regions.length === 1) {
          displayCodeContext(regions[0].lines, regions[0].startLineNum);
        }
      } else {
        const { lines: codeContext, startLineNum } = getCodeContext(parsedDiff, comment.file, targetLine, contextLines);
        if (codeContext.length > 0) {
          displayCodeContext(codeContext, startLineNum);
        }
      }
    } else if (comment.originalCode && comment.suggestedCode) {
      // Fallback to extracted code if available
      console.log(chalk.hex(WARNING_COLOR)(SEPARATOR_CHAR.repeat(SEPARATOR_WIDTH)));
      console.log(chalk.bgHex(REMOVED_LINE_BG).black(`- ${comment.originalCode}`));
      console.log(chalk.bgHex(ADDED_LINE_BG).black(`+ ${comment.suggestedCode}`));
      console.log(chalk.hex(WARNING_COLOR)(SEPARATOR_CHAR.repeat(SEPARATOR_WIDTH)));
    }

    // Show warning if line is not in the diff
    if (hasLineNotInDiff) {
      console.log(chalk.hex(WARNING_COLOR)(`\n⚠ Line ${comment.line} is not modified in this PR`));
      if (options.post) {
        console.log(chalk.hex(WARNING_COLOR)('  Will post as general file comment with line reference'));
      } else {
        console.log(chalk.hex(WARNING_COLOR)('  Will post as general file comment if accepted'));
      }
    }

    console.log(chalk.hex(SECONDARY_COLOR)('AI Comment:'), comment.comment);
    console.log();

    // Dry-run mode: Accept/Discard menu
    if (options.dryRun) {
      const { action } = await inquirer.prompt([
        {
          type: 'list',
          name: 'action',
          message: 'What would you like to do?',
          choices: [
            { name: 'Accept (include in export)', value: 'accept' },
            { name: 'Discard (exclude from export)', value: 'discard' },
            { name: 'Quit review', value: 'quit' },
          ],
        },
      ]);

      if (action === 'quit') {
        console.log(chalk.hex(INFO_COLOR)('\nReview cancelled'));
        return { acceptedComments: [], cancelled: true };
      } else if (action === 'accept') {
        acceptedComments.push(comment);
        console.log(chalk.hex(SUCCESS_COLOR)('✓ Comment accepted for export'));
      } else if (action === 'discard') {
        console.log(chalk.hex(WARNING_COLOR)('⊘ Comment discarded'));
      }
      // Continue to next comment
    } else {
      // Normal mode: full interactive menu
      const { action } = await inquirer.prompt([
        {
          type: 'list',
          name: 'action',
          message: 'What would you like to do?',
          choices: [
            { name: 'Accept comment', value: 'accept' },
            { name: 'Edit comment', value: 'edit' },
            { name: 'Skip this comment', value: 'skip' },
            { name: 'Quit review', value: 'quit' },
          ],
        },
      ]);

      if (action === 'quit') {
        console.log(chalk.hex(INFO_COLOR)('\nReview cancelled'));
        return { acceptedComments: [], cancelled: true };
      } else if (action === 'accept') {
        // Convert to general comment if line is not in diff
        const commentToAccept = hasLineNotInDiff
          ? convertToGeneralComment(comment)
          : comment;
        acceptedComments.push(commentToAccept);
        console.log(chalk.hex(SUCCESS_COLOR)('✓ Comment accepted'));
      } else if (action === 'edit') {
        const { editedComment } = await inquirer.prompt([
          {
            type: 'input',
            name: 'editedComment',
            message: 'Edit comment:',
            default: comment.comment,
          },
        ]);
        // Convert to general comment if line is not in diff
        const commentToAccept = hasLineNotInDiff
          ? convertToGeneralComment({ ...comment, comment: editedComment })
          : { ...comment, comment: editedComment };
        acceptedComments.push(commentToAccept);
        console.log(chalk.hex(SUCCESS_COLOR)('✓ Comment updated'));
      } else if (action === 'skip') {
        console.log(chalk.hex(WARNING_COLOR)('⊘ Comment skipped'));
      }
    }
  }

  return { acceptedComments, cancelled: false };
}

interface PostCommentsDecision {
  shouldPost: boolean;
  hasPendingComments: boolean;
}

/**
 * Ask user if they want to post comments
 */
export async function askPostCommentsDecision(
  acceptedComments: ReviewComment[],
  prId: string,
  options: ReviewOptions
): Promise<PostCommentsDecision> {
  // Dry-run mode: ask about export instead
  if (options.dryRun) {
    console.log(chalk.hex(WARNING_COLOR)('\n⚠ Dry run mode - comments not posted'));

    if (acceptedComments.length === 0) {
      console.log(chalk.hex(SECONDARY_COLOR)('No comments accepted for export'));
      return { shouldPost: false, hasPendingComments: false };
    }

    const shouldExport = await askYesNo(`Export ${acceptedComments.length} comment(s) to REVIEW.md?`);

    if (shouldExport) {
      await exportToReviewFile(acceptedComments, prId);
      console.log(chalk.hex(SUCCESS_COLOR)(`✓ Review exported to REVIEW.md`));
    } else {
      console.log(chalk.hex(SECONDARY_COLOR)('Export cancelled'));
    }

    return { shouldPost: false, hasPendingComments: false };
  }

  if (acceptedComments.length === 0) {
    return { shouldPost: false, hasPendingComments: false };
  }

  console.log(chalk.bold(`\n${acceptedComments.length} comment(s) ready to post`));

  if (options.post) {
    console.log(chalk.hex(INFO_COLOR)(`\nPending ${acceptedComments.length} comment(s) to PR #${prId}`));
    return { shouldPost: true, hasPendingComments: true };
  }

  const shouldPost = await askYesNo(`Post ${acceptedComments.length} comment(s) to PR #${prId}?`);

  if (shouldPost) {
    console.log(chalk.hex(INFO_COLOR)(`\nPending ${acceptedComments.length} comment(s) to PR #${prId}`));
    return { shouldPost: true, hasPendingComments: true };
  } else {
    console.log(chalk.hex(SECONDARY_COLOR)('\nComments not posted'));
    return { shouldPost: false, hasPendingComments: false };
  }
}

type ApprovalDecision = 'approve' | 'request_changes' | 'comment' | 'skip';

interface PRApprovalDecision {
  action: ApprovalDecision;
  reviewBody?: string;
}

/**
 * Ask user what they want to do with the PR (approve/request changes/comment/skip)
 */
export async function askPRApprovalDecision(
  hasPendingComments: boolean,
  options: ReviewOptions,
  platformName?: string
): Promise<PRApprovalDecision> {
  // GitLab doesn't support "Request changes" via public API
  const supportsRequestChanges = platformName !== 'GitLab';

  // With --post flag, only show approve/skip (automated flow)
  // Otherwise, show full menu when comments are pending
  const menuChoices = options.post
    ? [
        { name: 'Approve PR', value: 'approve' },
        { name: 'Skip (do nothing)', value: 'skip' },
      ]
    : hasPendingComments
    ? [
        { name: 'Approve PR', value: 'approve' },
        ...(supportsRequestChanges ? [{ name: 'Request changes', value: 'request_changes' }] : []),
        { name: 'Comment only (no approval status)', value: 'comment' },
        { name: 'Skip (do nothing)', value: 'skip' },
      ]
    : [
        { name: 'Approve PR', value: 'approve' },
        { name: 'Skip (do nothing)', value: 'skip' },
      ];

  const { reviewAction } = await inquirer.prompt([
    {
      type: 'list',
      name: 'reviewAction',
      message: 'What would you like to do with this PR?',
      choices: menuChoices,
    },
  ]);

  // If requesting changes, prompt for body message (GitHub requires it, Bitbucket doesn't)
  if (reviewAction === 'request_changes') {
    // Note: GitLab doesn't support "Request changes" via public API, so this won't be reached for GitLab

    // Bitbucket: inline comments are sufficient, no body message needed
    if (platformName === 'Bitbucket') {
      return { action: reviewAction };
    }

    // GitHub: body message is required for REQUEST_CHANGES
    const { reviewBody } = await inquirer.prompt([
      {
        type: 'input',
        name: 'reviewBody',
        message: 'Summary message for the change request:',
        default: 'Please address the issues mentioned in the review comments.',
        validate: (input: string) => input.trim().length > 0 || 'Message cannot be empty',
      },
    ]);

    return { action: reviewAction, reviewBody };
  }

  return { action: reviewAction };
}

interface ReviewSubmissionCallbacks {
  onApprove: () => Promise<void>;
  onRequestChanges: (body: string) => Promise<void>;
  onComment: () => Promise<void>;
  onSkip: () => Promise<void>;
}

/**
 * Handle PR approval workflow with confirmation and submission
 */
export async function handlePRApprovalWorkflow(
  decision: PRApprovalDecision,
  callbacks: ReviewSubmissionCallbacks
): Promise<void> {
  if (decision.action === 'approve') {
    const confirmed = await askConfirmation('⚠️  Are you sure you want to APPROVE this PR?');

    if (confirmed) {
      await callbacks.onApprove();
    } else {
      console.log(chalk.hex(SECONDARY_COLOR)('\nApproval cancelled'));
    }
  } else if (decision.action === 'request_changes') {
    const confirmed = await askConfirmation('⚠️  Are you sure you want to REQUEST CHANGES for this PR?');

    if (confirmed) {
      await callbacks.onRequestChanges(decision.reviewBody!);
    } else {
      console.log(chalk.hex(SECONDARY_COLOR)('\nChange request cancelled'));
    }
  } else if (decision.action === 'comment') {
    await callbacks.onComment();
  } else {
    await callbacks.onSkip();
  }
}
