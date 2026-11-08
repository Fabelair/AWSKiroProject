/**
 * Builds the sandboxed document a frontend runs in, and mounts it.
 *
 * Security layers: <iframe sandbox="allow-scripts"> (opaque origin: no parent DOM, no storage),
 * a Content-Security-Policy with connect-src 'none', and a message whitelist in the bridge.
 */

import { API_VERSION } from './api.js';

export const CSP = [
  "default-src 'none'",
  "script-src 'unsafe-inline'",
  "style-src 'unsafe-inline'",
  'img-src data: blob:',
  'media-src data: blob:',
  'font-src data:',
  "connect-src 'none'",
  "form-action 'none'",
  "base-uri 'none'",
].join('; ');

/** Script injected before any frontend code: gives the frontend the small `FK` API. */
export const SHIM = `(function () {
  var post = window.parent.postMessage.bind(window.parent);
  var handlers = [];
  function send(type, payload) { try { post({ fk: 1, type: type, payload: payload || {} }, '*'); } catch (e) {} }
  window.addEventListener('message', function (event) {
    var data = event.data;
    if (event.source !== window.parent || !data || data.fk !== 1) return;
    for (var i = 0; i < handlers.length; i++) {
      try { handlers[i](data.type, data.payload); }
      catch (err) { send('error', { message: String((err && err.message) || err) }); }
    }
  });
  window.FK = {
    apiVersion: '${API_VERSION}',
    send: send,
    onMessage: function (handler) { handlers.push(handler); },
    ready: function (info) {
      info = info || {};
      send('ready', { apiVersion: '${API_VERSION}', name: info.name, version: info.version });
    }
  };
  window.addEventListener('error', function (e) { send('error', { message: String(e.message || 'script error') }); });
  window.addEventListener('unhandledrejection', function (e) { send('error', { message: 'unhandled promise rejection' }); });
  setInterval(function () { send('heartbeat'); }, 500);
})();`;

const escapeScript = (code) => code.replace(/<\/script/gi, '<\\/script');

/**
 * Produces the final srcdoc: inlines the bundle's CSS/JS, adds the CSP and the FK shim.
 * @param {{files: Record<string,string>}} bundle a bundle that passed validateBundle
 */
export function buildSrcdoc(bundle) {
  const { files } = bundle;
  let html = files['index.html'];

  html = html.replace(/<link\b[^>]*href\s*=\s*["']([^"']+\.css)["'][^>]*>/gi, (tag, href) =>
    href in files ? `<style>${files[href]}</style>` : '',
  );
  html = html.replace(
    /<script\b[^>]*\bsrc\s*=\s*["']([^"']+\.js)["'][^>]*>\s*<\/script>/gi,
    (tag, src) => (src in files ? `<script>${escapeScript(files[src])}</script>` : ''),
  );

  const injected =
    `<meta http-equiv="Content-Security-Policy" content="${CSP}">` +
    `<script>${escapeScript(SHIM)}</script>`;
  if (/<head[^>]*>/i.test(html)) return html.replace(/<head[^>]*>/i, (m) => m + injected);
  return `<!doctype html><html><head>${injected}</head><body>${html}</body></html>`;
}

/**
 * Creates the sandboxed iframe (browser only).
 * @returns {HTMLIFrameElement}
 */
export function createFrontendIframe(bundle, documentRef = document) {
  const iframe = documentRef.createElement('iframe');
  iframe.setAttribute('sandbox', 'allow-scripts');
  iframe.setAttribute('allow', 'autoplay');
  iframe.setAttribute('title', 'Game frontend');
  iframe.srcdoc = buildSrcdoc(bundle);
  return iframe;
}
