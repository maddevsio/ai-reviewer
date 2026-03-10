import { describe, it, expect } from 'vitest';
import {
  parseAIResponse,
  validateTargetCodes,
  buildReviewInstructions,
  buildReviewContent,
  buildReviewPrompt,
} from '../../src/core/review-prompt';
import { parseDiff } from '../../src/utils/diff-parser';
import type { PullRequestDetails } from '../../src/platforms/base';
import { SAMPLE_DIFF, FILE1, FILE2 } from '../fixtures/sample-diff';

const parsedDiff = parseDiff(SAMPLE_DIFF);

// ---------------------------------------------------------------------------
// Minimal PullRequestDetails for buildReview* tests
// ---------------------------------------------------------------------------
const mockPRDetails: PullRequestDetails = {
  pr: {
    id: '42',
    number: 42,
    title: 'Add authentication improvements',
    author: { username: 'alice' },
    status: 'open',
    updatedAt: new Date('2025-01-01'),
    createdAt: new Date('2025-01-01'),
    url: 'https://github.com/example/repo/pull/42',
  },
  description: 'This PR adds rate limiting and input validation to the login flow.',
  diff: SAMPLE_DIFF,
  files: [
    { path: FILE1, additions: 9, deletions: 2, patch: '', status: 'modified' },
    { path: FILE2, additions: 4, deletions: 0, patch: '', status: 'modified' },
  ],
  comments: [],
  headSha: 'abc123def456',
};

// ---------------------------------------------------------------------------
// parseAIResponse
// ---------------------------------------------------------------------------
describe('parseAIResponse', () => {
  describe('LGTM handling', () => {
    it('returns [] for a pure LGTM response', () => {
      expect(parseAIResponse('LGTM - No issues found.')).toEqual([]);
    });

    it('returns [] for a response with just "No issues found"', () => {
      expect(parseAIResponse('No issues found.')).toEqual([]);
    });

    it('still parses comments when LGTM appears alongside structured blocks', () => {
      const response = [
        'LGTM overall but one small issue:',
        '',
        `FILE: ${FILE1}`,
        'LINE: 16',
        'TARGET_CODE:   if (!user || !user.isActive) return null;',
        'REF_LINES:',
        'COMMENT: Consider extracting this condition.',
        '---',
      ].join('\n');

      const result = parseAIResponse(response);
      expect(result).toHaveLength(1);
      expect(result[0].line).toBe(16);
    });
  });

  describe('single-line comment block', () => {
    const singleLineResponse = [
      `FILE: ${FILE1}`,
      'LINE: 16',
      'TARGET_CODE:   if (!user || !user.isActive) return null;',
      'REF_LINES:',
      'COMMENT: The active check should be logged when it fails.',
      '---',
    ].join('\n');

    it('parses file path', () => {
      expect(parseAIResponse(singleLineResponse)[0].file).toBe(FILE1);
    });

    it('parses line as a number', () => {
      expect(parseAIResponse(singleLineResponse)[0].line).toBe(16);
    });

    it('startLine is undefined for single-line comments', () => {
      expect(parseAIResponse(singleLineResponse)[0].startLine).toBeUndefined();
    });

    it('parses targetCode (parser trims leading/trailing whitespace)', () => {
      // The parser runs .trim() on the TARGET_CODE value, so leading spaces are stripped
      expect(parseAIResponse(singleLineResponse)[0].targetCode).toBe(
        'if (!user || !user.isActive) return null;'
      );
    });

    it('parses empty REF_LINES as missing refLines property', () => {
      expect(parseAIResponse(singleLineResponse)[0].refLines).toBeUndefined();
    });

    it('parses the comment body', () => {
      expect(parseAIResponse(singleLineResponse)[0].comment).toBe(
        'The active check should be logged when it fails.'
      );
    });
  });

  describe('multi-line comment block', () => {
    const multiLineResponse = [
      `FILE: ${FILE1}`,
      'START_LINE: 10',
      'END_LINE: 12',
      'TARGET_CODE_START: import { logger } from \'../utils/logger\';',
      "TARGET_CODE_END: import { RateLimiter } from '../utils/rate-limiter';",
      'REF_LINES: 36-38',
      'COMMENT: These three imports are added together and should be grouped.',
      '---',
    ].join('\n');

    it('parses startLine from START_LINE field', () => {
      expect(parseAIResponse(multiLineResponse)[0].startLine).toBe(10);
    });

    it('parses line (end) from END_LINE field', () => {
      expect(parseAIResponse(multiLineResponse)[0].line).toBe(12);
    });

    it('parses targetCode from TARGET_CODE_START', () => {
      expect(parseAIResponse(multiLineResponse)[0].targetCode).toBe(
        "import { logger } from '../utils/logger';"
      );
    });

    it('parses targetCodeEnd from TARGET_CODE_END', () => {
      expect(parseAIResponse(multiLineResponse)[0].targetCodeEnd).toBe(
        "import { RateLimiter } from '../utils/rate-limiter';"
      );
    });

    it('parses REF_LINES as tuples', () => {
      expect(parseAIResponse(multiLineResponse)[0].refLines).toEqual([[36, 38]]);
    });
  });

  describe('multi-line COMMENT field', () => {
    it('accumulates continuation lines after COMMENT:', () => {
      const response = [
        `FILE: ${FILE1}`,
        'LINE: 16',
        'TARGET_CODE: code',
        'REF_LINES:',
        'COMMENT: First line of comment.',
        'Second line.',
        'Third line.',
        '---',
      ].join('\n');

      const comment = parseAIResponse(response)[0].comment;
      expect(comment).toContain('First line of comment.');
      expect(comment).toContain('Second line.');
      expect(comment).toContain('Third line.');
    });
  });

  describe('REF_LINES parsing', () => {
    function parse(refLines: string) {
      const response = [
        `FILE: ${FILE1}`,
        'LINE: 16',
        'TARGET_CODE: code',
        `REF_LINES: ${refLines}`,
        'COMMENT: test',
        '---',
      ].join('\n');
      return parseAIResponse(response)[0].refLines;
    }

    it('parses a single range "5-8"', () => {
      expect(parse('5-8')).toEqual([[5, 8]]);
    });

    it('parses two ranges "5-8, 45-47"', () => {
      expect(parse('5-8, 45-47')).toEqual([[5, 8], [45, 47]]);
    });

    it('parses a single line number "12" as [12,12]', () => {
      expect(parse('12')).toEqual([[12, 12]]);
    });

    it('returns undefined (no refLines) for an empty value', () => {
      expect(parse('')).toBeUndefined();
    });

    it('returns undefined for whitespace-only value', () => {
      expect(parse('   ')).toBeUndefined();
    });
  });

  describe('multiple comment blocks', () => {
    it('parses all valid blocks in the response', () => {
      const response = [
        `FILE: ${FILE1}`,
        'LINE: 10',
        'TARGET_CODE: code1',
        'REF_LINES:',
        'COMMENT: First issue.',
        '---',
        `FILE: ${FILE2}`,
        'LINE: 1',
        'TARGET_CODE: code2',
        'REF_LINES:',
        'COMMENT: Second issue.',
        '---',
      ].join('\n');

      const result = parseAIResponse(response);
      expect(result).toHaveLength(2);
    });
  });

  describe('malformed blocks', () => {
    it('skips a block missing FILE', () => {
      const response = ['LINE: 10', 'TARGET_CODE: x', 'REF_LINES:', 'COMMENT: hi', '---'].join('\n');
      expect(parseAIResponse(response)).toHaveLength(0);
    });

    it('skips a block missing LINE/END_LINE', () => {
      const response = [`FILE: ${FILE1}`, 'TARGET_CODE: x', 'REF_LINES:', 'COMMENT: hi', '---'].join('\n');
      expect(parseAIResponse(response)).toHaveLength(0);
    });

    it('skips a block missing COMMENT', () => {
      const response = [`FILE: ${FILE1}`, 'LINE: 10', 'TARGET_CODE: x', 'REF_LINES:', '---'].join('\n');
      expect(parseAIResponse(response)).toHaveLength(0);
    });
  });
});

// ---------------------------------------------------------------------------
// validateTargetCodes
// ---------------------------------------------------------------------------
describe('validateTargetCodes', () => {
  describe('single-line validation', () => {
    it('returns the comment unchanged when targetCode exactly matches the code at that line', () => {
      const comment = {
        file: FILE1,
        line: 10,
        comment: 'test',
        targetCode: "import { logger } from '../utils/logger';",
      };
      const result = validateTargetCodes([comment], parsedDiff);
      expect(result[0].line).toBe(10);
    });

    it('returns unchanged when targetCode is a substring of the actual code', () => {
      const comment = {
        file: FILE1,
        line: 10,
        comment: 'test',
        targetCode: 'import { logger }',
      };
      const result = validateTargetCodes([comment], parsedDiff);
      expect(result[0].line).toBe(10);
    });

    it('auto-corrects the line number when targetCode is off by one line', () => {
      // Line 11 has validateInput, but targetCode says RateLimiter (which is at line 12)
      const comment = {
        file: FILE1,
        line: 11,
        comment: 'test',
        targetCode: "import { RateLimiter } from '../utils/rate-limiter';",
      };
      const result = validateTargetCodes([comment], parsedDiff);
      expect(result[0].line).toBe(12);
    });

    it('corrects upward shift — targetCode found at line - 1', () => {
      // Line 11 has validateInput, targetCode is logger (which is at line 10)
      const comment = {
        file: FILE1,
        line: 11,
        comment: 'test',
        targetCode: "import { logger } from '../utils/logger';",
      };
      const result = validateTargetCodes([comment], parsedDiff);
      expect(result[0].line).toBe(10);
    });

    it('returns the comment unchanged when no nearby match is found within ±5 lines', () => {
      // Line 36 is a context line ("export async function resetPassword...").
      // No line in ±5 of 36 matches this unique string, so line stays 36.
      const comment = {
        file: FILE1,
        line: 36,
        comment: 'test',
        targetCode: 'XYZNOTFOUND_UNIQUE_12345_no_match_possible',
      };
      const result = validateTargetCodes([comment], parsedDiff);
      expect(result[0].line).toBe(36);
    });

    it('returns unchanged when targetCode is absent', () => {
      const comment = { file: FILE1, line: 10, comment: 'test' };
      const result = validateTargetCodes([comment], parsedDiff);
      expect(result[0]).toStrictEqual(comment);
    });

    it('returns unchanged when getCodeAtLine returns null (line outside diff)', () => {
      const comment = {
        file: FILE1,
        line: 25, // between hunks
        comment: 'test',
        targetCode: 'anything',
      };
      const result = validateTargetCodes([comment], parsedDiff);
      expect(result[0].line).toBe(25);
    });

    it('does not mutate the original comment object', () => {
      const comment = {
        file: FILE1,
        line: 11,
        comment: 'test',
        targetCode: "import { RateLimiter } from '../utils/rate-limiter';",
      };
      const original = { ...comment };
      validateTargetCodes([comment], parsedDiff);
      expect(comment).toStrictEqual(original);
    });
  });

  describe('multi-line validation', () => {
    it('corrects startLine when targetCode mismatches at the claimed start line', () => {
      // startLine=11 has validateInput, but targetCode says logger (which is at line 10).
      // No targetCodeEnd provided → end validation is skipped; only startLine is corrected.
      const comment = {
        file: FILE1,
        startLine: 11,
        line: 13,
        comment: 'test',
        targetCode: "import { logger } from '../utils/logger';",
      };
      const result = validateTargetCodes([comment], parsedDiff);
      expect(result[0].startLine).toBe(10); // corrected: logger found at line 10
      expect(result[0].line).toBe(13);       // unchanged: no targetCodeEnd to validate
    });

    it('corrects end line when targetCodeEnd mismatches at the claimed end line', () => {
      // line=11 claims validateInput, but targetCodeEnd says RateLimiter (at 12)
      const comment = {
        file: FILE1,
        startLine: 10,
        line: 11,
        comment: 'test',
        targetCode: "import { logger } from '../utils/logger';",
        targetCodeEnd: "import { RateLimiter } from '../utils/rate-limiter';",
      };
      const result = validateTargetCodes([comment], parsedDiff);
      expect(result[0].startLine).toBe(10); // unchanged
      expect(result[0].line).toBe(12);       // corrected
    });

    it('returns unchanged when both start and end match exactly', () => {
      const comment = {
        file: FILE1,
        startLine: 10,
        line: 12,
        comment: 'test',
        targetCode: "import { logger } from '../utils/logger';",
        targetCodeEnd: "import { RateLimiter } from '../utils/rate-limiter';",
      };
      const result = validateTargetCodes([comment], parsedDiff);
      expect(result[0].startLine).toBe(10);
      expect(result[0].line).toBe(12);
    });

    it('skips end validation when targetCodeEnd is absent', () => {
      const comment = {
        file: FILE1,
        startLine: 10,
        line: 12,
        comment: 'test',
        targetCode: "import { logger } from '../utils/logger';",
        // no targetCodeEnd
      };
      expect(() => validateTargetCodes([comment], parsedDiff)).not.toThrow();
    });
  });

  it('handles an empty comments array', () => {
    expect(validateTargetCodes([], parsedDiff)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// buildReviewInstructions
// ---------------------------------------------------------------------------
describe('buildReviewInstructions', () => {
  const instructions = buildReviewInstructions();

  it('returns a non-empty string', () => {
    expect(instructions.length).toBeGreaterThan(0);
  });

  it('includes the FILE: field marker', () => {
    expect(instructions).toContain('FILE:');
  });

  it('includes the LINE: field marker', () => {
    expect(instructions).toContain('LINE:');
  });

  it('includes the START_LINE: field marker', () => {
    expect(instructions).toContain('START_LINE:');
  });

  it('includes the TARGET_CODE field description', () => {
    expect(instructions).toContain('TARGET_CODE');
  });

  it('includes the REF_LINES field marker', () => {
    expect(instructions).toContain('REF_LINES:');
  });

  it('includes the COMMENT: field marker', () => {
    expect(instructions).toContain('COMMENT:');
  });

  it('mentions the + prefix rule', () => {
    expect(instructions).toContain('+');
  });
});

// ---------------------------------------------------------------------------
// buildReviewContent
// ---------------------------------------------------------------------------
describe('buildReviewContent', () => {
  const content = buildReviewContent(mockPRDetails, 'balanced');

  it('includes the PR title', () => {
    expect(content).toContain('Add authentication improvements');
  });

  it('includes the PR description', () => {
    expect(content).toContain('rate limiting and input validation');
  });

  it('includes the annotated diff (│ character is present)', () => {
    expect(content).toContain('│');
  });

  it('includes the strictness display name', () => {
    expect(content).toContain('balanced');
  });

  it('includes the file list with additions/deletions', () => {
    expect(content).toContain(FILE1);
    expect(content).toContain('+9');
    expect(content).toContain('-2');
  });

  it('includes project context when provided', () => {
    const withContext = buildReviewContent(
      mockPRDetails,
      'balanced',
      '## Guidelines\nAlways use async/await.'
    );
    expect(withContext).toContain('Always use async/await.');
    expect(withContext).toContain('PROJECT-SPECIFIC CONTEXT');
  });

  it('does not include PROJECT-SPECIFIC CONTEXT heading when no context provided', () => {
    expect(content).not.toContain('PROJECT-SPECIFIC CONTEXT');
  });
});

// ---------------------------------------------------------------------------
// buildReviewPrompt
// ---------------------------------------------------------------------------
describe('buildReviewPrompt', () => {
  const prompt = buildReviewPrompt(mockPRDetails, 'strict');

  it('contains the PR title (from content section)', () => {
    expect(prompt).toContain('Add authentication improvements');
  });

  it('contains the response format instructions (from instructions section)', () => {
    expect(prompt).toContain('FILE:');
    expect(prompt).toContain('COMMENT:');
  });
});
