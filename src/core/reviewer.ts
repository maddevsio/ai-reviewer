import chalk from 'chalk';
import inquirer from 'inquirer';
import ora from 'ora';
import { createGitPlatform } from '../platforms/factory';
import { createAIProvider } from '../providers/factory';
import { formatDistanceToNow } from '../utils/date';
import { parseDiff, getCodeContext } from '../utils/diff-parser';
import { ADDED_LINE_BG, REMOVED_LINE_BG, INFO_COLOR, SUCCESS_COLOR, WARNING_COLOR, SECONDARY_COLOR } from '../utils/colors';
import { askYesNo } from '../utils/prompts';
import { displayCodeContext } from '../utils/code-display';

interface ReviewOptions {
  post?: boolean;
  dryRun?: boolean;
}

interface ReviewComment {
  file: string;
  line: number;          // End line (required)
  startLine?: number;    // Start line (optional, for multi-line comments)
  comment: string;
  originalCode?: string;
  suggestedCode?: string;
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
      return;
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

  // Post comments if requested
  if (acceptedComments.length === 0) {
    console.log(chalk.hex(WARNING_COLOR)('\nNo comments to post'));
    return;
  }

  console.log(chalk.bold(`\n${acceptedComments.length} comment(s) ready to post`));

  if (options.dryRun) {
    console.log(chalk.hex(WARNING_COLOR)('\n⚠ Dry run mode - comments not posted'));
    console.log('\nComments that would be posted:');
    acceptedComments.forEach((c, i) => {
      console.log(chalk.hex(SECONDARY_COLOR)(`${i + 1}. ${c.file}: ${c.comment}`));
    });
  } else if (options.post) {
    spinner = ora('Posting comments to PR...').start();

    for (const comment of acceptedComments) {
      await platform.postComment(
        prId!,
        {
          body: comment.comment,
          path: comment.file,
          line: comment.line,
          startLine: comment.startLine,
        },
        prDetails.headSha
      );
    }

    spinner.succeed(`Posted ${acceptedComments.length} comment(s) to PR #${prId}`);
  } else {
    const shouldPost = await askYesNo(`Post ${acceptedComments.length} comment(s) to PR #${prId}?`);

    if (shouldPost) {
      spinner = ora('Posting comments to PR...').start();

      for (const comment of acceptedComments) {
        await platform.postComment(
          prId!,
          {
            body: comment.comment,
            path: comment.file,
            line: comment.line,
            startLine: comment.startLine,
          },
          prDetails.headSha
        );
      }

      spinner.succeed(`Posted ${acceptedComments.length} comment(s) to PR #${prId}`);
    } else {
      console.log(chalk.hex(INFO_COLOR)('\nComments not posted'));
    }
  }
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
