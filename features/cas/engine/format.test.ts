// SPDX-License-Identifier: GPL-3.0-or-later
import { describe, expect, it } from "vitest";
import { parse } from "../math/ast";
import { print } from "../math/print";
import { canonical } from "./canonical";
import { format } from "./format";

const shown = (raw: string) => print(format(raw, { hint: "none", digits: 6, vars: ["x"] }));

describe("Giac's answer in the handheld's form", () => {
  it.each([
    ["sqrt(2)/2", "√(2)/2"],
    ["3/4", "3/4"],
    ["[1,2,3]", "[1,2,3]"],
    ["0.333333333333", "0.333333"],
  ])("%s shows as %s", (raw, out) => expect(shown(raw)).toBe(out));
});

describe("canonical order", () => {
  it.each([
    ["1+x", "x+1"],
    ["x^2+1+x", "x^2+x+1"],
    ["2+x+x^3", "x^3+x+2"],
    ["b*a", "a*b"],
    ["x*2", "2*x"],
  ])("%s → %s", (input, out) => expect(print(canonical(parse(input)))).toBe(out));
});
