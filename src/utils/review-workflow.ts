import chalk from 'chalk';
import inquirer from 'inquirer';
import { displayCodeContext } from './code-display';
import { getCodeContext } from './diff-parser';
import { askYesNo, askConfirmation } from './prompts';
import {
  ADDED_LINE_BG,
  REMOVED_LINE_BG,
  INFO_COLOR,
  SUCCESS_COLOR,
  WARNING_COLOR,
  SECONDARY_COLOR,
} from './colors';

export interface ReviewComment {
  file: string;
  line: number;
  startLine?: number;
  comment: string;
  originalCode?: string;
  suggestedCode?: string;
}

export interface ReviewOptions {
  post?: boolean;
  dryRun?: boolean;
}

interface CommentReviewResult {
  acceptedComments: ReviewComment[];
  cancelled: boolean;
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

    const lineRange = comment.startLine
      ? `${comment.startLine}-${comment.line}`
      : `${comment.line}`;
    console.log(chalk.bold(`\n[${i + 1}/${comments.length}] ${comment.file}:${lineRange}`));

    // Show code context from diff if line number is available
    if (comment.line) {
      // For multi-line comments, show context around the entire range
      const targetLine = comment.startLine || comment.line;
      const codeContext = getCodeContext(parsedDiff, comment.file, targetLine, 3);
      if (codeContext.length > 0) {
        // Calculate starting line number (approximate)
        let startLineNum = targetLine - 3;
        if (startLineNum < 1) startLineNum = 1;

        displayCodeContext(codeContext, startLineNum);
      }
    } else if (comment.originalCode && comment.suggestedCode) {
      // Fallback to extracted code if available
      console.log(chalk.hex(WARNING_COLOR)('━'.repeat(70)));
      console.log(chalk.bgHex(REMOVED_LINE_BG).black(`- ${comment.originalCode}`));
      console.log(chalk.bgHex(ADDED_LINE_BG).black(`+ ${comment.suggestedCode}`));
      console.log(chalk.hex(WARNING_COLOR)('━'.repeat(70)));
    }

    console.log(chalk.hex(SECONDARY_COLOR)('AI Comment:'), comment.comment);
    console.log();

    // Dry-run mode: simplified menu
    if (options.dryRun) {
      const { action } = await inquirer.prompt([
        {
          type: 'list',
          name: 'action',
          message: 'What would you like to do?',
          choices: [
            { name: 'Next', value: 'next' },
            { name: 'Quit review', value: 'quit' },
          ],
        },
      ]);

      if (action === 'quit') {
        console.log(chalk.hex(INFO_COLOR)('\nReview cancelled'));
        return { acceptedComments: [], cancelled: true };
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
        acceptedComments.push(comment);
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
        acceptedComments.push({ ...comment, comment: editedComment });
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
  // Dry-run mode: exit early
  if (options.dryRun) {
    console.log(chalk.hex(WARNING_COLOR)('\n⚠ Dry run mode - comments not posted'));
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

export type ReviewAction = 'approve' | 'request_changes' | 'comment' | 'skip';

interface PRApprovalDecision {
  action: ReviewAction;
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
        { name: 'Request changes', value: 'request_changes' },
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
