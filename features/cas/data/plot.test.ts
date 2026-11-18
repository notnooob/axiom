// SPDX-License-Identifier: GPL-3.0-or-later
import { describe, expect, it } from "vitest";
import { autoBins, boxPlot, dotStacks, equationFn, fitWindow, fiveNumber, histogram, histogramBars, invNorm, normalCurve, ticks, yAxisTitle } from "./plot";

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

describe("histogram scale", () => {
  const xs = [1, 2, 2, 3, 3, 3, 4, 4, 4, 4];
  const bins = { width: 1, start: 0.5 };
  it("counts, percents and densities", () => {
    expect(histogramBars(xs, bins).map((b) => b.h)).toEqual([1, 2, 3, 4]);
    expect(histogramBars(xs, bins, "percent").map((b) => b.h)).toEqual([10, 20, 30, 40]);
    const wide = { width: 2, start: 0.5 };
    const d = histogramBars(xs, wide, "density");
    expect(d.reduce((a, b) => a + b.h * wide.width, 0)).toBeCloseTo(1);
  });
  it("names the y-axis as the handheld does", () => {
    expect(yAxisTitle({ plot: "histogram" })).toBe("Frequency");
    expect(yAxisTitle({ plot: "histogram", histScale: "percent" })).toBe("Percent");
    expect(yAxisTitle({ plot: "histogram", histScale: "density" })).toBe("Density");
    expect(yAxisTitle({ plot: "normprob" })).toBe("z-Quantile");
    expect(yAxisTitle({ plot: "dot" })).toBeUndefined();
    expect(yAxisTitle({ plot: "box" })).toBeUndefined();
  });
  it("fits the window to the scaled bars and scales the normal curve with them", () => {
    const page = { kind: "datastats", id: 1, plot: "histogram", bins } as const;
    expect(fitWindow(page, xs, []).ymax).toBeCloseTo(4 * 1.15);
    expect(fitWindow({ ...page, histScale: "percent" }, xs, []).ymax).toBeCloseTo(40 * 1.15);
    const win = fitWindow(page, xs, []);
    expect(win.xmin).toBeLessThanOrEqual(0.5);
    expect(win.xmax).toBeGreaterThanOrEqual(4.5);
    expect(normalCurve(0, 0, 1, 10, 2, "count")).toBeCloseTo(normalCurve(0, 0, 1, 10, 2, "density") * 20);
    expect(normalCurve(0, 0, 1, 10, 2, "percent")).toBeCloseTo(normalCurve(0, 0, 1, 10, 2, "density") * 200);
  });
});
