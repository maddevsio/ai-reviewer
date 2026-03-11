import chalk from 'chalk';
import inquirer from 'inquirer';
import ora from 'ora';
import { createGitPlatform } from '../platforms/factory';
import { createAIProvider } from '../providers/factory';
import { GitPlatform } from '../platforms/base';
import { AIProvider } from '../providers/base';
import { formatDistanceToNow } from '../utils/date';
import { parseDiff } from '../utils/diff-parser';
import { INFO_COLOR, SUCCESS_COLOR, SECONDARY_COLOR } from '../config/colors';
import {
  reviewCommentsInteractively,
  askPostCommentsDecision,
  askPRApprovalDecision,
  handlePRApprovalWorkflow,
  ReviewOptions,
} from '../utils/review-workflow';
import { getConfig, getContextFilePath, type ReviewStrictness } from '../config/manager';
import { askStrictnessLevel, getStrictnessDisplayName } from '../utils/strictness';
import { logger } from '../utils/logger';
import { buildReviewPrompt, buildReviewInstructions, buildReviewContent, parseAIResponse, validateTargetCodes } from './review-prompt';
import { CHARS_PER_TOKEN_ESTIMATE } from '../config/constants';
import * as fs from 'fs';

export interface ReplSession {
  platform: GitPlatform;
  aiProvider: AIProvider;
}

export async function reviewPullRequest(
  prId: string | undefined,
  options: ReviewOptions,
  session?: ReplSession
): Promise<void> {
  console.log(chalk.hex(INFO_COLOR)('\n🔍 AI Code Review\n'));

  const platform = session?.platform ?? await createGitPlatform();
  const aiProvider = session?.aiProvider ?? createAIProvider();

  // If no PR ID provided, show selection menu
  if (!prId) {
    let spinner = ora('Fetching pull requests...').start();

    let prs;
    try {
      prs = await platform.listPullRequests();
    } catch (error) {
      spinner.fail('Failed to fetch pull requests');
      throw error;
    }

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

  // Determine strictness level (flag > config > prompt)
  let strictness: ReviewStrictness;

  if (options.strictness) {
    strictness = options.strictness;
  } else if (getConfig('review-strictness')) {
    strictness = getConfig('review-strictness')!;
  } else {
    strictness = (await askStrictnessLevel())!;
  }

  console.log(chalk.hex(SECONDARY_COLOR)(`🎮 Review strictness: ${getStrictnessDisplayName(strictness)}\n`));

  // Fetch PR details
  let spinner = ora(`Fetching PR #${prId}...`).start();
  let prDetails;
  try {
    prDetails = await platform.getPullRequestDetails(prId!);
  } catch (error) {
    spinner.fail(`Failed to fetch PR #${prId}`);
    throw error;
  }
  spinner.succeed(`PR #${prId} fetched - ${prDetails.files.length} file(s) changed`);

  // Parse the diff for code context extraction
  const parsedDiff = parseDiff(prDetails.diff);
  const totalAdditions = prDetails.files.reduce((sum, f) => sum + f.additions, 0);
  const totalDeletions = prDetails.files.reduce((sum, f) => sum + f.deletions, 0);
  logger.logDiff(prDetails.files.length, totalAdditions, totalDeletions);

  // Load project documentation context if available
  const contextFilePath = getContextFilePath();
  let projectContext: string | undefined;
  if (contextFilePath && fs.existsSync(contextFilePath)) {
    projectContext = fs.readFileSync(contextFilePath, 'utf-8');
    logger.log('prompt', `Loaded project context from ${contextFilePath} (${projectContext.length} chars)`);
  }

  // Prepare the prompt for AI review
  const reviewPrompt = buildReviewPrompt(prDetails, strictness, projectContext);
  const systemPrompt = buildReviewInstructions();
  const userPrompt = buildReviewContent(prDetails, strictness, projectContext);
  const promptTokens = Math.ceil(reviewPrompt.length / CHARS_PER_TOKEN_ESTIMATE);
  logger.logPrompt(promptTokens, strictness, prDetails.files.length);

  // Send to AI for review
  spinner = ora('Analyzing code changes with AI...').start();
  let aiResponse;
  try {
    aiResponse = await aiProvider.sendPrompt(reviewPrompt, { systemPrompt, userPrompt });
  } catch (error) {
    spinner.fail('AI analysis failed');
    throw error;
  }
  spinner.succeed('Analysis complete');

  // Parse AI response into review comments
  logger.log('api-detailed', 'Raw AI response:\n' + aiResponse);
  const rawComments = parseAIResponse(aiResponse);
  const comments = validateTargetCodes(rawComments, parsedDiff);

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
    ? acceptedComments.map((c) => {
        const commentInput = {
          body: c.comment,
          path: c.file,
          line: c.line,
          startLine: c.startLine,
        };

        // Log what we're about to submit
        logger.log('platform', `Preparing comment for submission: ${c.file}:${c.startLine || 'no-start'}-${c.line}, hasRange=${!!c.startLine && c.startLine !== c.line}`);

        return commentInput;
      })
    : [];

  const commitShaForPlatform = platform.getCommitRef(prDetails);

  // Helper to submit a review action with spinner
  const submitWithSpinner = async (spinnerText: string, action: 'APPROVE' | 'REQUEST_CHANGES' | 'COMMENT', body: string | undefined, successText: string) => {
    spinner = ora(spinnerText).start();
    try {
      await platform.submitReviewWithComments(
        prId!,
        { action, body, comments: commentsForSubmission },
        commitShaForPlatform
      );
    } catch (error) {
      spinner.fail('Submission failed');
      throw error;
    }
    spinner.succeed(chalk.hex(SUCCESS_COLOR)(successText));
  };

  await handlePRApprovalWorkflow(
    decision,
    {
      onApprove: () => submitWithSpinner('Submitting PR approval...', 'APPROVE', 'Looks good!', `PR #${prId} approved ✓`),
      onRequestChanges: (body: string) => submitWithSpinner('Submitting change request...', 'REQUEST_CHANGES', body, `Changes requested for PR #${prId}`),
      onComment: () => submitWithSpinner('Submitting review comments...', 'COMMENT', undefined, `Review submitted as comments only`),
      onSkip: async () => {
        if (options.post && hasPendingComments) {
          await submitWithSpinner('Posting review comments...', 'COMMENT', undefined, `Posted ${acceptedComments.length} comment(s) to PR #${prId}`);
        } else {
          console.log(chalk.hex(SECONDARY_COLOR)('\nNo review action taken'));
        }
      },
    }
  );
}
