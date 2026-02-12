import * as fs from 'fs';
import * as path from 'path';
import chalk from 'chalk';
import inquirer from 'inquirer';
import { SUCCESS_COLOR, INFO_COLOR, SECONDARY_COLOR, WARNING_COLOR } from '../utils/colors';

const CONTEXT_FILE_NAME = 'context.md';
const AI_REVIEW_DIR = '.ai-review';

const EXCLUDED_DIRS = ['node_modules', '.git', '.ai-review', 'dist', 'build', '.next', 'coverage'];
const EXCLUDED_FILES = ['REVIEW.md'];

function isExcludedPath(relativePath: string): boolean {
  const parts = relativePath.split(path.sep);
  return parts.some((part) => EXCLUDED_DIRS.includes(part));
}

export async function scanAndSaveProjectDocs(repoRoot: string): Promise<boolean> {
  let allEntries: string[];
  try {
    allEntries = fs.readdirSync(repoRoot, { recursive: true, encoding: 'utf-8' });
  } catch {
    console.log(chalk.hex(WARNING_COLOR)('Failed to scan for documentation files.'));
    return false;
  }

  let mdFiles = allEntries.filter((entry) => {
    if (!entry.endsWith('.md')) return false;
    if (isExcludedPath(entry)) return false;
    if (EXCLUDED_FILES.includes(path.basename(entry))) return false;
    return true;
  });

  if (mdFiles.length === 0) {
    console.log(chalk.hex(SECONDARY_COLOR)('No .md documentation files found in this project.\n'));
    return false;
  }

  mdFiles.sort();

  console.log(chalk.hex(INFO_COLOR)(`Found ${mdFiles.length} documentation file(s):\n`));

  const { selectedFiles } = await inquirer.prompt([
    {
      type: 'checkbox',
      name: 'selectedFiles',
      message: 'Select files to include as review context:',
      choices: mdFiles.map((f) => ({
        name: f,
        value: f,
        checked: false,
      })),
    },
  ]);

  if (selectedFiles.length === 0) {
    console.log(chalk.hex(SECONDARY_COLOR)('No files selected. Skipping documentation context.\n'));
    return false;
  }

  // Assemble context file
  const sections: string[] = [];

  for (const relPath of selectedFiles) {
    const fullPath = path.join(repoRoot, relPath);
    try {
      const content = fs.readFileSync(fullPath, 'utf-8');
      sections.push(`# File: ${relPath}\n\n${content.trim()}`);
    } catch {
      console.log(chalk.hex(WARNING_COLOR)(`⚠ Could not read: ${relPath}, skipping.`));
    }
  }

  if (sections.length === 0) {
    console.log(chalk.hex(WARNING_COLOR)('No files could be read. Skipping documentation context.\n'));
    return false;
  }

  // Write to .ai-review/context.md
  const contextDir = path.join(repoRoot, AI_REVIEW_DIR);
  if (!fs.existsSync(contextDir)) {
    fs.mkdirSync(contextDir, { recursive: true });
  }

  const contextPath = path.join(contextDir, CONTEXT_FILE_NAME);
  const contextContent = sections.join('\n\n---\n\n') + '\n';
  fs.writeFileSync(contextPath, contextContent, 'utf-8');

  console.log(chalk.hex(SUCCESS_COLOR)(`✓ Saved ${sections.length} doc(s) to ${AI_REVIEW_DIR}/${CONTEXT_FILE_NAME}\n`));
  return true;
}
