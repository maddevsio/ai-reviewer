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
import { getConfig, type ReviewStrictness } from '../config/manager';
import { STRICTNESS_LEVELS, getStrictnessDisplayName, getStrictnessInstructions } from '../utils/strictness';
import { logger } from '../utils/logger';

export interface ReviewOptions {
  post?: boolean;
  dryRun?: boolean;
  strictness?: ReviewStrictness;
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

  // Determine strictness level (flag > config > prompt)
  let strictness: ReviewStrictness;

  if (options.strictness) {
    strictness = options.strictness;
  } else if (getConfig('review-strictness')) {
    strictness = getConfig('review-strictness')!;
  } else {
    const { selectedStrictness } = await inquirer.prompt([
      {
        type: 'list',
        name: 'selectedStrictness',
        message: 'Select review strictness:',
        choices: [
          {
            name: `${STRICTNESS_LEVELS.easy.doom} (easy) - ${STRICTNESS_LEVELS.easy.description}`,
            value: 'easy',
          },
          {
            name: `${STRICTNESS_LEVELS.normal.doom} (normal) - ${STRICTNESS_LEVELS.normal.description}`,
            value: 'normal',
          },
          {
            name: `${STRICTNESS_LEVELS.balanced.doom} (balanced) - ${STRICTNESS_LEVELS.balanced.description}`,
            value: 'balanced',
          },
          {
            name: `${STRICTNESS_LEVELS.strict.doom} (strict) - ${STRICTNESS_LEVELS.strict.description}`,
            value: 'strict',
          },
          {
            name: `${STRICTNESS_LEVELS.pedantic.doom} (pedantic) - ${STRICTNESS_LEVELS.pedantic.description}`,
            value: 'pedantic',
          },
        ],
        default: 'balanced',
      },
    ]);
    strictness = selectedStrictness as ReviewStrictness;
  }

  console.log(chalk.hex(SECONDARY_COLOR)(`🎮 Review strictness: ${getStrictnessDisplayName(strictness)}\n`));

  // Fetch PR details
  let spinner = ora(`Fetching PR #${prId}...`).start();
  const prDetails = await platform.getPullRequestDetails(prId!);
  spinner.succeed(`PR #${prId} fetched - ${prDetails.files.length} file(s) changed`);

  // Parse the diff for code context extraction
  const parsedDiff = parseDiff(prDetails.diff);
  const totalAdditions = prDetails.files.reduce((sum, f) => sum + f.additions, 0);
  const totalDeletions = prDetails.files.reduce((sum, f) => sum + f.deletions, 0);
  logger.logDiff(prDetails.files.length, totalAdditions, totalDeletions);

  // Prepare the prompt for AI review
  const reviewPrompt = buildReviewPrompt(prDetails, strictness);
  const promptTokens = Math.ceil(reviewPrompt.length / 4); // Rough token estimate
  logger.logPrompt(promptTokens, strictness, prDetails.files.length);

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

  // Format commit SHAs for GitLab (base:start:head)
  const commitShaForPlatform = prDetails.baseSha && prDetails.startSha
    ? `${prDetails.baseSha}:${prDetails.startSha}:${prDetails.headSha}`
    : prDetails.headSha;

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
          commitShaForPlatform
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
          commitShaForPlatform
        );
        spinner.succeed(chalk.hex(SUCCESS_COLOR)(`Changes requested for PR #${prId}`));
      },
      onComment: async () => {
        spinner = ora('Submitting review comments...').start();
        await platform.submitReviewWithComments(
          prId!,
          {
            action: 'COMMENT',
            body: undefined, // No general comment, just post inline discussions
            comments: commentsForSubmission,
          },
          commitShaForPlatform
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
              body: undefined, // No general comment, just post inline discussions
              comments: commentsForSubmission,
            },
            commitShaForPlatform
          );
          spinner.succeed(chalk.hex(SUCCESS_COLOR)(`Posted ${acceptedComments.length} comment(s) to PR #${prId}`));
        } else {
          console.log(chalk.hex(SECONDARY_COLOR)('\nNo review action taken'));
        }
      },
    }
  );
}

function buildReviewPrompt(prDetails: any, strictness: ReviewStrictness): string {
  const strictnessInstructions = getStrictnessInstructions(strictness);

  return `You are a code reviewer. Review the following pull request and provide specific, actionable feedback.

PR Title: ${prDetails.pr.title}
PR Description: ${prDetails.description || 'No description provided'}

Changed Files (${prDetails.files.length}):
${prDetails.files.map((f: any) => `- ${f.path} (+${f.additions}/-${f.deletions})`).join('\n')}

Full Diff:
\`\`\`diff
${prDetails.diff}
\`\`\`

REVIEW STRICTNESS: ${getStrictnessDisplayName(strictness)}
${strictnessInstructions}

For each issue found, respond in this EXACT format:

For multi-line issues (use this when the issue spans multiple lines):
FILE: <file path>
START_LINE: <start line number>
END_LINE: <end line number>
COMMENT: <your review comment>
---

For single-line issues (use this when the issue is on one specific line):
FILE: <file path>
LINE: <line number>
COMMENT: <your review comment>
---

Use multi-line format (START_LINE to END_LINE) ONLY when:
- ALL lines between START_LINE and END_LINE have '+' prefix (no gaps with space or '-')
- Example: Lines 10,11,12,13 all have '+' → valid range 10-13
- Example: Lines 10,11 have '+', line 12 has space, line 13 has '+' → INVALID range, use separate comments

Use single-line format (LINE) for:
- A single line with '+' prefix
- When changed lines are not consecutive (have unchanged lines between them)

RULE: If ANY line in your range does NOT have '+' prefix, you CANNOT use that range.
Split into separate comments for each group of consecutive '+' lines instead.

CRITICAL - UNDERSTANDING THE DIFF FORMAT:
In the diff above:
- Lines with '+' prefix = ADDED/MODIFIED code in the NEW version - THESE ARE THE ONLY LINES YOU SHOULD COMMENT ON
- Lines with '-' prefix = REMOVED code from the OLD version - do not comment on these
- Lines with ' ' (space) prefix = UNCHANGED context lines - NEVER comment on these
  * This includes BLANK/EMPTY lines with space prefix - they are still unchanged!
  * This includes code lines with space prefix - they are still unchanged!

The line numbers you see in the diff:
- For '+' lines: line number in the NEW file (after PR changes) - ONLY THESE ARE VALID
- For ' ' lines: also in the NEW file, but UNCHANGED - NEVER use these numbers
- For '-' lines: line number in the OLD file (before PR changes) - NEVER use these numbers

WARNING: Even if a blank line (space prefix) appears between changed code you're discussing,
you CANNOT use that blank line's number. Use the actual '+' line number instead.

MANDATORY RULE - ONLY COMMENT ON CHANGED CODE:
- Your line numbers (LINE, START_LINE, END_LINE) MUST point to lines that have '+' prefix in the diff
- DO NOT use line numbers of unchanged context lines (lines with space prefix)
- DO NOT comment on code that wasn't modified in this PR
- When you see an issue, find the '+' line in the diff and use THAT line number

Example - CORRECT:
Diff shows:   98 │ +  [some code here]
Your comment: LINE: 98 ✓ (has '+' prefix)

Example - WRONG:
Diff shows:   42 │    [some code here]
Your comment: LINE: 42 ✗ (has space prefix = unchanged, invalid!)

Example - Multi-line CORRECT:
  50 │ +  [code]
  51 │ +  [code]
  52 │ +  [code]
Valid: START_LINE: 50, END_LINE: 52 ✓ (all have '+')

Example - Multi-line WRONG:
  60 │ +  [code]
  61 │    [code]  ← unchanged line with space prefix!
  62 │ +  [code]
Invalid: START_LINE: 60, END_LINE: 62 ✗ (line 61 has space, breaks the chain!)
Correct approach: Two separate comments (LINE: 60 and LINE: 62)

Example - Common mistake with blank lines:
  60 │ +  [code]
  61 │    [unchanged code]
  62 │      ← blank line with space prefix (unchanged!)
  63 │ +  [code you want to comment on]
Wrong: LINE: 62 ✗ (blank but has space prefix = unchanged!)
Correct: LINE: 63 ✓ (has the actual changed code with '+' prefix)

MANDATORY VERIFICATION - DO THIS FOR EVERY SINGLE COMMENT:
Step 1: Identify the issue you want to comment on
Step 2: Find the EXACT line(s) in the diff that contain the problematic code
Step 3: Look at the prefix of each line - it MUST be '+'
Step 4: Write down the line number(s)
Step 5: DOUBLE-CHECK: Go back to the diff and verify that line has '+' prefix
Step 6: If the line has ' ' or '-' prefix, FIND THE NEAREST '+' LINE instead

Common mistakes to avoid:
✗ Line 62 is blank with space prefix → "I'll comment on line 62" - WRONG!
✓ Line 63 has the actual changed code with '+' → "I'll comment on line 63" - CORRECT!

✗ "This change affects lines 60-65" → Lines 61,62 have space prefix - WRONG!
✓ "This change affects lines 60,63,64,65" → Only these have '+' - CORRECT! (use separate comments)

Remember: You are reviewing THE CHANGES in this PR, not the entire codebase.
Your line numbers MUST point to lines with '+' prefix. NO EXCEPTIONS.

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
    let line: number | undefined = undefined;
    let startLine: number | undefined = undefined;
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
      const reviewComment = {
        file,
        line,
        startLine,
        comment: comment.trim()
      };

      // Log what the AI returned for debugging
      logger.log('prompt', `AI comment parsed: file=${file}, startLine=${startLine || 'undefined'}, endLine=${line}, hasRange=${!!startLine && startLine !== line}`);

      comments.push(reviewComment);
    }
  }

  return comments;
}
