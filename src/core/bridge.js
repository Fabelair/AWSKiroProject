/**
 * Connects a GameEngine to one frontend. Sends read-only data, accepts only
 * `ready`, `error` and `heartbeat` back. Anything else is ignored.
 */

import { RULEBOOK } from './rulebook.js';
import { API_VERSION, createMessage, isApiVersionSupported, parseFrontendMessage } from './api.js';

export class FrontendBridge {
  /**
   * @param {object} options
   * @param {import('./engine.js').GameEngine} options.engine
   * @param {(message: object) => void} options.send posts a message to the frontend
   * @param {(info: object) => void} [options.onReady]
   * @param {(reason: string) => void} [options.onRejected]
   * @param {(message: string) => void} [options.onError]
   * @param {() => void} [options.onHeartbeat]
   */
  constructor({ engine, send, onReady, onRejected, onError, onHeartbeat }) {
    this.engine = engine;
    this.send = send;
    this.onReady = onReady;
    this.onRejected = onRejected;
    this.onError = onError;
    this.onHeartbeat = onHeartbeat;
    this.ready = false;
    this.muted = false;
    this.unsubscribe = [
      engine.on('state', (payload) => this.#forward('state', payload)),
      engine.on('press', (payload) => this.#forward('press', payload)),
      engine.on('cueResult', (payload) => this.#forward('cueResult', payload)),
      engine.on('gameOver', (payload) => this.#forward('gameOver', payload)),
    ];
  }

  #forward(type, payload) {
    if (this.ready) this.send(createMessage(type, payload));
  }

  /** Handles a raw message from the frontend. Returns the parsed message or null if ignored. */
  handleMessage(data) {
    const message = parseFrontendMessage(data);
    if (!message) return null;
    if (message.type === 'ready') {
      if (!isApiVersionSupported(message.payload.apiVersion)) {
        this.onRejected?.(
          `Frontend "${message.payload.name}" needs API ${message.payload.apiVersion || '(none)'}, ` +
            `but the Core provides ${API_VERSION}.`,
        );
        return message;
      }
      this.ready = true;
      this.send(
        createMessage('init', {
          apiVersion: API_VERSION,
          rulebookVersion: RULEBOOK.version,
          seed: this.engine.seed,
          canvas: { width: RULEBOOK.world.width, height: RULEBOOK.world.height },
          lookaheadMs: RULEBOOK.api.lookaheadMs,
        }),
      );
      this.send(createMessage('settings', { muted: this.muted }));
      this.send(createMessage('state', { state: this.engine.state }));
      this.onReady?.(message.payload);
    } else if (message.type === 'error') {
      this.onError?.(message.payload.message);
    } else {
      this.onHeartbeat?.();
    }
    return message;
  }

  setMuted(muted) {
    this.muted = Boolean(muted);
    this.#forward('settings', { muted: this.muted });
  }

  /** Call once per animation frame. */
  sendTick() {
    if (this.ready) this.send(createMessage('tick', this.engine.snapshot()));
  }

  /** Announces a seed change so the frontend can refresh its text. */
  sendInit() {
    if (!this.ready) return;
    this.send(
      createMessage('init', {
        apiVersion: API_VERSION,
        rulebookVersion: RULEBOOK.version,
        seed: this.engine.seed,
        canvas: { width: RULEBOOK.world.width, height: RULEBOOK.world.height },
        lookaheadMs: RULEBOOK.api.lookaheadMs,
      }),
    );
  }

  detach() {
    this.ready = false;
    for (const off of this.unsubscribe) off();
  }
}
