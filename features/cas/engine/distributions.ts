// SPDX-License-Identifier: GPL-3.0-or-later
/**
 * The normal, t, χ² and F distributions in plain numbers, for the statistics
 * procedures that need several p-values at once (ANOVA, the 2-sample tests,
 * regression tests). Built on the regularised incomplete gamma and beta
 * functions, worked by series and continued fractions to about 15 digits.
 */

const EPS = 1e-16;
const TINY = 1e-300;

/** ln Γ(x) for x > 0 (Lanczos, g = 7). */
export function lnGamma(x: number): number {
  const c = [
    0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313, -176.61502916214059, 12.507343278686905,
    -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7,
  ];
  if (x < 0.5) return Math.log(Math.PI / Math.abs(Math.sin(Math.PI * x))) - lnGamma(1 - x);
  x -= 1;
  let a = c[0]!;
  const t = x + 7.5;
  for (let i = 1; i < 9; i++) a += c[i]! / (x + i);
  return 0.5 * Math.log(2 * Math.PI) + (x + 0.5) * Math.log(t) - t + Math.log(a);
}

/** The regularised upper incomplete gamma function Q(a, x) = Γ(a, x)/Γ(a). */
export function gammaQ(a: number, x: number): number {
  if (x <= 0) return 1;
  if (!Number.isFinite(x)) return 0;
  const front = Math.exp(-x + a * Math.log(x) - lnGamma(a));
  if (x < a + 1) {
    // Series for P, then Q = 1 − P.
    let sum = 1 / a;
    let term = sum;
    for (let n = 1; n < 1000; n++) {
      term *= x / (a + n);
      sum += term;
      if (Math.abs(term) < Math.abs(sum) * EPS) break;
    }
    return 1 - sum * front;
  }
  // Continued fraction for Q (modified Lentz).
  let b = x + 1 - a;
  let c = 1 / TINY;
  let d = 1 / b;
  let h = d;
  for (let i = 1; i < 1000; i++) {
    const an = -i * (i - a);
    b += 2;
    d = an * d + b;
    if (Math.abs(d) < TINY) d = TINY;
    c = b + an / c;
    if (Math.abs(c) < TINY) c = TINY;
    d = 1 / d;
    const del = d * c;
    h *= del;
    if (Math.abs(del - 1) < EPS) break;
  }
  return front * h;
}

export const gammaP = (a: number, x: number) => 1 - gammaQ(a, x);

/** The continued fraction in the incomplete beta function. */
function betaCf(a: number, b: number, x: number): number {
  let c = 1;
  let d = 1 - ((a + b) * x) / (a + 1);
  if (Math.abs(d) < TINY) d = TINY;
  d = 1 / d;
  let h = d;
  for (let m = 1; m < 1000; m++) {
    const m2 = 2 * m;
    let aa = (m * (b - m) * x) / ((a + m2 - 1) * (a + m2));
    d = 1 + aa * d;
    if (Math.abs(d) < TINY) d = TINY;
    c = 1 + aa / c;
    if (Math.abs(c) < TINY) c = TINY;
    d = 1 / d;
    h *= d * c;
    aa = (-(a + m) * (a + b + m) * x) / ((a + m2) * (a + m2 + 1));
    d = 1 + aa * d;
    if (Math.abs(d) < TINY) d = TINY;
    c = 1 + aa / c;
    if (Math.abs(c) < TINY) c = TINY;
    d = 1 / d;
    const del = d * c;
    h *= del;
    if (Math.abs(del - 1) < EPS) break;
  }
  return h;
}

/** The regularised incomplete beta function I_x(a, b). */
export function betaI(a: number, b: number, x: number): number {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  const front = Math.exp(lnGamma(a + b) - lnGamma(a) - lnGamma(b) + a * Math.log(x) + b * Math.log(1 - x));
  return x < (a + 1) / (a + b + 2) ? (front * betaCf(a, b, x)) / a : 1 - (front * betaCf(b, a, 1 - x)) / b;
}

/** P(Z ≤ z) for the standard normal. */
export function normCdf(z: number): number {
  if (Number.isNaN(z)) return NaN;
  // erfc(t) = Q(½, t²) for t ≥ 0.
  const q = 0.5 * gammaQ(0.5, (z * z) / 2);
  return z < 0 ? q : 1 - q;
}

/** P(T ≤ t) on df degrees of freedom. */
export function tCdf(t: number, df: number): number {
  if (!Number.isFinite(t)) return t > 0 ? 1 : t < 0 ? 0 : NaN;
  const tail = 0.5 * betaI(df / 2, 0.5, df / (df + t * t));
  return t < 0 ? tail : 1 - tail;
}

/** P(X ≤ x) for χ² on df degrees of freedom. */
export const chiCdf = (x: number, df: number) => (x <= 0 ? 0 : gammaP(df / 2, x / 2));
/** P(X > x) for χ², kept accurate far into the tail. */
export const chiTail = (x: number, df: number) => (x <= 0 ? 1 : gammaQ(df / 2, x / 2));

/** P(X ≤ x) for F on (d1, d2) degrees of freedom. */
export const fCdf = (x: number, d1: number, d2: number) => (x <= 0 ? 0 : betaI(d1 / 2, d2 / 2, (d1 * x) / (d1 * x + d2)));
/** P(X > x) for F. */
export const fTail = (x: number, d1: number, d2: number) => (x <= 0 ? 1 : betaI(d2 / 2, d1 / 2, d2 / (d2 + d1 * x)));

/** The x with cdf(x) = p, for an increasing cdf, by bracketing then bisection. */
function invert(cdf: (x: number) => number, p: number): number {
  if (!(p > 0 && p < 1)) return p === 0 ? -Infinity : p === 1 ? Infinity : NaN;
  let lo = -1;
  let hi = 1;
  while (cdf(lo) > p) lo *= 2;
  while (cdf(hi) < p) hi *= 2;
  for (let i = 0; i < 200; i++) {
    const mid = (lo + hi) / 2;
    if (cdf(mid) < p) lo = mid;
    else hi = mid;
    if (hi - lo <= Math.abs(mid) * 1e-15) break;
  }
  return (lo + hi) / 2;
}

export const normInv = (p: number) => invert(normCdf, p);
export const tInv = (p: number, df: number) => invert((t) => tCdf(t, df), p);

/** The p-value for a statistic with a symmetric distribution, by the alternative (0 ≠, −1 <, 1 >). */
export function symmetricP(stat: number, hyp: number, cdf: (x: number) => number): number {
  if (hyp < 0) return cdf(stat);
  if (hyp > 0) return cdf(-stat);
  return 2 * cdf(-Math.abs(stat));
}
