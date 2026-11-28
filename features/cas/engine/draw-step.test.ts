// SPDX-License-Identifier: GPL-3.0-or-later
import { describe, expect, it } from "vitest";
import { drawStep, isDrawCommand } from "./eval-program";

/** Arguments as already worked out: the text is its own result. */
const same = async (a: string) => a;

describe("program drawing commands", () => {
  it("knows the drawing commands", () => {
    expect(isDrawCommand("DrawLine 0,0,10,10")).toBe(true);
    expect(isDrawCommand("Disp 1")).toBe(false);
  });
  it("turns each into a canvas step", async () => {
    expect(await drawStep("DrawLine 0,0,200,150", same)).toEqual({ op: "line", args: [0, 0, 200, 150] });
    expect(await drawStep("FillCircle 150,100,30", same)).toEqual({ op: "fill_circle", args: [150, 100, 30] });
    expect(await drawStep("SetColor 255,0,0", same)).toEqual({ op: "color", args: [255, 0, 0] });
    expect(await drawStep("SetPen 3,2", same)).toEqual({ op: "pen", args: ["thick", "dotted"] });
    expect(await drawStep('DrawText 10,20,"x=",5', same)).toEqual({ op: "text", args: [10, 20, "x=5"] });
    expect(await drawStep("Clear", same)).toEqual({ op: "clear", args: [] });
    expect(await drawStep("UseBuffer", same)).toBeNull();
  });
  it("draws a polygon from two lists or from its points", async () => {
    expect(await drawStep("DrawPoly {0,10,20},{0,10,0}", same)).toEqual({ op: "poly", args: [[0, 10, 20], [0, 10, 0]] });
    expect(await drawStep("FillPoly 0,0,10,10,20,0", same)).toEqual({ op: "fill_poly", args: [[0, 10, 20], [0, 10, 0]] });
  });
  it("puts pixel coordinates back with SetWindow 0", async () => {
    expect(await drawStep("SetWindow 0", same)).toEqual({ op: "window", args: [0, 318, 212, 0] });
    expect(await drawStep("SetWindow -10,10,-5,5", same)).toEqual({ op: "window", args: [-10, 10, -5, 5] });
  });
  it("refuses an argument that isn't a number", async () => {
    await expect(drawStep("DrawLine a,0,1,1", same)).rejects.toThrow("Argument must be a number");
  });
});
