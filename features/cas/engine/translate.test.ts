// SPDX-License-Identifier: GPL-3.0-or-later
import { describe, expect, it } from "vitest";
import { parse } from "../math/ast";
import { translate } from "./translate";

const giac = (s: string) => translate(parse(s), { angle: "rad" }).giac;

describe("translation to Giac", () => {
  it.each([
    ["identity(2)", "idn(2)"],
    ["sin⁻¹(1)", "asin(1)"],
    ["int(2.5)", "floor(2.5)"],
    ["polyRemainder(x^3+1,x+2,x)", "rem((x^3)+1,x+2,x)"],
    // Distributions answer in decimals; Giac's normal_cdf takes μ and σ before the bounds.
    ["normCdf(-∞,1.5,0,1)", "evalf(normal_cdf(0,1,-inf,1.5))"],
    ["binomCdf(10,0.3,2,5)", "evalf(binomial_cdf(10,0.3,2,5))"],
  ])("%s → %s", (input, out) => expect(giac(input)).toBe(out));
  it("checks a sample has two values before its standard deviation", () => {
    // Giac's stddevp is the sample one (the handheld's stDevSamp).
    expect(giac("stDevSamp({1,2,3})")).toBe('ifte(size([1,2,3])<2,"Error: Dimension error",normal(stddevp([1,2,3])))');
  });
  it("pivots ref on the largest entry, keeping Giac's ref for a matrix with names", () => {
    const out = giac("ref([[1,2][3,4]])");
    expect(out).toContain("abs(evalf(M_[k_,j_]))>abs(evalf(M_[p_,j_]))");
    expect(out).toContain("size(lname([[1,2],[3,4]]))>0,ref([[1,2],[3,4]])");
  });
});
