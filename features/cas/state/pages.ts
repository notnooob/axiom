// SPDX-License-Identifier: GPL-3.0-or-later
/**
 * Rearranging a document, as the Page Sorter and the doc menu's Problem
 * items do: delete or move a page, delete or rename a problem. Problems are
 * numbered from 1 with no gaps, so deleting one renumbers those after it
 * (their pages, kept definitions, names and pending variables).
 */
import { problemOf, type CasDocument, type Page } from "./document";
import { tidy } from "./layout";

/** A map keyed by problem number, with the deleted problem's entry gone and later ones moved down one. */
function shifted<T>(map: Record<string, T> | undefined, gone: number): Record<string, T> | undefined {
  if (!map) return map;
  const out: Record<string, T> = {};
  for (const [k, v] of Object.entries(map)) {
    const n = Number(k);
    if (n < gone) out[k] = v;
    else if (n > gone) out[String(n - 1)] = v;
  }
  return out;
}

const renumbered = (p: Page, gone: number): Page => (problemOf(p) > gone ? { ...p, problem: problemOf(p) - 1 } : p);

/**
 * Delete a problem and its pages. The page shown afterwards is the first of
 * the problem before it (or, deleting the first, of the one after). Null
 * when it's the document's only problem, which the handheld won't delete.
 */
export function deleteProblem(doc: CasDocument, problem: number): CasDocument | null {
  const problems = [...new Set(doc.pages.map(problemOf))];
  if (problems.length < 2) return null;
  const shownBefore = problemOf(doc.pages[doc.active]);
  const kept = doc.pages.filter((p) => problemOf(p) !== problem);
  const pages = kept.map((p) => renumbered(p, problem));
  let active: number;
  if (shownBefore === problem) {
    const target = problem > 1 ? problem - 1 : 1;
    active = Math.max(0, pages.findIndex((p) => problemOf(p) === target));
  } else {
    const id = doc.pages[doc.active]!.id;
    active = Math.max(0, pages.findIndex((p) => p.id === id));
  }
  return tidy({
    ...doc,
    pages,
    active,
    problems: shifted(doc.problems, problem),
    pendingSym: shifted(doc.pendingSym, problem),
    problemNames: shifted(doc.problemNames, problem),
  });
}

/** Delete a page; the last page of a problem takes the problem with it. Null for the document's only page. */
export function deletePage(doc: CasDocument, index: number): CasDocument | null {
  const page = doc.pages[index];
  if (!page || doc.pages.length < 2) return null;
  const problem = problemOf(page);
  if (doc.pages.filter((p) => problemOf(p) === problem).length === 1) return deleteProblem(doc, problem);
  const pages = doc.pages.filter((_, i) => i !== index);
  const active = doc.active > index || doc.active === pages.length ? doc.active - 1 : doc.active;
  return tidy({ ...doc, pages, active });
}

/** Move a page one place earlier (−1) or later (1) within its problem; unchanged at the problem's edge. */
export function movePage(doc: CasDocument, index: number, dir: -1 | 1): { doc: CasDocument; index: number } {
  const to = index + dir;
  const a = doc.pages[index];
  const b = doc.pages[to];
  if (!a || !b || problemOf(a) !== problemOf(b)) return { doc, index };
  const pages = doc.pages.slice();
  pages[index] = b;
  pages[to] = a;
  const active = doc.active === index ? to : doc.active === to ? index : doc.active;
  return { doc: { ...doc, pages, active }, index: to };
}

/** A problem's name: its own, or "Problem n". */
export const problemTitle = (doc: CasDocument, problem: number) => doc.problemNames?.[String(problem)] || `Problem ${problem}`;

export function renameProblem(doc: CasDocument, problem: number, name: string): CasDocument {
  const problemNames = { ...(doc.problemNames ?? {}) };
  if (name.trim()) problemNames[String(problem)] = name.trim();
  else delete problemNames[String(problem)];
  return { ...doc, problemNames };
}
