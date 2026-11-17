// SPDX-License-Identifier: GPL-3.0-or-later
import { describe, expect, it } from "vitest";
import { decimalText, parseDecimal } from "./decimal";

const text = (s: string, digits: number) => decimalText(parseDecimal(s)!, digits);

describe("decimal display", () => {
  it.each([
    ["1.23456789012345", 12, "1.23456789012"],
    ["1.23456789012345", 6, "1.23457"],
    ["0.1", 12, "0.1"],
    ["-0.5", 6, "-0.5"],
    // Too many digits for the display: scientific, as the handheld shows it.
    ["123456789012345678", 12, "1.23456789012E17"],
    ["1E-15", 6, "1.E-15"],
  ] as const)("%s at %i digits is %s", (s, d, out) => expect(text(s, d)).toBe(out));
  it("isn't a decimal", () => expect(parseDecimal("x")).toBeNull());
});
