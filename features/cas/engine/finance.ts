// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 VCE Hub. Part of the /cas calculator: https://github.com/vcehub/cas
import { amortize, effectiveRate, nominalRate, roundDecimal, solveTvm, type Tvm, type TvmField } from "../finance/tvm";
import { EngineError } from "./format";
import { UnsupportedError } from "./translate";

/**
 * The handheld's finance functions, which Giac has none of: the TVM
 * functions (the Finance Solver as a function), eff and nom, and the
 * amortisation functions amortTbl, bal, ΣInt and ΣPrn. Arguments arrive
 * worked out to numbers; the answer is a number, or amortTbl's table.
 *
 * Defaults: PpY=1, CpY=1 (not PpY, as on the
 * Finance Solver screen), PmtAt=0 (end), and for the amortisation
 * functions FV=0, Pmt=tvmPmt(N,I,PV,FV,PpY,CpY,PmtAt) and roundValue=2.
 * bal(5,6,5.75,5000,,12,12) bears out CpY=1: its 12 is FV and
 * PpY, and only with CpY=1 is the first month's interest 23.35.
 */
export const FINANCE = new Set(["tvmFV", "tvmPV", "tvmPmt", "tvmN", "tvmI", "eff", "nom", "amortTbl", "bal", "ΣInt", "ΣPrn", "npv", "irr", "mirr", "dbd"]);

/** An argument worked out: a number, an empty slot, a list of numbers (cash flows), a matrix of numbers (an amortisation table) or anything else. */
export type FinanceArg = { k: "num"; v: number } | { k: "empty" } | { k: "list"; v: number[] } | { k: "table"; rows: number[][] } | { k: "other" };

/** amortTbl's answer: rows of payment number, interest, principal and balance; dbd's, a whole number of days. */
export type FinanceValue = number | { table: number[][] } | { days: number };

const TVM: Record<string, TvmField> = { tvmN: "n", tvmI: "i", tvmPV: "pv", tvmPmt: "pmt", tvmFV: "fv" };
const FIELDS: TvmField[] = ["n", "i", "pv", "pmt", "fv"];
/** More rows than any loan has: a guard against a typo running for minutes. */
const MAX_PAYMENTS = 100_000;

/**
 * The function's value, or null when an argument isn't a number (a variable
 * with no value): the call is then left as it was typed. Errors are thrown
 * as the handheld's messages.
 */
export function finance(f: string, args: FinanceArg[]): FinanceValue | null {
  const field = TVM[f];
  if (field) {
    count(args, 4, 7);
    const given = FIELDS.filter((x) => x !== field);
    const values = required(args.slice(0, 4));
    if (!values) return null;
    const rest = options(args.slice(4));
    if (!rest) return null;
    const t = { n: 0, i: 0, pv: 0, pmt: 0, fv: 0, ...Object.fromEntries(given.map((x, k) => [x, values[k]!])), ...rest } as Tvm;
    return finite(solveTvm(t, field));
  }
  if (f === "eff" || f === "nom") {
    count(args, 2, 2);
    const values = required(args);
    if (!values) return null;
    const [rate, cpy] = values as [number, number];
    if (!(cpy > 0)) throw new EngineError("Error: Domain error");
    return finite(f === "eff" ? effectiveRate(rate, cpy) : nominalRate(rate, cpy));
  }
  if (f === "npv" || f === "irr" || f === "mirr") return cashFlowValue(f, args);
  if (f === "dbd") {
    count(args, 2, 2);
    const values = required(args);
    if (!values) return null;
    const [a, b] = values.map(dateOf) as [number, number];
    return { days: Math.round((b - a) / 86_400_000) };
  }
  // The amortisation functions: bal(NPmt,…), amortTbl(NPmt,…), ΣInt(NPmt1,NPmt2,…), ΣPrn(NPmt1,NPmt2,…).
  const ranged = f === "ΣInt" || f === "ΣPrn";
  const lead = ranged ? 2 : 1;
  const table = args[lead];
  if (f !== "amortTbl" && table && args.length === lead + 1) {
    const span = payments(args.slice(0, lead), ranged);
    if (table.k === "num" || table.k === "empty") throw new EngineError("Error: Too few arguments");
    if (!span || table.k !== "table") return null;
    return fromTable(f, span, table.rows);
  }
  count(args, lead + 3, lead + 9);
  const span = payments(args.slice(0, lead), ranged);
  const values = required(args.slice(lead, lead + 3));
  if (!span || !values) return null;
  const [n, i, pv] = values as [number, number, number];
  const [pmtArg, fvArg, ...more] = args.slice(lead + 3);
  const rest = options(more.slice(0, 3));
  const places = more[3] && more[3].k !== "empty" ? whole(more[3], 0, 12) : 2;
  if (!rest || places === null) return null;
  const fv = optional(fvArg, 0);
  if (fv === null) return null;
  // Payments at the start of each period: whether the handheld charges the first period's
  // interest isn't known yet, so no table is made up for them.
  if (rest.begin) throw new UnsupportedError(f);
  const tvm: Tvm = { n, i, pv, pmt: 0, fv, ...rest };
  const pmt = pmtArg && pmtArg.k !== "empty" ? optional(pmtArg, 0) : finite(solveTvm(tvm, "pmt"));
  if (pmt === null) return null;
  const last = span[span.length - 1]!;
  const rows = amortize({ ...tvm, pmt }, last, places);
  if (f === "amortTbl") return { table: rows.map((r) => [r.n, r.interest, r.principal, r.balance]) };
  if (f === "bal") return rows[last]!.balance;
  const from = rows.slice(span[0]!, last + 1);
  return roundDecimal(from.reduce((s, r) => s + (f === "ΣInt" ? r.interest : r.principal), 0), places);
}

/**
 * npv(rate, CF0, CFList[, CFFreq]), irr(CF0, CFList[, CFFreq]) and
 * mirr(financeRate, reinvestRate, CF0, CFList[, CFFreq]): rates in percent per
 * period, CF0 at time 0 and each later flow one period on, a frequency
 * repeating its flow that many times.
 */
function cashFlowValue(f: "npv" | "irr" | "mirr", args: FinanceArg[]): number | null {
  const rates = f === "npv" ? 1 : f === "mirr" ? 2 : 0;
  count(args, rates + 2, rates + 3);
  const given = required(args.slice(0, rates + 1));
  const list = args[rates + 1]!;
  const freqArg = args[rates + 2];
  if (!given) return null;
  // One cash flow in place of a list is a list of one, as on the handheld.
  const cfs = list.k === "num" ? [list.v] : list.k === "list" ? list.v : null;
  const freq = !freqArg || freqArg.k === "empty" ? cfs?.map(() => 1) : freqArg.k === "list" ? freqArg.v : freqArg.k === "num" ? [freqArg.v] : null;
  if (!cfs || !freq) return null;
  if (freq.length !== cfs.length) throw new EngineError("Error: Dimension error");
  if (freq.some((n) => !Number.isInteger(n) || n < 0 || n > 10_000)) throw new EngineError("Error: Domain error");
  const cf0 = given[rates]!;
  const flows = [cf0, ...cfs.flatMap((c, k) => Array<number>(freq[k]!).fill(c))];
  const npv = (rate: number) => flows.reduce((s, c, t) => s + c / (1 + rate) ** t, 0);
  if (f === "npv") return finite(npv(given[0]! / 100));
  if (f === "mirr") {
    const [fin, reinvest] = [given[0]! / 100, given[1]! / 100];
    const n = flows.length - 1;
    const pvOut = flows.reduce((s, c, t) => s + (c < 0 ? c / (1 + fin) ** t : 0), 0);
    const fvIn = flows.reduce((s, c, t) => s + (c > 0 ? c * (1 + reinvest) ** (n - t) : 0), 0);
    if (n < 1 || pvOut === 0 || fvIn === 0) throw new EngineError("Error: Domain error");
    return finite(((fvIn / -pvOut) ** (1 / n) - 1) * 100);
  }
  return finite(irr(npv) * 100);
}

/** The rate (as a fraction) where the net present value is 0: Newton's method from 10%, else bisection. */
function irr(npv: (rate: number) => number): number {
  let r = 0.1;
  for (let k = 0; k < 100; k++) {
    const v = npv(r);
    const h = 1e-7 * Math.max(1, Math.abs(r));
    const d = (npv(r + h) - npv(r - h)) / (2 * h);
    if (!Number.isFinite(d) || d === 0) break;
    const next = r - v / d;
    if (!(next > -1)) break;
    if (Math.abs(next - r) < 1e-14 * Math.max(1, Math.abs(r))) return next;
    r = next;
  }
  // Newton wandered off: look for a sign change between −99.99% and 10 000%.
  let [lo, hi] = [-0.9999, 100];
  if (Math.sign(npv(lo)) === Math.sign(npv(hi))) return NaN;
  for (let k = 0; k < 200; k++) {
    const mid = (lo + hi) / 2;
    if (Math.sign(npv(mid)) === Math.sign(npv(lo))) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

/** bal, ΣInt and ΣPrn of a table amortTbl made: its rows read off and added up. */
function fromTable(f: string, span: number[], rows: number[][]): number {
  if (rows.some((r) => r.length !== 4)) throw new EngineError("Error: Dimension error");
  const last = span[span.length - 1]!;
  if (last >= rows.length) throw new EngineError("Error: Dimension error");
  if (f === "bal") return rows[last]![3]!;
  const column = f === "ΣInt" ? 1 : 2;
  const sum = rows.slice(span[0]!, last + 1).reduce((s, r) => s + r[column]!, 0);
  // The handheld adds in decimal: −79.17−72.71−66.23 is −218.11, not −218.10999….
  return Number(sum.toPrecision(14));
}

function count(args: FinanceArg[], min: number, max: number): void {
  if (args.length < min) throw new EngineError("Error: Too few arguments");
  if (args.length > max) throw new EngineError("Error: Too many arguments");
}

/** Arguments that must be given, as numbers; null if one isn't a number. */
function required(args: FinanceArg[]): number[] | null {
  if (args.some((a) => a.k === "empty")) throw new EngineError("Error: Too few arguments");
  if (args.some((a) => a.k !== "num")) return null;
  return args.map((a) => (a as { v: number }).v);
}

function optional(a: FinanceArg | undefined, fallback: number): number | null {
  if (!a || a.k === "empty") return fallback;
  return a.k === "num" ? a.v : null;
}

/** PpY and CpY (whole numbers above 0, default 1) and PmtAt (0 for the end of each period, 1 for the start). */
function options(args: FinanceArg[]): { ppy: number; cpy: number; begin: boolean } | null {
  const [ppy, cpy, at] = [args[0], args[1], args[2]];
  const p = ppy && ppy.k !== "empty" ? whole(ppy, 1, Infinity) : 1;
  const c = cpy && cpy.k !== "empty" ? whole(cpy, 1, Infinity) : 1;
  const a = at && at.k !== "empty" ? whole(at, 0, 1) : 0;
  if (p === null || c === null || a === null) return null;
  return { ppy: p, cpy: c, begin: a === 1 };
}

/** A whole number in [lo, hi], or null if it isn't a number at all. */
function whole(a: FinanceArg, lo: number, hi: number): number | null {
  if (a.k !== "num") return null;
  if (!Number.isInteger(a.v) || a.v < lo || a.v > hi) throw new EngineError("Error: Domain error");
  return a.v;
}

/** The payment numbers asked for: NPmt (1 or more), or NPmt1 to NPmt2. */
function payments(args: FinanceArg[], ranged: boolean): number[] | null {
  if (args.some((a) => a.k === "empty")) throw new EngineError("Error: Too few arguments");
  const span = args.map((a) => whole(a, 1, MAX_PAYMENTS));
  if (span.some((x) => x === null)) return null;
  if (ranged && span[0]! > span[1]!) throw new EngineError("Error: Domain error");
  return span as number[];
}

/** A value the maths can't give (no rate fits, no positive N) is the Finance Solver's error. */
function finite(v: number): number {
  if (!Number.isFinite(v)) throw new EngineError("Error: No solution found");
  return v;
}

/**
 * A dbd date, as a number: MM.DDYY (two digits or fewer before the point)
 * or DDMM.YY (three or four), years 1950 to 2049, as the handheld reads them.
 * The day it names, in milliseconds (UTC).
 */
export function dateOf(v: number): number {
  if (!(v > 0)) throw new EngineError("Error: Invalid date");
  const [whole = "", frac = ""] = v.toFixed(6).replace(/0+$/, "").split(".");
  let month: number, day: number, year: number;
  if (whole.length <= 2) {
    const f = frac.padEnd(4, "0");
    if (f.length > 4) throw new EngineError("Error: Invalid date");
    [month, day, year] = [Number(whole), Number(f.slice(0, 2)), Number(f.slice(2, 4))];
  } else if (whole.length <= 4) {
    const w = whole.padStart(4, "0");
    const f = frac.padEnd(2, "0");
    if (f.length > 2) throw new EngineError("Error: Invalid date");
    [day, month, year] = [Number(w.slice(0, 2)), Number(w.slice(2, 4)), Number(f)];
  } else throw new EngineError("Error: Invalid date");
  const full = year < 50 ? 2000 + year : 1900 + year;
  const t = Date.UTC(full, month - 1, day);
  const d = new Date(t);
  if (d.getUTCMonth() !== month - 1 || d.getUTCDate() !== day) throw new EngineError("Error: Invalid date");
  return t;
}
