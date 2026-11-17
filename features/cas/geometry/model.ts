// SPDX-License-Identifier: GPL-3.0-or-later
/**
 * Geometry: a construction of named objects, each defined from earlier ones
 * (a free point, a segment between two points, a perpendicular through a
 * point), so dragging a free point moves everything built on it. Lengths are
 * in cm and angles in degrees, as the handheld's Geometry page shows them.
 */

export type GeoObj =
  | { id: string; kind: "point"; x: number; y: number }
  | { id: string; kind: "midpoint"; of: [string, string] }
  | { id: string; kind: "intersection"; of: [string, string]; n: number }
  | { id: string; kind: "segment" | "line" | "ray"; a: string; b: string }
  | { id: string; kind: "perpendicular" | "parallel"; through: string; to: string }
  | { id: string; kind: "bisector"; a: string; b: string }
  | { id: string; kind: "anglebisector"; a: string; b: string; c: string }
  | { id: string; kind: "circle"; centre: string; through?: string; r?: number }
  | { id: string; kind: "polygon"; pts: string[] }
  /** store: the variable its value is kept in, for the problem's other pages. */
  | { id: string; kind: "measure"; what: "length" | "area" | "perimeter" | "angle" | "slope"; of: string[]; store?: string }
  /**
   * An image of another object. by: symmetry [centre], reflection [line],
   * translation [from, to], rotation and dilation [centre] with amount (degrees
   * anticlockwise, or the scale factor), or [centre, a measurement] to use its value.
   */
  | { id: string; kind: "transform"; op: TransformOp; of: string; by: string[]; amount?: number };

export type TransformOp = "symmetry" | "reflection" | "translation" | "rotation" | "dilation";

export type Pt = { x: number; y: number };
/** What an object works out to: a point, a line (bounded as segment or ray, or not), a circle, a polygon, or a measured value. */
export type Shape =
  | { t: "pt"; p: Pt }
  | { t: "line"; p: Pt; q: Pt; bound: "segment" | "ray" | "line" }
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
export function resolve(objs: GeoObj[]): Map<string, Shape> {
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
        s = measure(o, out);
        break;
      case "transform": {
        const f = mapping(o, out);
        const src = out.get(o.of);
        if (f && src) s = image(src, f.map, f.scale);
        break;
      }
    }
    if (s) out.set(o.id, s);
  }
  return out;
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
  return undefined;
}

function measure(o: Extract<GeoObj, { kind: "measure" }>, out: Map<string, Shape>): Shape | undefined {
  const of = o.of.map((id) => out.get(id));
  if (of.some((s) => !s)) return undefined;
  const [s, u, v] = of as Shape[];
  const value = (n: number, unit: string, at: Pt): Extract<Shape, { t: "value" }> => ({ t: "value", value: n, text: `${round(n)}${unit}`, at });
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
    case "angle":
      if (s?.t === "pt" && u?.t === "pt" && v?.t === "pt") {
        const a = Math.atan2(s.p.y - u.p.y, s.p.x - u.p.x);
        const c = Math.atan2(v.p.y - u.p.y, v.p.x - u.p.x);
        // The turn from one side to the other, the short way round.
        let sweep = c - a;
        if (sweep > Math.PI) sweep -= 2 * Math.PI;
        if (sweep <= -Math.PI) sweep += 2 * Math.PI;
        const mid = a + sweep / 2;
        return { ...value((Math.abs(sweep) * 180) / Math.PI, "°", { x: u.p.x + 1.6 * Math.cos(mid), y: u.p.y + 1.6 * Math.sin(mid) }), arc: { c: u.p, from: a, sweep } };
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
  const prefix = { segment: "s", line: "l", ray: "r", perpendicular: "l", parallel: "l", bisector: "l", anglebisector: "r", circle: "c", polygon: "p", measure: "m" }[kind as string] ?? "o";
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
  const refs = (o: GeoObj): string[] => {
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
    }
  };
  return objs.filter((o) => {
    if (gone.has(o.id) || refs(o).some((r) => gone.has(r))) {
      gone.add(o.id);
      return false;
    }
    return true;
  });
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
  /** A measurement: the variable to keep its value in. */
  store?: string;
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
  const type = spec.type.toLowerCase().replace(/[\s-]+/g, "_");
  const pts = spec.points ?? spec.of;
  switch (type) {
    case "point": {
      if (spec.x === undefined || spec.y === undefined) return { error: "a point needs x and y" };
      const name = spec.name ?? nextLabel(objs);
      if (!/^[A-Z]\d*$/.test(name)) return { error: `point names are a capital letter, maybe with a number (A, B1): not ${name}` };
      const at = objs.findIndex((o) => o.id === name);
      if (at >= 0) {
        if (objs[at]!.kind !== "point") return { error: `${name} isn't a free point, so it can't be moved` };
        const next = objs.slice();
        next[at] = { id: name, kind: "point", x: spec.x, y: spec.y };
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
      if (!measure(o, resolve(objs))) return { error: `can't measure the ${type} of ${of.join(", ")}` };
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
export function describe(objs: GeoObj[]): Record<string, unknown>[] {
  const shapes = resolve(objs);
  const n = (v: number) => Number(v.toFixed(4));
  return objs.map((o) => {
    const s = shapes.get(o.id);
    const { id, kind, ...def } = o;
    const now =
      !s ? { undefined: true }
      : s.t === "pt" ? { x: n(s.p.x), y: n(s.p.y) }
      : s.t === "circle" ? { centre: [n(s.c.x), n(s.c.y)], radius: n(s.r) }
      : s.t === "value" ? { value: Number.isFinite(s.value) ? n(s.value) : "undefined", shown: s.text }
      : {};
    return { id, kind, ...(kind === "point" ? {} : def), ...now };
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
  | TransformOp;

type Want = "point" | "line" | "curve" | "region" | "measurable";

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
  symmetry: "Symmetry",
  reflection: "Reflection",
  translation: "Translation",
  rotation: "Rotation",
  dilation: "Dilation",
};

const kinds = (s: Shape | undefined): Want[] =>
  !s ? []
  : s.t === "pt" ? ["point", "measurable"]
  : s.t === "line" ? ["line", "curve", ...(s.bound === "segment" ? (["measurable"] as const) : [])]
  : s.t === "circle" ? ["curve", "region", "measurable"]
  : s.t === "poly" ? ["region", "measurable"]
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

const COUNT: Partial<Record<GeoTool, number>> = { point: 1, circle: 2, triangle: 3, angle: 3, anglebisector: 3, area: 1, slope: 1, translation: 3 };

/** Tools that end by asking for a number: the angle, or the scale factor. */
export const ASKS: Partial<Record<GeoTool, string>> = { rotation: "Angle (°):", dilation: "Scale Factor:" };

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
  if (tool === "angle" || tool === "anglebisector") return ["Select a point on one side", "Select the vertex", "Select a point on the other side"][picked.length]!;
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
  const count = tool === "polygon" ? Infinity : tool === "length" ? (firstIsPoint ? 2 : 1) : (COUNT[tool] ?? 2);
  if (tool === "point") return { objs, picked: [], built: id };
  if (next.length < count) return { objs, picked: next };
  // Rotation and Dilation have their object and centre: the number is asked for next (see transformWith).
  return ASKS[tool] ? { objs, picked: [], ask: next } : finish(objs, tool, next);
}

/** Finish a Rotation or Dilation once its number is typed. */
export function transformWith(objs: GeoObj[], tool: GeoTool, picked: string[], amount: number) {
  const r = addSpec(objs, { type: tool, of: [picked[0]!], through: picked[1], ...(tool === "rotation" ? { angle: amount } : { factor: amount }) });
  return "error" in r ? { error: r.error } : { objs: r.objs, built: r.id };
}

function finish(objs: GeoObj[], tool: GeoTool, picked: string[]) {
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
