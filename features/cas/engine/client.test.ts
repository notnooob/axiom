// SPDX-License-Identifier: GPL-3.0-or-later
// The engine handle's restart and replay, against a stand-in worker (no Giac).
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { CasEngine } from "./client";
import { DEFAULT_SETTINGS } from "./evaluate";

/** A worker that answers each command with itself, and fails on any containing "bad". */
class FakeWorker {
  static all: FakeWorker[] = [];
  received: string[] = [];
  onmessage: ((e: { data: unknown }) => void) | null = null;
  onerror: ((e: unknown) => void) | null = null;
  dead = false;
  constructor() {
    FakeWorker.all.push(this);
    setTimeout(() => this.onmessage?.({ data: { type: "ready" } }), 0);
  }
  postMessage({ id, cmd }: { id: number; cmd: string }) {
    this.received.push(cmd);
    setTimeout(() => {
      if (this.dead) return;
      this.onmessage?.({ data: cmd.includes("bad") ? { id, error: "bad input" } : { id, out: cmd } });
    }, 0);
  }
  terminate() {
    this.dead = true;
  }
}

let real: unknown;
beforeEach(() => {
  real = (globalThis as { Worker?: unknown }).Worker;
  FakeWorker.all = [];
  (globalThis as { Worker?: unknown }).Worker = FakeWorker;
});
afterEach(() => {
  (globalThis as { Worker?: unknown }).Worker = real;
});

describe("CasEngine", () => {
  it("runs a command only after a restart has replayed the definitions", async () => {
    const e = new CasEngine(DEFAULT_SETTINGS);
    await e.giac("1");
    e.remember("a:=1");
    e.remember("b:=2");
    e.restart();
    expect(await e.giac("a+b")).toBe("a+b");
    const w = FakeWorker.all.at(-1)!;
    expect(w.received.slice(-3)).toEqual(["a:=1", "b:=2", "a+b"]);
    expect(e.status).toBe("ready");
  });

  it("drops a definition that fails on replay, rather than restarting forever", async () => {
    const e = new CasEngine(DEFAULT_SETTINGS);
    await e.giac("1");
    e.remember("a:=1");
    e.remember("bad:=2");
    e.remember("c:=3");
    e.restart();
    expect(await e.giac("a+c")).toBe("a+c");
    expect(e.saved).toEqual(["a:=1", "c:=3"]);
    const w = FakeWorker.all.at(-1)!;
    expect(w.received.slice(-3)).toEqual(["a:=1", "c:=3", "a+c"]);
    expect(FakeWorker.all.length).toBe(3); // the first, the restart, and one more without the bad definition
  });
});
