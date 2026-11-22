// SPDX-License-Identifier: GPL-3.0-or-later
// The keypad's letter block in both of Handheld Setup's layouts.
import { describe, expect, it } from "vitest";
import { letterRows } from "./keypad";

describe("letterRows", () => {
  for (const layout of ["ABC", "QWERTY"] as const) {
    it(`${layout} has every letter once`, () => {
      const letters = letterRows(layout)
        .rows.flat()
        .filter((s) => s?.letter)
        .map((s) => s!.label)
        .sort();
      expect(letters.join("")).toBe("abcdefghijklmnopqrstuvwxyz");
    });

    it(`${layout} fits its grid`, () => {
      const { cols, rows, space } = letterRows(layout);
      for (const row of rows.slice(0, -1)) expect(row).toHaveLength(cols);
      expect(rows.at(-1)!.length + space).toBeLessThanOrEqual(cols);
    });

    it(`${layout} keeps the same function keys`, () => {
      const fns = (l: "ABC" | "QWERTY") =>
        letterRows(l)
          .rows.flat()
          .filter((s) => s && !s.letter)
          .map((s) => s!.label)
          .sort();
      expect(fns(layout)).toEqual(fns("ABC"));
    });
  }

  it("QWERTY starts with the keyboard's top row", () => {
    expect(letterRows("QWERTY").rows[0]!.map((s) => s!.label).join("")).toBe("qwertyuiop");
  });
});
