// SPDX-License-Identifier: GPL-3.0-or-later
import { describe, expect, it } from "vitest";
import type { Key } from "../keys";
import { rowText } from "../math/editor";
import { newPage, type CalculatorPage } from "../state/document";
import { calcKey } from "./calc-keys";

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
