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

export function getCodeContext(
  parsedFiles: Map<string, ParsedFile>,
  filePath: string,
  lineNumber: number,
  contextLines: number = 3
): string[] {
  const file = parsedFiles.get(filePath);
  if (!file) {
    return [];
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

      for (let i = 0; i < hunk.lines.length; i++) {
        const diffLine = hunk.lines[i];

        // Update range tracking (only for lines that count in the new file)
        if (!diffLine.startsWith('-')) {
          withinRange = lineIndex >= targetIndex - contextLines && lineIndex <= targetIndex + contextLines;
        }

        // Include lines in context if we're in range (including removed lines)
        if (withinRange) {
          context.push(diffLine);
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

      return context;
    }
  }

  return [];
}

export interface CodeRegion {
  lines: string[];
  startLineNum: number;
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
  // Build list of all ranges to show: ref ranges (1 line context) + main range
  const allRanges: { target: number; context: number }[] = [];

  for (const [start, end] of refRanges) {
    const mid = Math.floor((start + end) / 2);
    const halfRange = Math.ceil((end - start) / 2);
    allRanges.push({ target: mid, context: halfRange + 1 });
  }

  // Main range last
  allRanges.push({ target: mainTarget, context: mainContext });

  // Get raw code context for each range
  const rawRegions: { lines: string[]; startLineNum: number; endLineNum: number }[] = [];

  for (const range of allRanges) {
    const lines = getCodeContext(parsedFiles, filePath, range.target, range.context);
    if (lines.length === 0) continue;

    let startLineNum = range.target - range.context;
    if (startLineNum < 1) startLineNum = 1;

    // Calculate end line number by counting non-deleted lines
    let endLineNum = startLineNum;
    for (const line of lines) {
      if (!line.startsWith('-')) {
        endLineNum++;
      }
    }

    rawRegions.push({ lines, startLineNum, endLineNum });
  }

  if (rawRegions.length === 0) return [];

  // Sort by start line
  rawRegions.sort((a, b) => a.startLineNum - b.startLineNum);

  // Merge overlapping or adjacent regions
  const merged: { lines: string[]; startLineNum: number; endLineNum: number }[] = [rawRegions[0]];

  for (let i = 1; i < rawRegions.length; i++) {
    const prev = merged[merged.length - 1];
    const curr = rawRegions[i];

    if (curr.startLineNum <= prev.endLineNum + 1) {
      // Overlapping or adjacent — re-fetch as one combined region
      const combinedStart = prev.startLineNum;
      const combinedEnd = Math.max(prev.endLineNum, curr.endLineNum);
      const combinedMid = Math.floor((combinedStart + combinedEnd) / 2);
      const combinedContext = Math.ceil((combinedEnd - combinedStart) / 2);
      const combinedLines = getCodeContext(parsedFiles, filePath, combinedMid, combinedContext);

      if (combinedLines.length > 0) {
        merged[merged.length - 1] = {
          lines: combinedLines,
          startLineNum: combinedStart,
          endLineNum: combinedEnd,
        };
      }
    } else {
      merged.push(curr);
    }
  }

  return merged.map(({ lines, startLineNum }) => ({ lines, startLineNum }));
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
