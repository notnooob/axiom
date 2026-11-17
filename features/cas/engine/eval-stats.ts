// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 VCE Hub. Part of the /cas calculator: https://github.com/vcehub/cas
/**
 * The statistics commands for one entry (moved from evaluate.ts): OneVar,
 * TwoVar, the regressions and the z procedures, their stat.results table,
 * and stat.x̄ and the other stat. variables read back in later entries.
 */
import { mapAst, parse, sym, type Ast } from "../math/ast";
import { print } from "../math/print";
import type { EvalResult, Giac, Settings } from "./evaluate";
import { EngineError, formatFloat } from "./format";
import {
  frequencies,
  meanInterval,
  meanTest,
  memberName,
  oneVar,
  propInterval,
  propStatistic,
  propTest,
  regression,
  tMeanInterval,
  tMeanTest,
  tStatistic,
  twoVar,
  zStatistic,
  type StatResult,
  type StatRow,
} from "./stats";
import { corrMat, statProcedure, TEST_COMMANDS, type Arg } from "./stats-tests";
import { translate } from "./translate";

/**
 * OneVar, TwoVar and the regressions. Lists can be typed ({1,2,3}) or named;
 * Giac evaluates them to numbers and stats.ts does the rest. The answer is
 * the handheld's two-column table of results. A regression's fourth
 * argument (f1 …) saves its equation as that function.
 */
export async function statistics(input: Extract<Ast, { k: "call" }>, giac: Giac, settings: Settings): Promise<EvalResult> {
  const values = async (a: Ast | undefined): Promise<number[] | number | undefined> => {
    if (!a) return undefined;
    const raw = (await giac(`evalf(${translate(a, settings).giac})`)).trim();
    const list = raw.startsWith("[") || raw.startsWith("list[");
    const inner = raw.replace(/^(list)?\[|\]$/g, "").trim();
    // {} is an empty list, not a list holding 0.
    if (list && !inner) return [];
    const nums = inner.split(",").map((t) => Number(t.trim()));
    if (nums.some((v) => !Number.isFinite(v))) throw new EngineError("Error: Wrong kind of input");
    return list ? nums : nums[0];
  };
  /** A number, list or matrix, as the procedures in stats-tests.ts take them. */
  const arg = async (a: Ast | undefined): Promise<Arg> => {
    if (!a) return undefined;
    const raw = (await giac(`evalf(${translate(a, settings).giac})`)).trim();
    let v: unknown;
    try {
      v = JSON.parse(raw.replace(/list\[/g, "[").replace(/\bundef\b/g, "null"));
    } catch {
      throw new EngineError("Error: Wrong kind of input");
    }
    const ok = (x: unknown) => typeof x === "number" && Number.isFinite(x);
    if (ok(v)) return v as number;
    if (Array.isArray(v) && v.every(ok)) return v as number[];
    if (Array.isArray(v) && v.length && v.every((r) => Array.isArray(r) && r.every(ok))) return v as number[][];
    throw new EngineError("Error: Wrong kind of input");
  };
  const asList = (v: number[] | number | undefined) => {
    if (!Array.isArray(v)) throw new EngineError("Error: Wrong kind of input");
    return v;
  };
  try {
    const [a0, a1, a2, a3, a4] = input.args;
    let result: StatResult;
    /**
     * Category and Include, after the frequencies, are lists of category codes:
     * only the data whose code is in Include count, as if the others had
     * frequency 0. Anything but a list there is an error, as on the
     * handheld: LinRegMx xs,ys,1,f1 on the handheld (the
     * regression wizard saves RegEqn with CopyVar, not with a 4th argument).
     * A Category with no Include after it is ignored, as it was before.
     */
    const included = async (xs: number[], freq: number[] | number, category?: Ast, include?: Ast) => {
      const codes = async (a: Ast) => {
        const v = await values(a).catch(() => undefined);
        if (!Array.isArray(v)) throw new EngineError("Error: Expected a list");
        return v;
      };
      const cat = category && (await codes(category));
      const inc = include && (await codes(include));
      if (!cat || !inc) return freq;
      if (cat.length !== xs.length) throw new EngineError("Error: Sizes do not match");
      return frequencies(xs, freq).map((w, i) => (inc.includes(cat[i]!) ? w : 0));
    };
    // From a list: its mean, size and sample sd, weighted by an optional frequency list.
    const fromData = (xs: number[], f: number[] | number | undefined) => {
      const w = frequencies(xs, f ?? 1);
      const n = w.reduce((s, v) => s + v, 0);
      const mean = xs.reduce((s, x, i) => s + x * w[i]!, 0) / n;
      const sx = Math.sqrt(xs.reduce((s, x, i) => s + w[i]! * (x - mean) ** 2, 0) / (n - 1));
      return { mean, n, sx };
    };
    const zq = async (p: number) => Number((await giac(`evalf(normal_icdf(0,1,${p}))`)).trim());
    if (input.f === "zInterval") {
      // zInterval σ,x̄,n[,CLevel] or zInterval σ,List[,Freq[,CLevel]]
      const sigma = await values(a0);
      const second = await values(a1);
      if (typeof sigma !== "number") throw new EngineError("Error: Wrong kind of input");
      if (Array.isArray(second)) {
        const freq = await values(a2);
        const level = (await values(a3)) ?? 0.95;
        if (typeof level !== "number") throw new EngineError("Error: Wrong kind of input");
        const d = fromData(second, freq);
        result = meanInterval(sigma, d.mean, d.n, level, await zq((1 + level) / 2), d.sx);
      } else {
        const [n, level] = [await values(a2), (await values(a3)) ?? 0.95];
        if (typeof second !== "number" || typeof n !== "number" || typeof level !== "number") throw new EngineError("Error: Wrong kind of input");
        result = meanInterval(sigma, second, n, level, await zq((1 + level) / 2));
      }
    } else if (input.f === "zTest") {
      // zTest μ0,σ,x̄,n[,Hypoth] or zTest μ0,σ,List[,Freq[,Hypoth]]
      const [mu0, sigma, third] = [await values(a0), await values(a1), await values(a2)];
      if (typeof mu0 !== "number" || typeof sigma !== "number") throw new EngineError("Error: Wrong kind of input");
      // The standard normal cdf at each z the test needs, from Giac.
      const cdfAt = async (z: number) => Number((await giac(`evalf(normal_cdf(0,1,-inf,${z}))`)).trim());
      const run = async (mean: number, n: number, hyp: number, sx?: number) => {
        const z = zStatistic(mu0, sigma, mean, n);
        return meanTest(mu0, sigma, mean, n, hyp, { atZ: await cdfAt(z), atAbsZ: await cdfAt(Math.abs(z)) }, sx);
      };
      if (Array.isArray(third)) {
        const freq = await values(a3);
        const hyp = (await values(a4)) ?? 0;
        if (typeof hyp !== "number") throw new EngineError("Error: Wrong kind of input");
        const d = fromData(third, freq);
        result = await run(d.mean, d.n, hyp, d.sx);
      } else {
        const [n, hyp] = [await values(a3), (await values(a4)) ?? 0];
        if (typeof third !== "number" || typeof n !== "number" || typeof hyp !== "number") throw new EngineError("Error: Wrong kind of input");
        result = await run(third, n, hyp);
      }
    } else if (input.f === "tInterval") {
      // tInterval x̄,sx,n[,CLevel] or tInterval List[,Freq[,CLevel]]
      const first = await values(a0);
      const d = Array.isArray(first)
        ? { ...fromData(first, await values(a1)), level: (await values(a2)) ?? 0.95 }
        : { mean: first, sx: await values(a1), n: await values(a2), level: (await values(a3)) ?? 0.95 };
      if (typeof d.mean !== "number" || typeof d.sx !== "number" || typeof d.n !== "number" || typeof d.level !== "number")
        throw new EngineError("Error: Wrong kind of input");
      const tStar = Number((await giac(`evalf(student_icdf(${d.n - 1},${(1 + d.level) / 2}))`)).trim());
      result = tMeanInterval(d.mean, d.sx, d.n, d.level, tStar);
    } else if (input.f === "tTest") {
      // tTest μ0,x̄,sx,n[,Hypoth] or tTest μ0,List[,Freq[,Hypoth]]
      const [mu0, second] = [await values(a0), await values(a1)];
      const d = Array.isArray(second)
        ? { ...fromData(second, await values(a2)), hyp: (await values(a3)) ?? 0 }
        : { mean: second, sx: await values(a2), n: await values(a3), hyp: (await values(a4)) ?? 0 };
      if (typeof mu0 !== "number" || typeof d.mean !== "number" || typeof d.sx !== "number" || typeof d.n !== "number" || typeof d.hyp !== "number")
        throw new EngineError("Error: Wrong kind of input");
      const t = tStatistic(mu0, d.mean, d.sx, d.n);
      const df = d.n - 1;
      const cdfAt = async (v: number) => Number((await giac(`evalf(student_cdf(${df},${v}))`)).trim());
      result = tMeanTest(mu0, d.mean, d.sx, d.n, d.hyp, { atZ: await cdfAt(t), atAbsZ: await cdfAt(Math.abs(t)) });
    } else if (input.f === "zTest_1Prop") {
      // zTest_1Prop p0,x,n[,Hypoth]
      const [p0, x, n, hyp] = [await values(a0), await values(a1), await values(a2), (await values(a3)) ?? 0];
      if (typeof p0 !== "number" || typeof x !== "number" || typeof n !== "number" || typeof hyp !== "number") throw new EngineError("Error: Wrong kind of input");
      const z = propStatistic(p0, x, n);
      const cdfAt = async (v: number) => Number((await giac(`evalf(normal_cdf(0,1,-inf,${v}))`)).trim());
      result = propTest(p0, x, n, hyp, { atZ: await cdfAt(z), atAbsZ: await cdfAt(Math.abs(z)) });
    } else if (input.f === "zInterval_1Prop") {
      const [x, n, c] = [await values(a0), await values(a1), (await values(a2)) ?? 0.95];
      if (typeof x !== "number" || typeof n !== "number" || typeof c !== "number") throw new EngineError("Error: Wrong kind of input");
      const z = Number((await giac(`evalf(normal_icdf(0,1,${(1 + c) / 2}))`)).trim());
      result = propInterval(x, n, c, z);
    } else if (TEST_COMMANDS.has(input.f)) {
      const args: Arg[] = [];
      for (const a of input.args) args.push(await arg(a));
      result = statProcedure(input.f, args);
    } else if (input.f === "OneVar") result = oneVar(asList(await values(a0)), (await values(a1)) ?? 1);
    else {
      // TwoVar and the regressions: X, Y[, [Freq][, Category, Include]].
      const [xs, ys] = [asList(await values(a0)), asList(await values(a1))];
      const freq = await included(xs, (await values(a2)) ?? 1, a3, a4);
      result = input.f === "TwoVar" ? twoVar(xs, ys, freq) : regression(input.f, xs, ys, freq);
    }
    const definition = await storeStats(result, giac);
    const output = statTable(result.rows, settings.digits, (v) => listAst(v, settings.digits));
    return { ok: true, input, output, outputText: print(output), definition };
  } catch (e) {
    const message = e instanceof Error ? e.message : "Error: Invalid input";
    return { ok: false, input, error: message.startsWith("Error") ? message : "Error: Invalid input" };
  }
}

/**
 * A number as the handheld shows it at Float n, undef when it isn't one. Like
 * any decimal answer (shownDecimal), a cell keeps the digits it was worked
 * out to when Display Digits rounds it, so ans[2,2] carries on with stat.x̄
 * itself.
 */
const numCell = (v: number, digits: number): Ast => {
  if (!Number.isFinite(v)) return { k: "num", v: "undef" };
  const shown = formatFloat(v, digits);
  const full = (v < 0 ? "-" : "") + decimalText(v);
  return shown !== "0." && Number(full) !== Number(shown) ? { k: "num", v: shown, full } : { k: "num", v: shown };
};

/** |v| written out in full, still a decimal (11., not 11): the digits stat.x̄ and the other results keep. */
function decimalText(v: number): string {
  const t = String(Math.abs(v)).replace("e+", "E").replace("e", "E");
  return /[.E]/.test(t) ? t : `${t}.`;
}
const listAst = (v: number[], digits: number): Ast => ({ k: "list", items: v.map((x) => numCell(x, digits)) });

const isMatrix = (v: StatRow[1]): v is number[][] => Array.isArray(v) && Array.isArray(v[0]);

/** The results as the two-column matrix stat.results is: [["Title",…]["x̄",22.6364]…]. */
function statTable(rows: StatRow[], digits: number, list: (v: number[]) => Ast): Ast {
  const cell = (v: StatRow[1]): Ast =>
    typeof v === "string" ? { k: "str", v } : isMatrix(v) ? { k: "mat", rows: v.map((r) => r.map((x) => numCell(x, digits))) } : Array.isArray(v) ? list(v as number[]) : numCell(v, digits);
  return { k: "mat", rows: rows.map(([label, v]) => [{ k: "str", v: label }, cell(v)]) };
}

/**
 * The latest statistics results, kept in Giac so that a restart's replay of
 * the definitions brings them back and clearing the calculator clears them:
 * stats.ts's rows and the regression equation, as JSON in a base64 string
 * (Giac rewrites some characters inside its strings, a brace among them).
 */
const STAT_STORE = "stat_results_";
type StatStore = { rows: StatRow[]; regEqn?: string };

async function storeStats(result: StatResult, giac: Giac): Promise<string> {
  const json = JSON.stringify({ rows: result.rows, regEqn: result.regEqn } satisfies StatStore, (_, v: unknown) =>
    typeof v === "number" && !Number.isFinite(v) ? null : v,
  );
  let bytes = "";
  for (const b of new TextEncoder().encode(json)) bytes += String.fromCharCode(b);
  const definition = `${STAT_STORE}:="${btoa(bytes)}"`;
  await giac(definition);
  return definition;
}

export async function loadStats(giac: Giac): Promise<StatStore | null> {
  const raw = (await giac(STAT_STORE)).trim();
  const m = /^"([A-Za-z0-9+/=]*)"$/.exec(raw);
  if (!m) return null;
  const store = JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(m[1]!), (c) => c.charCodeAt(0)))) as StatStore;
  // Infinity and NaN went into the JSON as null; both show as undef.
  for (const row of store.rows) if (row[1] === null) row[1] = NaN;
  return store;
}

/**
 * The results by the name each is stored under on the handheld (stat.x̄,
 * stat.q₁x …), folded as the parser folds a typed name. RegEqn is left out:
 * stat.RegEqn is the fitted function, not the "m*x+b" the table shows.
 */
function statMembers(store: StatStore): Map<string, StatRow[1]> {
  const out = new Map<string, StatRow[1]>();
  for (const [label, v] of store.rows) {
    const name = memberName(label);
    if (!name || name === "RegEqn") continue;
    try {
      const typed = parse(`stat.${name}`);
      if (typed.k === "sym") out.set(typed.name, v);
    } catch {
      // Not a name a person could type.
    }
  }
  return out;
}

/** A value as an expression, at full precision, still a decimal (stat.n is 11., not 11). */
function valueAst(v: StatRow[1]): Ast {
  if (typeof v === "string") return { k: "str", v };
  if (isMatrix(v)) return { k: "mat", rows: v.map((r) => r.map((x) => valueAst(x))) };
  if (Array.isArray(v)) return { k: "list", items: (v as number[]).map((x) => valueAst(x)) };
  if (!Number.isFinite(v)) return sym("undef");
  const n: Ast = { k: "num", v: decimalText(v) };
  return v < 0 ? { k: "neg", a: n } : n;
}

/**
 * stat.x̄, stat.Resid, stat.RegEqn(10) …: the latest statistics results put
 * in where they're named. A name the latest command didn't store is left as
 * it is, as the handheld leaves an undefined name (stat.q1x: the handheld's
 * name is stat.Q₁X).
 */
export async function statVariables(a: Ast, giac: Giac): Promise<Ast> {
  let named = false;
  mapAst(a, (x) => {
    if ((x.k === "sym" && x.name.startsWith("stat.")) || (x.k === "call" && x.f.startsWith("stat."))) named = true;
    return x;
  });
  if (!named) return a;
  const store = await loadStats(giac);
  if (!store) return a;
  const members = statMembers(store);
  const regEqn = store.regEqn ? parse(store.regEqn) : null;
  return mapAst(a, (x) => {
    if (x.k === "sym" && x.name === "stat.results") return { k: "mat", rows: store.rows.map(([label, v]) => [{ k: "str", v: label }, Array.isArray(v) ? { k: "str", v: "{...}" } : valueAst(v)]) };
    if (x.k === "sym" && members.has(x.name)) return valueAst(members.get(x.name)!);
    // stat.RegEqn is a function of x.
    if (x.k === "call" && x.f === "stat.regeqn" && regEqn && x.args.length === 1)
      return mapAst(regEqn, (y) => (y.k === "sym" && y.name === "x" ? x.args[0]! : y));
    return x;
  });
}

/**
 * stat.results (and an entry of it, stat.results[2,1]) answered as the
 * handheld shows it: each result at the display digits, a list as the
 * string "{...}". stat.values is the second column, a list written out in
 * full as a string.
 */
export async function statResults(input: Ast, giac: Giac, settings: Settings): Promise<EvalResult | null> {
  const [name, index] = input.k === "sym" ? [input.name, []] : input.k === "call" && input.f === "index" && input.args[0]?.k === "sym" ? [input.args[0].name, input.args.slice(1)] : [null, []];
  if (name !== "stat.results" && name !== "stat.values") return null;
  const store = await loadStats(giac);
  if (!store) return null;
  const table = statTable(store.rows, settings.digits, (v) => ({ k: "str", v: name === "stat.results" ? "{...}" : print(listAst(v, settings.digits)) }));
  let output: Ast = name === "stat.results" ? table : { k: "mat", rows: (table as { rows: Ast[][] }).rows.map((r) => [r[1]!]) };
  if (index.length) {
    const at = index.map((i) => (i.k === "num" ? Number(i.v) : NaN));
    const rows = (output as { rows: Ast[][] }).rows;
    const row = rows[at[0]! - 1];
    const cell = at.length === 2 ? row?.[at[1]! - 1] : row && { k: "mat" as const, rows: [row] };
    if (!cell || at.some((i) => !Number.isInteger(i))) return { ok: false, input, error: "Error: Dimension error" };
    output = cell;
  }
  return { ok: true, input, output, outputText: print(output) };
}

/** corrMat(List1, List2[, …]): the matrix of correlations between each pair of lists. */
export async function correlationMatrix(input: Extract<Ast, { k: "call" }>, giac: Giac, settings: Settings): Promise<EvalResult> {
  try {
    const lists: number[][] = [];
    for (const a of input.args) {
      const raw = (await giac(`evalf(${translate(a, settings).giac})`)).trim();
      const nums = raw.replace(/^(list)?\[|\]$/g, "").split(",").map((t) => Number(t.trim()));
      if (!/^(list)?\[/.test(raw) || nums.some((v) => !Number.isFinite(v))) throw new EngineError("Error: Wrong kind of input");
      lists.push(nums);
    }
    const output: Ast = { k: "mat", rows: corrMat(lists).map((r) => r.map((v) => numCell(v, settings.digits))) };
    return { ok: true, input, output, outputText: print(output) };
  } catch (e) {
    const message = e instanceof Error ? e.message : "";
    return { ok: false, input, error: message.startsWith("Error") ? message : "Error: Invalid input" };
  }
}
