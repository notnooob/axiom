// SPDX-License-Identifier: GPL-3.0-or-later
import { describe, expect, it } from "vitest";
import { newPage, type ListsPage } from "../state/document";
import { columnRefs, insertCell, listsKey, recalc, splitList, withRefs, type Evaluate } from "./sheet";

const page = () => newPage("lists") as ListsPage;
const type = (p: ListsPage, s: string) => [...s].reduce((q, c) => listsKey(q, { k: "char", c }).page, p);

/** A stand-in engine: sums, seq() and list assignments, enough to see the wiring. */
const fake: Evaluate = async (text) => {
  const def = /^(\w+):=(\{.*\})$/.exec(text);
  if (def) return { ok: true, text: def[2]!, definitions: [`${def[1]}:=${def[2]}`] };
  const seq = /^seq\(n\^2,n,1,(\d+)\)$/.exec(text);
  if (seq) return { ok: true, text: `{${Array.from({ length: Number(seq[1]) }, (_, i) => (i + 1) ** 2).join(",")}}`, definitions: [] };
  // eslint-disable-next-line no-new-func
  const v = Function(`return (${text.replace(/[^\d+*().-]/g, "")})`)() as number;
  return { ok: Number.isFinite(v), text: String(v), definitions: [] };
};

describe("lists keys", () => {
  it("types into a cell and moves down on enter", () => {
    let p = type(page(), "12");
    p = listsKey(p, { k: "enter" }).page;
    expect(p.cols[0]!.cells).toEqual(["12"]);
    expect(p.sel).toEqual({ row: 3, col: 0 });
  });
  it("names a column from the name row", () => {
    let p = { ...page(), sel: { row: 0, col: 1 } };
    p = listsKey(type(p, "xs"), { k: "enter" }).page;
    expect(p.cols[1]!.name).toBe("xs");
  });
  it("inserts a cell, moving the column's cells below it down", () => {
    const p = { ...page(), cols: [{ cells: ["1", "2", "3"] }, { cells: ["9"] }], sel: { row: 3, col: 0 } };
    expect(insertCell(p).cols.map((c) => c.cells)).toEqual([["1", "", "2", "3"], ["9"]]);
    const names = { ...p, sel: { row: 0, col: 0 } };
    expect(insertCell(names)).toBe(names);
  });
  it("refuses a command's name for a column, in any case", () => {
    for (const name of ["count", "Mean"]) {
      const r = listsKey(type({ ...page(), sel: { row: 0, col: 0 } }, name), { k: "enter" });
      expect(r.effect).toEqual({ error: "Error: Reserved name" });
      expect(r.page.cols[0]?.name).toBeUndefined();
    }
  });
});

describe("recalc", () => {
  it("works out cell formulas from references and defines named columns", async () => {
    const p: ListsPage = { ...page(), cols: [{ name: "a", cells: ["2", "3"] }, { cells: ["=a1+a2", "=b1*2"] }] };
    const r = await recalc(p, fake);
    expect(r.page.cols[1]!.values).toEqual(["5", "10"]);
    expect(r.definitions).toContain("a:={2,3}");
  });
  it("fills a column from its formula", async () => {
    const p: ListsPage = { ...page(), cols: [{ name: "sq", formula: "=seq(n^2,n,1,4)", cells: [] }] };
    const r = await recalc(p, fake);
    expect(r.page.cols[0]!.values).toEqual(["1", "4", "9", "16"]);
    expect(r.definitions).toContain("sq:={1,4,9,16}");
  });
  it("works out a formula that reads a column worked out after it", async () => {
    const p: ListsPage = { ...page(), cols: [{ cells: ["=b1+1"] }, { cells: ["=c1*2"] }, { cells: ["5"] }] };
    const r = await recalc(p, fake);
    expect(r.page.cols[0]!.values).toEqual(["11"]);
    expect(r.page.cols[1]!.values).toEqual(["10"]);
  });
  it("shows Error for cells that go round in a circle", async () => {
    const p: ListsPage = { ...page(), cols: [{ cells: ["=b1+1"] }, { cells: ["=a1+1"] }] };
    const r = await recalc(p, fake);
    expect(r.page.cols[0]!.values).toEqual(["Error"]);
    expect(r.page.cols[1]!.values).toEqual(["Error"]);
  });
  it("reads a whole unnamed column as a[]", () => {
    const cols = [{ cells: ["1", "2", "x", "3"] }, { cells: [] }];
    expect(columnRefs("mean(a[])+sum(B[])", cols)).toBe("mean({1,2,3})+sum({})");
    expect(columnRefs("data[]", cols)).toBe("data[]");
  });
  it("splits lists at top-level commas only", () => {
    expect(splitList("{1,{2,3},f(4,5)}")).toEqual(["1", "{2,3}", "f(4,5)"]);
    expect(withRefs("a1+b2", (r, c) => `${c}:${r}`)).toBe("(0:2)+(1:3)");
  });
});
