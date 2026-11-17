// SPDX-License-Identifier: GPL-3.0-or-later
import { describe, expect, it } from "vitest";
import { corrMat, statProcedure } from "./stats-tests";

const row = (r: { rows: [string, unknown][] }, name: string) => r.rows.find((x) => x[0] === name)?.[1] as number;

describe("two-sample procedures", () => {
  it("2-Sample z Test from summary statistics", () => {
    const r = statProcedure("zTest_2Samp", [2, 3, 10, 30, 12, 40]);
    expect(row(r, "z")).toBeCloseTo(-3.34108, 5);
    expect(row(r, "PVal")).toBeCloseTo(8.34543e-4, 8);
  });
  it("2-Sample t Interval, pooled", () => {
    const r = statProcedure("tInterval_2Samp", [10, 2, 30, 12, 3, 40, 0.95, 1]);
    expect(row(r, "df")).toBe(68);
    expect(row(r, "sp")).toBeCloseTo(2.62062, 5);
    expect(row(r, "CLower")).toBeCloseTo(-3.26301, 5);
  });
  it("2-Sample t Test from data uses Welch's degrees of freedom", () => {
    const r = statProcedure("tTest_2Samp", [[1, 2, 3, 4, 5], [2, 4, 6, 8, 11]]);
    expect(row(r, "df")).toBeCloseTo(5.57328, 5);
    expect(r.rows.some((x) => x[0] === "sp")).toBe(false);
  });
  it("2-Prop z Test pools the proportions", () => {
    expect(row(statProcedure("zTest_2Prop", [30, 100, 45, 120]), "p̂")).toBeCloseTo(75 / 220, 12);
  });
});

describe("χ²", () => {
  it("GOF", () => {
    const r = statProcedure("χ²GOF", [[10, 20, 30], [20, 20, 20], 2]);
    expect(row(r, "χ²")).toBe(10);
    expect(row(r, "PVal")).toBeCloseTo(Math.exp(-5), 12);
  });
  it("2-way table", () => {
    const r = statProcedure("χ²2way", [[[10, 20], [30, 40]]]);
    expect(row(r, "χ²")).toBeCloseTo(0.793651, 6);
    expect(r.rows.find((x) => x[0] === "ExpMat")?.[1]).toEqual([[12, 18], [28, 42]]);
  });
});

describe("regression procedures", () => {
  const xs = [1, 2, 3, 4, 5];
  const ys = [2.1, 3.9, 6.2, 7.8, 10.1];
  it("Linear Reg t Test", () => {
    const r = statProcedure("LinRegtTest", [xs, ys]);
    expect(row(r, "b")).toBeCloseTo(1.99, 12);
    expect(row(r, "t")).toBeCloseTo(33.3213, 4);
  });
  it("Multiple linear regression recovers an exact plane", () => {
    const x1 = [1, 2, 3, 4, 5, 6];
    const x2 = [2, 1, 4, 3, 6, 5];
    const r = statProcedure("MultReg", [x1.map((v, i) => 1 + 2 * v - 3 * x2[i]!), x1, x2]);
    [1, 2, -3].forEach((v, i) => expect(row(r, `b${i}`)).toBeCloseTo(v, 9));
  });
  it("SinReg recovers a sine", () => {
    const x = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];
    const r = statProcedure("SinReg", [x, x.map((v) => 2 * Math.sin(0.8 * v + 0.5) + 1)]);
    expect(row(r, "a")).toBeCloseTo(2, 6);
    expect(row(r, "b")).toBeCloseTo(0.8, 6);
    expect(row(r, "c")).toBeCloseTo(0.5, 6);
    expect(row(r, "d")).toBeCloseTo(1, 6);
  });
  it("Logistic recovers a logistic curve", () => {
    const x = [0, 1, 2, 3, 4, 5, 6, 7];
    const r = statProcedure("Logistic", [x, x.map((v) => 10 / (1 + 20 * Math.exp(-1.2 * v)))]);
    expect(row(r, "a")).toBeCloseTo(20, 5);
    expect(row(r, "b")).toBeCloseTo(1.2, 6);
    expect(row(r, "c")).toBeCloseTo(10, 6);
  });
});

describe("ANOVA", () => {
  it("one-way", () => {
    const r = statProcedure("ANOVA", [[1, 2, 3], [4, 5, 6], [7, 8, 10]]);
    expect(row(r, "F")).toBeCloseTo(20.8462, 4);
    expect(row(r, "dfError")).toBe(6);
  });
  it("two-way with replication", () => {
    const r = statProcedure("ANOVA2way", [[1, 2, 3, 4], [5, 6, 7, 9], 2]);
    expect(row(r, "SSCol")).toBeCloseTo(36.125, 12);
    expect(row(r, "SSInteract")).toBeCloseTo(0.125, 12);
  });
});

it("corrMat", () => {
  const m = corrMat([[1, 2, 3], [2, 4, 6.5], [3, 2, 1]]);
  expect(m[0]![0]).toBeCloseTo(1, 12);
  expect(m[0]![2]).toBeCloseTo(-1, 12);
});
