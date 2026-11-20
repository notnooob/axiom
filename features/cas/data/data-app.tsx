// SPDX-License-Identifier: GPL-3.0-or-later
import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { palette } from "@/shared/lib/tokens";
import type { Giac } from "../engine/evaluate";
import { regression } from "../engine/stats";
import { statProcedure } from "../engine/stats-tests";
import { RENAME_IN } from "../engine/translate";
import { parseNumbers } from "../graphs/analyze";
import type { GraphWindow } from "../graphs/model";
import type { DataStatsPage } from "../state/document";
import {
  autoBins,
  boxPlot,
  CAT_PLOTS,
  categoryCounts,
  categoryWindow,
  dotStacks,
  effectivePlot,
  equationFn,
  expandSummary,
  fitWindow,
  histogramBars,
  normalCurve,
  normalScores,
  ONE_VAR,
  parseValues,
  pieSlices,
  residuals,
  ticks,
  yAxisTitle,
} from "./plot";

/** The regressions worked out by the statistics procedures (an iterative fit) rather than stats.ts's closed forms. */
const ITERATIVE = new Set(["SinReg", "Logistic"]);

/** A function sampled at even steps (Plot Function's points), read between them. */
function sampled(f: [number, number][]): (x: number) => number {
  return (x) => {
    if (f.length < 2) return NaN;
    const step = f[1]![0] - f[0]![0];
    const i = Math.floor((x - f[0]![0]) / step);
    const a = f[i];
    const b = f[i + 1];
    if (!a) return NaN;
    if (!b) return Math.abs(x - a[0]) < 1e-9 ? a[1] : NaN;
    return a[1] + ((x - a[0]) / (b[0] - a[0])) * (b[1] - a[1]);
  };
}

const PLOT = "#2c64c8";
const STRIP = "#b8509c";
const FN = "#d6271c";
/** A pie chart's slices, in turn. */
const SLICES = ["#2c64c8", "#e0832a", "#3c9a4a", "#c8453c", "#8a5cc2", "#2aa3b8", "#c25c9e", "#9a8a2a"];

/** What each plot is called, for screen readers. */
const PLOT_NAMES: Record<DataStatsPage["plot"], string> = {
  dot: "dot plot",
  box: "box plot",
  histogram: "histogram",
  normprob: "normal probability plot",
  scatter: "scatter plot",
  xyline: "XY line plot",
  dotchart: "dot chart",
  bar: "bar chart",
  pie: "pie chart",
};

/** Text cut to fit a width, with an ellipsis, so long category names don't run into each other. */
function fit(g: CanvasRenderingContext2D, text: string, width: number): string {
  if (g.measureText(text).width <= width) return text;
  let t = text;
  while (t.length > 1 && g.measureText(`${t}…`).width > width) t = t.slice(0, -1);
  return `${t}…`;
}

/** A number as the page's Display Digits ask (Auto: up to 4 significant figures, trailing zeros dropped). */
export function shown(v: number, digits = "Auto"): string {
  if (!Number.isFinite(v)) return "undef";
  const m = /^Float(\d+)$/.exec(digits);
  const s = m ? v.toFixed(Number(m[1])) : String(Number(v.toPrecision(4)));
  return s.replace("-", "−");
}

/**
 * Data & Statistics: a list on the x-axis (dot plot, box plot, histogram,
 * normal probability plot) or two lists (scatter, XY line), with "Click to
 * add variable" along each axis, as the handheld lays it out. What Analyze
 * adds (a regression, a movable line, functions, values, a normal curve)
 * is drawn over the data.
 */
export function DataStatsApp({
  page,
  giac,
  ready,
  toGiac,
  onAxis,
  onMovable,
  onWindow,
  onCategorical,
}: {
  page: DataStatsPage;
  giac: Giac | null;
  ready: boolean;
  /** A typed expression (TI syntax) as the engine's own. */
  toGiac: (text: string) => string;
  onAxis: (axis: "x" | "y") => void;
  onMovable: (m: number, b: number) => void;
  /** The window as drawn, for Zoom In/Out and Window Settings. */
  onWindow: (w: GraphWindow | null) => void;
  /** Whether the x list is categorical (text), which changes the plots the menu offers. */
  onCategorical?: (categorical: boolean) => void;
}) {
  const [data, setData] = useState<{ x: { nums: number[]; cats?: string[] }; ys: number[]; freq: number[] }>({ x: { nums: [] }, ys: [], freq: [] });
  const [extra, setExtra] = useState<{
    fns: [number, number][][];
    values: { at: number; label: string }[];
    shade?: { pts: [number, number][]; area: number };
  }>({ fns: [], values: [] });
  const box = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // The lists' values, fetched afresh when the page's variables change (edits on a Lists page show when this page next opens).
  useEffect(() => {
    if (!giac || !ready) return;
    let cancelled = false;
    void (async () => {
      const raw = async (name?: string) => (name ? await giac(`evalf(${RENAME_IN[name] ?? name})`) : "");
      const x = parseValues(await raw(page.x));
      const ys = parseNumbers(await raw(page.y));
      const freq = parseNumbers(await raw(page.ySummary));
      if (!cancelled) setData({ x, ys, freq });
    })();
    return () => {
      cancelled = true;
    };
  }, [giac, ready, page.x, page.y, page.ySummary]);

  // A list of text is categorical: it makes dot charts, bar charts and pie charts, not dot plots.
  const categorical = Boolean(data.x.cats);
  const plot = effectivePlot(page, categorical);
  const tellCategorical = useRef(onCategorical);
  tellCategorical.current = onCategorical;
  useEffect(() => {
    tellCategorical.current?.(categorical);
  }, [categorical]);
  const one = ONE_VAR.includes(plot) || CAT_PLOTS.includes(plot);
  const { cats } = data.x;
  // Each category's count (or its summary list's total), in the page's Sort order.
  const counts = useMemo(() => (cats ? categoryCounts(cats, page.ySummary ? data.freq : undefined, page.sort) : null), [cats, page.ySummary, data.freq, page.sort]);
  // A summary list counts each value that many times; it has to hold whole numbers to do that.
  const expanded = useMemo(() => (!cats && page.ySummary ? expandSummary(data.x.nums, data.freq) : null), [cats, page.ySummary, data.x.nums, data.freq]);
  const badSummary = Boolean(!cats && page.ySummary && !expanded);
  // Categorical values become their category's column number (0, 1 …), so a y list plots in columns.
  const xs = useMemo(() => {
    if (cats && counts) {
      const at = new Map(counts.map((c, i) => [c.name, i]));
      return cats.map((c) => at.get(c) ?? NaN);
    }
    return expanded ?? (page.ySummary ? [] : data.x.nums);
  }, [cats, counts, expanded, page.ySummary, data.x.nums]);
  // Kept between renders, so what's worked out from them (the regression, the drawing) isn't redone each time.
  const ys = useMemo(() => (one ? [] : data.ys.slice(0, xs.length)), [one, data.ys, xs.length]);
  const pts = useMemo(
    () =>
      one
        ? []
        : xs
            .slice(0, ys.length)
            .map((x, i) => [x, ys[i]!] as [number, number])
            .filter(([x, y]) => Number.isFinite(x) && Number.isFinite(y)),
    [one, xs, ys],
  );
  const usable = (counts ? counts.length > 0 : xs.length > 0) && (one || pts.length > 0);
  const fitted = useMemo(() => {
    if (!usable) return null;
    if (counts && one) return categoryWindow(counts, plot);
    // Categories against a y list: a column for each category, the y list's spread up the side.
    if (counts) return { ...fitWindow({ ...page, plot }, pts.map((p) => p[0]), pts.map((p) => p[1])), xmin: -0.6, xmax: counts.length - 0.4 };
    return fitWindow({ ...page, plot }, xs, ys);
  }, [usable, counts, one, plot, page, pts, xs, ys]);
  const w: GraphWindow | null = page.window ?? fitted;
  const tellWindow = useRef(onWindow);
  tellWindow.current = onWindow;
  useEffect(() => {
    // A block, not an arrow's value: React would take what onWindow returns for a clean-up.
    tellWindow.current(w);
  }, [w]);

  // Plot Function and Plot Value: worked out by the engine over the window.
  const fnKey = JSON.stringify([page.functions, page.values, page.shade, w && [w.xmin, w.xmax], xs.length]);
  useEffect(() => {
    if (!giac || !ready || !w) return;
    let cancelled = false;
    void (async () => {
      const fns: [number, number][][] = [];
      for (const f of page.functions ?? []) {
        try {
          const step = (w.xmax - w.xmin) / 120;
          const ys2 = parseNumbers(await giac(`evalf(seq(${toGiac(f)},x,${w.xmin},${w.xmax},${step}))`));
          fns.push(ys2.map((y, i) => [w.xmin + i * step, y]));
        } catch {
          fns.push([]);
        }
      }
      const values: { at: number; label: string }[] = [];
      for (const v of page.values ?? []) {
        try {
          const at = parseNumbers(await giac(`evalf(${toGiac(v)})`))[0];
          if (at !== undefined) values.push({ at, label: `${v} = ${shown(at, page.digits)}` });
        } catch {
          // A value that doesn't work out isn't drawn.
        }
      }
      // Shade Under Function: the curve between the bounds, and the area the engine works out under it.
      let shade: { pts: [number, number][]; area: number } | undefined;
      const s = page.shade;
      const f = s ? page.functions?.[s.fn] : undefined;
      if (s && f) {
        try {
          const [a, b] = parseNumbers(await giac(`evalf([${toGiac(s.from)},${toGiac(s.to)}])`));
          if (Number.isFinite(a) && Number.isFinite(b) && a !== b) {
            const lo = Math.min(a!, b!);
            const step = (Math.max(a!, b!) - lo) / 100;
            const ys2 = parseNumbers(await giac(`evalf(seq(${toGiac(f)},x,${lo},${lo + 100 * step},${step}))`));
            const area = parseNumbers(await giac(`evalf(int(${toGiac(f)},x,${a},${b}))`))[0];
            shade = { pts: ys2.slice(0, 101).map((y, i) => [lo + i * step, y]), area: area ?? NaN };
          }
        } catch {
          // Bounds that don't work out shade nothing.
        }
      }
      if (!cancelled) setExtra({ fns, values, shade });
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fnKey stands for them
  }, [giac, ready, fnKey]);

  const reg = useMemo(() => {
    // Categories have no numeric x for a regression to fit.
    if (!page.regression || pts.length < 2 || counts) return null;
    try {
      const [rx, ry] = [pts.map((p) => p[0]), pts.map((p) => p[1])];
      const r = ITERATIVE.has(page.regression) ? statProcedure(page.regression, [rx, ry]) : regression(page.regression, rx, ry);
      const r2 = r.rows.find(([k]) => k === "r²" || k === "R²");
      return { eqn: r.regEqn ?? "", r2: typeof r2?.[1] === "number" ? r2[1] : undefined };
    } catch {
      return null;
    }
  }, [page.regression, pts, counts]);

  // What residuals are measured from, as the handheld picks: the regression, else the movable line, else the first function.
  const movable = page.movable;
  const firstFn = extra.fns[0];
  const against = useMemo<((x: number) => number) | null>(() => {
    if (one) return null;
    if (reg) return equationFn(reg.eqn);
    if (movable) return (x) => movable.m * x + movable.b;
    if (firstFn?.length) return sampled(firstFn);
    return null;
  }, [one, reg, movable, firstFn]);
  const resid = useMemo(() => (against ? residuals(pts, against) : []), [against, pts]);
  const residualPlot = Boolean(page.residualPlot && against && resid.length);

  // Movable line: dragging near its middle slides it, nearer an end turns it about the middle.
  const drag = useRef<{ mode: "slide" | "turn"; cx: number } | null>(null);
  const toWorld = (e: ReactPointerEvent) => {
    const r = canvas.current!.getBoundingClientRect();
    // With the residual plot under it, the data fills the top two thirds.
    const h = residualPlot ? r.height * (2 / 3) : r.height;
    return { x: w!.xmin + ((e.clientX - r.left) / r.width) * (w!.xmax - w!.xmin), y: w!.ymax - ((e.clientY - r.top) / h) * (w!.ymax - w!.ymin) };
  };

  useEffect(() => {
    const c = canvas.current;
    if (!c || !size.w || !size.h) return;
    const dpr = window.devicePixelRatio || 1;
    c.width = size.w * dpr;
    c.height = size.h * dpr;
    const g = c.getContext("2d");
    if (!g) return;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.fillStyle = palette.casScreen;
    g.fillRect(0, 0, size.w, size.h);
    const fs = Math.max(9, size.w * 0.028);
    g.font = `${fs}px "Source Sans 3 Variable", sans-serif`;
    if (!w) {
      g.fillStyle = palette.casInk;
      g.textAlign = "center";
      g.font = `${fs * 1.4}px "STIX Two Text Variable", serif`;
      g.fillText(
        badSummary ? "Frequencies must be whole numbers" : page.x || page.y ? "No data in this variable" : "No lists in this problem",
        size.w / 2,
        size.h / 2,
      );
      return;
    }

    // A pie chart has no axes: each category's slice, named, clockwise from the top.
    if (plot === "pie" && counts) {
      const total = counts.reduce((n, c) => n + c.n, 0);
      const cx = size.w / 2;
      const cy = size.h / 2;
      const r = Math.min(size.w, size.h) * 0.34;
      pieSlices(counts).forEach((sl, i) => {
        g.fillStyle = SLICES[i % SLICES.length]!;
        g.beginPath();
        g.moveTo(cx, cy);
        g.arc(cx, cy, r, sl.from, sl.to);
        g.closePath();
        g.fill();
        g.strokeStyle = palette.casScreen;
        g.lineWidth = 1.5;
        g.stroke();
        if (!sl.share) return;
        const mid = (sl.from + sl.to) / 2;
        const lx = cx + Math.cos(mid) * r * 1.1;
        const ly = cy + Math.sin(mid) * r * 1.1;
        g.fillStyle = palette.casInk;
        g.textAlign = Math.cos(mid) > 0.15 ? "left" : Math.cos(mid) < -0.15 ? "right" : "center";
        const room = Math.cos(mid) > 0.15 ? size.w - lx : Math.cos(mid) < -0.15 ? lx : size.w;
        // Show All Labels adds each slice's count and share of the whole.
        const text = page.labels ? `${sl.name}: ${shown(sl.n, page.digits)} (${shown((sl.n / (total || 1)) * 100, page.digits)}%)` : sl.name;
        g.fillText(fit(g, text, room - fs * 0.3), lx, ly + (Math.sin(mid) > 0.5 ? fs * 0.8 : Math.sin(mid) < -0.5 ? 0 : fs * 0.35));
      });
      return;
    }

    // One-list plots stand on the x-axis with its numbers under it; two-list plots put the axes through 0.
    // Show Residual Plot gives the lower third to the residuals.
    const plotH = one ? size.h - fs * 1.6 : residualPlot ? size.h * (2 / 3) : size.h;
    const X = (x: number) => ((x - w.xmin) / (w.xmax - w.xmin)) * size.w;
    const Y = (y: number) => ((w.ymax - y) / (w.ymax - w.ymin)) * plotH;

    // Grid behind everything: a line at every x tick (not between categories), and every y tick where
    // y means something (a histogram's or bar chart's scale, a normal probability plot's z; not dot or box plots).
    const yMeans = !one || plot === "histogram" || plot === "normprob" || plot === "bar";
    g.strokeStyle = palette.casRule;
    g.lineWidth = 0.5;
    g.beginPath();
    if (!counts)
      for (const t of ticks(w.xmin, w.xmax)) {
        g.moveTo(X(t), 0);
        g.lineTo(X(t), plotH);
      }
    if (yMeans)
      for (const t of ticks(w.ymin, w.ymax)) {
        g.moveTo(0, Y(t));
        g.lineTo(size.w, Y(t));
      }
    g.stroke();

    // Axes and tick labels.
    g.strokeStyle = palette.casInk;
    g.fillStyle = palette.casLabel;
    g.lineWidth = 1;
    const base = one ? plotH : Y(Math.max(w.ymin, Math.min(w.ymax, 0)));
    g.beginPath();
    g.moveTo(0, base);
    g.lineTo(size.w, base);
    // Categories have no x = 0: the y-axis stays at the left edge.
    const left = counts ? 0 : X(Math.max(w.xmin, Math.min(w.xmax, 0)));
    if (!one) {
      g.moveTo(left, 0);
      g.lineTo(left, plotH);
    }
    g.stroke();
    g.textAlign = "center";
    if (counts) {
      // Each category's name under its column (above the axis for a y list, as numbers are).
      const room = X(1) - X(0) - fs * 0.3;
      counts.forEach((c, i) => {
        if (X(i) < 0 || X(i) > size.w) return;
        g.fillText(fit(g, c.name, room), X(i), one ? base + fs * 1.3 : plotH - fs * 0.4);
      });
    } else
      for (const t of ticks(w.xmin, w.xmax)) {
        g.beginPath();
        g.moveTo(X(t), base);
        g.lineTo(X(t), base + (one ? fs * 0.4 : -fs * 0.4));
        g.stroke();
        g.fillText(shown(t), X(t), one ? base + fs * 1.3 : base - fs * 0.6);
      }
    if (!one) {
      g.textAlign = "left";
      for (const t of ticks(w.ymin, w.ymax)) if (t !== 0 || counts) g.fillText(shown(t), left + fs * 0.3, Y(t) + fs * 0.35);
    } else if (yMeans) {
      // A histogram's frequencies (or a normal probability plot's z) up the left edge, as the handheld numbers them.
      g.textAlign = "left";
      for (const t of ticks(w.ymin, w.ymax)) {
        const y = Y(t);
        if (y < fs * 0.8 || y > plotH - fs * 0.3) continue;
        g.beginPath();
        g.moveTo(0, y);
        g.lineTo(fs * 0.4, y);
        g.stroke();
        g.fillText(shown(t), fs * 0.55, y + fs * 0.35);
      }
    }

    const dot = (x: number, y: number, r = Math.max(2.5, size.w * 0.008)) => {
      g.beginPath();
      g.arc(x, y, r, 0, Math.PI * 2);
      g.fill();
    };
    g.fillStyle = g.strokeStyle = PLOT;

    if (plot === "dotchart" && counts) {
      // A stack of dots over each category, one for each time it appears; tall stacks get smaller dots to fit.
      const most = Math.max(1, ...counts.map((c) => Math.round(c.n)));
      const r = Math.min(Math.max(3, size.w * 0.009), (plotH - fs) / (most * 2.3));
      counts.forEach((c, i) => {
        for (let h = 1; h <= Math.round(c.n); h++) dot(X(i), plotH - 2 - (h - 0.5) * r * 2.3, r);
      });
    } else if (plot === "bar" && counts) {
      const half = (X(1) - X(0)) * 0.32;
      counts.forEach((c, i) => {
        g.fillStyle = "#9dbfea";
        g.fillRect(X(i) - half, Y(c.n), half * 2, Y(0) - Y(c.n));
        g.strokeStyle = PLOT;
        g.strokeRect(X(i) - half, Y(c.n), half * 2, Y(0) - Y(c.n));
        if (page.labels) {
          g.fillStyle = palette.casInk;
          g.textAlign = "center";
          g.fillText(shown(c.n, page.digits), X(i), Y(c.n) - fs * 0.3);
        }
      });
    } else if (plot === "dot") {
      const r = Math.max(3, size.w * 0.009);
      for (const [x, h] of dotStacks(xs)) dot(X(x), plotH - 2 - (h - 0.5) * r * 2.3, r);
    } else if (plot === "box") {
      const b = boxPlot(xs, page.extendWhiskers);
      const mid = plotH * 0.5;
      const half = plotH * 0.14;
      g.lineWidth = 1.5;
      g.strokeRect(X(b.q1), mid - half, X(b.q3) - X(b.q1), half * 2);
      g.beginPath();
      g.moveTo(X(b.median), mid - half);
      g.lineTo(X(b.median), mid + half);
      g.moveTo(X(b.lo), mid);
      g.lineTo(X(b.q1), mid);
      g.moveTo(X(b.q3), mid);
      g.lineTo(X(b.hi), mid);
      g.stroke();
      for (const o of b.outliers) {
        g.beginPath();
        g.moveTo(X(o) - 4, mid - 4);
        g.lineTo(X(o) + 4, mid + 4);
        g.moveTo(X(o) + 4, mid - 4);
        g.lineTo(X(o) - 4, mid + 4);
        g.stroke();
      }
    } else if (plot === "histogram") {
      const bins = page.bins ?? autoBins(xs);
      for (const bin of histogramBars(xs, bins, page.histScale)) {
        g.fillStyle = "#9dbfea";
        g.fillRect(X(bin.from), Y(bin.h), X(bin.to) - X(bin.from), Y(0) - Y(bin.h));
        g.strokeStyle = PLOT;
        g.strokeRect(X(bin.from), Y(bin.h), X(bin.to) - X(bin.from), Y(0) - Y(bin.h));
        if (page.labels) {
          g.fillStyle = palette.casInk;
          g.textAlign = "center";
          g.fillText(shown(bin.h, page.digits), (X(bin.from) + X(bin.to)) / 2, Y(bin.h) - fs * 0.3);
        }
      }
      if (page.normalPdf && xs.length > 1) {
        // The normal curve with the data's mean and sd, on the bars' scale.
        const mean = xs.reduce((a, b) => a + b, 0) / xs.length;
        const sd = Math.sqrt(xs.reduce((a, b) => a + (b - mean) ** 2, 0) / (xs.length - 1));
        g.strokeStyle = "#1e8c2f";
        g.lineWidth = 1.5;
        g.beginPath();
        for (let i = 0; i <= 160; i++) {
          const x = w.xmin + ((w.xmax - w.xmin) * i) / 160;
          const y = normalCurve(x, mean, sd, xs.length, bins.width, page.histScale);
          if (i) g.lineTo(X(x), Y(y));
          else g.moveTo(X(x), Y(y));
        }
        g.stroke();
      }
    } else if (plot === "normprob") {
      for (const [x, z] of normalScores(xs)) dot(X(x), Y(z));
    } else {
      const ordered = pts.slice().sort((a, b) => a[0] - b[0]);
      if (plot === "xyline" || page.connect) {
        g.lineWidth = 1.2;
        g.beginPath();
        ordered.forEach(([x, y], i) => (i ? g.lineTo(X(x), Y(y)) : g.moveTo(X(x), Y(y))));
        g.stroke();
      }
      for (const [x, y] of pts) dot(X(x), Y(y));
    }

    // What Analyze added, with its equation written at the top, as on the handheld.
    const labels: { text: string; colour: string }[] = [];
    const curve = (f: (x: number) => number, colour: string) => {
      g.strokeStyle = colour;
      g.lineWidth = 1.6;
      g.beginPath();
      let on = false;
      for (let i = 0; i <= 200; i++) {
        const x = w.xmin + ((w.xmax - w.xmin) * i) / 200;
        const y = f(x);
        if (!Number.isFinite(y)) {
          on = false;
          continue;
        }
        if (on) g.lineTo(X(x), Y(y));
        else g.moveTo(X(x), Y(y));
        on = true;
      }
      g.stroke();
    };
    if (reg) {
      curve(equationFn(reg.eqn), "#1f4fd8");
      labels.push({ text: `y = ${reg.eqn.replace(/(-?\d+\.\d{5,})/g, (n) => shown(Number(n), page.digits)).replace(/\*/g, "·").replace(/\+[-−]/g, "−")}`, colour: "#1f4fd8" });
      if (page.diagnostics && reg.r2 !== undefined) labels.push({ text: `r² = ${shown(reg.r2, page.digits)}`, colour: "#1f4fd8" });
    }
    if (page.movable) {
      const { m, b } = page.movable;
      curve((x) => m * x + b, "#555");
      labels.push({ text: `y = ${shown(m, page.digits)}·x ${b < 0 ? "−" : "+"} ${shown(Math.abs(b), page.digits)}`, colour: "#555" });
    }
    if (extra.shade) {
      const sp = extra.shade.pts.filter(([, y]) => Number.isFinite(y));
      if (sp.length > 1) {
        g.fillStyle = "rgba(214, 39, 28, 0.18)";
        g.beginPath();
        g.moveTo(X(sp[0]![0]), Y(0));
        for (const [x, y] of sp) g.lineTo(X(x), Y(y));
        g.lineTo(X(sp.at(-1)![0]), Y(0));
        g.closePath();
        g.fill();
        labels.push({ text: `Area = ${shown(extra.shade.area, page.digits)}`, colour: FN });
      }
    }
    extra.fns.forEach((f, i) => {
      g.strokeStyle = FN;
      g.lineWidth = 1.6;
      g.beginPath();
      f.forEach(([x, y], j) => (j && Number.isFinite(y) ? g.lineTo(X(x), Y(y)) : g.moveTo(X(x), Y(y))));
      g.stroke();
      labels.push({ text: `f(x) = ${page.functions?.[i]}`, colour: FN });
    });
    for (const v of extra.values) {
      g.strokeStyle = "#1e8c2f";
      g.lineWidth = 1.4;
      g.beginPath();
      g.moveTo(X(v.at), 0);
      g.lineTo(X(v.at), plotH);
      g.stroke();
      labels.push({ text: v.label, colour: "#1e8c2f" });
    }
    // Residuals: from the regression, else the movable line, else the first plotted function.
    if (against && resid.length) {
      const f = against;
      if (page.residualSquares) {
        g.strokeStyle = "#8a5cc2";
        g.fillStyle = "rgba(138, 92, 194, 0.15)";
        g.lineWidth = 1;
        let sum = 0;
        for (const [x, r] of resid) {
          sum += r * r;
          // A square on screen: as wide as the gap is tall.
          const side = Math.abs(Y(f(x)) - Y(f(x) + r));
          g.fillRect(X(x), Math.min(Y(f(x)), Y(f(x) + r)), side, side);
          g.strokeRect(X(x), Math.min(Y(f(x)), Y(f(x) + r)), side, side);
        }
        labels.push({ text: `Sum of squares = ${shown(sum, page.digits)}`, colour: "#8a5cc2" });
      }
      if (residualPlot) {
        const top = plotH + fs * 0.4;
        const h = size.h - top - fs * 0.3;
        const big = Math.max(...resid.map(([, r]) => Math.abs(r)), 1e-9) * 1.15;
        const RY = (r: number) => top + h / 2 - (r / big) * (h / 2);
        g.strokeStyle = palette.casInk;
        g.lineWidth = 1;
        g.beginPath();
        g.moveTo(0, plotH);
        g.lineTo(size.w, plotH);
        g.stroke();
        g.strokeStyle = palette.casRule;
        g.beginPath();
        g.moveTo(0, RY(0));
        g.lineTo(size.w, RY(0));
        g.stroke();
        g.fillStyle = PLOT;
        for (const [x, r] of resid) dot(X(x), RY(r));
        g.fillStyle = palette.casLabel;
        g.textAlign = "left";
        g.fillText(`residual (±${shown(big, page.digits)})`, fs * 0.3, top + fs * 0.9);
      }
    }

    g.textAlign = "right";
    labels.forEach((l, i) => {
      g.fillStyle = l.colour;
      g.fillText(l.text, size.w - fs * 0.5, fs * (1.3 + i * 1.25));
    });
  }, [size, w, page, plot, counts, badSummary, xs, ys, pts, one, reg, extra, against, resid, residualPlot]);

  // A one-list plot's y-axis names what it measures (Frequency, z-Quantile …) when there's a list on x.
  const yTitle = one && page.x && !page.ySummary ? yAxisTitle({ ...page, plot }) : undefined;
  const axisLabel = (axis: "x" | "y") => {
    const name = axis === "x" ? page.x : (page.y ?? page.ySummary);
    const title = axis === "y" ? yTitle : undefined;
    return (
      <button
        type="button"
        tabIndex={-1}
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => onAxis(axis)}
        aria-label={title ? `y-axis: ${title}; add a y variable` : name ? `${axis} variable ${name}; change` : `Add ${axis} variable`}
        className={
          axis === "x"
            ? "flex h-[7cqw] w-full items-center justify-center bg-[#dcdcdc] text-[3.6cqw] text-casLabel"
            : "flex h-full w-[7cqw] items-center justify-center bg-[#dcdcdc] text-[3.6cqw] text-casLabel"
        }
      >
        <span className={axis === "y" ? "-rotate-90 whitespace-nowrap" : ""}>
          {name && (axis === "x" || !one || page.ySummary) ? (
            <b className="font-casmath text-[1.1em] text-casInk">{name}</b>
          ) : title ? (
            <span className="text-casInk">{title}</span>
          ) : (
            "Click to add variable"
          )}
        </span>
      </button>
    );
  };

  return (
    <div className="absolute inset-0 flex flex-col bg-casScreen font-casui">
      <div aria-hidden className="h-[0.8cqw] shrink-0" style={{ background: STRIP }} />
      <div className="flex min-h-0 flex-1">
        {axisLabel("y")}
        <div ref={box} className="relative min-w-0 flex-1">
          <canvas
            ref={canvas}
            className="absolute inset-0 h-full w-full"
            aria-label={`Data and statistics: ${PLOT_NAMES[plot]}${page.x ? ` of ${page.x}` : ""}${page.y && !one ? ` against ${page.y}` : ""}${page.ySummary ? `, summary list ${page.ySummary}` : ""}${yTitle ? `, ${yTitle} on the y-axis` : ""}${counts ? `: ${counts.map((c) => `${c.name} ${shown(c.n, page.digits)}`).join(", ")}` : ""}`}
            onPointerDown={(e) => {
              if (!page.movable || !w) return;
              const p = toWorld(e);
              const { m, b } = page.movable;
              if (Math.abs(m * p.x + b - p.y) > (w.ymax - w.ymin) * 0.08) return;
              const cx = (w.xmin + w.xmax) / 2;
              drag.current = { mode: page.movable.lock || Math.abs(p.x - cx) > (w.xmax - w.xmin) * 0.2 ? "turn" : "slide", cx };
              e.currentTarget.setPointerCapture(e.pointerId);
            }}
            onPointerMove={(e) => {
              const d = drag.current;
              if (!d || !page.movable || !w) return;
              const p = toWorld(e);
              const { m, b, lock } = page.movable;
              if (lock) onMovable(p.x ? p.y / p.x : m, 0);
              else if (d.mode === "slide") onMovable(m, p.y - m * p.x);
              else {
                // Turn about the line's point at the middle of the window.
                const cy = m * d.cx + b;
                const m2 = p.x !== d.cx ? (p.y - cy) / (p.x - d.cx) : m;
                onMovable(m2, cy - m2 * d.cx);
              }
            }}
            onPointerUp={() => {
              drag.current = null;
            }}
          />
        </div>
      </div>
      <div className="flex shrink-0">
        <div className="w-[7cqw] bg-[#dcdcdc]" />
        {axisLabel("x")}
      </div>
    </div>
  );
}
