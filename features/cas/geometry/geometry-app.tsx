// SPDX-License-Identifier: GPL-3.0-or-later
import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { palette } from "@/shared/lib/tokens";
import type { Highlight } from "../ai/highlights";
import type { Key } from "../keys";
import { FlagBadge, flagHex } from "../screen/flag";
import { dashPattern, NAMED_COLOURS, weightFactor } from "../graphs/colours";
import type { GeometryPage } from "../state/document";
import { click, prompt, remove, resolve, TOOL_NAMES, type GeoTool, type Pt, type Shape } from "./model";

/** What a page shows until it's panned or zoomed: 20 cm across, centred on the origin. */
export const VIEW = { x: 0, y: 0, w: 20 };
/** One zoom step (the + and − keys, and the menu). */
const ZOOM = 1.25;
/** The pointer picks what's within this many pixels. */
const NEAR = 9;
const PICK = "#1f6fd1";

/** Zoom by f (above 1: out) keeping the point `about` where it is on screen (the centre if not given). */
export function zoomed(p: GeometryPage, f: number, about?: Pt): GeometryPage {
  const v = p.view ?? VIEW;
  const w = Math.min(500, Math.max(1, v.w * f));
  const c = about ?? v;
  return { ...p, view: { x: c.x - (c.x - v.x) * (w / v.w), y: c.y - (c.y - v.y) * (w / v.w), w } };
}

/** The grid's spacing for a view w cm across: the smallest 1, 2 or 5 × 10ⁿ cm giving at most 25 squares (1 cm at the standard 20). */
export function gridStep(w: number): number {
  for (let n = -2; n < 4; n++) for (const m of [1, 2, 5]) if (m * 10 ** n >= w / 25) return m * 10 ** n;
  return 10000;
}

/** Keys on a Geometry page: Esc drops the tool (then the selection), Del deletes the selected object, arrows nudge a selected point, + and − zoom. */
export function geometryKey(p: GeometryPage, key: Key): GeometryPage | null {
  if (key.k === "esc") return p.tool ? { ...p, tool: null } : p.sel ? { ...p, sel: null } : null;
  if ((key.k === "delete" || key.k === "backspace") && p.sel) return { ...p, objects: remove(p.objects, [p.sel]), sel: null };
  if (key.k === "char" && key.c === "+") return zoomed(p, 1 / ZOOM);
  if (key.k === "char" && (key.c === "-" || key.c === "−")) return zoomed(p, ZOOM);
  const step = { left: [-0.1, 0], right: [0.1, 0], up: [0, 0.1], down: [0, -0.1] }[key.k as string];
  if (step && p.sel) {
    const at = p.objects.findIndex((o) => o.id === p.sel && o.kind === "point");
    const o = p.objects[at];
    if (o?.kind !== "point") return p;
    const objects = p.objects.slice();
    objects[at] = { ...o, x: Number((o.x + step[0]!).toFixed(4)), y: Number((o.y + step[1]!).toFixed(4)) };
    return { ...p, objects };
  }
  return null;
}

/**
 * Geometry: points, lines, circles and polygons on a plane, built with the
 * menu's tools by pointing (a tool takes points, lines or shapes, and puts a
 * new point where there's nothing to pick). Free points drag, and everything
 * built on them follows; measurements update as they move. Dragging empty
 * space pans, the wheel zooms; with the grid shown, new and dragged points snap to it.
 */
export function GeometryApp({
  page,
  onChange,
  onError,
  onAsk,
  highlights = [],
  overlay,
}: {
  /** Drawn over a Graphs page (its Geometry tools): see-through, no grid or axes of its own, the view the graph's. */
  overlay?: { view: { x: number; y: number; w: number }; onView: (v: { x: number; y: number; w: number }) => void };
  page: GeometryPage;
  onChange: (fn: (p: GeometryPage) => GeometryPage) => void;
  onError: (message: string) => void;
  /** A Rotation or Dilation has its object and centre: ask for the number. */
  onAsk: (tool: GeoTool, picked: string[]) => void;
  /** The assistant's highlights on this page: a halo under each object it marked. */
  highlights?: Highlight[];
}) {
  const box = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    // The wheel (and a trackpad pinch) zooms about the pointer. Not passive, so the page doesn't scroll too.
    const wheel = (e: WheelEvent) => {
      e.preventDefault();
      const r = el.getBoundingClientRect();
      onChange((p) => {
        const v = p.view ?? VIEW;
        const k = r.width / v.w;
        const at = { x: v.x + (e.clientX - r.left - r.width / 2) / k, y: v.y + (r.height / 2 - (e.clientY - r.top)) / k };
        return zoomed(p, Math.exp(Math.max(-1, Math.min(1, e.deltaY * 0.002))), at);
      });
    };
    el.addEventListener("wheel", wheel, { passive: false });
    return () => {
      ro.disconnect();
      el.removeEventListener("wheel", wheel);
    };
  }, [onChange]);

  const all = useMemo(() => resolve(page.objects), [page.objects]);
  // Hidden objects are still worked out (others are built on them), but aren't drawn or picked.
  const shapes = useMemo(() => {
    const hidden = new Set(page.objects.flatMap((o) => (o.hidden ? [o.id] : [])));
    return hidden.size ? new Map([...all].filter(([id]) => !hidden.has(id))) : all;
  }, [all, page.objects]);
  const attrsOf = useMemo(() => new Map(page.objects.flatMap((o) => (o.attrs ? [[o.id, o.attrs] as const] : []))), [page.objects]);
  const view = overlay?.view ?? page.view ?? VIEW;
  const k = size.w / view.w;
  const X = (x: number) => size.w / 2 + (x - view.x) * k;
  const Y = (y: number) => size.h / 2 - (y - view.y) * k;
  const toWorld = (e: ReactPointerEvent): Pt => {
    const r = box.current!.getBoundingClientRect();
    return { x: view.x + (e.clientX - r.left - size.w / 2) / k, y: view.y + (size.h / 2 - (e.clientY - r.top)) / k };
  };
  const step = gridStep(view.w);
  const snap = (p: Pt): Pt => (page.grid ? { x: Number((Math.round(p.x / step) * step).toFixed(4)), y: Number((Math.round(p.y / step) * step).toFixed(4)) } : p);
  const fs = Math.max(10, size.w * 0.032);
  /** An angle's arc radius, in pixels: the same at any zoom. */
  const arcR = fs * 1.8;

  /** Where a measurement's text goes, in pixels: an angle's just outside its arc. */
  const labelAt = (s: Extract<Shape, { t: "value" }>) => {
    if (!s.arc) return { x: X(s.at.x), y: Y(s.at.y) };
    const mid = s.arc.from + s.arc.sweep / 2;
    // A right angle's square is smaller than an arc, so its label sits closer.
    const r = (Math.abs(s.value - 90) < 0.005 ? fs * 1.06 : arcR) + fs * 0.9;
    return { x: X(s.arc.c.x) + r * Math.cos(mid), y: Y(s.arc.c.y) - r * Math.sin(mid) + fs * 0.35 };
  };

  /** The object under the pointer: points first, then lines and circles, then the inside of a polygon. */
  const hitAt = (at: Pt): string | null => {
    const px = (s: Shape): number => {
      if (s.t === "pt") return Math.hypot(s.p.x - at.x, s.p.y - at.y) * k - 3;
      if (s.t === "circle") return Math.abs(Math.hypot(s.c.x - at.x, s.c.y - at.y) - s.r) * k;
      if (s.t === "line") {
        const dx = s.q.x - s.p.x;
        const dy = s.q.y - s.p.y;
        let t = ((at.x - s.p.x) * dx + (at.y - s.p.y) * dy) / (dx * dx + dy * dy);
        if (s.bound !== "line") t = Math.max(0, t);
        if (s.bound === "segment") t = Math.min(1, t);
        return Math.hypot(s.p.x + t * dx - at.x, s.p.y + t * dy - at.y) * k;
      }
      if (s.t === "poly") {
        // Inside (even-odd), at a little less priority than its edges.
        let inside = false;
        for (let i = 0, j = s.pts.length - 1; i < s.pts.length; j = i++) {
          const a = s.pts[i]!;
          const b = s.pts[j]!;
          if (a.y > at.y !== b.y > at.y && at.x < ((b.x - a.x) * (at.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
        }
        return inside ? NEAR - 1 : Infinity;
      }
      if (s.t === "curve") {
        let best = Infinity;
        for (const piece of s.pieces)
          for (let i = 0; i + 1 < piece.length; i++) {
            const [a, b] = [piece[i]!, piece[i + 1]!];
            const dx = b.x - a.x;
            const dy = b.y - a.y;
            const t = Math.max(0, Math.min(1, ((at.x - a.x) * dx + (at.y - a.y) * dy) / (dx * dx + dy * dy || 1)));
            best = Math.min(best, Math.hypot(a.x + t * dx - at.x, a.y + t * dy - at.y) * k);
          }
        return best;
      }
      // A measurement's text, so it can be selected, stored or deleted.
      const l = labelAt(s);
      return Math.hypot(l.x - X(at.x), l.y - fs * 0.4 - Y(at.y)) - fs;
    };
    let best: string | null = null;
    let bestD = NEAR;
    for (const [id, s] of shapes) {
      const d = px(s) - (s.t === "pt" ? 4 : 0);
      if (d < bestD) [best, bestD] = [id, d];
    }
    return best;
  };

  const drag = useRef<{ point: string } | { pan: { x: number; y: number }; from: typeof view } | null>(null);
  const tool = page.tool ?? null;
  const marked = new Set([...(tool?.picked ?? []), ...(page.sel ? [page.sel] : [])]);
  const stored = new Set(page.objects.flatMap((o) => (o.kind === "measure" && o.store ? [o.id] : [])));
  /** An object's stroke as its Attributes set it (a picked one is always the pick colour, and bolder). */
  const ink = (id: string, base: string = palette.casInk) => (marked.has(id) ? PICK : NAMED_COLOURS[attrsOf.get(id)?.colour ?? ""] ?? base);
  const width = (id: string) => (marked.has(id) ? 2.5 : 1.3 * weightFactor(attrsOf.get(id)?.weight));
  const dash = (id: string) => dashPattern(attrsOf.get(id)?.style).join(" ") || undefined;

  const lineEnds = (s: Extract<Shape, { t: "line" }>) => {
    // Far enough past the edge of what's shown, wherever the line starts.
    const far = Math.hypot(s.p.x - view.x, s.p.y - view.y) + 2 * (view.w + size.h / k);
    const d = { x: s.q.x - s.p.x, y: s.q.y - s.p.y };
    const n = Math.hypot(d.x, d.y);
    const u = { x: (d.x / n) * far, y: (d.y / n) * far };
    const from = s.bound === "line" ? { x: s.p.x - u.x, y: s.p.y - u.y } : s.p;
    const to = s.bound === "segment" ? s.q : { x: s.p.x + u.x, y: s.p.y + u.y };
    return { x1: X(from.x), y1: Y(from.y), x2: X(to.x), y2: Y(to.y) };
  };

  /** The assistant's highlights: each object's halo, and where its number goes (screen pixels). */
  const flags = highlights.flatMap((h) => {
    const s = h.target.kind === "object" ? shapes.get(h.target.id) : undefined;
    if (!s) return [];
    const colour = flagHex(h.tone);
    const halo = { fill: "none", stroke: colour, strokeOpacity: 0.35, strokeWidth: 9, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
    switch (s.t) {
      case "pt":
        return [{ h, at: { x: X(s.p.x), y: Y(s.p.y) }, el: <circle cx={X(s.p.x)} cy={Y(s.p.y)} r={9} fill="none" stroke={colour} strokeWidth={2.5} /> }];
      case "line": {
        const ends = s.bound === "segment" ? { x1: X(s.p.x), y1: Y(s.p.y), x2: X(s.q.x), y2: Y(s.q.y) } : lineEnds(s);
        const mid = { x: X((s.p.x + s.q.x) / 2), y: Y((s.p.y + s.q.y) / 2) };
        return [{ h, at: mid, el: <line {...ends} {...halo} /> }];
      }
      case "circle":
        return [{ h, at: { x: X(s.c.x), y: Y(s.c.y) - s.r * k }, el: <circle cx={X(s.c.x)} cy={Y(s.c.y)} r={s.r * k} {...halo} /> }];
      case "poly": {
        const c = s.pts.reduce((m, p) => ({ x: m.x + p.x / s.pts.length, y: m.y + p.y / s.pts.length }), { x: 0, y: 0 });
        return [{ h, at: { x: X(c.x), y: Y(c.y) }, el: <polygon points={s.pts.map((p) => `${X(p.x)},${Y(p.y)}`).join(" ")} {...halo} /> }];
      }
      case "value": {
        const l = labelAt(s);
        return [{ h, at: { x: l.x, y: l.y - fs * 0.8 }, el: <circle cx={l.x} cy={l.y - fs * 0.8} r={fs * 1.3} {...halo} strokeWidth={4} /> }];
      }
      case "curve": {
        const first = s.pieces[0]?.[0];
        if (!first) return [];
        return [{ h, at: { x: X(first.x), y: Y(first.y) }, el: <g>{s.pieces.map((piece, i) => <polyline key={i} points={piece.map((p) => `${X(p.x)},${Y(p.y)}`).join(" ")} {...halo} />)}</g> }];
      }
    }
  });

  /** Grid lines in what's shown, as multiples of the step. */
  const span = (lo: number, hi: number) => {
    const out: number[] = [];
    for (let i = Math.ceil(lo / step); i <= Math.floor(hi / step); i++) out.push(Number((i * step).toFixed(6)));
    return out;
  };
  const xs = k ? span(view.x - size.w / 2 / k, view.x + size.w / 2 / k) : [];
  const ys = k ? span(view.y - size.h / 2 / k, view.y + size.h / 2 / k) : [];

  const arc = (s: Extract<Shape, { t: "value" }>) => {
    const a = s.arc!;
    const [cx, cy] = [X(a.c.x), Y(a.c.y)];
    const u1 = { x: Math.cos(a.from), y: -Math.sin(a.from) };
    const u2 = { x: Math.cos(a.from + a.sweep), y: -Math.sin(a.from + a.sweep) };
    // A right angle is marked with a square, as on paper.
    if (Math.abs(s.value - 90) < 0.005) {
      const r = fs * 0.75;
      return `M ${cx + r * u1.x} ${cy + r * u1.y} L ${cx + r * (u1.x + u2.x)} ${cy + r * (u1.y + u2.y)} L ${cx + r * u2.x} ${cy + r * u2.y}`;
    }
    // Screen y runs down, so an anticlockwise turn draws clockwise.
    return `M ${cx + arcR * u1.x} ${cy + arcR * u1.y} A ${arcR} ${arcR} 0 0 ${a.sweep > 0 ? 0 : 1} ${cx + arcR * u2.x} ${cy + arcR * u2.y}`;
  };

  return (
    <div className={overlay ? "absolute inset-0 font-casui" : "absolute inset-0 bg-casScreen font-casui"} ref={box}>
      {size.w > 0 && (
        <svg
          width={size.w}
          height={size.h}
          // Over a graph with no tool chosen, only the construction's own objects take the pointer; the graph gets the rest.
          className={overlay && !tool ? "pointer-events-none absolute inset-0 select-none [&>*]:pointer-events-auto" : "absolute inset-0 touch-none select-none"}
          style={{ cursor: tool ? "crosshair" : drag.current && "pan" in drag.current ? "grabbing" : "default" }}
          role="img"
          aria-label={`Geometry: ${page.objects.length} objects${shapes.size < all.size ? ` (${all.size - shapes.size} hidden)` : ""}${tool ? `; ${TOOL_NAMES[tool.name]} tool` : ""}`}
          onPointerDown={(e) => {
            const raw = toWorld(e);
            const hit = hitAt(raw);
            const at = snap(raw);
            if (tool) {
              // Worked out from the latest page, so quick clicks each count (none sees a stale pick list).
              onChange((p) => {
                if (!p.tool) return p;
                const r = click(p.objects, p.tool.name, p.tool.picked, hit, at);
                if (!r) return p;
                if (r.error) setTimeout(() => onError(`Error: ${r.error}`));
                const name = p.tool.name;
                if (r.ask) setTimeout(() => onAsk(name, r.ask!));
                return { ...p, objects: r.objs, tool: { name, picked: r.picked } };
              });
              return;
            }
            onChange((p) => ({ ...p, sel: hit }));
            if (hit && page.objects.some((o) => o.id === hit && o.kind === "point")) drag.current = { point: hit };
            else if (!hit) drag.current = { pan: { x: e.clientX, y: e.clientY }, from: view };
            if (drag.current) e.currentTarget.setPointerCapture(e.pointerId);
          }}
          onPointerMove={(e) => {
            const d = drag.current;
            if (!d) return;
            if ("pan" in d) {
              const v = { x: d.from.x - (e.clientX - d.pan.x) / k, y: d.from.y + (e.clientY - d.pan.y) / k, w: d.from.w };
              if (overlay) overlay.onView(v);
              else onChange((p) => ({ ...p, view: v }));
              return;
            }
            const at = snap(toWorld(e));
            onChange((p) => ({ ...p, objects: p.objects.map((o) => (o.id === d.point && o.kind === "point" ? { ...o, x: Number(at.x.toFixed(4)), y: Number(at.y.toFixed(4)) } : o)) }));
          }}
          onPointerUp={() => {
            drag.current = null;
          }}
        >
          {page.grid && (
            <g stroke={palette.casRule} strokeWidth={0.5}>
              {xs.map((t) => (
                <line key={`x${t}`} x1={X(t)} y1={0} x2={X(t)} y2={size.h} />
              ))}
              {ys.map((t) => (
                <line key={`y${t}`} x1={0} y1={Y(t)} x2={size.w} y2={Y(t)} />
              ))}
            </g>
          )}
          {page.axes && (
            <g stroke={palette.casInk} strokeWidth={1}>
              <line x1={0} y1={Y(0)} x2={size.w} y2={Y(0)} />
              <line x1={X(0)} y1={0} x2={X(0)} y2={size.h} />
              {xs.map((t) => (
                <line key={`x${t}`} x1={X(t)} y1={Y(0) - 3} x2={X(t)} y2={Y(0) + 3} />
              ))}
              {ys.map((t) => (
                <line key={`y${t}`} x1={X(0) - 3} y1={Y(t)} x2={X(0) + 3} y2={Y(t)} />
              ))}
            </g>
          )}
          {/* The assistant's highlights, under everything, so what they mark stays readable on top. */}
          {flags.map((f) => (
            <g key={`flag${f.h.n}`} aria-hidden>
              {f.el}
            </g>
          ))}
          {/* Shapes under lines under points, so points stay on top to be picked. */}
          {[...shapes].map(([id, s]) =>
            s.t === "poly" ? (
              <polygon
                key={id}
                points={s.pts.map((p) => `${X(p.x)},${Y(p.y)}`).join(" ")}
                fill={marked.has(id) ? "rgba(31,111,209,0.18)" : "rgba(120,150,200,0.12)"}
                stroke={ink(id)}
                strokeWidth={width(id)}
                strokeDasharray={dash(id)}
                strokeLinejoin="round"
              />
            ) : s.t === "circle" ? (
              <circle key={id} cx={X(s.c.x)} cy={Y(s.c.y)} r={s.r * k} fill="none" stroke={ink(id)} strokeWidth={width(id)} strokeDasharray={dash(id)} />
            ) : s.t === "curve" ? (
              <g key={id} fill="none" stroke={ink(id)} strokeWidth={width(id)} strokeDasharray={dash(id)} strokeLinejoin="round">
                {s.pieces.map((piece, i) => (
                  <polyline key={i} points={piece.map((p) => `${X(p.x)},${Y(p.y)}`).join(" ")} />
                ))}
              </g>
            ) : null,
          )}
          {[...shapes].map(([id, s]) =>
            s.t === "line" ? (
              <g key={id}>
                <line {...lineEnds(s)} stroke={ink(id)} strokeWidth={width(id)} strokeDasharray={dash(id)} strokeLinecap="round" />
                {s.arrow && (() => {
                  // A vector's arrowhead at its end.
                  const [x2, y2] = [X(s.q.x), Y(s.q.y)];
                  const a = Math.atan2(y2 - Y(s.p.y), x2 - X(s.p.x));
                  const h = fs * 0.7;
                  return <path d={`M${x2} ${y2}L${x2 - h * Math.cos(a - 0.4)} ${y2 - h * Math.sin(a - 0.4)}L${x2 - h * Math.cos(a + 0.4)} ${y2 - h * Math.sin(a + 0.4)}Z`} fill={ink(id)} />;
                })()}
              </g>
            ) : null,
          )}
          {[...shapes].map(([id, s]) => {
            if (s.t !== "value") return null;
            const l = labelAt(s);
            const colour = ink(id, "#1d4fa8");
            return (
              <g key={id}>
                {s.arc && <path d={arc(s)} fill="none" stroke={colour} strokeWidth={1.2} />}
                {/* A stored measurement is bold, as on the handheld. */}
                <text x={l.x} y={l.y - fs * 0.4} fontSize={fs} fontWeight={stored.has(id) ? 700 : undefined} textAnchor="middle" fill={colour} paintOrder="stroke" stroke={palette.casScreen} strokeWidth={3}>
                  {s.text}
                </text>
              </g>
            );
          })}
          {[...shapes].map(([id, s]) => {
            if (s.t !== "pt") return null;
            const free = page.objects.some((o) => o.id === id && o.kind === "point");
            return (
              <g key={id}>
                <circle cx={X(s.p.x)} cy={Y(s.p.y)} r={marked.has(id) ? 5 : 3.5 * weightFactor(attrsOf.get(id)?.weight)} fill={marked.has(id) || free ? ink(id) : "#fff"} stroke={ink(id)} strokeWidth={1.3} />
                <text x={X(s.p.x) + fs * 0.35} y={Y(s.p.y) - fs * 0.35} fontSize={fs} fontStyle="italic" fontFamily='"STIX Two Text Variable", serif' fill={palette.casInk} paintOrder="stroke" stroke={palette.casScreen} strokeWidth={3}>
                  {id.replace(/'/g, "′")}
                </text>
              </g>
            );
          })}
          {(page.texts ?? []).map((t, i) => (
            <text key={`text${i}`} x={X(t.x)} y={Y(t.y)} fontSize={fs} fill={palette.casInk} paintOrder="stroke" stroke={palette.casScreen} strokeWidth={3}>
              {t.text}
            </text>
          ))}
        </svg>
      )}
      {badgeSpots(flags.map((f) => ({ x: f.at.x + 6, y: f.at.y - 26 })), fs * 1.6).map((at, i) => (
        <FlagBadge key={`badge${flags[i]!.h.n}`} n={flags[i]!.h.n} tone={flags[i]!.h.tone} className="absolute" style={{ left: at.x, top: at.y }} />
      ))}
      {tool && (
        <div className="pointer-events-none absolute top-[1.5cqw] left-[1.5cqw] rounded-[0.8cqw] bg-white/90 px-[1.6cqw] py-[0.6cqw] text-[3.3cqw] text-casLabel shadow-sm">
          <b className="font-semibold text-casInk">{TOOL_NAMES[tool.name]}</b> · {prompt(tool.name, tool.picked, shapes)}
        </div>
      )}
      {!overlay && !page.objects.length && !tool && (
        <p className="pointer-events-none absolute inset-x-0 bottom-[3cqw] text-center text-[3.3cqw] text-casLabel">Press menu for Points &amp; Lines, Shapes and Construction</p>
      )}
    </div>
  );
}

/** Badges moved right, one badge-width at a time, until none sits on an earlier one (a triangle's centre and a measurement's label are often close). */
function badgeSpots(want: { x: number; y: number }[], size: number): { x: number; y: number }[] {
  const out: { x: number; y: number }[] = [];
  for (const w of want) {
    const at = { ...w };
    for (let guard = 0; guard < 9 && out.some((o) => Math.abs(o.x - at.x) < size && Math.abs(o.y - at.y) < size); guard++) at.x += size;
    out.push(at);
  }
  return out;
}
