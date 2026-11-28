// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 VCE Hub. Part of the /cas calculator: https://github.com/vcehub/cas
import { setupCommands, type Settings } from "./evaluate";
import { userName } from "./translate";

/**
 * The page's handle on the Giac worker (public/cas/worker.js). One command at
 * a time, in order. A command that runs past the timeout restarts the worker
 * and replays every definition made so far, so variables survive.
 */
export type EngineStatus = "loading" | "ready" | "busy" | "failed";

const TIMEOUT_MS = 20000;

type Pending = { resolve: (out: string) => void; reject: (e: Error) => void; timer: ReturnType<typeof setTimeout>; timedOut?: boolean };

export class CasEngine {
  private worker: Worker | null = null;
  private nextId = 1;
  private pending = new Map<number, Pending>();
  /** Resolves once the worker has loaded and the settings and definitions are replayed: what commands wait for. */
  private ready!: Promise<void>;
  /** Bumped on each start, so a replay that a restart overtook stops posting to the new worker. */
  private generation = 0;
  private replaying = false;
  private definitions: string[] = [];
  private settings: Settings;
  private listeners = new Set<(s: EngineStatus) => void>();
  status: EngineStatus = "loading";
  /** Why the worker stopped, when it did: shown with "didn't load". */
  lastError = "";

  constructor(settings: Settings) {
    this.settings = settings;
    this.start();
  }

  onStatus(fn: (s: EngineStatus) => void): () => void {
    this.listeners.add(fn);
    fn(this.status);
    return () => this.listeners.delete(fn);
  }

  private setStatus(s: EngineStatus) {
    this.status = s;
    for (const fn of this.listeners) fn(s);
  }

  private start() {
    this.setStatus("loading");
    const gen = ++this.generation;
    const worker = new Worker(`${import.meta.env.BASE_URL}cas/worker.js`);
    this.worker = worker;
    const loaded = new Promise<void>((resolve, reject) => {
      worker.onmessage = (e: MessageEvent) => {
        const d = e.data as { type?: string; id?: number; out?: string; error?: string };
        if (d.type === "ready") {
          resolve();
          return;
        }
        const p = d.id !== undefined ? this.pending.get(d.id) : undefined;
        if (!p) return;
        clearTimeout(p.timer);
        this.pending.delete(d.id!);
        if (!this.pending.size && !this.replaying) this.setStatus("ready");
        if (d.error !== undefined) {
          p.resolve(`Error: ${d.error}`);
          // A Giac exception leaves the wasm runtime broken (every later call
          // aborts), so the engine is restarted with the user's definitions.
          queueMicrotask(() => {
            if (gen === this.generation) this.restart();
          });
        } else p.resolve(d.out ?? "");
      };
      worker.onerror = (ev: ErrorEvent) => {
        this.lastError = ev.message || "its worker stopped";
        this.setStatus("failed");
        reject(new Error("engine failed to load"));
      };
    });
    // Commands wait for the replay too, so none runs before the variables it uses are back.
    this.ready = loaded.then(() => this.replay(gen));
    this.ready.catch(() => this.setStatus("failed"));
  }

  /**
   * Put the settings and every definition back in a fresh worker. A definition
   * that fails or times out here would fail on every restart, so it's dropped.
   */
  private async replay(gen: number) {
    this.replaying = true;
    try {
      for (const c of setupCommands(this.settings)) {
        if (gen !== this.generation) return;
        await this.raw(c);
      }
      for (const c of this.definitions.slice()) {
        if (gen !== this.generation) return;
        const { out, timedOut } = await this.send(c);
        if (gen !== this.generation && !timedOut) return;
        if (timedOut || out.startsWith("Error:")) {
          this.definitions = this.definitions.filter((d) => d !== c);
          // A Giac error leaves the worker broken, so start again without c (a timeout has already restarted).
          if (gen === this.generation) this.restart();
          return;
        }
      }
    } finally {
      if (gen === this.generation) {
        this.replaying = false;
        this.setStatus("ready");
      }
    }
  }

  private raw(cmd: string): Promise<string> {
    return this.send(cmd).then((r) => r.out);
  }

  private send(cmd: string): Promise<{ out: string; timedOut: boolean }> {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        const p = this.pending.get(id);
        if (p) p.timedOut = true;
        this.restart();
      }, TIMEOUT_MS);
      const entry: Pending = { resolve: (out) => resolve({ out, timedOut: Boolean(entry.timedOut) }), reject, timer };
      this.pending.set(id, entry);
      this.worker?.postMessage({ id, cmd });
    });
  }

  /** Kill a stuck computation and bring the engine back with its variables. */
  restart() {
    this.worker?.terminate();
    this.replaying = false;
    for (const p of this.pending.values()) {
      clearTimeout(p.timer);
      p.resolve("Error: Interrupted");
    }
    this.pending.clear();
    this.start();
  }

  /** Wait for the engine, through any restarts that happen meanwhile. */
  private async whenReady() {
    let r: Promise<void>;
    do {
      r = this.ready;
      await r;
    } while (r !== this.ready);
  }

  /** Evaluate one Giac command. */
  giac = async (cmd: string): Promise<string> => {
    await this.whenReady();
    this.setStatus("busy");
    return this.raw(cmd);
  };

  /** Remember a definition so a restart can replay it. */
  remember(cmd: string) {
    this.definitions.push(cmd);
  }

  /** Definitions so far, for saving; restore() replays a saved list. */
  get saved(): string[] {
    return this.definitions.slice();
  }

  async restore(defs: string[]) {
    this.definitions = defs.slice();
    await this.whenReady();
    for (const c of defs) await this.raw(c);
  }

  async applySettings(s: Settings) {
    this.settings = s;
    await this.whenReady();
    for (const c of setupCommands(s)) await this.raw(c);
  }

  async clearAll() {
    this.definitions = [];
    await this.whenReady();
    await this.raw("restart");
    for (const c of setupCommands(this.settings)) await this.raw(c);
  }

  dispose() {
    this.worker?.terminate();
    this.worker = null;
  }
}

/**
 * The names a list of definitions leaves defined, in order: f(x):=… and
 * a:=… add a name, purge(…) (DelVar, Clear a–z) removes it. Engine-internal
 * names (ending in _) are left out.
 */
export function definedNames(defs: string[]): Set<string> {
  const out = new Set<string>();
  for (const raw of defs) {
    const d = raw.trim();
    const purge = /^purge\((.*)\)$/.exec(d);
    if (purge) {
      for (const n of purge[1]!.split(",")) out.delete(userName(n.trim()));
      continue;
    }
    const m = /^([A-Za-z]\w*)\s*(?:\([^)]*\))?\s*:=/.exec(d);
    // Names ending _ are the engine's own (g12f1_), but only once a reserved name the student used (len → len_) is given back.
    const name = m ? userName(m[1]!) : "";
    if (name && !name.endsWith("_")) out.add(name);
  }
  return out;
}

/** User functions and their stored bodies (Giac text), from the saved definitions: the latest of each, purged ones gone. */
export function definedFunctions(defs: string[]): Map<string, { params: string[]; body: string }> {
  const out = new Map<string, { params: string[]; body: string }>();
  for (const raw of defs) {
    const d = raw.trim();
    const purge = /^purge\((.*)\)$/.exec(d);
    if (purge) {
      for (const n of purge[1]!.split(",")) out.delete(userName(n.trim()));
      continue;
    }
    const m = /^([A-Za-z]\w*)\s*\(([^)]*)\)\s*:=([\s\S]*)$/.exec(d);
    if (!m || m[1]!.endsWith("_")) continue;
    const params = m[2]!.split(",").map((x) => userName(x.trim()));
    out.set(userName(m[1]!), { params, body: m[3]! });
  }
  return out;
}
