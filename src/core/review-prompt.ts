import { type ReviewStrictness } from '../config/manager';
import { getStrictnessDisplayName, getStrictnessInstructions } from '../utils/strictness';
import { ReviewComment } from '../utils/review-workflow';
import { PullRequestDetails } from '../platforms/base';
import { logger } from '../utils/logger';

function buildPRContextSection(prDetails: PullRequestDetails, strictness: ReviewStrictness, projectContext?: string): string {
  const strictnessInstructions = getStrictnessInstructions(strictness);

  let section = `You are a code reviewer. Review the following pull request and provide specific, actionable feedback.

PR Title: ${prDetails.pr.title}
PR Description: ${prDetails.description || 'No description provided'}`;

  if (projectContext) {
    section += `\n\nPROJECT-SPECIFIC CONTEXT:
The following documentation from this project contains conventions, guidelines, and decisions.
When these conflict with general best practices, the project-specific rules take priority.
Apply these ONLY when evaluating changed lines ('+' prefix in the diff). Do NOT flag issues in unchanged surrounding code, even if it violates these guidelines.

${projectContext}`;
  }

  section += `\n\nChanged Files (${prDetails.files.length}):
${prDetails.files.map((f) => `- ${f.path} (+${f.additions}/-${f.deletions})`).join('\n')}

Full Diff:
\`\`\`diff
${prDetails.diff}
\`\`\`

REVIEW STRICTNESS: ${getStrictnessDisplayName(strictness)}
${strictnessInstructions}`;

  return section;
}

function buildResponseFormatSection(): string {
  return `For each issue found, respond in this EXACT format:

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
Split into separate comments for each group of consecutive '+' lines instead.`;
}

function buildDiffRulesSection(): string {
  return `CRITICAL - UNDERSTANDING THE DIFF FORMAT:
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
- When you see an issue, find the '+' line in the diff and use THAT line number`;
}

function buildExamplesSection(): string {
  return `Example - CORRECT:
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
Correct: LINE: 63 ✓ (has the actual changed code with '+' prefix)`;
}

function buildVerificationSection(): string {
  return `MANDATORY VERIFICATION - DO THIS FOR EVERY SINGLE COMMENT:
Step 1: Identify the issue you want to comment on
Step 2: Find the EXACT line(s) in the diff that contain the problematic code
Step 3: Look at the prefix of each line - it MUST be '+'
Step 4: Write down the line number(s)
Step 5: DOUBLE-CHECK: Go back to the diff and verify that line has '+' prefix
Step 6: If the line has ' ' or '-' prefix, FIND THE NEAREST '+' LINE instead
Step 7: CONTENT CROSS-CHECK: Re-read the actual code at your chosen line number in the diff.
  - Does the code at that line match what your comment is about?
  - If your comment mentions a variable, function, or value — is it actually present on that line?
  - If NOT, scan nearby '+' lines for the code you're referencing and correct the line number.
  - Example: Your comment says "rename \`fetchData\`" and you wrote LINE: 45, but line 45 is \`const x = 1;\` → WRONG. Find the line that actually has \`fetchData\` and use that number.

Common mistakes to avoid:
✗ Line 62 is blank with space prefix → "I'll comment on line 62" - WRONG!
✓ Line 63 has the actual changed code with '+' → "I'll comment on line 63" - CORRECT!

✗ "This change affects lines 60-65" → Lines 61,62 have space prefix - WRONG!
✓ "This change affects lines 60,63,64,65" → Only these have '+' - CORRECT! (use separate comments)

✗ Comment says "rename this function" but the line number points to an import statement - WRONG!
✓ Comment says "rename this function" and the line number points to the function definition - CORRECT!

Remember: You are reviewing THE CHANGES in this PR, not the entire codebase.
Your line numbers MUST point to lines with '+' prefix. NO EXCEPTIONS.
Your line numbers MUST point to the code your comment is actually about. VERIFY THE CONTENT MATCHES.

If the code looks good and has no issues, respond with: "LGTM - No issues found."`;
}

export function buildReviewPrompt(prDetails: PullRequestDetails, strictness: ReviewStrictness, projectContext?: string): string {
  return [
    buildPRContextSection(prDetails, strictness, projectContext),
    buildResponseFormatSection(),
    buildDiffRulesSection(),
    buildExamplesSection(),
    buildVerificationSection(),
  ].join('\n\n');
}

export function parseAIResponse(response: string): ReviewComment[] {
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
