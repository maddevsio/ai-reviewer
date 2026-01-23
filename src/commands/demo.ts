import { Command } from 'commander';
import chalk from 'chalk';
import inquirer from 'inquirer';
import ora from 'ora';
import { parseDiff, getCodeContext } from '../utils/diff-parser';
import { formatDistanceToNow } from '../utils/date';
import { INFO_COLOR, SUCCESS_COLOR, WARNING_COLOR, SECONDARY_COLOR, ERROR_COLOR } from '../utils/colors';
import { askYesNo } from '../utils/prompts';
import { displayCodeContext } from '../utils/code-display';

interface ReviewOptions {
  post?: boolean;
  dryRun?: boolean;
}

interface ReviewComment {
  file: string;
  line: number;
  startLine?: number;
  comment: string;
  originalCode?: string;
  suggestedCode?: string;
}

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
async function simulatePostingAndApproval(acceptedComments: ReviewComment[], id: string | undefined): Promise<void> {
  let spinner = ora('Posting comments to PR...').start();
  await new Promise((resolve) => setTimeout(resolve, 1000));
  spinner.succeed(chalk.hex(SECONDARY_COLOR)(`(Demo) `) + `Posted ${acceptedComments.length} comment(s) to PR #${id}`);

  // Ask about PR approval
  const shouldApprove = await askYesNo(`Would you like to approve PR #${id}?`);

  if (shouldApprove) {
    spinner = ora('Approving PR...').start();
    await new Promise((resolve) => setTimeout(resolve, 800));
    spinner.succeed(chalk.hex(SECONDARY_COLOR)(`(Demo) `) + `PR #${id} approved`);
  }
}

export const demoCommand = new Command('demo')
  .description('Demo mode with mock data')
  .argument('[id]', 'Mock PR ID to review')
  .option('--post', 'Simulate posting comments')
  .option('--dry-run', 'Dry run mode')
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

    // Review each comment
    const acceptedComments: ReviewComment[] = [];

    for (let i = 0; i < comments.length; i++) {
      const comment = comments[i];

      const lineRange = comment.startLine
        ? `${comment.startLine}-${comment.line}`
        : `${comment.line}`;
      console.log(chalk.bold(`\n[${i + 1}/${comments.length}] ${comment.file}:${lineRange}`));

      // Show code context
      if (comment.line) {
        const targetLine = comment.startLine || comment.line;
        const codeContext = getCodeContext(parsedDiff, comment.file, targetLine, 3);
        if (codeContext.length > 0) {
          // Calculate starting line number (approximate)
          let startLineNum = targetLine - 3;
          if (startLineNum < 1) startLineNum = 1;

          displayCodeContext(codeContext, startLineNum);
        }
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
        acceptedComments.push(comment as ReviewComment);
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
        acceptedComments.push({ ...comment, comment: editedComment } as ReviewComment);
        console.log(chalk.hex(SUCCESS_COLOR)('✓ Comment updated'));
      } else if (action === 'skip') {
        console.log(chalk.hex(WARNING_COLOR)('⊘ Comment skipped'));
      }
    }

    // Post comments simulation
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
      await simulatePostingAndApproval(acceptedComments, id);
    } else {
      const shouldPost = await askYesNo(`Post ${acceptedComments.length} comment(s) to PR #${id}?`);

      if (shouldPost) {
        await simulatePostingAndApproval(acceptedComments, id);
      } else {
        console.log(chalk.hex(INFO_COLOR)('\nComments not posted'));
      }
    }
  });
