import { FileChange } from '../platforms/base';

export interface DiffHunk {
  oldStart: number;
  oldLines: number;
  newStart: number;
  newLines: number;
  lines: string[];
}

export interface ParsedFile {
  oldPath: string;
  newPath: string;
  hunks: DiffHunk[];
}

export function parseDiff(diff: string): Map<string, ParsedFile> {
  const files = new Map<string, ParsedFile>();
  const lines = diff.split('\n');

  let currentFile: ParsedFile | null = null;
  let currentHunk: DiffHunk | null = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // New file header
    if (line.startsWith('diff --git')) {
      const match = line.match(/diff --git a\/(.*?) b\/(.*?)$/);
      if (match) {
        currentHunk = null;
        currentFile = {
          oldPath: match[1],
          newPath: match[2],
          hunks: [],
        };
        files.set(currentFile.newPath, currentFile);
      }
      continue;
    }

    // Hunk header: @@ -old_start,old_lines +new_start,new_lines @@
    if (line.startsWith('@@')) {
      const match = line.match(/@@ -(\d+),?(\d*) \+(\d+),?(\d*) @@/);
      if (match && currentFile) {
        currentHunk = {
          oldStart: parseInt(match[1], 10),
          oldLines: match[2] ? parseInt(match[2], 10) : 1,
          newStart: parseInt(match[3], 10),
          newLines: match[4] ? parseInt(match[4], 10) : 1,
          lines: [],
        };
        currentFile.hunks.push(currentHunk);
      }
      continue;
    }

    // Diff content lines
    if (currentHunk && (line.startsWith('+') || line.startsWith('-') || line.startsWith(' '))) {
      currentHunk.lines.push(line);
    }
  }

  return files;
}

/**
 * Check if a line number exists in the diff for a given file
 * @param parsedFiles Parsed diff files
 * @param filePath Path to the file
 * @param lineNumber Line number to check
 * @returns true if the line exists in the diff, false otherwise
 */
export function isLineInDiff(
  parsedFiles: Map<string, ParsedFile>,
  filePath: string,
  lineNumber: number
): boolean {
  const file = parsedFiles.get(filePath);
  if (!file) {
    return false;
  }

  // Check if line is within any hunk
  for (const hunk of file.hunks) {
    const hunkEnd = hunk.newStart + hunk.newLines;
    if (lineNumber >= hunk.newStart && lineNumber < hunkEnd) {
      return true;
    }
  }

  return false;
}

/**
 * Get the code content at a specific new-file line number (without the diff prefix).
 * Returns null if the line is not found in any hunk.
 */
export function getCodeAtLine(
  parsedFiles: Map<string, ParsedFile>,
  filePath: string,
  lineNumber: number
): string | null {
  const file = parsedFiles.get(filePath);
  if (!file) return null;

  for (const hunk of file.hunks) {
    const hunkEnd = hunk.newStart + hunk.newLines;
    if (lineNumber >= hunk.newStart && lineNumber < hunkEnd) {
      let currentLine = hunk.newStart;
      for (const diffLine of hunk.lines) {
        if (diffLine.startsWith('-')) continue; // deleted lines don't count in new file
        if (currentLine === lineNumber) {
          return diffLine.substring(1); // strip the '+' or ' ' prefix
        }
        currentLine++;
      }
    }
  }

  return null;
}

export interface CodeContextResult {
  lines: string[];
  startLineNum: number;
}

export function getContextWindow(
  parsedFiles: Map<string, ParsedFile>,
  filePath: string,
  lineNumber: number,
  contextLines: number = 3
): CodeContextResult {
  const file = parsedFiles.get(filePath);
  if (!file) {
    return { lines: [], startLineNum: 1 };
  }

  // Find the hunk containing this line
  for (const hunk of file.hunks) {
    const hunkEnd = hunk.newStart + hunk.newLines;
    if (lineNumber >= hunk.newStart && lineNumber < hunkEnd) {
      // Calculate the position within the hunk
      const context: string[] = [];
      const targetIndex = lineNumber - hunk.newStart;

      // Track actual line position considering additions/deletions
      let lineIndex = 0;
      let withinRange = false;
      let firstNewLineIndex = -1;

      for (let i = 0; i < hunk.lines.length; i++) {
        const diffLine = hunk.lines[i];

        // Update range tracking (only for lines that count in the new file)
        if (!diffLine.startsWith('-')) {
          withinRange = lineIndex >= targetIndex - contextLines && lineIndex <= targetIndex + contextLines;
        }

        // Include lines in context if we're in range (including removed lines)
        if (withinRange) {
          context.push(diffLine);
          // Track the new-file line number of the first non-deleted line in context
          if (firstNewLineIndex === -1 && !diffLine.startsWith('-')) {
            firstNewLineIndex = lineIndex;
          }
        }

        // Increment line counter for new file lines
        if (diffLine.startsWith('+') || diffLine.startsWith(' ')) {
          lineIndex++;
        }

        // Stop if we've gone past the context
        if (lineIndex > targetIndex + contextLines) {
          break;
        }
      }

      const startLineNum = firstNewLineIndex === -1
        ? hunk.newStart
        : hunk.newStart + firstNewLineIndex;

      return { lines: context, startLineNum };
    }
  }

  return { lines: [], startLineNum: 1 };
}

/**
 * Extract exactly lines [startLine, endLine] from the parsed diff.
 * Unlike getContextWindow, this does not add extra lines around the range.
 */
export function getExactLineRange(
  parsedFiles: Map<string, ParsedFile>,
  filePath: string,
  startLine: number,
  endLine: number
): CodeContextResult {
  const file = parsedFiles.get(filePath);
  if (!file) {
    return { lines: [], startLineNum: startLine };
  }

  const result: string[] = [];

  for (const hunk of file.hunks) {
    const hunkEnd = hunk.newStart + hunk.newLines;
    if (endLine < hunk.newStart || startLine >= hunkEnd) continue;

    let currentLine = hunk.newStart;
    let withinRange = false;

    for (const diffLine of hunk.lines) {
      if (!diffLine.startsWith('-')) {
        withinRange = currentLine >= startLine && currentLine <= endLine;
      }

      if (withinRange) {
        result.push(diffLine);
      }

      if (diffLine.startsWith('+') || diffLine.startsWith(' ')) {
        currentLine++;
      }

      if (currentLine > endLine) break;
    }
  }

  return { lines: result, startLineNum: startLine };
}

export interface CodeRegion {
  lines: string[];
  startLineNum: number;
  isContext?: boolean; // true for distant context blocks, false/undefined for main comment target
}

/**
 * Get code context for multiple regions (main comment range + referenced ranges).
 * Returns sorted, non-overlapping regions with a ... gap between them.
 */
export function getMultiRegionCodeContext(
  parsedFiles: Map<string, ParsedFile>,
  filePath: string,
  mainTarget: number,
  mainContext: number,
  refRanges: [number, number][]
): CodeRegion[] {
  const rawRegions: { lines: string[]; startLineNum: number; endLineNum: number; isContext: boolean }[] = [];

  // Ref ranges: extract exact lines
  for (const [start, end] of refRanges) {
    const result = getExactLineRange(parsedFiles, filePath, start, end);
    if (result.lines.length === 0) continue;
    rawRegions.push({ lines: result.lines, startLineNum: start, endLineNum: end, isContext: true });
  }

  // Main range: context window around target
  const mainResult = getContextWindow(parsedFiles, filePath, mainTarget, mainContext);
  if (mainResult.lines.length > 0) {
    let endLineNum = mainResult.startLineNum;
    for (const line of mainResult.lines) {
      if (!line.startsWith('-')) {
        endLineNum++;
      }
    }
    rawRegions.push({ lines: mainResult.lines, startLineNum: mainResult.startLineNum, endLineNum, isContext: false });
  }

  if (rawRegions.length === 0) return [];

  // Drop ref regions that are entirely contained within the main region
  const mainRegion = rawRegions.find((r) => !r.isContext);
  if (mainRegion) {
    for (let i = rawRegions.length - 1; i >= 0; i--) {
      const r = rawRegions[i];
      if (r.isContext && r.startLineNum >= mainRegion.startLineNum && r.endLineNum <= mainRegion.endLineNum) {
        rawRegions.splice(i, 1);
      }
    }
  }

  // Sort by start line
  rawRegions.sort((a, b) => a.startLineNum - b.startLineNum);

  // Merge overlapping or adjacent regions of the same type
  const merged: { lines: string[]; startLineNum: number; endLineNum: number; isContext: boolean }[] = [rawRegions[0]];

  for (let i = 1; i < rawRegions.length; i++) {
    const prev = merged[merged.length - 1];
    const curr = rawRegions[i];

    if (curr.startLineNum <= prev.endLineNum + 1 && curr.isContext === prev.isContext) {
      // Overlapping or adjacent regions of the same type — merge into one
      const combinedStart = prev.startLineNum;
      const combinedEnd = Math.max(prev.endLineNum, curr.endLineNum);
      const combinedResult = getExactLineRange(parsedFiles, filePath, combinedStart, combinedEnd);

      if (combinedResult.lines.length > 0) {
        merged[merged.length - 1] = {
          lines: combinedResult.lines,
          startLineNum: combinedResult.startLineNum,
          endLineNum: combinedEnd,
          isContext: prev.isContext,
        };
      }
    } else {
      merged.push(curr);
    }
  }

  return merged.map(({ lines, startLineNum, isContext }) => ({ lines, startLineNum, isContext }));
}

/**
 * Parse a unified diff string into FileChange[] with per-file stats.
 * Shared by GitHub and Bitbucket platforms.
 */
export function parseFileChanges(diff: string): FileChange[] {
  const files: FileChange[] = [];
  const lines = diff.split('\n');
  let currentFile: FileChange | null = null;
  let patchLines: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (line.startsWith('diff --git')) {
      if (currentFile) {
        currentFile.patch = patchLines.join('\n');
        files.push(currentFile);
      }

      const fileMatch = line.match(/^diff --git a\/(.*?) b\/(.*?)$/);
      if (fileMatch) {
        currentFile = {
          path: fileMatch[2],
          additions: 0,
          deletions: 0,
          patch: '',
          status: 'modified',
        };
        patchLines = [line];
      }
    } else if (currentFile) {
      patchLines.push(line);

      if (line.startsWith('+') && !line.startsWith('+++')) {
        currentFile.additions++;
      } else if (line.startsWith('-') && !line.startsWith('---')) {
        currentFile.deletions++;
      }

      if (line.startsWith('new file mode')) {
        currentFile.status = 'added';
      } else if (line.startsWith('deleted file mode')) {
        currentFile.status = 'deleted';
      } else if (line.startsWith('rename from')) {
        currentFile.status = 'renamed';
      }
    }
  }

  if (currentFile) {
    currentFile.patch = patchLines.join('\n');
    files.push(currentFile);
  }

  return files;
}

/**
 * Annotate a raw unified diff string with new-file line numbers.
 *
 * '+' and ' ' (context) lines receive their new-file line number.
 * '-' (deleted) lines receive blank padding (no number).
 * File headers, hunk headers, and metadata lines pass through unchanged.
 */
export function annotateDiffWithLineNumbers(diff: string): string {
  if (!diff) return diff;

  const lines = diff.split('\n');

  // Pass 1: find max new-file line number for padding width
  let maxLineNum = 0;
  for (const line of lines) {
    const m = line.match(/@@ -\d+,?\d* \+(\d+),?(\d*) @@/);
    if (m) {
      const newStart = parseInt(m[1], 10);
      const newLines = m[2] ? parseInt(m[2], 10) : 1;
      maxLineNum = Math.max(maxLineNum, newStart + newLines);
    }
  }

  const padWidth = Math.max(4, String(maxLineNum).length);
  const blankPad = ' '.repeat(padWidth);

  // Pass 2: annotate each line
  let currentLineNum = 0;
  const result: string[] = [];

  for (const line of lines) {
    if (line.startsWith('diff --git')) {
      result.push(line);
      currentLineNum = 0;
      continue;
    }

    const hunkMatch = line.match(/@@ -\d+,?\d* \+(\d+),?\d* @@/);
    if (hunkMatch) {
      currentLineNum = parseInt(hunkMatch[1], 10);
      result.push(line);
      continue;
    }

    if (
      line.startsWith('---') ||
      line.startsWith('+++') ||
      line.startsWith('index ') ||
      line.startsWith('new file mode') ||
      line.startsWith('deleted file mode') ||
      line.startsWith('old mode') ||
      line.startsWith('new mode') ||
      line.startsWith('rename from') ||
      line.startsWith('rename to') ||
      line.startsWith('similarity index') ||
      line.startsWith('dissimilarity index') ||
      line.startsWith('Binary files')
    ) {
      result.push(line);
      continue;
    }

    if (currentLineNum > 0) {
      if (line.startsWith('-')) {
        result.push(`${blankPad} \u2502 ${line}`);
      } else if (line.startsWith('+') || line.startsWith(' ')) {
        result.push(`${String(currentLineNum).padStart(padWidth)} \u2502 ${line}`);
        currentLineNum++;
      } else if (line.startsWith('\\')) {
        result.push(line);
      } else {
        result.push(line);
      }
    } else {
      result.push(line);
    }
  }

  return result.join('\n');
}
