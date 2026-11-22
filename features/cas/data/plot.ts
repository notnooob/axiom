// SPDX-License-Identifier: GPL-3.0-or-later
/**
 * Data & Statistics, the numbers behind each plot: five-number summaries and
 * outliers for box plots, histogram bins, dot-plot stacks, normal scores,
 * and the window that fits the data. Pure, so they're tested on their own.
 */
import type { GraphWindow } from "../graphs/model";
import type { CategoryOrder, DataPlot, DataStatsPage, HistScale } from "../state/document";

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
  if (page.plot === "bar") return "Frequency";
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
/** The plots for categorical data (a list of text). */
export const CAT_PLOTS: DataPlot[] = ["dotchart", "bar", "pie"];

/**
 * A list's values as the engine prints them: numbers, or, when the list
 * holds any text, categories, as the handheld treats a column of strings.
 * In a categorical list a number is a category too, and undef (an empty
 * cell) is "", kept so the values still line up with a summary list.
 */
export function parseValues(raw: string): { nums: number[]; cats?: string[] } {
  const body = raw.trim().replace(/^\[|\]$/g, "");
  if (!body) return { nums: [] };
  const items: string[] = [];
  let cur = "";
  let quoted = false;
  for (let i = 0; i < body.length; i++) {
    const ch = body[i]!;
    if (ch === '"' && body[i - 1] !== "\\") quoted = !quoted;
    if (ch === "," && !quoted) {
      items.push(cur.trim());
      cur = "";
    } else cur += ch;
  }
  items.push(cur.trim());
  const text = (s: string) => /^".*"$/s.test(s);
  if (!items.some(text)) return { nums: toNumbers(items) };
  const cats = items.map((s) => {
    if (!s || s === "undef") return "";
    if (text(s)) return s.slice(1, -1).replace(/\\"/g, '"');
    const n = toNumbers([s])[0]!;
    return Number.isNaN(n) ? s : String(n);
  });
  return { nums: [], cats };
}

function toNumbers(items: string[]): number[] {
  return items.map((s) => {
    // Giac prints a negative zero as "0.-000000000000000".
    if (/^0\.-0+$/.test(s)) return 0;
    const v = s.replace(/e\+?/, "e");
    return /^-?[\d.]+(e-?\d+)?$/.test(v) ? Number(v) : NaN;
  });
}

/**
 * Each category and how many there are, in the order asked for (Sort):
 * as they first appear in the list, most first, or A–Z. With a summary
 * list, each category counts its summary value instead of 1.
 */
export function categoryCounts(cats: string[], summary?: number[], order: CategoryOrder = "list"): { name: string; n: number }[] {
  const counts = new Map<string, number>();
  cats.forEach((c, i) => {
    if (!c) return;
    const k = summary ? summary[i] : 1;
    if (k === undefined || !Number.isFinite(k)) return;
    counts.set(c, (counts.get(c) ?? 0) + k);
  });
  const out = [...counts].map(([name, n]) => ({ name, n }));
  // Value Order puts the biggest first, so a bar chart reads as a Pareto chart.
  if (order === "value") out.sort((a, b) => b.n - a.n);
  else if (order === "alpha") out.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
  return out;
}

/** A pie chart's slices, clockwise from the top: each one's share and its start and end angles (radians). */
export function pieSlices(counts: { name: string; n: number }[]) {
  const total = counts.reduce((s, c) => s + Math.max(0, c.n), 0) || 1;
  let at = -Math.PI / 2;
  return counts.map((c) => {
    const share = Math.max(0, c.n) / total;
    const slice = { ...c, share, from: at, to: at + share * Math.PI * 2 };
    at = slice.to;
    return slice;
  });
}

/**
 * Each value repeated as often as its summary (frequency) list says, for the
 * one-list plots. Frequencies must be whole numbers, 0 or more; returns
 * null when one isn't.
 */
export function expandSummary(values: number[], freq: number[]): number[] | null {
  const out: number[] = [];
  for (let i = 0; i < Math.min(values.length, freq.length); i++) {
    const k = freq[i]!;
    if (!Number.isInteger(k) || k < 0) return null;
    for (let j = 0; j < k; j++) out.push(values[i]!);
  }
  return out;
}

/**
 * The plot drawn for the data: a page keeps the plot it was given, but a
 * categorical list can't make a dot plot and numbers can't make a pie chart,
 * so each falls back to the handheld's default for its kind of data (a dot
 * chart, or a bar chart from a summary list; a dot plot, or a histogram from one).
 */
export function effectivePlot(page: Pick<DataStatsPage, "plot" | "y" | "ySummary">, categorical: boolean): DataPlot {
  if (categorical) {
    // A numeric y against categories plots each category's values in its own column.
    if (page.y) return "scatter";
    return CAT_PLOTS.includes(page.plot) ? page.plot : page.ySummary ? "bar" : "dotchart";
  }
  if (CAT_PLOTS.includes(page.plot)) return page.ySummary ? "histogram" : page.y ? "scatter" : "dot";
  return page.plot;
}

/** A dot or bar chart's window: a column for each category, and room above the tallest. */
export function categoryWindow(counts: { n: number }[], plot: DataPlot): GraphWindow {
  const top = Math.max(1, ...counts.map((c) => c.n));
  return { xmin: -0.6, xmax: counts.length - 0.4, ymin: 0, ymax: plot === "dotchart" ? top + 1 : top * 1.15, xscl: 1, yscl: 1 };
}

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

/** A list's values: numbers, or categories (text). */
export type Values = { nums: number[]; cats?: string[] };

/**
 * Force Numeric (text such as "12" read as the number 12; other text is
 * left out) and Force Categorical (each number a category of its own).
 */
export function forceValues(v: Values, force?: "num" | "cat"): Values {
  if (force === "num" && v.cats) return { nums: v.cats.map((c) => (c.trim() ? Number(c.replace(/−/g, "-")) : NaN)) };
  if (force === "cat" && !v.cats) return { nums: [], cats: v.nums.map((n) => (Number.isFinite(n) ? String(n) : "")) };
  return v;
}

/**
 * Which list the plot is of, as the handheld lays it out: x alone plots
 * along the x-axis, y alone up the y-axis. With both, numbers on one axis
 * and categories on the other plot the numbers in a column (or row) for
 * each category; two lists of numbers make a scatter plot. two: there's a
 * second list. Two categorical lists can't be plotted against each other.
 */
export function layoutOf(x: Values | null, y: Values | null): { main: "x" | "y"; two: boolean } | "bothCat" | null {
  if (!x && !y) return null;
  if (x && !y) return { main: "x", two: false };
  if (!x && y) return { main: "y", two: false };
  if (x!.cats && y!.cats) return "bothCat";
  return { main: !x!.cats && y!.cats ? "y" : "x", two: true };
}

/** Variable Bin Width: a bar between each pair of boundaries (the last takes its right edge too), scaled as Histogram Scale asks. */
export function edgeBars(values: number[], edges: number[], scale: HistScale = "count") {
  const e = [...new Set(edges.filter(Number.isFinite))].sort((a, b) => a - b);
  const n = values.length || 1;
  return e.slice(0, -1).map((from, i) => {
    const to = e[i + 1]!;
    const last = i === e.length - 2;
    const count = values.filter((v) => v >= from && (v < to || (last && v === to))).length;
    const h = scale === "percent" ? (count * 100) / n : scale === "density" ? count / (n * (to - from)) : count;
    return { from, to, n: count, h };
  });
}

/** Split Categories by Variable: the values in each category of the split list, in the order the categories first appear. */
export function splitGroups(values: number[], groups: string[]): { name: string; values: number[] }[] {
  const out = new Map<string, number[]>();
  values.forEach((v, i) => {
    const g = groups[i];
    if (!g || !Number.isFinite(v)) return;
    out.set(g, [...(out.get(g) ?? []), v]);
  });
  return [...out].map(([name, vs]) => ({ name, values: vs }));
}

/** A window across: x and y swapped, for a plot drawn up the y-axis. */
export const swapWindow = (w: GraphWindow): GraphWindow => ({ xmin: w.ymin, xmax: w.ymax, ymin: w.xmin, ymax: w.xmax, xscl: w.yscl, yscl: w.xscl });

/** Plots drawn as points, which Select All Points and clicking work on. */
export const POINT_PLOTS: DataPlot[] = ["dot", "normprob", "scatter", "xyline", "dotchart"];

/** What the page's lists turned out to be, which the menu needs and only the fetched data can tell. */
export type DataInfo = {
  /** Whether each list holds text, before Force Numeric or Force Categorical. */
  xText: boolean;
  yText: boolean;
  /** The list the plot is of (null: none), whether it's categorical after forcing, and whether there's a second list. */
  main: "x" | "y" | null;
  categorical: boolean;
  two: boolean;
};
export const NO_INFO: DataInfo = { xText: false, yText: false, main: null, categorical: false, two: false };

/** The page as its main list sees it: the other list as y, and the summary list on the other axis. */
export function logicalPage(p: DataStatsPage, info: Pick<DataInfo, "main" | "two">): Pick<DataStatsPage, "plot" | "y" | "ySummary"> {
  return { plot: p.plot, y: info.two ? (info.main === "y" ? p.x : p.y) : undefined, ySummary: info.main === "y" ? p.xSummary : p.ySummary };
}
