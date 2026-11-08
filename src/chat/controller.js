/**
 * Chat flow (CHAT-08/09): prompt -> AI -> parse -> validate -> (retry with errors) -> result.
 * Pure orchestration; the provider and the dynamic validator are injected, so it is testable.
 */

import { checkRuleChangeRequest } from './guard.js';
import { parseAiResponse } from './parser.js';
import { buildSystemPrompt, buildUserMessage } from './prompt.js';
import { validateBundle } from '../core/validator.js';

export const MAX_RETRIES = 2;

/**
 * @param {object} options
 * @param {string} options.prompt
 * @param {{name:string, files:Record<string,string>}|null} [options.currentBundle]
 * @param {{generate: Function, needsKey: boolean}} options.provider
 * @param {string} [options.apiKey]
 * @param {string} [options.model]
 * @param {(bundle: object) => Promise<string[]>} [options.dynamicValidate] returns error list
 * @param {AbortSignal} [options.signal]
 * @param {(message: string) => void} [options.onProgress]
 * @returns {Promise<{status:'ok'|'declined'|'invalid'|'error', message?:string, bundle?:object, errors?:string[], attempts:number}>}
 */
export async function generateFrontend({
  prompt,
  currentBundle = null,
  provider,
  apiKey = '',
  model,
  dynamicValidate,
  signal,
  onProgress = () => {},
}) {
  const guard = checkRuleChangeRequest(prompt);
  if (guard.declined) return { status: 'declined', message: guard.message, attempts: 0 };
  if (provider.needsKey && !apiKey) {
    return { status: 'error', message: 'Enter your API key first (or use the offline demo).', attempts: 0 };
  }

  const system = buildSystemPrompt();
  const messages = [{ role: 'user', content: buildUserMessage(prompt, currentBundle) }];
  let lastErrors = [];

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    onProgress(attempt === 0 ? 'Asking the AI...' : `Fixing problems (retry ${attempt}/${MAX_RETRIES})...`);
    let text;
    try {
      text = await provider.generate({ apiKey, model, system, messages, signal });
    } catch (error) {
      if (error?.name === 'AbortError') return { status: 'error', message: 'Cancelled.', attempts: attempt };
      return { status: 'error', message: error?.message ?? 'The AI request failed.', attempts: attempt };
    }

    const parsed = parseAiResponse(text);
    if (parsed.declined) {
      return { status: 'declined', message: parsed.declined, attempts: attempt + 1 };
    }

    let errors = parsed.errors;
    if (errors.length === 0) {
      onProgress('Checking the result...');
      errors = validateBundle(parsed.bundle).errors;
      if (errors.length === 0 && dynamicValidate) errors = await dynamicValidate(parsed.bundle);
      if (errors.length === 0) return { status: 'ok', bundle: parsed.bundle, attempts: attempt + 1 };
    }

    lastErrors = errors;
    messages.push({ role: 'assistant', content: String(text) });
    messages.push({
      role: 'user',
      content: `Your frontend was rejected:\n- ${errors.join('\n- ')}\nFix these problems and return ALL files again in the required format.`,
    });
  }
  return {
    status: 'invalid',
    message: 'The AI could not produce a frontend that passes the checks.',
    errors: lastErrors,
    attempts: MAX_RETRIES + 1,
  };
}
