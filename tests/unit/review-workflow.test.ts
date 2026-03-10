import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  convertToGeneralComment,
  handlePRApprovalWorkflow,
} from '../../src/utils/review-workflow';
import type { ReviewComment } from '../../src/utils/review-workflow';

// Mock the prompts module so handlePRApprovalWorkflow tests can control confirmations
vi.mock('../../src/utils/prompts', () => ({
  askYesNo: vi.fn(),
  askConfirmation: vi.fn(),
}));

import { askConfirmation } from '../../src/utils/prompts';
const mockAskConfirmation = vi.mocked(askConfirmation);

// ---------------------------------------------------------------------------
// convertToGeneralComment
// ---------------------------------------------------------------------------
describe('convertToGeneralComment', () => {
  it('prefixes the comment with [About line N - not modified in this PR] for single-line', () => {
    const comment: ReviewComment = {
      file: 'src/auth/login.ts',
      line: 42,
      comment: 'This is a problem.',
    };
    const result = convertToGeneralComment(comment);
    expect(result.comment).toContain('[About line 42 - not modified in this PR]');
    expect(result.comment).toContain('This is a problem.');
  });

  it('prefixes with [About lines N-M - not modified in this PR] for multi-line ranges', () => {
    const comment: ReviewComment = {
      file: 'src/auth/login.ts',
      startLine: 10,
      line: 15,
      comment: 'Multi-line issue.',
    };
    const result = convertToGeneralComment(comment);
    expect(result.comment).toContain('[About lines 10-15 - not modified in this PR]');
    expect(result.comment).toContain('Multi-line issue.');
  });

  it('sets line to undefined in the returned comment', () => {
    const comment: ReviewComment = {
      file: 'src/auth/login.ts',
      line: 42,
      comment: 'test',
    };
    expect(convertToGeneralComment(comment).line).toBeUndefined();
  });

  it('sets startLine to undefined in the returned comment', () => {
    const comment: ReviewComment = {
      file: 'src/auth/login.ts',
      startLine: 10,
      line: 15,
      comment: 'test',
    };
    expect(convertToGeneralComment(comment).startLine).toBeUndefined();
  });

  it('preserves the file path', () => {
    const comment: ReviewComment = {
      file: 'src/auth/login.ts',
      line: 42,
      comment: 'test',
    };
    expect(convertToGeneralComment(comment).file).toBe('src/auth/login.ts');
  });

  it('preserves originalCode and suggestedCode', () => {
    const comment: ReviewComment = {
      file: 'src/auth/login.ts',
      line: 42,
      comment: 'test',
      originalCode: 'old code',
      suggestedCode: 'new code',
    };
    const result = convertToGeneralComment(comment);
    expect(result.originalCode).toBe('old code');
    expect(result.suggestedCode).toBe('new code');
  });

  it('does not include refLines or targetCode in the converted comment', () => {
    const comment: ReviewComment = {
      file: 'src/auth/login.ts',
      line: 42,
      comment: 'test',
      refLines: [[1, 5]],
      targetCode: 'some code',
    };
    const result = convertToGeneralComment(comment);
    expect(result.refLines).toBeUndefined();
    expect(result.targetCode).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// handlePRApprovalWorkflow
// ---------------------------------------------------------------------------
describe('handlePRApprovalWorkflow', () => {
  const callbacks = {
    onApprove: vi.fn(),
    onRequestChanges: vi.fn(),
    onComment: vi.fn(),
    onSkip: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('action: approve', () => {
    it('calls onApprove when user confirms', async () => {
      mockAskConfirmation.mockResolvedValueOnce(true);
      await handlePRApprovalWorkflow({ action: 'approve' }, callbacks);
      expect(callbacks.onApprove).toHaveBeenCalledOnce();
    });

    it('does not call onApprove when user cancels', async () => {
      mockAskConfirmation.mockResolvedValueOnce(false);
      await handlePRApprovalWorkflow({ action: 'approve' }, callbacks);
      expect(callbacks.onApprove).not.toHaveBeenCalled();
    });
  });

  describe('action: request_changes', () => {
    it('calls onRequestChanges with reviewBody when user confirms', async () => {
      mockAskConfirmation.mockResolvedValueOnce(true);
      await handlePRApprovalWorkflow(
        { action: 'request_changes', reviewBody: 'Please fix these issues.' },
        callbacks
      );
      expect(callbacks.onRequestChanges).toHaveBeenCalledWith('Please fix these issues.');
    });

    it('does not call onRequestChanges when user cancels', async () => {
      mockAskConfirmation.mockResolvedValueOnce(false);
      await handlePRApprovalWorkflow(
        { action: 'request_changes', reviewBody: 'Fix it.' },
        callbacks
      );
      expect(callbacks.onRequestChanges).not.toHaveBeenCalled();
    });
  });

  describe('action: comment', () => {
    it('calls onComment immediately without asking for confirmation', async () => {
      await handlePRApprovalWorkflow({ action: 'comment' }, callbacks);
      expect(callbacks.onComment).toHaveBeenCalledOnce();
      expect(mockAskConfirmation).not.toHaveBeenCalled();
    });
  });

  describe('action: skip', () => {
    it('calls onSkip immediately without asking for confirmation', async () => {
      await handlePRApprovalWorkflow({ action: 'skip' }, callbacks);
      expect(callbacks.onSkip).toHaveBeenCalledOnce();
      expect(mockAskConfirmation).not.toHaveBeenCalled();
    });
  });

  it('does not call any callback when action is approve and user cancels', async () => {
    mockAskConfirmation.mockResolvedValueOnce(false);
    await handlePRApprovalWorkflow({ action: 'approve' }, callbacks);
    expect(callbacks.onApprove).not.toHaveBeenCalled();
    expect(callbacks.onRequestChanges).not.toHaveBeenCalled();
    expect(callbacks.onComment).not.toHaveBeenCalled();
    expect(callbacks.onSkip).not.toHaveBeenCalled();
  });
});
