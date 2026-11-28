// SPDX-License-Identifier: GPL-3.0-or-later
import { describe, expect, it } from "vitest";
import { recogniseShape } from "../graphs/mathdraw";
import type { GeometryPage } from "../state/document";
import { selectionAction, SELECTION_ACTION } from "./geometry-app";
import { addSpec, describe as describeGeometry, redefinePoint, resolve, type GeoObj } from "./model";
import { evalNumber, freeNames, geoFormat } from "./numeric";

describe("Calculate and conditions", () => {
  it("finds the variables in order and works the value out", () => {
    expect(freeNames("2*a+b-a")).toEqual(["a", "b"]);
    expect(evalNumber("2*a+1", { a: 14.83 })).toBeCloseTo(30.66);
    expect(evalNumber("v1>0 and v1<3", { v1: 1 })).toBe(1);
    expect(evalNumber("sin(30)", {})).toBeCloseTo(0.5);
    expect(evalNumber("x+1", {})).toBeNaN();
  });
  it("writes values to Float 3, as the handheld's 14.8 cm", () => {
    expect(geoFormat(14.8324)).toBe("14.8");
    expect(geoFormat(30.66)).toBe("30.7");
    expect(geoFormat(15)).toBe("15");
    expect(geoFormat(-0.12345, "Float 2")).toBe("−0.12");
  });
  it("keeps a Calculate result up to date with its measurement", () => {
    const objs: GeoObj[] = [
      { id: "A", kind: "point", x: 0, y: 0 },
      { id: "B", kind: "point", x: 3, y: 4 },
      { id: "s1", kind: "segment", a: "A", b: "B" },
      { id: "m1", kind: "measure", what: "length", of: ["s1"] },
      { id: "c1", kind: "calc", expr: "2*a+1", vars: { a: "m1" }, at: { x: 0, y: -2 } },
    ];
    const v = resolve(objs).get("c1");
    expect(v?.t === "value" && v.text).toBe("11");
    expect(resolve(objs).get("m1")?.t === "value" && (resolve(objs).get("m1") as { text: string }).text).toBe("5 cm");
  });
});

describe("Redefine", () => {
  const base: GeoObj[] = [
    { id: "A", kind: "point", x: 0, y: 0 },
    { id: "B", kind: "point", x: 4, y: 0 },
    { id: "s1", kind: "segment", a: "A", b: "B" },
    { id: "K", kind: "point", x: 1, y: 3 },
  ];
  it("puts a free point on the object it's dropped on, after it in the list", () => {
    const objs = redefinePoint([base[3]!, ...base.slice(0, 3)], "K", "s1", { x: 1, y: 0.1 });
    const k = objs.find((o) => o.id === "K");
    expect(k?.kind).toBe("pointon");
    expect(objs.map((o) => o.id)).toEqual(["A", "B", "s1", "K"]);
    const p = resolve(objs).get("K");
    expect(p?.t === "pt" && p.p.y).toBeCloseTo(0);
  });
  it("merges a point dropped on another one", () => {
    const objs = redefinePoint(base, "B", "K", { x: 1, y: 3 });
    expect(objs.some((o) => o.id === "B")).toBe(false);
    expect(objs.find((o) => o.id === "s1")).toMatchObject({ a: "A", b: "K" });
  });
  it("leaves it free where nothing is", () => {
    expect(redefinePoint(base, "K", null, { x: 2, y: 2 }).find((o) => o.id === "K")).toMatchObject({ kind: "point", x: 2, y: 2 });
  });
});

describe("MathDraw shapes", () => {
  const loop = (n: number, f: (t: number) => [number, number]) => Array.from({ length: n + 1 }, (_, i) => f(i / n));
  it("tells a tap, a line, a circle, a triangle and a rectangle apart", () => {
    expect(recogniseShape([[1, 1], [1.01, 1]], 0.2)?.kind).toBe("point");
    expect(recogniseShape(loop(10, (t) => [t * 4, t * 2]), 0.2)?.kind).toBe("line");
    expect(recogniseShape(loop(40, (t) => [Math.cos(t * 2 * Math.PI) * 3, Math.sin(t * 2 * Math.PI) * 3]), 0.2)?.kind).toBe("circle");
    const tri = recogniseShape([[0, 0], [2, 0], [4, 0], [3, 1.5], [2, 3], [1, 1.5], [0, 0.05]], 0.2);
    expect(tri?.kind === "polygon" && tri.corners.length).toBe(3);
    const rect = recogniseShape([[0, 0], [2, 0], [4, 0], [4, 1], [4, 2], [2, 2], [0, 2], [0, 1], [0, 0.05]], 0.2);
    expect(rect?.kind === "polygon" && rect.corners.length).toBe(4);
  });
});

describe("the selected object's context menu", () => {
  const page = (sel: string | null, multi?: string[]): GeometryPage => ({
    kind: "geometry",
    id: 1,
    tool: null,
    sel,
    multi,
    objects: [
      { id: "A", kind: "point", x: 0, y: 0 },
      { id: "B", kind: "point", x: 3, y: 4 },
      { id: "s1", kind: "segment", a: "A", b: "B" },
    ],
  });
  it("deletes and hides the selection, or what Select Region took in", () => {
    expect(selectionAction(page("A"), "geoDelete").objects.map((o) => o.id)).toEqual(["B"]);
    expect(selectionAction(page(null, ["B"]), "geoHideSel").objects.find((o) => o.id === "B")?.hidden).toBe(true);
    expect(selectionAction(page(null), "geoDelete").objects).toHaveLength(3);
  });
  it("toggles trace and pin, and measures the selection", () => {
    const traced = selectionAction(page("s1"), "geoTraceSel");
    expect(traced.traced).toEqual(["s1"]);
    expect(selectionAction(traced, "geoTraceSel").traced).toEqual([]);
    const measured = selectionAction(page("s1"), "geoMeasure:length");
    expect(measured.sel).toBe("m1");
    expect(measured.objects.at(-1)).toEqual({ id: "m1", kind: "measure", what: "length", of: ["s1"] });
    expect(SELECTION_ACTION.test("geoColour:fill:#ff0000")).toBe(true);
    expect(SELECTION_ACTION.test("geoClear")).toBe(false);
  });
});

describe("the assistant's Calculate and Redefine (construct_geometry)", () => {
  const base: GeoObj[] = [
    { id: "A", kind: "point", x: 0, y: 0 },
    { id: "B", kind: "point", x: 3, y: 4 },
    { id: "s1", kind: "segment", a: "A", b: "B" },
    { id: "m1", kind: "measure", what: "length", of: ["s1"] },
    { id: "K", kind: "point", x: 1, y: 3 },
  ];
  it("places a live result, and refuses a variable that isn't on the page", () => {
    const r = addSpec(base, { type: "calculate", expr: "2*a+1", vars: { a: "m1" }, x: 0, y: -2, store: "res" });
    expect("objs" in r && r.id).toBe("n1");
    const shown = "objs" in r ? describeGeometry(r.objs).find((o) => o.id === "n1") : null;
    expect(shown).toMatchObject({ value: 11, shown: "11" });
    expect(addSpec(base, { type: "calculate", expr: "a", vars: { a: "m9" }, x: 0, y: 0 })).toHaveProperty("error");
  });
  it("puts a point on a segment, and only redefines free points", () => {
    const r = addSpec(base, { type: "redefine", name: "K", to: "s1" });
    expect("objs" in r && r.objs.find((o) => o.id === "K")?.kind).toBe("pointon");
    expect(addSpec(base, { type: "redefine", name: "s1", x: 0, y: 0 })).toHaveProperty("error");
  });
  it("tells the assistant labels and conditions", () => {
    const objs: GeoObj[] = [{ id: "A", kind: "point", x: 0, y: 0, label: "Apex", cond: { show: "v1>0" } }];
    expect(describeGeometry(objs)[0]).toMatchObject({ label: "Apex", conditions: { show: "v1>0" } });
  });
});
