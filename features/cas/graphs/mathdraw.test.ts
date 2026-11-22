// SPDX-License-Identifier: GPL-3.0-or-later
import { describe, expect, it } from "vitest";
import { recognise } from "./mathdraw";

describe("MathDraw", () => {
  it("a straight stroke is a line", () => {
    const pts = Array.from({ length: 20 }, (_, i) => [i * 0.5 - 5, 2 * (i * 0.5 - 5) + 1 + (i % 2 ? 0.01 : -0.01)] as [number, number]);
    expect(recognise(pts, 20)).toBe("y=2x+1");
  });
  it("an upright stroke is x = c", () => {
    expect(recognise(Array.from({ length: 10 }, (_, i) => [3, i - 5] as [number, number]), 20)).toBe("x=3");
  });
  it("a closed round stroke is a circle", () => {
    const pts = Array.from({ length: 40 }, (_, i) => [1 + 2 * Math.cos((i / 39) * 2 * Math.PI), -1 + 2 * Math.sin((i / 39) * 2 * Math.PI)] as [number, number]);
    expect(recognise(pts, 20)).toBe("(x-1)^2+(y+1)^2=2^2");
  });
});
