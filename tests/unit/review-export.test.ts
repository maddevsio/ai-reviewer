import { describe, it, expect, vi, beforeEach } from 'vitest';
import fs from 'fs';
import { exportToReviewFile } from '../../src/utils/review-export';
import type { ReviewComment } from '../../src/utils/review-workflow';

describe('exportToReviewFile', () => {
  let writeSpy: ReturnType<typeof vi.spyOn>;
  let capturedContent: string;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2025-06-15T12:00:00.000Z'));

    capturedContent = '';
    writeSpy = vi.spyOn(fs, 'writeFileSync').mockImplementation((_path, content) => {
      capturedContent = content as string;
    });
  });

  afterEach(() => {
    writeSpy.mockRestore();
    vi.useRealTimers();
  });

  const makeComment = (overrides: Partial<ReviewComment> = {}): ReviewComment => ({
    file: 'src/auth/login.ts',
    line: 42,
    comment: 'This is a review comment.',
    ...overrides,
  });

  it('writes to a file path ending in REVIEW.md', async () => {
    await exportToReviewFile([makeComment()], '123');
    expect(writeSpy).toHaveBeenCalledOnce();
    const [filePath] = writeSpy.mock.calls[0];
    expect(String(filePath)).toMatch(/REVIEW\.md$/);
  });

  it('includes the PR number in the title', async () => {
    await exportToReviewFile([makeComment()], '99');
    expect(capturedContent).toContain('# Code Review - PR #99');
  });

  it('includes today\'s ISO date', async () => {
    await exportToReviewFile([makeComment()], '1');
    expect(capturedContent).toContain('2025-06-15');
  });

  it('includes the total comment count', async () => {
    await exportToReviewFile([makeComment(), makeComment({ file: 'src/other.ts' })], '5');
    expect(capturedContent).toContain('**Total Comments:** 2');
  });

  it('includes the file name as a section heading', async () => {
    await exportToReviewFile([makeComment({ file: 'src/auth/login.ts' })], '1');
    expect(capturedContent).toContain('## src/auth/login.ts');
  });

  it('renders single-line comment with "Line N" subheading', async () => {
    await exportToReviewFile([makeComment({ line: 42 })], '1');
    expect(capturedContent).toContain('### Line 42');
  });

  it('renders multi-line comment with "Lines N-M" subheading', async () => {
    await exportToReviewFile([makeComment({ startLine: 10, line: 15 })], '1');
    expect(capturedContent).toContain('### Lines 10-15');
  });

  it('renders general comment (no line) with "General" subheading', async () => {
    await exportToReviewFile([makeComment({ line: undefined })], '1');
    expect(capturedContent).toContain('### General');
  });

  it('includes the comment body text', async () => {
    await exportToReviewFile([makeComment({ comment: 'Avoid mutation here.' })], '1');
    expect(capturedContent).toContain('Avoid mutation here.');
  });

  it('groups multiple comments under the same file heading', async () => {
    const comments = [
      makeComment({ line: 10, comment: 'First comment' }),
      makeComment({ line: 20, comment: 'Second comment' }),
    ];
    await exportToReviewFile(comments, '1');
    // Only one ## heading for the file
    const matches = capturedContent.match(/## src\/auth\/login\.ts/g);
    expect(matches).toHaveLength(1);
    expect(capturedContent).toContain('First comment');
    expect(capturedContent).toContain('Second comment');
  });

  it('creates separate file sections for different files', async () => {
    const comments = [
      makeComment({ file: 'src/auth/login.ts', line: 10, comment: 'Auth comment' }),
      makeComment({ file: 'src/utils/helpers.ts', line: 5, comment: 'Helper comment' }),
    ];
    await exportToReviewFile(comments, '1');
    expect(capturedContent).toContain('## src/auth/login.ts');
    expect(capturedContent).toContain('## src/utils/helpers.ts');
  });

  it('throws an error with a descriptive message when writeFileSync fails', async () => {
    writeSpy.mockImplementation(() => {
      throw new Error('Permission denied');
    });
    await expect(exportToReviewFile([makeComment()], '1')).rejects.toThrow(
      'Failed to write REVIEW.md:'
    );
  });
});
