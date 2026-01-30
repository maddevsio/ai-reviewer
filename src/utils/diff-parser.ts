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
