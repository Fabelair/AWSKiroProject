/**
 * Version history of frontends (CORE-VER-*). The default frontend is built in and cannot be
 * deleted or overwritten; every other version lives in local storage.
 */

import { validateBundle } from './validator.js';

export const DEFAULT_VERSION_ID = 'default';
const VERSIONS_KEY = 'fk.versions.v1';
const ACTIVE_KEY = 'fk.active.v1';

export class VersionStore {
  /**
   * @param {ReturnType<import('./storage.js').createSafeStore>} store
   * @param {{ name: string, files: Record<string,string> }} defaultBundle
   * @param {() => number} [now]
   */
  constructor(store, defaultBundle, now = () => Date.now()) {
    this.store = store;
    this.defaultBundle = defaultBundle;
    this.now = now;
  }

  #load() {
    try {
      const parsed = JSON.parse(this.store.get(VERSIONS_KEY) ?? '[]');
      return Array.isArray(parsed) ? parsed.filter((v) => v && typeof v.id === 'string') : [];
    } catch {
      return [];
    }
  }

  #save(versions) {
    return this.store.set(VERSIONS_KEY, JSON.stringify(versions));
  }

  defaultVersion() {
    return {
      id: DEFAULT_VERSION_ID,
      name: 'Flappy Kiro (default)',
      prompt: '',
      createdAt: 0,
      builtin: true,
      bundle: this.defaultBundle,
    };
  }

  /** Default first, then saved versions, newest first. */
  list() {
    return [this.defaultVersion(), ...this.#load().sort((a, b) => b.createdAt - a.createdAt)];
  }

  get(id) {
    return this.list().find((v) => v.id === id) ?? null;
  }

  /** @returns {{ok:true, version:object} | {ok:false, error:string}} */
  add({ name, prompt = '', bundle }) {
    const check = validateBundle(bundle);
    if (!check.ok) return { ok: false, error: check.errors.join(' ') };
    const versions = this.#load();
    const createdAt = this.now();
    const version = {
      id: `v${createdAt.toString(36)}${versions.length.toString(36)}`,
      name: String(name || bundle.name || 'Untitled').slice(0, 60),
      prompt: String(prompt).slice(0, 2000),
      createdAt,
      builtin: false,
      bundle: { name: bundle.name, files: bundle.files },
    };
    versions.push(version);
    if (!this.#save(versions)) {
      return { ok: false, error: 'Could not save: browser storage is full or unavailable. Delete old versions or export them.' };
    }
    return { ok: true, version };
  }

  remove(id) {
    if (id === DEFAULT_VERSION_ID) return { ok: false, error: 'The default frontend cannot be deleted.' };
    const versions = this.#load();
    const next = versions.filter((v) => v.id !== id);
    if (next.length === versions.length) return { ok: false, error: 'Version not found.' };
    this.#save(next);
    if (this.getActiveId() === id) this.setActive(DEFAULT_VERSION_ID);
    return { ok: true };
  }

  rename(id, name) {
    if (id === DEFAULT_VERSION_ID) return { ok: false, error: 'The default frontend cannot be renamed.' };
    const versions = this.#load();
    const version = versions.find((v) => v.id === id);
    if (!version) return { ok: false, error: 'Version not found.' };
    version.name = String(name).trim().slice(0, 60) || version.name;
    this.#save(versions);
    return { ok: true };
  }

  getActiveId() {
    const id = this.store.get(ACTIVE_KEY);
    return id && this.get(id) ? id : DEFAULT_VERSION_ID;
  }

  setActive(id) {
    if (!this.get(id)) return { ok: false, error: 'Version not found.' };
    this.store.set(ACTIVE_KEY, id);
    return { ok: true };
  }

  getActive() {
    return this.get(this.getActiveId());
  }

  /** JSON text for sharing/backup. Never includes API keys (they are never stored here). */
  exportVersion(id) {
    const version = this.get(id);
    if (!version) return null;
    return JSON.stringify({ format: 'flappy-kiro-frontend', name: version.name, prompt: version.prompt, bundle: version.bundle }, null, 2);
  }

  /** Imports exported JSON; the bundle is validated like any other. */
  importVersion(text) {
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      return { ok: false, error: 'That file is not valid JSON.' };
    }
    if (!data || data.format !== 'flappy-kiro-frontend') {
      return { ok: false, error: 'That file is not a Flappy Kiro frontend export.' };
    }
    return this.add({ name: data.name, prompt: data.prompt, bundle: data.bundle });
  }
}
