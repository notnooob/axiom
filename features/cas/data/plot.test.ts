// SPDX-License-Identifier: GPL-3.0-or-later
import { describe, expect, it } from "vitest";
import {
  autoBins,
  boxPlot,
  categoryCounts,
  categoryWindow,
  dotStacks,
  edgeBars,
  effectivePlot,
  equationFn,
  expandSummary,
  fitWindow,
  forceValues,
  fiveNumber,
  histogram,
  histogramBars,
  invNorm,
  layoutOf,
  logicalPage,
  normalCurve,
  parseValues,
  pieSlices,
  residuals,
  splitGroups,
  swapWindow,
  ticks,
  yAxisTitle,
} from "./plot";

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
  it("sinusoidal and logistic equations, whatever the signs", () => {
    expect(equationFn("2*sin(0.5*x+-1)+3")(2)).toBeCloseTo(3);
    expect(equationFn("10/(1+4*ℯ^(-0.5*x))")(0)).toBeCloseTo(2);
    // A negative b makes "--" in the logistic equation.
    expect(equationFn("10/(1+4*ℯ^(--0.5*x))")(0)).toBeCloseTo(2);
    expect(equationFn("10/(1+4*ℯ^(--0.5*x))")(2)).toBeCloseTo(10 / (1 + 4 * Math.E));
    expect(equationFn("1e-7*x+2")(1)).toBeCloseTo(2);
  });
  it("residuals from a curve", () => {
    expect(residuals([[1, 3], [2, 4], [3, 8]], (x) => 2 * x)).toEqual([[1, 1], [2, 0], [3, 2]]);
    expect(residuals([[0, 1]], () => NaN)).toEqual([]);
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

  it("reads a list of text as categories, and numbers as numbers", () => {
    expect(parseValues("[1.0,2.5,-3]")).toEqual({ nums: [1, 2.5, -3] });
    expect(parseValues('["red","blue, green",2.0,undef]')).toEqual({ nums: [], cats: ["red", "blue, green", "2", ""] });
    expect(parseValues("")).toEqual({ nums: [] });
  });
  it("counts categories in list, value or A–Z order, with a summary list's totals", () => {
    const cats = ["b", "a", "b", "", "c", "b", "a"];
    expect(categoryCounts(cats)).toEqual([
      { name: "b", n: 3 },
      { name: "a", n: 2 },
      { name: "c", n: 1 },
    ]);
    expect(categoryCounts(cats, undefined, "alpha").map((c) => c.name)).toEqual(["a", "b", "c"]);
    expect(categoryCounts(["x", "y", "x"], [2, 5, 1], "value")).toEqual([
      { name: "y", n: 5 },
      { name: "x", n: 3 },
    ]);
  });
  it("pie slices share the circle, clockwise from the top", () => {
    const s = pieSlices([
      { name: "a", n: 1 },
      { name: "b", n: 3 },
    ]);
    expect(s[0]!.share).toBe(0.25);
    expect(s[0]!.from).toBeCloseTo(-Math.PI / 2);
    expect(s[1]!.to).toBeCloseTo((3 * Math.PI) / 2);
  });
  it("repeats values by a summary list of whole numbers", () => {
    expect(expandSummary([1, 2, 3], [2, 0, 1])).toEqual([1, 1, 3]);
    expect(expandSummary([1, 2], [1.5, 1])).toBeNull();
  });
  it("falls back to a plot that suits the data", () => {
    expect(effectivePlot({ plot: "dot" }, true)).toBe("dotchart");
    expect(effectivePlot({ plot: "histogram", ySummary: "f" }, true)).toBe("bar");
    expect(effectivePlot({ plot: "pie" }, true)).toBe("pie");
    expect(effectivePlot({ plot: "pie" }, false)).toBe("dot");
    expect(effectivePlot({ plot: "bar", ySummary: "f" }, false)).toBe("histogram");
    expect(effectivePlot({ plot: "box" }, false)).toBe("box");
  });
  it("a bar chart's window has a column for each category", () => {
    const w = categoryWindow([{ n: 4 }, { n: 10 }], "bar");
    expect([w.xmin, w.xmax, w.ymin]).toEqual([-0.6, 1.6, 0]);
    expect(w.ymax).toBeCloseTo(11.5);
    expect(yAxisTitle({ plot: "bar" })).toBe("Frequency");
  });

  it("forces text numeric, and numbers categorical", () => {
    expect(forceValues({ nums: [], cats: ["12", "−3", "", "a"] }, "num").nums).toEqual([12, -3, NaN, NaN]);
    expect(forceValues({ nums: [1, 2.5, NaN] }, "cat").cats).toEqual(["1", "2.5", ""]);
    expect(forceValues({ nums: [1] })).toEqual({ nums: [1] });
  });
  it("plots x along, y up, and numbers against categories in columns or rows", () => {
    const n = { nums: [1] };
    const c = { nums: [], cats: ["a"] };
    expect(layoutOf(null, null)).toBeNull();
    expect(layoutOf(n, null)).toEqual({ main: "x", two: false });
    expect(layoutOf(null, c)).toEqual({ main: "y", two: false });
    expect(layoutOf(n, n)).toEqual({ main: "x", two: true });
    expect(layoutOf(c, n)).toEqual({ main: "x", two: true });
    expect(layoutOf(n, c)).toEqual({ main: "y", two: true });
    expect(layoutOf(c, c)).toBe("bothCat");
  });
  it("sees a list up the y-axis with its x summary list as the plot's own", () => {
    const p = { kind: "datastats", id: 1, plot: "histogram", y: "h", xSummary: "f" } as const;
    expect(logicalPage(p, { main: "y", two: false })).toEqual({ plot: "histogram", y: undefined, ySummary: "f" });
    expect(swapWindow({ xmin: 0, xmax: 1, ymin: 2, ymax: 3, xscl: 1, yscl: 1 })).toMatchObject({ xmin: 2, xmax: 3, ymin: 0, ymax: 1 });
  });
  it("counts values between variable bin boundaries, the last bin taking its right edge", () => {
    const bars = edgeBars([0, 5, 10, 12, 30, 50, 60], [50, 0, 10, 50], "count");
    expect(bars.map((b) => [b.from, b.to, b.n])).toEqual([
      [0, 10, 2],
      [10, 50, 4],
    ]);
    expect(edgeBars([1, 2, 3, 4], [0, 2, 4], "density").map((b) => b.h)).toEqual([0.125, 0.375]);
  });
  it("splits values by category, in the order the categories appear", () => {
    expect(splitGroups([1, 2, 3, NaN, 5], ["m", "f", "m", "f", ""])).toEqual([
      { name: "m", values: [1, 3] },
      { name: "f", values: [2] },
    ]);
  });
});
