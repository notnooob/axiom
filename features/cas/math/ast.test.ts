// SPDX-License-Identifier: GPL-3.0-or-later
import { describe, expect, it } from "vitest";
import { ParseError, parse } from "./ast";
import { print } from "./print";

// Typed as a student types them; printing the parse gives the same text back.
const SAME = [
  "solve(x^2=2,x)", "∫(x^2,x,0,3)", "derivative(x^3,x)", "[[1,2][3,4]]", "{1,2,3}", "x+y|x=2",
  "5→a", "a:=5", "f(x):=x^2", "sin(π/6)", "√(2)", "3!", "-x^2", "(-2)^2", "nCr(5,2)", "x≤3", "x≠2",
  "ℯ^x", "1/(x+1)", "x^(1/3)", "abs(x-1)", "{1,2}+3", "x and y", "not x", "seq(n^2,n,1,5)",
  "Σ(n,n,1,10)", "mean({1,2,3})", "[1,2,3]", "3.5E2", "i^2", "5°", "x_1", '"abc"', "limit(1/x,x,0,1)",
];

describe("parse and print", () => {
  it.each(SAME)("%s prints back as typed", (s) => expect(print(parse(s))).toBe(s));
  it("writes implied multiplication out", () => {
    expect(print(parse("2x+3"))).toBe("2*x+3");
    expect(print(parse("x^2-5x+6"))).toBe("x^2-5*x+6");
  });
  it("brackets a negative exponent", () => expect(print(parse("2^-1"))).toBe("2^(-1)"));
  it("keeps the square in χ² command names, but not after a variable", () => {
    expect(parse("χ²Pdf(2,3)")).toEqual({ k: "call", f: "χ²Pdf", args: [{ k: "num", v: "2" }, { k: "num", v: "3" }] });
    expect(print(parse("invχ²(0.95,3)"))).toBe("invχ²(0.95,3)");
    expect(print(parse("x²"))).toBe("x^2");
  });
  it("ignores a comment after ©", () => {
    expect(print(parse("2+3 ©the total"))).toBe("2+3");
    expect(print(parse('"a©b"'))).toBe('"a©b"');
  });
  it.each([
    ["2+", "unexpected end"],
    ["(x", "expected )"],
    [")", "unexpected input"],
    ["1,,2", "unexpected input"],
    ["2**3", "unexpected input"],
  ])("%s is a syntax error", (s, msg) => {
    expect(() => parse(s)).toThrow(ParseError);
    expect(() => parse(s)).toThrow(msg);
  });
});
