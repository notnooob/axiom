// SPDX-License-Identifier: GPL-3.0-or-later
import { describe, expect, it } from "vitest";
import { click, resolve, transformWith, type GeoObj } from "./model";

const pts = (...xy: [string, number, number][]): GeoObj[] => xy.map(([id, x, y]) => ({ id, kind: "point", x, y }));

describe("more constructions", () => {
  it("a rectangle on a side, as wide as the third point is from it", () => {
    const objs: GeoObj[] = [...pts(["A", 0, 0], ["B", 4, 0], ["C", 1, 2]), { id: "p1", kind: "rectangle", a: "A", b: "B", c: "C" }];
    const s = resolve(objs).get("p1");
    expect(s?.t === "poly" && s.pts.map((p) => [p.x, p.y])).toEqual([[0, 0], [4, 0], [4, 2], [0, 2]]);
  });
  it("a regular hexagon from its centre and a vertex", () => {
    const r = transformWith(pts(["O", 0, 0], ["V", 2, 0]), "regpoly", ["O", "V"], 6);
    const s = "objs" in r ? resolve(r.objs!).get(r.built!) : undefined;
    expect(s?.t === "poly" && s.pts.length).toBe(6);
  });
  it("the tangent to a circle is perpendicular to the radius", () => {
    const objs: GeoObj[] = [...pts(["O", 0, 0], ["R", 2, 0], ["P", 0, 5]), { id: "c1", kind: "circle", centre: "O", through: "R" }, { id: "l1", kind: "tangent", to: "c1", at: "P" }];
    const s = resolve(objs).get("l1");
    expect(s?.t === "line" && [s.p.x, s.p.y]).toEqual([expect.closeTo(0, 9), expect.closeTo(2, 9)]);
  });
  it("an ellipse from its foci passes through its point", () => {
    const objs: GeoObj[] = [...pts(["F", -3, 0], ["G", 3, 0], ["P", 0, 4]), { id: "k1", kind: "conic", type: "ellipse", of: ["F", "G", "P"] }];
    const s = resolve(objs).get("k1");
    const xs = s?.t === "curve" ? s.pieces[0]!.map((p) => p.x) : [];
    expect(Math.max(...xs)).toBeCloseTo(5, 6);
  });
  it("a Point On a segment, and the locus of its midpoint with a fixed point", () => {
    let objs: GeoObj[] = [...pts(["A", 0, 0], ["B", 4, 0], ["C", 0, 2]), { id: "s1", kind: "segment", a: "A", b: "B" }];
    const r = click(objs, "pointon", [], "s1", { x: 1, y: 0.1 })!;
    objs = [...r.objs, { id: "M", kind: "midpoint", of: [r.built!, "C"] }, { id: "lo1", kind: "locus", of: "M", driver: r.built! }];
    const s = resolve(objs).get("lo1");
    const ys = s?.t === "curve" ? s.pieces[0]!.map((p) => p.y) : [];
    expect(ys.every((y) => Math.abs(y - 1) < 1e-9)).toBe(true);
  });
  it("the conic through five points of a circle is that circle", () => {
    const five = [0, 1, 2, 3, 4].map((i) => [String.fromCharCode(65 + i), 2 * Math.cos(i), 2 * Math.sin(i)] as [string, number, number]);
    const objs: GeoObj[] = [...pts(...five), { id: "k1", kind: "conic", type: "five", of: five.map((f) => f[0]) }];
    const s = resolve(objs).get("k1");
    expect(s?.t === "curve" && Math.hypot(s.pieces[0]![10]!.x, s.pieces[0]![10]!.y)).toBeCloseTo(2, 6);
  });
});
