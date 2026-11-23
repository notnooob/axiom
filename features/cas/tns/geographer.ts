// SPDX-License-Identifier: GPL-3.0-or-later
/**
 * TI.GeoGrapher, the handheld's Graphs & Geometry card, read into Axiom's own
 * models: a Geometry page (objects in cm) or a Graphs page (functions, the
 * window, and a construction over the graph in its coordinates).
 *
 * The card's <gg:objs> lists objects in the order they were made, each with
 * an id, its parents' ids (par), an empty element naming how it was built
 * (point_ a free point, seg_pp a segment through two points, pton_pol a
 * point on a polygon …) and its attributes. Positions (x, y) are page
 * centimetres, y up; the axes_system's window maps them to graph
 * coordinates: the visible surface (srfx, srfy, srfw, srfh) shows
 * umin…umax across and vmin…vmax up.
 *
 * Objects built in ways Axiom has no match for are counted in `lost`, so
 * the student is told; labels, tick numbers and other decoration are not.
 */
import { meet, paramAt, resolve, nextLabel, nextId, type GeoObj, type Pt, type Shape } from "../geometry/model";
import type { GraphWindow } from "../graphs/model";

/** One object of <gg:objs>: its element name and its children's text by name. */
export type RawObj = { type: string; fields: Record<string, string> };

export type GeoGrapherPage = {
  /** Graphs when it has graphs or shows its axes; else plane Geometry. */
  app: "graphs" | "geometry";
  window: GraphWindow;
  axes: boolean;
  grid: boolean;
  /** In graph coordinates on a Graphs page, cm on a Geometry page. */
  objects: GeoObj[];
  /** The graphed functions of x, in order, as typed (f1 …). */
  functions: { n?: number; text: string; hidden?: boolean }[];
  /** Free texts on the page, where they sit. */
  texts: { x: number; y: number; text: string }[];
  /** Geometry: what's in view (cm). */
  view: { x: number; y: number; w: number };
  /** Objects that couldn't be brought across. */
  lost: number;
};

/** TI writes − (U+2212) for a minus sign in numbers and expressions. */
const minus = (s: string) => s.replace(/−/g, "-");
const num = (s: string | undefined) => (s === undefined ? NaN : Number(minus(s)));

/**
 * The child that names how an object was built: the first after its id and
 * parents. It may hold a value (pton_g: where on the graph, ×100000).
 */
function ctorOf(o: RawObj): string {
  for (const k of Object.keys(o.fields)) if (k !== "id" && k !== "par") return k;
  return "";
}

/** A text's characters: six numbers of formatting, then the text. */
const chrsText = (chrs: string) => chrs.replace(/^(?:\S+ ){6}/, "");

const VAR = /^[A-Za-z][A-Za-z0-9_]*$/;

/** onLost: told of each object left out (for checking a file by hand). */
export function readGeoGrapher(raw: RawObj[], onLost?: (o: RawObj) => void): GeoGrapherPage {
  const axesSys = raw.find((o) => o.type === "axes_system");
  const f = axesSys?.fields ?? {};
  const [umin, umax, vmin, vmax] = [num(f.umin), num(f.umax), num(f.vmin), num(f.vmax)];
  const [srfx, srfy, srfw, srfh] = [num(f.srfx), num(f.srfy), num(f.srfw), num(f.srfh)];
  const ok = [umin, umax, vmin, vmax, srfx, srfy, srfw, srfh].every(Number.isFinite) && srfw > 0 && srfh > 0 && umax > umin && vmax > vmin;
  const window: GraphWindow = ok
    ? { xmin: umin, xmax: umax, ymin: vmin, ymax: vmax, xscl: 1, yscl: 1 }
    : { xmin: -10, xmax: 10, ymin: -20 / 3, ymax: 20 / 3, xscl: 1, yscl: 1 };
  // Page cm → graph units, and where the origin sits on the page.
  const kx = ok ? (umax - umin) / srfw : 1;
  const ky = ok ? (vmax - vmin) / srfh : 1;
  const x0 = ok ? srfx - umin / kx : 50;
  const y0 = ok ? srfy - vmin / ky : 50;

  const shown = (o: RawObj) => o.fields.asho !== "0";
  const axisShown = raw.some((o) => o.type === "axis" && shown(o)) && (!axesSys || shown(axesSys));
  const graphs = raw.filter((o) => o.type === "graph" || o.type === "graph_c");
  // The axes system's fsmo is 1 on a plane Geometry page (its axes, when shown, are the
  // analytic window) and 0 on Graphs; a file without it is Graphs if it graphs anything.
  const app = f.fsmo !== undefined ? (f.fsmo === "1" && !graphs.length ? "geometry" : "graphs") : graphs.length || axisShown ? "graphs" : "geometry";
  // A Graphs page's construction is in graph coordinates; a Geometry page's in cm about the origin.
  const at = (o: RawObj): Pt | null => {
    const x = num(o.fields.x);
    const y = num(o.fields.y);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
    return app === "graphs" ? { x: (x - x0) * kx, y: (y - y0) * ky } : { x: x - x0, y: y - y0 };
  };

  const byId = new Map<string, RawObj>();
  for (const o of raw) if (o.fields.id) byId.set(o.fields.id, o);

  const objects: GeoObj[] = [];
  /** TI id → Axiom id, for objects that became one. */
  const ids = new Map<string, string>();
  /** TI's sequences (where a line meets a circle): their two parents. */
  const seqs = new Map<string, [string, string]>();
  /** Numbers (typed values, measurements) by TI id, for a circle's radius. */
  const numbers = new Map<string, number>();
  const coordsDone = new Set<string>();
  let lost = 0;
  const lose = (o: RawObj) => {
    lost++;
    onLost?.(o);
  };
  let shapes: Map<string, Shape> | null = null;
  const shape = (id: string) => (shapes ??= resolve(objects)).get(id);
  const add = (o: GeoObj, ti: string, src: RawObj) => {
    const obj = (shown(src) ? o : { ...o, hidden: true }) as GeoObj;
    objects.push(obj);
    ids.set(ti, obj.id);
    shapes = null;
  };
  // The file's own point names are kept, so an unnamed point made before A doesn't take A.
  const NAME = /^[A-Z]\d*$/;
  const reserved = new Set(raw.filter((o) => o.type === "point").map((o) => (o.fields.lbl ?? "").trim()).filter((l) => NAME.test(l)));
  const pointName = (lbl: string | undefined) => {
    const l = (lbl ?? "").trim();
    if (NAME.test(l) && !objects.some((o) => o.id === l)) return l;
    // nextLabel skips names in use; the reserved ones count as in use.
    return nextLabel([...objects, ...[...reserved].map((r) => ({ id: r, kind: "point" as const, x: 0, y: 0 }))]);
  };
  const id = (kind: GeoObj["kind"]) => nextId(objects, kind);

  const functions: GeoGrapherPage["functions"] = [];
  const texts: GeoGrapherPage["texts"] = [];

  for (const o of raw) {
    const ti = o.fields.id ?? "";
    const ctor = ctorOf(o);
    const par = (o.fields.par ?? "").split(/\s+/).filter(Boolean);
    const p = par.map((x) => ids.get(x));
    const all = p.every((x): x is string => x !== undefined);
    switch (o.type) {
      case "point": {
        if (ctor === "oaxes") break;
        const pos = at(o);
        if (!pos) {
          lose(o);
          break;
        }
        const name = pointName(o.fields.lbl);
        if (ctor === "obj_seq") {
          // One of the points where a line meets a circle: the one nearest where the file left it.
          const pair = seqs.get(par[0] ?? "");
          const [a, b] = pair ? pair.map((x) => ids.get(x)) : [];
          const sa = a && shape(a);
          const sb = b && shape(b);
          if (a && b && sa && sb) {
            const pts = meet(sa, sb);
            if (pts.length) {
              let n = 0;
              pts.forEach((q, i) => {
                if (Math.hypot(q.x - pos.x, q.y - pos.y) < Math.hypot(pts[n]!.x - pos.x, pts[n]!.y - pos.y)) n = i;
              });
              add({ id: name, kind: "intersection", of: [a, b], n }, ti, o);
              break;
            }
          }
        }
        if (ctor.startsWith("pton") && all && p.length === 1) {
          // A point on an object: kept on it. (On a function's graph it stays where it is.)
          const s = shape(p[0]!);
          if (s && s.t !== "pt" && s.t !== "value") {
            add({ id: name, kind: "pointon", on: p[0]!, t: paramAt(s, pos) }, ti, o);
            break;
          }
        }
        if (ctor !== "point_" && !ctor.startsWith("pton") && ctor !== "obj_seq") lose(o);
        add({ id: name, kind: "point", x: pos.x, y: pos.y }, ti, o);
        break;
      }
      case "segment":
      case "line":
      case "ray":
      case "vector": {
        const two = all && p.length === 2;
        if ((ctor === "seg_pp" || ctor === "line_pp" || ctor === "ray_pp") && two) {
          const kind = ctor === "seg_pp" ? "segment" : ctor === "ray_pp" ? "ray" : "line";
          add({ id: id(kind), kind, a: p[0]!, b: p[1]! }, ti, o);
        } else if (ctor === "vector_pp" && two) add({ id: id("vector"), kind: "vector", a: p[0]!, b: p[1]! }, ti, o);
        else if ((ctor === "paraline_lp" || ctor === "perpline_lp") && two) {
          const kind = ctor === "paraline_lp" ? "parallel" : "perpendicular";
          add({ id: id(kind), kind, through: p[1]!, to: p[0]! }, ti, o);
        } else if (ctor === "side_pol" && all && p.length === 1) {
          const side = polygonSide(p[0]!, ti);
          if (side) add({ id: id("segment"), kind: "segment", a: side[0], b: side[1] }, ti, o);
          else lose(o);
        } else if (ctor === "line_p" && all && p.length === 1) {
          // A line through one point, its direction kept as a unit vector ("0.447−0.894"):
          // here, a line through that point and a hidden one a step along it.
          const d = (minus(o.fields.line_p ?? "").match(/-?\d*\.?\d+(?:[eE]-?\d+)?/g) ?? []).map(Number);
          const s = shape(p[0]!);
          if (d.length === 2 && d.every(Number.isFinite) && s?.t === "pt") {
            const [dx, dy] = app === "graphs" ? [d[0]! * kx, d[1]! * ky] : [d[0]!, d[1]!];
            const helper = nextId(objects, "point");
            objects.push({ id: helper, kind: "point", x: s.p.x + dx, y: s.p.y + dy, hidden: true });
            add({ id: id("line"), kind: "line", a: p[0]!, b: helper }, ti, o);
          } else lose(o);
        } else lose(o);
        break;
      }
      case "triangle":
      case "polygon":
        if ((ctor === "triangle_ppp" || ctor === "pol_pts") && all && p.length >= 3) add({ id: id("polygon"), kind: "polygon", pts: p }, ti, o);
        else lose(o);
        break;
      case "circle":
        if (ctor === "circle_pr" && par.length === 2 && p[0] && Number.isFinite(numbers.get(par[1]!) ?? NaN))
          add({ id: id("circle"), kind: "circle", centre: p[0], r: Math.abs(numbers.get(par[1]!)!) }, ti, o);
        else if (ctor === "circle_pp" && all && p.length === 2) add({ id: id("circle"), kind: "circle", centre: p[0]!, through: p[1]! }, ti, o);
        else lose(o);
        break;
      case "sequence":
        if (ctor === "pts_lc" && par.length === 2) seqs.set(ti, [par[0]!, par[1]!]);
        break;
      case "number": {
        const v = num(o.fields.num);
        if (Number.isFinite(v)) numbers.set(ti, v);
        const lbl = (o.fields.lbl ?? "").trim();
        const store = VAR.test(lbl) ? { store: lbl } : {};
        if (ctor === "angle_ppp" && all && p.length === 3) add({ id: id("measure"), kind: "measure", what: "angle", of: p, ...store }, ti, o);
        else if (ctor === "slope_l" && all && p.length === 1) add({ id: id("measure"), kind: "measure", what: "slope", of: p, ...store }, ti, o);
        else if (ctor === "coord_p" && p[0] && !coordsDone.has(p[0])) {
          // Two numbers per point (x and y): one Coordinates object.
          coordsDone.add(p[0]);
          add({ id: id("coords"), kind: "coords", of: p[0] }, ti, o);
        }
        break;
      }
      case "graph":
      case "graph_c": {
        const e = byId.get(par[1] ?? "");
        const text = minus((e?.fields.expr ?? o.fields.expr ?? "").trim());
        const m = /^f(\d+)$/.exec((e?.fields.lbl ?? "").trim());
        if (text) functions.push({ ...(m ? { n: Number(m[1]) } : {}), text, ...(shown(o) ? {} : { hidden: true }) });
        break;
      }
      case "text":
        if (ctor === "text_" && !par.length && shown(o)) {
          const pos = at(o);
          const t = chrsText(o.fields.chrs ?? "").trim();
          if (pos && t) texts.push({ ...pos, text: t });
        }
        break;
      default:
        // Axes, ticks, labels, the 3D view, expressions behind graphs, arcs marking angles: the view, not the construction.
        break;
    }
  }

  /** A polygon's side for TI's side_pol: the one the points built on it sit on, else the next one not yet taken. */
  function polygonSide(poly: string, ti: string): [string, string] | null {
    const pg = objects.find((x) => x.id === poly);
    if (pg?.kind !== "polygon") return null;
    const sides = pg.pts.map((a, i) => [a, pg.pts[(i + 1) % pg.pts.length]!] as [string, string]);
    // Points made on this side later: TI keeps where they were.
    const onIt: Pt[] = [];
    for (const [sid, pair] of seqsAhead(ti)) {
      for (const q of raw) if (q.type === "point" && (q.fields.par ?? "").trim() === sid) {
        const pos = at(q);
        if (pos && pair.includes(ti)) onIt.push(pos);
      }
    }
    const pt = (pid: string) => {
      const s = shape(pid);
      return s?.t === "pt" ? s.p : null;
    };
    if (onIt.length) {
      let best: [string, string] | null = null;
      let bestD = Infinity;
      for (const sd of sides) {
        const [a, b] = [pt(sd[0]), pt(sd[1])];
        if (!a || !b) continue;
        const d = onIt.reduce((t, q) => t + distToSegment(q, a, b), 0);
        if (d < bestD) [best, bestD] = [sd, d];
      }
      if (best) return best;
    }
    const taken = objects.filter((x) => x.kind === "segment").map((x) => (x.kind === "segment" ? `${x.a}|${x.b}` : ""));
    return sides.find(([a, b]) => !taken.includes(`${a}|${b}`)) ?? null;
  }
  /** The sequences made after `ti`, with their parents' TI ids. */
  function seqsAhead(ti: string): [string, string[]][] {
    return raw
      .filter((q) => q.type === "sequence" && Number(q.fields.id) > Number(ti))
      .map((q) => [q.fields.id ?? "", (q.fields.par ?? "").split(/\s+/)]);
  }

  // What's in view on a Geometry page: everything shown, with a margin (the card's own
  // viewport depends on a zoom this doesn't read yet).
  let view = { x: 0, y: 0, w: 20 };
  if (app === "geometry") {
    const pts: Pt[] = [];
    const shapesNow = resolve(objects);
    for (const ob of objects) {
      const sh = shapesNow.get(ob.id);
      if (ob.hidden || !sh) continue;
      if (sh.t === "pt") pts.push(sh.p);
      else if (sh.t === "circle") pts.push({ x: sh.c.x - sh.r, y: sh.c.y - sh.r }, { x: sh.c.x + sh.r, y: sh.c.y + sh.r });
      else if (sh.t === "poly") pts.push(...sh.pts);
    }
    for (const t of texts) pts.push(t);
    if (pts.length) {
      const xs = pts.map((q) => q.x);
      const ys = pts.map((q) => q.y);
      const [l, r, b, t] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
      // The screen is about 4:3; a little room round the edge.
      view = { x: (l + r) / 2, y: (b + t) / 2, w: Math.max(8, (r - l) * 1.25, (t - b) * 1.25 * (4 / 3)) };
    }
  }
  const grid = raw.some((o) => o.type === "grid" && shown(o));
  return { app, window, axes: axisShown, grid, objects, functions, texts, view, lost };
}

function distToSegment(q: Pt, a: Pt, b: Pt): number {
  const d = { x: b.x - a.x, y: b.y - a.y };
  const len = d.x * d.x + d.y * d.y;
  const t = len ? Math.max(0, Math.min(1, ((q.x - a.x) * d.x + (q.y - a.y) * d.y) / len)) : 0;
  return Math.hypot(q.x - a.x - t * d.x, q.y - a.y - t * d.y);
}
