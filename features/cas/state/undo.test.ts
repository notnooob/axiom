// SPDX-License-Identifier: GPL-3.0-or-later
import { describe, expect, it } from "vitest";
import { typeChar } from "../math/editor";
import { newPage, type CalculatorPage, type CasDocument, type GeometryPage, type Page } from "./document";
import { recordStep, undoStep, type UndoStacks } from "./undo";

const doc = (p: Page): CasDocument => ({ title: "t", active: 0, pages: [p] });
const calc = () => newPage("calculator") as CalculatorPage;
const geo = (x: number): GeometryPage => ({ kind: "geometry", id: 7, objects: [{ id: "A", kind: "point", x, y: 0 }] });

describe("undo", () => {
  it("a run of typing undoes as one step", () => {
    const all = new Map<number, UndoStacks>();
    const a = calc();
    const b = { ...a, edit: typeChar(a.edit, "1") };
    const c = { ...b, edit: typeChar(b.edit, "2") };
    recordStep(all, a, b, true);
    recordStep(all, b, c, true);
    expect(all.get(a.id)!.past).toHaveLength(1);
    expect(undoStep(doc(c), true, all).pages[0]).toMatchObject({ edit: a.edit });
  });
  it("an evaluated line is a wall: undo doesn't go past it", () => {
    const all = new Map<number, UndoStacks>();
    const a = calc();
    const b = { ...a, edit: typeChar(a.edit, "1") };
    recordStep(all, a, b, true);
    const done = { ...b, history: [{ id: 1, input: [], inputText: "1", output: [], outputText: "1" }] };
    recordStep(all, b, done, false);
    expect(all.get(a.id)!.past).toEqual([]);
    expect(undoStep(doc(done), true, all)).toEqual(doc(done));
  });
  it("one drag of a point is one step, and redo puts it back", () => {
    const all = new Map<number, UndoStacks>();
    const steps = [geo(0), geo(1), geo(2), geo(3)];
    for (let i = 1; i < steps.length; i++) recordStep(all, steps[i - 1]!, steps[i]!, false);
    expect(all.get(7)!.past).toHaveLength(1);
    const back = undoStep(doc(steps[3]!), true, all);
    expect((back.pages[0] as GeometryPage).objects).toBe(steps[0]!.objects);
    expect((undoStep(back, false, all).pages[0] as GeometryPage).objects).toBe(steps[3]!.objects);
  });
});
