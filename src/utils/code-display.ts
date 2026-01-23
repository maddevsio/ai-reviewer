import chalk from 'chalk';
import { ADDED_LINE_BG, REMOVED_LINE_BG, ADDED_LINE_TEXT, REMOVED_LINE_TEXT, SECONDARY_COLOR, WARNING_COLOR } from './colors';

/**
 * Display code context with line numbers and diff colors
 */
export function displayCodeContext(codeContext: string[], startLineNum: number): void {
  console.log(chalk.hex(WARNING_COLOR)('━'.repeat(70)));

  let lineNum = startLineNum;

  codeContext.forEach((line) => {
    const lineNumStr = String(lineNum).padStart(4, ' ');

    if (line.startsWith('+')) {
      console.log(chalk.hex(SECONDARY_COLOR)(lineNumStr + ' │ ') + chalk.bgHex(ADDED_LINE_BG).hex(ADDED_LINE_TEXT)(line));
      lineNum++;
    } else if (line.startsWith('-')) {
      console.log(chalk.hex(SECONDARY_COLOR)(lineNumStr + ' │ ') + chalk.bgHex(REMOVED_LINE_BG).hex(REMOVED_LINE_TEXT)(line));
    } else {
      console.log(chalk.hex(SECONDARY_COLOR)(lineNumStr + ' │ ' + line));
      lineNum++;
    }
  });

  console.log(chalk.hex(WARNING_COLOR)('━'.repeat(70)));
}
