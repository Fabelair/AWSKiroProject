/**
 * Strict parser for the AI's answer (CHAT-06). Anything outside the format is ignored.
 *
 * Format:
 *   === NAME: My skin ===
 *   === FILE: index.html ===
 *   ...contents...
 *   === END FILE ===
 *   (more files)
 * or a refusal:
 *   === DECLINED: reason ===
 */

const DECLINED = /^=== DECLINED: (.+?) ===\s*$/m;
const NAME = /^=== NAME: (.+?) ===\s*$/m;
const FILE = /^=== FILE: ([^\n=]+?) ===[ \t]*\n([\s\S]*?)\n=== END FILE ===[ \t]*$/gm;

/**
 * @param {string} text
 * @returns {{ declined?: string, bundle?: {name:string, files:Record<string,string>}, errors: string[] }}
 */
export function parseAiResponse(text) {
  const source = String(text ?? '').replace(/\r\n/g, '\n');
  const declined = DECLINED.exec(source);
  const files = {};
  for (const match of source.matchAll(FILE)) files[match[1].trim()] = match[2];

  if (declined && Object.keys(files).length === 0) {
    return { declined: declined[1].trim(), errors: [] };
  }
  if (Object.keys(files).length === 0) {
    return {
      errors: [
        'No files found. Reply only in the required format: "=== FILE: name ===" ... "=== END FILE ===" blocks.',
      ],
    };
  }
  const name = NAME.exec(source)?.[1].trim() || 'AI frontend';
  return { bundle: { name, files }, errors: [] };
}

/** Formats a bundle in the same format (used when sending the current frontend to the AI). */
export function formatBundle(bundle) {
  const parts = [`=== NAME: ${bundle.name} ===`];
  for (const [name, content] of Object.entries(bundle.files)) {
    parts.push(`=== FILE: ${name} ===\n${content}\n=== END FILE ===`);
  }
  return parts.join('\n');
}
