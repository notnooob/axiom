// SPDX-License-Identifier: GPL-3.0-or-later
// Handheld Setup: reading the wizard's answer and older saved setups.
import { afterEach, describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS } from "../engine/evaluate";
import { DEFAULT_SETUP, docDefaults, loadSetup, parseSetup } from "./setup";

const store = new Map<string, string>();
(globalThis as { window?: unknown }).window = {
  localStorage: {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  },
};
afterEach(() => store.clear());

describe("parseSetup", () => {
  it("reads every field", () => {
    expect(parseSetup("setup:Large:No:QWERTY:No:Last Document:Off")).toEqual({
      text: "Large",
      haptics: false,
      keypad: "QWERTY",
      showKeypad: false,
      start: "Last Document",
      motion: "Off",
    });
    expect(parseSetup("setup:Small:Yes:ABC:Yes:Home:On")).toEqual({ ...DEFAULT_SETUP, text: "Small", motion: "On" });
  });

  it("falls back to the defaults", () => {
    expect(parseSetup("setup:Huge:Yes:DVORAK:Yes:Moon:Fast")).toEqual(DEFAULT_SETUP);
    expect(parseSetup("setup:Large:No")).toEqual({ ...DEFAULT_SETUP, text: "Large", haptics: false });
  });
});

describe("loadSetup", () => {
  it("fills in settings an older setup didn't have", () => {
    store.set("axiom.setup", JSON.stringify({ text: "Large", haptics: false }));
    expect(loadSetup()).toEqual({ ...DEFAULT_SETUP, text: "Large", haptics: false });
  });

  it("is the default with nothing saved", () => {
    expect(loadSetup()).toEqual(DEFAULT_SETUP);
  });
});

describe("docDefaults", () => {
  it("is the engine's default until Make Default is used", () => {
    expect(docDefaults()).toEqual(DEFAULT_SETTINGS);
    store.set("axiom.docDefaults", JSON.stringify({ ...DEFAULT_SETTINGS, angle: "deg" }));
    expect(docDefaults().angle).toBe("deg");
  });
});
