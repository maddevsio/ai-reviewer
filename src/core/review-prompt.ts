import { type ReviewStrictness } from '../config/manager';
import { getStrictnessDisplayName, getStrictnessInstructions } from '../utils/strictness';
import { ReviewComment } from '../utils/review-workflow';
import { PullRequestDetails } from '../platforms/base';
import { ParsedFile, getCodeAtLine, annotateDiffWithLineNumbers } from '../utils/diff-parser';
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

  const annotatedDiff = annotateDiffWithLineNumbers(prDetails.diff);

  section += `\n\nChanged Files (${prDetails.files.length}):
${prDetails.files.map((f) => `- ${f.path} (+${f.additions}/-${f.deletions})`).join('\n')}

Full Diff:
\`\`\`
${annotatedDiff}
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
TARGET_CODE_START: <copy the exact code text from your START_LINE here — proof that the start line number is correct>
TARGET_CODE_END: <copy the exact code text from your END_LINE here — proof that the end line number is correct>
REF_LINES: <referenced line ranges outside your START_LINE-END_LINE range, or empty>
COMMENT: <your review comment>
---

For single-line issues (use this when the issue is on one specific line):
FILE: <file path>
LINE: <line number>
TARGET_CODE: <copy the exact code text from your LINE here — this is your proof that the line number is correct>
REF_LINES: <referenced line ranges outside your LINE, or empty>
COMMENT: <your review comment>
---

TARGET_CODE / TARGET_CODE_START / TARGET_CODE_END rules:
- Copy the actual code content from the diff at your line number (without the '+'/'-'/' ' prefix)
- This MUST be real code, not a blank line, not a closing brace alone, not a comment
- If you find yourself writing an empty value or just \`}\` or \`},\` — your line number is wrong, fix it
- For multi-line format: TARGET_CODE_START must match START_LINE, TARGET_CODE_END must match END_LINE

REF_LINES rules:
- ALWAYS include the REF_LINES field (leave empty if your comment is self-contained)
- Use when your comment references code OUTSIDE your LINE/START_LINE-END_LINE range
  (e.g. a variable declaration 100 lines above, a related condition elsewhere in the file)
- Format: comma-separated start-end ranges. Examples:
  - REF_LINES: 5-8 (single range, lines 5 through 8)
  - REF_LINES: 5-8, 45-47 (two separate ranges)
  - REF_LINES: 12 (single line, same as 12-12)
  - REF_LINES: (empty, no distant references)

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

Each line in the diff is prefixed with its new-file line number followed by │.
- '+' and ' ' (context) lines have a line number — read it directly from the left margin
- '-' (deleted) lines have NO line number (blank padding) — they are removed code
- Use ONLY the line numbers shown next to '+' lines for your comments
- NEVER use the line number of a ' ' (context) line — it is unchanged code

WARNING: Even if a blank line (space prefix) appears between changed code you're discussing,
you CANNOT use that blank line's number. Use the actual '+' line number instead.

MANDATORY RULE - ONLY COMMENT ON CHANGED CODE:
- Your line numbers (LINE, START_LINE, END_LINE) MUST point to lines that have '+' prefix in the diff
- DO NOT use line numbers of unchanged context lines (lines with space prefix)
- DO NOT comment on code that wasn't modified in this PR
- When you see an issue, find the '+' line in the diff and use THAT line number
- NEVER point to a blank/empty '+' line (a line that is just '+' with only whitespace after it). Always point to a line that contains actual code. If your target is near a blank '+' line, use the first line of the code block your comment is about instead.`;
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

Example - Common mistake with blank lines (space prefix):
  60 │ +  [code]
  61 │    [unchanged code]
  62 │      ← blank line with space prefix (unchanged!)
  63 │ +  [code you want to comment on]
Wrong: LINE: 62 ✗ (blank but has space prefix = unchanged!)
Correct: LINE: 63 ✓ (has the actual changed code with '+' prefix)

Example - Common mistake with empty '+' lines:
  61 │ +    },
  62 │ +
  63 │ +    async fetchMarketData() {
  64 │ +      try {
Wrong: LINE: 62 ✗ (has '+' prefix but is an empty line with no code!)
Correct: LINE: 63 ✓ (points to the actual function definition your comment is about)`;
}

function buildVerificationSection(): string {
  return `MANDATORY VERIFICATION - DO THIS FOR EVERY SINGLE COMMENT:
Step 1: Identify the issue you want to comment on
Step 2: Find the line(s) in the diff that contain the problematic code
Step 3: Read the line number from the left margin (the number before │)
Step 4: Verify the line has '+' prefix — if it has ' ' or '-', find the nearest '+' line instead
Step 5: BLANK LINE CHECK: Is the line at your chosen number empty or whitespace-only? If yes, move to the next line that has actual code.
Step 6: CONTENT CROSS-CHECK — THIS IS MANDATORY, DO NOT SKIP:
  Read the actual code text next to your chosen line number in the diff.
  Ask yourself: "Does this exact code text relate to my comment?"
  - If your comment is about \`fetchMarketData\`, the line MUST contain \`fetchMarketData\`. If it contains \`},\` or is blank — your line number is WRONG.
  - If your comment is about a function body, LINE/START_LINE MUST point to the function signature line (e.g. \`async fetchData() {\`), NOT to the blank line or closing brace above it.
  - If the code at your line number does NOT match your comment topic, you MUST find the correct line and fix it before outputting.
  - NEVER output a comment without first confirming the code at your line number matches. A mispointed comment is worse than no comment.

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

/**
 * Build the instruction portion of the review prompt (format, rules, examples, verification).
 * Used as a system message for providers that support it (e.g. OpenAI).
 */
export function buildReviewInstructions(): string {
  return [
    buildResponseFormatSection(),
    buildDiffRulesSection(),
    buildExamplesSection(),
    buildVerificationSection(),
  ].join('\n\n');
}

/**
 * Build the content portion of the review prompt (PR context, diff, strictness).
 */
export function buildReviewContent(prDetails: PullRequestDetails, strictness: ReviewStrictness, projectContext?: string): string {
  return buildPRContextSection(prDetails, strictness, projectContext);
}

export function buildReviewPrompt(prDetails: PullRequestDetails, strictness: ReviewStrictness, projectContext?: string): string {
  return [
    buildReviewContent(prDetails, strictness, projectContext),
    buildReviewInstructions(),
  ].join('\n\n');
}

/**
 * Parse REF_LINES value into array of [start, end] tuples.
 * Supports formats: "5-8", "5-8, 45-47", "12", "" (empty)
 */
function parseRefLines(value: string): [number, number][] {
  const trimmed = value.trim();
  if (!trimmed) return [];

  const ranges: [number, number][] = [];
  const parts = trimmed.split(',').map((p) => p.trim()).filter(Boolean);

  for (const part of parts) {
    if (part.includes('-')) {
      const [startStr, endStr] = part.split('-').map((s) => s.trim());
      const start = parseInt(startStr, 10);
      const end = parseInt(endStr, 10);
      if (!isNaN(start) && !isNaN(end)) {
        ranges.push([start, end]);
      }
    } else {
      const num = parseInt(part, 10);
      if (!isNaN(num)) {
        ranges.push([num, num]);
      }
    }
  }

  return ranges;
}

export function parseAIResponse(response: string): ReviewComment[] {
  // Only treat as "no issues" if the response has no structured comment blocks
  const hasCommentBlocks = response.includes('FILE:') && response.includes('COMMENT:');
  if (!hasCommentBlocks && (response.includes('LGTM') || response.includes('No issues found'))) {
    return [];
  }

  const comments: ReviewComment[] = [];
  const sections = response.split('---').filter((s) => s.trim());

  for (const section of sections) {
    const lines = section.trim().split('\n');
    let file = '';
    let line: number | undefined = undefined;
    let startLine: number | undefined = undefined;
    let targetCode = '';
    let targetCodeEnd = '';
    let refLines: [number, number][] = [];
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
      } else if (l.startsWith('TARGET_CODE_START:')) {
        targetCode = l.replace('TARGET_CODE_START:', '').trim();
      } else if (l.startsWith('TARGET_CODE_END:')) {
        targetCodeEnd = l.replace('TARGET_CODE_END:', '').trim();
      } else if (l.startsWith('TARGET_CODE:')) {
        targetCode = l.replace('TARGET_CODE:', '').trim();
      } else if (l.startsWith('REF_LINES:')) {
        refLines = parseRefLines(l.replace('REF_LINES:', ''));
      } else if (l.startsWith('COMMENT:')) {
        comment = l.replace('COMMENT:', '').trim();
      } else if (comment) {
        // Multi-line comment
        comment += '\n' + l;
      }
    }

    if (file && line && comment) {
      const reviewComment: ReviewComment = {
        file,
        line,
        startLine,
        comment: comment.trim(),
        ...(refLines.length > 0 ? { refLines } : {}),
        ...(targetCode ? { targetCode } : {}),
        ...(targetCodeEnd ? { targetCodeEnd } : {}),
      };

      // Log what the AI returned for debugging
      logger.log('prompt', `AI comment parsed: file=${file}, startLine=${startLine || 'undefined'}, endLine=${line}, hasRange=${!!startLine && startLine !== line}${targetCode ? `, targetCode="${targetCode.substring(0, 60)}"` : ''}${targetCodeEnd ? `, targetCodeEnd="${targetCodeEnd.substring(0, 60)}"` : ''}${refLines.length > 0 ? `, refLines=${refLines.map(r => r[0] === r[1] ? r[0] : `${r[0]}-${r[1]}`).join(', ')}` : ''}`);

      comments.push(reviewComment);
    }
  }

  return comments;
}

const TARGET_CODE_SEARCH_RADIUS = 5;

function codeMatches(actual: string, expected: string): boolean {
  const a = actual.trim();
  const e = expected.trim();
  if (!a || !e) return false;
  return a === e || a.includes(e) || e.includes(a);
}

/**
 * Search nearby lines (±SEARCH_RADIUS) for code matching the expected string.
 * Returns the corrected line number, or null if no match found.
 */
function findNearbyMatch(
  parsedDiff: Map<string, ParsedFile>,
  filePath: string,
  claimedLine: number,
  expectedCode: string
): number | null {
  for (let offset = 1; offset <= TARGET_CODE_SEARCH_RADIUS; offset++) {
    for (const candidate of [claimedLine + offset, claimedLine - offset]) {
      const candidateCode = getCodeAtLine(parsedDiff, filePath, candidate);
      if (candidateCode !== null && codeMatches(candidateCode, expectedCode)) {
        return candidate;
      }
    }
  }
  return null;
}

/**
 * Validate TARGET_CODE / TARGET_CODE_START / TARGET_CODE_END against actual diff content
 * and auto-correct line numbers.
 *
 * Single-line: validates targetCode against LINE.
 * Multi-line: validates targetCode against START_LINE and targetCodeEnd against END_LINE independently.
 */
export function validateTargetCodes(
  comments: ReviewComment[],
  parsedDiff: Map<string, ParsedFile>
): ReviewComment[] {
  return comments.map((comment) => {
    if (!comment.targetCode || !comment.line) return comment;

    const isMultiLine = comment.startLine && comment.startLine !== comment.line;

    if (isMultiLine) {
      // --- Multi-line: validate start and end independently ---
      const corrected = { ...comment };
      let startCorrected = false;
      let endCorrected = false;

      // Validate START_LINE against targetCode
      const startActual = getCodeAtLine(parsedDiff, comment.file, comment.startLine!);
      if (startActual !== null && !codeMatches(startActual, comment.targetCode)) {
        logger.log('prompt', `TARGET_CODE_START mismatch at ${comment.file}:${comment.startLine} — expected "${comment.targetCode.trim().substring(0, 50)}", got "${startActual.trim().substring(0, 50)}". Searching nearby...`);
        const correctedStart = findNearbyMatch(parsedDiff, comment.file, comment.startLine!, comment.targetCode);
        if (correctedStart !== null) {
          const shift = correctedStart - comment.startLine!;
          logger.log('prompt', `TARGET_CODE_START match found at line ${correctedStart} (shift ${shift > 0 ? '+' : ''}${shift}). Auto-correcting START_LINE.`);
          corrected.startLine = correctedStart;
          startCorrected = true;
        } else {
          logger.log('prompt', `TARGET_CODE_START: no nearby match found for ${comment.file}:${comment.startLine}, keeping original.`);
        }
      }

      // Validate END_LINE against targetCodeEnd
      if (comment.targetCodeEnd) {
        const endActual = getCodeAtLine(parsedDiff, comment.file, comment.line!);
        if (endActual !== null && !codeMatches(endActual, comment.targetCodeEnd)) {
          logger.log('prompt', `TARGET_CODE_END mismatch at ${comment.file}:${comment.line} — expected "${comment.targetCodeEnd.trim().substring(0, 50)}", got "${endActual.trim().substring(0, 50)}". Searching nearby...`);
          const correctedEnd = findNearbyMatch(parsedDiff, comment.file, comment.line!, comment.targetCodeEnd);
          if (correctedEnd !== null) {
            const shift = correctedEnd - comment.line!;
            logger.log('prompt', `TARGET_CODE_END match found at line ${correctedEnd} (shift ${shift > 0 ? '+' : ''}${shift}). Auto-correcting END_LINE.`);
            corrected.line = correctedEnd;
            endCorrected = true;
          } else {
            logger.log('prompt', `TARGET_CODE_END: no nearby match found for ${comment.file}:${comment.line}, keeping original.`);
          }
        }
      }

      return (startCorrected || endCorrected) ? corrected : comment;
    } else {
      // --- Single-line: validate targetCode against LINE ---
      const actualCode = getCodeAtLine(parsedDiff, comment.file, comment.line!);
      if (actualCode === null) return comment;

      if (codeMatches(actualCode, comment.targetCode)) return comment;

      logger.log('prompt', `TARGET_CODE mismatch at ${comment.file}:${comment.line} — expected "${comment.targetCode.trim().substring(0, 50)}", got "${actualCode.trim().substring(0, 50)}". Searching nearby...`);

      const correctedLine = findNearbyMatch(parsedDiff, comment.file, comment.line!, comment.targetCode);
      if (correctedLine !== null) {
        const shift = correctedLine - comment.line!;
        logger.log('prompt', `TARGET_CODE match found at line ${correctedLine} (shift ${shift > 0 ? '+' : ''}${shift}). Auto-correcting.`);
        return { ...comment, line: correctedLine };
      }

      logger.log('prompt', `TARGET_CODE: no nearby match found for ${comment.file}:${comment.line}, keeping original.`);
      return comment;
    }
  });
}
