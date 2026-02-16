import chalk from 'chalk';
import { ADDED_LINE_BG, REMOVED_LINE_BG, ADDED_LINE_TEXT, REMOVED_LINE_TEXT, SECONDARY_COLOR, WARNING_COLOR } from './colors';
import { SEPARATOR_CHAR, SEPARATOR_WIDTH } from '../config/constants';
import type { CodeRegion } from './diff-parser';

/**
 * Render a single region's lines with line numbers and diff colors
 */
function renderRegionLines(codeContext: string[], startLineNum: number): void {
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
}

/**
 * Display code context with line numbers and diff colors
 */
export function displayCodeContext(codeContext: string[], startLineNum: number): void {
  console.log(chalk.hex(WARNING_COLOR)(SEPARATOR_CHAR.repeat(SEPARATOR_WIDTH)));
  renderRegionLines(codeContext, startLineNum);
  console.log(chalk.hex(WARNING_COLOR)(SEPARATOR_CHAR.repeat(SEPARATOR_WIDTH)));
}

/**
 * Display multiple code regions with ... separator between them
 */
export function displayMultiRegionCodeContext(regions: CodeRegion[]): void {
  console.log(chalk.hex(WARNING_COLOR)(SEPARATOR_CHAR.repeat(SEPARATOR_WIDTH)));

  regions.forEach((region, index) => {
    renderRegionLines(region.lines, region.startLineNum);

    if (index < regions.length - 1) {
      console.log(chalk.hex(SECONDARY_COLOR)('  ...'));
    }
  });

  console.log(chalk.hex(WARNING_COLOR)(SEPARATOR_CHAR.repeat(SEPARATOR_WIDTH)));
}
