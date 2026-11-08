/**
 * Static validation of a frontend bundle before it may be loaded (CORE-SBX-03).
 *
 * This is a first line of defence that gives the AI clear, fixable errors. The real security
 * boundary is the sandboxed, network-less iframe (see sandbox.js), not these patterns.
 *
 * Bundle format: { name: string, files: { 'index.html': '...', 'style.css': '...', 'main.js': '...' } }
 */

export const LIMITS = Object.freeze({
  maxTotalBytes: 2 * 1024 * 1024,
  maxFiles: 20,
  allowedExtensions: ['html', 'css', 'js'],
  entryFile: 'index.html',
});

const FILE_NAME = /^[A-Za-z0-9_-]+\.(html|css|js)$/;

/** [regex, message] pairs applied to every file. */
const FORBIDDEN = [
  [/\bfetch\s*\(/, 'network call: fetch()'],
  [/\bXMLHttpRequest\b/, 'network call: XMLHttpRequest'],
  [/\bWebSocket\b/, 'network call: WebSocket'],
  [/\bEventSource\b/, 'network call: EventSource'],
  [/\bsendBeacon\b/, 'network call: sendBeacon'],
  [/\bimportScripts\b/, 'importScripts is not allowed'],
  [/\bnew\s+(Shared)?Worker\b/, 'Workers are not allowed'],
  [/\bserviceWorker\b/, 'service workers are not allowed'],
  [/\beval\s*\(/, 'eval() is not allowed'],
  [/\bnew\s+Function\b|\bFunction\s*\(/, 'Function constructor is not allowed'],
  [/\bimport\s*\(/, 'dynamic import() is not allowed'],
  [/^\s*import\s[^;]*from\s/m, 'ES module imports are not allowed'],
  [/\blocalStorage\b|\bsessionStorage\b|\bindexedDB\b|document\s*\.\s*cookie/, 'browser storage is not available'],
  [/\bwindow\s*\.\s*(parent|top|opener|frames)\b|\b(parent|top|opener)\s*(\.|\[)/, 'access to the parent/top window is not allowed (use FK.send)'],
  [/\blocation\s*(\.|=)/, 'navigation / location access is not allowed'],
  [/\bdocument\s*\.\s*write\b/, 'document.write is not allowed'],
  [/<\s*(iframe|object|embed|form|base|link\b(?![^>]*rel\s*=\s*["']stylesheet["']))/i, 'forbidden HTML element (iframe/object/embed/form/base/non-stylesheet link)'],
  [/<\s*meta[^>]+http-equiv/i, 'meta http-equiv is not allowed'],
  [/@import/i, 'CSS @import is not allowed'],
];

/** Removes harmless SVG/XML namespace URLs before scanning for external URLs. */
function stripNamespaces(text) {
  return text.replace(/https?:\/\/www\.w3\.org\/[A-Za-z0-9/._-]*/g, '');
}

/**
 * @param {unknown} bundle
 * @returns {{ ok: boolean, errors: string[] }}
 */
export function validateBundle(bundle) {
  const errors = [];
  if (!bundle || typeof bundle !== 'object') return { ok: false, errors: ['Bundle must be an object.'] };
  const { files } = /** @type {any} */ (bundle);
  if (!files || typeof files !== 'object' || Array.isArray(files)) {
    return { ok: false, errors: ['Bundle must contain a "files" object.'] };
  }
  const names = Object.keys(files);
  if (names.length === 0) errors.push('Bundle has no files.');
  if (names.length > LIMITS.maxFiles) errors.push(`Too many files (max ${LIMITS.maxFiles}).`);
  if (!names.includes(LIMITS.entryFile)) errors.push(`Missing entry file ${LIMITS.entryFile}.`);

  let totalBytes = 0;
  for (const name of names) {
    const content = files[name];
    if (!FILE_NAME.test(name)) {
      errors.push(`File name "${name}" is not allowed (only plain names ending in .html, .css or .js).`);
      continue;
    }
    if (typeof content !== 'string') {
      errors.push(`File "${name}" must be text.`);
      continue;
    }
    totalBytes += new TextEncoder().encode(content).length;
    const scanned = stripNamespaces(content);
    for (const [pattern, message] of FORBIDDEN) {
      if (pattern.test(scanned)) errors.push(`${name}: ${message}`);
    }
    if (/https?:\/\/|(^|[\s"'(=])\/\/[A-Za-z0-9.-]+\.[a-z]{2,}/i.test(scanned)) {
      errors.push(`${name}: external URLs are not allowed (everything must be bundled or drawn).`);
    }
  }
  if (totalBytes > LIMITS.maxTotalBytes) {
    errors.push(`Bundle is ${totalBytes} bytes; the limit is ${LIMITS.maxTotalBytes}.`);
  }

  const entry = files[LIMITS.entryFile];
  if (typeof entry === 'string') {
    for (const match of entry.matchAll(/(?:src|href)\s*=\s*["']([^"']+)["']/gi)) {
      const target = match[1];
      if (target.startsWith('data:') || target.startsWith('#')) continue;
      if (!names.includes(target)) errors.push(`index.html references "${target}", which is not in the bundle.`);
    }
    if (!/FK\s*\.\s*ready\b/.test(names.map((n) => files[n]).join('\n'))) {
      errors.push('The frontend never calls FK.ready(...), so the Core would never start it.');
    }
  }
  return { ok: errors.length === 0, errors };
}
