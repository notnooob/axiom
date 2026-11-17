// SPDX-License-Identifier: GPL-3.0-or-later
import { describe, expect, it } from "vitest";
import type { Key } from "../keys";
import { emptyEdit, rowText } from "../math/editor";
import { newPage, type CalculatorPage } from "../state/document";
import { calcKey, isTemplateWizard, wizardInsert, wizardLinear } from "./calc-keys";

const page = () => newPage("calculator") as CalculatorPage;
const typed = (t: string) => [...t].reduce((p, c) => calcKey(p, { k: "char", c } as Key).page, page());

describe("Calculator keys", () => {
  it("types into the entry line; enter and ctrl+enter ask for an answer", () => {
    const p = typed("2+3");
    expect(rowText(p.edit)).toBe("2+3");
    expect(calcKey(p, { k: "enter" }).effect).toEqual({ evaluate: "exact" });
    expect(calcKey(p, { k: "approx" }).effect).toEqual({ evaluate: "approx" });
  });
  it("up selects the last answer, and enter pastes it into the entry line", () => {
    const p = page();
    p.history.push({ id: 1, input: [], inputText: "2+3", output: [], outputText: "5" });
    const up = calcKey(p, { k: "up" });
    expect(up.page.sel).toEqual({ entry: 0, part: "output" });
    const r = calcKey(up.page, { k: "enter" });
    expect(rowText(r.page.edit)).toBe("5");
    expect(r.page.sel).toBeNull();
    expect(r.effect).toBeNull();
  });
});

describe("Create a Matrix dialog", () => {
  it("inserts an empty matrix of the asked size with the cursor in its first box", () => {
    const s = wizardInsert(emptyEdit(), "matrix:2:3");
    expect(s.row).toEqual([{ t: "matrix", cells: [[[], [], []], [[], [], []]] }]);
    expect(s.cursor).toEqual({ path: [{ node: 0, slot: "c.0.0" }], index: 0 });
  });
  it("keeps sizes to whole numbers from 1 to 12, and falls back to 2 for anything else", () => {
    expect(rowText(wizardInsert(emptyEdit(), "matrix:40:1"))).toBe("[[][][][][][][][][][][][]]");
    expect(rowText(wizardInsert(emptyEdit(), "matrix:x:0"))).toBe("[[,][,]]");
  });
  it("writes a template dialog's result out as linear text for Notes, and leaves plain text alone", () => {
    expect(wizardLinear("matrix:2:3")).toBe("[[,,][,,]]");
    expect(wizardLinear("polyroots:Real")).toBe("polyRoots()");
    expect(wizardLinear("solve(x^2=1,x)")).toBe("solve(x^2=1,x)");
    expect(isTemplateWizard("matrix:2:2")).toBe(true);
    expect(isTemplateWizard("lists:seq:n:1:10")).toBe(false);
  });
});
