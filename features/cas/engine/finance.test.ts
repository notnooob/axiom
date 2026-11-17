// SPDX-License-Identifier: GPL-3.0-or-later
import { describe, expect, it } from "vitest";
import { finance, type FinanceArg } from "./finance";

const n = (v: number): FinanceArg => ({ k: "num", v });
const l = (...v: number[]): FinanceArg => ({ k: "list", v });

describe("cash flows", () => {
  it("npv discounts each flow one period further", () => {
    expect(finance("npv", [n(10), n(-1000), l(300, 400, 500)])).toBeCloseTo(-21.0368, 4);
  });
  it("frequencies repeat a flow", () => {
    expect(finance("npv", [n(10), n(-1000), l(300, 400), l(1, 2)])).toBeCloseTo(finance("npv", [n(10), n(-1000), l(300, 400, 400)]) as number, 10);
  });
  it("irr is the rate where npv is 0", () => {
    const r = finance("irr", [n(-1000), l(300, 400, 500)]) as number;
    expect(finance("npv", [n(r), n(-1000), l(300, 400, 500)])).toBeCloseTo(0, 8);
  });
  it("mirr reinvests the inflows and finances the outflows", () => {
    expect(finance("mirr", [n(10), n(12), n(-1000), l(300, 400, 500)])).toBeCloseTo(9.8157, 4);
  });
  it("has no irr when the flows never change sign", () => {
    expect(() => finance("irr", [n(100), l(300)])).toThrow("No solution found");
  });
  it("a frequency list must match the flows", () => {
    expect(() => finance("npv", [n(10), n(-1), l(1, 2), l(1)])).toThrow("Dimension error");
  });
});
