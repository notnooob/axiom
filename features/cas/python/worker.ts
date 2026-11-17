// SPDX-License-Identifier: GPL-3.0-or-later
/// <reference lib="webworker" />
/**
 * Python, in a worker so a running program (a game loop) never freezes the
 * page. Pyodide is self-hosted under /pyodide/ (scripts/copy-pyodide.mjs).
 *
 * In:  init { base, keys?, input?, interrupt? }   the shared buffers exist when the page is cross-origin isolated
 *      run  { id, files: {name, source}[], file?, code? }
 * Out: ready | out { text } | err { text } | draw { op, args } | textAt { row, text, align }
 *      | clearText | input { prompt } | done { id, error? }
 */
import { SHIMS } from "./shims";

declare const self: DedicatedWorkerGlobalScope;

type Py = {
  runPython: (code: string, opts?: { globals?: unknown }) => unknown;
  FS: { writeFile: (path: string, data: string) => void; mkdirTree: (p: string) => void };
  registerJsModule: (name: string, mod: object) => void;
  setInterruptBuffer: (b: Int32Array) => void;
  setStdout: (o: { batched: (s: string) => void }) => void;
  setStderr: (o: { batched: (s: string) => void }) => void;
  setStdin: (o: { stdin: () => string | undefined }) => void;
  toPy: (v: unknown) => unknown;
};

let py: Py | null = null;
/** Keys: a ring of 64 slots of one UTF-16 code each, [0] the write count, [1] the read count. */
let keys: Int32Array | null = null;
/** input(): [0] state (1 waiting, 2 answered), [1] length, then UTF-16 codes. */
let inputBuf: Int32Array | null = null;
const sleeper = typeof SharedArrayBuffer !== "undefined" ? new Int32Array(new SharedArrayBuffer(4)) : null;

const KEY_NAMES: Record<number, string> = { 1: "enter", 2: "esc", 3: "up", 4: "down", 5: "left", 6: "right", 7: "del", 8: "tab" };

function sleep(seconds: number) {
  const ms = Math.max(0, seconds * 1000);
  if (sleeper) Atomics.wait(sleeper, 0, 0, ms);
  else {
    const end = Date.now() + ms;
    while (Date.now() < end);
  }
}

function getKey(): string {
  if (!keys) return "";
  const w = Atomics.load(keys, 0);
  const r = Atomics.load(keys, 1);
  if (r >= w) return "";
  const code = Atomics.load(keys, 2 + (r % 64));
  Atomics.store(keys, 1, r + 1);
  return KEY_NAMES[code] ?? String.fromCharCode(code);
}

function readInput(prompt: string): string {
  self.postMessage({ type: "input", prompt });
  if (!inputBuf) throw new Error("input() needs this page to be cross-origin isolated; reload it to enable");
  Atomics.store(inputBuf, 0, 1);
  while (Atomics.load(inputBuf, 0) === 1) Atomics.wait(inputBuf, 0, 1, 100);
  const n = Atomics.load(inputBuf, 1);
  return String.fromCharCode(...Array.from({ length: n }, (_, i) => Atomics.load(inputBuf!, 2 + i)));
}

async function init(base: string) {
  const { loadPyodide } = (await import(/* @vite-ignore */ `${base}pyodide/pyodide.mjs`)) as {
    loadPyodide: (o: { indexURL: string }) => Promise<Py>;
  };
  const p = await loadPyodide({ indexURL: `${base}pyodide/` });
  p.setStdout({ batched: (text) => self.postMessage({ type: "out", text }) });
  p.setStderr({ batched: (text) => self.postMessage({ type: "err", text }) });
  p.registerJsModule("_axiom", {
    draw: (op: string, ...args: unknown[]) => self.postMessage({ type: "draw", op, args: args.map((a) => (a && typeof a === "object" && "toJs" in a ? (a as { toJs: () => unknown }).toJs() : a)) }),
    text_at: (row: number, text: string, align: string) => self.postMessage({ type: "textAt", row, text, align }),
    clear_text: () => self.postMessage({ type: "clearText" }),
    get_key: getKey,
    sleep,
    input: readInput,
  });
  p.FS.mkdirTree("/home/pyodide");
  for (const [name, src] of Object.entries(SHIMS)) p.FS.writeFile(`/home/pyodide/${name}.py`, src);
  // input() through the shell's entry line; time.sleep through Atomics.wait so loops don't spin.
  p.runPython(`
import builtins, time, _axiom, sys
builtins.input = lambda prompt="": _axiom.input(str(prompt))
time.sleep = _axiom.sleep
sys.path.insert(0, "/home/pyodide")
_shell = {"__name__": "__main__"}
`);
  py = p;
  self.postMessage({ type: "ready" });
}

function run(msg: { id: number; files: { name: string; source: string }[]; file?: string; code?: string }) {
  if (!py) return;
  try {
    for (const f of msg.files) py.FS.writeFile(`/home/pyodide/${f.name}`, f.source);
    // A rerun picks up edited files rather than the first import's cached copy.
    py.runPython(`
import sys
for _m in [m for m in sys.modules if m not in ("ti_system", "ti_draw", "ti_plotlib")]:
    _f = getattr(sys.modules.get(_m), "__file__", "") or ""
    if _f.startswith("/home/pyodide/"):
        del sys.modules[_m]
`);
    if (msg.file) py.runPython(`exec(compile(open(${JSON.stringify(`/home/pyodide/${msg.file}`)}).read(), ${JSON.stringify(msg.file)}, "exec"), _shell)`);
    else if (msg.code !== undefined)
      py.runPython(
        `
_src = ${JSON.stringify(msg.code)}
try:
    _code = compile(_src, "<shell>", "eval")
    _v = eval(_code, _shell)
    if _v is not None:
        print(repr(_v))
except SyntaxError:
    exec(compile(_src, "<shell>", "exec"), _shell)
`,
      );
    self.postMessage({ type: "done", id: msg.id });
  } catch (e) {
    const text = String((e as Error).message ?? e);
    // Pyodide's message is the whole traceback; the handheld shows the last lines.
    const lines = text.trim().split("\n").filter((l) => !l.includes("/lib/python") && !l.includes("_pyodide"));
    self.postMessage({ type: "done", id: msg.id, error: lines.slice(-4).join("\n") });
  }
}

/** Runs wait for Pyodide to finish loading (the first one usually arrives before it has). */
let loaded: Promise<void> | null = null;

self.onmessage = (e: MessageEvent) => {
  const m = e.data;
  if (m.type === "init") {
    if (m.keys) keys = new Int32Array(m.keys);
    if (m.input) inputBuf = new Int32Array(m.input);
    loaded = init(m.base).then(() => {
      if (m.interrupt && py) py.setInterruptBuffer(new Int32Array(m.interrupt));
    });
    loaded.catch((err) => self.postMessage({ type: "failed", error: String(err) }));
  } else if (m.type === "run")
    void loaded?.then(
      () => run(m),
      () => self.postMessage({ type: "done", id: m.id, error: "Python didn't load" }),
    );
};
