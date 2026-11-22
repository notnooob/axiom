// SPDX-License-Identifier: GPL-3.0-or-later
import { describe, expect, it } from "vitest";
import { newPage, pageLabel, type CasDocument } from "./document";
import { fillRegion, groupWithNext, nextRegion, selectLayout, swapApp, ungroup, units } from "./layout";
import { deletePage } from "./pages";

const doc = (): CasDocument => ({ title: "t", pages: [newPage("calculator"), newPage("graphs"), newPage("notes")], active: 0 });

describe("page layouts", () => {
  it("Group puts two pages on one tab, and the labels count it once", () => {
    const d = groupWithNext(doc());
    expect(units(d).map((u) => u.pages)).toEqual([[0, 1], [2]]);
    expect([0, 1, 2].map((i) => pageLabel(d, i))).toEqual(["1.1", "1.1", "1.2"]);
    expect(units(ungroup(d))).toHaveLength(3);
  });
  it("Select Layout makes empty regions, and an app fills one", () => {
    const d = selectLayout(doc(), 4);
    expect(d.groups![0]!.slots.filter((s) => s === null)).toHaveLength(2);
    const r = nextRegion(d);
    expect(r).toEqual({ group: 0, slot: 1 });
    const filled = fillRegion(d, 0, 1, newPage("lists"));
    expect(filled.pages).toHaveLength(4);
    expect(units(filled)[0]!.pages).toHaveLength(2);
  });
  it("Swap Application trades regions", () => {
    const d = groupWithNext(doc());
    const ids = d.groups![0]!.slots;
    expect(swapApp(d).groups![0]!.slots).toEqual([ids[1], ids[0]]);
  });
  it("a deleted page leaves its region empty", () => {
    const d = deletePage(groupWithNext(doc()), 1)!;
    expect(d.groups![0]!.slots).toEqual([d.pages[0]!.id, null]);
  });
});
