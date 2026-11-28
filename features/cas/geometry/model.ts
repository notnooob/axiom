// SPDX-License-Identifier: GPL-3.0-or-later
/**
 * Geometry: a construction of named objects, each defined from earlier ones
 * (a free point, a segment between two points, a perpendicular through a
 * point), so dragging a free point moves everything built on it. Lengths are
 * in cm and angles in degrees, as the handheld's Geometry page shows them.
 */

import { classify as classifyConic } from "../graphs/conics";
import { evalNumber, geoFormat } from "./numeric";

/** Actions ▸ Attributes: line weight, style and colour (a palette name); unset is the default. */
export type GeoAttrs = { weight?: "Thin" | "Medium" | "Thick"; style?: "Continuous" | "Dotted" | "Dashed"; colour?: string; fill?: string };
/**
 * Set Conditions' Conditional Attributes: expressions worked out as the
 * figure moves. show: drawn only while it holds; line and fill: a colour
 * number, 1 to 15 (the Colors… list).
 */
export type GeoCond = { show?: string; line?: string; fill?: string };
/**
 * What every object can have: Hide/Show's flag (a hidden object is still
 * worked out, for what's built on it), its Attributes, the label the context
 * menu's Label gave it (points are unnamed on screen until labelled, as on
 * the handheld), and its conditions.
 */
export type GeoCommon = { hidden?: boolean; attrs?: GeoAttrs; label?: string; cond?: GeoCond };

export type GeoObj = GeoCommon & (
  | { id: string; kind: "point"; x: number; y: number }
  | { id: string; kind: "midpoint"; of: [string, string] }
  | { id: string; kind: "intersection"; of: [string, string]; n: number }
  | { id: string; kind: "segment" | "line" | "ray"; a: string; b: string }
  | { id: string; kind: "perpendicular" | "parallel"; through: string; to: string }
  | { id: string; kind: "bisector"; a: string; b: string }
  | { id: string; kind: "anglebisector"; a: string; b: string; c: string }
  | { id: string; kind: "circle"; centre: string; through?: string; r?: number }
  | { id: string; kind: "polygon"; pts: string[] }
  /** store: the variable its value is kept in, for the problem's other pages. at: where Detach left it (unset, it sits beside what it measures). */
  | { id: string; kind: "measure"; what: "length" | "area" | "perimeter" | "angle" | "slope" | "dangle"; of: string[]; store?: string; at?: Pt }
  /**
   * Actions ▸ Calculate: an expression's value with each of its variables
   * read off the page (name → a measurement's or result's id) or from the
   * problem ("=name"), placed at `at` and kept up to date as the figure moves.
   */
  | { id: string; kind: "calc"; expr: string; vars: Record<string, string>; at: Pt; store?: string }
  /**
   * An image of another object. by: symmetry [centre], reflection [line],
   * translation [from, to], rotation and dilation [centre] with amount (degrees
   * anticlockwise, or the scale factor), or [centre, a measurement] to use its value.
   */
  | { id: string; kind: "transform"; op: TransformOp; of: string; by: string[]; amount?: number }
  /** A point that stays on a line, circle, polygon or curve: t along it (a fraction, or an angle on a circle). */
  | { id: string; kind: "pointon"; on: string; t: number }
  /** The tangent to a circle at the point of it nearest `at`. */
  | { id: string; kind: "tangent"; to: string; at: string }
  | { id: string; kind: "vector"; a: string; b: string }
  /** The arc from a through b to c. */
  | { id: string; kind: "arc"; a: string; b: string; c: string }
  /** A rectangle on side ab, as wide as c is from that side. */
  | { id: string; kind: "rectangle"; a: string; b: string; c: string }
  | { id: string; kind: "regpoly"; centre: string; vertex: string; n: number }
  /** An ellipse or hyperbola from its foci and a point on it, a parabola from its focus and directrix, or the conic through five points. */
  | { id: string; kind: "conic"; type: "ellipse" | "hyperbola" | "parabola" | "five"; of: string[] }
  /** The path a point takes as a Point On (driver) runs along its object. */
  | { id: string; kind: "locus"; of: string; driver: string }
  /** A circle about centre with the radius of a segment (r: [segment]) or two points' distance (r: [p, q]). */
  | { id: string; kind: "compass"; centre: string; r: string[] }
  /** A point a measurement's value along a line, ray or circle from a point. */
  | { id: string; kind: "transfer"; measure: string; onto: string; from: string }
  /** Coordinates and Equations: a point's coordinates, or a line's or circle's equation, kept beside it as it moves. */
  | { id: string; kind: "coords"; of: string }
);

export type TransformOp = "symmetry" | "reflection" | "translation" | "rotation" | "dilation";

export type Pt = { x: number; y: number };
/** What an object works out to: a point, a line (bounded as segment or ray, or not), a circle, a polygon, or a measured value. */
export type Shape =
  | { t: "pt"; p: Pt }
  | { t: "line"; p: Pt; q: Pt; bound: "segment" | "ray" | "line"; arrow?: boolean }
  /** A curve as joined points: an arc, an ellipse, a hyperbola's branches, a parabola, a locus. */
  | { t: "curve"; pieces: Pt[][]; closed?: boolean }
  | { t: "circle"; c: Pt; r: number }
  | { t: "poly"; pts: Pt[] }
  /** arc: an angle's, at its vertex, from one side (radians) turning sweep to the other. */
  | { t: "value"; value: number; text: string; at: Pt; arc?: { c: Pt; from: number; sweep: number } };

const EPS = 1e-9;
const dist = (p: Pt, q: Pt) => Math.hypot(p.x - q.x, p.y - q.y);
const round = (v: number) => String(Number(v.toFixed(2))).replace("-", "−");
const area = (pts: Pt[]) => Math.abs(pts.reduce((s, p, i) => s + p.x * pts[(i + 1) % pts.length]!.y - pts[(i + 1) % pts.length]!.x * p.y, 0)) / 2;
const centroid = (pts: Pt[]): Pt => ({ x: pts.reduce((s, p) => s + p.x, 0) / pts.length, y: pts.reduce((s, p) => s + p.y, 0) / pts.length });

/** Where two lines or circles meet (a segment or ray only where it reaches). */
export function meet(s: Shape, u: Shape): Pt[] {
  if (s.t === "circle" && u.t === "line") return meet(u, s);
  const on = (l: Extract<Shape, { t: "line" }>, p: Pt) => {
    const dx = l.q.x - l.p.x;
    const dy = l.q.y - l.p.y;
    const k = ((p.x - l.p.x) * dx + (p.y - l.p.y) * dy) / (dx * dx + dy * dy);
    return l.bound === "line" || (k >= -EPS && (l.bound === "ray" || k <= 1 + EPS));
  };
  if (s.t === "line" && u.t === "line") {
    const d1 = { x: s.q.x - s.p.x, y: s.q.y - s.p.y };
    const d2 = { x: u.q.x - u.p.x, y: u.q.y - u.p.y };
    const den = d1.x * d2.y - d1.y * d2.x;
    if (Math.abs(den) < EPS) return [];
    const k = ((u.p.x - s.p.x) * d2.y - (u.p.y - s.p.y) * d2.x) / den;
    const p = { x: s.p.x + k * d1.x, y: s.p.y + k * d1.y };
    return on(s, p) && on(u, p) ? [p] : [];
  }
  if (s.t === "line" && u.t === "circle") {
    const d = { x: s.q.x - s.p.x, y: s.q.y - s.p.y };
    const f = { x: s.p.x - u.c.x, y: s.p.y - u.c.y };
    const a = d.x * d.x + d.y * d.y;
    const b = 2 * (f.x * d.x + f.y * d.y);
    const c = f.x * f.x + f.y * f.y - u.r * u.r;
    const disc = b * b - 4 * a * c;
    if (disc < -EPS) return [];
    const roots = disc < EPS ? [-b / (2 * a)] : [(-b - Math.sqrt(disc)) / (2 * a), (-b + Math.sqrt(disc)) / (2 * a)];
    return roots.map((k) => ({ x: s.p.x + k * d.x, y: s.p.y + k * d.y })).filter((p) => on(s, p));
  }
  if (s.t === "circle" && u.t === "circle") {
    const d = dist(s.c, u.c);
    if (d < EPS || d > s.r + u.r + EPS || d < Math.abs(s.r - u.r) - EPS) return [];
    const a = (s.r * s.r - u.r * u.r + d * d) / (2 * d);
    const h = Math.sqrt(Math.max(0, s.r * s.r - a * a));
    const m = { x: s.c.x + (a * (u.c.x - s.c.x)) / d, y: s.c.y + (a * (u.c.y - s.c.y)) / d };
    const o = { x: (-h * (u.c.y - s.c.y)) / d, y: (h * (u.c.x - s.c.x)) / d };
    return h < EPS ? [m] : [{ x: m.x + o.x, y: m.y + o.y }, { x: m.x - o.x, y: m.y - o.y }];
  }
  return [];
}

/** Every object worked out, in order (each is built only from ones before it); one that can't be (parallel lines' meeting) is left out. */
/**
 * What the page's settings and the problem lend the figure: variables'
 * values (sliders, the problem's variables) for Calculate and conditions,
 * Display Digits for values, and the Geometry Angle.
 */
export type GeoEnv = { vars?: Record<string, number>; digits?: string; radians?: boolean };

export function resolve(objs: GeoObj[], env: GeoEnv = {}): Map<string, Shape> {
  const out = new Map<string, Shape>();
  const pt = (id: string) => {
    const s = out.get(id);
    return s?.t === "pt" ? s.p : undefined;
  };
  const line = (id: string) => {
    const s = out.get(id);
    return s?.t === "line" ? s : undefined;
  };
  for (const o of objs) {
    let s: Shape | undefined;
    switch (o.kind) {
      case "point":
        s = { t: "pt", p: { x: o.x, y: o.y } };
        break;
      case "midpoint": {
        const [p, q] = o.of.map(pt);
        if (p && q) s = { t: "pt", p: { x: (p.x + q.x) / 2, y: (p.y + q.y) / 2 } };
        break;
      }
      case "intersection": {
        const [a, b] = o.of.map((id) => out.get(id));
        const p = a && b ? meet(a, b)[o.n] : undefined;
        if (p) s = { t: "pt", p };
        break;
      }
      case "segment":
      case "line":
      case "ray": {
        const p = pt(o.a);
        const q = pt(o.b);
        if (p && q && dist(p, q) > EPS) s = { t: "line", p, q, bound: o.kind };
        break;
      }
      case "perpendicular":
      case "parallel": {
        const p = pt(o.through);
        const l = line(o.to);
        if (p && l) {
          const d = { x: l.q.x - l.p.x, y: l.q.y - l.p.y };
          const dir = o.kind === "parallel" ? d : { x: -d.y, y: d.x };
          s = { t: "line", p, q: { x: p.x + dir.x, y: p.y + dir.y }, bound: "line" };
        }
        break;
      }
      case "bisector": {
        const p = pt(o.a);
        const q = pt(o.b);
        if (p && q && dist(p, q) > EPS) {
          const m = { x: (p.x + q.x) / 2, y: (p.y + q.y) / 2 };
          s = { t: "line", p: m, q: { x: m.x - (q.y - p.y), y: m.y + (q.x - p.x) }, bound: "line" };
        }
        break;
      }
      case "anglebisector": {
        const [a, b, c] = [pt(o.a), pt(o.b), pt(o.c)];
        if (a && b && c && dist(a, b) > EPS && dist(c, b) > EPS) {
          const u = { x: (a.x - b.x) / dist(a, b) + (c.x - b.x) / dist(c, b), y: (a.y - b.y) / dist(a, b) + (c.y - b.y) / dist(c, b) };
          // A straight angle's bisector is the perpendicular there.
          const dir = Math.hypot(u.x, u.y) < EPS ? { x: -(a.y - b.y), y: a.x - b.x } : u;
          s = { t: "line", p: b, q: { x: b.x + dir.x, y: b.y + dir.y }, bound: "ray" };
        }
        break;
      }
      case "circle": {
        const c = pt(o.centre);
        const r = o.through ? (pt(o.through) && c ? dist(c, pt(o.through)!) : undefined) : o.r;
        if (c && r !== undefined && r > EPS) s = { t: "circle", c, r };
        break;
      }
      case "polygon": {
        const pts = o.pts.map(pt);
        if (pts.length >= 3 && pts.every(Boolean)) s = { t: "poly", pts: pts as Pt[] };
        break;
      }
      case "measure":
        s = measure(o, out, env);
        // Detached (the context menu's Detach), it stays where it was left.
        if (s?.t === "value" && o.at) s = { ...s, at: o.at, arc: s.arc };
        break;
      case "coords":
        s = coordsOf(out.get(o.of));
        break;
      case "calc": {
        // Each variable's value read off the page (a measurement, another result) or from the problem.
        const vals: Record<string, number> = { ...env.vars };
        for (const [name, from] of Object.entries(o.vars)) {
          if (from.startsWith("=")) vals[name] = env.vars?.[from.slice(1)] ?? NaN;
          else {
            const v = out.get(from);
            vals[name] = v?.t === "value" ? v.value : NaN;
          }
        }
        const value = evalNumber(o.expr, vals, !env.radians);
        s = { t: "value", value, text: Number.isFinite(value) ? geoFormat(value, env.digits) : "undef", at: o.at };
        break;
      }
      case "transform": {
        const f = mapping(o, out);
        const src = out.get(o.of);
        if (f && src) s = image(src, f.map, f.scale);
        break;
      }
      default:
        s = resolveMore(o, out, objs);
    }
    if (s) out.set(o.id, s);
  }
  return out;
}

/** A number in an equation: two places, a minus sign, and no "+−". */
const signed = (v: number) => (v < 0 ? `−${round(-v)}` : `+${round(v)}`);
/** (x−h)² with h's sign folded in; x² when h is 0. */
const shifted = (v: string, h: number) => (Math.abs(h) < 0.005 ? `${v}²` : `(${v}${signed(-h)})²`);

/** Coordinates and Equations: the text, just beside the object it describes. */
function coordsOf(s: Shape | undefined): Shape | undefined {
  const label = (text: string, at: Pt): Shape => ({ t: "value", value: NaN, text, at: { x: at.x + 0.3, y: at.y + 0.5 } });
  // A point's name sits above it, so its coordinates go underneath.
  if (s?.t === "pt") return { t: "value", value: NaN, text: `(${round(s.p.x)}, ${round(s.p.y)})`, at: { x: s.p.x, y: s.p.y - 0.9 } };
  if (s?.t === "line") {
    const dx = s.q.x - s.p.x;
    const mid = { x: (s.p.x + s.q.x) / 2, y: (s.p.y + s.q.y) / 2 };
    if (Math.abs(dx) < EPS) return label(`x=${round(s.p.x)}`, mid);
    const m = (s.q.y - s.p.y) / dx;
    const b = s.p.y - m * s.p.x;
    const text = Math.abs(m) < 0.005 ? `y=${round(b)}` : `y=${round(m)}·x${Math.abs(b) < 0.005 ? "" : signed(b)}`;
    return label(text, mid);
  }
  if (s?.t === "circle") return label(`${shifted("x", s.c.x)}+${shifted("y", s.c.y)}=${round(s.r * s.r)}`, { x: s.c.x + s.r * 0.72, y: s.c.y + s.r * 0.72 });
  return undefined;
}

/** The point map a transformation makes, and how it scales lengths. */
function mapping(o: Extract<GeoObj, { kind: "transform" }>, out: Map<string, Shape>): { map: (p: Pt) => Pt; scale: number } | undefined {
  const at = (i: number) => out.get(o.by[i]!);
  const c = at(0)?.t === "pt" ? (at(0) as Extract<Shape, { t: "pt" }>).p : undefined;
  // The amount, given or read off a measurement.
  const v = at(1);
  const amount = o.amount ?? (v?.t === "value" && Number.isFinite(v.value) ? v.value : undefined);
  switch (o.op) {
    case "symmetry":
      return c && { map: (p) => ({ x: 2 * c.x - p.x, y: 2 * c.y - p.y }), scale: 1 };
    case "reflection": {
      const l = at(0);
      if (l?.t !== "line") return undefined;
      const d = { x: l.q.x - l.p.x, y: l.q.y - l.p.y };
      const n = d.x * d.x + d.y * d.y;
      return {
        map: (p) => {
          const k = ((p.x - l.p.x) * d.x + (p.y - l.p.y) * d.y) / n;
          return { x: 2 * (l.p.x + k * d.x) - p.x, y: 2 * (l.p.y + k * d.y) - p.y };
        },
        scale: 1,
      };
    }
    case "translation": {
      const b = at(1);
      if (!c || b?.t !== "pt") return undefined;
      return { map: (p) => ({ x: p.x + b.p.x - c.x, y: p.y + b.p.y - c.y }), scale: 1 };
    }
    case "rotation": {
      if (!c || amount === undefined) return undefined;
      const [cos, sin] = [Math.cos((amount * Math.PI) / 180), Math.sin((amount * Math.PI) / 180)];
      return { map: (p) => ({ x: c.x + (p.x - c.x) * cos - (p.y - c.y) * sin, y: c.y + (p.x - c.x) * sin + (p.y - c.y) * cos }), scale: 1 };
    }
    case "dilation":
      return c && amount !== undefined ? { map: (p) => ({ x: c.x + amount * (p.x - c.x), y: c.y + amount * (p.y - c.y) }), scale: Math.abs(amount) } : undefined;
  }
}

/** A shape carried by a transformation (a measured value isn't). */
function image(s: Shape, f: (p: Pt) => Pt, scale: number): Shape | undefined {
  if (s.t === "pt") return { t: "pt", p: f(s.p) };
  if (s.t === "line") {
    const [p, q] = [f(s.p), f(s.q)];
    return dist(p, q) > EPS ? { ...s, p, q } : undefined;
  }
  if (s.t === "circle") return s.r * scale > EPS ? { t: "circle", c: f(s.c), r: s.r * scale } : undefined;
  if (s.t === "poly") return { t: "poly", pts: s.pts.map(f) };
  if (s.t === "curve") return { ...s, pieces: s.pieces.map((piece) => piece.map(f)) };
  return undefined;
}

function measure(o: Extract<GeoObj, { kind: "measure" }>, out: Map<string, Shape>, env: GeoEnv): Shape | undefined {
  const of = o.of.map((id) => out.get(id));
  if (of.some((s) => !s)) return undefined;
  const [s, u, v] = of as Shape[];
  // Written to the settings' Display Digits (Float 3 unless changed), as the handheld writes 14.8 cm.
  const value = (n: number, unit: string, at: Pt): Extract<Shape, { t: "value" }> => ({ t: "value", value: n, text: `${geoFormat(n, env.digits)}${unit}`, at });
  // A length is written just off its segment (on the upper side), not over the line.
  const beside = (p: Pt, q: Pt): Pt => {
    const d = dist(p, q) || 1;
    const n = { x: -(q.y - p.y) / d, y: (q.x - p.x) / d };
    const up = n.y < -EPS || (Math.abs(n.y) < EPS && n.x < 0) ? -0.5 : 0.5;
    return { x: (p.x + q.x) / 2 + n.x * up, y: (p.y + q.y) / 2 + n.y * up };
  };
  switch (o.what) {
    case "length":
      if (s?.t === "pt" && u?.t === "pt") return value(dist(s.p, u.p), " cm", beside(s.p, u.p));
      if (s?.t === "line" && s.bound === "segment") return value(dist(s.p, s.q), " cm", beside(s.p, s.q));
      if (s?.t === "circle") return value(2 * Math.PI * s.r, " cm", { x: s.c.x, y: s.c.y + s.r });
      if (s?.t === "poly") return value(s.pts.reduce((t, p, i) => t + dist(p, s.pts[(i + 1) % s.pts.length]!), 0), " cm", centroid(s.pts));
      return undefined;
    case "perimeter":
      if (s?.t === "poly") return value(s.pts.reduce((t, p, i) => t + dist(p, s.pts[(i + 1) % s.pts.length]!), 0), " cm", centroid(s.pts));
      if (s?.t === "circle") return value(2 * Math.PI * s.r, " cm", s.c);
      return undefined;
    case "area":
      if (s?.t === "poly") return value(area(s.pts), " cm²", centroid(s.pts));
      if (s?.t === "circle") return value(Math.PI * s.r * s.r, " cm²", s.c);
      return undefined;
    case "slope":
      if (s?.t === "line") {
        const dx = s.q.x - s.p.x;
        return Math.abs(dx) < EPS ? { t: "value", value: Infinity, text: "undef", at: s.p } : value((s.q.y - s.p.y) / dx, "", { x: (s.p.x + s.q.x) / 2, y: (s.p.y + s.q.y) / 2 });
      }
      return undefined;
    case "dangle":
    case "angle":
      if (s?.t === "pt" && u?.t === "pt" && v?.t === "pt") {
        const a = Math.atan2(s.p.y - u.p.y, s.p.x - u.p.x);
        const c = Math.atan2(v.p.y - u.p.y, v.p.x - u.p.x);
        // The turn from one side to the other, the short way round.
        let sweep = c - a;
        if (sweep > Math.PI) sweep -= 2 * Math.PI;
        if (sweep <= -Math.PI) sweep += 2 * Math.PI;
        const mid = a + sweep / 2;
        // A directed angle keeps its sign: anticlockwise from the first side is positive.
        const turn = o.what === "dangle" ? sweep : Math.abs(sweep);
        // In radians when the settings' Geometry Angle says so.
        if (env.radians) return { ...value(turn, " rad", { x: u.p.x + 1.6 * Math.cos(mid), y: u.p.y + 1.6 * Math.sin(mid) }), arc: { c: u.p, from: a, sweep } };
        const deg = (turn * 180) / Math.PI;
        return { ...value(deg, "°", { x: u.p.x + 1.6 * Math.cos(mid), y: u.p.y + 1.6 * Math.sin(mid) }), arc: { c: u.p, from: a, sweep } };
      }
      return undefined;
  }
}

/** The next free point name: A…Z, then A1, B1… */
export function nextLabel(objs: GeoObj[]): string {
  const used = new Set(objs.map((o) => o.id));
  for (let n = 0; ; n++) for (let i = 0; i < 26; i++) {
    const name = String.fromCharCode(65 + i) + (n ? String(n) : "");
    if (!used.has(name)) return name;
  }
}

/** A new object's id: its kind's letter and the next number (s1, l1, c1…). Points are named instead. */
export function nextId(objs: GeoObj[], kind: GeoObj["kind"]): string {
  const prefix = { segment: "s", line: "l", ray: "r", perpendicular: "l", parallel: "l", bisector: "l", anglebisector: "r", circle: "c", polygon: "p", measure: "m", tangent: "l", vector: "v", arc: "a", rectangle: "p", regpoly: "p", conic: "k", locus: "lo", compass: "c", coords: "e", calc: "n" }[kind as string] ?? "o";
  const used = new Set(objs.map((o) => o.id));
  let n = 1;
  while (used.has(`${prefix}${n}`)) n++;
  return `${prefix}${n}`;
}

/** An object kind with the same id letter as a shape (for naming a transformed image). */
const kindOf = (s: Shape): GeoObj["kind"] => (s.t === "circle" ? "circle" : s.t === "poly" ? "polygon" : s.t === "line" ? (s.bound === "segment" ? "segment" : s.bound === "ray" ? "ray" : "line") : "point");

/** Remove objects, and everything built on them. */
export function remove(objs: GeoObj[], ids: string[]): GeoObj[] {
  const gone = new Set(ids);
  return objs.filter((o) => {
    if (gone.has(o.id) || refsOf(o).some((r) => gone.has(r))) {
      gone.add(o.id);
      return false;
    }
    return true;
  });
}

/** The objects an object is built on. */
export function refsOf(o: GeoObj): string[] {
    switch (o.kind) {
      case "point":
        return [];
      case "midpoint":
      case "intersection":
      case "measure":
        return o.of;
      case "segment":
      case "line":
      case "ray":
      case "bisector":
        return [o.a, o.b];
      case "perpendicular":
      case "parallel":
        return [o.through, o.to];
      case "anglebisector":
        return [o.a, o.b, o.c];
      case "circle":
        return o.through ? [o.centre, o.through] : [o.centre];
      case "polygon":
        return o.pts;
      case "transform":
        return [o.of, ...o.by];
      case "pointon":
        return [o.on];
      case "tangent":
        return [o.to, o.at];
      case "vector":
        return [o.a, o.b];
      case "arc":
      case "rectangle":
        return [o.a, o.b, o.c];
      case "regpoly":
        return [o.centre, o.vertex];
      case "conic":
        return o.of;
      case "locus":
        return [o.of, o.driver];
      case "compass":
        return [o.centre, ...o.r];
      case "transfer":
        return [o.measure, o.onto, o.from];
      case "coords":
        return [o.of];
      case "calc":
        return Object.values(o.vars).filter((v) => !v.startsWith("="));
    }
}

// ---- Building from a description (the assistant's tool)

export type GeoSpec = {
  type: string;
  name?: string;
  x?: number;
  y?: number;
  points?: string[];
  of?: string[];
  through?: string;
  to?: string;
  radius?: number;
  /** rotation: degrees anticlockwise. */
  angle?: number;
  /** dilation: the scale factor. */
  factor?: number;
  /** A measurement or a calculate result: the variable to keep its value in. */
  store?: string;
  /** calculate: the expression, and each of its variables' value: a measurement's or another result's id, or "=name" for the problem's variable. */
  expr?: string;
  vars?: Record<string, string>;
};

/** A name a measurement can be stored in. */
export const VAR_NAME = /^[A-Za-z][A-Za-z0-9_]*$/;
const TRANSFORMS = new Set<string>(["symmetry", "reflection", "translation", "rotation", "dilation"]);

/**
 * Add what a spec describes (or move a point that's already there) and return
 * the new objects, the id given to the spec's object, or an error saying
 * what's missing. Lines are referred to by id or by two point names ("AB").
 */
export function addSpec(objs: GeoObj[], spec: GeoSpec): { objs: GeoObj[]; id: string } | { error: string } {
  const r = addSpecRaw(objs, spec);
  // The assistant's points are named in its replies, so they're labelled on screen too.
  return "error" in r ? r : { ...r, objs: labelNewPoints(objs, r.objs) };
}

/** Points in `objs` that weren't in `before`, labelled with their names (Automatically label points, MathDraw, the assistant). */
export function labelNewPoints(before: GeoObj[], objs: GeoObj[]): GeoObj[] {
  const had = new Set(before.map((o) => o.id));
  const shapes = resolve(objs);
  return objs.map((o) => (!had.has(o.id) && !o.label && shapes.get(o.id)?.t === "pt" ? { ...o, label: o.id } : o));
}

function addSpecRaw(objs: GeoObj[], spec: GeoSpec): { objs: GeoObj[]; id: string } | { error: string } {
  const has = (id: string) => objs.some((o) => o.id === id);
  const needPts = (ids: string[] | undefined, n: number) => {
    const list = ids ?? [];
    if (list.length < n) return `${spec.type} needs ${n} points`;
    const missing = list.find((id) => !has(id));
    return missing ? `there's no point ${missing}` : null;
  };
  const lineRef = (ref: string | undefined): { objs: GeoObj[]; id: string } | { error: string } => {
    if (!ref) return { error: `${spec.type} needs a line (to)` };
    if (has(ref) && resolve(objs).get(ref)?.t === "line") return { objs, id: ref };
    const two = /^([A-Z]\d*'*)([A-Z]\d*'*)$/.exec(ref);
    if (two && has(two[1]!) && has(two[2]!)) {
      const existing = objs.find((o) => (o.kind === "segment" || o.kind === "line") && ((o.a === two[1] && o.b === two[2]) || (o.a === two[2] && o.b === two[1])));
      if (existing) return { objs, id: existing.id };
      const id = nextId(objs, "line");
      return { objs: [...objs, { id, kind: "line", a: two[1]!, b: two[2]! }], id };
    }
    return { error: `there's no line ${ref}` };
  };
  const add = (o: GeoObj) => ({ objs: [...objs, o], id: o.id });
  // An object given without its type (the assistant's slip) says so, rather than failing on the missing name.
  if (typeof spec.type !== "string") throw new Error(`Each object needs a type (point, segment, circle …)${spec.name ? `: ${spec.name} has none` : ""}`);
  const type = spec.type.toLowerCase().replace(/[\s-]+/g, "_");
  const pts = spec.points ?? spec.of;
  switch (type) {
    // Actions ▸ Calculate, without the pointing: the result placed at x, y and kept up to date.
    case "calculate": {
      if (!spec.expr?.trim()) return { error: "calculate needs expr" };
      if (spec.x === undefined || spec.y === undefined) return { error: "calculate needs x and y (where its result goes)" };
      if (spec.store !== undefined && !VAR_NAME.test(spec.store)) return { error: `store needs a variable name (letters, digits and _): not ${spec.store}` };
      const vars = spec.vars ?? {};
      const bad = Object.entries(vars).find(([, v]) => !v.startsWith("=") && !has(v));
      if (bad) return { error: `${bad[0]} refers to ${bad[1]}, which isn't on the page (give a measurement's id, or "=name" for a variable)` };
      return add({ id: spec.name ?? nextId(objs, "calc"), kind: "calc", expr: spec.expr, vars, at: { x: spec.x, y: spec.y }, ...(spec.store ? { store: spec.store } : {}) });
    }
    // Actions ▸ Redefine, without the pointing: the point onto an object (to), merged with another point (to), or free at x, y.
    case "redefine": {
      const name = spec.name ?? "";
      if (!redefinable(objs.find((o) => o.id === name))) return { error: `${name || "name"} must be a free point, or a point on an object` };
      if (spec.to !== undefined && !has(spec.to)) return { error: `there's no object ${spec.to}` };
      const shapes = resolve(objs);
      const s = spec.to ? shapes.get(spec.to) : undefined;
      // Onto an object without x, y: where the point is now, put on it.
      const here = shapes.get(name);
      const at = spec.x !== undefined && spec.y !== undefined ? { x: spec.x, y: spec.y } : s?.t === "pt" ? s.p : here?.t === "pt" ? here.p : null;
      if (!at) return { error: "redefine needs x and y, or to" };
      if (spec.to && dependents(objs, name).has(spec.to)) return { error: `${spec.to} is built on ${name}, so ${name} can't go on it` };
      return { objs: redefinePoint(objs, name, spec.to ?? null, at), id: spec.to && s?.t === "pt" ? spec.to : name };
    }
    case "point": {
      if (spec.x === undefined || spec.y === undefined) return { error: "a point needs x and y" };
      const name = spec.name ?? nextLabel(objs);
      if (!/^[A-Z]\d*$/.test(name)) return { error: `point names are a capital letter, maybe with a number (A, B1): not ${name}` };
      const at = objs.findIndex((o) => o.id === name);
      if (at >= 0) {
        if (objs[at]!.kind !== "point") return { error: `${name} isn't a free point, so it can't be moved` };
        const next = objs.slice();
        next[at] = { ...objs[at]!, id: name, kind: "point", x: spec.x, y: spec.y };
        return { objs: next, id: name };
      }
      return add({ id: name, kind: "point", x: spec.x, y: spec.y });
    }
    case "segment":
    case "line":
    case "ray": {
      const e = needPts(pts, 2);
      if (e) return { error: e };
      return add({ id: spec.name ?? nextId(objs, type), kind: type, a: pts![0]!, b: pts![1]! });
    }
    case "midpoint": {
      const e = needPts(pts, 2);
      if (e) return { error: e };
      return add({ id: spec.name ?? nextLabel(objs), kind: "midpoint", of: [pts![0]!, pts![1]!] });
    }
    case "intersection": {
      const ids = spec.of ?? [];
      if (ids.length !== 2) return { error: "intersection needs of: two lines or circles" };
      const refs: string[] = [];
      for (const r of ids) {
        if (has(r) && resolve(objs).get(r)?.t === "circle") refs.push(r);
        else {
          const l = lineRef(r);
          if ("error" in l) return l;
          objs = l.objs;
          refs.push(l.id);
        }
      }
      const shapes = resolve(objs);
      const [s, u] = refs.map((r) => shapes.get(r));
      const found = s && u ? meet(s, u) : [];
      if (!found.length) return { error: `${ids[0]} and ${ids[1]} don't meet` };
      let next = objs;
      let first = "";
      found.forEach((_, n) => {
        const id = n === 0 && spec.name ? spec.name : nextLabel(next);
        first ||= id;
        next = [...next, { id, kind: "intersection", of: [refs[0]!, refs[1]!], n }];
      });
      return { objs: next, id: first };
    }
    case "perpendicular":
    case "parallel": {
      if (!spec.through || !has(spec.through)) return { error: `${type} needs through: a point` };
      const l = lineRef(spec.to);
      if ("error" in l) return l;
      objs = l.objs;
      return add({ id: spec.name ?? nextId(objs, type), kind: type, through: spec.through, to: l.id });
    }
    case "perpendicular_bisector": {
      const e = needPts(pts, 2);
      if (e) return { error: e };
      return add({ id: spec.name ?? nextId(objs, "bisector"), kind: "bisector", a: pts![0]!, b: pts![1]! });
    }
    case "angle_bisector": {
      const e = needPts(pts, 3);
      if (e) return { error: e };
      return add({ id: spec.name ?? nextId(objs, "anglebisector"), kind: "anglebisector", a: pts![0]!, b: pts![1]!, c: pts![2]! });
    }
    case "circle": {
      const centre = spec.through && pts?.length ? pts[0] : (pts?.[0] ?? spec.of?.[0]);
      if (!centre || !has(centre)) return { error: "a circle needs its centre: points: [centre] and either radius or through" };
      if (spec.through && !has(spec.through)) return { error: `there's no point ${spec.through}` };
      if (!spec.through && !(spec.radius! > 0)) return { error: "a circle needs a radius or a point it passes through" };
      return add({ id: spec.name ?? nextId(objs, "circle"), kind: "circle", centre, ...(spec.through ? { through: spec.through } : { r: spec.radius }) });
    }
    case "triangle":
    case "polygon": {
      const e = needPts(pts, 3);
      if (e) return { error: e };
      if (type === "triangle" && pts!.length !== 3) return { error: "a triangle has 3 points" };
      return add({ id: spec.name ?? nextId(objs, "polygon"), kind: "polygon", pts: pts! });
    }
    case "length":
    case "area":
    case "perimeter":
    case "angle":
    case "slope": {
      let of = pts ?? [];
      if (type === "angle") {
        const e = needPts(of, 3);
        if (e) return { error: `${e} (the angle at the middle one)` };
      } else if (of.length === 1 && type === "slope") {
        const l = lineRef(of[0]);
        if ("error" in l) return l;
        objs = l.objs;
        of = [l.id];
      } else if (!of.length || of.some((id) => !has(id))) return { error: `${type} needs of: the object (or two points for a length)` };
      if (spec.store !== undefined && !VAR_NAME.test(spec.store)) return { error: `store needs a variable name (letters, digits and _): not ${spec.store}` };
      const o: GeoObj = { id: spec.name ?? nextId(objs, "measure"), kind: "measure", what: type, of, ...(spec.store ? { store: spec.store } : {}) };
      if (!measure(o, resolve(objs), {})) return { error: `can't measure the ${type} of ${of.join(", ")}` };
      // One measurement per variable: storing here unlinks it from any other.
      if (spec.store) objs = objs.map((m) => (m.kind === "measure" && m.store === spec.store ? { ...m, store: undefined } : m));
      return add(o);
    }
  }
  if (TRANSFORMS.has(type)) {
    const op = type as TransformOp;
    const of = spec.of ?? [];
    if (!of.length) return { error: `${type} needs of: the object(s) to transform` };
    let by: string[];
    let amount: number | undefined;
    if (op === "reflection") {
      const l = lineRef(spec.to);
      if ("error" in l) return { error: `reflection needs to: the line to reflect in (${l.error})` };
      objs = l.objs;
      by = [l.id];
    } else if (op === "translation") {
      const e = needPts(spec.points, 2);
      if (e) return { error: `translation needs points: [from, to], the vector (${e})` };
      by = spec.points!.slice(0, 2);
    } else {
      if (!spec.through || !has(spec.through)) return { error: `${type} needs through: the centre point` };
      by = [spec.through];
      amount = op === "rotation" ? spec.angle : op === "dilation" ? spec.factor : undefined;
      // Or the amount follows a measurement (to: its id), and changes as it does.
      if (op !== "symmetry" && amount === undefined && spec.to && resolve(objs).get(spec.to)?.t === "value") by = [spec.through, spec.to];
      else if (op !== "symmetry" && (amount === undefined || !Number.isFinite(amount)))
        return { error: op === "rotation" ? "rotation needs angle: degrees anticlockwise (or to: an angle measurement)" : "dilation needs factor: the scale factor (or to: a measurement)" };
    }
    let first = "";
    for (const src of of) {
      const from = objs.find((o) => o.id === src);
      const shape = resolve(objs).get(src);
      if (!from || !shape) return { error: `there's no object ${src}` };
      if (shape.t === "value") return { error: `${src} is a measurement, which can't be transformed` };
      // A point's image is named with a prime, as on paper: A → A′ (written A').
      const id = of.length === 1 && spec.name ? spec.name : shape.t === "pt" ? (has(`${src}'`) ? nextLabel(objs) : `${src}'`) : nextId(objs, from.kind === "transform" ? kindOf(shape) : from.kind);
      objs = [...objs, { id, kind: "transform", op, of: src, by, ...(amount !== undefined ? { amount } : {}) }];
      first ||= id;
    }
    return { objs, id: first };
  }
  return { error: `unknown type ${spec.type}` };
}

/** A construction as an agent reads it: each object, where it is now, and the measurements' values. */
export function describe(objs: GeoObj[], env: GeoEnv = {}): Record<string, unknown>[] {
  const shapes = resolve(objs, env);
  const n = (v: number) => Number(v.toFixed(4));
  return objs.map((o) => {
    const s = shapes.get(o.id);
    const { id, kind, hidden, attrs, label, cond, ...def } = o;
    const now =
      !s ? { undefined: true }
      : s.t === "pt" ? { x: n(s.p.x), y: n(s.p.y) }
      : s.t === "circle" ? { centre: [n(s.c.x), n(s.c.y)], radius: n(s.r) }
      : s.t === "value" ? { value: Number.isFinite(s.value) ? n(s.value) : "undefined", shown: s.text }
      : {};
    return { id, kind, ...(kind === "point" ? {} : def), ...now, ...(hidden ? { hidden: true } : {}), ...(attrs ? { attrs } : {}), ...(label ? { label } : {}), ...(cond ? { conditions: cond } : {}) };
  });
}

// ---- Building by pointing (the menu's tools)

export type GeoTool =
  | "point"
  | "segment"
  | "line"
  | "ray"
  | "circle"
  | "triangle"
  | "polygon"
  | "midpoint"
  | "intersection"
  | "perpendicular"
  | "parallel"
  | "bisector"
  | "anglebisector"
  | "length"
  | "area"
  | "angle"
  | "slope"
  | "pointon"
  | "tangent"
  | "vector"
  | "arc"
  | "rectangle"
  | "regpoly"
  | "ellipse"
  | "parabola"
  | "hyperbola"
  | "conic5"
  | "dangle"
  | "locus"
  | "compass"
  | "transfer"
  | TransformOp;

type Want = "point" | "line" | "curve" | "region" | "measurable" | "value" | "segment";

export const TOOL_NAMES: Record<GeoTool, string> = {
  point: "Point",
  segment: "Segment",
  line: "Line",
  ray: "Ray",
  circle: "Circle",
  triangle: "Triangle",
  polygon: "Polygon",
  midpoint: "Midpoint",
  intersection: "Intersection Point(s)",
  perpendicular: "Perpendicular",
  parallel: "Parallel",
  bisector: "Perpendicular Bisector",
  anglebisector: "Angle Bisector",
  length: "Length",
  area: "Area",
  angle: "Angle",
  slope: "Slope",
  pointon: "Point On",
  tangent: "Tangent",
  vector: "Vector",
  arc: "Circle Arc",
  rectangle: "Rectangle",
  regpoly: "Regular Polygon",
  ellipse: "Ellipse",
  parabola: "Parabola",
  hyperbola: "Hyperbola",
  conic5: "Conic by Five Points",
  dangle: "Directed Angle",
  locus: "Locus",
  compass: "Compass",
  transfer: "Measurement Transfer",
  symmetry: "Symmetry",
  reflection: "Reflection",
  translation: "Translation",
  rotation: "Rotation",
  dilation: "Dilation",
};

const kinds = (s: Shape | undefined): Want[] =>
  !s ? []
  : s.t === "pt" ? ["point", "measurable"]
  : s.t === "line" ? ["line", "curve", ...(s.bound === "segment" ? (["measurable", "segment"] as const) : [])]
  : s.t === "circle" ? ["curve", "region", "measurable"]
  : s.t === "poly" ? ["region", "measurable"]
  : s.t === "curve" ? ["curve"]
  // A value with no number (Coordinates and Equations' text) can't be used as a measurement.
  : s.t === "value" ? (Number.isNaN(s.value) ? [] : ["value"])
  : [];

/** What the tool takes next, given what's been picked. */
export function wants(tool: GeoTool, picked: string[], shapes: Map<string, Shape>): Want[] {
  const n = picked.length;
  switch (tool) {
    case "point":
    case "polygon":
      return ["point"];
    case "perpendicular":
    case "parallel":
      return n === 0 ? ["point", "line"] : shapes.get(picked[0]!)?.t === "pt" ? ["line"] : ["point"];
    case "intersection":
      return ["curve"];
    case "length":
      return n === 0 ? ["measurable"] : ["point"];
    case "area":
      return ["region"];
    case "slope":
      return ["line"];
    case "pointon":
      return ["line", "curve", "region"];
    case "tangent":
      return n === 0 ? ["curve"] : ["point"];
    case "parabola":
      return n === 0 ? ["point"] : ["line"];
    case "locus":
      return ["point"];
    case "compass":
      return n === 0 ? ["segment", "point"] : ["point"];
    case "transfer":
      return n === 0 ? ["value"] : n === 1 ? ["line", "curve"] : ["point"];
    case "symmetry":
    case "reflection":
    case "translation":
    case "rotation":
    case "dilation":
      // First the object, then what it moves by.
      return n === 0 ? ["point", "line", "curve", "region"] : tool === "reflection" ? ["line"] : ["point"];
    default:
      return ["point"];
  }
}

const COUNT: Partial<Record<GeoTool, number>> = {
  point: 1,
  circle: 2,
  triangle: 3,
  angle: 3,
  dangle: 3,
  anglebisector: 3,
  area: 1,
  slope: 1,
  translation: 3,
  arc: 3,
  rectangle: 3,
  ellipse: 3,
  hyperbola: 3,
  conic5: 5,
  transfer: 3,
};

/** Tools that end by asking for a number: the angle, or the scale factor. */
export const ASKS: Partial<Record<GeoTool, string>> = { rotation: "Angle (°):", dilation: "Scale Factor:", regpoly: "Number of Sides:" };

/** The tool's prompt, as the handheld shows it at the top of the page. */
export function prompt(tool: GeoTool, picked: string[], shapes: Map<string, Shape>): string {
  if (tool === "polygon") return picked.length < 3 ? "Select points" : "Select points; select the first again to finish";
  if (tool === "circle") return picked.length ? "Select a point on the circle" : "Select the centre";
  if (TRANSFORMS.has(tool)) {
    if (!picked.length) return "Select the object to transform";
    if (tool === "reflection") return "Select the line to reflect in";
    if (tool === "translation") return picked.length === 1 ? "Select the start of the vector" : "Select the end of the vector";
    return "Select the centre";
  }
  if (tool === "pointon") return "Select a line, circle, polygon or curve to put the point on";
  if (tool === "tangent") return picked.length ? "Select the point of tangency" : "Select a circle";
  if (tool === "regpoly") return picked.length ? "Select a vertex" : "Select the centre";
  if (tool === "rectangle") return ["Select a corner", "Select the next corner", "Select a point on the opposite side"][picked.length]!;
  if (tool === "arc") return ["Select the start", "Select a point on the arc", "Select the end"][picked.length]!;
  if (tool === "ellipse" || tool === "hyperbola") return ["Select a focus", "Select the other focus", "Select a point on the curve"][picked.length]!;
  if (tool === "parabola") return picked.length ? "Select the directrix" : "Select the focus";
  if (tool === "conic5") return `Select point ${picked.length + 1} of 5`;
  if (tool === "locus") return picked.length ? "Select the Point On that drives it" : "Select the point whose path to draw";
  if (tool === "compass") return picked.length === 0 ? "Select a segment, or two points, for the radius" : "Select the centre";
  if (tool === "transfer") return ["Select a measurement", "Select a line, ray or circle", "Select the starting point"][picked.length]!;
  if (tool === "angle" || tool === "dangle" || tool === "anglebisector") return ["Select a point on one side", "Select the vertex", "Select a point on the other side"][picked.length]!;
  const w = wants(tool, picked, shapes);
  const what = w.includes("measurable") ? "what to measure (or a point)" : w.includes("region") ? "a polygon or circle" : w.includes("curve") ? "a line or circle" : w.join(" or a ");
  return `Select ${what === "point" ? "a point" : what.startsWith("what") ? what : `a ${what}`}`;
}

/**
 * One click with a tool: the object under the pointer (if any) and where it
 * is. Picks what the tool takes, or puts a new point there when it takes a
 * point; once it has all it needs, builds the object. Null: the click is ignored.
 */
export function click(
  objs: GeoObj[],
  tool: GeoTool,
  picked: string[],
  hit: string | null,
  at: Pt,
): { objs: GeoObj[]; picked: string[]; built?: string; error?: string; ask?: string[] } | null {
  const shapes = resolve(objs);
  const w = wants(tool, picked, shapes);
  if (tool === "pointon") {
    const on = hit ? shapes.get(hit) : undefined;
    if (!hit || !on || on.t === "pt" || on.t === "value") return null;
    const id = nextLabel(objs);
    return { objs: [...objs, { id, kind: "pointon", on: hit, t: paramAt(on, at) }], picked: [], built: id };
  }
  if (tool === "polygon" && hit === picked[0] && picked.length >= 3) return finish(objs, tool, picked);
  if (tool === "point" && hit && shapes.get(hit)?.t === "pt") return null;
  let id = hit && kinds(shapes.get(hit)).some((k) => w.includes(k)) ? hit : null;
  if (!id) {
    if (!w.includes("point") && !w.includes("measurable")) return null;
    id = nextLabel(objs);
    objs = [...objs, { id, kind: "point", x: at.x, y: at.y }];
  }
  if (picked.includes(id) && tool !== "polygon") return null;
  const next = [...picked, id];
  const firstIsPoint = shapes.get(next[0]!)?.t === "pt" || !shapes.has(next[0]!);
  const count = tool === "polygon" ? Infinity : tool === "length" ? (firstIsPoint ? 2 : 1) : tool === "compass" ? (firstIsPoint ? 3 : 2) : (COUNT[tool] ?? 2);
  if (tool === "point") return { objs, picked: [], built: id };
  if (next.length < count) return { objs, picked: next };
  // Rotation and Dilation have their object and centre: the number is asked for next (see transformWith).
  return ASKS[tool] ? { objs, picked: [], ask: next } : finish(objs, tool, next);
}

/** Finish a Rotation or Dilation once its number is typed (or a Regular Polygon once its sides are). */
export function transformWith(objs: GeoObj[], tool: GeoTool, picked: string[], amount: number) {
  if (tool === "regpoly") {
    if (!Number.isInteger(amount) || amount < 3 || amount > 100) return { error: "A regular polygon has 3 to 100 sides" };
    const id = nextId(objs, "regpoly");
    return { objs: [...objs, { id, kind: "regpoly" as const, centre: picked[0]!, vertex: picked[1]!, n: amount }], built: id };
  }
  const r = addSpec(objs, { type: tool, of: [picked[0]!], through: picked[1], ...(tool === "rotation" ? { angle: amount } : { factor: amount }) });
  return "error" in r ? { error: r.error } : { objs: r.objs, built: r.id };
}

function finish(objs: GeoObj[], tool: GeoTool, picked: string[]) {
  const more = finishMore(objs, tool, picked);
  if (more) return more;
  const shapes = resolve(objs);
  const spec: GeoSpec =
    tool === "circle" ? { type: "circle", points: [picked[0]!], through: picked[1] }
    : tool === "perpendicular" || tool === "parallel"
      ? { type: tool, through: picked.find((p) => shapes.get(p)?.t === "pt"), to: picked.find((p) => shapes.get(p)?.t === "line") }
    : tool === "bisector" ? { type: "perpendicular_bisector", points: picked }
    : tool === "anglebisector" ? { type: "angle_bisector", points: picked }
    : tool === "intersection" ? { type: "intersection", of: picked }
    : tool === "symmetry" ? { type: tool, of: [picked[0]!], through: picked[1] }
    : tool === "reflection" ? { type: tool, of: [picked[0]!], to: picked[1] }
    : tool === "translation" ? { type: tool, of: [picked[0]!], points: picked.slice(1) }
    : { type: tool, points: picked };
  const r = addSpec(objs, spec);
  return "error" in r ? { objs, picked: [], error: r.error } : { objs: r.objs, picked: [], built: r.id };
}

// ---- More constructions: Point On, Tangent, Vector, Circle Arc, Rectangle,
// Regular Polygon, the conics, Locus, Compass and Measurement Transfer.

const SAMPLES = 96;

/** Where on a shape a point is, as the t a Point On keeps: a fraction along a line or polygon or curve, an angle on a circle. */
export function paramAt(s: Shape, at: Pt): number {
  if (s.t === "line") {
    const d = { x: s.q.x - s.p.x, y: s.q.y - s.p.y };
    let t = ((at.x - s.p.x) * d.x + (at.y - s.p.y) * d.y) / (d.x * d.x + d.y * d.y);
    if (s.bound !== "line") t = Math.max(0, t);
    if (s.bound === "segment") t = Math.min(1, t);
    return t;
  }
  if (s.t === "circle") return Math.atan2(at.y - s.c.y, at.x - s.c.x);
  const path = s.t === "poly" ? [...s.pts, s.pts[0]!] : s.t === "curve" ? (s.pieces[0] ?? []) : [];
  let best = 0;
  let bestD = Infinity;
  const total = pathLength(path);
  let run = 0;
  for (let i = 0; i + 1 < path.length; i++) {
    const [a, b] = [path[i]!, path[i + 1]!];
    const len = dist(a, b);
    const k = len > EPS ? Math.max(0, Math.min(1, ((at.x - a.x) * (b.x - a.x) + (at.y - a.y) * (b.y - a.y)) / (len * len))) : 0;
    const d = dist(at, { x: a.x + k * (b.x - a.x), y: a.y + k * (b.y - a.y) });
    if (d < bestD) [bestD, best] = [d, total > EPS ? (run + k * len) / total : 0];
    run += len;
  }
  return best;
}

const pathLength = (path: Pt[]) => path.reduce((t, p, i) => (i ? t + dist(path[i - 1]!, p) : 0), 0);

/** The point t along a shape (see paramAt). */
function pointAt(s: Shape, t: number): Pt | undefined {
  if (s.t === "line") return { x: s.p.x + t * (s.q.x - s.p.x), y: s.p.y + t * (s.q.y - s.p.y) };
  if (s.t === "circle") return { x: s.c.x + s.r * Math.cos(t), y: s.c.y + s.r * Math.sin(t) };
  const path = s.t === "poly" ? [...s.pts, s.pts[0]!] : s.t === "curve" ? (s.pieces[0] ?? []) : [];
  if (path.length < 2) return path[0];
  let left = pathLength(path) * Math.max(0, Math.min(1, t));
  for (let i = 0; i + 1 < path.length; i++) {
    const [a, b] = [path[i]!, path[i + 1]!];
    const len = dist(a, b);
    if (left <= len || i + 2 === path.length) {
      const k = len > EPS ? Math.min(1, left / len) : 0;
      return { x: a.x + k * (b.x - a.x), y: a.y + k * (b.y - a.y) };
    }
    left -= len;
  }
  return path[path.length - 1];
}

/** The circle through three points, or undefined when they're in a line. */
function circumcircle(a: Pt, b: Pt, c: Pt): { c: Pt; r: number } | undefined {
  const d = 2 * (a.x * (b.y - c.y) + b.x * (c.y - a.y) + c.x * (a.y - b.y));
  if (Math.abs(d) < EPS) return undefined;
  const sq = (p: Pt) => p.x * p.x + p.y * p.y;
  const x = (sq(a) * (b.y - c.y) + sq(b) * (c.y - a.y) + sq(c) * (a.y - b.y)) / d;
  const y = (sq(a) * (c.x - b.x) + sq(b) * (a.x - c.x) + sq(c) * (b.x - a.x)) / d;
  return { c: { x, y }, r: dist({ x, y }, a) };
}

/** An ellipse or hyperbola (centre, semi-axes, turn) or a parabola (vertex, focal length, turn) as joined points. */
function conicPieces(k: { kind: "ellipse" | "hyperbola"; centre: Pt; a: number; b: number; angle: number } | { kind: "parabola"; vertex: Pt; p: number; angle: number }): Pt[][] {
  const [c, s] = [Math.cos(k.angle), Math.sin(k.angle)];
  const o = k.kind === "parabola" ? k.vertex : k.centre;
  const at = (u: number, v: number): Pt => ({ x: o.x + u * c - v * s, y: o.y + u * s + v * c });
  const range = (n: number, lo: number, hi: number) => Array.from({ length: n + 1 }, (_, i) => lo + ((hi - lo) * i) / n);
  if (k.kind === "ellipse") return [range(SAMPLES, 0, 2 * Math.PI).map((t) => at(k.a * Math.cos(t), k.b * Math.sin(t)))];
  if (k.kind === "hyperbola") {
    const ts = range(SAMPLES, -3, 3);
    return [ts.map((t) => at(k.a * Math.cosh(t), k.b * Math.sinh(t))), ts.map((t) => at(-k.a * Math.cosh(t), k.b * Math.sinh(t)))];
  }
  // y² = 4pu along the axis: far enough to leave any reasonable view.
  const p = (k as { p: number }).p;
  const reach = Math.max(40, Math.abs(p) * 40);
  return [range(SAMPLES, -reach, reach).map((v) => at((v * v) / (4 * p), v))];
}

/** The conic through five points: the null space of their [x², xy, y², x, y, 1] rows, as joined points. */
function conicThrough(pts: Pt[]): Pt[][] | undefined {
  const rows = pts.map((p) => [p.x * p.x, p.x * p.y, p.y * p.y, p.x, p.y, 1]);
  // Gaussian elimination to find one solution with the last free unknown set to 1.
  const m = rows.map((r) => r.slice());
  const pivots: number[] = [];
  let r = 0;
  for (let col = 0; col < 6 && r < 5; col++) {
    let best = r;
    for (let i = r + 1; i < 5; i++) if (Math.abs(m[i]![col]!) > Math.abs(m[best]![col]!)) best = i;
    if (Math.abs(m[best]![col]!) < 1e-12) continue;
    [m[r], m[best]] = [m[best]!, m[r]!];
    for (let i = 0; i < 5; i++) {
      if (i === r) continue;
      const f = m[i]![col]! / m[r]![col]!;
      for (let j = col; j < 6; j++) m[i]![j]! -= f * m[r]![j]!;
    }
    pivots.push(col);
    r++;
  }
  const free = [0, 1, 2, 3, 4, 5].find((c) => !pivots.includes(c));
  if (free === undefined) return undefined;
  const v = [0, 0, 0, 0, 0, 0];
  v[free] = 1;
  pivots.forEach((col, i) => (v[col] = -m[i]![free]! / m[i]![col]!));
  const k = classifyConic(v);
  if (!k) return undefined;
  if (k.kind === "circle") return [Array.from({ length: SAMPLES + 1 }, (_, i) => ({ x: k.centre[0] + k.r * Math.cos((2 * Math.PI * i) / SAMPLES), y: k.centre[1] + k.r * Math.sin((2 * Math.PI * i) / SAMPLES) }))];
  if (k.kind === "parabola") return conicPieces({ kind: "parabola", vertex: { x: k.vertex[0], y: k.vertex[1] }, p: k.p, angle: k.angle });
  return conicPieces({ kind: k.kind, centre: { x: k.centre[0], y: k.centre[1] }, a: k.a, b: k.b, angle: k.angle });
}

/** The new kinds' shapes (resolve's cases for them). */
function resolveMore(o: GeoObj, out: Map<string, Shape>, objs: GeoObj[]): Shape | undefined {
  const pt = (id: string) => {
    const s = out.get(id);
    return s?.t === "pt" ? s.p : undefined;
  };
  switch (o.kind) {
    case "pointon": {
      const on = out.get(o.on);
      const p = on ? pointAt(on, o.t) : undefined;
      return p && { t: "pt", p };
    }
    case "tangent": {
      const c = out.get(o.to);
      const at = pt(o.at);
      if (c?.t !== "circle" || !at) return undefined;
      const th = Math.atan2(at.y - c.c.y, at.x - c.c.x);
      const touch = { x: c.c.x + c.r * Math.cos(th), y: c.c.y + c.r * Math.sin(th) };
      return { t: "line", p: touch, q: { x: touch.x - Math.sin(th), y: touch.y + Math.cos(th) }, bound: "line" };
    }
    case "vector": {
      const [p, q] = [pt(o.a), pt(o.b)];
      return p && q && dist(p, q) > EPS ? { t: "line", p, q, bound: "segment", arrow: true } : undefined;
    }
    case "arc": {
      const [a, b, c] = [pt(o.a), pt(o.b), pt(o.c)];
      const circ = a && b && c ? circumcircle(a, b, c) : undefined;
      if (!circ || !a || !b || !c) return undefined;
      const ang = (p: Pt) => Math.atan2(p.y - circ.c.y, p.x - circ.c.x);
      const norm = (v: number) => ((v % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
      // Anticlockwise from a to c, unless b lies the other way round.
      let sweep = norm(ang(c) - ang(a));
      if (norm(ang(b) - ang(a)) > sweep) sweep -= 2 * Math.PI;
      const from = ang(a);
      return { t: "curve", pieces: [Array.from({ length: SAMPLES + 1 }, (_, i) => ({ x: circ.c.x + circ.r * Math.cos(from + (sweep * i) / SAMPLES), y: circ.c.y + circ.r * Math.sin(from + (sweep * i) / SAMPLES) }))] };
    }
    case "rectangle": {
      const [a, b, c] = [pt(o.a), pt(o.b), pt(o.c)];
      if (!a || !b || !c || dist(a, b) < EPS) return undefined;
      const len = dist(a, b);
      const n = { x: -(b.y - a.y) / len, y: (b.x - a.x) / len };
      const h = (c.x - a.x) * n.x + (c.y - a.y) * n.y;
      if (Math.abs(h) < EPS) return undefined;
      return { t: "poly", pts: [a, b, { x: b.x + h * n.x, y: b.y + h * n.y }, { x: a.x + h * n.x, y: a.y + h * n.y }] };
    }
    case "regpoly": {
      const [c, v] = [pt(o.centre), pt(o.vertex)];
      if (!c || !v || dist(c, v) < EPS) return undefined;
      const step = (2 * Math.PI) / o.n;
      return {
        t: "poly",
        pts: Array.from({ length: o.n }, (_, i) => ({
          x: c.x + (v.x - c.x) * Math.cos(i * step) - (v.y - c.y) * Math.sin(i * step),
          y: c.y + (v.x - c.x) * Math.sin(i * step) + (v.y - c.y) * Math.cos(i * step),
        })),
      };
    }
    case "conic": {
      if (o.type === "five") {
        const ps = o.of.map(pt);
        if (ps.some((p) => !p)) return undefined;
        const pieces = conicThrough(ps as Pt[]);
        return pieces && { t: "curve", pieces };
      }
      if (o.type === "parabola") {
        const f = pt(o.of[0]!);
        const l = out.get(o.of[1]!);
        if (!f || l?.t !== "line") return undefined;
        const d = { x: l.q.x - l.p.x, y: l.q.y - l.p.y };
        const k = ((f.x - l.p.x) * d.x + (f.y - l.p.y) * d.y) / (d.x * d.x + d.y * d.y);
        const foot = { x: l.p.x + k * d.x, y: l.p.y + k * d.y };
        const gap = dist(f, foot);
        if (gap < EPS) return undefined;
        const vertex = { x: (f.x + foot.x) / 2, y: (f.y + foot.y) / 2 };
        return { t: "curve", pieces: conicPieces({ kind: "parabola", vertex, p: gap / 2, angle: Math.atan2(f.y - foot.y, f.x - foot.x) }) };
      }
      const [f1, f2, p] = o.of.map(pt);
      if (!f1 || !f2 || !p) return undefined;
      const c = dist(f1, f2) / 2;
      const centre = { x: (f1.x + f2.x) / 2, y: (f1.y + f2.y) / 2 };
      const angle = Math.atan2(f2.y - f1.y, f2.x - f1.x);
      if (o.type === "ellipse") {
        const a = (dist(p, f1) + dist(p, f2)) / 2;
        if (a <= c + EPS) return undefined;
        return { t: "curve", closed: true, pieces: conicPieces({ kind: "ellipse", centre, a, b: Math.sqrt(a * a - c * c), angle }) };
      }
      const a = Math.abs(dist(p, f1) - dist(p, f2)) / 2;
      if (a < EPS || a >= c - EPS) return undefined;
      return { t: "curve", pieces: conicPieces({ kind: "hyperbola", centre, a, b: Math.sqrt(c * c - a * a), angle }) };
    }
    case "locus": {
      const at = objs.findIndex((x) => x.id === o.driver);
      const driver = objs[at];
      if (driver?.kind !== "pointon") return undefined;
      const on = out.get(driver.on);
      if (!on) return undefined;
      // Run the driver along its object (a line: a stretch either side of its two points) and follow the point.
      const [lo, hi] = on.t === "circle" ? [0, 2 * Math.PI] : on.t === "line" ? (on.bound === "segment" ? [0, 1] : on.bound === "ray" ? [0, 20] : [-20, 20]) : [0, 1];
      const upto = objs.slice(0, objs.findIndex((x) => x.id === o.id));
      const piece: Pt[] = [];
      for (let i = 0; i <= SAMPLES; i++) {
        const t = lo + ((hi - lo) * i) / SAMPLES;
        const moved = upto.map((x) => (x.id === driver.id ? { ...driver, t } : x));
        const s = resolve(moved).get(o.of);
        if (s?.t === "pt") piece.push(s.p);
      }
      return piece.length > 1 ? { t: "curve", pieces: [piece] } : undefined;
    }
    case "compass": {
      const c = pt(o.centre);
      const seg = o.r.length === 1 ? out.get(o.r[0]!) : undefined;
      const r = seg?.t === "line" ? dist(seg.p, seg.q) : o.r.length === 2 && pt(o.r[0]!) && pt(o.r[1]!) ? dist(pt(o.r[0]!)!, pt(o.r[1]!)!) : undefined;
      return c && r !== undefined && r > EPS ? { t: "circle", c, r } : undefined;
    }
    case "transfer": {
      const m = out.get(o.measure);
      const onto = out.get(o.onto);
      const from = pt(o.from);
      if (m?.t !== "value" || !Number.isFinite(m.value) || !onto || !from) return undefined;
      if (onto.t === "line") {
        const d = dist(onto.p, onto.q);
        return { t: "pt", p: { x: from.x + (m.value * (onto.q.x - onto.p.x)) / d, y: from.y + (m.value * (onto.q.y - onto.p.y)) / d } };
      }
      if (onto.t === "circle") {
        const th = Math.atan2(from.y - onto.c.y, from.x - onto.c.x) + m.value / onto.r;
        return { t: "pt", p: { x: onto.c.x + onto.r * Math.cos(th), y: onto.c.y + onto.r * Math.sin(th) } };
      }
      return undefined;
    }
    default:
      return undefined;
  }
}

/** Finishing the new tools once they have what they need (null for the others). */
function finishMore(objs: GeoObj[], tool: GeoTool, picked: string[]): { objs: GeoObj[]; picked: string[]; built?: string; error?: string } | null {
  const add = (o: GeoObj) => {
    const shapes = resolve([...objs, o]);
    if (!shapes.has(o.id)) return { objs, picked: [], error: `those don't make a ${TOOL_NAMES[tool].toLowerCase()}` };
    return { objs: [...objs, o], picked: [], built: o.id };
  };
  const [a, b, c] = picked as [string, string, string];
  switch (tool) {
    case "tangent":
      return add({ id: nextId(objs, "tangent"), kind: "tangent", to: a, at: b });
    case "vector":
      return add({ id: nextId(objs, "vector"), kind: "vector", a, b });
    case "arc":
      return add({ id: nextId(objs, "arc"), kind: "arc", a, b, c });
    case "rectangle":
      return add({ id: nextId(objs, "rectangle"), kind: "rectangle", a, b, c });
    case "ellipse":
    case "hyperbola":
      return add({ id: nextId(objs, "conic"), kind: "conic", type: tool, of: picked.slice(0, 3) });
    case "parabola":
      return add({ id: nextId(objs, "conic"), kind: "conic", type: "parabola", of: [a, b] });
    case "conic5":
      return add({ id: nextId(objs, "conic"), kind: "conic", type: "five", of: picked.slice(0, 5) });
    case "dangle":
      return add({ id: nextId(objs, "measure"), kind: "measure", what: "dangle", of: picked.slice(0, 3) });
    case "locus":
      if (objs.find((o) => o.id === b)?.kind !== "pointon") return { objs, picked: [], error: "the second point has to be a Point On, which moves along something" };
      return add({ id: nextId(objs, "locus"), kind: "locus", of: a, driver: b });
    case "compass":
      return add({ id: nextId(objs, "compass"), kind: "compass", centre: picked[picked.length - 1]!, r: picked.slice(0, -1) });
    case "transfer":
      return add({ id: nextLabel(objs), kind: "transfer", measure: a, onto: b, from: c });
    default:
      return null;
  }
}

/** Everything built on `id`, however indirectly, in the list's order. */
export function dependents(objs: GeoObj[], id: string): Set<string> {
  const out = new Set<string>([id]);
  for (const o of objs) if (refsOf(o).some((r) => out.has(r))) out.add(o.id);
  out.delete(id);
  return out;
}

/** Each reference to `from` in an object made a reference to `to` (its own id kept). */
function renamed(o: GeoObj, from: string, to: string): GeoObj {
  const swap = (v: unknown): unknown => (v === from ? to : Array.isArray(v) ? v.map(swap) : v);
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(o)) {
    if (k === "id") out[k] = v;
    else if (k === "vars" && v && typeof v === "object") out[k] = Object.fromEntries(Object.entries(v).map(([n, r]) => [n, r === from ? to : r]));
    else if (k === "attrs" || k === "cond" || k === "at") out[k] = v;
    else out[k] = swap(v);
  }
  return out as GeoObj;
}

/** Whether Redefine can take this object: a point that is free or on an object. */
export const redefinable = (o: GeoObj | undefined): boolean => o?.kind === "point" || o?.kind === "pointon";

/**
 * Actions ▸ Redefine: a free point (or a point on an object) given a new
 * definition where it's dropped. On another point, the two become one; on
 * a line, circle, polygon or curve, it's a point on that object; anywhere
 * else, a free point there. What's built on it follows. An object built on
 * the point itself can't take it (that would go round in a circle), so the
 * point is left free there instead.
 */
export function redefinePoint(objs: GeoObj[], id: string, hit: string | null, at: Pt): GeoObj[] {
  const o = objs.find((x) => x.id === id);
  if (!redefinable(o)) return objs;
  const below = dependents(objs, id);
  const target = hit && hit !== id && !below.has(hit) ? hit : null;
  const shapes = resolve(objs);
  const s = target ? shapes.get(target) : undefined;
  const keep = { ...(o!.hidden ? { hidden: true } : {}), ...(o!.attrs ? { attrs: o!.attrs } : {}), ...(o!.label ? { label: o!.label } : {}), ...(o!.cond ? { cond: o!.cond } : {}) };
  if (s?.t === "pt" && target) {
    // Merged: everything on the point now sits on the other one.
    return objs.filter((x) => x.id !== id).map((x) => renamed(x, id, target));
  }
  const next: GeoObj =
    target && s && (s.t === "line" || s.t === "circle" || s.t === "poly" || s.t === "curve")
      ? { id, kind: "pointon", on: target, t: paramAt(s, at), ...keep }
      : { id, kind: "point", x: Number(at.x.toFixed(4)), y: Number(at.y.toFixed(4)), ...keep };
  // The point and what's built on it go after what it now sits on, so each is worked out from what's before it.
  const moved = objs.filter((x) => x.id === id || below.has(x.id)).map((x) => (x.id === id ? next : x));
  return [...objs.filter((x) => x.id !== id && !below.has(x.id)), ...moved];
}
