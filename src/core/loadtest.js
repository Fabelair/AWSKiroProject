/**
 * Dynamic validation in a hidden iframe (browser only), CORE-SBX-03 steps 3 and 4:
 * the frontend must say `ready`, stay error-free and keep sending heartbeats while a
 * scripted run is streamed to it.
 *
 * Limitation: a frontend that blocks the main thread forever cannot be interrupted by the
 * page. The watchdog and "Restore default" cover everything that is not a hard freeze.
 */

import { GameEngine } from './engine.js';
import { FrontendBridge } from './bridge.js';
import { createFrontendIframe } from './sandbox.js';

const READY_TIMEOUT_MS = 3000;
const SCRIPTED_RUN_MS = 2500;

/**
 * @param {{files: Record<string,string>}} bundle
 * @param {{ document?: Document, seed?: string }} [options]
 * @returns {Promise<string[]>} list of problems (empty = passed)
 */
export function runLoadTest(bundle, { document: doc = document, seed = 'loadtest' } = {}) {
  return new Promise((resolve) => {
    const problems = [];
    const engine = new GameEngine({ seed });
    const iframe = createFrontendIframe(bundle, doc);
    iframe.style.cssText = 'position:fixed;left:-9999px;width:640px;height:480px;visibility:hidden';
    let heartbeats = 0;
    let ticking = null;
    let finished = false;

    const bridge = new FrontendBridge({
      engine,
      send: (message) => iframe.contentWindow?.postMessage(message, '*'),
      onReady: () => {
        clearTimeout(readyTimer);
        engine.press();
        const started = performance.now();
        let last = started;
        ticking = setInterval(() => {
          const now = performance.now();
          engine.update(now - last);
          last = now;
          bridge.sendTick();
          if (now - started >= SCRIPTED_RUN_MS) finish();
        }, 16);
      },
      onRejected: (reason) => {
        problems.push(reason);
        finish();
      },
      onError: (message) => problems.push(`Runtime error: ${message}`),
      onHeartbeat: () => heartbeats++,
    });

    function finish() {
      if (finished) return;
      finished = true;
      clearInterval(ticking);
      clearTimeout(readyTimer);
      window.removeEventListener('message', listener);
      bridge.detach();
      iframe.remove();
      if (problems.length === 0 && heartbeats === 0) {
        problems.push('The frontend stopped responding during the test run.');
      }
      resolve(problems);
    }

    const listener = (event) => {
      if (event.source === iframe.contentWindow) bridge.handleMessage(event.data);
    };
    window.addEventListener('message', listener);
    const readyTimer = setTimeout(() => {
      problems.push('The frontend did not call FK.ready(...) within 3 seconds.');
      finish();
    }, READY_TIMEOUT_MS);
    doc.body.appendChild(iframe);
  });
}
