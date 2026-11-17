// SPDX-License-Identifier: GPL-3.0-or-later
import { describe, expect, it } from "vitest";
import { newPage, problemOf, type CasDocument } from "./document";
import { deletePage, deleteProblem, movePage, problemTitle, renameProblem } from "./pages";

const doc = (): CasDocument => ({
  title: "t",
  pages: [newPage("calculator", 1), newPage("graphs", 1), newPage("calculator", 2), newPage("notes", 3)],
  active: 2,
  problems: { "1": ["a:=1"], "3": ["c:=3"] },
  problemNames: { "3": "Third" },
});

describe("problems", () => {
  it("deleting the shown problem shows the one before, and renumbers the rest", () => {
    const d = deleteProblem(doc(), 2)!;
    expect(d.pages.map(problemOf)).toEqual([1, 1, 2]);
    expect(d.active).toBe(0);
    expect(d.problems).toEqual({ "1": ["a:=1"], "2": ["c:=3"] });
    expect(problemTitle(d, 2)).toBe("Third");
  });
  it("keeps the shown page when another problem goes", () => {
    const before = doc();
    const d = deleteProblem(before, 1)!;
    expect(d.pages[d.active]!.id).toBe(before.pages[2]!.id);
    expect(problemOf(d.pages[d.active])).toBe(1);
  });
  it("won't delete the only problem", () => {
    expect(deleteProblem({ title: "t", pages: [newPage("calculator", 1)], active: 0 }, 1)).toBeNull();
  });
  it("renames", () => {
    expect(problemTitle(renameProblem(doc(), 1, "Intro"), 1)).toBe("Intro");
    expect(problemTitle(renameProblem(doc(), 3, " "), 3)).toBe("Problem 3");
  });
});

describe("pages", () => {
  it("deletes a page, and a problem's last page takes the problem", () => {
    expect(deletePage(doc(), 1)!.pages).toHaveLength(3);
    expect(deletePage(doc(), 3)!.pages.map(problemOf)).toEqual([1, 1, 2]);
  });
  it("moves a page within its problem only", () => {
    const d = doc();
    expect(movePage(d, 0, 1).doc.pages[0]!.id).toBe(d.pages[1]!.id);
    expect(movePage(d, 1, 1).doc).toBe(d);
  });
});
