// SPDX-License-Identifier: GPL-3.0-or-later
/**
 * Vector forms and matrix factorisations for one entry: a vector ▶Polar,
 * ▶Cylind, ▶Sphere or ▶Rect (r∠θ, [r∠θ z], [ρ∠θ∠φ] as the handheld shows
 * them), and LU and QR, which store their factors in the names given.
 */
import { sym, type Ast } from "../math/ast";
import { print } from "../math/print";
import type { EvalResult, Giac, Settings } from "./evaluate";
import { format } from "./format";
import { splitArgs } from "./program";
import { translate } from "./translate";

type Opts = { settings: Settings; ans?: Ast };
type Evaluate = (text: string, giac: Giac, opts: Opts) => Promise<EvalResult>;

const CONVERSIONS = new Set(["▶Polar", "▶Cylind", "▶Sphere", "▶Rect"]);

const angle = (a: Ast, b: Ast): Ast => ({ k: "bin", op: "∠", a, b });

/** A vector's entries (a one-row or one-column matrix, or a list), or null. */
function entries(a: Ast): Ast[] | null {
  if (a.k === "list") return a.items;
  if (a.k === "mat" && a.rows.length === 1) return a.rows[0]!;
  if (a.k === "mat" && a.rows.every((r) => r.length === 1)) return a.rows.map((r) => r[0]!);
  return null;
}

/** The parts of r∠θ (or ρ∠θ∠φ) written in a vector. */
function angles(a: Ast): Ast[] {
  if (a.k === "bin" && a.op === "∠") return [...angles(a.a), a.b];
  return [a];
}

export async function vectorConversion(input: Ast, giac: Giac, opts: Opts, evaluate: Evaluate): Promise<EvalResult | null> {
  if (input.k !== "post" || !CONVERSIONS.has(input.op)) return null;
  const typed = entries(input.a);
  // A vector in polar, cylindrical or spherical form is read from what was typed (its ∠s), before any working out.
  const written = typed?.some((x) => x.k === "bin" && x.op === "∠") ? typed.flatMap(angles) : null;
  const shape = typed?.map((x) => angles(x).length);
  let parts: Ast[];
  if (written) parts = written;
  else {
    const r = await evaluate(print(input.a), giac, opts);
    if (!r.ok) return { ...r, input };
    const v = entries(r.output);
    if (!v) return null;
    parts = v;
  }
  const value = async (text: string): Promise<Ast> => {
    const r = await evaluate(text, giac, opts);
    if (!r.ok) throw new Error(r.error);
    return r.output;
  };
  const t = (a: Ast) => `(${print(a)})`;
  try {
    // Rectangular coordinates first, whatever form the vector came in.
    let xyz: Ast[];
    if (!written) xyz = parts;
    else if (shape!.length === 1 && shape![0] === 2) {
      const [r, th] = parts as [Ast, Ast];
      xyz = [await value(`${t(r)}*cos${t(th)}`), await value(`${t(r)}*sin${t(th)}`)];
    } else if (shape!.length === 2 && shape![0] === 2 && shape![1] === 1) {
      const [r, th, z] = parts as [Ast, Ast, Ast];
      xyz = [await value(`${t(r)}*cos${t(th)}`), await value(`${t(r)}*sin${t(th)}`), z];
    } else if (shape!.length === 1 && shape![0] === 3) {
      const [rho, th, phi] = parts as [Ast, Ast, Ast];
      xyz = [
        await value(`${t(rho)}*sin${t(phi)}*cos${t(th)}`),
        await value(`${t(rho)}*sin${t(phi)}*sin${t(th)}`),
        await value(`${t(rho)}*cos${t(phi)}`),
      ];
    } else return { ok: false, input, error: "Error: Dimension error" };
    let output: Ast;
    const polar = async (x: Ast, y: Ast) => angle(await value(`√(${t(x)}^2+${t(y)}^2)`), await value(`angle(${t(x)}+${t(y)}*i)`));
    if (input.op === "▶Rect") output = { k: "mat", rows: [xyz] };
    else if (input.op === "▶Polar") {
      if (xyz.length !== 2) return { ok: false, input, error: "Error: Dimension error" };
      output = { k: "mat", rows: [[await polar(xyz[0]!, xyz[1]!)]] };
    } else if (input.op === "▶Cylind") {
      if (xyz.length < 2 || xyz.length > 3) return { ok: false, input, error: "Error: Dimension error" };
      output = { k: "mat", rows: [[await polar(xyz[0]!, xyz[1]!), xyz[2] ?? { k: "num", v: "0" }]] };
    } else {
      if (xyz.length !== 3) return { ok: false, input, error: "Error: Dimension error" };
      const [x, y, z] = xyz as [Ast, Ast, Ast];
      const rho = await value(`√(${t(x)}^2+${t(y)}^2+${t(z)}^2)`);
      output = { k: "mat", rows: [[angle(angle(rho, await value(`angle(${t(x)}+${t(y)}*i)`)), await value(`cos⁻¹(${t(z)}/${t(rho)})`))]] };
    }
    return { ok: true, input, output, outputText: print(output) };
  } catch (e) {
    const message = e instanceof Error ? e.message : "";
    return { ok: false, input, error: message.startsWith("Error") ? message : "Error: Invalid input" };
  }
}

/**
 * LU with partial pivoting, as the handheld factors: the largest entry (by
 * size) in each column is the pivot, so P·A = L·U with L unit lower
 * triangular. Defined in Giac's own language once per use.
 */
const LUP = [
  "lup_(A):={local n,m,U,L,P,k,i,j,p,mx,f,t;",
  "n:=rowdim(A); m:=coldim(A); U:=A; L:=idn(n); P:=idn(n);",
  "for k from 0 to min(n,m)-1 do",
  " p:=k; mx:=abs(evalf(U[k,k]));",
  " for i from k+1 to n-1 do if (abs(evalf(U[i,k]))>mx) {p:=i; mx:=abs(evalf(U[i,k]));}; od;",
  " if (mx!=0) {",
  "  if (p!=k) {t:=U[k]; U[k]:=U[p]; U[p]:=t; t:=P[k]; P[k]:=P[p]; P[p]:=t; for j from 0 to k-1 do t:=L[k,j]; L[k,j]:=L[p,j]; L[p,j]:=t; od;};",
  "  for i from k+1 to n-1 do f:=normal(U[i,k]/U[k,k]); L[i,k]:=f; U[i]:=normal(U[i]-f*U[k]); od;",
  " };",
  "od;",
  "return [L,U,P];}",
].join("");

/** QR with R's diagonal made non-negative (a column of Q and a row of R change sign together), as the handheld gives it. */
const QRFIX = "qrfix_(F):={local Q,R,D; Q:=F[0]; R:=F[1]; D:=diag(seq(when(evalf(R[j,j])<0,-1,1),j=0..rowdim(R)-1)); [Q*D,D*R]}";

/** LU m, l, u, p and QR m, q, r: the factors stored in the names given; the answer is Done. */
export async function factorCommand(text: string, giac: Giac, opts: Opts, evaluate: Evaluate): Promise<EvalResult | null> {
  const m = /^\s*(LU|QR)\s+(.+)$/i.exec(text);
  if (!m) return null;
  const kind = m[1]!.toUpperCase();
  const args = splitArgs(m[2]!);
  const input: Ast = sym(text.trim());
  const want = kind === "LU" ? 4 : 3;
  if (args.length < want || args.length > want + 1) return { ok: false, input, error: args.length < want ? "Error: Too few arguments" : "Error: Too many arguments" };
  for (const n of args.slice(1, want)) if (!/^[A-Za-z]\w*$/.test(n)) return { ok: false, input, error: "Error: Invalid variable name" };
  const a = await evaluate(args[0]!, giac, opts);
  if (!a.ok) return { ...a, input };
  if (a.output.k !== "mat") return { ok: false, input, error: "Error: Expected a matrix" };
  await giac(LUP);
  await giac(QRFIX);
  const tmp = "factors_";
  const m0 = translate(a.output, opts.settings).giac;
  const out = (await giac(`${tmp}:=${kind === "LU" ? `lup_(${m0})` : `qrfix_(qr(${m0}))`}`)).trim();
  if (/error/i.test(out)) return { ok: false, input, error: "Error: Invalid input" };
  const definitions: string[] = [];
  const names = args.slice(1, want);
  for (let i = 0; i < names.length; i++) {
    // Each factor read back as the handheld writes it, then stored as any matrix is.
    const raw = await giac(kind === "LU" ? `${tmp}[${i}]` : `simplify(${tmp}[${i}])`);
    const factor = format(raw.trim().replace(/^matrix(?=\[)/, ""), { hint: "plain", digits: opts.settings.digits });
    const r = await evaluate(`${names[i]}:=${print(factor)}`, giac, opts);
    if (!r.ok) return { ...r, input };
    definitions.push(...(r.definitions ?? []), ...(r.definition ? [r.definition] : []));
  }
  await giac(`purge(${tmp},lup_,qrfix_)`);
  return { ok: true, input, output: sym("Done"), outputText: "Done", definitions };
}
