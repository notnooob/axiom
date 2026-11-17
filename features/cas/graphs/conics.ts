// SPDX-License-Identifier: GPL-3.0-or-later
/**
 * Analyze Conics: a relation that's a conic, Ax² + Bxy + Cy² + Dx + Ey + F = 0,
 * read for its centre, vertices, foci, axes of symmetry, directrices,
 * asymptotes, radius, eccentricity and latus rectum. A tilted conic (B ≠ 0)
 * is turned to line up with the axes, worked out there, and turned back.
 */

export type Conic =
  | { kind: "circle"; centre: Pt; r: number }
  | { kind: "ellipse" | "hyperbola"; centre: Pt; a: number; b: number; angle: number }
  | { kind: "parabola"; vertex: Pt; p: number; angle: number };

export type Pt = [number, number];
/** A line a·x + b·y = c. */
export type Line = { a: number; b: number; c: number };

export type ConicFeature = "center" | "vertices" | "foci" | "axes" | "directrix" | "asymptotes" | "radius" | "eccentricity" | "latus";

export type ConicResult = { points: { pt: Pt; title: string }[]; lines: { line: Line; title: string }[]; values: { title: string; value: number }[] };

const tiny = (v: number, scale: number) => Math.abs(v) < 1e-9 * Math.max(1, scale);

/** The conic with these coefficients, or null when they don't make one (a pair of lines, a point, nothing). */
export function classify([A, B, C, D, E, F]: number[]): Conic | null {
  const scale = Math.max(Math.abs(A!), Math.abs(B!), Math.abs(C!), Math.abs(D!), Math.abs(E!), Math.abs(F!));
  if (!(scale > 0)) return null;
  // Turn by φ so the xy term goes: u along the conic's own axis.
  const phi = tiny(B!, scale) ? 0 : 0.5 * Math.atan2(B!, A! - C!);
  const [c, s] = [Math.cos(phi), Math.sin(phi)];
  const a2 = A! * c * c + B! * c * s + C! * s * s;
  const c2 = A! * s * s - B! * s * c + C! * c * c;
  const d2 = D! * c + E! * s;
  const e2 = -D! * s + E! * c;
  const back = ([u, v]: Pt): Pt => [u * c - v * s, u * s + v * c];
  if (tiny(a2, scale) !== tiny(c2, scale)) {
    // A parabola: one squared term. Written as (w − w0)² = 4p(z − z0), along u or v.
    const alongU = tiny(a2, scale);
    const [sq, lin, other] = alongU ? [c2, d2, e2] : [a2, e2, d2];
    if (tiny(lin, scale)) return null;
    const w0 = -other / (2 * sq);
    const z0 = (other * other / (4 * sq) - F!) / lin;
    const p = -lin / sq / 4;
    const vertex = alongU ? back([z0, w0]) : back([w0, z0]);
    return { kind: "parabola", vertex, p, angle: alongU ? phi : phi + Math.PI / 2 };
  }
  if (tiny(a2, scale)) return null;
  const u0 = -d2 / (2 * a2);
  const v0 = -e2 / (2 * c2);
  const K = -F! + (d2 * d2) / (4 * a2) + (e2 * e2) / (4 * c2);
  const centre = back([u0, v0]);
  if (a2 * c2 > 0) {
    if (tiny(K, scale) || K / a2 < 0) return null;
    const [ra, rb] = [Math.sqrt(K / a2), Math.sqrt(K / c2)];
    if (Math.abs(ra - rb) < 1e-9 * Math.max(ra, rb)) return { kind: "circle", centre, r: ra };
    // a along the major axis.
    return ra >= rb ? { kind: "ellipse", centre, a: ra, b: rb, angle: phi } : { kind: "ellipse", centre, a: rb, b: ra, angle: phi + Math.PI / 2 };
  }
  if (tiny(K, scale)) return null;
  // A hyperbola opens along u when K/a2 > 0, else along v.
  return K / a2 > 0
    ? { kind: "hyperbola", centre, a: Math.sqrt(K / a2), b: Math.sqrt(-K / c2), angle: phi }
    : { kind: "hyperbola", centre, a: Math.sqrt(K / c2), b: Math.sqrt(-K / a2), angle: phi + Math.PI / 2 };
}

/** What one Analyze Conics item shows for a conic; null when it doesn't apply (a circle's asymptotes). */
export function feature(k: Conic, f: ConicFeature): ConicResult | null {
  const out: ConicResult = { points: [], lines: [], values: [] };
  const angle = k.kind === "circle" ? 0 : k.angle;
  const [c, s] = [Math.cos(angle), Math.sin(angle)];
  const origin = k.kind === "parabola" ? k.vertex : k.centre;
  // A point t along the conic's main axis and n across it.
  const at = (t: number, n = 0): Pt => [origin[0] + t * c - n * s, origin[1] + t * s + n * c];
  // The line through a point in a direction.
  const through = (p: Pt, dx: number, dy: number): Line => ({ a: dy, b: -dx, c: dy * p[0] - dx * p[1] });
  const across = (t: number) => through(at(t), -s, c);
  const along = (n: number) => through(at(0, n), c, s);
  switch (f) {
    case "center":
      if (k.kind === "parabola") return null;
      out.points.push({ pt: k.centre, title: "center" });
      return out;
    case "radius":
      if (k.kind !== "circle") return null;
      out.values.push({ title: "r", value: k.r });
      return out;
    case "eccentricity":
      out.values.push({ title: "e", value: k.kind === "circle" ? 0 : k.kind === "parabola" ? 1 : ecc(k) });
      return out;
    case "vertices":
      if (k.kind === "circle") return null;
      if (k.kind === "parabola") out.points.push({ pt: k.vertex, title: "vertex" });
      else {
        out.points.push({ pt: at(k.a), title: "vertex" }, { pt: at(-k.a), title: "vertex" });
        if (k.kind === "ellipse") out.points.push({ pt: at(0, k.b), title: "vertex" }, { pt: at(0, -k.b), title: "vertex" });
      }
      return out;
    case "foci": {
      if (k.kind === "circle") return null;
      if (k.kind === "parabola") out.points.push({ pt: at(k.p), title: "focus" });
      else {
        const f0 = focal(k);
        out.points.push({ pt: at(f0), title: "focus" }, { pt: at(-f0), title: "focus" });
      }
      return out;
    }
    case "axes":
      if (k.kind === "circle") return null;
      out.lines.push({ line: along(0), title: "axis of symmetry" });
      if (k.kind !== "parabola") out.lines.push({ line: across(0), title: "axis of symmetry" });
      return out;
    case "directrix":
      if (k.kind === "circle") return null;
      if (k.kind === "parabola") out.lines.push({ line: across(-k.p), title: "directrix" });
      else {
        const d = (k.a * k.a) / focal(k);
        out.lines.push({ line: across(d), title: "directrix" }, { line: across(-d), title: "directrix" });
      }
      return out;
    case "asymptotes":
      if (k.kind !== "hyperbola") return null;
      for (const sign of [1, -1]) out.lines.push({ line: through(k.centre, k.a * c - sign * k.b * s, k.a * s + sign * k.b * c), title: "asymptote" });
      return out;
    case "latus":
      if (k.kind === "circle") return null;
      out.values.push({ title: "latus rectum", value: k.kind === "parabola" ? Math.abs(4 * k.p) : (2 * k.b * k.b) / k.a });
      return out;
  }
}

const focal = (k: { kind: "ellipse" | "hyperbola"; a: number; b: number }) => Math.sqrt(k.kind === "ellipse" ? k.a * k.a - k.b * k.b : k.a * k.a + k.b * k.b);
const ecc = (k: { kind: "ellipse" | "hyperbola"; a: number; b: number }) => focal(k) / k.a;
