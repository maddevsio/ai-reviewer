import { describe, it, expect } from 'vitest';
import {
  parseDiff,
  isLineInDiff,
  getCodeAtLine,
  getContextWindow,
  getExactLineRange,
  getMultiRegionCodeContext,
  parseFileChanges,
  annotateDiffWithLineNumbers,
} from '../../src/utils/diff-parser';
import { SAMPLE_DIFF, FILE1, FILE2 } from '../fixtures/sample-diff';

// ---------------------------------------------------------------------------
// Shared parsed diff used across all tests in this file
// ---------------------------------------------------------------------------
const parsed = parseDiff(SAMPLE_DIFF);

// ---------------------------------------------------------------------------
// parseDiff
// ---------------------------------------------------------------------------
describe('parseDiff', () => {
  it('returns a Map', () => {
    expect(parsed).toBeInstanceOf(Map);
  });

  it('creates one entry per file in the diff', () => {
    expect(parsed.size).toBe(2);
  });

  it('indexes files by their newPath (b/ side)', () => {
    expect(parsed.has(FILE1)).toBe(true);
    expect(parsed.has(FILE2)).toBe(true);
  });

  it('parses the correct number of hunks for FILE1', () => {
    expect(parsed.get(FILE1)!.hunks).toHaveLength(2);
  });

  it('parses the correct number of hunks for FILE2', () => {
    expect(parsed.get(FILE2)!.hunks).toHaveLength(1);
  });

  it('parses hunk 1 header fields correctly for FILE1', () => {
    const hunk = parsed.get(FILE1)!.hunks[0];
    expect(hunk.oldStart).toBe(8);
    expect(hunk.oldLines).toBe(8);
    expect(hunk.newStart).toBe(8);
    expect(hunk.newLines).toBe(12);
  });

  it('parses hunk 2 header fields correctly for FILE1', () => {
    const hunk = parsed.get(FILE1)!.hunks[1];
    expect(hunk.newStart).toBe(36);
    expect(hunk.newLines).toBe(8);
  });

  it('parses hunk header fields for FILE2', () => {
    const hunk = parsed.get(FILE2)!.hunks[0];
    expect(hunk.newStart).toBe(1);
    expect(hunk.newLines).toBe(7);
  });

  it('hunk lines contain raw diff lines (with + / - / space prefix)', () => {
    const lines = parsed.get(FILE1)!.hunks[0].lines;
    expect(lines.some((l) => l.startsWith('+'))).toBe(true);
    expect(lines.some((l) => l.startsWith('-'))).toBe(true);
    expect(lines.some((l) => l.startsWith(' '))).toBe(true);
  });

  it('does not include file metadata lines (index, ---, +++) in hunk lines', () => {
    for (const file of parsed.values()) {
      for (const hunk of file.hunks) {
        for (const line of hunk.lines) {
          expect(line.startsWith('index ')).toBe(false);
          expect(line.startsWith('--- ')).toBe(false);
          expect(line.startsWith('+++ ')).toBe(false);
        }
      }
    }
  });

  it('handles @@ with implied line count of 1 (no comma)', () => {
    const singleLineDiff = [
      'diff --git a/foo.ts b/foo.ts',
      '--- a/foo.ts',
      '+++ b/foo.ts',
      '@@ -5 +5 @@',
      '+added line',
    ].join('\n');
    const result = parseDiff(singleLineDiff);
    const hunk = result.get('foo.ts')!.hunks[0];
    expect(hunk.oldLines).toBe(1);
    expect(hunk.newLines).toBe(1);
  });

  it('returns an empty Map for an empty string', () => {
    expect(parseDiff('').size).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// isLineInDiff
// ---------------------------------------------------------------------------
describe('isLineInDiff', () => {
  it('returns true for an added line (new line 10) in hunk 1', () => {
    expect(isLineInDiff(parsed, FILE1, 10)).toBe(true);
  });

  it('returns true for a context line (new line 8) within hunk 1', () => {
    expect(isLineInDiff(parsed, FILE1, 8)).toBe(true);
  });

  it('returns true for the last new-file line in hunk 1 (line 19)', () => {
    // hunkEnd = newStart(8) + newLines(12) = 20 → line 19 < 20 → true
    expect(isLineInDiff(parsed, FILE1, 19)).toBe(true);
  });

  it('returns false for a line one past the end of hunk 1 (line 20)', () => {
    // 20 is not in hunk1 (end=20, exclusive) and not in hunk2 (start=36)
    expect(isLineInDiff(parsed, FILE1, 20)).toBe(false);
  });

  it('returns true for the first line of hunk 2 (line 36)', () => {
    expect(isLineInDiff(parsed, FILE1, 36)).toBe(true);
  });

  it('returns false for a line between the two hunks (line 25)', () => {
    expect(isLineInDiff(parsed, FILE1, 25)).toBe(false);
  });

  it('returns false for a line before any hunk (line 1)', () => {
    expect(isLineInDiff(parsed, FILE1, 1)).toBe(false);
  });

  it('returns false for line one past the end of hunk 2 (line 44)', () => {
    // hunkEnd = 36 + 8 = 44 → 44 is not < 44
    expect(isLineInDiff(parsed, FILE1, 44)).toBe(false);
  });

  it('returns false for an unknown file path', () => {
    expect(isLineInDiff(parsed, 'nonexistent.ts', 10)).toBe(false);
  });

  it('returns false for an empty parsed Map', () => {
    expect(isLineInDiff(new Map(), FILE1, 10)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// getCodeAtLine
// ---------------------------------------------------------------------------
describe('getCodeAtLine', () => {
  it('returns code for an added (+) line (new line 10: logger import)', () => {
    expect(getCodeAtLine(parsed, FILE1, 10)).toBe("import { logger } from '../utils/logger';");
  });

  it('returns code for an added (+) line (new line 11: validateInput import)', () => {
    expect(getCodeAtLine(parsed, FILE1, 11)).toBe("import { validateInput } from '../utils/validate';");
  });

  it('returns code for an added (+) line (new line 12: RateLimiter import)', () => {
    expect(getCodeAtLine(parsed, FILE1, 12)).toBe("import { RateLimiter } from '../utils/rate-limiter';");
  });

  it('returns an empty string for a blank added (+) line (new line 13)', () => {
    expect(getCodeAtLine(parsed, FILE1, 13)).toBe('');
  });

  it('returns code for a context ( ) line — prefix is stripped (new line 8)', () => {
    expect(getCodeAtLine(parsed, FILE1, 8)).toBe("import { hash } from 'bcrypt';");
  });

  it('returns the replaced added line that took the slot of a removed line (new line 16)', () => {
    expect(getCodeAtLine(parsed, FILE1, 16)).toBe('  if (!user || !user.isActive) return null;');
  });

  it('returns code from hunk 2 (new line 39: const token)', () => {
    expect(getCodeAtLine(parsed, FILE1, 39)).toBe('  const token = generateResetToken();');
  });

  it('returns code from hunk 2 (new line 41: sendResetEmail)', () => {
    expect(getCodeAtLine(parsed, FILE1, 41)).toBe('  await sendResetEmail(user.email, token);');
  });

  it('returns an empty string for blank added line in hunk 2 (new line 42)', () => {
    expect(getCodeAtLine(parsed, FILE1, 42)).toBe('');
  });

  it('returns code from FILE2 hunk (new line 1: formatDate function)', () => {
    expect(getCodeAtLine(parsed, FILE2, 1)).toBe('export function formatDate(date: Date): string {');
  });

  it('returns code from FILE2 hunk (new line 5: capitalize context line)', () => {
    expect(getCodeAtLine(parsed, FILE2, 5)).toBe('export function capitalize(str: string): string {');
  });

  it('returns null for a line outside all hunks (line 21 in FILE1)', () => {
    expect(getCodeAtLine(parsed, FILE1, 21)).toBeNull();
  });

  it('returns null for a line between the two hunks (line 25 in FILE1)', () => {
    expect(getCodeAtLine(parsed, FILE1, 25)).toBeNull();
  });

  it('returns null for an unknown file', () => {
    expect(getCodeAtLine(parsed, 'nonexistent.ts', 10)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// getContextWindow
// ---------------------------------------------------------------------------
describe('getContextWindow', () => {
  it('returns empty result for an unknown file', () => {
    const result = getContextWindow(parsed, 'nonexistent.ts', 10);
    expect(result.lines).toHaveLength(0);
  });

  it('returns a window of lines centered on the target line', () => {
    // Target line 12 in FILE2 hunk has lines 1–7. With contextLines=2 around line 3:
    // lines from max(1, 3-2)=1 to min(7, 3+2)=5 → lines 1..5
    const result = getContextWindow(parsed, FILE2, 3, 2);
    expect(result.lines.length).toBeGreaterThan(0);
    expect(result.startLineNum).toBeGreaterThanOrEqual(1);
  });

  it('startLineNum is the actual new-file line number of the first returned line', () => {
    const result = getContextWindow(parsed, FILE1, 16, 2);
    // Target is line 16 in hunk 1. Context of 2 means we start at line 14 minimum.
    expect(result.startLineNum).toBeGreaterThanOrEqual(8); // capped at hunk start
    expect(result.startLineNum).toBeLessThanOrEqual(16);
  });

  it('includes removed (-) lines within the context window', () => {
    // The removed line (-  if (!user) return null;) sits adjacent to line 16
    const result = getContextWindow(parsed, FILE1, 16, 1);
    expect(result.lines.some((l) => l.startsWith('-'))).toBe(true);
  });

  it('clips the window to the hunk boundary when context is large', () => {
    const result = getContextWindow(parsed, FILE2, 3, 100);
    // The hunk only has 7 new-file lines — result cannot include lines from other hunks
    expect(result.lines.length).toBeLessThanOrEqual(8); // 7 new + at most 1 removed = 8
  });

  it('returns empty when target line is outside all hunks', () => {
    const result = getContextWindow(parsed, FILE1, 25, 3);
    expect(result.lines).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// getExactLineRange
// ---------------------------------------------------------------------------
describe('getExactLineRange', () => {
  it('returns exactly the requested range with no surrounding context', () => {
    // Range 10–12 in FILE1: three added import lines
    const result = getExactLineRange(parsed, FILE1, 10, 12);
    expect(result.lines).toHaveLength(3);
    expect(result.lines[0]).toBe("+import { logger } from '../utils/logger';");
    expect(result.lines[1]).toBe("+import { validateInput } from '../utils/validate';");
    expect(result.lines[2]).toBe("+import { RateLimiter } from '../utils/rate-limiter';");
  });

  it('startLineNum equals the startLine parameter', () => {
    const result = getExactLineRange(parsed, FILE1, 10, 12);
    expect(result.startLineNum).toBe(10);
  });

  it('returns a single line for a same-start-and-end range', () => {
    const result = getExactLineRange(parsed, FILE1, 39, 39);
    expect(result.lines).toHaveLength(1);
    expect(result.lines[0]).toBe('+  const token = generateResetToken();');
  });

  it('returns empty for an unknown file', () => {
    const result = getExactLineRange(parsed, 'nonexistent.ts', 1, 5);
    expect(result.lines).toHaveLength(0);
  });

  it('returns empty when the range is entirely outside all hunks', () => {
    const result = getExactLineRange(parsed, FILE1, 21, 35);
    expect(result.lines).toHaveLength(0);
  });

  it('returns only lines that overlap with the hunk when range partially overlaps', () => {
    // FILE2 hunk covers 1–7; request 5–10
    const result = getExactLineRange(parsed, FILE2, 5, 10);
    // Only lines 5, 6, 7 exist in the hunk
    expect(result.lines.length).toBeGreaterThan(0);
    expect(result.lines.length).toBeLessThanOrEqual(3);
  });
});

// ---------------------------------------------------------------------------
// getMultiRegionCodeContext
// ---------------------------------------------------------------------------
describe('getMultiRegionCodeContext', () => {
  it('returns a single region when there are no refRanges', () => {
    const regions = getMultiRegionCodeContext(parsed, FILE1, 16, 2, []);
    expect(regions.length).toBe(1);
  });

  it('isContext is false for the main region', () => {
    const regions = getMultiRegionCodeContext(parsed, FILE1, 16, 2, []);
    const main = regions.find((r) => !r.isContext);
    expect(main).toBeDefined();
  });

  it('isContext is true for ref regions', () => {
    // refRange 10–12 is distant from main target 39
    const regions = getMultiRegionCodeContext(parsed, FILE1, 39, 2, [[10, 12]]);
    const refRegion = regions.find((r) => r.isContext);
    expect(refRegion).toBeDefined();
  });

  it('sorts regions by startLineNum ascending', () => {
    // ref at 10–12, main target at 39 → ref should come first
    const regions = getMultiRegionCodeContext(parsed, FILE1, 39, 2, [[10, 12]]);
    for (let i = 1; i < regions.length; i++) {
      expect(regions[i].startLineNum).toBeGreaterThanOrEqual(regions[i - 1].startLineNum);
    }
  });

  it('drops a ref region entirely contained within the main region', () => {
    // ref 10–11, main target 11 with large context → ref is inside main
    const regions = getMultiRegionCodeContext(parsed, FILE1, 11, 5, [[10, 11]]);
    // All regions returned should have lines; the contained ref should be dropped
    const refRegions = regions.filter((r) => r.isContext);
    expect(refRegions).toHaveLength(0);
  });

  it('merges two adjacent ref regions of the same type into one', () => {
    // Two adjacent ref ranges that touch each other and are both context
    const regions = getMultiRegionCodeContext(parsed, FILE1, 39, 1, [
      [10, 11],
      [12, 12],
    ]);
    const refRegions = regions.filter((r) => r.isContext);
    // They are adjacent (11 and 12 touch) so should be merged into one
    expect(refRegions.length).toBeLessThanOrEqual(1);
  });

  it('does not merge regions of different types', () => {
    // ref and main should stay separate even if they happen to be adjacent
    const regions = getMultiRegionCodeContext(parsed, FILE1, 14, 0, [[12, 13]]);
    // 12–13 ends at 13, main starts at 14 — different types, should not merge
    if (regions.length >= 2) {
      const hasContext = regions.some((r) => r.isContext);
      const hasMain = regions.some((r) => !r.isContext);
      expect(hasContext).toBe(true);
      expect(hasMain).toBe(true);
    }
  });

  it('returns empty array when the file is not in the diff', () => {
    const regions = getMultiRegionCodeContext(parsed, 'nonexistent.ts', 10, 2, [[1, 3]]);
    expect(regions).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// parseFileChanges
// ---------------------------------------------------------------------------
describe('parseFileChanges', () => {
  it('returns one entry per file', () => {
    const changes = parseFileChanges(SAMPLE_DIFF);
    expect(changes).toHaveLength(2);
  });

  it('sets path to the newPath (b/ side)', () => {
    const changes = parseFileChanges(SAMPLE_DIFF);
    expect(changes.map((c) => c.path)).toContain(FILE1);
    expect(changes.map((c) => c.path)).toContain(FILE2);
  });

  it('counts additions correctly for FILE1', () => {
    const changes = parseFileChanges(SAMPLE_DIFF);
    const file1 = changes.find((c) => c.path === FILE1)!;
    // Hunk1: 5 added lines (+import logger, +import validateInput, +import RateLimiter, +blank, +if condition)
    // Hunk2: 4 added lines (+token, +insert, +sendEmail, +blank)
    expect(file1.additions).toBe(9);
  });

  it('counts deletions correctly for FILE1', () => {
    const changes = parseFileChanges(SAMPLE_DIFF);
    const file1 = changes.find((c) => c.path === FILE1)!;
    // 2 removed lines (-if (!user) and -const oldToken)
    expect(file1.deletions).toBe(2);
  });

  it('counts additions correctly for FILE2', () => {
    const changes = parseFileChanges(SAMPLE_DIFF);
    const file2 = changes.find((c) => c.path === FILE2)!;
    // 4 added lines (+formatDate, +return, +}, +blank)
    expect(file2.additions).toBe(4);
  });

  it('defaults status to modified', () => {
    const changes = parseFileChanges(SAMPLE_DIFF);
    expect(changes[0].status).toBe('modified');
  });

  it('sets status to added for new file mode', () => {
    const diff = [
      'diff --git a/new.ts b/new.ts',
      'new file mode 100644',
      '--- /dev/null',
      '+++ b/new.ts',
      '@@ -0,0 +1,2 @@',
      '+export const x = 1;',
      '+export const y = 2;',
    ].join('\n');
    const changes = parseFileChanges(diff);
    expect(changes[0].status).toBe('added');
  });

  it('sets status to deleted for deleted file mode', () => {
    const diff = [
      'diff --git a/old.ts b/old.ts',
      'deleted file mode 100644',
      '--- a/old.ts',
      '+++ /dev/null',
      '@@ -1,2 +0,0 @@',
      '-const x = 1;',
    ].join('\n');
    const changes = parseFileChanges(diff);
    expect(changes[0].status).toBe('deleted');
  });

  it('sets status to renamed for rename from', () => {
    const diff = [
      'diff --git a/old.ts b/new.ts',
      'rename from old.ts',
      'rename to new.ts',
      '@@ -1 +1 @@',
      ' unchanged',
    ].join('\n');
    const changes = parseFileChanges(diff);
    expect(changes[0].status).toBe('renamed');
  });

  it('returns an empty array for an empty diff', () => {
    expect(parseFileChanges('')).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// annotateDiffWithLineNumbers
// ---------------------------------------------------------------------------
describe('annotateDiffWithLineNumbers', () => {
  const annotated = annotateDiffWithLineNumbers(SAMPLE_DIFF);
  const lines = annotated.split('\n');

  it('returns an empty string unchanged', () => {
    expect(annotateDiffWithLineNumbers('')).toBe('');
  });

  it('passes diff --git header through unchanged', () => {
    expect(lines.some((l) => l === `diff --git a/${FILE1} b/${FILE1}`)).toBe(true);
  });

  it('passes @@ hunk header through unchanged', () => {
    expect(lines.some((l) => l.startsWith('@@ -8,8 +8,12 @@'))).toBe(true);
  });

  it('passes --- header through unchanged', () => {
    expect(lines.some((l) => l === `--- a/${FILE1}`)).toBe(true);
  });

  it('passes +++ header through unchanged', () => {
    expect(lines.some((l) => l === `+++ b/${FILE1}`)).toBe(true);
  });

  it('annotates an added line with its new-file line number', () => {
    // Line 10 is "+import { logger }..." — should be prefixed with its number
    const found = lines.find((l) => l.includes("import { logger } from '../utils/logger';"));
    expect(found).toBeDefined();
    expect(found).toMatch(/^\s*10\s*│/);
  });

  it('annotates a context line with its new-file line number', () => {
    const found = lines.find((l) => l.includes("import { hash } from 'bcrypt';"));
    expect(found).toBeDefined();
    expect(found).toMatch(/^\s*8\s*│/);
  });

  it('annotates a removed line with blank padding (no number)', () => {
    const found = lines.find((l) => l.includes('-  if (!user) return null;'));
    expect(found).toBeDefined();
    // Blank pad: no digit before the │
    expect(found).toMatch(/^\s+│/);
    expect(found).not.toMatch(/\d+\s*│/);
  });

  it('increments line numbers correctly — context line at 14 is labeled 14', () => {
    const found = lines.find((l) =>
      l.includes('export async function login(username: string, password: string)')
    );
    expect(found).toBeDefined();
    expect(found).toMatch(/^\s*14\s*│/);
  });

  it('uses consistent padding width (at least 4 chars)', () => {
    // All numbered lines should have padding with at least 4 characters before the │
    const numberedLines = lines.filter((l) => /^\s*\d+\s*│/.test(l));
    for (const l of numberedLines) {
      const prefix = l.split('│')[0];
      expect(prefix.length).toBeGreaterThanOrEqual(4);
    }
  });

  it('resets line numbering when a new diff --git header is encountered', () => {
    // FILE2 hunk starts at line 1
    const found = lines.find((l) => l.includes('export function formatDate'));
    expect(found).toBeDefined();
    expect(found).toMatch(/^\s*1\s*│/);
  });
});
