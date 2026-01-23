import execa from 'execa';
import chalk from 'chalk';
import { platform } from 'os';
import { ERROR_COLOR, WARNING_COLOR, HIGHLIGHT_COLOR, SECONDARY_COLOR } from './colors';

export async function checkGitHubCLI(): Promise<{ installed: boolean; authenticated: boolean }> {
  // Check if gh is installed
  try {
    await execa('gh', ['--version']);
  } catch (error) {
    return { installed: false, authenticated: false };
  }

  // Check if authenticated
  try {
    const { exitCode } = await execa('gh', ['auth', 'status']);
    return { installed: true, authenticated: exitCode === 0 };
  } catch (error) {
    return { installed: true, authenticated: false };
  }
}

export function showGitHubCLIInstallInstructions(): void {
  console.log(chalk.hex(ERROR_COLOR)('\n✗ GitHub CLI (gh) not found\n'));
  console.log('To use GitHub integration, please install the GitHub CLI:\n');

  const os = platform();

  if (os === 'darwin') {
    console.log(chalk.hex(HIGHLIGHT_COLOR)('macOS:'));
    console.log('  brew install gh\n');
  } else if (os === 'linux') {
    console.log(chalk.hex(HIGHLIGHT_COLOR)('Linux:'));
    console.log('  # Debian/Ubuntu');
    console.log('  sudo apt install gh\n');
    console.log('  # Fedora/CentOS');
    console.log('  sudo dnf install gh\n');
    console.log('  # Or see: https://github.com/cli/cli/blob/trunk/docs/install_linux.md\n');
  } else if (os === 'win32') {
    console.log(chalk.hex(HIGHLIGHT_COLOR)('Windows:'));
    console.log('  winget install --id GitHub.cli\n');
    console.log('  # Or download from: https://cli.github.com\n');
  } else {
    console.log(chalk.hex(HIGHLIGHT_COLOR)('Installation:'));
    console.log('  Visit: https://cli.github.com\n');
  }

  console.log(chalk.hex(SECONDARY_COLOR)('After installation, run:'), 'gh auth login');
  console.log(chalk.hex(SECONDARY_COLOR)('Then try:'), 'ai-review pr\n');
}

export function showGitHubCLIAuthInstructions(): void {
  console.log(chalk.hex(WARNING_COLOR)('\n⚠ GitHub CLI not authenticated\n'));
  console.log('Please authenticate with GitHub:\n');
  console.log(chalk.hex(HIGHLIGHT_COLOR)('  gh auth login\n'));
  console.log(chalk.hex(SECONDARY_COLOR)('Then try:'), 'ai-review pr\n');
}
