// SPDX-License-Identifier: GPL-3.0-or-later
import { describe, expect, it } from "vitest";
import { chiCdf, fCdf, normCdf, normInv, tCdf, tInv } from "./distributions";

// Expected values from Giac's own distributions.
describe("distributions", () => {
  it("match Giac's cdfs", () => {
    expect(tCdf(-1.2, 3)).toBeCloseTo(0.158131057349, 11);
    expect(chiCdf(3.3, 7)).toBeCloseTo(0.144066952749, 11);
    expect(fCdf(0.7, 4, 9)).toBeCloseTo(0.388874960093, 11);
    expect(normCdf(-6.2) / 2.82315803704e-10).toBeCloseTo(1, 10);
  });
  it("invert them", () => {
    expect(tInv(0.975, 12)).toBeCloseTo(2.17881282967, 10);
    expect(normInv(0.995)).toBeCloseTo(2.57582930355, 10);
  });
});
