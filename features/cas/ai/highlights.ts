// SPDX-License-Identifier: GPL-3.0-or-later
/**
 * The assistant's highlights: numbered rings (①, ②…) on the student's own
 * work, where it went wrong or what to look at: a Calculator history entry, a
 * spreadsheet cell, a graph's function or a point on it, a Geometry object.
 * They're the shell's state, never the document's: not saved, not in .tns,
 * not undone. Each remembers what it marked, and goes by itself once that
 * changes (the entry is gone, the cell or function is edited).
 */
import { letter, shownAt } from "../lists/sheet";
import { pageLabel, type CasDocument, type Page } from "../state/document";

export type HighlightTone = "mistake" | "look";

export type HighlightTarget =
  /** A history entry, by its id (n: its number in the history when highlighted). */
  | { kind: "entry"; id: number; n: number }
  /** row: 1 for the first row of values; text: the cell as it was shown. */
  | { kind: "cell"; col: number; row: number; text: string }
  | { kind: "fn"; n: number; text: string }
  | { kind: "point"; x: number; y: number }
  | { kind: "object"; id: string };

export type Highlight = { pageId: number; n: number; tone: HighlightTone; note: string; target: HighlightTarget };

/** One item as the highlight tool takes it. */
export type HighlightInput = {
  page?: number;
  entry?: number;
  cell?: string;
  fn?: number;
  point?: { x: number; y: number };
  object?: string;
  tone?: string;
  note?: string;
};

export const MAX_HIGHLIGHTS = 9;

const KIND_SAID: Partial<Record<Page["kind"], string>> = { calculator: "Calculator", lists: "Lists & Spreadsheet", graphs: "Graphs", geometry: "Geometry" };

function targetOf(p: Page, label: string, it: HighlightInput): HighlightTarget | string {
  const given = (["entry", "cell", "fn", "point", "object"] as const).filter((k) => it[k] !== undefined);
  if (given.length !== 1) return `give exactly one of entry, cell, fn, point or object (got ${given.length ? given.join(", ") : "none"})`;
  const wrongPage = (want: Page["kind"]) => `${given[0]} is for a ${KIND_SAID[want]} page; page ${label} is ${KIND_SAID[p.kind] ?? p.kind}`;
  switch (given[0]) {
    case "entry": {
      if (p.kind !== "calculator") return wrongPage("calculator");
      const n = Number(it.entry);
      const e = p.history[n - 1];
      if (!Number.isInteger(n) || !e) return `entry ${it.entry}: page ${label} has ${p.history.length} ${p.history.length === 1 ? "entry" : "entries"}`;
      return { kind: "entry", id: e.id, n };
    }
    case "cell": {
      if (p.kind !== "lists") return wrongPage("lists");
      const m = /^([A-Z])(\d+)$/i.exec(String(it.cell).trim());
      if (!m || Number(m[2]) < 1) return `cell "${it.cell}" isn't a cell like B3 (a column letter, then the row from 1)`;
      const col = m[1]!.toUpperCase().charCodeAt(0) - 65;
      const row = Number(m[2]);
      return { kind: "cell", col, row, text: shownAt(p, row + 1, col) };
    }
    case "fn": {
      if (p.kind !== "graphs") return wrongPage("graphs");
      const f = p.functions.find((x) => x.n === Number(it.fn));
      if (!f) return `there's no f${it.fn}(x) on page ${label} (it has ${p.functions.map((x) => `f${x.n}`).join(", ") || "none"})`;
      return { kind: "fn", n: f.n, text: f.text };
    }
    case "point": {
      if (p.kind !== "graphs") return wrongPage("graphs");
      const x = Number(it.point?.x);
      const y = Number(it.point?.y);
      if (!Number.isFinite(x) || !Number.isFinite(y)) return "point needs numbers x and y";
      return { kind: "point", x, y };
    }
    case "object": {
      if (p.kind !== "geometry") return wrongPage("geometry");
      const id = String(it.object);
      if (!p.objects.some((o) => o.id === id)) return `there's no object ${id} on page ${label} (it has ${p.objects.map((o) => o.id).join(", ") || "none"})`;
      return { kind: "object", id };
    }
  }
  return "nothing to highlight";
}

/** The tool's items as highlights, numbered in order; all or nothing, with what's wrong if one can't be. */
export function resolveHighlights(doc: CasDocument, items: HighlightInput[]): { highlights: Highlight[] } | { error: string } {
  if (!items.length) return { error: "Give at least one item to highlight, or clear: true." };
  if (items.length > MAX_HIGHLIGHTS) return { error: `At most ${MAX_HIGHLIGHTS} highlights at once.` };
  const out: Highlight[] = [];
  for (const [i, it] of items.entries()) {
    const at = it.page ?? doc.active;
    const p = doc.pages[at];
    if (!p) return { error: `items[${i}]: no page ${at}; the document has ${doc.pages.length}. Nothing was highlighted.` };
    const label = pageLabel(doc, at);
    const target = targetOf(p, label, it);
    if (typeof target === "string") return { error: `items[${i}]: ${target}. Nothing was highlighted.` };
    const note = String(it.note ?? "").trim();
    if (!note) return { error: `items[${i}]: give a short note (what's wrong, or what to look at). Nothing was highlighted.` };
    out.push({ pageId: p.id, n: i + 1, tone: it.tone === "look" ? "look" : "mistake", note: note.slice(0, 80), target });
  }
  return { highlights: out };
}

/** The highlights whose page and target are still as they were: an edited cell or function, or a cleared entry, loses its ring. */
export function liveHighlights(doc: CasDocument, hs: Highlight[]): Highlight[] {
  return hs.filter((h) => {
    const p = doc.pages.find((x) => x.id === h.pageId);
    if (!p) return false;
    const t = h.target;
    switch (t.kind) {
      case "entry":
        return p.kind === "calculator" && p.history.some((e) => e.id === t.id);
      case "cell":
        return p.kind === "lists" && shownAt(p, t.row + 1, t.col) === t.text;
      case "fn":
        return p.kind === "graphs" && p.functions.some((f) => f.n === t.n && f.text === t.text && !f.hidden);
      case "point":
        return p.kind === "graphs";
      case "object":
        return p.kind === "geometry" && p.objects.some((o) => o.id === t.id);
    }
  });
}

/** What a highlight marks, in words: "entry 3", "cell B4", "f1", "point (1, −2)", "object A". */
export function targetSaid(t: HighlightTarget): string {
  switch (t.kind) {
    case "entry":
      return `entry ${t.n}`;
    case "cell":
      return `cell ${letter(t.col)}${t.row}`;
    case "fn":
      return `f${t.n}`;
    case "point":
      return `point (${t.x}, ${t.y})`;
    case "object":
      return `object ${t.id}`;
  }
}

/** For the screen reader, and the tool's result: "Highlighted 1: entry 3 on 1.1, sign error." */
export function highlightsSaid(doc: CasDocument, hs: Highlight[]): string {
  if (!hs.length) return "Highlights cleared.";
  const label = (id: number) => {
    const i = doc.pages.findIndex((p) => p.id === id);
    return i < 0 ? "" : ` on ${pageLabel(doc, i)}`;
  };
  return `Highlighted ${hs.map((h) => `${h.n}: ${targetSaid(h.target)}${label(h.pageId)}, ${h.note}`).join(". ")}.`;
}

/** ①…⑨, the badge on screen and how the reply refers to it. */
export const badge = (n: number) => String.fromCharCode(0x2460 + n - 1);
