import inquirer from 'inquirer';
import { GEMINI_25_FLASH_MODEL, GEMINI_3_FLASH_MODEL } from '../config/constants';

/**
 * Interactive Google Gemini model selection prompt.
 */
export async function askGoogleModel(): Promise<string> {
  const { selectedModel } = await inquirer.prompt([
    {
      type: 'list',
      name: 'selectedModel',
      message: 'Select Google Gemini model:',
      choices: [
        {
          name: 'Gemini 3 Flash (Most balanced model)',
          value: GEMINI_3_FLASH_MODEL,
        },
        {
          name: 'Gemini 2.5 Flash (Best model in terms of price-performance)',
          value: GEMINI_25_FLASH_MODEL,
        },
      ],
    },
  ]);
  return selectedModel;
}
