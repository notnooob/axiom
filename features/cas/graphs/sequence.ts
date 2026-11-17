// SPDX-License-Identifier: GPL-3.0-or-later
/**
 * Sequences on a Graphs page (Graph Entry ▸ Sequence): u1(n) defined from
 * n and its own earlier terms, u1(n−1), u1(n−2) …, with as many initial
 * terms as it looks back, plotted as points (n, u1(n)). A Custom plot draws
 * one sequence's terms against another's.
 */
import type { Settings } from "../engine/evaluate";
import { translate } from "../engine/translate";
import { mapAst, parse, sym, type Ast } from "../math/ast";

/** The engine's name for a page's sequence: its value from n and the earlier terms. */
export const seqName = (page: number, n: number) => `g${page}u${n}_`;

/** u1(n−j) in a sequence's own definition, as the j-th earlier term; null for anything else. */
function lookBack(a: Ast, own: string): number | null {
  if (a.k !== "call" || a.f !== own || a.args.length !== 1) return null;
  const arg = a.args[0]!;
  if (arg.k === "sym" && arg.name === "n") return 0;
  if (arg.k === "bin" && arg.op === "-" && arg.a.k === "sym" && arg.a.name === "n" && arg.b.k === "num") return Number(arg.b.v);
  return null;
}

/**
 * u1(n) = rhs as an engine function of n and the earlier terms (a1_ for
 * u1(n−1) …), and how far back it looks. A term it can't reach (u1(n),
 * u1(n/2)) is an error.
 */
export function seqDefinition(page: number, n: number, rhs: string, settings: Settings): { def: string; depth: number } {
  const own = `u${n}`;
  let depth = 0;
  let bad = false;
  const body = mapAst(parse(rhs), (a) => {
    if (a.k === "call" && a.f === own) {
      const j = lookBack(a, own);
      if (!j || !Number.isInteger(j)) bad = true;
      else depth = Math.max(depth, j);
      return sym(`a${j ?? 0}_`);
    }
    return a;
  });
  if (bad) throw new Error("Error: A term can only use earlier terms, as u(n−1)");
  const args = ["n", ...Array.from({ length: depth }, (_, i) => `a${i + 1}_`)];
  return { def: `${seqName(page, n)}(${args.join(",")}):=${translate(body, settings).giac}`, depth };
}

/** Works out a sequence's terms in the engine: the initial ones as given, then each from n and those before it. */
export const SEQ_TERMS =
  "seqterms_(F,d,I,N0,C):={local L,k,j,a; L:=evalf(I); for k from size(I) to C-1 do a:=[N0+k]; for j from 1 to d do a:=append(a,L[size(L)-j]); od; L:=append(L,evalf(F(op(a)))); od; L}";

/** The terms from nmin to nmax (at most 2000), once SEQ_TERMS is defined. */
export function seqTermsCommand(name: string, depth: number, init: number[], nmin: number, nmax: number): string {
  const count = Math.max(0, Math.min(2000, Math.floor(nmax - nmin + 1)));
  return `seqterms_(${name},${depth},[${init.slice(0, count).join(",")}],${nmin},${count})`;
}

/** Giac's list of terms as numbers (undef and the like as NaN). */
export function parseTerms(raw: string): number[] {
  const inner = raw.trim().replace(/^(list)?\[|\]$/g, "");
  if (!inner.trim()) return [];
  return inner.split(",").map((t) => (/^[-+0-9.eE]+$/.test(t.trim()) ? Number(t) : NaN));
}
