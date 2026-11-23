// SPDX-License-Identifier: GPL-3.0-or-later
// Made-up objects in the card's shape (no TI document's content).
import { describe, expect, it } from "vitest";
import { resolve } from "../geometry/model";
import { readGeoGrapher, type RawObj } from "./geographer";

const o = (type: string, fields: Record<string, string>): RawObj => ({ type, fields });
/** A window of −10…10 by −5…5 shown on a 10 cm by 5 cm surface whose corner is at (45, 47.5): the origin is page (50, 50). */
const axes = (shown = "1") => [
  o("axes_system", { id: "1", axes: "", umin: "−10", umax: "10", vmin: "−5", vmax: "5", srfx: "45", srfy: "47.5", srfw: "10", srfh: "5", asho: shown }),
  o("axis", { id: "2", par: "1", xaxis: "", asho: shown }),
  o("axis", { id: "3", par: "1", yaxis: "", asho: shown }),
  o("grid", { id: "4", par: "1", grid_as: "", asho: "0" }),
];

describe("readGeoGrapher", () => {
  it("reads a plane geometry construction in cm about the origin", () => {
    const g = readGeoGrapher([
      ...axes("0"),
      o("point", { id: "10", point_: "", x: "50", y: "50", lbl: "A" }),
      o("point", { id: "11", point_: "", x: "53", y: "50", lbl: "B" }),
      o("point", { id: "12", point_: "", x: "50", y: "54", lbl: "" }),
      o("triangle", { id: "13", par: "10 11 12", triangle_ppp: "" }),
      o("segment", { id: "14", par: "10 11", seg_pp: "", asho: "0" }),
      o("number", { id: "15", par: "11 10 12", angle_ppp: "", num: "90", lbl: "ang" }),
      o("label", { id: "16", par: "10", lbl_p: "", x: "49", y: "49" }),
    ]);
    expect(g.app).toBe("geometry");
    expect(g.lost).toBe(0);
    expect(g.objects).toEqual([
      { id: "A", kind: "point", x: 0, y: 0 },
      { id: "B", kind: "point", x: 3, y: 0 },
      { id: "C", kind: "point", x: 0, y: 4 },
      { id: "p1", kind: "polygon", pts: ["A", "B", "C"] },
      { id: "s1", kind: "segment", a: "A", b: "B", hidden: true },
      { id: "m1", kind: "measure", what: "angle", of: ["B", "A", "C"], store: "ang" },
    ]);
    const m = resolve(g.objects).get("m1");
    expect(m?.t === "value" && Math.round(m.value)).toBe(90);
    expect(g.view).toEqual({ x: 1.5, y: 2, w: 8 });
  });

  it("reads a Graphs page: the window, its functions and points in graph coordinates", () => {
    const g = readGeoGrapher([
      ...axes(),
      o("expression", { id: "20", r_expr: "", expr: "2x−1", lbl: "" }),
      o("graph", { id: "21", par: "1 20", graph_e: "", expr: "2x−1" }),
      o("point", { id: "22", point_: "", x: "51", y: "51", lbl: "P" }),
    ]);
    expect(g.app).toBe("graphs");
    expect(g.window).toMatchObject({ xmin: -10, xmax: 10, ymin: -5, ymax: 5 });
    expect(g.functions).toEqual([{ text: "2x-1" }]);
    expect(g.objects).toEqual([{ id: "P", kind: "point", x: 2, y: 2 }]);
  });

  it("keeps points on objects and picks the right intersection", () => {
    const g = readGeoGrapher([
      ...axes("0"),
      o("point", { id: "10", point_: "", x: "50", y: "50", lbl: "O" }),
      o("number", { id: "11", calc: "", num: "2" }),
      o("circle", { id: "12", par: "10 11", circle_pr: "" }),
      o("point", { id: "13", point_: "", x: "46", y: "50", lbl: "A" }),
      o("point", { id: "14", point_: "", x: "54", y: "50", lbl: "B" }),
      o("segment", { id: "15", par: "13 14", seg_pp: "" }),
      o("sequence", { id: "16", par: "15 12", pts_lc: "" }),
      o("point", { id: "17", par: "16", obj_seq: "", x: "52", y: "50", lbl: "" }),
      o("point", { id: "18", par: "12", pton_c: "", x: "50", y: "52", lbl: "" }),
    ]);
    const shapes = resolve(g.objects);
    const pt = (id: string) => {
      const s = shapes.get(id);
      return s?.t === "pt" ? { x: Math.round(s.p.x * 1e6) / 1e6, y: Math.round(s.p.y * 1e6) / 1e6 } : null;
    };
    const inter = g.objects.find((x) => x.kind === "intersection")!;
    expect(pt(inter.id)).toEqual({ x: 2, y: 0 });
    const on = g.objects.find((x) => x.kind === "pointon")!;
    expect(pt(on.id)).toEqual({ x: 0, y: 2 });
    expect(g.lost).toBe(0);
  });

  it("counts objects it can't follow", () => {
    const g = readGeoGrapher([...axes("0"), o("point", { id: "10", point_: "", x: "50", y: "50" }), o("line", { id: "11", par: "10", line_p: "" })]);
    expect(g.lost).toBe(1);
  });
});
