import { describe, expect, it } from "vitest";
import { addSpec, click, describe as read, remove, resolve, transformWith, type GeoObj, type GeoSpec } from "./model";

const build = (specs: GeoSpec[]) =>
  specs.reduce<GeoObj[]>((objs, s) => {
    const r = addSpec(objs, s);
    if ("error" in r) throw new Error(r.error);
    return r.objs;
  }, []);
const value = (objs: GeoObj[], id: string) => {
  const s = resolve(objs).get(id);
  return s?.t === "value" ? s.value : NaN;
};

describe("geometry", () => {
  const tri = build([
    { type: "point", name: "A", x: 0, y: 0 },
    { type: "point", name: "B", x: 4, y: 0 },
    { type: "point", name: "C", x: 0, y: 3 },
    { type: "triangle", name: "p1", points: ["A", "B", "C"] },
    { type: "segment", name: "s1", points: ["B", "C"] },
    { type: "length", name: "m1", of: ["s1"] },
    { type: "area", name: "m2", of: ["p1"] },
    { type: "angle", name: "m3", points: ["B", "A", "C"] },
    { type: "perimeter", name: "m4", of: ["p1"] },
  ]);

  it("measures a 3-4-5 triangle", () => {
    expect(value(tri, "m1")).toBeCloseTo(5);
    expect(value(tri, "m2")).toBeCloseTo(6);
    expect(value(tri, "m3")).toBeCloseTo(90);
    expect(value(tri, "m4")).toBeCloseTo(12);
  });

  it("moves what's built on a point when it's dragged", () => {
    const moved = addSpec(tri, { type: "point", name: "B", x: 8, y: 0 });
    if ("error" in moved) throw new Error(moved.error);
    expect(value(moved.objs, "m2")).toBeCloseTo(12);
    expect(value(moved.objs, "m1")).toBeCloseTo(Math.hypot(8, 3));
  });

  it("constructs midpoints, perpendiculars and intersections", () => {
    const objs = build([
      { type: "point", name: "A", x: 0, y: 0 },
      { type: "point", name: "B", x: 4, y: 0 },
      { type: "point", name: "C", x: 1, y: 3 },
      { type: "midpoint", name: "M", points: ["A", "B"] },
      { type: "perpendicular", name: "l9", through: "C", to: "AB" },
      { type: "intersection", name: "F", of: ["l9", "AB"] },
      { type: "circle", name: "c1", points: ["A"], radius: 5 },
      { type: "intersection", of: ["c1", "AB"] },
    ]);
    const s = resolve(objs);
    expect(s.get("M")).toEqual({ t: "pt", p: { x: 2, y: 0 } });
    expect(s.get("F")).toMatchObject({ t: "pt", p: { x: 1, y: 0 } });
    // The circle of radius 5 about A meets line AB at (±5, 0).
    const xs = read(objs).filter((o) => o.kind === "intersection" && o.id !== "F").map((o) => o.x as number).sort((a, b) => a - b);
    expect(xs).toEqual([-5, 5]);
  });

  it("removes what was built on a removed point", () => {
    expect(remove(tri, ["C"]).map((o) => o.id)).toEqual(["A", "B"]);
  });

  it("says what's missing", () => {
    expect(addSpec(tri, { type: "segment", points: ["A", "Z"] })).toEqual({ error: "there's no point Z" });
    expect(addSpec([], { type: "point", name: "a", x: 0, y: 0 })).toMatchObject({ error: expect.stringContaining("capital") });
  });

  it("builds a segment from two clicks, making the points where there are none", () => {
    const one = click([], "segment", [], null, { x: 1, y: 1 })!;
    expect(one.picked).toEqual(["A"]);
    const two = click(one.objs, "segment", one.picked, null, { x: 2, y: 5 })!;
    expect(two.built).toBe("s1");
    expect(two.objs.map((o) => o.id)).toEqual(["A", "B", "s1"]);
  });

  it("closes a polygon on its first point", () => {
    let st = { objs: [] as GeoObj[], picked: [] as string[] };
    for (const at of [{ x: 0, y: 0 }, { x: 2, y: 0 }, { x: 2, y: 2 }, { x: 0, y: 2 }]) st = click(st.objs, "polygon", st.picked, null, at)!;
    const done = click(st.objs, "polygon", st.picked, "A", { x: 0, y: 0 })!;
    expect(done.built).toBe("p1");
    expect(value(build([]).concat(done.objs, [{ id: "m1", kind: "measure", what: "area", of: ["p1"] }]), "m1")).toBeCloseTo(4);
  });

  const at = (objs: GeoObj[], id: string) => {
    const s = resolve(objs).get(id);
    return s?.t === "pt" ? [Number(s.p.x.toFixed(6)) + 0, Number(s.p.y.toFixed(6)) + 0] : null;
  };

  it("transforms: symmetry, reflection, translation, rotation, dilation", () => {
    const t = build([
      { type: "point", name: "O", x: 0, y: 0 },
      { type: "point", name: "P", x: 2, y: 1 },
      { type: "point", name: "Q", x: 1, y: 3 },
      { type: "symmetry", of: ["P"], through: "O" },
      { type: "reflection", of: ["Q"], to: "OP" },
      { type: "translation", of: ["Q"], points: ["O", "P"], name: "T" },
      { type: "rotation", of: ["P"], through: "O", angle: 90, name: "R" },
      { type: "circle", name: "c1", points: ["P"], radius: 1 },
      { type: "dilation", of: ["c1"], through: "O", factor: -2 },
    ]);
    expect(at(t, "P'")).toEqual([-2, -1]);
    expect(at(t, "Q'")).toEqual([3, -1]); // Q reflected in the line y = x/2
    expect(at(t, "T")).toEqual([3, 4]);
    expect(at(t, "R")).toEqual([-1, 2]);
    expect(resolve(t).get("c2")).toMatchObject({ t: "circle", c: { x: -4, y: -2 }, r: 2 });
    // Images follow what they were made from, and go when it goes.
    const moved = addSpec(t, { type: "point", name: "P", x: 4, y: 0 });
    if ("error" in moved) throw new Error(moved.error);
    expect(at(moved.objs, "P'")).toEqual([-4, 0]);
    expect(remove(t, ["O"]).map((o) => o.id)).toEqual(["P", "Q", "c1"]);
  });

  it("keeps a triangle's area under a reflection, and refuses what it can't do", () => {
    const r = addSpec(tri, { type: "reflection", of: ["p1"], to: "BC" });
    if ("error" in r) throw new Error(r.error);
    expect(r.id).toBe("p2");
    const m = addSpec(r.objs, { type: "area", name: "m9", of: ["p2"] });
    if ("error" in m) throw new Error(m.error);
    expect(value(m.objs, "m9")).toBeCloseTo(6);
    expect(addSpec(tri, { type: "rotation", of: ["p1"], through: "A" })).toMatchObject({ error: expect.stringContaining("angle") });
    expect(addSpec(tri, { type: "dilation", of: ["m1"], through: "A", factor: 2 })).toMatchObject({ error: expect.stringContaining("measurement") });
  });

  it("rotates by a measured angle", () => {
    const r = addSpec(tri, { type: "rotation", of: ["B"], through: "A", to: "m3", name: "R" });
    if ("error" in r) throw new Error(r.error);
    expect(at(r.objs, "R")).toEqual([0, 4]);
  });

  it("asks for the angle once a rotation has its object and centre", () => {
    const one = click(tri, "rotation", [], "B", { x: 4, y: 0 })!;
    const two = click(one.objs, "rotation", one.picked, "A", { x: 0, y: 0 })!;
    expect(two).toMatchObject({ picked: [], ask: ["B", "A"] });
    const done = transformWith(two.objs, "rotation", two.ask!, 180);
    if ("error" in done) throw new Error(done.error);
    expect(at(done.objs, done.built)).toEqual([-4, 0]);
  });

  it("draws an angle's arc the short way round", () => {
    const s = resolve(tri).get("m3");
    expect(s?.t === "value" && s.arc).toMatchObject({ c: { x: 0, y: 0 }, from: 0 });
    expect(s?.t === "value" && s.arc?.sweep).toBeCloseTo(Math.PI / 2);
  });

  it("stores a measurement in one variable at a time", () => {
    const a = addSpec(tri, { type: "length", name: "m7", of: ["s1"], store: "len" });
    if ("error" in a) throw new Error(a.error);
    const b = addSpec(a.objs, { type: "area", name: "m8", of: ["p1"], store: "len" });
    if ("error" in b) throw new Error(b.error);
    expect(b.objs.filter((o) => o.kind === "measure" && o.store === "len").map((o) => o.id)).toEqual(["m8"]);
    expect(addSpec(tri, { type: "area", of: ["p1"], store: "2x" })).toMatchObject({ error: expect.stringContaining("variable") });
  });
});
