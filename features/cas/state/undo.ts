// SPDX-License-Identifier: GPL-3.0-or-later
/**
 * Undo, per page (cas-app.tsx keeps one set of stacks per page id). Calculator
 * and Graphs pages undo their entry line (and a Calculator page its history);
 * a Geometry page undoes its objects, one drag of a point being one step. An
 * evaluated line, or a function entered on a Graphs page, is a wall: what it
 * defined is already in the engine, so undo stops there.
 */
import type { EditState } from "../math/editor";
import type { GeoObj } from "../geometry/model";
import type { CasDocument, HistoryEntry, Page } from "./document";

/** What undo puts back on a page: its entry line, and on a Calculator page its history; on a Geometry page, its objects. */
export type UndoSnap = { edit?: EditState; history?: HistoryEntry[]; objects?: GeoObj[] };
/** moving: the point a run of drags or nudges is moving, which undoes as one step. */
export type UndoStacks = { past: UndoSnap[]; future: UndoSnap[]; typing: boolean; moving?: string | null };
export const UNDO_LIMIT = 200;

/** One step of undo (back) or redo on the active page, moving the snapshot between the stacks. */
export function undoStep(d: CasDocument, back: boolean, all: Map<number, UndoStacks>): CasDocument {
  const p = d.pages[d.active];
  if (!p || (p.kind !== "calculator" && p.kind !== "graphs" && p.kind !== "geometry")) return d;
  const stacks = all.get(p.id);
  const from = back ? stacks?.past : stacks?.future;
  const snap = from?.pop();
  if (!stacks || !snap) return d;
  (back ? stacks.future : stacks.past).push(p.kind === "geometry" ? { objects: p.objects } : { edit: p.edit, ...(p.kind === "calculator" ? { history: p.history } : {}) });
  stacks.typing = false;
  stacks.moving = null;
  const pages = d.pages.slice();
  pages[d.active] =
    p.kind === "geometry"
      ? { ...p, objects: snap.objects ?? p.objects, tool: p.tool && { ...p.tool, picked: [] }, sel: null }
      : p.kind === "calculator"
        ? { ...p, edit: snap.edit ?? p.edit, history: snap.history ?? p.history, sel: null }
        : { ...p, edit: snap.edit ?? p.edit };
  return { ...d, pages };
}

/** The free point that moved, if that is the only change between two constructions. */
export function movedPoint(a: GeoObj[], b: GeoObj[]): string | null {
  if (a.length !== b.length) return null;
  let moved: string | null = null;
  for (let i = 0; i < a.length; i++) {
    if (a[i] === b[i]) continue;
    const [o, n] = [a[i]!, b[i]!];
    if (moved || o.kind !== "point" || n.kind !== "point" || o.id !== n.id) return null;
    moved = o.id;
  }
  return moved;
}

/**
 * Records the change from p to n on the stacks: typing: it comes from typing a
 * character, so a run of them undoes as one step.
 */
export function recordStep(all: Map<number, UndoStacks>, p: Page, n: Page, typing: boolean): void {
  if (p.kind === "geometry" && n.kind === "geometry") {
    const stacks = all.get(p.id) ?? { past: [], future: [], typing: false };
    all.set(p.id, stacks);
    // Anything else (a selection, a tool, panning) ends a run of moving one point.
    if (n.objects === p.objects) {
      stacks.moving = null;
      return;
    }
    const moving = movedPoint(p.objects, n.objects);
    stacks.future = [];
    // The same change seen twice (React runs updaters twice in development) is one step.
    if (stacks.past[stacks.past.length - 1]?.objects === p.objects) return;
    if (moving && stacks.moving === moving) return;
    stacks.past.push({ objects: p.objects });
    if (stacks.past.length > UNDO_LIMIT) stacks.past.shift();
    stacks.moving = moving;
    return;
  }
  if (p.kind !== n.kind || (p.kind !== "calculator" && p.kind !== "graphs") || (n.kind !== "calculator" && n.kind !== "graphs")) return;
  const stacks = all.get(p.id) ?? { past: [], future: [], typing: false };
  all.set(p.id, stacks);
  const wall =
    p.kind === "calculator" && n.kind === "calculator"
      ? n.history.length > p.history.length
      : p.kind === "graphs" &&
        n.kind === "graphs" &&
        (n.editing !== p.editing ||
          n.functions !== p.functions ||
          n.relations !== p.relations ||
          n.parametrics !== p.parametrics ||
          n.des !== p.des);
  if (wall) {
    stacks.past = [];
    stacks.future = [];
    stacks.typing = false;
    return;
  }
  const removed = p.kind === "calculator" && n.kind === "calculator" && n.history.length < p.history.length;
  // Moving the cursor ends a run of typing.
  if (!typing) stacks.typing = false;
  if (n.edit.row === p.edit.row && !removed) return;
  const top = stacks.past[stacks.past.length - 1];
  stacks.future = [];
  // The same change seen twice (React runs state updaters twice in development) is one step.
  if (top?.edit === p.edit) return;
  if (typing && stacks.typing && top) return;
  stacks.past.push({ edit: p.edit, ...(p.kind === "calculator" ? { history: p.history } : {}) });
  if (stacks.past.length > UNDO_LIMIT) stacks.past.shift();
  stacks.typing = typing;
}
