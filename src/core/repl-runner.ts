import inquirer from 'inquirer';
import chalk from 'chalk';
import { reviewPullRequest, ReplSession } from './reviewer';
import { INFO_COLOR, SUCCESS_COLOR, SECONDARY_COLOR, WARNING_COLOR, ERROR_COLOR } from '../config/colors';
import { SEPARATOR_CHAR, SEPARATOR_WIDTH } from '../config/constants';
import { isValidStrictness } from '../utils/strictness';
import { formatDistanceToNow } from '../utils/date';
import type { ReviewStrictness } from '../config/manager';

interface ParsedReplInput {
  command: string;
  id?: string;
  flags: {
    strictness?: ReviewStrictness;
    post: boolean;
    dryRun: boolean;
  };
}

function parseReplInput(line: string): ParsedReplInput | null {
  const trimmed = line.trim();
  if (!trimmed) return null;

  const tokens = trimmed.split(/\s+/);
  const command = tokens[0].toLowerCase();
  const rest = tokens.slice(1);

  const flags: ParsedReplInput['flags'] = { post: false, dryRun: false };
  let id: string | undefined;

  for (let i = 0; i < rest.length; i++) {
    const token = rest[i];
    if (token === '--post') {
      flags.post = true;
    } else if (token === '--dry-run') {
      flags.dryRun = true;
    } else if (token === '-s' || token === '--strictness') {
      const next = rest[i + 1];
      if (next && isValidStrictness(next)) {
        flags.strictness = next as ReviewStrictness;
        i++;
      } else {
        console.log(chalk.hex(ERROR_COLOR)(
          `Invalid strictness value: "${next}". Valid: easy, normal, balanced, strict, pedantic`
        ));
        return null;
      }
    } else if (!token.startsWith('-') && !id) {
      id = token;
    }
  }

  return { command, id, flags };
}

async function handleListCommand(session: ReplSession): Promise<void> {
  try {
    const prs = await session.platform.listPullRequests();
    if (prs.length === 0) {
      console.log(chalk.hex(WARNING_COLOR)('No open pull requests found.'));
      return;
    }
    console.log(chalk.hex(SUCCESS_COLOR)(`\n${prs.length} open pull request(s):\n`));
    for (const pr of prs) {
      console.log(
        chalk.hex(SECONDARY_COLOR)(`  #${pr.number}`) +
        ` ${pr.title} ` +
        chalk.hex(SECONDARY_COLOR)(`(${pr.author.username}) · updated ${formatDistanceToNow(pr.updatedAt)}`)
      );
    }
    console.log();
  } catch (err: any) {
    console.error(chalk.hex(ERROR_COLOR)(`Error listing PRs: ${err.message}`));
  }
}

async function handlePrCommand(parsed: ParsedReplInput, session: ReplSession): Promise<void> {
  try {
    await reviewPullRequest(parsed.id, parsed.flags, session);
  } catch (err: any) {
    console.error(chalk.hex(ERROR_COLOR)(`\nError: ${err.message}`));
  }
}

function handleHelpCommand(): void {
  console.log(chalk.hex(INFO_COLOR)('\nAvailable commands:\n'));
  const rows: [string, string][] = [
    ['pr [id]',             'Review a pull request (omit id for interactive selection)'],
    ['pr [id] -s <level>',  'Review with strictness: easy, normal, balanced, strict, pedantic'],
    ['pr [id] --post',      'Auto-post accepted comments without confirmation'],
    ['pr [id] --dry-run',   'Preview comments without posting'],
    ['list',                'List open pull requests'],
    ['help',                'Show this help message'],
    ['clear',               'Clear the terminal'],
    ['exit / quit / q',     'Exit the REPL'],
  ];
  for (const [cmd, desc] of rows) {
    console.log(`  ${chalk.bold(cmd.padEnd(30))} ${chalk.hex(SECONDARY_COLOR)(desc)}`);
  }
  console.log();
}

export async function runReplSession(session: ReplSession): Promise<void> {
  const platformName = session.platform.getName();
  const providerName = session.aiProvider.getName();

  process.stdout.write('\x1Bc');
  console.log(chalk.hex(WARNING_COLOR)(SEPARATOR_CHAR.repeat(SEPARATOR_WIDTH)));
  console.log(chalk.bold(`  AI Review REPL`) + chalk.hex(SECONDARY_COLOR)(` · ${platformName} · ${providerName}`));
  console.log(chalk.hex(SECONDARY_COLOR)("  Type 'help' for commands, 'exit' to quit."));
  console.log(chalk.hex(WARNING_COLOR)(SEPARATOR_CHAR.repeat(SEPARATOR_WIDTH)));
  console.log();

  // Use chalk in the prompt message — inquirer renders it correctly
  const promptMessage =
    chalk.hex(SECONDARY_COLOR)(`(${platformName.toLowerCase()})`) +
    ' ' +
    chalk.bold('ai-review>');

  while (true) {
    let raw: string;

    try {
      const { line } = await inquirer.prompt([{
        type: 'input',
        name: 'line',
        message: promptMessage,
        prefix: '',
      }]);
      raw = (line as string).trim();
    } catch {
      // Ctrl+C or EOF
      break;
    }

    if (!raw) continue;

    const parsed = parseReplInput(raw);
    if (!parsed) continue;

    const { command } = parsed;

    if (command === 'exit' || command === 'quit' || command === 'q') break;

    if (command === 'clear') {
      process.stdout.write('\x1Bc');
      continue;
    }

    if (command === 'help') {
      handleHelpCommand();
      continue;
    }

    if (command === 'list') {
      await handleListCommand(session);
      continue;
    }

    if (command === 'pr') {
      await handlePrCommand(parsed, session);
      continue;
    }

    console.log(chalk.hex(WARNING_COLOR)(`Unknown command: "${command}". Type 'help' for available commands.`));
  }

  console.log(chalk.hex(SECONDARY_COLOR)('\nGoodbye!\n'));
  process.exit(0);
}
