// SPDX-License-Identifier: GPL-3.0-or-later
import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { palette } from "@/shared/lib/tokens";
import type { Giac } from "../engine/evaluate";
import { regression } from "../engine/stats";
import { RENAME_IN } from "../engine/translate";
import { parseNumbers } from "../graphs/analyze";
import type { GraphWindow } from "../graphs/model";
import type { DataStatsPage } from "../state/document";
import { autoBins, boxPlot, dotStacks, equationFn, fitWindow, histogram, normalScores, ONE_VAR, ticks } from "./plot";

const PLOT = "#2c64c8";
const STRIP = "#b8509c";

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
}) {
  const [data, setData] = useState<{ xs: number[]; ys: number[] }>({ xs: [], ys: [] });
  const [extra, setExtra] = useState<{ fns: [number, number][][]; values: { at: number; label: string }[] }>({ fns: [], values: [] });
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
      const get = async (name?: string) => (name ? parseNumbers(await giac(`evalf(${RENAME_IN[name] ?? name})`)) : []);
      const xs = await get(page.x);
      const ys = await get(page.y);
      if (!cancelled) setData({ xs, ys });
    })();
    return () => {
      cancelled = true;
    };
  }, [giac, ready, page.x, page.y]);

  const one = ONE_VAR.includes(page.plot);
  const xs = data.xs;
  const ys = one ? [] : data.ys.slice(0, xs.length);
  const pts = one ? [] : xs.slice(0, ys.length).map((x, i) => [x, ys[i]!] as [number, number]);
  const usable = xs.length > 0 && (one || pts.length > 0);
  const w: GraphWindow | null = page.window ?? (usable ? fitWindow(page, xs, ys) : null);
  onWindow(w);

  // Plot Function and Plot Value: worked out by the engine over the window.
  const fnKey = JSON.stringify([page.functions, page.values, w && [w.xmin, w.xmax], xs.length]);
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
      if (!cancelled) setExtra({ fns, values });
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fnKey stands for them
  }, [giac, ready, fnKey]);

  const reg = useMemo(() => {
    if (!page.regression || pts.length < 2) return null;
    try {
      const r = regression(page.regression, pts.map((p) => p[0]), pts.map((p) => p[1]));
      const r2 = r.rows.find(([k]) => k === "r²" || k === "R²");
      return { eqn: r.regEqn ?? "", r2: typeof r2?.[1] === "number" ? r2[1] : undefined };
    } catch {
      return null;
    }
  }, [page.regression, pts]);

  // Movable line: dragging near its middle slides it, nearer an end turns it about the middle.
  const drag = useRef<{ mode: "slide" | "turn"; cx: number } | null>(null);
  const toWorld = (e: ReactPointerEvent) => {
    const r = canvas.current!.getBoundingClientRect();
    return { x: w!.xmin + ((e.clientX - r.left) / r.width) * (w!.xmax - w!.xmin), y: w!.ymax - ((e.clientY - r.top) / r.height) * (w!.ymax - w!.ymin) };
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
      g.fillText(page.x || page.y ? "No data in this variable" : "No lists in this problem", size.w / 2, size.h / 2);
      return;
    }
    // One-list plots stand on the x-axis with its numbers under it; two-list plots put the axes through 0.
    const plotH = one ? size.h - fs * 1.6 : size.h;
    const X = (x: number) => ((x - w.xmin) / (w.xmax - w.xmin)) * size.w;
    const Y = (y: number) => ((w.ymax - y) / (w.ymax - w.ymin)) * plotH;

    // Grid behind everything: a line at every x tick, and every y tick where y means something (not dot/box/normprob stacks).
    g.strokeStyle = palette.casRule;
    g.lineWidth = 0.5;
    g.beginPath();
    for (const t of ticks(w.xmin, w.xmax)) {
      g.moveTo(X(t), 0);
      g.lineTo(X(t), plotH);
    }
    if (!one || page.plot === "histogram")
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
    if (!one) {
      const left = X(Math.max(w.xmin, Math.min(w.xmax, 0)));
      g.moveTo(left, 0);
      g.lineTo(left, size.h);
    }
    g.stroke();
    g.textAlign = "center";
    for (const t of ticks(w.xmin, w.xmax)) {
      g.beginPath();
      g.moveTo(X(t), base);
      g.lineTo(X(t), base + (one ? fs * 0.4 : -fs * 0.4));
      g.stroke();
      g.fillText(shown(t), X(t), one ? base + fs * 1.3 : base - fs * 0.6);
    }
    if (!one) {
      g.textAlign = "left";
      for (const t of ticks(w.ymin, w.ymax)) if (t !== 0) g.fillText(shown(t), X(Math.max(w.xmin, Math.min(w.xmax, 0))) + fs * 0.3, Y(t) + fs * 0.35);
    }

    const dot = (x: number, y: number, r = Math.max(2.5, size.w * 0.008)) => {
      g.beginPath();
      g.arc(x, y, r, 0, Math.PI * 2);
      g.fill();
    };
    g.fillStyle = g.strokeStyle = PLOT;

    if (page.plot === "dot") {
      const r = Math.max(3, size.w * 0.009);
      for (const [x, h] of dotStacks(xs)) dot(X(x), plotH - 2 - (h - 0.5) * r * 2.3, r);
    } else if (page.plot === "box") {
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
    } else if (page.plot === "histogram") {
      const bins = page.bins ?? autoBins(xs);
      for (const bin of histogram(xs, bins)) {
        g.fillStyle = "#9dbfea";
        g.fillRect(X(bin.from), Y(bin.n), X(bin.to) - X(bin.from), Y(0) - Y(bin.n));
        g.strokeStyle = PLOT;
        g.strokeRect(X(bin.from), Y(bin.n), X(bin.to) - X(bin.from), Y(0) - Y(bin.n));
      }
      if (page.normalPdf && xs.length > 1) {
        // The normal curve with the data's mean and sd, scaled to the bars' counts.
        const mean = xs.reduce((a, b) => a + b, 0) / xs.length;
        const sd = Math.sqrt(xs.reduce((a, b) => a + (b - mean) ** 2, 0) / (xs.length - 1));
        g.strokeStyle = "#1e8c2f";
        g.lineWidth = 1.5;
        g.beginPath();
        for (let i = 0; i <= 160; i++) {
          const x = w.xmin + ((w.xmax - w.xmin) * i) / 160;
          const y = (xs.length * bins.width * Math.exp(-0.5 * ((x - mean) / sd) ** 2)) / (sd * Math.sqrt(2 * Math.PI));
          if (i) g.lineTo(X(x), Y(y));
          else g.moveTo(X(x), Y(y));
        }
        g.stroke();
      }
    } else if (page.plot === "normprob") {
      for (const [x, z] of normalScores(xs)) dot(X(x), Y(z));
    } else {
      const ordered = pts.slice().sort((a, b) => a[0] - b[0]);
      if (page.plot === "xyline" || page.connect) {
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
      labels.push({ text: `y = ${reg.eqn.replace(/(-?\d+\.\d{5,})/g, (n) => shown(Number(n), page.digits)).replace(/\*/g, "·").replace(/\+-/g, "−")}`, colour: "#1f4fd8" });
      if (page.diagnostics && reg.r2 !== undefined) labels.push({ text: `r² = ${shown(reg.r2, page.digits)}`, colour: "#1f4fd8" });
    }
    if (page.movable) {
      const { m, b } = page.movable;
      curve((x) => m * x + b, "#555");
      labels.push({ text: `y = ${shown(m, page.digits)}·x ${b < 0 ? "−" : "+"} ${shown(Math.abs(b), page.digits)}`, colour: "#555" });
    }
    extra.fns.forEach((f, i) => {
      g.strokeStyle = "#d6271c";
      g.lineWidth = 1.6;
      g.beginPath();
      f.forEach(([x, y], j) => (j && Number.isFinite(y) ? g.lineTo(X(x), Y(y)) : g.moveTo(X(x), Y(y))));
      g.stroke();
      labels.push({ text: `f(x) = ${page.functions?.[i]}`, colour: "#d6271c" });
    });
    for (const v of extra.values) {
      g.strokeStyle = "#1e8c2f";
      g.lineWidth = 1.4;
      g.beginPath();
      g.moveTo(X(v.at), 0);
      g.lineTo(X(v.at), size.h);
      g.stroke();
      labels.push({ text: v.label, colour: "#1e8c2f" });
    }
    g.textAlign = "right";
    labels.forEach((l, i) => {
      g.fillStyle = l.colour;
      g.fillText(l.text, size.w - fs * 0.5, fs * (1.3 + i * 1.25));
    });
  }, [size, w, page, xs, ys, pts, one, reg, extra]);

  const axisLabel = (axis: "x" | "y") => {
    const name = axis === "x" ? page.x : page.y;
    return (
      <button
        type="button"
        tabIndex={-1}
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => onAxis(axis)}
        aria-label={name ? `${axis} variable ${name}; change` : `Add ${axis} variable`}
        className={
          axis === "x"
            ? "flex h-[7cqw] w-full items-center justify-center bg-[#dcdcdc] text-[3.6cqw] text-casLabel"
            : "flex h-full w-[7cqw] items-center justify-center bg-[#dcdcdc] text-[3.6cqw] text-casLabel"
        }
      >
        <span className={axis === "y" ? "-rotate-90 whitespace-nowrap" : ""}>
          {name && (axis === "x" || !one) ? <b className="font-casmath text-[1.1em] text-casInk">{name}</b> : "Click to add variable"}
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
            aria-label={`Data and statistics: ${page.plot} plot${page.x ? ` of ${page.x}` : ""}${page.y && !one ? ` against ${page.y}` : ""}`}
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
