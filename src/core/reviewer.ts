import chalk from 'chalk';
import inquirer from 'inquirer';
import ora from 'ora';
import { createGitPlatform } from '../platforms/factory';
import { createAIProvider } from '../providers/factory';
import { formatDistanceToNow } from '../utils/date';
import { parseDiff } from '../utils/diff-parser';
import { INFO_COLOR, SUCCESS_COLOR, SECONDARY_COLOR } from '../utils/colors';
import {
  reviewCommentsInteractively,
  askPostCommentsDecision,
  askPRApprovalDecision,
  handlePRApprovalWorkflow,
  ReviewComment,
} from '../utils/review-workflow';

export interface ReviewOptions {
  post?: boolean;
  dryRun?: boolean;
}

export async function reviewPullRequest(
  prId: string | undefined,
  options: ReviewOptions
): Promise<void> {
  console.log(chalk.hex(INFO_COLOR)('\n🔍 AI Code Review\n'));

  const platform = await createGitPlatform();
  const aiProvider = createAIProvider();

  // If no PR ID provided, show selection menu
  if (!prId) {
    let spinner = ora('Fetching pull requests...').start();

    const prs = await platform.listPullRequests();

    if (prs.length === 0) {
      spinner.fail('No open pull requests found');
      return;
    }

    spinner.succeed(`Found ${prs.length} pull request(s)`);

    const { selectedPr } = await inquirer.prompt([
      {
        type: 'list',
        name: 'selectedPr',
        message: 'Select a pull request to review:',
        choices: prs.map((pr) => ({
          name: `#${pr.number} - ${pr.title} (by ${pr.author.username}) - updated ${formatDistanceToNow(pr.updatedAt)}`,
          value: pr.id,
        })),
      },
    ]);
    prId = selectedPr;
  }

  // Fetch PR details
  let spinner = ora(`Fetching PR #${prId}...`).start();
  const prDetails = await platform.getPullRequestDetails(prId!);
  spinner.succeed(`PR #${prId} fetched - ${prDetails.files.length} file(s) changed`);

  // Parse the diff for code context extraction
  const parsedDiff = parseDiff(prDetails.diff);

  // Prepare the prompt for AI review
  const reviewPrompt = buildReviewPrompt(prDetails);

  // Send to AI for review
  spinner = ora('Analyzing code changes with AI...').start();
  const aiResponse = await aiProvider.sendPrompt(reviewPrompt);
  spinner.succeed('Analysis complete');

  // Parse AI response into review comments
  const comments = parseAIResponse(aiResponse);

  if (comments.length === 0) {
    console.log(chalk.hex(SUCCESS_COLOR)('\n✓ No issues found! Code looks good.\n'));
    return;
  }

  console.log(chalk.hex(SUCCESS_COLOR)(`\n✓ Found ${comments.length} suggestion(s)\n`));

  // Review each comment interactively
  const { acceptedComments, cancelled } = await reviewCommentsInteractively(comments, parsedDiff, options);

  if (cancelled) {
    return;
  }

  // Ask user if they want to post comments
  const { hasPendingComments } = await askPostCommentsDecision(acceptedComments, prId!, options);

  // Exit early if dry-run
  if (options.dryRun) {
    return;
  }

  // PR Review workflow (show even when no comments)
  const decision = await askPRApprovalDecision(hasPendingComments, options, platform.getName());

  // Prepare comments for submission
  const commentsForSubmission = hasPendingComments
    ? acceptedComments.map((c) => ({
        body: c.comment,
        path: c.file,
        line: c.line,
        startLine: c.startLine,
      }))
    : [];

  await handlePRApprovalWorkflow(
    decision,
    {
      onApprove: async () => {
        spinner = ora('Submitting PR approval...').start();
        await platform.submitReviewWithComments(
          prId!,
          {
            action: 'APPROVE',
            body: 'Looks good!',
            comments: commentsForSubmission,
          },
          prDetails.headSha
        );
        spinner.succeed(chalk.hex(SUCCESS_COLOR)(`PR #${prId} approved ✓`));
      },
      onRequestChanges: async (body: string) => {
        spinner = ora('Submitting change request...').start();
        await platform.submitReviewWithComments(
          prId!,
          {
            action: 'REQUEST_CHANGES',
            body,
            comments: commentsForSubmission,
          },
          prDetails.headSha
        );
        spinner.succeed(chalk.hex(SUCCESS_COLOR)(`Changes requested for PR #${prId}`));
      },
      onComment: async () => {
        spinner = ora('Submitting review comments...').start();
        await platform.submitReviewWithComments(
          prId!,
          {
            action: 'COMMENT',
            body: 'Review comments.',
            comments: commentsForSubmission,
          },
          prDetails.headSha
        );
        spinner.succeed(chalk.hex(SUCCESS_COLOR)(`Review submitted as comments only`));
      },
      onSkip: async () => {
        // Skip - but if --post was used and there are comments, post them as COMMENT
        if (options.post && hasPendingComments) {
          spinner = ora('Posting review comments...').start();
          await platform.submitReviewWithComments(
            prId!,
            {
              action: 'COMMENT',
              body: 'Review comments.',
              comments: commentsForSubmission,
            },
            prDetails.headSha
          );
          spinner.succeed(chalk.hex(SUCCESS_COLOR)(`Posted ${acceptedComments.length} comment(s) to PR #${prId}`));
        } else {
          console.log(chalk.hex(SECONDARY_COLOR)('\nNo review action taken'));
        }
      },
    }
  );
}

function buildReviewPrompt(prDetails: any): string {
  return `You are a code reviewer. Review the following pull request and provide specific, actionable feedback.

PR Title: ${prDetails.pr.title}
PR Description: ${prDetails.description || 'No description provided'}

Changed Files (${prDetails.files.length}):
${prDetails.files.map((f: any) => `- ${f.path} (+${f.additions}/-${f.deletions})`).join('\n')}

Full Diff:
\`\`\`diff
${prDetails.diff}
\`\`\`

Please provide a code review focusing on:
1. Potential bugs or errors
2. Security vulnerabilities
3. Performance issues
4. Code quality and best practices
5. Readability and maintainability

For each issue found, respond in this EXACT format:

For single-line issues:
FILE: <file path>
LINE: <line number>
COMMENT: <your review comment>
---

For multi-line issues (spanning multiple lines):
FILE: <file path>
START_LINE: <start line number>
END_LINE: <end line number>
COMMENT: <your review comment>
---

Use multi-line format when the issue affects a block of code (e.g., entire function, loop, try-catch block).
Use single-line format for specific line issues.

If the code looks good and has no issues, respond with: "LGTM - No issues found."`;
}

function parseAIResponse(response: string): ReviewComment[] {
  // Check if AI says code looks good
  if (response.includes('LGTM') || response.includes('No issues found')) {
    return [];
  }

  const comments: ReviewComment[] = [];
  const sections = response.split('---').filter((s) => s.trim());

  for (const section of sections) {
    const lines = section.trim().split('\n');
    let file = '';
    let line: number | undefined;
    let startLine: number | undefined;
    let comment = '';

    for (const l of lines) {
      if (l.startsWith('FILE:')) {
        file = l.replace('FILE:', '').trim();
      } else if (l.startsWith('START_LINE:')) {
        const lineNum = parseInt(l.replace('START_LINE:', '').trim(), 10);
        if (!isNaN(lineNum)) {
          startLine = lineNum;
        }
      } else if (l.startsWith('END_LINE:')) {
        const lineNum = parseInt(l.replace('END_LINE:', '').trim(), 10);
        if (!isNaN(lineNum)) {
          line = lineNum;
        }
      } else if (l.startsWith('LINE:')) {
        const lineNum = parseInt(l.replace('LINE:', '').trim(), 10);
        if (!isNaN(lineNum)) {
          line = lineNum;
        }
      } else if (l.startsWith('COMMENT:')) {
        comment = l.replace('COMMENT:', '').trim();
      } else if (comment) {
        // Multi-line comment
        comment += '\n' + l;
      }
    }

    if (file && line && comment) {
      comments.push({ file, line, comment: comment.trim() });
    }
  }

  return comments;
}
