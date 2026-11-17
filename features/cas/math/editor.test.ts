// SPDX-License-Identifier: GPL-3.0-or-later
import { describe, expect, it } from "vitest";
import * as E from "./editor";

const type = (s: E.EditState, t: string) => [...t].reduce((a, c) => E.typeChar(a, c), s);

describe("entry line editing", () => {
  it("fills a fraction's slots in order, then leaves it", () => {
    let s = E.insertTemplate(E.emptyEdit(), "frac");
    expect(s.cursor.path).toEqual([{ node: 0, slot: "num" }]);
    s = E.nextSlot(type(s, "2"));
    expect(s.cursor.path).toEqual([{ node: 0, slot: "den" }]);
    s = type(E.moveRight(type(s, "3")), "+x");
    expect(E.rowText(s)).toBe("(2)/(3)+x");
  });
  it("types into an exponent until the cursor steps out", () => {
    let s = type(E.insertTemplate(type(E.emptyEdit(), "x"), "pow"), "2");
    expect(E.rowText(s)).toBe("x^(2)");
    s = type(E.moveRight(s), "+1");
    expect(E.rowText(s)).toBe("x^(2)+1");
  });
  it("deletes back out of a template: its contents, then the empty template", () => {
    let s = type(E.insertTemplate(E.emptyEdit(), "sqrt"), "5");
    s = E.backspace(s);
    expect(E.rowText(s)).toBe("√()");
    s = E.backspace(s);
    expect(s.row).toEqual([]);
  });
  it("opens brackets as a pair and steps over the closing one", () => {
    let s = type(E.emptyEdit(), "(");
    expect(s.row).toEqual([{ t: "group", open: "(", arg: [] }]);
    s = type(s, "x)");
    expect(E.rowText(s)).toBe("(x)");
  });
});
