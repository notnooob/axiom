// SPDX-License-Identifier: GPL-3.0-or-later
import { describe, expect, it } from "vitest";
import { autoBins, boxPlot, dotStacks, equationFn, fiveNumber, histogram, invNorm, ticks } from "./plot";

describe("data & statistics numbers", () => {
  it("five-number summary as the handheld works it out", () => {
    expect(fiveNumber([1, 2, 3, 4, 5, 6, 7])).toEqual({ min: 1, q1: 2, median: 4, q3: 6, max: 7 });
    expect(fiveNumber([1, 2, 3, 4, 5, 6])).toEqual({ min: 1, q1: 2, median: 3.5, q3: 5, max: 6 });
  });
  it("box plot outliers beyond 1.5 IQR, none when extended", () => {
    const b = boxPlot([1, 2, 3, 4, 5, 6, 40]);
    expect(b.outliers).toEqual([40]);
    expect(b.hi).toBe(6);
    expect(boxPlot([1, 2, 3, 4, 5, 6, 40], true).outliers).toEqual([]);
  });
  it("bins and counts", () => {
    const xs = [1, 2, 2, 3, 9, 10];
    const bins = autoBins(xs);
    expect(bins.width).toBeGreaterThan(0);
    expect(histogram(xs, bins).reduce((n, b) => n + b.n, 0)).toBe(6);
  });
  it("dot stacks, normal scores, ticks, regression equations", () => {
    expect(dotStacks([3, 3, 4, 3])).toEqual([[3, 1], [3, 2], [4, 1], [3, 3]]);
    expect(invNorm(0.975)).toBeCloseTo(1.959964, 5);
    expect(ticks(0, 10)).toEqual([0, 2, 4, 6, 8, 10]);
    expect(equationFn("2*x+1")(3)).toBe(7);
    expect(equationFn("1.5+2*ln(x)")(Math.E)).toBeCloseTo(3.5);
    expect(equationFn("alert(1)")(1)).toBeNaN();
  });
});
