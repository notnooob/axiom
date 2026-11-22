// SPDX-License-Identifier: GPL-3.0-or-later
import { describe, expect, it } from "vitest";
import { editsContent, newPage, type GraphsPage } from "./document";

const graphs = (): GraphsPage => {
  const p = newPage("graphs");
  if (p.kind !== "graphs") throw new Error("not graphs");
  return { ...p, xml: "<card/>" };
};

describe("editsContent", () => {
  it("doesn't count the tool, entry line or selection as an edit", () => {
    const p = graphs();
    expect(editsContent(p, p)).toBe(false);
    expect(editsContent(p, { ...p })).toBe(false);
    expect(editsContent(p, { ...p, tool: null, editing: null })).toBe(false);
    expect(editsContent(p, { ...p, geo: { objects: [], tool: null, sel: null } })).toBe(false);
  });

  it("counts a change to what the page holds", () => {
    const p = graphs();
    expect(editsContent(p, { ...p, functions: [{ n: 1, text: "x", row: [] }] })).toBe(true);
    expect(editsContent(p, { ...p, axes: false })).toBe(true);
    expect(editsContent(p, { ...p, geo: { objects: [{ id: "A", kind: "point", x: 0, y: 0 }] } })).toBe(true);
  });
});
