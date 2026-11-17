// SPDX-License-Identifier: GPL-3.0-or-later
import { describe, expect, it } from "vitest";
import { regression } from "./stats";

const row = (rows: [string, unknown][], name: string) => rows.find((r) => r[0] === name)?.[1] as number;

describe("polynomial regressions", () => {
  it("CubicReg recovers a cubic from its own points", () => {
    const xs = [0, 1, 2, 3, 4, 5];
    const r = regression("CubicReg", xs, xs.map((x) => x ** 3 - 2 * x + 1));
    expect(r.rows[1]).toEqual(["RegEqn", "a*x^3+b*x^2+c*x+d"]);
    [1, 0, -2, 1].forEach((v, i) => expect(row(r.rows, "abcd"[i]!)).toBeCloseTo(v, 9));
    expect(row(r.rows, "R²")).toBeCloseTo(1, 12);
  });
  it("QuartReg names five coefficients", () => {
    const xs = [-2, -1, 0, 1, 2, 3];
    const r = regression("QuartReg", xs, xs.map((x) => 2 * x ** 4 - x));
    expect(r.rows.map((x) => x[0])).toEqual(["Title", "RegEqn", "a", "b", "c", "d", "e", "R²", "Resid"]);
    expect(row(r.rows, "a")).toBeCloseTo(2, 9);
    expect(row(r.rows, "d")).toBeCloseTo(-1, 9);
  });
  it("needs one more point than the degree", () => {
    expect(() => regression("QuartReg", [1, 2, 3, 4], [1, 2, 3, 4])).toThrow("Dimension error");
  });
});

describe("Median-Median line", () => {
  it("goes through the three groups' median points", () => {
    const xs = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    const r = regression("MedMed", xs, [2, 3, 5, 4, 6, 7, 9, 8, 10, 12]);
    expect(row(r.rows, "m")).toBeCloseTo(1, 12);
    expect(row(r.rows, "b")).toBeCloseTo(1, 12);
  });
});
