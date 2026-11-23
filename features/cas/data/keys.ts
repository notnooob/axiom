// SPDX-License-Identifier: GPL-3.0-or-later
/**
 * Data & Statistics keys (pure): Graph Trace's arrows, and Esc or Del for
 * what's selected (points, or a text). Returns the new page, or null when
 * the key isn't the page's.
 */
import type { Key } from "../keys";
import type { DataStatsPage } from "../state/document";
import { imageKey } from "./image";

export function dataKey(p: DataStatsPage, key: Key): DataStatsPage | null {
  if (p.imageSel) return imageKey(p, key);
  if (p.trace) {
    const { target, i } = p.trace;
    // ◄ ► move along what's traced; ▲ ▼ go to the next thing to trace (the data, a regression, a function …).
    if (key.k === "left" || key.k === "right") return { ...p, trace: { target, i: i + (key.k === "right" ? 1 : -1) } };
    if (key.k === "up" || key.k === "down") return { ...p, trace: { target: target + (key.k === "down" ? 1 : -1), i: 0 } };
    if (key.k === "esc" || key.k === "enter") return { ...p, trace: undefined };
    return null;
  }
  if (p.textSel !== undefined) {
    if (key.k === "delete" || key.k === "backspace") return { ...p, texts: (p.texts ?? []).filter((_, j) => j !== p.textSel), textSel: undefined };
    if (key.k === "esc") return { ...p, textSel: undefined };
  }
  if (p.selected && key.k === "esc") return { ...p, selected: undefined };
  return null;
}

/** Whether Esc belongs to the page (ending a trace, or letting go of what's selected) rather than leaving the document. */
export const dataTakesEsc = (p: DataStatsPage) => Boolean(p.trace || p.selected || p.textSel !== undefined || p.imageSel);
