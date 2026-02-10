import fs from 'fs';
import path from 'path';
import { ReviewComment } from './review-workflow';

/**
 * Export review comments to REVIEW.md file in project root
 */
export async function exportToReviewFile(comments: ReviewComment[], prId: string): Promise<void> {
  const reviewContent = generateReviewMarkdown(comments, prId);
  const reviewPath = path.join(process.cwd(), 'REVIEW.md');

  try {
    fs.writeFileSync(reviewPath, reviewContent, 'utf-8');
  } catch (error: any) {
    throw new Error(`Failed to write REVIEW.md: ${error.message}`);
  }
}

/**
 * Generate markdown content for the review
 */
function generateReviewMarkdown(comments: ReviewComment[], prId: string): string {
  const timestamp = new Date().toISOString().split('T')[0];
  let markdown = `# Code Review - PR #${prId}\n\n`;
  markdown += `**Date:** ${timestamp}\n`;
  markdown += `**Total Comments:** ${comments.length}\n\n`;
  markdown += `---\n\n`;

  // Group comments by file
  const commentsByFile = new Map<string, ReviewComment[]>();
  for (const comment of comments) {
    const fileComments = commentsByFile.get(comment.file) || [];
    fileComments.push(comment);
    commentsByFile.set(comment.file, fileComments);
  }

  // Generate markdown for each file
  for (const [file, fileComments] of commentsByFile) {
    markdown += `## ${file}\n\n`;

    for (const comment of fileComments) {
      const lineInfo = comment.startLine && comment.startLine !== comment.line
        ? `Lines ${comment.startLine}-${comment.line}`
        : comment.line
          ? `Line ${comment.line}`
          : 'General';

      markdown += `### ${lineInfo}\n\n`;
      markdown += `${comment.comment}\n\n`;
    }

    markdown += `---\n\n`;
  }

  return markdown;
}
