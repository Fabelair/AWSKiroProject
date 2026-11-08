/**
 * Frontend API: the ONLY channel between the Core and a frontend.
 * Messages travel with window.postMessage and look like { fk: 1, type, payload }.
 */

export const API_VERSION = '1.0';
export const MESSAGE_MARKER = 1;

export const CORE_TO_FRONTEND = Object.freeze([
  'init',
  'state',
  'tick',
  'press',
  'cueResult',
  'gameOver',
  'settings',
]);

/** Everything a frontend is allowed to say. Anything else is ignored. */
export const FRONTEND_TO_CORE = Object.freeze(['ready', 'error', 'heartbeat']);

export function isApiVersionSupported(version) {
  const major = String(version ?? '').split('.')[0];
  return major === API_VERSION.split('.')[0];
}

/** Wraps a Core -> frontend message. */
export function createMessage(type, payload = {}) {
  return { fk: MESSAGE_MARKER, type, payload };
}

/**
 * Validates a raw message coming from a frontend.
 * @returns {{type:string, payload:object} | null} null when unknown or malformed
 */
export function parseFrontendMessage(data) {
  if (!data || typeof data !== 'object' || data.fk !== MESSAGE_MARKER) return null;
  if (!FRONTEND_TO_CORE.includes(data.type)) return null;
  const payload = data.payload && typeof data.payload === 'object' ? data.payload : {};
  if (data.type === 'error') {
    return { type: 'error', payload: { message: String(payload.message ?? '').slice(0, 500) } };
  }
  if (data.type === 'ready') {
    return {
      type: 'ready',
      payload: {
        apiVersion: String(payload.apiVersion ?? ''),
        name: String(payload.name ?? 'Unnamed frontend').slice(0, 80),
        version: String(payload.version ?? '').slice(0, 20),
      },
    };
  }
  return { type: 'heartbeat', payload: {} };
}
