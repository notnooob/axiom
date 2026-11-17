// SPDX-License-Identifier: GPL-3.0-or-later
/**
 * MathDraw: a stroke drawn on a Graphs page becomes the line or circle it
 * looks like, as a relation with rounded numbers. A stroke that ends near
 * where it began, and sits well on a circle, is a circle; anything else is
 * the straight line closest to it.
 */

type Pt = [number, number];

/** Round to the window's scale: two decimals on the standard window. */
const rounder = (span: number) => {
  const step = 10 ** Math.floor(Math.log10(span / 100));
  return (v: number) => {
    const r = Math.round(v / step) * step;
    return Number(r.toPrecision(10));
  };
};

const fmt = (v: number) => (v < 0 ? `-${-v}` : `${v}`);
const plus = (v: number) => (v < 0 ? `-${-v}` : `+${v}`);

/** The relation the stroke looks like, written as it would be typed. */
export function recognise(pts: Pt[], span: number): string | null {
  if (pts.length < 3) return null;
  const n = pts.length;
  const mx = pts.reduce((s, p) => s + p[0], 0) / n;
  const my = pts.reduce((s, p) => s + p[1], 0) / n;
  const size = Math.max(...pts.map((p) => Math.hypot(p[0] - mx, p[1] - my)));
  if (!(size > 0)) return null;
  const round = rounder(span);
  const closed = Math.hypot(pts[0]![0] - pts[n - 1]![0], pts[0]![1] - pts[n - 1]![1]) < size * 0.5;
  if (closed) {
    // The circle through the points by least squares (x² + y² + Dx + Ey + F = 0).
    const c = circleFit(pts);
    if (c && Number.isFinite(c.r)) {
      const spread = Math.sqrt(pts.reduce((s, p) => s + (Math.hypot(p[0] - c.h, p[1] - c.k) - c.r) ** 2, 0) / n);
      if (spread < c.r * 0.2) return `(x${plus(-round(c.h))})^2+(y${plus(-round(c.k))})^2=${fmt(round(c.r))}^2`.replace(/\(x-0\)|\(x\+0\)/, "x").replace(/\(y-0\)|\(y\+0\)/, "y");
    }
  }
  // The line closest to every point (total least squares): along the main direction of the points.
  let sxx = 0;
  let syy = 0;
  let sxy = 0;
  for (const [x, y] of pts) {
    sxx += (x - mx) ** 2;
    syy += (y - my) ** 2;
    sxy += (x - mx) * (y - my);
  }
  const angle = 0.5 * Math.atan2(2 * sxy, sxx - syy);
  const [dx, dy] = [Math.cos(angle), Math.sin(angle)];
  if (Math.abs(dx) < 0.05) return `x=${fmt(round(mx))}`;
  const m = dy / dx;
  const b = my - m * mx;
  const [rm, rb] = [round(m), round(b)];
  return `y=${rm === 0 ? "" : `${rm === 1 ? "" : rm === -1 ? "-" : rm}x`}${rm === 0 ? fmt(rb) : rb === 0 ? "" : plus(rb)}`;
}

function circleFit(pts: Pt[]): { h: number; k: number; r: number } | null {
  // Normal equations for D, E, F in x² + y² + Dx + Ey + F = 0.
  const M = [
    [0, 0, 0],
    [0, 0, 0],
    [0, 0, 0],
  ];
  const v = [0, 0, 0];
  for (const [x, y] of pts) {
    const row = [x, y, 1];
    const rhs = -(x * x + y * y);
    for (let i = 0; i < 3; i++) {
      v[i]! += row[i]! * rhs;
      for (let j = 0; j < 3; j++) M[i]![j]! += row[i]! * row[j]!;
    }
  }
  const det = (m: number[][]) =>
    m[0]![0]! * (m[1]![1]! * m[2]![2]! - m[1]![2]! * m[2]![1]!) - m[0]![1]! * (m[1]![0]! * m[2]![2]! - m[1]![2]! * m[2]![0]!) + m[0]![2]! * (m[1]![0]! * m[2]![1]! - m[1]![1]! * m[2]![0]!);
  const d = det(M);
  if (Math.abs(d) < 1e-12) return null;
  const solve = (i: number) => det(M.map((row, r) => row.map((x, c) => (c === i ? v[r]! : x)))) / d;
  const [D, E, F] = [solve(0), solve(1), solve(2)];
  const h = -D / 2;
  const k = -E / 2;
  return { h, k, r: Math.sqrt(h * h + k * k - F) };
}
