// SPDX-License-Identifier: GPL-3.0-or-later
import { describe, expect, it } from "vitest";
import { parse } from "./ast";
import { latexToLinear, looksLikeLatex, rowToLatex, rowToMathML } from "./latex";
import { astToRow } from "./tree";

const row = (s: string) => astToRow(parse(s));

describe("rowToLatex", () => {
  it.each([
    ["x^2+1", "x^{2}+1"],
    ["(x+1)/(x-1)", "\\frac{x+1}{x-1}"],
    ["√(x+1)", "\\sqrt{x+1}"],
    ["root(8,3)", "\\sqrt[3]{8}"],
    ["sin(x)*cos(x)", "\\sin\\left(x\\right)\\cdot\\cos\\left(x\\right)"],
    ["solve(x^2=2,x)", "\\operatorname{solve}\\left(x^{2}=2,x\\right)"],
    ["∫(x^2,x,0,1)", "\\int_{0}^{1} x^{2}\\,\\mathrm{d}x"],
    ["Σ(k^2,k,1,10)", "\\sum_{k=1}^{10}\\left(k^{2}\\right)"],
    ["[[1,2][3,4]]", "\\begin{bmatrix}1 & 2 \\\\ 3 & 4\\end{bmatrix}"],
    ["x≤π", "x\\le\\pi"],
    ["ℯ^(2*x)", "e^{2\\cdot x}"],
    ["abs(x)", "\\left|x\\right|"],
  ])("%s → %s", (input, tex) => expect(rowToLatex(row(input))).toBe(tex));

  it("writes a several-letter name as one italic name", () => {
    expect(rowToLatex(row("area*2"))).toBe("\\mathit{area}\\cdot2");
  });
});

describe("rowToMathML", () => {
  it("writes fractions, powers and function application", () => {
    const ml = rowToMathML(row("sin(x)/x^2"));
    expect(ml).toContain("<mfrac>");
    expect(ml).toContain("<msup><mrow><mi>x</mi></mrow><mrow><mn>2</mn></mrow></msup>");
    expect(ml).toContain("<mi>sin</mi><mo>&#x2061;</mo>");
  });
  it("escapes text", () => {
    expect(rowToMathML(row("x<2"))).toContain("<mo>&lt;</mo>");
  });
});

describe("latexToLinear", () => {
  it.each([
    ["\\frac{1}{2}", "1/2"],
    ["\\frac{x+1}{x-1}", "(x+1)/(x-1)"],
    ["x^{2}+3x-4", "x^2+3x-4"],
    ["\\sqrt{x+1}", "√(x+1)"],
    ["\\sqrt[3]{8}", "root(8,3)"],
    ["2\\cdot 3", "2*3"],
    ["ab", "a*b"],
    ["\\sin x", "sin(x)"],
    ["\\sin\\left(2x\\right)+1", "sin(2x)+1"],
    ["\\sin^{-1}(x)", "sin⁻¹(x)"],
    ["\\sin^2 x", "(sin(x))^2"],
    ["\\log_{2}(8)", "log(8,2)"],
    ["e^{2x}", "ℯ^(2x)"],
    ["\\int_0^1 x^2\\,dx", "∫(x^2,x,0,1)"],
    ["\\int \\sin(x)\\,\\mathrm{d}x", "∫(sin(x),x)"],
    ["\\sum_{k=1}^{n} k^2", "Σ(k^2,k,1,n)"],
    ["\\lim_{x\\to 0} \\frac{\\sin x}{x}", "limit(sin(x)/x,x,0)"],
    ["\\lim_{x\\to 0^+} \\frac{1}{x}", "limit(1/x,x,0,1)"],
    ["\\frac{d}{dx}\\left(x^3\\right)", "d((x^3),x)"],
    ["\\frac{d^2}{dx^2} x^4", "d(x^4,x,2)"],
    ["\\begin{pmatrix}1&2\\\\3&4\\end{pmatrix}", "[[1,2][3,4]]"],
    ["\\begin{cases}x & x>0 \\\\ -x & \\text{otherwise}\\end{cases}", "piecewise(x,x>0,-x)"],
    ["x\\le 3", "x≤3"],
    ["\\left|x-1\\right|", "abs(x-1)"],
    ["$x_1+x_2$", "x1+x2"],
    ["\\pi r^2", "π*r^2"],
    ["f(x)=x^2", "f(x)=x^2"],
    ["30^\\circ", "30°"],
  ])("%s → %s", (tex, linear) => expect(latexToLinear(tex)).toBe(linear));

  it("gives back what the calculator can parse", () => {
    for (const tex of ["\\frac{x^2-1}{x+1}", "\\int_0^{\\pi} \\sin(x)\\,dx", "\\sqrt{x}\\cdot\\sqrt{2}"]) expect(() => parse(latexToLinear(tex))).not.toThrow();
  });

  it("says what it can't read", () => {
    expect(() => latexToLinear("\\oint x")).toThrow(/\\oint/);
  });

  it("round-trips what it copies", () => {
    for (const s of ["(x+1)/(x-1)", "√(x+1)", "x^2+3*x", "∫(x^2,x,0,1)"]) {
      const back = latexToLinear(rowToLatex(row(s)));
      expect(rowToLatex(row(back))).toBe(rowToLatex(row(s)));
    }
  });
});

describe("looksLikeLatex", () => {
  it("tells LaTeX from the calculator's own text", () => {
    expect(looksLikeLatex("\\frac{1}{2}")).toBe(true);
    expect(looksLikeLatex("x^{2}")).toBe(true);
    expect(looksLikeLatex("$x+1$")).toBe(true);
    expect(looksLikeLatex("solve(x^2=2,x)")).toBe(false);
    expect(looksLikeLatex("{1,2,3}")).toBe(false);
  });
});
