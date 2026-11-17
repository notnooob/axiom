// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 VCE Hub. Part of the /cas calculator: https://github.com/vcehub/cas
/**
 * One- and two-variable statistics and the regressions, worked in plain
 * numbers with the handheld's definitions: quartiles are medians of the
 * lower and upper halves (the median itself left out when n is odd), sx is
 * the sample and σx the population standard deviation, and exponential,
 * power and logarithmic fits are least squares on the transformed data,
 * with r for that transformed fit.
 */
export type StatRow = [label: string, value: number | string | number[]];
export type StatResult = { rows: StatRow[]; regEqn?: string };

/**
 * The name a row of results is stored under, as stat.<name>: the label, or
 * its part before ":=" (sx for "sx := sₙ₋₁x"). The title and the
 * hypothesis line aren't stored.
 */
export function memberName(label: string): string | null {
  const name = label.split(" := ")[0]!;
  return name === "Title" || /\s/.test(name) ? null : name;
}

export const STAT_COMMANDS = new Set([
  "OneVar",
  "TwoVar",
  "LinRegMx",
  "LinRegBx",
  "QuadReg",
  "CubicReg",
  "QuartReg",
  "ExpReg",
  "PowerReg",
  "LnReg",
  "zInterval_1Prop",
  "zInterval",
  "zTest",
  "tInterval",
  "tTest",
  "zTest_1Prop",
  "MedMed",
]);

const sum = (v: number[]) => v.reduce((s, x) => s + x, 0);

function median(sorted: number[]): number {
  const n = sorted.length;
  if (!n) return NaN;
  return n % 2 ? sorted[(n - 1) / 2]! : (sorted[n / 2 - 1]! + sorted[n / 2]!) / 2;
}

function fiveNumbers(xs: number[]) {
  const s = [...xs].sort((a, b) => a - b);
  const n = s.length;
  const lower = s.slice(0, Math.floor(n / 2));
  const upper = s.slice(Math.ceil(n / 2));
  return {
    min: s[0]!,
    q1: n > 1 ? median(lower) : s[0]!,
    med: median(s),
    q3: n > 1 ? median(upper) : s[0]!,
    max: s[n - 1]!,
  };
}

/**
 * Each value's frequency. Two ways the data can be short: a frequency list
 * of another length (OneVar {0,1,2,3,4},{3,7,10,6}) is a size error, and no
 * data at all (OneVar {}) is a Dimension Error.
 */
export function frequencies(xs: number[], freq: number[] | number): number[] {
  if (Array.isArray(freq) && freq.length !== xs.length) throw new Error("Error: Sizes do not match");
  if (!xs.length) throw new Error("Error: Dimension Error");
  return xs.map((_, i) => (Array.isArray(freq) ? freq[i]! : freq));
}

/** Repeat each value by its frequency (whole numbers, as the handheld requires). */
function expand(xs: number[], freq: number[] | number): number[] {
  const f = frequencies(xs, freq);
  const out: number[] = [];
  xs.forEach((x, i) => {
    for (let k = 0; k < f[i]!; k++) out.push(x);
  });
  if (!out.length) throw new Error("Error: Dimension Error");
  return out;
}

function spread(xs: number[]) {
  const n = xs.length;
  const mean = sum(xs) / n;
  const ss = sum(xs.map((x) => (x - mean) ** 2));
  return {
    n,
    mean,
    sum: sum(xs),
    sum2: sum(xs.map((x) => x * x)),
    ss,
    sx: n > 1 ? Math.sqrt(ss / (n - 1)) : NaN,
    σx: Math.sqrt(ss / n),
  };
}

export function oneVar(xs: number[], freq: number[] | number = 1): StatResult {
  const data = expand(xs, freq);
  const s = spread(data);
  const f = fiveNumbers(data);
  return {
    rows: [
      ["Title", "One-Variable Statistics"],
      ["x̄", s.mean],
      ["Σx", s.sum],
      ["Σx²", s.sum2],
      ["sx := sₙ₋₁x", s.sx],
      ["σx := σₙx", s.σx],
      ["n", s.n],
      ["MinX", f.min],
      ["Q₁X", f.q1],
      ["MedianX", f.med],
      ["Q₃X", f.q3],
      ["MaxX", f.max],
      ["SSX := Σ(x-x̄)²", s.ss],
    ],
  };
}

function pearson(xs: number[], ys: number[]): number {
  const mx = sum(xs) / xs.length;
  const my = sum(ys) / ys.length;
  const sxy = sum(xs.map((x, i) => (x - mx) * (ys[i]! - my)));
  const sxx = sum(xs.map((x) => (x - mx) ** 2));
  const syy = sum(ys.map((y) => (y - my) ** 2));
  return sxy / Math.sqrt(sxx * syy);
}

/** Pairs repeated by frequency, checking the lists match. */
function pairs(xs: number[], ys: number[], freq: number[] | number) {
  if (xs.length !== ys.length) throw new Error("Error: Sizes do not match");
  const idx = expand(
    xs.map((_, i) => i),
    freq,
  );
  return { x: idx.map((i) => xs[i]!), y: idx.map((i) => ys[i]!) };
}

export function twoVar(xs: number[], ys: number[], freq: number[] | number = 1): StatResult {
  const { x, y } = pairs(xs, ys, freq);
  const a = spread(x);
  const b = spread(y);
  const fx = fiveNumbers(x);
  const fy = fiveNumbers(y);
  return {
    rows: [
      ["Title", "Two-Variable Statistics"],
      ["x̄", a.mean],
      ["Σx", a.sum],
      ["Σx²", a.sum2],
      ["sx := sₙ₋₁x", a.sx],
      ["σx := σₙx", a.σx],
      ["n", a.n],
      ["ȳ", b.mean],
      ["Σy", b.sum],
      ["Σy²", b.sum2],
      ["sy := sₙ₋₁y", b.sx],
      ["σy := σₙy", b.σx],
      ["Σxy", sum(x.map((v, i) => v * y[i]!))],
      ["r", pearson(x, y)],
      ["MinX", fx.min],
      ["Q₁X", fx.q1],
      ["MedianX", fx.med],
      ["Q₃X", fx.q3],
      ["MaxX", fx.max],
      ["MinY", fy.min],
      ["Q₁Y", fy.q1],
      ["MedianY", fy.med],
      ["Q₃Y", fy.q3],
      ["MaxY", fy.max],
      ["SSX := Σ(x-x̄)²", a.ss],
      ["SSY := Σ(y-ȳ)²", b.ss],
    ],
  };
}

/** Least squares y = c0 + c1·x. */
function line(x: number[], y: number[]) {
  const mx = sum(x) / x.length;
  const my = sum(y) / y.length;
  const slope = sum(x.map((v, i) => (v - mx) * (y[i]! - my))) / sum(x.map((v) => (v - mx) ** 2));
  return { slope, intercept: my - slope * mx, r: pearson(x, y) };
}

/** Solve a small linear system by Gaussian elimination. */
function solve3(m: number[][], v: number[]): number[] {
  const a = m.map((row, i) => [...row, v[i]!]);
  const n = a.length;
  for (let c = 0; c < n; c++) {
    let p = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(a[r]![c]!) > Math.abs(a[p]![c]!)) p = r;
    [a[c], a[p]] = [a[p]!, a[c]!];
    for (let r = 0; r < n; r++) {
      if (r === c) continue;
      const k = a[r]![c]! / a[c]![c]!;
      for (let j = c; j <= n; j++) a[r]![j]! -= k * a[c]![j]!;
    }
  }
  return a.map((row, i) => row[n]! / row[i]!);
}

const num = (v: number) => (Number.isFinite(v) ? String(v) : "undef");

export function regression(kind: string, xs: number[], ys: number[], freq: number[] | number = 1): StatResult {
  const { x, y } = pairs(xs, ys, freq);
  const resid = (f: (v: number) => number) => xs.map((v, i) => ys[i]! - f(v));
  switch (kind) {
    case "LinRegMx":
    case "LinRegBx": {
      const { slope, intercept, r } = line(x, y);
      const mx = kind === "LinRegMx";
      return {
        rows: [
          ["Title", mx ? "Linear Regression (mx+b)" : "Linear Regression (a+bx)"],
          ["RegEqn", mx ? "m*x+b" : "a+b*x"],
          [mx ? "m" : "a", mx ? slope : intercept],
          ["b", mx ? intercept : slope],
          ["r²", r * r],
          ["r", r],
          ["Resid", resid((v) => intercept + slope * v)],
        ],
        regEqn: mx ? `${num(slope)}*x+${num(intercept)}` : `${num(intercept)}+${num(slope)}*x`,
      };
    }
    case "QuadReg": {
      const S = (p: number) => sum(x.map((v) => v ** p));
      const T = (p: number) => sum(x.map((v, i) => v ** p * y[i]!));
      const [a, b, c] = solve3(
        [
          [S(4), S(3), S(2)],
          [S(3), S(2), S(1)],
          [S(2), S(1), x.length],
        ],
        [T(2), T(1), T(0)],
      ) as [number, number, number];
      const fit = (v: number) => a * v * v + b * v + c;
      const my = sum(y) / y.length;
      const R2 = 1 - sum(y.map((v, i) => (v - fit(x[i]!)) ** 2)) / sum(y.map((v) => (v - my) ** 2));
      return {
        rows: [
          ["Title", "Quadratic Regression"],
          ["RegEqn", "a*x^2+b*x+c"],
          ["a", a],
          ["b", b],
          ["c", c],
          ["R²", R2],
          ["Resid", resid(fit)],
        ],
        regEqn: `${num(a)}*x^2+${num(b)}*x+${num(c)}`,
      };
    }
    case "MedMed": {
      // Sorted by x and split in three (the outer groups take the extra point
      // when n is 3k+2, the middle one when 3k+1); a line through the outer
      // groups' median points, moved a third of the way toward the middle one's.
      const pts = x.map((v, i) => [v, y[i]!] as const).sort((p, q) => p[0] - q[0]);
      const k = Math.floor(pts.length / 3);
      if (k < 1) throw new Error("Error: Dimension error");
      const outer = pts.length % 3 === 2 ? k + 1 : k;
      const groups = [pts.slice(0, outer), pts.slice(outer, pts.length - outer), pts.slice(pts.length - outer)];
      const med = (v: number[]) => median([...v].sort((p, q) => p - q));
      const [p1, p2, p3] = groups.map((g) => [med(g.map((p) => p[0])), med(g.map((p) => p[1]))] as const) as [readonly [number, number], readonly [number, number], readonly [number, number]];
      const m = (p3[1] - p1[1]) / (p3[0] - p1[0]);
      const b = (p1[1] + p2[1] + p3[1] - m * (p1[0] + p2[0] + p3[0])) / 3;
      return {
        rows: [
          ["Title", "Median-Median Line"],
          ["RegEqn", "m*x+b"],
          ["m", m],
          ["b", b],
          ["Resid", resid((v) => m * v + b)],
        ],
        regEqn: `${num(m)}*x+${num(b)}`,
      };
    }
    case "CubicReg":
    case "QuartReg": {
      // Least squares through the normal equations, as QuadReg, for x³ (or x⁴) down to x⁰.
      const deg = kind === "CubicReg" ? 3 : 4;
      if (x.length < deg + 1) throw new Error("Error: Dimension error");
      const powers = Array.from({ length: deg + 1 }, (_, i) => deg - i);
      const S = (p: number) => sum(x.map((v) => v ** p));
      const T = (p: number) => sum(x.map((v, i) => v ** p * y[i]!));
      const coef = solve3(powers.map((i) => powers.map((j) => S(i + j))), powers.map(T));
      const fit = (v: number) => coef.reduce((s, c, i) => s + c * v ** powers[i]!, 0);
      const my = sum(y) / y.length;
      const R2 = 1 - sum(y.map((v, i) => (v - fit(x[i]!)) ** 2)) / sum(y.map((v) => (v - my) ** 2));
      const names = ["a", "b", "c", "d", "e"].slice(0, deg + 1);
      const term = (n: string, p: number) => (p === 0 ? n : p === 1 ? `${n}*x` : `${n}*x^${p}`);
      return {
        rows: [
          ["Title", deg === 3 ? "Cubic Regression" : "Quartic Regression"],
          ["RegEqn", names.map((n, i) => term(n, powers[i]!)).join("+")],
          ...names.map((n, i): StatRow => [n, coef[i]!]),
          ["R²", R2],
          ["Resid", resid(fit)],
        ],
        regEqn: coef.map((c, i) => term(num(c), powers[i]!)).join("+"),
      };
    }
    case "ExpReg": {
      if (y.some((v) => v <= 0)) throw new Error("Error: Domain error");
      const { slope, intercept, r } = line(x, y.map(Math.log));
      const a = Math.exp(intercept);
      const b = Math.exp(slope);
      return {
        rows: [
          ["Title", "Exponential Regression"],
          ["RegEqn", "a*b^x"],
          ["a", a],
          ["b", b],
          ["r²", r * r],
          ["r", r],
          ["Resid", resid((v) => a * b ** v)],
        ],
        regEqn: `${num(a)}*(${num(b)})^x`,
      };
    }
    case "PowerReg": {
      if (y.some((v) => v <= 0) || x.some((v) => v <= 0)) throw new Error("Error: Domain error");
      const { slope, intercept, r } = line(x.map(Math.log), y.map(Math.log));
      const a = Math.exp(intercept);
      return {
        rows: [
          ["Title", "Power Regression"],
          ["RegEqn", "a*x^b"],
          ["a", a],
          ["b", slope],
          ["r²", r * r],
          ["r", r],
          ["Resid", resid((v) => a * v ** slope)],
        ],
        regEqn: `${num(a)}*x^(${num(slope)})`,
      };
    }
    case "LnReg": {
      if (x.some((v) => v <= 0)) throw new Error("Error: Domain error");
      const { slope, intercept, r } = line(x.map(Math.log), y);
      return {
        rows: [
          ["Title", "Logarithmic Regression"],
          ["RegEqn", "a+b*ln(x)"],
          ["a", intercept],
          ["b", slope],
          ["r²", r * r],
          ["r", r],
          ["Resid", resid((v) => intercept + slope * Math.log(v))],
        ],
        regEqn: `${num(intercept)}+${num(slope)}*ln(x)`,
      };
    }
  }
  throw new Error("Error: Not available here yet");
}

/**
 * 1-Prop z Interval: p̂ = x/n and p̂ ± z*·√(p̂(1−p̂)/n), with z* the normal
 * quantile for the confidence level (worked out by the engine and passed in).
 */
export function propInterval(x: number, n: number, level: number, zStar: number): StatResult {
  if (!(n > 0) || x < 0 || x > n || !(level > 0 && level < 1)) throw new Error("Error: Domain error");
  const p = x / n;
  const me = zStar * Math.sqrt((p * (1 - p)) / n);
  return {
    rows: [
      ["Title", "1-Prop z Interval"],
      ["CLower", p - me],
      ["CUpper", p + me],
      ["p̂", p],
      ["ME", me],
      ["n", n],
    ],
  };
}

/**
 * z Interval for a mean with σ known: x̄ ± z*·σ/√n, z* the normal quantile
 * for the confidence level (passed in). From data, x̄ and n are the list's
 * and sx is shown too.
 */
export function meanInterval(sigma: number, mean: number, n: number, level: number, zStar: number, sx?: number): StatResult {
  if (!(sigma > 0) || !(n > 0) || !(level > 0 && level < 1)) throw new Error("Error: Domain error");
  const me = (zStar * sigma) / Math.sqrt(n);
  return {
    rows: [
      ["Title", "z Interval"],
      ["CLower", mean - me],
      ["CUpper", mean + me],
      ["x̄", mean],
      ["ME", me],
      ...(sx !== undefined ? ([["sx := sₙ₋₁x", sx]] as StatRow[]) : []),
      ["n", n],
      ["σ", sigma],
    ],
  };
}

/**
 * t Interval for a mean, σ unknown: x̄ ± t*·sx/√n on n−1 degrees of freedom,
 * t* the t quantile for the confidence level (passed in).
 */
export function tMeanInterval(mean: number, sx: number, n: number, level: number, tStar: number): StatResult {
  if (!(sx > 0) || !(n >= 2) || !(level > 0 && level < 1)) throw new Error("Error: Domain error");
  const me = (tStar * sx) / Math.sqrt(n);
  return {
    rows: [
      ["Title", "t Interval"],
      ["CLower", mean - me],
      ["CUpper", mean + me],
      ["x̄", mean],
      ["ME", me],
      ["df", n - 1],
      ["sx := sₙ₋₁x", sx],
      ["n", n],
    ],
  };
}

/** The t statistic for a mean. */
export const tStatistic = (mu0: number, mean: number, sx: number, n: number) => (mean - mu0) / (sx / Math.sqrt(n));

/** A p-value from the cdf at the statistic and at its size, for the alternative hyp (0 ≠, −1 <, 1 >). */
const pValue = (hyp: number, cdf: { atZ: number; atAbsZ: number }) => (hyp < 0 ? cdf.atZ : hyp > 0 ? 1 - cdf.atZ : 2 * (1 - cdf.atAbsZ));

/** t Test for a mean, σ unknown; cdf: the t distribution's cdf (n−1 df) at t and at |t|, from the engine. */
export function tMeanTest(mu0: number, mean: number, sx: number, n: number, hyp: number, cdf: { atZ: number; atAbsZ: number }): StatResult {
  if (!(sx > 0) || !(n >= 2)) throw new Error("Error: Domain error");
  return {
    rows: [
      ["Title", "t Test"],
      ["Alternate Hyp", hyp < 0 ? "μ < μ0" : hyp > 0 ? "μ > μ0" : "μ ≠ μ0"],
      ["t", tStatistic(mu0, mean, sx, n)],
      ["PVal", pValue(hyp, cdf)],
      ["df", n - 1],
      ["x̄", mean],
      ["sx := sₙ₋₁x", sx],
      ["n", n],
    ],
  };
}

/** The z statistic for a proportion: (p̂ − p0)/√(p0(1−p0)/n). */
export const propStatistic = (p0: number, x: number, n: number) => (x / n - p0) / Math.sqrt((p0 * (1 - p0)) / n);

/** 1-Prop z Test; phi: the standard normal cdf at z and at |z|, from the engine. */
export function propTest(p0: number, x: number, n: number, hyp: number, phi: { atZ: number; atAbsZ: number }): StatResult {
  if (!(p0 > 0 && p0 < 1) || !(n > 0) || x < 0 || x > n) throw new Error("Error: Domain error");
  return {
    rows: [
      ["Title", "1-Prop z Test"],
      ["Alternate Hyp", hyp < 0 ? "prop < p0" : hyp > 0 ? "prop > p0" : "prop ≠ p0"],
      ["z", propStatistic(p0, x, n)],
      ["PVal", pValue(hyp, phi)],
      ["p̂", x / n],
      ["n", n],
    ],
  };
}

/** The z statistic for a mean with σ known. */
export const zStatistic = (mu0: number, sigma: number, mean: number, n: number) => (mean - mu0) / (sigma / Math.sqrt(n));

/**
 * z Test for a mean with σ known. hyp is the alternative: 0 for μ≠μ0, −1
 * for μ<μ0, 1 for μ>μ0. phi(z) and phi(|z|), the standard normal cdf at the
 * statistic and at its size, come from the engine.
 */
export function meanTest(mu0: number, sigma: number, mean: number, n: number, hyp: number, phi: { atZ: number; atAbsZ: number }, sx?: number): StatResult {
  if (!(sigma > 0) || !(n > 0)) throw new Error("Error: Domain error");
  const z = zStatistic(mu0, sigma, mean, n);
  const p = hyp < 0 ? phi.atZ : hyp > 0 ? 1 - phi.atZ : 2 * (1 - phi.atAbsZ);
  const alt = hyp < 0 ? "μ < μ0" : hyp > 0 ? "μ > μ0" : "μ ≠ μ0";
  return {
    rows: [
      ["Title", "z Test"],
      ["Alternate Hyp", alt],
      ["z", z],
      ["PVal", p],
      ["x̄", mean],
      ...(sx !== undefined ? ([["sx := sₙ₋₁x", sx]] as StatRow[]) : []),
      ["n", n],
    ],
  };
}
