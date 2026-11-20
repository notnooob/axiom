// SPDX-License-Identifier: GPL-3.0-or-later
import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { palette } from "@/shared/lib/tokens";
import type { Giac } from "../engine/evaluate";
import { regression } from "../engine/stats";
import { statProcedure } from "../engine/stats-tests";
import { RENAME_IN } from "../engine/translate";
import { parseNumbers } from "../graphs/analyze";
import { SliderMenu } from "../graphs/graphs-app";
import type { GraphWindow } from "../graphs/model";
import { SliderView } from "../graphs/sliders";
import type { DataStatsPage } from "../state/document";
import {
  autoBins,
  boxPlot,
  CAT_PLOTS,
  categoryCounts,
  categoryWindow,
  dotStacks,
  edgeBars,
  effectivePlot,
  equationFn,
  expandSummary,
  fitWindow,
  forceValues,
  histogramBars,
  layoutOf,
  logicalPage,
  normalCurve,
  normalScores,
  ONE_VAR,
  parseValues,
  pieSlices,
  POINT_PLOTS,
  residuals,
  splitGroups,
  swapWindow,
  ticks,
  yAxisTitle,
  type DataInfo,
  type Values,
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
const SELECTED = "#e0832a";
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

/** A place Graph Trace stops at (or a point a click can select), on screen, with what it says there. */
type Stop = { sx: number; sy: number; text: string };
/** A point drawn on screen, by its place in the list (for Select All Points and clicks). */
type Mark = { sx: number; sy: number; r: number; index: number; text: string };

/**
 * Data & Statistics: a list on the x-axis (dot plot, box plot, histogram,
 * normal probability plot) or up the y-axis, or two lists (scatter, XY
 * line), with "Click to add variable" along each axis, as the handheld lays
 * it out. A list of text plots as a dot, bar or pie chart. What Analyze
 * adds (a regression, a movable line, functions, values, a normal curve) is
 * drawn over the data.
 *
 * A plot up the y-axis is drawn as the same plot along x, turned: the
 * drawing works in "logical" coordinates (the plotted list along, its
 * counts up), and the canvas maps them across. Text is drawn upright.
 */
export function DataStatsApp({
  page,
  giac,
  ready,
  toGiac,
  onAxis,
  onPage,
  onWindow,
  onInfo,
  onSay,
  onSlider,
  onSliderTyped,
  onSliderAction,
}: {
  page: DataStatsPage;
  giac: Giac | null;
  ready: boolean;
  /** A typed expression (TI syntax) as the engine's own. */
  toGiac: (text: string) => string;
  onAxis: (axis: "x" | "y") => void;
  /** A change made on the page itself: the movable line, a text dragged, points selected. */
  onPage: (fn: (p: DataStatsPage) => DataStatsPage) => void;
  /** The window as drawn, for Zoom In/Out and Window Settings. */
  onWindow: (w: GraphWindow | null) => void;
  /** What the lists turned out to be, which changes what the menu offers. */
  onInfo?: (info: DataInfo) => void;
  /** Graph Trace's readout, for screen readers. */
  onSay?: (text: string) => void;
  onSlider?: (name: string, value: number, final: boolean) => void;
  onSliderTyped?: (name: string, text: string) => void;
  onSliderAction?: (name: string, action: "move" | "settings" | "animate" | "minimize" | "delete") => void;
}) {
  const [raw, setRaw] = useState<{ x: Values | null; y: Values | null; xFreq: number[]; yFreq: number[]; split: string[] | null; edges: number[] | null }>({
    x: null,
    y: null,
    xFreq: [],
    yFreq: [],
    split: null,
    edges: null,
  });
  const [extra, setExtra] = useState<{
    fns: [number, number][][];
    values: { at: number; label: string }[];
    shade?: { pts: [number, number][]; area: number };
  }>({ fns: [], values: [] });
  const box = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [sliderMenu, setSliderMenu] = useState<{ name: string; x: number; y: number } | null>(null);
  // What the last drawing put where: points (for clicks), texts (for dragging) and the trace's readout.
  const marks = useRef<Mark[]>([]);
  const textBoxes = useRef<{ x: number; y: number; w: number; h: number }[]>([]);
  const said = useRef("");

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
      const get = async (name?: string) => (name ? await giac(`evalf(${RENAME_IN[name] ?? name})`) : "");
      const x = page.x ? parseValues(await get(page.x)) : null;
      const y = page.y ? parseValues(await get(page.y)) : null;
      const xFreq = parseNumbers(await get(page.xSummary));
      const yFreq = parseNumbers(await get(page.ySummary));
      const s = page.split ? parseValues(await get(page.split)) : null;
      // A split list of numbers splits by each number, as categories.
      const split = s ? (forceValues(s, "cat").cats ?? null) : null;
      let edges: number[] | null = null;
      if (page.binEdges)
        try {
          edges = parseNumbers(await giac(`evalf(${toGiac(page.binEdges)})`)).filter(Number.isFinite);
        } catch {
          edges = [];
        }
      if (!cancelled) setRaw({ x, y, xFreq, yFreq, split, edges });
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- toGiac changes each render; the bins' text stands for it
  }, [giac, ready, page.x, page.y, page.xSummary, page.ySummary, page.split, page.binEdges]);

  // Force Numeric / Force Categorical, then which list is plotted: x along, or y up (drawn turned).
  const xv = useMemo(() => (raw.x ? forceValues(raw.x, page.forceX) : null), [raw.x, page.forceX]);
  const yv = useMemo(() => (raw.y ? forceValues(raw.y, page.forceY) : null), [raw.y, page.forceY]);
  const lay = layoutOf(xv, yv);
  const both = lay === "bothCat";
  const main = lay && lay !== "bothCat" ? lay.main : null;
  const two = Boolean(lay && lay !== "bothCat" && lay.two);
  const vertical = main === "y";
  const mainV = vertical ? yv : xv;
  const otherV = two ? (vertical ? xv : yv) : null;
  const summary = vertical ? page.xSummary : page.ySummary;
  const freq = vertical ? raw.xFreq : raw.yFreq;
  // A list of text is categorical: it makes dot charts, bar charts and pie charts, not dot plots.
  const categorical = Boolean(mainV?.cats);
  const plot = effectivePlot(logicalPage(page, { main, two }), categorical);
  const info: DataInfo = { xText: Boolean(raw.x?.cats), yText: Boolean(raw.y?.cats), main, categorical, two };
  const infoKey = JSON.stringify(info);
  const tellInfo = useRef(onInfo);
  tellInfo.current = onInfo;
  useEffect(() => {
    tellInfo.current?.(JSON.parse(infoKey) as DataInfo);
  }, [infoKey]);

  const one = ONE_VAR.includes(plot) || CAT_PLOTS.includes(plot);
  const cats = mainV?.cats;
  const nums = mainV?.nums;
  // Each category's count (or its summary list's total), in the page's Sort order.
  const counts = useMemo(() => (cats ? categoryCounts(cats, summary ? freq : undefined, page.sort) : null), [cats, summary, freq, page.sort]);
  // A summary list counts each value that many times; it has to hold whole numbers to do that.
  const expanded = useMemo(() => (!cats && summary && nums ? expandSummary(nums, freq) : null), [cats, summary, nums, freq]);
  const badSummary = Boolean(!cats && summary && !expanded);
  // Categorical values become their category's column number (0, 1 …), so a y list plots in columns.
  const xs = useMemo(() => {
    if (cats && counts) {
      const at = new Map(counts.map((c, i) => [c.name, i]));
      return cats.map((c) => at.get(c) ?? NaN);
    }
    return expanded ?? (summary ? [] : (nums ?? []));
  }, [cats, counts, expanded, summary, nums]);
  // The one-list plots leave out what isn't a number (an empty cell, text forced numeric).
  const values = useMemo(() => (one && !cats ? xs.filter(Number.isFinite) : xs), [one, cats, xs]);
  // Split Categories by Variable: the numbers in a band for each category of the split list.
  const bands = useMemo(
    () => (page.split && raw.split && one && !cats && !summary && nums ? splitGroups(nums, raw.split) : null),
    [page.split, raw.split, one, cats, summary, nums],
  );
  // Kept between renders, so what's worked out from them (the regression, the drawing) isn't redone each time.
  const ys = useMemo(() => (one || !otherV ? [] : otherV.nums.slice(0, xs.length)), [one, otherV, xs.length]);
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
  const edges = plot === "histogram" && page.binEdges && raw.edges && raw.edges.length > 1 ? raw.edges : null;
  const usable = !both && (counts ? counts.length > 0 : values.length > 0) && (one || pts.length > 0);
  const fitted = useMemo((): GraphWindow | null => {
    if (!usable) return null;
    if (counts && one) return categoryWindow(counts, plot);
    // Categories against a y list: a column for each category, the y list's spread up the side.
    if (counts) return { ...fitWindow({ ...page, plot }, pts.map((p) => p[0]), pts.map((p) => p[1])), xmin: -0.6, xmax: counts.length - 0.4 };
    if (edges) {
      const bars = edgeBars(values, edges, page.histScale);
      const span = edges.at(-1)! - edges[0]!;
      return { xmin: edges[0]! - span * 0.04, xmax: edges.at(-1)! + span * 0.04, ymin: 0, ymax: Math.max(1e-9, ...bars.map((b) => b.h)) * 1.15, xscl: 1, yscl: 1 };
    }
    const f = fitWindow({ ...page, plot }, values, ys);
    // Split bands: each band's stacks or bars are drawn on the tallest band's scale.
    if (bands && plot !== "box") {
      const tallest = bands.map((b) => fitWindow({ ...page, plot }, b.values, []).ymax);
      return { ...f, ymax: Math.max(...tallest) };
    }
    return f;
  }, [usable, counts, one, plot, page, pts, values, ys, edges, bands]);
  // The window is kept as the screen shows it; a plot up the y-axis works in it turned.
  const w: GraphWindow | null = page.window ? (vertical ? swapWindow(page.window) : page.window) : fitted;
  const tellWindow = useRef(onWindow);
  tellWindow.current = onWindow;
  const shownKey = JSON.stringify(w && (vertical ? swapWindow(w) : w));
  useEffect(() => {
    // A block, not an arrow's value: React would take what onWindow returns for a clean-up.
    tellWindow.current(JSON.parse(shownKey) as GraphWindow | null);
  }, [shownKey]);

  // Plot Function and Plot Value: worked out by the engine over the window (again when a slider moves).
  const fnKey = JSON.stringify([page.functions, page.values, page.shade, w && [w.xmin, w.xmax], xs.length, page.sliders?.map((s) => s.value)]);
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
      const vals: { at: number; label: string }[] = [];
      for (const v of page.values ?? []) {
        try {
          const at = parseNumbers(await giac(`evalf(${toGiac(v)})`))[0];
          if (at !== undefined) vals.push({ at, label: `${v} = ${shown(at, page.digits)}` });
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
      if (!cancelled) setExtra({ fns, values: vals, shade });
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
    if (one || counts) return null;
    if (reg) return equationFn(reg.eqn);
    if (movable) return (x) => movable.m * x + movable.b;
    if (firstFn?.length) return sampled(firstFn);
    return null;
  }, [one, counts, reg, movable, firstFn]);
  const resid = useMemo(() => (against ? residuals(pts, against) : []), [against, pts]);
  const residualPlot = Boolean(page.residualPlot && against && resid.length && !vertical);

  // The curves Graph Trace can follow after the data (▲ ▼ move between them), each with its name.
  const curves = useMemo(() => {
    const out: { f: (x: number) => number; name: string }[] = [];
    if (one && !counts) {
      extra.fns.forEach((f, i) => out.push({ f: sampled(f), name: `f(x) = ${page.functions?.[i]}` }));
      return out;
    }
    if (counts) return out;
    if (reg) out.push({ f: equationFn(reg.eqn), name: "regression" });
    if (movable) out.push({ f: (x) => movable.m * x + movable.b, name: "movable line" });
    extra.fns.forEach((f, i) => out.push({ f: sampled(f), name: `f(x) = ${page.functions?.[i]}` }));
    return out;
  }, [one, counts, reg, movable, extra.fns, page.functions]);

  // Movable line: dragging near its middle slides it, nearer an end turns it about the middle.
  const drag = useRef<{ mode: "slide" | "turn"; cx: number } | { mode: "text"; i: number; dx: number; dy: number } | null>(null);
  const toWorld = (e: ReactPointerEvent) => {
    const r = canvas.current!.getBoundingClientRect();
    // With the residual plot under it, the data fills the top two thirds.
    const h = residualPlot ? r.height * (2 / 3) : r.height;
    return { x: w!.xmin + ((e.clientX - r.left) / r.width) * (w!.xmax - w!.xmin), y: w!.ymax - ((e.clientY - r.top) / h) * (w!.ymax - w!.ymin) };
  };

  const fs = Math.max(9, size.w * 0.028);

  useEffect(() => {
    const c = canvas.current;
    if (!c || !size.w || !size.h) return;
    const dpr = window.devicePixelRatio || 1;
    c.width = size.w * dpr;
    c.height = size.h * dpr;
    const g = c.getContext("2d");
    if (!g) return;
    const screen = () => g.setTransform(dpr, 0, 0, dpr, 0, 0);
    screen();
    g.fillStyle = palette.casScreen;
    g.fillRect(0, 0, size.w, size.h);
    g.font = `${fs}px "Source Sans 3 Variable", sans-serif`;
    marks.current = [];
    const stops: Stop[] = [];

    // Insert Text: drawn upright on the screen, over everything; the selected one boxed.
    const drawTexts = () => {
      screen();
      g.font = `${fs}px "Source Sans 3 Variable", sans-serif`;
      g.textAlign = "left";
      textBoxes.current = (page.texts ?? []).map((t, i) => {
        const x = t.x * size.w;
        const y = t.y * size.h;
        const tw = g.measureText(t.text).width;
        g.fillStyle = palette.casInk;
        g.fillText(t.text, x, y + fs * 0.8);
        if (page.textSel === i) {
          g.strokeStyle = PLOT;
          g.setLineDash([3, 2]);
          g.lineWidth = 1;
          g.strokeRect(x - 2, y - 1, tw + 4, fs * 1.1);
          g.setLineDash([]);
        }
        return { x: x - 2, y: y - 1, w: tw + 4, h: fs * 1.1 };
      });
    };
    // Graph Trace: a ring at the stop and what it says there; the readout goes to screen readers too.
    const drawTrace = () => {
      if (!page.trace) return;
      screen();
      const targets = [stops, ...curveStops()];
      const k = ((page.trace.target % targets.length) + targets.length) % targets.length;
      const list = targets[k]!;
      if (!list.length) return;
      const s = list[((page.trace.i % list.length) + list.length) % list.length]!;
      g.strokeStyle = SELECTED;
      g.lineWidth = 2;
      g.beginPath();
      g.arc(s.sx, s.sy, fs * 0.45, 0, Math.PI * 2);
      g.stroke();
      g.font = `${fs}px "Source Sans 3 Variable", sans-serif`;
      const tw = g.measureText(s.text).width;
      const bx = Math.min(Math.max(2, s.sx + fs * 0.6), size.w - tw - fs * 0.6);
      const by = Math.max(fs * 0.2, Math.min(s.sy - fs * 1.8, size.h - fs * 1.6));
      g.fillStyle = "rgba(255,255,255,0.92)";
      g.fillRect(bx - 3, by, tw + 6, fs * 1.3);
      g.strokeStyle = SELECTED;
      g.lineWidth = 1;
      g.strokeRect(bx - 3, by, tw + 6, fs * 1.3);
      g.fillStyle = palette.casInk;
      g.textAlign = "left";
      g.fillText(s.text, bx, by + fs * 0.95);
      if (said.current !== s.text) {
        said.current = s.text;
        onSay?.(s.text);
      }
    };
    let curveStops: () => Stop[][] = () => [];

    if (!w) {
      g.fillStyle = palette.casInk;
      g.textAlign = "center";
      g.font = `${fs * 1.4}px "STIX Two Text Variable", serif`;
      g.fillText(
        both
          ? "Two categorical lists: split one by the other"
          : badSummary
            ? "Frequencies must be whole numbers"
            : page.x || page.y
              ? "No data in this variable"
              : "No lists in this problem",
        size.w / 2,
        size.h / 2,
      );
      drawTexts();
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
        const full = `${sl.name}: ${shown(sl.n, page.digits)} (${shown((sl.n / (total || 1)) * 100, page.digits)}%)`;
        // Show All Labels adds each slice's count and share of the whole.
        g.fillText(fit(g, page.labels ? full : sl.name, room - fs * 0.3), lx, ly + (Math.sin(mid) > 0.5 ? fs * 0.8 : Math.sin(mid) < -0.5 ? 0 : fs * 0.35));
        stops.push({ sx: cx + Math.cos(mid) * r * 0.6, sy: cy + Math.sin(mid) * r * 0.6, text: full });
      });
      drawTrace();
      drawTexts();
      return;
    }

    // Logical coordinates: the plotted list along (width lw), its counts or the other list up (height lh).
    // Up the y-axis, the canvas turns them: screen x = lh − y, screen y = lw − x.
    const lw = vertical ? size.h : size.w;
    const lh = vertical ? size.w : size.h;
    const logical = () => (vertical ? g.setTransform(0, -dpr, -dpr, 0, lh * dpr, lw * dpr) : screen());
    const S = (lx: number, ly: number): [number, number] => (vertical ? [lh - ly, lw - lx] : [lx, ly]);
    /** Text at a logical place, drawn upright: the place as it falls on the screen, with the alignment given for each way round. */
    const put = (text: string, at: [number, number], align: CanvasTextAlign, turned?: { dx: number; dy: number; align: CanvasTextAlign }) => {
      const [sx, sy] = S(at[0], at[1]);
      screen();
      g.textAlign = vertical && turned ? turned.align : align;
      g.fillText(text, sx + (vertical && turned ? turned.dx : 0), sy + (vertical && turned ? turned.dy : 0));
      logical();
    };
    logical();

    // One-list plots stand on the axis with its numbers beside it; two-list plots put the axes through 0.
    // Show Residual Plot gives the lower third to the residuals.
    const plotH = one ? lh - fs * (vertical ? 3.2 : 1.6) : residualPlot ? lh * (2 / 3) : lh;
    const X = (x: number) => ((x - w.xmin) / (w.xmax - w.xmin)) * lw;
    // Split bands: each band its own height, stacked from the top; Y works in the band being drawn.
    let bandTop = 0;
    let bandH = plotH;
    const Y = (y: number) => bandTop + ((w.ymax - y) / (w.ymax - w.ymin)) * bandH;

    // Grid behind everything: a line at every x tick (not between categories), and every y tick where
    // y means something (a histogram's or bar chart's scale, a normal probability plot's z; not dot or box plots).
    const yMeans = (!one || plot === "histogram" || plot === "normprob" || plot === "bar") && !bands;
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
        g.lineTo(lw, Y(t));
      }
    g.stroke();

    // Axes and tick labels.
    g.strokeStyle = palette.casInk;
    g.fillStyle = palette.casLabel;
    g.lineWidth = 1;
    const base = one ? plotH : Y(Math.max(w.ymin, Math.min(w.ymax, 0)));
    g.beginPath();
    g.moveTo(0, base);
    g.lineTo(lw, base);
    // Categories have no x = 0: the y-axis stays at the left edge.
    const left = counts ? 0 : X(Math.max(w.xmin, Math.min(w.xmax, 0)));
    if (!one) {
      g.moveTo(left, 0);
      g.lineTo(left, plotH);
    }
    g.stroke();
    if (counts) {
      // Each category's name under its column (above the axis for a y list, as numbers are); up the y-axis, beside it.
      const room = (one ? X(1) - X(0) : vertical ? lh * 0.4 : X(1) - X(0)) - fs * 0.3;
      counts.forEach((c, i) => {
        if (X(i) < 0 || X(i) > lw) return;
        // Up the y-axis, the name ends just left of the axis: 1.3 em back from where it sits under a column, less a gap.
        const name = fit(g, c.name, vertical && one ? fs * 2.7 : room);
        if (one) put(name, [X(i), base + fs * 1.3], "center", { dx: fs * 0.9, dy: fs * 0.35, align: "right" });
        else put(name, [X(i), plotH - fs * 0.4], "center", { dx: 0, dy: -fs * 0.4, align: "left" });
      });
    } else
      for (const t of ticks(w.xmin, w.xmax)) {
        g.beginPath();
        g.moveTo(X(t), base);
        g.lineTo(X(t), base + (one ? fs * 0.4 : -fs * 0.4));
        g.stroke();
        put(shown(t), [X(t), one ? base + fs * 1.3 : base - fs * 0.6], "center", { dx: one ? fs * 0.9 : fs * 0.2, dy: fs * 0.35, align: one ? "right" : "left" });
      }
    if (!one) {
      for (const t of ticks(w.ymin, w.ymax))
        if (t !== 0 || counts) put(shown(t), [left + fs * 0.3, Y(t) + fs * 0.35], "left", { dx: 0, dy: -fs * 0.2, align: "center" });
    } else if (yMeans) {
      // A histogram's frequencies (or a normal probability plot's z) up the left edge, as the handheld numbers them.
      for (const t of ticks(w.ymin, w.ymax)) {
        const y = Y(t);
        if (y < fs * 0.8 || y > plotH - fs * 0.3) continue;
        g.beginPath();
        g.moveTo(0, y);
        g.lineTo(fs * 0.4, y);
        g.stroke();
        put(shown(t), [fs * 0.55, y + fs * 0.35], "left", { dx: 0, dy: -fs * 0.9, align: "center" });
      }
    }

    const dotR = Math.max(2.5, size.w * 0.008);
    const dot = (x: number, y: number, r = dotR) => {
      g.beginPath();
      g.arc(x, y, r, 0, Math.PI * 2);
      g.fill();
    };
    /** A point a click can select: its screen place, kept for hit-testing. */
    const mark = (lx: number, ly: number, r: number, index: number, text: string) => {
      const [sx, sy] = S(lx, ly);
      marks.current.push({ sx, sy, r, index, text });
    };
    const stop = (lx: number, ly: number, text: string) => {
      const [sx, sy] = S(lx, ly);
      stops.push({ sx, sy, text });
    };
    const label = (text: string, at: [number, number]) => {
      g.fillStyle = palette.casInk;
      put(text, at, "center", { dx: fs * 0.3, dy: fs * 0.35, align: "left" });
    };
    const name = vertical ? page.y : page.x;
    g.fillStyle = g.strokeStyle = PLOT;

    /** One numeric list's plot, in the band set by bandTop and bandH. */
    const drawOne = (vals: number[], idx: number[], tag: string) => {
      g.fillStyle = g.strokeStyle = PLOT;
      const bottom = bandTop + bandH;
      if (plot === "dot") {
        const r = Math.max(3, size.w * 0.009);
        const seen = new Map<number, number>();
        dotStacks(vals).forEach(([x, h], j) => {
          const ly = bottom - 2 - (h - 0.5) * r * 2.3;
          dot(X(x), ly, r);
          mark(X(x), ly, r, idx[j]!, `${tag}${name} = ${shown(x, page.digits)}`);
          seen.set(x, h);
        });
        // One stop for each value, at the top of its stack.
        for (const [x, h] of [...seen].sort((a, b) => a[0] - b[0]))
          stop(X(x), bottom - 2 - (h - 0.5) * r * 2.3, `${tag}${name} = ${shown(x, page.digits)}${h > 1 ? ` (${h} values)` : ""}`);
      } else if (plot === "box") {
        const b = boxPlot(vals, page.extendWhiskers);
        const mid = bandTop + bandH * 0.5;
        const half = bandH * 0.14;
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
        const five: [string, number][] = [
          [page.extendWhiskers || !b.outliers.length ? "minX" : "Lower whisker", b.lo],
          ["Q1", b.q1],
          ["Median", b.median],
          ["Q3", b.q3],
          [page.extendWhiskers || !b.outliers.length ? "maxX" : "Upper whisker", b.hi],
        ];
        const outs = b.outliers.map((o): [string, number] => ["Outlier", o]);
        for (const [k, v] of [...five, ...outs].sort((p, q) => p[1] - q[1])) stop(X(v), mid, `${tag}${k} = ${shown(v, page.digits)}`);
      } else if (plot === "histogram") {
        const bins = page.bins ?? autoBins(vals);
        const bars = edges ? edgeBars(vals, edges, page.histScale) : histogramBars(vals, bins, page.histScale);
        for (const bin of bars) {
          g.fillStyle = "#9dbfea";
          g.fillRect(X(bin.from), Y(bin.h), X(bin.to) - X(bin.from), Y(0) - Y(bin.h));
          g.strokeStyle = PLOT;
          g.strokeRect(X(bin.from), Y(bin.h), X(bin.to) - X(bin.from), Y(0) - Y(bin.h));
          if (page.labels) label(shown(bin.h, page.digits), [(X(bin.from) + X(bin.to)) / 2, Y(bin.h) - fs * 0.3]);
          stop((X(bin.from) + X(bin.to)) / 2, Y(bin.h), `${tag}[${shown(bin.from, page.digits)}, ${shown(bin.to, page.digits)}): ${shown(bin.h, page.digits)}`);
        }
        if (page.normalPdf && vals.length > 1 && !edges) {
          // The normal curve with the data's mean and sd, on the bars' scale.
          const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
          const sd = Math.sqrt(vals.reduce((a, b) => a + (b - mean) ** 2, 0) / (vals.length - 1));
          g.strokeStyle = "#1e8c2f";
          g.lineWidth = 1.5;
          g.beginPath();
          for (let i = 0; i <= 160; i++) {
            const x = w.xmin + ((w.xmax - w.xmin) * i) / 160;
            const y = normalCurve(x, mean, sd, vals.length, bins.width, page.histScale);
            if (i) g.lineTo(X(x), Y(y));
            else g.moveTo(X(x), Y(y));
          }
          g.stroke();
        }
      } else if (plot === "normprob") {
        const order = vals.map((v, j) => [v, idx[j]!] as const).sort((a, b) => a[0] - b[0]);
        normalScores(vals).forEach(([x, z], j) => {
          dot(X(x), Y(z));
          mark(X(x), Y(z), dotR, order[j]![1], `${tag}${name} = ${shown(x, page.digits)}, z = ${shown(z, page.digits)}`);
          stop(X(x), Y(z), `${tag}${name} = ${shown(x, page.digits)}, z = ${shown(z, page.digits)}`);
        });
      }
    };

    if (plot === "dotchart" && counts && cats) {
      // A stack of dots over each category, one for each time it appears; tall stacks get smaller dots to fit.
      const most = Math.max(1, ...counts.map((c) => Math.round(c.n)));
      const r = Math.min(Math.max(3, size.w * 0.009), (plotH - fs) / (most * 2.3));
      counts.forEach((c, i) => {
        // Without a summary list, each dot is one of the list's entries, in order.
        const items = summary ? [] : cats.flatMap((k, j) => (k === c.name ? [j] : []));
        for (let h = 1; h <= Math.round(c.n); h++) {
          const ly = plotH - 2 - (h - 0.5) * r * 2.3;
          dot(X(i), ly, r);
          if (items[h - 1] !== undefined) mark(X(i), ly, r, items[h - 1]!, `${name} = ${c.name}`);
        }
        stop(X(i), plotH - 2 - (Math.round(c.n) - 0.5) * r * 2.3, `${c.name}: ${shown(c.n, page.digits)}`);
      });
    } else if (plot === "bar" && counts) {
      const half = (X(1) - X(0)) * 0.32;
      counts.forEach((c, i) => {
        g.fillStyle = "#9dbfea";
        g.fillRect(X(i) - half, Y(c.n), half * 2, Y(0) - Y(c.n));
        g.strokeStyle = PLOT;
        g.strokeRect(X(i) - half, Y(c.n), half * 2, Y(0) - Y(c.n));
        if (page.labels) label(shown(c.n, page.digits), [X(i), Y(c.n) - fs * 0.3]);
        stop(X(i), Y(c.n), `${c.name}: ${shown(c.n, page.digits)}`);
      });
    } else if (one && bands) {
      // A band for each category of the split list, named at its left, each with its own plot of the values in it.
      const gap = fs * 0.3;
      const each = (plotH - gap * (bands.length - 1)) / bands.length;
      bands.forEach((b, k) => {
        bandTop = k * (each + gap);
        bandH = each;
        const idx = (nums ?? []).flatMap((v, j) => (raw.split?.[j] === b.name && Number.isFinite(v) ? [j] : []));
        drawOne(b.values, idx, `${b.name}: `);
        if (k) {
          g.strokeStyle = palette.casRule;
          g.lineWidth = 0.5;
          g.beginPath();
          g.moveTo(0, bandTop - gap / 2);
          g.lineTo(lw, bandTop - gap / 2);
          g.stroke();
        }
        g.fillStyle = palette.casLabel;
        put(fit(g, b.name, lw * 0.4), [fs * 0.3, bandTop + fs * 1.1], "left", { dx: -fs * 0.9, dy: 0, align: "right" });
      });
      bandTop = 0;
      bandH = plotH;
    } else if (one) {
      const idx = expanded ? values.map((_, j) => j) : (nums ?? []).flatMap((v, j) => (Number.isFinite(v) ? [j] : []));
      drawOne(values, idx, "");
    } else {
      const ordered = pts.slice().sort((a, b) => a[0] - b[0]);
      if (plot === "xyline" || page.connect) {
        g.lineWidth = 1.2;
        g.beginPath();
        ordered.forEach(([x, y], i) => (i ? g.lineTo(X(x), Y(y)) : g.moveTo(X(x), Y(y))));
        g.stroke();
      }
      const yName = vertical ? page.x : page.y;
      const xText = (x: number) => (counts ? (counts[x]?.name ?? "") : shown(x, page.digits));
      const pair = (x: number, y: number) => `${name} = ${xText(x)}, ${yName} = ${shown(y, page.digits)}`;
      xs.slice(0, ys.length).forEach((x, j) => {
        const y = ys[j]!;
        if (!Number.isFinite(x) || !Number.isFinite(y)) return;
        dot(X(x), Y(y));
        mark(X(x), Y(y), dotR, j, pair(x, y));
      });
      for (const [x, y] of ordered) stop(X(x), Y(y), pair(x, y));
    }

    // Selected points (Select All Points, or a click): ringed, and what a single one is, said at the top left.
    const sel = page.selected;
    if (sel) {
      screen();
      const chosen = marks.current.filter((m) => sel === "all" || sel.includes(m.index));
      g.strokeStyle = SELECTED;
      g.lineWidth = 2;
      for (const m of chosen) {
        g.beginPath();
        g.arc(m.sx, m.sy, m.r + 2.5, 0, Math.PI * 2);
        g.stroke();
      }
      g.fillStyle = SELECTED;
      g.textAlign = "left";
      if (chosen.length) g.fillText(chosen.length === 1 ? chosen[0]!.text : `${chosen.length} points selected`, fs * 0.5, fs * 1.3);
      logical();
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

    // Each curve's stops for Graph Trace: a fiftieth of the window apart, starting in the middle.
    curveStops = () =>
      curves.map((cv) => {
        const out: Stop[] = [];
        const dx = (w.xmax - w.xmin) / 50;
        for (let i = -25; i <= 25; i++) {
          const x = (w.xmin + w.xmax) / 2 + i * dx;
          const y = cv.f(x);
          if (!Number.isFinite(y)) continue;
          const [sx, sy] = S(X(x), Y(y));
          out.push({ sx, sy, text: `${cv.name}: x = ${shown(x, page.digits)}, y = ${shown(y, page.digits)}` });
        }
        // Start in the middle of the window.
        const mid = Math.floor(out.length / 2);
        return [...out.slice(mid), ...out.slice(0, mid)];
      });

    screen();
    g.textAlign = "right";
    labels.forEach((l, i) => {
      g.fillStyle = l.colour;
      g.fillText(l.text, size.w - fs * 0.5, fs * (1.3 + i * 1.25));
    });
    drawTrace();
    drawTexts();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- onSay only reports; it needn't redraw
  }, [size, w, page, plot, counts, cats, badSummary, both, values, xs, ys, pts, one, reg, extra, against, resid, residualPlot, vertical, bands, edges, curves, expanded, nums, raw.split, summary, fs]);

  // A trace that's ended starts its readout afresh next time.
  useEffect(() => {
    if (!page.trace) said.current = "";
  }, [page.trace]);

  // The axis the counts run along names what they measure (Frequency, z-Quantile …), or the summary list.
  const countTitle = one && !summary ? yAxisTitle({ ...page, plot }) : undefined;
  const axisLabel = (axis: "x" | "y") => {
    const name = axis === "x" ? (page.x ?? page.xSummary) : (page.y ?? page.ySummary);
    // The axis the plot doesn't run along carries its title when there's no list on it.
    const countsAxis = (vertical ? "x" : "y") === axis;
    const title = countsAxis && main && !(axis === "x" ? page.x : page.y) ? countTitle : undefined;
    return (
      <button
        type="button"
        tabIndex={-1}
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => onAxis(axis)}
        aria-label={title ? `${axis}-axis: ${title}; add a ${axis} variable` : name ? `${axis} variable ${name}; change` : `Add ${axis} variable`}
        className={
          axis === "x"
            ? "flex h-[7cqw] w-full items-center justify-center bg-[#dcdcdc] text-[3.6cqw] text-casLabel"
            : "flex h-full w-[7cqw] items-center justify-center bg-[#dcdcdc] text-[3.6cqw] text-casLabel"
        }
      >
        <span className={axis === "y" ? "-rotate-90 whitespace-nowrap" : ""}>
          {name ? (
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

  const summaryNote = summary ? `, summary list ${summary}` : "";
  const ariaLabel = `Data and statistics: ${PLOT_NAMES[plot]}${main ? ` of ${main === "y" ? page.y : page.x}` : ""}${two ? ` against ${main === "y" ? page.x : page.y}` : ""}${summaryNote}${
    bands ? `, split by ${page.split}` : ""
  }${countTitle && main ? `, ${countTitle} on the ${vertical ? "x" : "y"}-axis` : ""}${counts ? `: ${counts.map((c) => `${c.name} ${shown(c.n, page.digits)}`).join(", ")}` : ""}`;

  return (
    <div className="absolute inset-0 flex flex-col bg-casScreen font-casui">
      <div aria-hidden className="h-[0.8cqw] shrink-0" style={{ background: STRIP }} />
      <div className="flex min-h-0 flex-1">
        {axisLabel("y")}
        <div ref={box} className="relative min-w-0 flex-1">
          <canvas
            ref={canvas}
            className="absolute inset-0 h-full w-full"
            aria-label={ariaLabel}
            onPointerDown={(e) => {
              const r = e.currentTarget.getBoundingClientRect();
              const px = e.clientX - r.left;
              const py = e.clientY - r.top;
              // A text first: pick it up to move it.
              const ti = textBoxes.current.findIndex((b) => px >= b.x && px <= b.x + b.w && py >= b.y && py <= b.y + b.h);
              if (ti >= 0) {
                const t = page.texts![ti]!;
                drag.current = { mode: "text", i: ti, dx: px / r.width - t.x, dy: py / r.height - t.y };
                onPage((p) => ({ ...p, textSel: ti, selected: undefined }));
                e.currentTarget.setPointerCapture(e.pointerId);
                return;
              }
              // Then the movable line.
              if (page.movable && w && !vertical) {
                const p = toWorld(e);
                const { m, b } = page.movable;
                if (Math.abs(m * p.x + b - p.y) <= (w.ymax - w.ymin) * 0.08) {
                  const cx = (w.xmin + w.xmax) / 2;
                  drag.current = { mode: page.movable.lock || Math.abs(p.x - cx) > (w.xmax - w.xmin) * 0.2 ? "turn" : "slide", cx };
                  e.currentTarget.setPointerCapture(e.pointerId);
                  return;
                }
              }
              // Then a point: clicking one selects it; clicking nothing lets go.
              let best: Mark | null = null;
              let bestD = Infinity;
              for (const m of marks.current) {
                const d = Math.hypot(m.sx - px, m.sy - py);
                if (d <= Math.max(m.r * 2, 7) && d < bestD) [best, bestD] = [m, d];
              }
              const hit = best;
              if (hit) onPage((p) => ({ ...p, selected: [hit.index], textSel: undefined }));
              else if (page.selected || page.textSel !== undefined) onPage((p) => ({ ...p, selected: undefined, textSel: undefined }));
            }}
            onPointerMove={(e) => {
              const d = drag.current;
              if (!d) return;
              if (d.mode === "text") {
                const r = e.currentTarget.getBoundingClientRect();
                const x = Math.min(0.95, Math.max(0, (e.clientX - r.left) / r.width - d.dx));
                const y = Math.min(0.95, Math.max(0, (e.clientY - r.top) / r.height - d.dy));
                onPage((p) => ({ ...p, texts: (p.texts ?? []).map((t, j) => (j === d.i ? { ...t, x, y } : t)) }));
                return;
              }
              if (!page.movable || !w) return;
              const p = toWorld(e);
              const { m, b, lock } = page.movable;
              const set = (m2: number, b2: number) => onPage((q) => (q.movable ? { ...q, movable: { ...q.movable, m: m2, b: b2 } } : q));
              if (lock) set(p.x ? p.y / p.x : m, 0);
              else if (d.mode === "slide") set(m, p.y - m * p.x);
              else {
                // Turn about the line's point at the middle of the window.
                const cy = m * d.cx + b;
                const m2 = p.x !== d.cx ? (p.y - cy) / (p.x - d.cx) : m;
                set(m2, cy - m2 * d.cx);
              }
            }}
            onPointerUp={() => {
              drag.current = null;
            }}
          />
          {/* Insert Slider: the Graphs page's sliders, for variables in a plotted function or value. */}
          {(page.sliders ?? []).map((sl, k) => (
            <SliderView
              key={sl.name}
              slider={sl}
              index={k}
              fs={fs}
              size={size}
              active={false}
              onValue={(v, final) => onSlider?.(sl.name, v, final)}
              onTyped={(text) => onSliderTyped?.(sl.name, text)}
              onMenu={(x, y) => {
                const r = box.current!.getBoundingClientRect();
                setSliderMenu({ name: sl.name, x: x - r.left, y: y - r.top });
              }}
            />
          ))}
          {sliderMenu && (
            <SliderMenu
              slider={page.sliders?.find((sl) => sl.name === sliderMenu.name)}
              at={sliderMenu}
              fs={fs}
              without={["move", "animate"]}
              onPick={(action) => {
                setSliderMenu(null);
                onSliderAction?.(sliderMenu.name, action);
              }}
              onClose={() => setSliderMenu(null)}
            />
          )}
        </div>
      </div>
      <div className="flex shrink-0">
        <div className="w-[7cqw] bg-[#dcdcdc]" />
        {axisLabel("x")}
      </div>
    </div>
  );
}

/** Whether the page's plot is one Select All Points works on. */
export const pointPlot = (plot: DataStatsPage["plot"]) => POINT_PLOTS.includes(plot);
