// SPDX-License-Identifier: GPL-3.0-or-later
import { describe, expect, it } from "vitest";
import { newPage, type ListsPage } from "../state/document";
import { listsKey, recalc, splitList, withRefs, type Evaluate } from "./sheet";

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
  it("splits lists at top-level commas only", () => {
    expect(splitList("{1,{2,3},f(4,5)}")).toEqual(["1", "{2,3}", "f(4,5)"]);
    expect(withRefs("a1+b2", (r, c) => `${c}:${r}`)).toBe("(0:2)+(1:3)");
  });
});
