import vm from 'node:vm';

/**
 * Runs a frontend bundle's main.js in a Node vm with a recording canvas stub and the FK API.
 * It lets tests drive a REAL frontend with REAL Core messages without a browser.
 */
export function createVmFrontend(bundle, { onSend = () => {} } = {}) {
  const handlers = [];
  const calls = [];
  const texts = [];
  const rafQueue = [];
  let nowMs = 0;

  const gradient = { addColorStop() {} };
  const ctx = new Proxy({}, {
    get(target, prop) {
      if (prop in target) return target[prop];
      if (prop === 'createLinearGradient') return () => gradient;
      if (prop === 'fillText') return (text, x, y) => { texts.push(String(text)); calls.push(['fillText', text, x, y]); };
      return (...args) => { calls.push([String(prop), ...args]); };
    },
    set(target, prop, value) { target[prop] = value; return true; },
  });
  const canvas = { width: 1024, height: 768, clientWidth: 1024, clientHeight: 768, getContext: () => ctx };

  const sandbox = {
    document: { getElementById: () => canvas },
    window: { devicePixelRatio: 1 },
    performance: { now: () => nowMs },
    requestAnimationFrame: (callback) => rafQueue.push(callback),
    FK: {
      apiVersion: '1.0',
      onMessage: (handler) => handlers.push(handler),
      send: (type, payload) => onSend({ fk: 1, type, payload }),
      ready: (info) => onSend({ fk: 1, type: 'ready', payload: { apiVersion: '1.0', ...info } }),
    },
    Math, JSON, Object, Array, Number, String, Set, Map, Infinity, console,
  };
  vm.createContext(sandbox);
  vm.runInContext(bundle.files['main.js'], sandbox, { filename: 'main.js' });

  return {
    calls,
    texts,
    /** Deliver a Core message to the frontend. */
    receive(message) {
      for (const handler of handlers) handler(message.type, message.payload);
    },
    /** Run one animation frame at the given time. */
    frame(ms = nowMs + 16) {
      nowMs = ms;
      const queued = rafQueue.splice(0);
      for (const callback of queued) callback(ms);
      return this;
    },
    clearRecords() { calls.length = 0; texts.length = 0; },
    get nowMs() { return nowMs; },
  };
}
