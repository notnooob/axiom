// SPDX-License-Identifier: GPL-3.0-or-later
import { describe, expect, it } from "vitest";
import { classify, feature } from "./conics";

const close = (a: number[], b: number[]) => a.forEach((v, i) => expect(v).toBeCloseTo(b[i]!, 9));

describe("conics", () => {
  it("a circle: (x−1)²+(y+2)²=9", () => {
    const k = classify([1, 0, 1, -2, 4, -4])!;
    expect(k).toMatchObject({ kind: "circle", r: 3 });
    close(feature(k, "center")!.points[0]!.pt, [1, -2]);
    expect(feature(k, "asymptotes")).toBeNull();
  });
  it("an ellipse: x²/25+y²/9=1 has foci at ±4 and e = 0.8", () => {
    const k = classify([1 / 25, 0, 1 / 9, 0, 0, -1])!;
    expect(k.kind).toBe("ellipse");
    const foci = feature(k, "foci")!.points.map((p) => p.pt);
    close(foci[0]!, [4, 0]);
    close(foci[1]!, [-4, 0]);
    expect(feature(k, "eccentricity")!.values[0]!.value).toBeCloseTo(0.8, 12);
    expect(feature(k, "latus")!.values[0]!.value).toBeCloseTo(18 / 5, 12);
  });
  it("a hyperbola opening up: y²/4−x²/9=1, asymptotes y = ±2x/3", () => {
    const k = classify([-1 / 9, 0, 1 / 4, 0, 0, -1])!;
    expect(k.kind).toBe("hyperbola");
    const v = feature(k, "vertices")!.points.map((p) => p.pt);
    close([Math.abs(v[0]![1])], [2]);
    for (const { line } of feature(k, "asymptotes")!.lines) {
      // Through the origin with slope ±2/3.
      expect(line.c).toBeCloseTo(0, 12);
      expect(Math.abs(-line.a / line.b)).toBeCloseTo(2 / 3, 12);
    }
  });
  it("a parabola: y = x² has focus (0, 1/4) and directrix y = −1/4", () => {
    const k = classify([1, 0, 0, 0, -1, 0])!;
    expect(k.kind).toBe("parabola");
    close(feature(k, "foci")!.points[0]!.pt, [0, 0.25]);
    const d = feature(k, "directrix")!.lines[0]!.line;
    // a·x + b·y = c with a = 0: y = c/b.
    expect(d.a).toBeCloseTo(0, 12);
    expect(d.c / d.b).toBeCloseTo(-0.25, 12);
  });
  it("a tilted hyperbola: xy = 1 has vertices at (1,1) and (−1,−1)", () => {
    const k = classify([0, 1, 0, 0, 0, -1])!;
    expect(k.kind).toBe("hyperbola");
    const v = feature(k, "vertices")!.points.map((p) => p.pt).sort((p, q) => q[0] - p[0]);
    close(v[0]!, [1, 1]);
    close(v[1]!, [-1, -1]);
  });
});
