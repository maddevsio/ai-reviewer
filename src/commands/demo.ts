import { Command } from 'commander';
import chalk from 'chalk';
import inquirer from 'inquirer';
import ora from 'ora';
import { parseDiff } from '../utils/diff-parser';
import { formatDistanceToNow } from '../utils/date';
import { INFO_COLOR, SUCCESS_COLOR, SECONDARY_COLOR, ERROR_COLOR } from '../utils/colors';
import {
  reviewCommentsInteractively,
  askPostCommentsDecision,
  askPRApprovalDecision,
  handlePRApprovalWorkflow,
  ReviewComment,
  ReviewOptions,
} from '../utils/review-workflow';

// Mock PR data
const MOCK_PRS = [
  {
    id: '342',
    number: 342,
    title: 'Add user authentication system',
    author: { username: 'alice', name: 'Alice Developer' },
    status: 'open' as const,
    updatedAt: new Date(Date.now() - 2 * 60 * 60 * 1000), // 2h ago
    createdAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000),
    url: 'https://github.com/demo/repo/pull/342',
  },
  {
    id: '341',
    number: 341,
    title: 'Fix memory leak in data parser',
    author: { username: 'bob', name: 'Bob Smith' },
    status: 'open' as const,
    updatedAt: new Date(Date.now() - 24 * 60 * 60 * 1000), // 1d ago
    createdAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000),
    url: 'https://github.com/demo/repo/pull/341',
  },
];

const MOCK_DIFF = `diff --git a/src/auth/login.ts b/src/auth/login.ts
index 1234567..abcdefg 100644
--- a/src/auth/login.ts
+++ b/src/auth/login.ts
@@ -42,7 +42,7 @@ export async function authenticateUser(username: string, password: string) {
   const userPassword = await db.getUserPassword(username);

-  if (password == userPassword) {
+  if (password === userPassword) {
     return { success: true, token: generateToken(username) };
   }

@@ -65,8 +65,12 @@ export async function validateSession(token: string) {
   }

   try {
-    const decoded = jwt.verify(token, process.env.SECRET);
-    return { valid: true, userId: decoded.userId };
+    const decoded = jwt.verify(token, process.env.JWT_SECRET);
+    if (!decoded || !decoded.userId) {
+      return { valid: false };
+    }
+
+    return { valid: true, userId: decoded.userId };
   } catch (error) {
     return { valid: false };
   }
@@ -75,11 +79,15 @@ export async function validateSession(token: string) {
 }

 export async function logout(userId: string) {
+  // Clear user session from database
+  await db.clearSession(userId);
+
+  // Invalidate all active tokens
+  await tokenStore.invalidateUserTokens(userId);
+
   console.log(\`User \${userId} logged out\`);
-  await db.clearSession(userId);
 }`;

const MOCK_AI_COMMENTS = [
  {
    file: 'src/auth/login.ts',
    line: 44,
    comment: 'Good fix! Using strict equality (===) instead of loose equality (==) prevents type coercion issues and is a JavaScript best practice.',
  },
  {
    file: 'src/auth/login.ts',
    startLine: 67,
    line: 69,
    comment: 'Excellent improvement! Switching from SECRET to JWT_SECRET and adding null checks makes the token validation more robust. The explicit validation of decoded.userId prevents potential security issues.',
  },
  {
    file: 'src/auth/login.ts',
    startLine: 81,
    line: 87,
    comment: 'The logout function has been improved with proper cleanup steps. However, consider wrapping the token invalidation in a try-catch block to ensure the logout completes even if token invalidation fails.',
  },
];

/**
 * Simulate posting comments and asking for PR approval (demo only)
 */
export const demoCommand = new Command('demo')
  .description('Try the tool with mock data (no setup or API keys required)')
  .argument('[id]', 'Mock PR ID to review (342 or 341)')
  .option('--post', 'Simulate auto-posting comments')
  .option('--dry-run', 'Simulate dry-run mode')
  .action(async (id: string | undefined, options: ReviewOptions) => {
    console.log(chalk.hex(INFO_COLOR)('\n🔍 AI Code Review') + chalk.hex(SECONDARY_COLOR)(' (Demo Mode)\n'));

    // Select PR
    if (!id) {
      const { selectedPr } = await inquirer.prompt([
        {
          type: 'list',
          name: 'selectedPr',
          message: 'Select a pull request to review:',
          choices: MOCK_PRS.map((pr) => ({
            name: `#${pr.number} - ${pr.title} (by ${pr.author.username}) - updated ${formatDistanceToNow(pr.updatedAt)}`,
            value: pr.id,
          })),
        },
      ]);
      id = selectedPr;
    }

    const selectedPR = MOCK_PRS.find((pr) => pr.id === id);
    if (!selectedPR) {
      console.log(chalk.hex(ERROR_COLOR)('Mock PR not found'));
      return;
    }

    // Simulate fetching
    let spinner = ora(`Fetching PR #${id}...`).start();
    await new Promise((resolve) => setTimeout(resolve, 800));
    spinner.succeed(`PR #${id} fetched - 1 file(s) changed`);

    // Parse diff
    const parsedDiff = parseDiff(MOCK_DIFF);

    // Simulate AI analysis
    spinner = ora('Analyzing code changes with AI...').start();
    await new Promise((resolve) => setTimeout(resolve, 1500));
    spinner.succeed('Analysis complete');

    const comments = MOCK_AI_COMMENTS;

    console.log(chalk.hex(SUCCESS_COLOR)(`\n✓ Found ${comments.length} suggestion(s)\n`));

    // Review each comment interactively
    const { acceptedComments, cancelled } = await reviewCommentsInteractively(
      comments as ReviewComment[],
      parsedDiff,
      options
    );

    if (cancelled) {
      return;
    }

    // Ask user if they want to post comments
    const { hasPendingComments } = await askPostCommentsDecision(acceptedComments, id!, options);

    // Exit early if dry-run or no comments to post
    if (options.dryRun || !hasPendingComments) {
      return;
    }

    // PR Review workflow (demo simulation)
    const decision = await askPRApprovalDecision(hasPendingComments, options);

    await handlePRApprovalWorkflow(
      decision,
      {
        onApprove: async () => {
          let spinner = ora('Submitting PR approval...').start();
          await new Promise((resolve) => setTimeout(resolve, 800));
          spinner.succeed(chalk.hex(SECONDARY_COLOR)(`(Demo) `) + chalk.hex(SUCCESS_COLOR)(`PR #${id} approved ✓`));
        },
        onRequestChanges: async (_body: string) => {
          let spinner = ora('Submitting change request...').start();
          await new Promise((resolve) => setTimeout(resolve, 800));
          spinner.succeed(chalk.hex(SECONDARY_COLOR)(`(Demo) `) + chalk.hex(SUCCESS_COLOR)(`Changes requested for PR #${id}`));
        },
        onComment: async () => {
          let spinner = ora('Submitting review comments...').start();
          await new Promise((resolve) => setTimeout(resolve, 800));
          spinner.succeed(chalk.hex(SECONDARY_COLOR)(`(Demo) `) + chalk.hex(SUCCESS_COLOR)(`Review submitted as comments only`));
        },
        onSkip: async () => {
          // Skip - but if --post was used and there are comments, post them
          if (options.post && hasPendingComments) {
            let spinner = ora('Posting review comments...').start();
            await new Promise((resolve) => setTimeout(resolve, 800));
            spinner.succeed(chalk.hex(SECONDARY_COLOR)(`(Demo) `) + `Posted ${acceptedComments.length} comment(s) to PR #${id}`);
          } else {
            console.log(chalk.hex(SECONDARY_COLOR)('\nNo review action taken'));
          }
        },
      }
    );
  });
