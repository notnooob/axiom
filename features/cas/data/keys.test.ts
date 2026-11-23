// SPDX-License-Identifier: GPL-3.0-or-later
import { describe, expect, it } from "vitest";
import type { DataStatsPage } from "../state/document";
import { dataKey, dataTakesEsc } from "./keys";

const page = (more: Partial<DataStatsPage> = {}): DataStatsPage => ({ kind: "datastats", id: 1, plot: "dot", x: "a", ...more });

describe("data & statistics keys", () => {
  it("moves, sizes and removes the selected image", () => {
    let p = page({ image: { src: "data:,", x: 0.2, y: 0.2, w: 0.5, aspect: 0.5 }, imageSel: true });
    expect(dataTakesEsc(p)).toBe(true);
    p = dataKey(p, { k: "right" })!;
    p = dataKey(p, { k: "down" })!;
    expect(p.image).toMatchObject({ x: 0.22, y: 0.22 });
    p = dataKey(p, { k: "char", c: "+" })!;
    expect(p.image!.w).toBeCloseTo(0.55);
    expect(dataKey(p, { k: "esc" })).toMatchObject({ imageSel: undefined, image: p.image });
    expect(dataKey(p, { k: "delete" })!.image).toBeUndefined();
  });

  it("moves Graph Trace along with ◄ ►, between traces with ▲ ▼, and ends it with Esc", () => {
    let p = page({ trace: { target: 0, i: 0 } });
    p = dataKey(p, { k: "right" })!;
    p = dataKey(p, { k: "right" })!;
    expect(p.trace).toEqual({ target: 0, i: 2 });
    p = dataKey(p, { k: "down" })!;
    expect(p.trace).toEqual({ target: 1, i: 0 });
    expect(dataTakesEsc(p)).toBe(true);
    expect(dataKey(p, { k: "esc" })!.trace).toBeUndefined();
  });
  it("deletes the selected text, and lets go of selected points with Esc", () => {
    const p = page({ texts: [{ text: "one", x: 0, y: 0 }, { text: "two", x: 0, y: 0.1 }], textSel: 0 });
    expect(dataKey(p, { k: "delete" })!.texts).toEqual([{ text: "two", x: 0, y: 0.1 }]);
    expect(dataKey(page({ selected: "all" }), { k: "esc" })!.selected).toBeUndefined();
    expect(dataKey(page(), { k: "left" })).toBeNull();
    expect(dataTakesEsc(page())).toBe(false);
  });
});
