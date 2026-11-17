// SPDX-License-Identifier: GPL-3.0-or-later
/** A Graphs page's curves as engine definitions, each page with its own names (graphs/model.ts). */
import type { Settings } from "../engine/evaluate";
import { translate } from "../engine/translate";
import { mapAst, parse, sym } from "../math/ast";
import type { GraphsPage } from "../state/document";
import { deName, fnName, parNames, relName } from "./model";

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
      out.push(`${xn}(t):=${t(c.x)}`, `${yn}(t):=${t(c.y)}`);
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

/** d1: y1′ = x·y1 becomes the slope function g…d1_(x,y) = x·y. */
export function deDefinition(page: number, n: number, y: number, rhs: string, settings: Settings): string {
  const body = mapAst(parse(rhs), (a) => (a.k === "sym" && a.name === `y${y}` ? sym("y") : a));
  return `${deName(page, n)}(x,y):=${translate(body, settings).giac}`;
}
