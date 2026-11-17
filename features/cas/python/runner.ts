// SPDX-License-Identifier: GPL-3.0-or-later
/**
 * The page's handle on the Python worker: started the first time a Python
 * page needs it (Pyodide is ~10 MB), then kept. Keys, input() answers and
 * Break go through shared memory, which needs the page cross-origin isolated
 * (vite.config.ts headers, or the service worker public/sw.js on static hosting).
 */
export type PyEvent =
  | { type: "out" | "err"; text: string }
  | { type: "draw"; op: string; args: unknown[] }
  | { type: "textAt"; row: number; text: string; align: string }
  | { type: "clearText" }
  | { type: "input"; prompt: string }
  | { type: "done"; id: number; error?: string }
  | { type: "status"; status: PyStatus };

export type PyStatus = "off" | "loading" | "ready" | "running" | "failed";
export type PyFile = { name: string; source: string };

const KEY_CODES: Record<string, number> = { enter: 1, esc: 2, up: 3, down: 4, left: 5, right: 6, backspace: 7, delete: 7, tab: 8 };

export class PythonRunner {
  private worker: Worker | null = null;
  private listeners = new Set<(e: PyEvent) => void>();
  private nextId = 1;
  status: PyStatus = "off";
  readonly isolated = typeof crossOriginIsolated !== "undefined" && crossOriginIsolated;
  private keys = this.isolated ? new Int32Array(new SharedArrayBuffer(4 * 66)) : null;
  private input = this.isolated ? new Int32Array(new SharedArrayBuffer(4 * 1026)) : null;
  private interrupt = this.isolated ? new Int32Array(new SharedArrayBuffer(4)) : null;

  on(f: (e: PyEvent) => void) {
    this.listeners.add(f);
    return () => {
      this.listeners.delete(f);
    };
  }

  private emit(e: PyEvent) {
    if (e.type === "status") this.status = e.status;
    for (const f of this.listeners) f(e);
  }

  start() {
    if (this.worker) return;
    this.emit({ type: "status", status: "loading" });
    const w = new Worker(new URL("./worker.ts", import.meta.url), { type: "module" });
    w.onmessage = (e: MessageEvent) => {
      const m = e.data;
      // A run sent while Pyodide loaded is already under way: it stays "running" until done.
      if (m.type === "ready") {
        if (this.status !== "running") this.emit({ type: "status", status: "ready" });
      }
      else if (m.type === "failed") {
        this.emit({ type: "err", text: `Python didn't load: ${m.error}` });
        this.emit({ type: "status", status: "failed" });
      } else {
        if (m.type === "done") this.emit({ type: "status", status: "ready" });
        this.emit(m as PyEvent);
      }
    };
    const base = new URL(import.meta.env.BASE_URL, location.href).href;
    w.postMessage({ type: "init", base, keys: this.keys?.buffer, input: this.input?.buffer, interrupt: this.interrupt?.buffer });
    this.worker = w;
  }

  /** Run a file (by name) or a line typed in the shell, with the problem's files importable. */
  run(files: PyFile[], what: { file: string } | { code: string }): number {
    this.start();
    const id = this.nextId++;
    if (this.interrupt) Atomics.store(this.interrupt, 0, 0);
    if (this.keys) {
      Atomics.store(this.keys, 0, 0);
      Atomics.store(this.keys, 1, 0);
    }
    this.emit({ type: "status", status: "running" });
    this.worker!.postMessage({ type: "run", id, files, ...what });
    return id;
  }

  /** A key for get_key() while a program runs. */
  key(name: string) {
    if (!this.keys) return;
    const code = KEY_CODES[name] ?? (name.length === 1 ? name.charCodeAt(0) : 0);
    if (!code) return;
    const w = Atomics.load(this.keys, 0);
    Atomics.store(this.keys, 2 + (w % 64), code);
    Atomics.store(this.keys, 0, w + 1);
  }

  /** Answer the input() the program is waiting on. */
  answer(text: string) {
    if (!this.input) return;
    const codes = Array.from(text.slice(0, 1024), (c) => c.charCodeAt(0));
    codes.forEach((c, i) => Atomics.store(this.input!, 2 + i, c));
    Atomics.store(this.input, 1, codes.length);
    Atomics.store(this.input, 0, 2);
    Atomics.notify(this.input, 0);
  }

  /** Break: KeyboardInterrupt in the running program. */
  stop() {
    if (this.interrupt) Atomics.store(this.interrupt, 0, 2);
    // A program blocked in input() wakes with an empty answer and then sees the interrupt.
    if (this.input && Atomics.load(this.input, 0) === 1) this.answer("");
  }
}

let shared: PythonRunner | null = null;
export const python = () => (shared ??= new PythonRunner());
