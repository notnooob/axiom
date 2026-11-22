// SPDX-License-Identifier: GPL-3.0-or-later
/**
 * The two-sample and two-proportion procedures, χ², F, the regression t
 * procedures, ANOVA, multiple regression and the iterative regressions
 * (sinusoidal, logistic), worked in plain numbers. Each takes its arguments
 * as the engine evaluated them (a number, a list, or a matrix) in the order
 * the handheld's command takes them, and returns the rows of stat.results.
 */
import { chiTail, fCdf, fTail, normCdf, normInv, symmetricP, tCdf, tInv } from "./distributions";
import { frequencies, type StatResult, type StatRow } from "./stats";

export type Arg = number | number[] | number[][] | undefined;

export const TEST_COMMANDS = new Set([
  "zInterval_2Samp",
  "tInterval_2Samp",
  "zInterval_2Prop",
  "LinRegtIntervals",
  "MultRegIntervals",
  "zTest_2Samp",
  "tTest_2Samp",
  "zTest_2Prop",
  "χ²GOF",
  "χ²2way",
  "FTest_2Samp",
  "LinRegtTest",
  "MultRegTests",
  "ANOVA",
  "ANOVA2way",
  "SinReg",
  "Logistic",
  "LogisticD",
  "MultReg",
]);

const wrong = () => new Error("Error: Wrong kind of input");
const domain = () => new Error("Error: Domain error");
const sum = (v: number[]) => v.reduce((s, x) => s + x, 0);

const isList = (a: Arg): a is number[] => Array.isArray(a) && !a.some(Array.isArray);
const isMatrix = (a: Arg): a is number[][] => Array.isArray(a) && a.length > 0 && a.every(Array.isArray);

function num(a: Arg, fallback?: number): number {
  if (a === undefined && fallback !== undefined) return fallback;
  if (typeof a !== "number") throw wrong();
  return a;
}
function list(a: Arg): number[] {
  if (!isList(a)) throw wrong();
  return a;
}

/** A list's weighted mean, sample sd and size. */
function fromData(xs: number[], f: Arg) {
  const w = frequencies(xs, f === undefined ? 1 : isList(f) ? f : num(f));
  const n = sum(w);
  if (!(n > 0)) throw new Error("Error: Dimension Error");
  const mean = sum(xs.map((x, i) => x * w[i]!)) / n;
  const sx = Math.sqrt(sum(xs.map((x, i) => w[i]! * (x - mean) ** 2)) / (n - 1));
  return { mean, sx, n };
}

/** The alternative hypothesis line, for a parameter p with the alternative's code (0 ≠, −1 <, 1 >). */
const alt = (lhs: string, rhs: string, hyp: number) => `${lhs} ${hyp < 0 ? "<" : hyp > 0 ? ">" : "≠"} ${rhs}`;

function level(c: Arg): number {
  const v = num(c, 0.95);
  if (!(v > 0 && v < 1)) throw domain();
  return v;
}

/** The two samples of a 2-sample procedure: from lists (with frequencies) or from summary statistics. */
type Samples = { m1: number; s1: number; n1: number; m2: number; s2: number; n2: number; data: boolean };

// ─── Intervals and tests on two samples ─────────────────────────────────────

function zInterval2(a: Arg[]): StatResult {
  const [s1, s2] = [num(a[0]), num(a[1])];
  const d = isList(a[2])
    ? { ...pair(fromData(list(a[2]), a[4]), fromData(list(a[3]), a[5])), c: level(a[6]) }
    : { m1: num(a[2]), n1: num(a[3]), m2: num(a[4]), n2: num(a[5]), s1: NaN, s2: NaN, data: false, c: level(a[6]) };
  if (!(s1 > 0 && s2 > 0 && d.n1 > 0 && d.n2 > 0)) throw domain();
  const me = normInv((1 + d.c) / 2) * Math.sqrt(s1 ** 2 / d.n1 + s2 ** 2 / d.n2);
  const diff = d.m1 - d.m2;
  return {
    rows: [
      ["Title", "2-Sample z Interval"],
      ["CLower", diff - me],
      ["CUpper", diff + me],
      ["x̄1-x̄2", diff],
      ["ME", me],
      ["x̄1", d.m1],
      ["x̄2", d.m2],
      ...(d.data ? ([["sx1", d.s1], ["sx2", d.s2]] as StatRow[]) : []),
      ["n1", d.n1],
      ["n2", d.n2],
      ["σ1", s1],
      ["σ2", s2],
    ],
  };
}

const pair = (p: ReturnType<typeof fromData>, q: ReturnType<typeof fromData>): Samples => ({
  m1: p.mean,
  s1: p.sx,
  n1: p.n,
  m2: q.mean,
  s2: q.sx,
  n2: q.n,
  data: true,
});

/** The standard error and degrees of freedom of x̄1 − x̄2: Welch's, or pooled (and sp). */
function tSpread(d: Samples, pooled: boolean) {
  if (!(d.n1 >= 2 && d.n2 >= 2 && d.s1 >= 0 && d.s2 >= 0)) throw domain();
  const [v1, v2] = [d.s1 ** 2 / d.n1, d.s2 ** 2 / d.n2];
  if (pooled) {
    const df = d.n1 + d.n2 - 2;
    const sp = Math.sqrt(((d.n1 - 1) * d.s1 ** 2 + (d.n2 - 1) * d.s2 ** 2) / df);
    return { se: sp * Math.sqrt(1 / d.n1 + 1 / d.n2), df, sp };
  }
  const df = (v1 + v2) ** 2 / (v1 ** 2 / (d.n1 - 1) + v2 ** 2 / (d.n2 - 1));
  return { se: Math.sqrt(v1 + v2), df, sp: undefined };
}

/** tInterval_2Samp and tTest_2Samp read their samples the same way; `extra` is how many options follow. */
function tSamples(a: Arg[]): { d: Samples; rest: Arg[] } {
  if (isList(a[0])) return { d: pair(fromData(list(a[0]), a[2]), fromData(list(a[1]), a[3])), rest: a.slice(4) };
  return { d: { m1: num(a[0]), s1: num(a[1]), n1: num(a[2]), m2: num(a[3]), s2: num(a[4]), n2: num(a[5]), data: false }, rest: a.slice(6) };
}

function tInterval2(a: Arg[]): StatResult {
  const { d, rest } = tSamples(a);
  const c = level(rest[0]);
  const { se, df, sp } = tSpread(d, num(rest[1], 0) === 1);
  const me = tInv((1 + c) / 2, df) * se;
  const diff = d.m1 - d.m2;
  return {
    rows: [
      ["Title", "2-Sample t Interval"],
      ["CLower", diff - me],
      ["CUpper", diff + me],
      ["x̄1-x̄2", diff],
      ["ME", me],
      ["df", df],
      ["x̄1", d.m1],
      ["x̄2", d.m2],
      ["sx1", d.s1],
      ["sx2", d.s2],
      ["n1", d.n1],
      ["n2", d.n2],
      ...(sp !== undefined ? ([["sp", sp]] as StatRow[]) : []),
    ],
  };
}

function zInterval2Prop(a: Arg[]): StatResult {
  const [x1, n1, x2, n2] = [num(a[0]), num(a[1]), num(a[2]), num(a[3])];
  if (!(n1 > 0 && n2 > 0 && x1 >= 0 && x1 <= n1 && x2 >= 0 && x2 <= n2)) throw domain();
  const c = level(a[4]);
  const [p1, p2] = [x1 / n1, x2 / n2];
  const me = normInv((1 + c) / 2) * Math.sqrt((p1 * (1 - p1)) / n1 + (p2 * (1 - p2)) / n2);
  return {
    rows: [
      ["Title", "2-Prop z Interval"],
      ["CLower", p1 - p2 - me],
      ["CUpper", p1 - p2 + me],
      ["p̂Diff", p1 - p2],
      ["ME", me],
      ["p̂1", p1],
      ["p̂2", p2],
      ["n1", n1],
      ["n2", n2],
    ],
  };
}

function zTest2(a: Arg[]): StatResult {
  const [s1, s2] = [num(a[0]), num(a[1])];
  const data = isList(a[2]);
  const d: Samples = data
    ? pair(fromData(list(a[2]), a[4]), fromData(list(a[3]), a[5]))
    : { m1: num(a[2]), n1: num(a[3]), m2: num(a[4]), n2: num(a[5]), s1: NaN, s2: NaN, data: false };
  const hyp = num(a[6], 0);
  if (!(s1 > 0 && s2 > 0 && d.n1 > 0 && d.n2 > 0)) throw domain();
  const z = (d.m1 - d.m2) / Math.sqrt(s1 ** 2 / d.n1 + s2 ** 2 / d.n2);
  return {
    rows: [
      ["Title", "2-Sample z Test"],
      ["Alternate Hyp", alt("μ1", "μ2", hyp)],
      ["z", z],
      ["PVal", symmetricP(z, hyp, normCdf)],
      ["x̄1", d.m1],
      ["x̄2", d.m2],
      ...(d.data ? ([["sx1", d.s1], ["sx2", d.s2]] as StatRow[]) : []),
      ["n1", d.n1],
      ["n2", d.n2],
    ],
  };
}

function tTest2(a: Arg[]): StatResult {
  const { d, rest } = tSamples(a);
  const hyp = num(rest[0], 0);
  const { se, df, sp } = tSpread(d, num(rest[1], 0) === 1);
  const t = (d.m1 - d.m2) / se;
  return {
    rows: [
      ["Title", "2-Sample t Test"],
      ["Alternate Hyp", alt("μ1", "μ2", hyp)],
      ["t", t],
      ["PVal", symmetricP(t, hyp, (v) => tCdf(v, df))],
      ["df", df],
      ["x̄1", d.m1],
      ["x̄2", d.m2],
      ["sx1", d.s1],
      ["sx2", d.s2],
      ["n1", d.n1],
      ["n2", d.n2],
      ...(sp !== undefined ? ([["sp", sp]] as StatRow[]) : []),
    ],
  };
}

function zTest2Prop(a: Arg[]): StatResult {
  const [x1, n1, x2, n2] = [num(a[0]), num(a[1]), num(a[2]), num(a[3])];
  if (!(n1 > 0 && n2 > 0 && x1 >= 0 && x1 <= n1 && x2 >= 0 && x2 <= n2)) throw domain();
  const hyp = num(a[4], 0);
  const [p1, p2, p] = [x1 / n1, x2 / n2, (x1 + x2) / (n1 + n2)];
  const z = (p1 - p2) / Math.sqrt(p * (1 - p) * (1 / n1 + 1 / n2));
  return {
    rows: [
      ["Title", "2-Prop z Test"],
      ["Alternate Hyp", alt("p1", "p2", hyp)],
      ["z", z],
      ["PVal", symmetricP(z, hyp, normCdf)],
      ["p̂1", p1],
      ["p̂2", p2],
      ["p̂", p],
      ["n1", n1],
      ["n2", n2],
    ],
  };
}

function fTest2(a: Arg[]): StatResult {
  const data = isList(a[0]);
  let d: Samples;
  let hyp: number;
  if (data) {
    d = pair(fromData(list(a[0]), a[2]), fromData(list(a[1]), a[3]));
    hyp = num(a[4], 0);
  } else {
    d = { m1: NaN, s1: num(a[0]), n1: num(a[1]), m2: NaN, s2: num(a[2]), n2: num(a[3]), data: false };
    hyp = num(a[4], 0);
  }
  if (!(d.n1 >= 2 && d.n2 >= 2 && d.s1 > 0 && d.s2 > 0)) throw domain();
  const [d1, d2] = [d.n1 - 1, d.n2 - 1];
  const F = d.s1 ** 2 / d.s2 ** 2;
  const lower = fCdf(F, d1, d2);
  const upper = fTail(F, d1, d2);
  const p = hyp < 0 ? lower : hyp > 0 ? upper : 2 * Math.min(lower, upper);
  return {
    rows: [
      ["Title", "2-Sample F Test"],
      ["Alternate Hyp", alt("σ1", "σ2", hyp)],
      ["F", F],
      ["PVal", p],
      ["dfNumer", d1],
      ["dfDenom", d2],
      ["sx1", d.s1],
      ["sx2", d.s2],
      ...(data ? ([["x̄1", d.m1], ["x̄2", d.m2]] as StatRow[]) : []),
      ["n1", d.n1],
      ["n2", d.n2],
    ],
  };
}

// ─── χ² ─────────────────────────────────────────────────────────────────────

function chiGof(a: Arg[]): StatResult {
  const [obs, exp] = [list(a[0]), list(a[1])];
  const df = num(a[2]);
  if (obs.length !== exp.length) throw new Error("Error: Sizes do not match");
  if (exp.some((e) => !(e > 0)) || !(df >= 1) || !Number.isInteger(df)) throw domain();
  const comp = obs.map((o, i) => (o - exp[i]!) ** 2 / exp[i]!);
  const chi = sum(comp);
  return {
    rows: [
      ["Title", "χ² GOF"],
      ["χ²", chi],
      ["PVal", chiTail(chi, df)],
      ["df", df],
      ["CompList", comp],
    ],
  };
}

function chi2way(a: Arg[]): StatResult {
  const m = a[0];
  if (!isMatrix(m)) throw wrong();
  const r = m.length;
  const c = m[0]!.length;
  if (r < 2 || c < 2 || m.some((row) => row.length !== c)) throw new Error("Error: Dimension error");
  if (m.some((row) => row.some((v) => v < 0))) throw domain();
  const rowSum = m.map(sum);
  const colSum = m[0]!.map((_, j) => sum(m.map((row) => row[j]!)));
  const total = sum(rowSum);
  const expMat = m.map((_, i) => colSum.map((cs) => (rowSum[i]! * cs) / total));
  const compMat = m.map((row, i) => row.map((o, j) => (o - expMat[i]![j]!) ** 2 / expMat[i]![j]!));
  const chi = sum(compMat.map(sum));
  const df = (r - 1) * (c - 1);
  return {
    rows: [
      ["Title", "χ² 2-way"],
      ["χ²", chi],
      ["PVal", chiTail(chi, df)],
      ["df", df],
      ["ExpMat", expMat],
      ["CompMat", compMat],
    ],
  };
}

// ─── Regression t procedures ────────────────────────────────────────────────

/** y = a + b·x by least squares on frequency-weighted pairs, with the pieces the t procedures need. */
function linFit(xs: number[], ys: number[], f: Arg) {
  if (xs.length !== ys.length) throw new Error("Error: Sizes do not match");
  const w = frequencies(xs, f === undefined ? 1 : isList(f) ? f : num(f));
  const n = sum(w);
  if (n < 3) throw new Error("Error: Dimension error");
  const mx = sum(xs.map((x, i) => w[i]! * x)) / n;
  const my = sum(ys.map((y, i) => w[i]! * y)) / n;
  const sxx = sum(xs.map((x, i) => w[i]! * (x - mx) ** 2));
  const syy = sum(ys.map((y, i) => w[i]! * (y - my) ** 2));
  const sxy = sum(xs.map((x, i) => w[i]! * (x - mx) * (ys[i]! - my)));
  if (!(sxx > 0)) throw domain();
  const b = sxy / sxx;
  const a0 = my - b * mx;
  const resid = xs.map((x, i) => ys[i]! - (a0 + b * x));
  const sse = sum(resid.map((e, i) => w[i]! * e * e));
  const df = n - 2;
  const s = Math.sqrt(sse / df);
  const r = sxy / Math.sqrt(sxx * syy);
  return { a: a0, b, n, mx, sxx, s, df, r, resid, seSlope: s / Math.sqrt(sxx) };
}

const regRows = (fit: ReturnType<typeof linFit>): StatRow[] => [
  ["RegEqn", "a+b*x"],
  ["a", fit.a],
  ["b", fit.b],
  ["r²", fit.r * fit.r],
  ["r", fit.r],
  ["Resid", fit.resid],
];
const regEqnOf = (fit: { a: number; b: number }) => `${fit.a}+${fit.b}*x`;

function linRegTTest(a: Arg[]): StatResult {
  const fit = linFit(list(a[0]), list(a[1]), a[2]);
  const hyp = num(a[3], 0);
  const t = fit.b / fit.seSlope;
  return {
    rows: [
      ["Title", "Linear Reg t Test"],
      ["Alternate Hyp", `β & ρ ${hyp < 0 ? "<" : hyp > 0 ? ">" : "≠"} 0`],
      ["RegEqn", "a+b*x"],
      ["t", t],
      ["PVal", symmetricP(t, hyp, (v) => tCdf(v, fit.df))],
      ["df", fit.df],
      ["a", fit.a],
      ["b", fit.b],
      ["s", fit.s],
      ["SESlope", fit.seSlope],
      ["r²", fit.r * fit.r],
      ["r", fit.r],
      ["Resid", fit.resid],
    ],
    regEqn: regEqnOf(fit),
  };
}

/** LinRegtIntervals X,Y[,F[,0[,CLev]]] for the slope, or X,Y[,F[,1,Xval[,CLev]]] for a response at Xval. */
function linRegTIntervals(a: Arg[]): StatResult {
  const fit = linFit(list(a[0]), list(a[1]), a[2]);
  const kind = num(a[3], 0);
  if (kind === 0) {
    // The dialog always sends an X Value; for the slope it's ignored and the level follows it.
    const c = level(a[5] !== undefined ? a[5] : a[4]);
    const me = tInv((1 + c) / 2, fit.df) * fit.seSlope;
    return {
      rows: [
        ["Title", "Linear Reg t Intervals"],
        ...regRows(fit).slice(0, 3),
        ["CLower", fit.b - me],
        ["CUpper", fit.b + me],
        ["ME", me],
        ["df", fit.df],
        ["SESlope", fit.seSlope],
        ["s", fit.s],
        ...regRows(fit).slice(3),
      ],
      regEqn: regEqnOf(fit),
    };
  }
  if (kind !== 1) throw domain();
  const xv = num(a[4]);
  const c = level(a[5]);
  const yhat = fit.a + fit.b * xv;
  const tq = tInv((1 + c) / 2, fit.df);
  const se = fit.s * Math.sqrt(1 / fit.n + (xv - fit.mx) ** 2 / fit.sxx);
  const sePred = fit.s * Math.sqrt(1 + 1 / fit.n + (xv - fit.mx) ** 2 / fit.sxx);
  return {
    rows: [
      ["Title", "Linear Reg t Intervals"],
      ...regRows(fit).slice(0, 3),
      ["ŷ", yhat],
      ["CLower", yhat - tq * se],
      ["CUpper", yhat + tq * se],
      ["ME", tq * se],
      ["SE", se],
      ["LowerPred", yhat - tq * sePred],
      ["UpperPred", yhat + tq * sePred],
      ["MEPred", tq * sePred],
      ["SEPred", sePred],
      ["df", fit.df],
      ["s", fit.s],
      ...regRows(fit).slice(3),
    ],
    regEqn: regEqnOf(fit),
  };
}

// ─── Multiple regression ────────────────────────────────────────────────────

/** Solve A·x = v (A square) by Gaussian elimination with partial pivoting. */
function solve(A: number[][], v: number[]): number[] {
  const n = A.length;
  const m = A.map((row, i) => [...row, v[i]!]);
  for (let c = 0; c < n; c++) {
    let p = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(m[r]![c]!) > Math.abs(m[p]![c]!)) p = r;
    if (Math.abs(m[p]![c]!) < 1e-300) throw new Error("Error: Singular matrix");
    [m[c], m[p]] = [m[p]!, m[c]!];
    for (let r = 0; r < n; r++) {
      if (r === c) continue;
      const k = m[r]![c]! / m[c]![c]!;
      for (let j = c; j <= n; j++) m[r]![j]! -= k * m[c]![j]!;
    }
  }
  return m.map((row, i) => row[n]! / row[i]!);
}

/** The inverse of a square matrix, column by column. */
function inverse(A: number[][]): number[][] {
  const n = A.length;
  const cols = A.map((_, j) => solve(A, A.map((__, i) => (i === j ? 1 : 0))));
  return Array.from({ length: n }, (_, i) => cols.map((col) => col[i]!));
}

/** y = b0 + b1·x1 + … by least squares: the design matrix with its leading 1s, the fit and (XᵀX)⁻¹. */
function multFit(y: number[], xs: number[][]) {
  if (!xs.length || xs.some((x) => x.length !== y.length)) throw new Error("Error: Sizes do not match");
  const n = y.length;
  const k = xs.length;
  if (n <= k + 1) throw new Error("Error: Dimension error");
  const X = y.map((_, i) => [1, ...xs.map((x) => x[i]!)]);
  const XtX = X[0]!.map((_, a) => X[0]!.map((__, b) => sum(X.map((row) => row[a]! * row[b]!))));
  const Xty = X[0]!.map((_, a) => sum(X.map((row, i) => row[a]! * y[i]!)));
  const inv = inverse(XtX);
  const b = inv.map((row) => sum(row.map((v, j) => v * Xty[j]!)));
  const yhat = X.map((row) => sum(row.map((v, j) => v * b[j]!)));
  const resid = y.map((v, i) => v - yhat[i]!);
  const my = sum(y) / n;
  const sse = sum(resid.map((e) => e * e));
  const sst = sum(y.map((v) => (v - my) ** 2));
  const dfErr = n - k - 1;
  const s = Math.sqrt(sse / dfErr);
  return { X, b, yhat, resid, sse, sst, n, k, dfErr, s, inv, R2: 1 - sse / sst };
}

const multEqn = (k: number) => ["b0", ...Array.from({ length: k }, (_, i) => `b${i + 1}*x${i + 1}`)].join("+");
const multEqnOf = (b: number[]) => [String(b[0]), ...b.slice(1).map((v, i) => `${v}*x${i + 1}`)].join("+");

/** MultReg Y, X1[, X2 …]. */
function multReg(a: Arg[]): StatResult {
  const fit = multFit(list(a[0]), a.slice(1).filter((x) => x !== undefined).map(list));
  return {
    rows: [
      ["Title", "Multiple Linear Regression"],
      ["RegEqn", multEqn(fit.k)],
      ...fit.b.map((v, i): StatRow => [`b${i}`, v]),
      ["R²", fit.R2],
      ["ŷList", fit.yhat],
      ["Resid", fit.resid],
    ],
  };
}

/** MultRegTests Y, X1[, X2 …]: the overall F test and each coefficient's t test. */
function multRegTests(a: Arg[]): StatResult {
  const fit = multFit(list(a[0]), a.slice(1).filter((x) => x !== undefined).map(list));
  const dfReg = fit.k;
  const F = (fit.sst - fit.sse) / dfReg / (fit.sse / fit.dfErr);
  const se = fit.inv.map((row, i) => fit.s * Math.sqrt(row[i]!));
  const t = fit.b.map((v, i) => v / se[i]!);
  const lev = fit.X.map((row) => sum(row.map((v, i) => v * sum(row.map((w, j) => fit.inv[i]![j]! * w)))));
  const sResid = fit.resid.map((e, i) => e / (fit.s * Math.sqrt(1 - lev[i]!)));
  const p = fit.k + 1;
  const cook = fit.resid.map((e, i) => (e * e * lev[i]!) / (p * fit.s ** 2 * (1 - lev[i]!) ** 2));
  const dw = sum(fit.resid.slice(1).map((e, i) => (e - fit.resid[i]!) ** 2)) / fit.sse;
  return {
    rows: [
      ["Title", "Multiple Reg Tests"],
      ["RegEqn", multEqn(fit.k)],
      ["F", F],
      ["PVal", fTail(F, dfReg, fit.dfErr)],
      ["R²", fit.R2],
      ["AdjR²", 1 - ((1 - fit.R2) * (fit.n - 1)) / fit.dfErr],
      ["s", fit.s],
      ["DW", dw],
      ["dfReg", dfReg],
      ["SSReg", fit.sst - fit.sse],
      ["MSReg", (fit.sst - fit.sse) / dfReg],
      ["dfError", fit.dfErr],
      ["SSError", fit.sse],
      ["MSError", fit.sse / fit.dfErr],
      ["bList", fit.b],
      ["tList", t],
      ["PList", t.map((v) => 2 * tCdf(-Math.abs(v), fit.dfErr))],
      ["SEList", se],
      ["ŷList", fit.yhat],
      ["Resid", fit.resid],
      ["sResid", sResid],
      ["CookDist", cook],
      ["Leverage", lev],
    ],
  };
}

/** MultRegIntervals Y, X1[, X2 …], XValList[, CLevel]: intervals for the mean response and a prediction at XValList. */
function multRegIntervals(a: Arg[]): StatResult {
  const args = a.filter((x) => x !== undefined);
  const hasLevel = typeof args[args.length - 1] === "number";
  const c = hasLevel ? level(args.pop()) : 0.95;
  const xval = list(args.pop());
  const fit = multFit(list(args[0]), args.slice(1).map(list));
  if (xval.length !== fit.k) throw new Error("Error: Dimension error");
  const x0 = [1, ...xval];
  const yhat = sum(x0.map((v, i) => v * fit.b[i]!));
  const h = sum(x0.map((v, i) => v * sum(x0.map((w, j) => fit.inv[i]![j]! * w))));
  const tq = tInv((1 + c) / 2, fit.dfErr);
  const se = fit.s * Math.sqrt(h);
  const sePred = fit.s * Math.sqrt(1 + h);
  return {
    rows: [
      ["Title", "Multiple Reg Intervals"],
      ["RegEqn", multEqn(fit.k)],
      ["ŷ", yhat],
      ["dfError", fit.dfErr],
      ["CLower", yhat - tq * se],
      ["CUpper", yhat + tq * se],
      ["ME", tq * se],
      ["SE", se],
      ["LowerPred", yhat - tq * sePred],
      ["UpperPred", yhat + tq * sePred],
      ["MEPred", tq * sePred],
      ["SEPred", sePred],
      ["bList", fit.b],
      ["Resid", fit.resid],
    ],
  };
}

// ─── ANOVA ──────────────────────────────────────────────────────────────────

/**
 * ANOVA List1, List2[, …][, Flag]: one-way analysis of variance. With Flag 1
 * each list is {n, x̄, sx} for its group instead of the data.
 */
function anova(a: Arg[]): StatResult {
  const args = a.filter((x) => x !== undefined);
  const flag = typeof args[args.length - 1] === "number" ? (args.pop() as number) : 0;
  const groups = args.map(list).map((g) => {
    if (flag === 1) {
      if (g.length !== 3) throw new Error("Error: Dimension error");
      return { n: g[0]!, mean: g[1]!, sx: g[2]! };
    }
    const d = fromData(g, undefined);
    return { n: d.n, mean: d.mean, sx: d.sx };
  });
  if (groups.length < 2) throw new Error("Error: Dimension error");
  const N = sum(groups.map((g) => g.n));
  const grand = sum(groups.map((g) => g.n * g.mean)) / N;
  const ss = sum(groups.map((g) => g.n * (g.mean - grand) ** 2));
  const sse = sum(groups.map((g) => (g.n - 1) * g.sx ** 2));
  const df = groups.length - 1;
  const dfe = N - groups.length;
  if (!(dfe > 0)) throw new Error("Error: Dimension error");
  const ms = ss / df;
  const mse = sse / dfe;
  const F = ms / mse;
  const sp = Math.sqrt(mse);
  const tq = tInv(0.975, dfe);
  return {
    rows: [
      ["Title", "One-Way ANOVA"],
      ["F", F],
      ["PVal", fTail(F, df, dfe)],
      ["df", df],
      ["SS", ss],
      ["MS", ms],
      ["dfError", dfe],
      ["SSError", sse],
      ["MSError", mse],
      ["sp", sp],
      ["xbarlist", groups.map((g) => g.mean)],
      ["CLowerList", groups.map((g) => g.mean - (tq * sp) / Math.sqrt(g.n))],
      ["CUpperList", groups.map((g) => g.mean + (tq * sp) / Math.sqrt(g.n))],
    ],
  };
}

/**
 * ANOVA2way List1, List2[, …][, LevRow]: each list is a level of the column
 * factor. LevRow 1 is a randomised block design (each list's i-th value is
 * block i); LevRow > 1 splits each list into that many equal runs, one per
 * level of the row factor, and tests both factors and their interaction.
 */
function anova2way(a: Arg[]): StatResult {
  const args = a.filter((x) => x !== undefined);
  const levRow = typeof args[args.length - 1] === "number" ? (args.pop() as number) : 1;
  const cols = args.map(list);
  const c = cols.length;
  const len = cols[0]?.length ?? 0;
  if (c < 2 || cols.some((l) => l.length !== len)) throw new Error("Error: Dimension error");
  if (!(Number.isInteger(levRow) && levRow >= 1) || len % levRow) throw new Error("Error: Dimension error");
  const all = cols.flat();
  const N = all.length;
  const grand = sum(all) / N;
  const sst = sum(all.map((v) => (v - grand) ** 2));
  const colMeans = cols.map((l) => sum(l) / len);
  const ssCol = len * sum(colMeans.map((m) => (m - grand) ** 2));
  const ftest = (ss: number, df: number, mse: number, dfe: number) => {
    const ms = ss / df;
    const F = ms / mse;
    return { F, P: fTail(F, df, dfe), df, ss, ms };
  };
  const out = (prefix: string, t: ReturnType<typeof ftest>): StatRow[] => [
    [`F${prefix}`, t.F],
    [`PVal${prefix}`, t.P],
    [`df${prefix}`, t.df],
    [`SS${prefix}`, t.ss],
    [`MS${prefix}`, t.ms],
  ];
  if (levRow === 1) {
    const blocks = Array.from({ length: len }, (_, i) => sum(cols.map((l) => l[i]!)) / c);
    const ssBlock = c * sum(blocks.map((m) => (m - grand) ** 2));
    const sse = sst - ssCol - ssBlock;
    const dfe = (c - 1) * (len - 1);
    if (!(dfe > 0)) throw new Error("Error: Dimension error");
    const mse = sse / dfe;
    return {
      rows: [
        ["Title", "Two-Way ANOVA"],
        ...out("", ftest(ssCol, c - 1, mse, dfe)),
        ...out("Block", ftest(ssBlock, len - 1, mse, dfe)),
        ["dfError", dfe],
        ["SSError", sse],
        ["MSError", mse],
        ["s", Math.sqrt(mse)],
      ],
    };
  }
  const reps = len / levRow;
  if (reps < 2) throw new Error("Error: Dimension error");
  const cell = (r: number, j: number) => cols[j]!.slice(r * reps, (r + 1) * reps);
  const rowMeans = Array.from({ length: levRow }, (_, r) => sum(cols.flatMap((_, j) => cell(r, j))) / (c * reps));
  const ssRow = c * reps * sum(rowMeans.map((m) => (m - grand) ** 2));
  let sse = 0;
  let ssCells = 0;
  for (let r = 0; r < levRow; r++)
    for (let j = 0; j < c; j++) {
      const v = cell(r, j);
      const m = sum(v) / reps;
      sse += sum(v.map((x) => (x - m) ** 2));
      ssCells += reps * (m - grand) ** 2;
    }
  const ssInt = ssCells - ssCol - ssRow;
  const dfe = levRow * c * (reps - 1);
  const mse = sse / dfe;
  return {
    rows: [
      ["Title", "Two-Way ANOVA"],
      ...out("Col", ftest(ssCol, c - 1, mse, dfe)),
      ...out("Row", ftest(ssRow, levRow - 1, mse, dfe)),
      ...out("Interact", ftest(ssInt, (c - 1) * (levRow - 1), mse, dfe)),
      ["dfError", dfe],
      ["SSError", sse],
      ["MSError", mse],
      ["s", Math.sqrt(mse)],
    ],
  };
}

// ─── Iterative regressions ──────────────────────────────────────────────────

/**
 * Least squares for a model nonlinear in its parameters (Levenberg–Marquardt
 * with a numerical Jacobian), from a starting guess. Returns the parameters
 * and the sum of squared residuals.
 */
export function fitNonlinear(model: (p: number[], x: number) => number, p0: number[], xs: number[], ys: number[], iterations = 200) {
  const sse = (p: number[]) => sum(xs.map((x, i) => (ys[i]! - model(p, x)) ** 2));
  let p = [...p0];
  let cost = sse(p);
  let lambda = 1e-3;
  for (let it = 0; it < iterations; it++) {
    const r = xs.map((x, i) => ys[i]! - model(p, x));
    const J = xs.map((x) =>
      p.map((v, k) => {
        const h = 1e-7 * Math.max(1, Math.abs(v));
        const q = [...p];
        q[k] = v + h;
        const up = model(q, x);
        q[k] = v - h;
        return (up - model(q, x)) / (2 * h);
      }),
    );
    const JtJ = p.map((_, a) => p.map((__, b) => sum(J.map((row) => row[a]! * row[b]!))));
    const Jtr = p.map((_, a) => sum(J.map((row, i) => row[a]! * r[i]!)));
    let improved = false;
    for (let tries = 0; tries < 30; tries++) {
      const A = JtJ.map((row, i) => row.map((v, j) => (i === j ? v + lambda * (v || 1) : v)));
      let step: number[];
      try {
        step = solve(A, Jtr);
      } catch {
        lambda *= 10;
        continue;
      }
      const q = p.map((v, i) => v + step[i]!);
      const c = sse(q);
      if (Number.isFinite(c) && c < cost) {
        const done = cost - c <= 1e-15 * cost;
        p = q;
        cost = c;
        lambda = Math.max(lambda / 10, 1e-12);
        improved = !done;
        break;
      }
      lambda *= 10;
    }
    if (!improved) break;
  }
  return { p, sse: cost };
}

/**
 * SinReg X, Y[, Iterations[, Period]]: y = a·sin(b·x + c) + d. Each trial
 * frequency makes the model linear in the rest (A·sin bx + B·cos bx + d),
 * so the best of a scan over frequencies starts the iteration.
 */
function sinReg(a: Arg[]): StatResult {
  const [xs, ys] = [list(a[0]), list(a[1])];
  if (xs.length !== ys.length) throw new Error("Error: Sizes do not match");
  if (xs.length < 4) throw new Error("Error: Dimension error");
  const iterations = num(a[2], 64);
  const period = a[3] === undefined ? undefined : num(a[3]);
  const sorted = [...xs].sort((p, q) => p - q);
  const span = sorted[sorted.length - 1]! - sorted[0]!;
  if (!(span > 0)) throw domain();
  const linearAt = (b: number) => {
    const fit = multFit(ys, [xs.map((x) => Math.sin(b * x)), xs.map((x) => Math.cos(b * x))]);
    return { b, A: fit.b[1]!, B: fit.b[2]!, d: fit.b[0]!, sse: fit.sse };
  };
  let best: ReturnType<typeof linearAt> | undefined;
  const trial = (b: number) => {
    try {
      const t = linearAt(b);
      if (!best || t.sse < best.sse) best = t;
    } catch {
      // A frequency that aliases every x to the same phase.
    }
  };
  if (period !== undefined) {
    if (!(period > 0)) throw domain();
    trial((2 * Math.PI) / period);
  } else {
    // From one cycle over the whole span up to the Nyquist limit of the spacing.
    const gaps = sorted.slice(1).map((v, i) => v - sorted[i]!).filter((g) => g > 0);
    const minGap = Math.min(...gaps);
    const lo = (2 * Math.PI) / (2 * span);
    const hi = Math.PI / minGap;
    const steps = 2000;
    for (let i = 0; i <= steps; i++) trial(lo * (hi / lo) ** (i / steps));
  }
  if (!best) throw domain();
  const amp = Math.hypot(best.A, best.B);
  const start = [amp, best.b, Math.atan2(best.B, best.A), best.d];
  const model = (p: number[], x: number) => p[0]! * Math.sin(p[1]! * x + p[2]!) + p[3]!;
  let { p } = fitNonlinear(model, start, xs, ys, Math.max(1, iterations) * 4);
  // A positive amplitude and frequency, with the phase in (−π, π].
  if (p[1]! < 0) p = [-p[0]!, -p[1]!, -p[2]!, p[3]!];
  if (p[0]! < 0) p = [-p[0]!, p[1]!, p[2]! + Math.PI, p[3]!];
  p[2] = p[2]! - 2 * Math.PI * Math.ceil((p[2]! - Math.PI) / (2 * Math.PI));
  const [A, B, C, D] = p as [number, number, number, number];
  return {
    rows: [
      ["Title", "Sinusoidal Regression"],
      ["RegEqn", "a*sin(b*x+c)+d"],
      ["a", A],
      ["b", B],
      ["c", C],
      ["d", D],
      ["Resid", xs.map((x, i) => ys[i]! - model(p, x))],
    ],
    regEqn: `${A}*sin(${B}*x+${C})+${D}`,
  };
}

/**
 * Logistic X, Y[, Iterations[, Freq]]: y = c/(1 + a·e^(−b·x)), and with
 * LogisticD + d. Started from the linearised fit ln(c/(y−d) − 1) = ln a − b·x
 * at a few trial ceilings c.
 */
function logistic(a: Arg[], withD: boolean): StatResult {
  const [x0, y0] = [list(a[0]), list(a[1])];
  if (x0.length !== y0.length) throw new Error("Error: Sizes do not match");
  const iterations = num(a[2], 64);
  const f = frequencies(x0, a[3] === undefined ? 1 : isList(a[3]) ? a[3] : num(a[3]));
  const xs: number[] = [];
  const ys: number[] = [];
  x0.forEach((x, i) => {
    for (let k = 0; k < f[i]!; k++) {
      xs.push(x);
      ys.push(y0[i]!);
    }
  });
  if (xs.length < (withD ? 4 : 3)) throw new Error("Error: Dimension error");
  const model = withD
    ? (p: number[], x: number) => p[2]! / (1 + p[0]! * Math.exp(-p[1]! * x)) + p[3]!
    : (p: number[], x: number) => p[2]! / (1 + p[0]! * Math.exp(-p[1]! * x));
  const lo = Math.min(...ys);
  const hi = Math.max(...ys);
  const range = hi - lo || Math.abs(hi) || 1;
  const starts: number[][] = [];
  for (const d of withD ? [lo - 0.05 * range, lo - 0.5 * range, 0] : [0]) {
    for (const k of [1.01, 1.1, 1.5, 2, 4]) {
      const c = (hi - d) * k;
      const pts = xs.map((x, i) => [x, Math.log(c / (ys[i]! - d) - 1)] as const).filter((q) => Number.isFinite(q[1]));
      if (pts.length < 2) continue;
      const fit = multFit(
        pts.map((q) => q[1]),
        [pts.map((q) => q[0])],
      );
      starts.push(withD ? [Math.exp(fit.b[0]!), -fit.b[1]!, c, d] : [Math.exp(fit.b[0]!), -fit.b[1]!, c]);
    }
  }
  if (!starts.length) throw domain();
  let best: { p: number[]; sse: number } | undefined;
  for (const s of starts) {
    try {
      const r = fitNonlinear(model, s, xs, ys, Math.max(1, iterations) * 4);
      if (!best || r.sse < best.sse) best = r;
    } catch {
      // A start the iteration can't leave.
    }
  }
  if (!best) throw domain();
  const p = best.p;
  const names = withD ? ["a", "b", "c", "d"] : ["a", "b", "c"];
  return {
    rows: [
      ["Title", withD ? "Logistic Regression (d≠0)" : "Logistic Regression (d=0)"],
      ["RegEqn", withD ? "c/(1+a*e^(-b*x))+d" : "c/(1+a*e^(-b*x))"],
      ...names.map((n, i): StatRow => [n, p[i]!]),
      ["Resid", x0.map((x, i) => y0[i]! - model(p, x))],
    ],
    regEqn: `${p[2]}/(1+${p[0]}*ℯ^(-${p[1]}*x))${withD ? `+${p[3]}` : ""}`,
  };
}

// ─── corrMat ────────────────────────────────────────────────────────────────

/** corrMat(List1, List2[, …]): the correlation of each pair of lists. */
export function corrMat(lists: number[][]): number[][] {
  const n = lists[0]?.length ?? 0;
  if (lists.length < 1 || lists.some((l) => l.length !== n) || n < 2) throw new Error("Error: Dimension error");
  const mean = lists.map((l) => sum(l) / n);
  const dev = lists.map((l, i) => l.map((v) => v - mean[i]!));
  return dev.map((p) => dev.map((q) => sum(p.map((v, k) => v * q[k]!)) / Math.sqrt(sum(p.map((v) => v * v)) * sum(q.map((v) => v * v)))));
}

/** Run one of TEST_COMMANDS on its evaluated arguments. */
export function statProcedure(name: string, a: Arg[]): StatResult {
  switch (name) {
    case "zInterval_2Samp":
      return zInterval2(a);
    case "tInterval_2Samp":
      return tInterval2(a);
    case "zInterval_2Prop":
      return zInterval2Prop(a);
    case "LinRegtIntervals":
      return linRegTIntervals(a);
    case "MultRegIntervals":
      return multRegIntervals(a);
    case "zTest_2Samp":
      return zTest2(a);
    case "tTest_2Samp":
      return tTest2(a);
    case "zTest_2Prop":
      return zTest2Prop(a);
    case "χ²GOF":
      return chiGof(a);
    case "χ²2way":
      return chi2way(a);
    case "FTest_2Samp":
      return fTest2(a);
    case "LinRegtTest":
      return linRegTTest(a);
    case "MultRegTests":
      return multRegTests(a);
    case "ANOVA":
      return anova(a);
    case "ANOVA2way":
      return anova2way(a);
    case "SinReg":
      return sinReg(a);
    case "Logistic":
      return logistic(a, false);
    case "LogisticD":
      return logistic(a, true);
    case "MultReg":
      return multReg(a);
  }
  throw new Error("Error: Not available here yet");
}
