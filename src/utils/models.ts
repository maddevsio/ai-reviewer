import inquirer from 'inquirer';
import { GEMINI_25_FLASH_MODEL, GEMINI_3_FLASH_MODEL, GROQ_LLAMA_70B_MODEL, GROQ_LLAMA_4_SCOUT_MODEL, GROQ_LLAMA_8B_MODEL } from '../config/constants';

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

/**
 * Interactive Groq model selection prompt.
 */
export async function askGroqModel(): Promise<string> {
  const { selectedModel } = await inquirer.prompt([
    {
      type: 'list',
      name: 'selectedModel',
      message: 'Select Groq model:',
      choices: [
        {
          name: 'Llama 3.3 70B Versatile (Best quality)',
          value: GROQ_LLAMA_70B_MODEL,
        },
        {
          name: 'Llama 4 Scout 17B (Best for large PRs)',
          value: GROQ_LLAMA_4_SCOUT_MODEL,
        },
        {
          name: 'Llama 3.1 8B Instant (Best for frequent reviews)',
          value: GROQ_LLAMA_8B_MODEL,
        },
      ],
    },
  ]);
  return selectedModel;
}
