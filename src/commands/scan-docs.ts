import { Command } from 'commander';
import * as fs from 'fs';
import * as path from 'path';
import chalk from 'chalk';
import inquirer from 'inquirer';
import { SUCCESS_COLOR, INFO_COLOR, SECONDARY_COLOR, WARNING_COLOR, ERROR_COLOR } from '../config/colors';
import { findGitRepoRoot } from '../utils/git';

const CONTEXT_FILE_NAME = 'context.md';
const MANIFEST_FILE_NAME = 'docs-manifest.json';
const AI_REVIEW_DIR = '.ai-review';

const EXCLUDED_DIRS = ['node_modules', '.git', '.ai-review', 'dist', 'build', '.next', 'coverage'];
const EXCLUDED_FILES = ['REVIEW.md'];

interface DocsManifest {
  selected: string[];
  skipped: string[];
}

function isExcludedPath(relativePath: string): boolean {
  const parts = relativePath.split(path.sep);
  return parts.some((part) => EXCLUDED_DIRS.includes(part));
}

function loadManifest(repoRoot: string): DocsManifest | null {
  const manifestPath = path.join(repoRoot, AI_REVIEW_DIR, MANIFEST_FILE_NAME);
  if (!fs.existsSync(manifestPath)) {
    return null;
  }
  try {
    const content = fs.readFileSync(manifestPath, 'utf-8');
    return JSON.parse(content);
  } catch {
    return null;
  }
}

function saveManifest(repoRoot: string, manifest: DocsManifest): void {
  const contextDir = path.join(repoRoot, AI_REVIEW_DIR);
  if (!fs.existsSync(contextDir)) {
    fs.mkdirSync(contextDir, { recursive: true });
  }
  const manifestPath = path.join(contextDir, MANIFEST_FILE_NAME);
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf-8');
}

function buildChoices(
  mdFiles: string[],
  manifest: DocsManifest | null
): Array<{ name: string; value: string; checked: boolean } | inquirer.Separator> {
  // First run — flat list, no sections
  if (!manifest) {
    return mdFiles.map((f) => ({ name: f, value: f, checked: false }));
  }

  const selectedSet = new Set(manifest.selected);
  const skippedSet = new Set(manifest.skipped);

  const newFiles: string[] = [];
  const previouslyIncluded: string[] = [];
  const previouslySkipped: string[] = [];

  for (const f of mdFiles) {
    if (selectedSet.has(f)) {
      previouslyIncluded.push(f);
    } else if (skippedSet.has(f)) {
      previouslySkipped.push(f);
    } else {
      newFiles.push(f);
    }
  }

  // Count how many non-empty categories we have
  const nonEmptyCount = [newFiles, previouslyIncluded, previouslySkipped].filter((arr) => arr.length > 0).length;

  // Single category — no separators needed
  if (nonEmptyCount === 1) {
    if (previouslyIncluded.length > 0) {
      return previouslyIncluded.map((f) => ({ name: f, value: f, checked: true }));
    }
    if (newFiles.length > 0) {
      return newFiles.map((f) => ({ name: f, value: f, checked: false }));
    }
    return previouslySkipped.map((f) => ({ name: f, value: f, checked: false }));
  }

  // Multiple categories — use separators
  const choices: Array<{ name: string; value: string; checked: boolean } | inquirer.Separator> = [];

  if (newFiles.length > 0) {
    choices.push(new inquirer.Separator(chalk.hex(INFO_COLOR)('── New files ──────────────────')));
    for (const f of newFiles) {
      choices.push({ name: f, value: f, checked: false });
    }
  }

  if (previouslyIncluded.length > 0) {
    choices.push(new inquirer.Separator(chalk.hex(SUCCESS_COLOR)('── Previously included ────────')));
    for (const f of previouslyIncluded) {
      choices.push({ name: f, value: f, checked: true });
    }
  }

  if (previouslySkipped.length > 0) {
    choices.push(new inquirer.Separator(chalk.hex(SECONDARY_COLOR)('── Previously skipped ─────────')));
    for (const f of previouslySkipped) {
      choices.push({ name: f, value: f, checked: false });
    }
  }

  return choices;
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

  // Load existing manifest for re-run awareness
  const manifest = loadManifest(repoRoot);

  // Report removed files (were in manifest but no longer exist on disk)
  if (manifest) {
    const scannedSet = new Set(mdFiles);
    const allManifestFiles = [...manifest.selected, ...manifest.skipped];
    const removedFiles = allManifestFiles.filter((f) => !scannedSet.has(f));
    for (const f of removedFiles) {
      console.log(chalk.hex(SECONDARY_COLOR)(`  Removed since last scan: ${f}`));
    }
    if (removedFiles.length > 0) {
      console.log();
    }
  }

  console.log(chalk.hex(INFO_COLOR)(`Found ${mdFiles.length} documentation file(s):\n`));

  const choices = buildChoices(mdFiles, manifest);

  const { selectedFiles } = await inquirer.prompt([
    {
      type: 'checkbox',
      name: 'selectedFiles',
      message: 'Select files to include as review context:',
      choices,
    },
  ]);

  if (selectedFiles.length === 0) {
    console.log(chalk.hex(SECONDARY_COLOR)('No files selected. Skipping documentation context.\n'));
    // Still save manifest so skipped files are remembered
    saveManifest(repoRoot, { selected: [], skipped: mdFiles });
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
      console.log(chalk.hex(WARNING_COLOR)(`Could not read: ${relPath}, skipping.`));
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

  // Save manifest
  const selectedSet = new Set(selectedFiles as string[]);
  const skipped = mdFiles.filter((f) => !selectedSet.has(f));
  saveManifest(repoRoot, { selected: selectedFiles, skipped });

  // Summary
  if (manifest) {
    const previousSelectedSet = new Set(manifest.selected);
    const newlyAdded = (selectedFiles as string[]).filter((f: string) => !previousSelectedSet.has(f));
    const kept = (selectedFiles as string[]).filter((f: string) => previousSelectedSet.has(f));
    const parts: string[] = [];
    if (newlyAdded.length > 0) parts.push(`${newlyAdded.length} new`);
    if (kept.length > 0) parts.push(`${kept.length} unchanged`);
    const breakdown = parts.length > 0 ? ` (${parts.join(', ')})` : '';
    console.log(chalk.hex(SUCCESS_COLOR)(`\u2713 Saved ${sections.length} doc(s) to ${AI_REVIEW_DIR}/${CONTEXT_FILE_NAME}${breakdown}\n`));
  } else {
    console.log(chalk.hex(SUCCESS_COLOR)(`\u2713 Saved ${sections.length} doc(s) to ${AI_REVIEW_DIR}/${CONTEXT_FILE_NAME}\n`));
  }

  return true;
}

export const scanDocsCommand = new Command('scan-docs')
  .description('Scan project for documentation files (.md) to use as review context')
  .action(async () => {
    const repoRoot = findGitRepoRoot();
    if (!repoRoot) {
      console.log(chalk.hex(ERROR_COLOR)('Not in a git repository. Documentation scanning requires a local project.'));
      process.exit(1);
    }

    await scanAndSaveProjectDocs(repoRoot);
  });
