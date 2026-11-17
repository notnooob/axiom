// SPDX-License-Identifier: GPL-3.0-or-later
import { describe, expect, it } from "vitest";
import { newDocument } from "../state/document";
import { DEFAULT_SETTINGS } from "../engine/evaluate";
import type { Saved } from "../state/persist";
import { cleanTitle, fallbackTitle, newestFirst, newThread, ownsOpenDoc, restoreOf } from "./threads";

const saved = (title: string): Saved => ({ doc: newDocument("calculator", title), settings: DEFAULT_SETTINGS, definitions: [] });

describe("thread titles", () => {
  it("falls back to the first message, on one line and cut short", () => {
    expect(fallbackTitle("  Solve x² − 5x + 6 = 0\nand graph it ")).toBe("Solve x² − 5x + 6 = 0 and graph it");
    expect(fallbackTitle("a".repeat(60))).toHaveLength(40);
    expect(fallbackTitle("a".repeat(60)).endsWith("…")).toBe(true);
    expect(fallbackTitle("   ")).toBe("New chat");
  });
  it("tidies a model's title", () => {
    expect(cleanTitle('"Quadratic roots and graph."')).toBe("Quadratic roots and graph");
    expect(cleanTitle("Title: one two three four five six seven")).toBe("one two three four five six");
    expect(cleanTitle("What's the derivative\nmore")).toBe("What's the derivative");
  });
});

describe("thread order", () => {
  it("lists the most recently used first", () => {
    const a = { ...newThread(1), updated: 5 };
    const b = { ...newThread(2), updated: 9 };
    const c = { ...newThread(3), updated: 5 };
    expect(newestFirst([a, b, c]).map((t) => t.created)).toEqual([2, 3, 1]);
  });
});

describe("document ownership", () => {
  it("shows the open document only in the thread that owns it", () => {
    expect(ownsOpenDoc("a", "a", true)).toBe(true);
    expect(ownsOpenDoc("a", "b", true)).toBe(false);
    expect(ownsOpenDoc(null, "b", true)).toBe(false);
    expect(ownsOpenDoc("a", "a", false)).toBe(false);
  });
  it("brings a thread's document back from its file, or as an unsaved snapshot", () => {
    const t = newThread();
    expect(restoreOf(t, undefined)).toBeNull();
    const snap = saved("Work");
    expect(restoreOf({ ...t, doc: snap }, undefined)).toEqual({ saved: snap, path: null, dirty: true });
    const file = saved("Work");
    expect(restoreOf({ ...t, doc: snap, docPath: "My Documents/Work.tns" }, { ...file, doc: snap.doc })).toEqual({ saved: snap, path: "My Documents/Work.tns", dirty: false });
    const edited = { ...snap, doc: { ...snap.doc, active: 1 } };
    expect(restoreOf({ ...t, doc: edited, docPath: "My Documents/Work.tns" }, snap)?.dirty).toBe(true);
    // The file was deleted: the snapshot comes back unsaved.
    expect(restoreOf({ ...t, doc: snap, docPath: "My Documents/Gone.tns" }, undefined)?.path).toBeNull();
  });
});
