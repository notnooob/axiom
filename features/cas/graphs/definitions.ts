// SPDX-License-Identifier: GPL-3.0-or-later
/** A Graphs page's curves as engine definitions, each page with its own names (graphs/model.ts). */
import type { Settings } from "../engine/evaluate";
import { translate } from "../engine/translate";
import { mapAst, parse, sym } from "../math/ast";
import { print } from "../math/print";
import type { GraphsPage } from "../state/document";
import { deName, fnName, parNames, relName } from "./model";
import { seqDefinition } from "./sequence";
import { surfaceName } from "./graph3d";

/**
 * The engine definitions that give one Graphs page its own copies of its
 * curves (see fnName in graphs/model.ts). Used when a curve is entered and
 * when a saved document is opened.
 */
export function pageDefinitions(page: GraphsPage, settings: Settings): string[] {
  const t = (text: string) => translate(parse(text), settings).giac;
  const out: string[] = [];
  for (const f of page.functions) {
    try {
      out.push(`${fnName(page.id, f.n)}(x):=${t(f.text)}`);
    } catch {
      // A function that no longer parses just isn't drawn.
    }
  }
  for (const r of page.relations ?? []) {
    try {
      const ast = parse(r.text);
      if (ast.k === "bin")
        out.push(
          `${relName(page.id, r.n)}(x,y):=(${translate(ast.a, settings).giac})-(${translate(ast.b, settings).giac})`,
        );
    } catch {
      // As above.
    }
  }
  for (const c of page.parametrics ?? []) {
    try {
      const [xn, yn] = parNames(page.id, c.n);
      const [x, y] = c.polar ? polarXY(c.x) : [c.x, c.y];
      out.push(`${xn}(t):=${t(x)}`, `${yn}(t):=${t(y)}`);
    } catch {
      // As above.
    }
  }
  for (const s of page.surfaces ?? []) {
    try {
      out.push(`${surfaceName(page.id, s.n)}(x,y):=${t(s.text)}`);
    } catch {
      // As above.
    }
  }
  for (const s of page.sequences ?? []) {
    try {
      out.push(seqDefinition(page.id, s.n, s.rhs, settings).def);
    } catch {
      // As above.
    }
  }
  for (const d of page.des ?? []) {
    try {
      out.push(deDefinition(page.id, d.n, d.y, d.rhs, settings));
    } catch {
      // As above.
    }
  }
  return out;
}

/** A polar curve's r(θ) as the parametric pair it's drawn with: x = r·cos θ, y = r·sin θ, in t. */
export function polarXY(r: string): [string, string] {
  const inT = print(mapAst(parse(r), (a) => (a.k === "sym" && a.name === "θ" ? sym("t") : a)));
  return [`(${inT})*cos(t)`, `(${inT})*sin(t)`];
}

/** d1: y1′ = x·y1 becomes the slope function g…d1_(x,y) = x·y. */
export function deDefinition(page: number, n: number, y: number, rhs: string, settings: Settings): string {
  const body = mapAst(parse(rhs), (a) => (a.k === "sym" && a.name === `y${y}` ? sym("y") : a));
  return `${deName(page, n)}(x,y):=${translate(body, settings).giac}`;
}
