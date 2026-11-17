// SPDX-License-Identifier: GPL-3.0-or-later
import { describe, expect, it } from "vitest";
import { emptyEdit } from "../math/editor";
import { newPage, type CasDocument, type HistoryEntry, type Page } from "../state/document";
import { badge, highlightsSaid, liveHighlights, resolveHighlights } from "./highlights";

const entry = (id: number, input: string, output: string) => ({ id, inputText: input, outputText: output, input: [], output: [] }) as unknown as HistoryEntry;

function doc(): CasDocument {
  const calc = { kind: "calculator", id: 101, problem: 1, history: [entry(1, "expand((x-3)^2)", "x^2-6x+9"), entry(2, "x^2-6x-9→myans", "x^2-6x-9")], edit: emptyEdit(), sel: null } as Page;
  const lists = { ...newPage("lists"), id: 102, cols: [{ name: "a", cells: ["1", "2"] }, { name: "b", cells: ["5", "7"] }] } as Page;
  const graphs = { ...newPage("graphs"), id: 103, functions: [{ n: 1, text: "x^2-4", row: [] }] } as Page;
  const geo = { ...newPage("geometry"), id: 104, objects: [{ id: "A", kind: "point", x: 0, y: 0 }] } as Page;
  return { title: "T", pages: [calc, lists, graphs, geo], active: 0 };
}

describe("resolveHighlights", () => {
  it("marks each kind of target, numbered in order", () => {
    const r = resolveHighlights(doc(), [
      { entry: 2, note: "sign of 9" },
      { page: 1, cell: "b2", note: "should be 8", tone: "look" },
      { page: 2, fn: 1, note: "wrong curve" },
      { page: 2, point: { x: 2, y: 0 }, note: "zero here" },
      { page: 3, object: "A", note: "move this" },
    ]);
    expect("highlights" in r).toBe(true);
    if (!("highlights" in r)) return;
    expect(r.highlights.map((h) => h.n)).toEqual([1, 2, 3, 4, 5]);
    expect(r.highlights[0]).toMatchObject({ pageId: 101, tone: "mistake", target: { kind: "entry", id: 2, n: 2 } });
    expect(r.highlights[1]).toMatchObject({ pageId: 102, tone: "look", target: { kind: "cell", col: 1, row: 2, text: "7" } });
    expect(r.highlights[2]!.target).toEqual({ kind: "fn", n: 1, text: "x^2-4" });
  });

  it("says what's wrong, and marks nothing", () => {
    const err = (items: Parameters<typeof resolveHighlights>[1]) => {
      const r = resolveHighlights(doc(), items);
      return "error" in r ? r.error : "";
    };
    expect(err([{ entry: 1, note: "ok" }, { entry: 7, note: "x" }])).toMatch(/items\[1\]: entry 7: page 1\.1 has 2 entries\. Nothing was highlighted/);
    expect(err([{ cell: "B2", note: "x" }])).toMatch(/cell is for a Lists & Spreadsheet page; page 1\.1 is Calculator/);
    expect(err([{ page: 1, cell: "22", note: "x" }])).toMatch(/isn't a cell like B3/);
    expect(err([{ page: 2, fn: 3, note: "x" }])).toMatch(/no f3\(x\).*f1/);
    expect(err([{ page: 3, object: "Z", note: "x" }])).toMatch(/no object Z/);
    expect(err([{ entry: 1, cell: "A1", note: "x" }])).toMatch(/exactly one/);
    expect(err([{ entry: 1 }])).toMatch(/short note/);
    expect(err([])).toMatch(/at least one/);
  });
});

describe("liveHighlights", () => {
  it("drops a highlight once what it marked changes", () => {
    const d = doc();
    const r = resolveHighlights(d, [{ entry: 1, note: "a" }, { page: 1, cell: "A1", note: "b" }, { page: 2, fn: 1, note: "c" }, { page: 3, object: "A", note: "d" }]);
    if (!("highlights" in r)) throw new Error(r.error);
    expect(liveHighlights(d, r.highlights)).toHaveLength(4);
    const pages = d.pages.slice();
    pages[0] = { ...(pages[0] as Extract<Page, { kind: "calculator" }>), history: [] };
    pages[1] = { ...(pages[1] as Extract<Page, { kind: "lists" }>), cols: [{ name: "a", cells: ["9", "2"] }] };
    pages[2] = { ...(pages[2] as Extract<Page, { kind: "graphs" }>), functions: [{ n: 1, text: "x^2", row: [] }] };
    expect(liveHighlights({ ...d, pages }, r.highlights).map((h) => h.n)).toEqual([4]);
    expect(liveHighlights({ ...d, pages: pages.slice(0, 3) }, r.highlights)).toHaveLength(0);
  });
});

describe("highlightsSaid", () => {
  it("reads them out with their pages", () => {
    const d = doc();
    const r = resolveHighlights(d, [{ entry: 2, note: "sign error" }, { page: 1, cell: "B1", note: "check" }]);
    if (!("highlights" in r)) throw new Error(r.error);
    expect(highlightsSaid(d, r.highlights)).toBe("Highlighted 1: entry 2 on 1.1, sign error. 2: cell B1 on 1.2, check.");
    expect(highlightsSaid(d, [])).toBe("Highlights cleared.");
    expect(badge(1) + badge(9)).toBe("①⑨");
  });
});
