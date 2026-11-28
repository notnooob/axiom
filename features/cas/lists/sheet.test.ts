// SPDX-License-Identifier: GPL-3.0-or-later
import { describe, expect, it } from "vitest";
import { newPage, type ListsPage } from "../state/document";
import { rowText } from "../math/editor";
import { listsContextMenu } from "./lists-menu";
import { cellLine, columnRefs, columnsUsed, deleteCell, setStatColumns, shiftRefs, startFill, startMove, startResize, widthOf, copyCells, pasteCells, displayRow, editingFormula, formulaConflicts, insertCell, listsKey, resolveConflicts, recalc, splitList, withRefs, fillRange, heightOf, startRange, startRowResize, startTableResize, tableResizeKey, maximizeTableColumn, fitTableColumn, type Evaluate } from "./sheet";

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
  it("asks Data Loss before a value goes into a column its formula fills", () => {
    const p = { ...page(), cols: [{ formula: "=OneVar(a[],1)", cells: [], values: ["One-Variable Statistics", "2."] }], sel: { row: 3, col: 0 } };
    const r = listsKey(type(p, "5"), { k: "enter" });
    expect(r.page.edit).not.toBeNull();
    if (!r.effect || !("dataLoss" in r.effect)) throw new Error("no Data Loss");
    const { ok, cancel } = r.effect.dataLoss;
    expect(ok.cols[0]).toEqual({ cells: ["", "5"] });
    expect(ok.sel).toEqual({ row: 4, col: 0 });
    expect(cancel.cols).toEqual(p.cols);
    expect(cancel.edit).toBeNull();
    expect(cancel.sel).toEqual({ row: 4, col: 0 });
  });
  it("asks Data Loss before a column formula replaces typed values", () => {
    const p = { ...page(), cols: [{ cells: ["8"] }], sel: { row: 1, col: 0 } };
    const r = listsKey(type(p, "{1,2,3}"), { k: "enter" });
    if (!r.effect || !("dataLoss" in r.effect)) throw new Error("no Data Loss");
    expect(r.effect.dataLoss.ok.cols[0]).toEqual({ formula: "={1,2,3}", cells: [] });
    // An empty column takes its formula without a question.
    const empty = listsKey(type({ ...page(), sel: { row: 1, col: 0 } }, "{1,2}"), { k: "enter" });
    expect(empty.effect).toEqual({ recalc: true });
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

describe("formulas and the cell line", () => {
  it("keeps a formula cell's = when it's edited again", () => {
    let p = { ...page(), cols: [{ cells: ["=a2*2", "5"] }], sel: { row: 2, col: 0 } };
    p = listsKey(p, { k: "enter" }).page;
    expect(rowText(p.edit!)).toBe("=a2*2");
    p = listsKey(p, { k: "enter" }).page;
    expect(p.cols[0]!.cells[0]).toBe("=a2*2");
  });
  it("writes a named column's formula row as name:=, and stores it as =formula", () => {
    let p = { ...page(), cols: [{ name: "b", cells: [] }], sel: { row: 1, col: 0 } };
    p = type(p, "log(x)");
    expect(rowText(p.edit!)).toBe("b:=log(x)");
    expect(editingFormula(p)).toBe("log(x)");
    p = listsKey(p, { k: "enter" }).page;
    expect(p.cols[0]!.formula).toBe("=log(x)");
    expect(cellLine({ ...p, sel: { row: 1, col: 0 } }).ref).toBe("A");
    expect(cellLine({ ...p, sel: { row: 4, col: 1 } }).ref).toBe("B3");
  });
  it("shows log typed with one argument as log base 10 once entered", () => {
    const p = { ...page(), cols: [{ name: "b", formula: "=log(x)", cells: [] }] };
    expect(JSON.stringify(displayRow(p, 1, 0))).toContain('"t":"logbase","base":[{"t":"ch","c":"1"},{"t":"ch","c":"0"}]');
  });
  it("asks about single letters that are both a column and a variable, but not bound ones", () => {
    const vars = new Set(["x", "n", "k"]);
    expect(formulaConflicts("log(x)", (n) => vars.has(n))).toEqual(["x"]);
    expect(formulaConflicts("seq(n^2,n,1,5)+k", (n) => vars.has(n))).toEqual(["k"]);
    expect(formulaConflicts("x[]*2+a1", (n) => vars.has(n))).toEqual([]);
    expect(formulaConflicts("y*2", (n) => vars.has(n))).toEqual([]);
  });
  it("settles a letter as a column reference (x[]) or leaves it a variable", () => {
    expect(resolveConflicts("log(x)+max(x,k)", { x: "column", k: "variable" })).toBe("log(x[])+max(x[],k)");
  });
});

describe("picking a row or column", () => {
  it("picks the column with ▲ from its name, and lets go at the next key", () => {
    const p = { ...page(), sel: { row: 0, col: 1 } };
    const picked = listsKey(p, { k: "up" }).page;
    expect(picked.pick).toBe("col");
    // ▼ comes back to the name; any other key acts as usual, without the pick.
    expect(listsKey(picked, { k: "down" }).page).toMatchObject({ sel: { row: 0, col: 1 } });
    expect(listsKey(picked, { k: "down" }).page.pick).toBeUndefined();
    expect(listsKey(picked, { k: "right" }).page).toMatchObject({ sel: { row: 0, col: 2 } });
  });

  it("offers Delete Column for a picked column, Delete Row for a picked row, and Delete Cell for a cell", () => {
    const labels = (p: ListsPage) => listsContextMenu(p).map((i) => i.label);
    expect(labels({ ...page(), pick: "col" })).toContain("Delete Column");
    expect(labels({ ...page(), sel: { row: 3, col: 0 }, pick: "row" })).toContain("Delete Row");
    expect(labels({ ...page(), sel: { row: 3, col: 0 } })[4]).toBe("Delete Cell");
  });

  it("deletes a cell, moving the ones below it up", () => {
    const p = { ...page(), cols: [{ cells: ["1", "2", "3"] }], sel: { row: 3, col: 0 } };
    expect(deleteCell(p).cols[0]!.cells).toEqual(["1", "3"]);
  });
});

describe("statistics results in columns", () => {
  it("writes the names in one column and a procedure formula in the next, as the handheld does", () => {
    const p = setStatColumns({ ...page(), cols: [{ cells: ["1", "2", "3"] }] }, 1, ["Title", "x̄"], ["=OneVar(a[],1)"]);
    expect(p.cols[1]!.cells).toEqual(['="Title"', '="x̄"']);
    expect(p.cols[2]!.formula).toBe("=OneVar(a[],1)");
    expect(columnsUsed(p, 1, 2)).toBe(true);
    expect(columnsUsed(p, 3, 2)).toBe(false);
  });

  it("fills a procedure's column with its results, not the list it returns", async () => {
    const p = setStatColumns(page(), 0, ["Title", "n"], ["=OneVar({1,2,3},1)"]);
    const run: Evaluate = async () => ({ ok: true, text: "[[...]]", definitions: [] });
    const r = await recalc(p, run, async () => ['"One-Variable Statistics"', "3."]);
    expect(r.page.cols[1]!.values).toEqual(['"One-Variable Statistics"', "3."]);
    // Text shows without its quotes.
    expect(displayRow(r.page, 2, 1).map((n) => ("c" in n ? n.c : "")).join("")).toBe("One-Variable Statistics");
  });
});

describe("Move Column, Resize and Fill", () => {
  const key = (p: ListsPage, k: "left" | "right" | "up" | "down" | "enter" | "esc") => listsKey(p, { k }).page;
  it("moves a column into the gap the arrows choose", () => {
    const p = { ...page(), cols: [{ cells: ["1"] }, { cells: ["2"] }, { cells: ["3"] }], sel: { row: 2, col: 0 } };
    const moved = key(key(key(startMove(p), "right"), "right"), "enter");
    expect(moved.cols.map((c) => c.cells[0])).toEqual(["2", "3", "1"]);
    expect(moved.sel.col).toBe(2);
    expect(key(startMove(p), "esc").cols).toBe(p.cols);
  });

  it("widens a column with the arrows, and Esc puts it back", () => {
    const p = page();
    const wide = key(key(startResize(p), "right"), "right");
    expect(widthOf(wide, 0)).toBe(25);
    expect(widthOf(key(wide, "esc"), 0)).toBe(21);
  });

  it("fills down, moving a formula's references a row each time", () => {
    const p = { ...page(), cols: [{ cells: ["1", "2", "3"] }, { cells: ["=a1*2"] }], sel: { row: 2, col: 1 } };
    const filled = key(key(key(startFill(p), "down"), "down"), "enter");
    expect(filled.cols[1]!.cells).toEqual(["=a1*2", "=a2*2", "=a3*2"]);
    expect(shiftRefs("a1+$b$1+c$2", 1, 1)).toBe("b2+$b$1+d$2");
  });

  it("pastes what was copied at the selection", () => {
    const p = { ...page(), cols: [{ cells: ["7"] }], sel: { row: 2, col: 0 } };
    const pasted = pasteCells({ ...p, sel: { row: 3, col: 1 } }, copyCells(p));
    expect(pasted.cols[1]!.cells).toEqual(["", "7"]);
  });
});

describe("select formula range, row height and column modes", () => {
  const editing = (text: string) => type({ ...page(), sel: { row: 2, col: 1 } }, text);
  it("only picks a range while a formula is being edited", () => {
    expect(startRange(page()).error).toMatch(/edited/);
    expect(startRange(editing("12")).error).toMatch(/starts with =/);
    expect(startRange(editing("=1+")).error).toBeUndefined();
  });
  it("writes the range at the cursor as the arrows stretch it, and Esc takes it out", () => {
    let p = startRange(editing("=1+")).page;
    expect(rowText(p.edit!)).toBe("=1+b1");
    for (const k of ["down", "down", "left"] as const) p = listsKey(p, { k }).page;
    expect(rowText(p.edit!)).toBe("=1+a1:b3");
    expect(fillRange(p)).toHaveLength(6);
    const kept = listsKey(p, { k: "enter" }).page;
    expect(kept.mode).toBeUndefined();
    expect(rowText(kept.edit!)).toBe("=1+a1:b3");
    expect(rowText(listsKey(p, { k: "esc" }).page.edit!)).toBe("=1+");
  });
  it("resizes the selected row with the arrows, and Esc puts it back", () => {
    let p = startRowResize({ ...page(), sel: { row: 3, col: 0 } });
    p = listsKey(p, { k: "down" }).page;
    expect(heightOf(p, 3)).toBeCloseTo(7.2);
    expect(heightOf(p, 4)).toBe(6.4);
    expect(heightOf(listsKey(p, { k: "esc" }).page, 3)).toBe(6.4);
  });
  it("turns a range into a list, or a matrix across columns", () => {
    const v = (r: number, c: number) => `${c}${r}`;
    expect(withRefs("sum(a1:a3)", v)).toBe("sum({02,03,04})");
    expect(withRefs("b2:a1", v)).toBe("[[02,12],[03,13]]");
  });
  it("works a column's formulas out exactly or approximately when Data ▸ says so", async () => {
    const seen: string[] = [];
    const run: Evaluate = async (text) => (seen.push(text), { ok: true, text: "1", definitions: [] });
    const p: ListsPage = { ...page(), cols: [{ cells: ["=1/3"] }, { cells: ["=1/3"] }], colModes: { 0: "approx", 1: "exact" } };
    await recalc(p, run);
    expect(seen).toContain("approx(1/3)");
    expect(seen).toContain("exact(1/3)");
  });
});

describe("function table resize", () => {
  const table = (): ListsPage => ({ ...page(), table: { start: 0, step: 1, col: 1 } });
  it("widens the picked column with ► and puts it back with Esc", () => {
    let p = startTableResize(table());
    p = tableResizeKey(p, { k: "right" }, 2)!;
    expect(p.table!.widths![1]).toBeCloseTo(97 / 3 + 2);
    const kept = tableResizeKey(p, { k: "enter" }, 2)!;
    expect(kept.table!.resize).toBeUndefined();
    expect(kept.table!.widths![1]).toBeCloseTo(97 / 3 + 2);
    const back = tableResizeKey(p, { k: "esc" }, 2)!;
    expect(back.table!.widths![1]).toBeUndefined();
  });
  it("maximizes and fits a column", () => {
    expect(maximizeTableColumn(table()).table!.widths![1]).toBe(88);
    expect(fitTableColumn(table(), 0, 4).table!.widths![0]).toBe(23);
    expect(tableResizeKey(table(), { k: "right" }, 2)).toBeNull();
  });
});
