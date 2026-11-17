// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 VCE Hub. Part of the /cas calculator: https://github.com/vcehub/cas
/**
 * The finance commands for one entry (moved from evaluate.ts): tvm…, eff,
 * nom, amortTbl and the rest worked in plain numbers (finance.ts), and
 * CopyVar of a regression's equation.
 */
import { mapAst, sym, type Ast } from "../math/ast";
import { print } from "../math/print";
import { evaluate, type EvalResult, type Giac, type Settings } from "./evaluate";
import { loadStats } from "./eval-stats";
import { finance, FINANCE, type FinanceArg, type FinanceValue } from "./finance";
import { shownDecimal } from "./format";
import { RENAME_IN, toGiac, translate } from "./translate";

/**
 * tvmPmt, bal, ΣInt and the other finance functions (finance.ts), wherever
 * they are in the entry, innermost first: nom(eff(6,12),12) is 6. An entry
 * that is one of them, or stores one (→, :=), is answered here as the
 * handheld shows it, amortTbl's payment numbers whole beside decimal money.
 * Anywhere else the value goes into the entry as a decimal and the entry
 * carries on (round(tvmPmt(…),2)). A call with an argument that isn't a
 * number is left as typed. Null when the entry has none of them.
 */
export async function financeCalls(input: Ast, a: Ast, giac: Giac, settings: Settings): Promise<EvalResult | Ast | null> {
  let found = false;
  mapAst(a, (x) => {
    if (x.k === "call" && FINANCE.has(x.f)) found = true;
    return x;
  });
  if (!found) return null;
  const arg = async (x: Ast): Promise<FinanceArg> => {
    if (x.k === "sym" && (x.name === "" || x.name === OMITTED)) return { k: "empty" };
    // A decimal from Ans carries its worked-out digits (full) behind the shown ones.
    const typedNumber = x.k === "num" ? Number(x.full ?? x.v) : x.k === "neg" && x.a.k === "num" ? -Number(x.a.full ?? x.a.v) : NaN;
    if (Number.isFinite(typedNumber)) return { k: "num", v: typedNumber };
    const raw = (await giac(`evalf(${translate(x, settings).giac},15)`)).trim();
    if (/^[-+]?(\d+\.?\d*|\.\d+)(e[-+]?\d+)?$/i.test(raw)) return { k: "num", v: Number(raw) };
    // A list of cash flows: Giac gives it as [a,b,…].
    if (/^\[[^[\]]*\]$/.test(raw)) {
      const v = raw.slice(1, -1).split(",").map((t) => Number(t.trim()));
      if (v.every(Number.isFinite)) return { k: "list", v };
    }
    if (/^\[\[.*\]\]$/.test(raw)) {
      const rows = raw.slice(2, -2).split(/\]\s*,\s*\[/).map((r) => r.split(",").map((t) => Number(t.trim())));
      if (rows.every((r) => r.every(Number.isFinite))) return { k: "table", rows };
    }
    return { k: "other" };
  };
  // The arguments' own finance calls first, then the call itself.
  const value = async (call: Extract<Ast, { k: "call" }>): Promise<FinanceValue | null> => {
    const args: FinanceArg[] = [];
    for (const x of call.args) args.push(await arg(await inner(x)));
    return finance(call.f, args);
  };
  // As a decimal Giac reads as an ordinary float: 14 significant digits (15 and it reads a long float).
  // Exact mode would read a typed decimal as a fraction; these answers are decimals in any mode.
  const decimal = (v: number): Ast => {
    let s = String(Number(v.toPrecision(14))).replace("e+", "E").replace("e", "E");
    if (!/[.E]/.test(s)) s += ".";
    const n: Ast = { k: "num", v: s };
    return settings.mode === "exact" ? { k: "call", f: "approx", args: [n] } : n;
  };
  const asAst = (v: FinanceValue): Ast =>
    typeof v === "number" ? decimal(v) : { k: "mat", rows: v.table.map(([n, ...money]) => [{ k: "num", v: String(n) }, ...money.map(decimal)]) };
  const inner = async (x: Ast): Promise<Ast> => {
    switch (x.k) {
      case "call": {
        if (FINANCE.has(x.f)) {
          const v = await value(x);
          if (v !== null) return asAst(v);
        }
        const args: Ast[] = [];
        for (const y of x.args) args.push(await inner(y));
        // Giac drops an empty argument, which shifts the rest along (FV read as PpY) in a
        // function stored with the call in it: an omitted one goes to Giac as a name.
        if (FINANCE.has(x.f)) return { ...x, args: args.map((y) => (y.k === "sym" && y.name === "" ? sym(OMITTED) : y)) };
        return { ...x, args };
      }
      case "bin":
        return { ...x, a: await inner(x.a), b: await inner(x.b) };
      case "neg":
      case "not":
      case "post":
        return { ...x, a: await inner(x.a) };
      case "list": {
        const items: Ast[] = [];
        for (const y of x.items) items.push(await inner(y));
        return { ...x, items };
      }
      case "mat": {
        const rows: Ast[][] = [];
        for (const r of x.rows) {
          const row: Ast[] = [];
          for (const y of r) row.push(await inner(y));
          rows.push(row);
        }
        return { ...x, rows };
      }
      case "define":
        return { ...x, rhs: await inner(x.rhs) };
      default:
        return x;
    }
  };
  // The answer as shown: numbers to the display digits, payment numbers whole.
  // Each decimal keeps its worked-out digits behind the shown ones, so Ans carries on with them.
  // In Approx mode every number is a decimal, the payment numbers too ({12,15}→ages shows
  // {12.,15.} on the handheld).
  const paymentNumber = (n: number): Ast => (settings.mode === "approx" ? shownDecimal(n, settings.digits) : { k: "num", v: String(n) });
  const shown = (v: FinanceValue): Ast =>
    typeof v === "number"
      ? shownDecimal(v, settings.digits)
      : { k: "mat", rows: v.table.map(([n, ...money]) => [paymentNumber(n!), ...money.map((m) => shownDecimal(m, settings.digits))]) };
  const isFinance = (x: Ast): x is Extract<Ast, { k: "call" }> => x.k === "call" && FINANCE.has(x.f);
  const [call, name] =
    a.k === "bin" && a.op === "→" && isFinance(a.a) && a.b.k === "sym"
      ? [a.a, a.b.name]
      : a.k === "bin" && a.op === ":=" && isFinance(a.b) && a.a.k === "sym"
        ? [a.b, a.a.name]
        : [isFinance(a) ? a : null, null];
  if (call) {
    const v = await value(call);
    if (v !== null) {
      const output = shown(v);
      if (!name) return { ok: true, input, output, outputText: print(output) };
      // Stored at full precision; the table keeps its whole payment numbers.
      const definition = `${RENAME_IN[name] ?? name}:=${toGiac(asAst(v), settings)}`;
      await giac(definition);
      return { ok: true, input, output, outputText: print(output), definition };
    }
  }
  return inner(a);
}

/** An omitted finance argument as Giac holds it (see financeCalls); shown as the empty slot it was. */
export const OMITTED = "omitted_";

/**
 * A finance call whose arguments are all numbers (a fraction, an amortisation
 * table) or omitted: one financeCalls can always work out, so working it out
 * again can't come back to the same call.
 */
export function numericFinance(a: Ast): boolean {
  let found = false;
  const number = (x: Ast): boolean => x.k === "num" || (x.k === "neg" && number(x.a)) || (x.k === "bin" && x.op === "/" && number(x.a) && number(x.b));
  const numeric = (x: Ast): boolean =>
    number(x) || (x.k === "sym" && (x.name === "" || x.name === OMITTED)) || (x.k === "mat" && x.rows.length > 1 && x.rows.every((r) => r.every(number)));
  mapAst(a, (x) => {
    if (x.k === "call" && FINANCE.has(x.f) && x.args.every(numeric)) found = true;
    return x;
  });
  return found;
}

/**
 * CopyVar stat.RegEqn,f1: how the regression wizard saves the equation. The
 * handheld's wizard pastes LinRegMx X,Y,1: CopyVar stat.RegEqn,f1:
 * stat.results, so f1 becomes the latest regression's
 * function, at full precision, and every Graphs page plots it. Other copies
 * aren't done here yet.
 */
export async function copyVar(input: Extract<Ast, { k: "call" }>, giac: Giac, settings: Settings): Promise<EvalResult> {
  const [from, to] = input.args;
  if (!(input.args.length === 2 && from?.k === "sym" && from.name === "stat.regeqn" && to?.k === "sym"))
    return { ok: false, input, error: "Error: Not available here yet" };
  const store = await loadStats(giac);
  if (!store?.regEqn) return { ok: false, input, error: "Error: Undefined variable" };
  const def = await evaluate(`Define ${to.name}(x)=${store.regEqn}`, giac, { settings });
  if (!def.ok) return { ...def, input };
  const n = /^f(\d+)$/.exec(to.name);
  const output = sym("Done");
  return { ok: true, input, output, outputText: print(output), definition: def.definition, regEqn: n ? { n: Number(n[1]), text: store.regEqn } : undefined };
}
