// SPDX-License-Identifier: GPL-3.0-or-later
import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { palette } from "@/shared/lib/tokens";
import type { Highlight } from "../ai/highlights";
import type { Key } from "../keys";
import { FlagBadge, flagHex } from "../screen/flag";
import { conditionColour, dashPattern, NAMED_COLOURS, weightFactor } from "../graphs/colours";
import { SliderMenu } from "../graphs/graphs-app";
import { recogniseShape } from "../graphs/mathdraw";
import { SliderView } from "../graphs/sliders";
import type { GeoMode, GeometryPage } from "../state/document";
import { click, labelNewPoints, nextId, prompt, redefinable, redefinePoint, remove, resolve, TOOL_NAMES, type GeoObj, type GeoTool, type Pt, type Shape } from "./model";
import { evalNumber, freeNames } from "./numeric";

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
  const mode = p.mode;
  // A label being typed in place: letters and digits go into it, Enter keeps it, Esc leaves it as it was.
  if (mode?.kind === "label") {
    if (key.k === "esc") return { ...p, mode: null };
    if (key.k === "enter") return labelled(p);
    if (key.k === "backspace" || key.k === "delete") return { ...p, mode: { ...mode, text: mode.text.slice(0, -1) } };
    if (key.k === "char") return { ...p, mode: { ...mode, text: mode.text + key.c } };
    return p;
  }
  if (key.k === "esc") {
    // Calculate and Redefine step back a pick before they end, as the tools do.
    if (mode?.kind === "redefine" && mode.id) return { ...p, mode: { kind: "redefine" } };
    if (mode?.kind === "calculate" && mode.expr !== undefined) return { ...p, mode: { kind: "calculate" } };
    if (mode) return { ...p, mode: null };
    return p.tool ? { ...p, tool: null } : p.multi?.length ? { ...p, multi: undefined } : p.sel ? { ...p, sel: null } : null;
  }
  if ((key.k === "delete" || key.k === "backspace") && p.multi?.length) return { ...p, objects: remove(p.objects, p.multi), multi: undefined, sel: null };
  // p: the Point tool, as Points & Lines ▸ Point shows.
  if (key.k === "char" && key.c === "p" && !p.tool && !mode) return { ...p, tool: { name: "point", picked: [] }, sel: null };
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

/** The context menu's items on the selected object (or what Select ▸ Region took in), on a Geometry page or a Graphs page's construction. */
export const SELECTION_ACTION = /^geo(HideSel|Delete|LabelEdit|RedefineSel|TraceSel|Pin|Colour:.*|Measure:.*)$/;

const toggled = (list: string[] | undefined, id: string) => (list?.includes(id) ? list.filter((t) => t !== id) : [...(list ?? []), id]);

/** One of SELECTION_ACTION's items done to the page (unchanged when nothing is selected). */
export function selectionAction(p: GeometryPage, id: string): GeometryPage {
  const ids = p.multi?.length ? p.multi : p.sel ? [p.sel] : [];
  if (id === "geoDelete") return ids.length ? { ...p, objects: remove(p.objects, ids), multi: undefined, sel: null } : p;
  // Hide: the selection only (Hide/Show is the dialog for all of them).
  if (id === "geoHideSel") return ids.length ? { ...p, objects: p.objects.map((o) => (ids.includes(o.id) ? { ...o, hidden: true } : o)), sel: null, multi: undefined } : p;
  if (id.startsWith("geoColour:")) {
    // geoColour:line|fill:<hex> from Color ▸ (empty: back to the usual).
    const [what, hex = ""] = id.slice(10).split(":");
    const key = what === "fill" ? "fill" : "colour";
    return { ...p, objects: p.objects.map((o) => (o.id === p.sel ? { ...o, attrs: { ...o.attrs, [key]: hex || undefined } } : o)) };
  }
  const sel = p.sel;
  if (!sel) return p;
  switch (id) {
    case "geoLabelEdit":
      return { ...p, tool: null, mode: { kind: "label", id: sel, text: p.objects.find((o) => o.id === sel)?.label ?? "" } };
    case "geoRedefineSel":
      return { ...p, tool: null, mode: { kind: "redefine", id: sel }, sel: null };
    case "geoTraceSel":
      return { ...p, traced: toggled(p.traced, sel) };
    case "geoPin":
      return { ...p, pinned: toggled(p.pinned, sel) };
  }
  // Measurement: the selected object's length (a circle's circumference, a polygon's perimeter) or area.
  const m: GeoObj = { id: nextId(p.objects, "measure"), kind: "measure", what: id.slice(11) as "length" | "area", of: [sel] };
  return { ...p, objects: [...p.objects, m], sel: m.id };
}

/** The label typed in place given to its object (an empty one takes the label away). */
export function labelled(p: GeometryPage): GeometryPage {
  if (p.mode?.kind !== "label") return p;
  const { id, text } = p.mode;
  const label = text.trim();
  return { ...p, mode: null, objects: p.objects.map((o) => (o.id === id ? { ...o, label: label || undefined } : o)) };
}

/** What the guide at the top left says in each mode, as the handheld's tool tips do. */
function modePrompt(m: GeoMode): string {
  switch (m.kind) {
    case "calculate": {
      if (m.expr === undefined) return "Select expression";
      const need = (m.names ?? []).find((n) => !(m.vars ?? {})[n]);
      return need ? `Select a ${need} (or press VAR)` : "Click to place the result";
    }
    case "redefine":
      return m.id ? "Click where the point goes: on a point, an object, or anywhere" : "Select a point to redefine";
    case "conditions":
      return "Select an object";
    case "mathdraw":
      return "Draw a point, a line, a circle, a triangle or a rectangle";
    case "region":
      return "Drag a box around what to select";
    case "zoombox":
      return "Drag a box to zoom to";
    case "label":
      return "Type the label, then Enter";
  }
}

const MODE_NAMES: Record<GeoMode["kind"], string> = {
  calculate: "Calculate",
  redefine: "Redefine",
  conditions: "Set Conditions",
  mathdraw: "MathDraw",
  region: "Select Region",
  zoombox: "Zoom – Box",
  label: "Label",
};

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
  env,
  onConditions,
  onSlider,
  onSliderTyped,
  onSliderAction,
}: {
  /** The problem's variables the page's Calculate results and conditions use, as the shell last read them. */
  env?: Record<string, number>;
  /** Set Conditions picked an object: the shell opens Conditional Attributes for it. */
  onConditions?: (id: string) => void;
  onSlider?: (name: string, value: number, final: boolean) => void;
  onSliderTyped?: (name: string, text: string) => void;
  onSliderAction?: (name: string, action: string) => void;
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
  const [sliderMenu, setSliderMenu] = useState<{ name: string; x: number; y: number } | null>(null);
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

  const settings = page.gsettings;
  const deg = settings?.geoAngle !== "Radian";
  // Sliders on the page set their variables here at once; the problem's others come from the shell.
  const vars = useMemo(() => ({ ...env, ...Object.fromEntries((page.sliders ?? []).map((sl) => [sl.name, sl.value])) }), [env, page.sliders]);
  const all = useMemo(() => resolve(page.objects, { vars, digits: settings?.digits, radians: !deg }), [page.objects, vars, settings?.digits, deg]);
  // Set Conditions: shown only while Show When holds, coloured by the colour expressions' numbers.
  const conds = useMemo(() => {
    const out = new Map<string, { hide?: boolean; line?: string; fill?: string }>();
    for (const o of page.objects) {
      if (!o.cond) continue;
      const val = (src?: string) => (src?.trim() ? evalNumber(src, vars, deg) : NaN);
      const show = val(o.cond.show);
      out.set(o.id, { hide: o.cond.show?.trim() ? show === 0 : false, line: conditionColour(val(o.cond.line)), fill: conditionColour(val(o.cond.fill)) });
    }
    return out;
  }, [page.objects, vars, deg]);
  // Geometry Trace: each traced object's earlier places, kept while the page is open (not saved, as on the handheld).
  // Each object's last place is remembered, so a render that changes nothing (StrictMode's second run) adds nothing.
  const trails = useRef<{ erased: number; shapes: Shape[]; last: Record<string, string> }>({ erased: 0, shapes: [], last: {} });
  if (trails.current.erased !== (page.traceErased ?? 0)) trails.current = { erased: page.traceErased ?? 0, shapes: [], last: {} };
  for (const id of page.traced ?? []) {
    const s = all.get(id);
    const key = s && JSON.stringify(s);
    if (!s || !key || trails.current.last[id] === key) continue;
    trails.current.last[id] = key;
    trails.current.shapes.push(s);
    if (trails.current.shapes.length > 400) trails.current.shapes.shift();
  }
  // Hidden objects are still worked out (others are built on them), but aren't drawn or picked.
  const shapes = useMemo(() => {
    const hidden = new Set(page.objects.flatMap((o) => (o.hidden || conds.get(o.id)?.hide ? [o.id] : [])));
    return hidden.size ? new Map([...all].filter(([id]) => !hidden.has(id))) : all;
  }, [all, page.objects, conds]);
  const byId = useMemo(() => new Map(page.objects.map((o) => [o.id, o] as const)), [page.objects]);
  /** A point's name on screen: its label, or (with Automatically label points on) its name; unlabelled otherwise, as on the handheld. */
  const nameOf = (id: string) => byId.get(id)?.label ?? (settings?.labelPoints ? id : undefined);
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
  const hitAt = (at: Pt, except?: string): string | null => {
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
      if (id === except) continue;
      const d = px(s) - (s.t === "pt" ? 4 : 0);
      if (d < bestD) [best, bestD] = [id, d];
    }
    return best;
  };

  /** A text placed with Actions ▸ Text under the pointer (Calculate picks one), by its place in the list. */
  const textAt = (at: Pt): number | null => {
    const list = page.texts ?? [];
    for (let i = list.length - 1; i >= 0; i--) {
      const t = list[i]!;
      const [x, y] = [X(t.x), Y(t.y)];
      const w = t.text.length * fs * 0.55;
      if (X(at.x) >= x - 4 && X(at.x) <= x + w + 4 && Y(at.y) >= y - fs && Y(at.y) <= y + 4) return i;
    }
    return null;
  };

  const drag = useRef<{ point: string } | { value: string; from: Pt; at: Pt } | { pan: { x: number; y: number }; from: typeof view } | { box: true } | { stroke: [number, number][] } | null>(null);
  // MathDraw's stroke as it's drawn, and where Calculate's result will go.
  const [stroke, setStroke] = useState<[number, number][] | null>(null);
  const [hover, setHover] = useState<Pt | null>(null);
  const tool = page.tool ?? null;
  const mode = page.mode ?? null;
  const marked = new Set([...(tool?.picked ?? []), ...(page.sel ? [page.sel] : []), ...(page.multi ?? []), ...(mode?.kind === "redefine" && mode.id ? [mode.id] : [])]);
  const stored = new Set(page.objects.flatMap((o) => (o.kind === "measure" && o.store ? [o.id] : [])));
  /** An object's stroke as its Attributes set it (a picked one is always the pick colour, and bolder). */
  /** A colour as Attributes names it (Blue …) or the context menu's Color ▸ gives it (a hex value). */
  const named = (c?: string) => (c ? (NAMED_COLOURS[c] ?? (c.startsWith("#") ? c : undefined)) : undefined);
  const ink = (id: string, base: string = palette.casInk) => (marked.has(id) ? PICK : (conds.get(id)?.line ?? named(attrsOf.get(id)?.colour) ?? base));
  /** A shape's inside: its Fill Color condition or colour, or the usual faint tint. */
  const fillOf = (id: string, plain: string) => (marked.has(id) ? "rgba(31,111,209,0.18)" : (conds.get(id)?.fill ?? attrsOf.get(id)?.fill ?? plain));
  const width = (id: string) => (marked.has(id) ? 2.5 : 1.3 * weightFactor(attrsOf.get(id)?.weight));
  const dash = (id: string) => dashPattern(attrsOf.get(id)?.style).join(" ") || undefined;

  /** Calculate's variables: the expression's names, but not the page's own sliders (their values are used as they are). */
  const calcNames = (expr: string) => freeNames(expr).filter((n) => !(page.sliders ?? []).some((sl) => sl.name === n));

  /**
   * MathDraw: the stroke built as the handheld builds it, with the tools a
   * student would use, its new points labelled. An end near a point uses
   * that point, and one on a line or circle is put on it.
   */
  const mathDraw = (pts: [number, number][]) => {
    const shape = recogniseShape(pts, (NEAR * 1.6) / k);
    if (!shape) return;
    const P = (q: [number, number]): Pt => ({ x: q[0], y: q[1] });
    let steps: { tool: GeoTool; at: Pt[] };
    if (shape.kind === "point") steps = { tool: "point", at: [P(shape.at)] };
    else if (shape.kind === "line") steps = { tool: "line", at: [P(shape.a), P(shape.b)] };
    else if (shape.kind === "circle") {
      // Through a point the stroke passed near, if any (the handheld snaps to it), else the circle's right.
      const near = pts.map(P).find((q) => { const h = hitAt(q); return h && shapes.get(h)?.t === "pt"; });
      const c = P(shape.centre);
      const th = near ? Math.atan2(near.y - c.y, near.x - c.x) : 0;
      steps = { tool: "circle", at: [c, { x: c.x + shape.r * Math.cos(th), y: c.y + shape.r * Math.sin(th) }] };
    } else {
      const cs = shape.corners.map(P);
      steps = cs.length === 3 ? { tool: "triangle", at: cs } : cs.length === 4 ? { tool: "rectangle", at: cs.slice(0, 3) } : { tool: "polygon", at: [...cs, cs[0]!] };
    }
    const hits = steps.at.map((q) => hitAt(q));
    onChange((p) => {
      let objs = p.objects;
      let picked: string[] = [];
      steps.at.forEach((q, i) => {
        let hit = hits[i] ?? null;
        // The polygon closes on its first corner.
        if (steps.tool === "polygon" && i === steps.at.length - 1) hit = picked[0] ?? null;
        const on = hit ? resolve(objs).get(hit) : undefined;
        if (hit && on && on.t !== "pt" && on.t !== "value" && steps.tool !== "polygon") {
          // On a line or circle: a point on it, then that point.
          const r = click(objs, "pointon", [], hit, snap(q));
          if (r?.built) [objs, hit] = [r.objs, r.built];
        }
        const r = click(objs, steps.tool, picked, hit, snap(q));
        if (!r) return;
        objs = r.objs;
        picked = r.picked;
      });
      return { ...p, objects: labelNewPoints(p.objects, objs) };
    });
  };

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
          style={{ cursor: tool || mode ? "crosshair" : drag.current && "pan" in drag.current ? "grabbing" : "default" }}
          role="img"
          aria-label={`Geometry: ${page.objects.length} objects${shapes.size < all.size ? ` (${all.size - shapes.size} hidden)` : ""}${tool ? `; ${TOOL_NAMES[tool.name]} tool` : ""}`}
          onPointerDown={(e) => {
            const raw = toWorld(e);
            const hit = hitAt(raw);
            const at = snap(raw);
            const capture = () => e.currentTarget.setPointerCapture(e.pointerId);
            if (mode?.kind === "label") {
              onChange(labelled);
              return;
            }
            if (mode?.kind === "mathdraw") {
              drag.current = { stroke: [[raw.x, raw.y]] };
              setStroke([[raw.x, raw.y]]);
              capture();
              return;
            }
            if (mode?.kind === "region" || mode?.kind === "zoombox") {
              drag.current = { box: true };
              onChange((p) => ({ ...p, mode: { kind: mode.kind, from: raw, to: raw } }));
              capture();
              return;
            }
            if (mode?.kind === "conditions") {
              if (hit) onConditions?.(hit);
              return;
            }
            if (mode?.kind === "redefine") {
              if (!mode.id) {
                if (hit && redefinable(byId.get(hit))) onChange((p) => ({ ...p, mode: { kind: "redefine", id: hit }, sel: null }));
                else if (hit) onError("Error: Only a free point, or a point on an object, can be redefined");
                return;
              }
              const id = mode.id;
              const target = hitAt(raw, id);
              onChange((p) => ({ ...p, objects: redefinePoint(p.objects, id, target, at), mode: { kind: "redefine" } }));
              return;
            }
            if (mode?.kind === "calculate") {
              if (mode.expr === undefined) {
                const t = textAt(raw);
                if (t === null) return;
                const expr = page.texts![t]!.text;
                onChange((p) => ({ ...p, mode: { kind: "calculate", text: t, expr, names: calcNames(expr), vars: {} } }));
                return;
              }
              const need = (mode.names ?? []).find((n) => !(mode.vars ?? {})[n]);
              if (need) {
                const o = hit ? byId.get(hit) : undefined;
                if (hit && (o?.kind === "measure" || o?.kind === "calc")) onChange((p) => (p.mode?.kind === "calculate" ? { ...p, mode: { ...p.mode, vars: { ...p.mode.vars, [need]: hit } } } : p));
                return;
              }
              onChange((p) => {
                if (p.mode?.kind !== "calculate" || p.mode.expr === undefined) return p;
                const calc: GeoObj = { id: nextId(p.objects, "calc"), kind: "calc", expr: p.mode.expr, vars: p.mode.vars ?? {}, at: { x: Number(raw.x.toFixed(4)), y: Number(raw.y.toFixed(4)) } };
                return { ...p, objects: [...p.objects, calc], mode: { kind: "calculate" } };
              });
              return;
            }
            if (tool) {
              // Worked out from the latest page, so quick clicks each count (none sees a stale pick list).
              onChange((p) => {
                if (!p.tool) return p;
                const r = click(p.objects, p.tool.name, p.tool.picked, hit, at);
                if (!r) return p;
                if (r.error) setTimeout(() => onError(`Error: ${r.error}`));
                const name = p.tool.name;
                if (r.ask) setTimeout(() => onAsk(name, r.ask!));
                // New points are named on screen when the settings say to label them.
                return { ...p, objects: p.gsettings?.labelPoints ? labelNewPoints(p.objects, r.objs) : r.objs, tool: { name, picked: r.picked } };
              });
              return;
            }
            onChange((p) => ({ ...p, sel: hit, multi: undefined }));
            // The page's Pin holds everything still, the view included.
            if (page.pinAll) return;
            const o = hit ? byId.get(hit) : undefined;
            // A pinned point stays where it is.
            if (hit && !page.pinned?.includes(hit) && o?.kind === "point") drag.current = { point: hit };
            else if (hit && !page.pinned?.includes(hit) && (o?.kind === "calc" || (o?.kind === "measure" && o.at))) {
              // A result, or a detached measurement, moves where it's dragged.
              drag.current = { value: hit, from: raw, at: o.at! };
            } else if (!hit) drag.current = { pan: { x: e.clientX, y: e.clientY }, from: view };
            if (drag.current) capture();
          }}
          onPointerMove={(e) => {
            const d = drag.current;
            const raw = toWorld(e);
            if (mode?.kind === "redefine" && mode.id && !d) {
              // The point follows the pointer until it's dropped, and what's built on it with it.
              const id = mode.id;
              const at = snap(raw);
              onChange((p) => ({ ...p, objects: redefinePoint(p.objects, id, null, at) }));
              return;
            }
            if (mode?.kind === "calculate" && mode.expr !== undefined) setHover(raw);
            if (!d) return;
            if ("stroke" in d) {
              d.stroke.push([raw.x, raw.y]);
              setStroke([...d.stroke]);
              return;
            }
            if ("box" in d) {
              onChange((p) => (p.mode && (p.mode.kind === "region" || p.mode.kind === "zoombox") ? { ...p, mode: { ...p.mode, to: raw } } : p));
              return;
            }
            if ("pan" in d) {
              const v = { x: d.from.x - (e.clientX - d.pan.x) / k, y: d.from.y + (e.clientY - d.pan.y) / k, w: d.from.w };
              if (overlay) overlay.onView(v);
              else onChange((p) => ({ ...p, view: v }));
              return;
            }
            if ("value" in d) {
              const to = { x: Number((d.at.x + raw.x - d.from.x).toFixed(4)), y: Number((d.at.y + raw.y - d.from.y).toFixed(4)) };
              onChange((p) => ({ ...p, objects: p.objects.map((o) => (o.id === d.value && (o.kind === "calc" || o.kind === "measure") ? { ...o, at: to } : o)) }));
              return;
            }
            const at = snap(raw);
            onChange((p) => ({ ...p, objects: p.objects.map((o) => (o.id === d.point && o.kind === "point" ? { ...o, x: Number(at.x.toFixed(4)), y: Number(at.y.toFixed(4)) } : o)) }));
          }}
          onPointerUp={() => {
            const d = drag.current;
            drag.current = null;
            if (d && "stroke" in d) {
              setStroke(null);
              mathDraw(d.stroke);
            } else if (d && "box" in d && mode && (mode.kind === "region" || mode.kind === "zoombox")) {
              onChange((p) => {
                const m = p.mode;
                if (!m || (m.kind !== "region" && m.kind !== "zoombox") || !m.from || !m.to) return { ...p, mode: null };
                const [x0, x1] = [Math.min(m.from.x, m.to.x), Math.max(m.from.x, m.to.x)];
                const [y0, y1] = [Math.min(m.from.y, m.to.y), Math.max(m.from.y, m.to.y)];
                if (m.kind === "zoombox") {
                  if (x1 - x0 < 1e-6 || y1 - y0 < 1e-6) return { ...p, mode: null };
                  // The box fills the screen across or up, whichever it reaches first.
                  const w = Math.max(x1 - x0, ((y1 - y0) * size.w) / size.h);
                  return { ...p, mode: null, view: { x: (x0 + x1) / 2, y: (y0 + y1) / 2, w } };
                }
                const inside = (q: Pt) => q.x >= x0 && q.x <= x1 && q.y >= y0 && q.y <= y1;
                const ids = [...shapes].filter(([, sh]) => shapePoints(sh).every(inside)).map(([id]) => id);
                return { ...p, mode: null, multi: ids.length ? ids : undefined, sel: null };
              });
            }
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
          {page.analytic && !overlay && (
            // The analytic window: a frame from −6 to 6 across and −4 to 4 up (cm, so coordinates read the same
            // as everywhere on the plane), its axes numbered at each whole unit inside it.
            <g aria-label="Analytic window" fontSize={fs * 0.75} fill={palette.casLabel}>
              <clipPath id={`analytic${page.id}`}>
                <rect x={X(-6)} y={Y(4)} width={12 * k} height={8 * k} />
              </clipPath>
              <rect x={X(-6)} y={Y(4)} width={12 * k} height={8 * k} fill="none" stroke={palette.casInk} strokeWidth={1.2} />
              <g clipPath={`url(#analytic${page.id})`} stroke={palette.casInk} strokeWidth={1}>
                <line x1={X(-6)} y1={Y(0)} x2={X(6)} y2={Y(0)} />
                <line x1={X(0)} y1={Y(-4)} x2={X(0)} y2={Y(4)} />
                {[-5, -4, -3, -2, -1, 1, 2, 3, 4, 5].map((t) => (
                  <line key={`ax${t}`} x1={X(t)} y1={Y(0) - 3} x2={X(t)} y2={Y(0) + 3} />
                ))}
                {[-3, -2, -1, 1, 2, 3].map((t) => (
                  <line key={`ay${t}`} x1={X(0) - 3} y1={Y(t)} x2={X(0) + 3} y2={Y(t)} />
                ))}
              </g>
              {[-5, -4, -3, -2, -1, 1, 2, 3, 4, 5].map((t) => (
                <text key={`nx${t}`} x={X(t)} y={Y(0) + fs * 1.05} textAnchor="middle">
                  {String(t).replace("-", "−")}
                </text>
              ))}
              {[-3, -2, -1, 1, 2, 3].map((t) => (
                <text key={`ny${t}`} x={X(0) - fs * 0.4} y={Y(t) + fs * 0.25} textAnchor="end">
                  {String(t).replace("-", "−")}
                </text>
              ))}
            </g>
          )}
          {/* The assistant's highlights, under everything, so what they mark stays readable on top. */}
          {flags.map((f) => (
            <g key={`flag${f.h.n}`} aria-hidden>
              {f.el}
            </g>
          ))}
          {/* Geometry Trace: where traced objects have been, faint, under everything drawn now. */}
          {trails.current.shapes.map((s, i) => (
            <g key={`trail${i}`} aria-hidden fill="none" stroke={palette.casLabel} strokeOpacity={0.45} strokeWidth={1}>
              {s.t === "pt" && <circle cx={X(s.p.x)} cy={Y(s.p.y)} r={2.5} fill={palette.casLabel} fillOpacity={0.45} stroke="none" />}
              {s.t === "line" && <line {...lineEnds(s)} />}
              {s.t === "circle" && <circle cx={X(s.c.x)} cy={Y(s.c.y)} r={s.r * k} />}
              {s.t === "poly" && <polygon points={s.pts.map((p) => `${X(p.x)},${Y(p.y)}`).join(" ")} />}
              {s.t === "curve" && s.pieces.map((piece, j) => <polyline key={j} points={piece.map((p) => `${X(p.x)},${Y(p.y)}`).join(" ")} />)}
            </g>
          ))}
          {/* Shapes under lines under points, so points stay on top to be picked. */}
          {[...shapes].map(([id, s]) =>
            s.t === "poly" ? (
              <polygon
                key={id}
                points={s.pts.map((p) => `${X(p.x)},${Y(p.y)}`).join(" ")}
                fill={fillOf(id, "rgba(120,150,200,0.12)")}
                fillOpacity={(conds.get(id)?.fill || attrsOf.get(id)?.fill) && !marked.has(id) ? 0.55 : undefined}
                stroke={ink(id)}
                strokeWidth={width(id)}
                strokeDasharray={dash(id)}
                strokeLinejoin="round"
              />
            ) : s.t === "circle" ? (
              <circle key={id} cx={X(s.c.x)} cy={Y(s.c.y)} r={s.r * k} fill={conds.get(id)?.fill ?? attrsOf.get(id)?.fill ?? "none"} fillOpacity={0.55} stroke={ink(id)} strokeWidth={width(id)} strokeDasharray={dash(id)} />
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
            const colour = ink(id); // Black, as the handheld writes its measurements.
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
                {nameOf(id) !== undefined && !(mode?.kind === "label" && mode.id === id) && (
                  <text x={X(s.p.x) + fs * 0.35} y={Y(s.p.y) - fs * 0.35} fontSize={fs} fontStyle="italic" fontFamily='"STIX Two Text Variable", serif' fill={palette.casInk} paintOrder="stroke" stroke={palette.casScreen} strokeWidth={3}>
                    {nameOf(id)!.replace(/'/g, "′")}
                  </text>
                )}
              </g>
            );
          })}
          {/* Labels on lines, circles and shapes (a point's is beside it, above). */}
          {[...shapes].map(([id, s]) => {
            const label = byId.get(id)?.label;
            if (s.t === "pt" || s.t === "value" || label === undefined || (mode?.kind === "label" && mode.id === id)) return null;
            const at = labelSpot(s);
            return (
              <text key={`label${id}`} x={X(at.x)} y={Y(at.y)} fontSize={fs} fontStyle="italic" fontFamily='"STIX Two Text Variable", serif' fill={palette.casInk} paintOrder="stroke" stroke={palette.casScreen} strokeWidth={3}>
                {label}
              </text>
            );
          })}
          {/* Label: what's being typed, in place, with its caret. */}
          {mode?.kind === "label" && shapes.get(mode.id) && (() => {
            const sh = shapes.get(mode.id)!;
            const at = sh.t === "pt" ? { x: X(sh.p.x) + fs * 0.35, y: Y(sh.p.y) - fs * 0.35 } : (() => { const q = labelSpot(sh); return { x: X(q.x), y: Y(q.y) }; })();
            const w = Math.max(fs * 1.4, mode.text.length * fs * 0.55 + fs * 0.6);
            return (
              <g aria-label={`Label: ${mode.text}`}>
                <rect x={at.x - 3} y={at.y - fs} width={w} height={fs * 1.3} fill={palette.casScreen} stroke={palette.casLabel} strokeWidth={1} />
                <text x={at.x} y={at.y} fontSize={fs} fontStyle="italic" fontFamily='"STIX Two Text Variable", serif' fill={palette.casInk}>
                  {mode.text}
                  <tspan fill={palette.casSelect}>|</tspan>
                </text>
              </g>
            );
          })()}
          {/* MathDraw's stroke while it's drawn. */}
          {stroke && <polyline points={stroke.map(([x, y]) => `${X(x)},${Y(y)}`).join(" ")} fill="none" stroke={PICK} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />}
          {/* Select ▸ Region's and Zoom – Box's box while it's dragged. */}
          {mode && (mode.kind === "region" || mode.kind === "zoombox") && mode.from && mode.to && (
            <rect
              x={Math.min(X(mode.from.x), X(mode.to.x))}
              y={Math.min(Y(mode.from.y), Y(mode.to.y))}
              width={Math.abs(X(mode.to.x) - X(mode.from.x))}
              height={Math.abs(Y(mode.to.y) - Y(mode.from.y))}
              fill="rgba(31,111,209,0.08)"
              stroke={PICK}
              strokeDasharray="4 3"
            />
          )}
          {/* Calculate: the result under the pointer until it's placed. */}
          {mode?.kind === "calculate" && mode.expr !== undefined && hover && !(mode.names ?? []).some((n) => !(mode.vars ?? {})[n]) && (
            <text x={X(hover.x)} y={Y(hover.y)} fontSize={fs} fill={palette.casLabel} paintOrder="stroke" stroke={palette.casScreen} strokeWidth={3}>
              {(() => {
                const probe = resolve([...page.objects, { id: "_calc", kind: "calc", expr: mode.expr, vars: mode.vars ?? {}, at: hover }], { vars, digits: settings?.digits, radians: !deg }).get("_calc");
                return probe?.t === "value" ? probe.text : "";
              })()}
            </text>
          )}
          {(page.texts ?? []).map((t, i) => (
            <text key={`text${i}`} x={X(t.x)} y={Y(t.y)} fontSize={fs} fill={mode?.kind === "calculate" && mode.text === i ? PICK : palette.casInk} paintOrder="stroke" stroke={palette.casScreen} strokeWidth={3}>
              {t.text}
            </text>
          ))}
        </svg>
      )}
      {badgeSpots(flags.map((f) => ({ x: f.at.x + 6, y: f.at.y - 26 })), fs * 1.6).map((at, i) => (
        <FlagBadge key={`badge${flags[i]!.h.n}`} n={flags[i]!.h.n} tone={flags[i]!.h.tone} className="absolute" style={{ left: at.x, top: at.y }} />
      ))}
      {/* The scale at the top right, as the handheld shows it in Plane Geometry: a bar 1 cm long at this zoom. */}
      {!overlay && !page.hideScale && size.w > 0 && (
        <div aria-hidden className="pointer-events-none absolute top-[1.4cqw] right-[2cqw] flex flex-col items-center text-[2.8cqw] text-casInk">
          <span className="h-[0.8cqw] border-x border-b border-casInk" style={{ width: `${k}px` }} />
          <span className="italic">1 cm</span>
        </div>
      )}
      {/* Insert Slider: the page's sliders, for its Calculate results and conditions (and the problem's other pages). */}
      {!overlay &&
        (page.sliders ?? []).map((sl, i) => (
          <SliderView
            key={sl.name}
            slider={sl}
            index={i}
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
      {mode && mode.kind !== "label" && !page.hideGuides && (
        <div className="pointer-events-none absolute top-[1.5cqw] left-[1.5cqw] rounded-[0.8cqw] bg-white/90 px-[1.6cqw] py-[0.6cqw] text-[3.3cqw] text-casLabel shadow-sm">
          <b className="font-semibold text-casInk">{MODE_NAMES[mode.kind]}</b> · {modePrompt(mode)}
        </div>
      )}
      {tool && !page.hideGuides && (
        <div className="pointer-events-none absolute top-[1.5cqw] left-[1.5cqw] rounded-[0.8cqw] bg-white/90 px-[1.6cqw] py-[0.6cqw] text-[3.3cqw] text-casLabel shadow-sm">
          <b className="font-semibold text-casInk">{TOOL_NAMES[tool.name]}</b> · {prompt(tool.name, tool.picked, shapes)}
        </div>
      )}
      {!overlay && !page.objects.length && !tool && !mode && !page.sliders?.length && !page.hideGuides && (
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

/** The points that place a shape, for Select ▸ Region (all inside the box, and it's taken in). */
function shapePoints(s: Shape): Pt[] {
  switch (s.t) {
    case "pt":
      return [s.p];
    case "line":
      return [s.p, s.q];
    case "circle":
      return [
        { x: s.c.x - s.r, y: s.c.y - s.r },
        { x: s.c.x + s.r, y: s.c.y + s.r },
      ];
    case "poly":
      return s.pts;
    case "curve":
      return s.pieces.flat();
    case "value":
      return [s.at];
  }
}

/** Where an object's label goes: under a line's middle, at a circle's top right, by a shape's first corner. */
function labelSpot(s: Shape): Pt {
  switch (s.t) {
    case "pt":
      return s.p;
    case "line": {
      const d = Math.hypot(s.q.x - s.p.x, s.q.y - s.p.y) || 1;
      // Under the line (a measurement goes over it), as the handheld puts s1.
      const n = { x: (s.q.y - s.p.y) / d, y: -(s.q.x - s.p.x) / d };
      const down = n.y > 0 || (Math.abs(n.y) < 1e-9 && n.x > 0) ? -1 : 1;
      return { x: (s.p.x + s.q.x) / 2 + n.x * down * 0.5, y: (s.p.y + s.q.y) / 2 + n.y * down * 0.9 };
    }
    case "circle":
      return { x: s.c.x + s.r * 0.75, y: s.c.y + s.r * 0.75 };
    case "poly":
      return { x: s.pts[0]!.x + 0.3, y: s.pts[0]!.y + 0.4 };
    case "curve":
      return s.pieces[0]?.[0] ?? { x: 0, y: 0 };
    case "value":
      return s.at;
  }
}
