// SPDX-License-Identifier: GPL-3.0-or-later
/**
 * Data & Statistics, the numbers behind each plot: five-number summaries and
 * outliers for box plots, histogram bins, dot-plot stacks, normal scores,
 * and the window that fits the data. Pure, so they're tested on their own.
 */
import type { GraphWindow } from "../graphs/model";
import type { DataPlot, DataStatsPage, HistScale } from "../state/document";

/** Quartiles as the handheld works them out: medians of the lower and upper halves (the median left out when n is odd). */
export function fiveNumber(values: number[]) {
  const v = values.slice().sort((a, b) => a - b);
  const med = (a: number[]) => (a.length % 2 ? a[(a.length - 1) / 2]! : (a[a.length / 2 - 1]! + a[a.length / 2]!) / 2);
  const half = Math.floor(v.length / 2);
  return { min: v[0]!, q1: med(v.slice(0, half)), median: med(v), q3: med(v.slice(v.length - half)), max: v.at(-1)! };
}

/** The box plot: whiskers stop at the last value within 1.5·IQR of the box (the rest are outliers), unless extended. */
export function boxPlot(values: number[], extend = false) {
  const f = fiveNumber(values);
  if (extend) return { ...f, lo: f.min, hi: f.max, outliers: [] as number[] };
  const iqr = f.q3 - f.q1;
  const inside = values.filter((x) => x >= f.q1 - 1.5 * iqr && x <= f.q3 + 1.5 * iqr);
  return { ...f, lo: Math.min(...inside), hi: Math.max(...inside), outliers: values.filter((x) => !inside.includes(x)) };
}

/** A round bin width giving about eight bins. */
export function autoBins(values: number[]): { width: number; start: number } {
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  const raw = (hi - lo || 1) / 8;
  const p = 10 ** Math.floor(Math.log10(raw));
  const width = [1, 2, 2.5, 5, 10].map((k) => k * p).find((w) => w >= raw)!;
  return { width, start: Math.floor(lo / width) * width };
}

export function histogram(values: number[], bins: { width: number; start: number }) {
  const counts = new Map<number, number>();
  for (const x of values) {
    const i = Math.floor((x - bins.start) / bins.width + 1e-9);
    counts.set(i, (counts.get(i) ?? 0) + 1);
  }
  return [...counts].map(([i, n]) => ({ from: bins.start + i * bins.width, to: bins.start + (i + 1) * bins.width, n })).sort((a, b) => a.from - b.from);
}

/**
 * The bars' heights for Histogram Scale: Count (how many values), Percent
 * (of all the values) or Density (so the bars' areas add up to 1).
 */
export function histogramBars(values: number[], bins: { width: number; start: number }, scale: HistScale = "count") {
  const k = scale === "percent" ? 100 / values.length : scale === "density" ? 1 / (values.length * bins.width) : 1;
  return histogram(values, bins).map((b) => ({ ...b, h: b.n * k }));
}

/** The normal curve's height at x, on the same scale as the histogram's bars. */
export function normalCurve(x: number, mean: number, sd: number, n: number, width: number, scale: HistScale = "count") {
  const pdf = Math.exp(-0.5 * ((x - mean) / sd) ** 2) / (sd * Math.sqrt(2 * Math.PI));
  return pdf * (scale === "density" ? 1 : scale === "percent" ? 100 * width : n * width);
}

/**
 * What the y-axis says for a one-list plot, as on the handheld: a histogram's
 * scale ("Frequency" for Count) and a normal probability plot's z-Quantile.
 * Dot and box plots have none: their y-axis still offers to add a variable.
 */
export function yAxisTitle(page: Pick<DataStatsPage, "plot" | "histScale">): string | undefined {
  if (page.plot === "histogram") return page.histScale === "percent" ? "Percent" : page.histScale === "density" ? "Density" : "Frequency";
  if (page.plot === "normprob") return "z-Quantile";
  return undefined;
}

/** Dot plot: each value's height in its stack (equal values stack up). */
export function dotStacks(values: number[]): [number, number][] {
  const seen = new Map<number, number>();
  return values.map((x) => {
    const h = (seen.get(x) ?? 0) + 1;
    seen.set(x, h);
    return [x, h];
  });
}

/** Normal probability plot: each sorted value against its normal score, z of (i − 0.5)/n. */
export function normalScores(values: number[]): [number, number][] {
  const v = values.slice().sort((a, b) => a - b);
  return v.map((x, i) => [x, invNorm((i + 0.5) / v.length)]);
}

/** Inverse standard normal (Acklam's approximation, relative error < 1.2e-9). */
export function invNorm(p: number): number {
  const a = [-39.69683028665376, 220.9460984245205, -275.9285104469687, 138.357751867269, -30.66479806614716, 2.506628277459239];
  const b = [-54.47609879822406, 161.5858368580409, -155.6989798598866, 66.80131188771972, -13.28068155288572];
  const c = [-0.007784894002430293, -0.3223964580411365, -2.400758277161838, -2.549732539343734, 4.374664141464968, 2.938163982698783];
  const d = [0.007784695709041462, 0.3224671290700398, 2.445134137142996, 3.754408661907416];
  const lo = 0.02425;
  if (p < lo) {
    const q = Math.sqrt(-2 * Math.log(p));
    return (((((c[0]! * q + c[1]!) * q + c[2]!) * q + c[3]!) * q + c[4]!) * q + c[5]!) / ((((d[0]! * q + d[1]!) * q + d[2]!) * q + d[3]!) * q + 1);
  }
  if (p > 1 - lo) return -invNorm(1 - p);
  const q = p - 0.5;
  const r = q * q;
  return ((((((a[0]! * r + a[1]!) * r + a[2]!) * r + a[3]!) * r + a[4]!) * r + a[5]!) * q) / (((((b[0]! * r + b[1]!) * r + b[2]!) * r + b[3]!) * r + b[4]!) * r + 1);
}

const pad = (lo: number, hi: number, k = 0.08): [number, number] => {
  const span = hi - lo || Math.abs(lo) || 1;
  return [lo - span * k, hi + span * k];
};

/** Which plots take one list and which take two. */
export const ONE_VAR: DataPlot[] = ["dot", "box", "histogram", "normprob"];

/** The window that fits the data for the page's plot (Zoom – Data). */
export function fitWindow(page: DataStatsPage, xs: number[], ys: number[]): GraphWindow {
  // A histogram's window takes in its bars' edges, not just the values, so the end bars show whole.
  const bars = page.plot === "histogram" ? histogram(xs, page.bins ?? autoBins(xs)) : [];
  const [xmin, xmax] = bars.length ? pad(bars[0]!.from, bars.at(-1)!.to, 0.04) : pad(Math.min(...xs), Math.max(...xs));
  let y: [number, number];
  if (page.plot === "dot") y = [0, Math.max(...dotStacks(xs).map(([, h]) => h)) + 1];
  else if (page.plot === "box") y = [0, 1];
  else if (page.plot === "histogram") y = [0, Math.max(...histogramBars(xs, page.bins ?? autoBins(xs), page.histScale).map((b) => b.h)) * 1.15];
  else if (page.plot === "normprob") y = pad(...([Math.min(...normalScores(xs).map((s) => s[1])), Math.max(...normalScores(xs).map((s) => s[1]))] as [number, number]));
  else y = pad(Math.min(...ys), Math.max(...ys));
  return { xmin, xmax, ymin: y[0], ymax: y[1], xscl: 1, yscl: 1 };
}

/** Round tick positions across [lo, hi]. */
export function ticks(lo: number, hi: number, target = 6): number[] {
  const raw = (hi - lo) / target;
  if (!(raw > 0) || !Number.isFinite(raw)) return [];
  const p = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 5, 10].map((k) => k * p).find((s) => s >= raw)!;
  const out: number[] = [];
  for (let t = Math.ceil(lo / step) * step; t <= hi + 1e-9; t += step) out.push(Math.abs(t) < step * 1e-9 ? 0 : t);
  return out;
}

/** A regression's own equation (from stats.ts or stats-tests.ts, our numbers) as a function of x. */
export function equationFn(eqn: string): (x: number) => number {
  const js = eqn
    .replace(/\^/g, "**")
    .replace(/\bln\(/g, "Math.log(")
    .replace(/\bsin\(/g, "Math.sin(")
    .replace(/ℯ\*\*/g, "Math.E**")
    // The logistic equation's −b with b already negative: "--" would be JavaScript's decrement.
    .replace(/-(?=-)/g, "- ");
  // Only digits, x, operators and those Math names come from our equations; anything else is refused.
  if (!/^[\d\s.e+\-*/()x]*$/.test(js.replace(/Math\.(log|sin|E)/g, ""))) return () => NaN;
  try {
    return new Function("x", `return ${js};`) as (x: number) => number;
  } catch {
    return () => NaN;
  }
}

/** Each point's residual from a curve: the point's y less the curve's, by x. */
export function residuals(pts: [number, number][], f: (x: number) => number): [number, number][] {
  return pts.map(([x, y]) => [x, y - f(x)] as [number, number]).filter(([, r]) => Number.isFinite(r));
}
