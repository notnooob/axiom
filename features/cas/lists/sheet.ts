// SPDX-License-Identifier: GPL-3.0-or-later
/**
 * Lists & Spreadsheet: keys (pure) and recalculation (through the engine).
 *
 * Rows of the selection: 0 is the name row (a name makes the column a list
 * variable for the whole problem), 1 the ◆ column-formula row, 2… the cells.
 * A cell or column formula starts with "="; cell references are a column
 * letter and a row number (a1, b12), and a whole unnamed column is its
 * letter with empty brackets (a[]), as on the handheld. The statistics
 * dialogs take a[] too.
 */
import type { Key } from "../keys";
import { parse } from "../math/ast";
import { editorKey, emptyEdit, rowText, setRow } from "../math/editor";
import { astToRow, chars, type Row } from "../math/tree";
import type { ListsColumn, ListsPage } from "../state/document";

export const COLS = 26;
export const letter = (i: number) => String.fromCharCode(65 + i);

/** What a cell holds as typed (the source of truth), for row ≥ 2. */
export function rawAt(p: ListsPage, row: number, col: number): string {
  const c = p.cols[col];
  if (!c) return "";
  if (row === 0) return c.name ?? "";
  if (row === 1) return c.formula ?? "";
  return c.cells[row - 2] ?? "";
}

/** What a cell shows: its computed value, else what was typed. */
export function shownAt(p: ListsPage, row: number, col: number): string {
  const c = p.cols[col];
  if (!c) return "";
  if (row < 2) return rawAt(p, row, col);
  return c.values?.[row - 2] || c.cells[row - 2] || "";
}

export const rowsUsed = (p: ListsPage) => Math.max(0, ...p.cols.map((c) => Math.max(c.cells.length, c.values?.length ?? 0)));

function setRaw(p: ListsPage, row: number, col: number, text: string): ListsPage {
  const cols = p.cols.slice();
  while (cols.length <= col) cols.push({ cells: [] });
  const c: ListsColumn = { ...cols[col]!, cells: cols[col]!.cells.slice() };
  if (row === 0) {
    if (text) c.name = text.toLowerCase();
    else delete c.name;
  } else if (row === 1) {
    if (text) c.formula = text.startsWith("=") ? text : `=${text}`;
    else delete c.formula;
  } else {
    while (c.cells.length < row - 2) c.cells.push("");
    c.cells[row - 2] = text;
    while (c.cells.length && !c.cells.at(-1)) c.cells.pop();
  }
  cols[col] = c;
  return { ...p, cols };
}

const toRow = (t: string): Row => {
  try {
    return astToRow(parse(t.replace(/^=/, "")));
  } catch {
    return chars(t);
  }
};

export type ListsEffect = { recalc: true } | { error: string } | null;

export function listsKey(p: ListsPage, key: Key): { page: ListsPage; effect: ListsEffect } {
  const done = (page: ListsPage, effect: ListsEffect = null) => ({ page, effect });
  const { row, col } = p.sel;
  const move = (dr: number, dc: number) => ({ ...p, sel: { row: Math.max(0, row + dr), col: Math.max(0, Math.min(COLS - 1, col + dc)) } });

  if (p.edit) {
    const commit = (then: ListsPage["sel"]) => {
      let text = rowText(p.edit!);
      if (row === 1 && text) text = `=${text.replace(/^=/, "")}`;
      if (row === 0 && text && !/^[a-zA-Z]\w*$/.test(text)) return done({ ...p, edit: null }, { error: "Error: Invalid name" });
      return done({ ...setRaw(p, row, col, text), edit: null, sel: then }, { recalc: true });
    };
    switch (key.k) {
      case "enter":
      case "down":
        return commit({ row: row + 1, col });
      case "up":
        return commit({ row: Math.max(0, row - 1), col });
      case "esc":
        return done({ ...p, edit: null });
      default: {
        const next = editorKey(p.edit, key);
        return done(next ? { ...p, edit: next } : p);
      }
    }
  }

  switch (key.k) {
    case "up":
      return done(move(-1, 0));
    case "down":
      return done(move(1, 0));
    case "left":
      return done(move(0, -1));
    case "right":
    case "tab":
      return done(move(0, 1));
    case "home":
      return done({ ...p, sel: { row: 2, col } });
    case "end":
      return done({ ...p, sel: { row: rowsUsed(p) + 2, col } });
    case "enter":
      return done({ ...p, edit: setRow(toRow(rawAt(p, row, col))) });
    case "backspace":
    case "delete":
    case "clear":
      return done(setRaw(p, row, col, ""), { recalc: true });
    case "char":
    case "text":
    case "paste":
    case "template": {
      // Typing on a cell starts editing it afresh.
      const next = editorKey(emptyEdit(), key);
      return done({ ...p, edit: next ?? emptyEdit() });
    }
    default:
      return done(p);
  }
}

// ---- Menu actions on the selected column and row

export function insertRow(p: ListsPage): ListsPage {
  const at = p.sel.row - 2;
  if (at < 0) return p;
  return { ...p, cols: p.cols.map((c) => (c.formula ? c : { ...c, cells: [...c.cells.slice(0, at), "", ...c.cells.slice(at)] })) };
}
export function deleteRow(p: ListsPage): ListsPage {
  const at = p.sel.row - 2;
  if (at < 0) return p;
  return { ...p, cols: p.cols.map((c) => (c.formula ? c : { ...c, cells: c.cells.filter((_, i) => i !== at) })) };
}
export function insertColumn(p: ListsPage): ListsPage {
  const cols = p.cols.slice();
  while (cols.length < p.sel.col) cols.push({ cells: [] });
  cols.splice(p.sel.col, 0, { cells: [] });
  return { ...p, cols: cols.slice(0, COLS) };
}
export function deleteColumn(p: ListsPage): ListsPage {
  return { ...p, cols: p.cols.filter((_, i) => i !== p.sel.col) };
}
export function clearColumn(p: ListsPage): ListsPage {
  return { ...p, cols: p.cols.map((c, i) => (i === p.sel.col ? { ...(c.name ? { name: c.name } : {}), cells: [] } : c)) };
}
export function sortColumn(p: ListsPage, desc: boolean): ListsPage {
  return {
    ...p,
    cols: p.cols.map((c, i) => {
      if (i !== p.sel.col || c.formula) return c;
      const nums = c.cells.filter((x) => x !== "");
      const key = (s: string) => Number(s.replace("−", "-"));
      nums.sort((a, b) => (Number.isFinite(key(a)) && Number.isFinite(key(b)) ? key(a) - key(b) : a.localeCompare(b)) * (desc ? -1 : 1));
      return { ...c, cells: nums, values: undefined };
    }),
  };
}
export function setColumnFormula(p: ListsPage, formula: string): ListsPage {
  return setRaw(p, 1, p.sel.col, formula);
}

/** Numbers in a column, for the statistics dialogs (cells that aren't numbers are skipped). */
export function columnNumbers(c: ListsColumn | undefined): number[] {
  if (!c) return [];
  const n = Math.max(c.cells.length, c.values?.length ?? 0);
  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    const v = Number((c.values?.[i] || c.cells[i] || "").replace(/−/g, "-").replace(/\.$/, ""));
    if (Number.isFinite(v) && (c.values?.[i] || c.cells[i])) out.push(v);
  }
  return out;
}

// ---- Recalculation

/** A list result "{1,2,{3,4}}" split at its top-level commas. */
export function splitList(text: string): string[] {
  const t = text.trim();
  if (!t.startsWith("{") || !t.endsWith("}")) return [t];
  const out: string[] = [];
  let depth = 0;
  let cur = "";
  for (const ch of t.slice(1, -1)) {
    if ("{[(".includes(ch)) depth++;
    if ("}])".includes(ch)) depth--;
    if (ch === "," && depth === 0) {
      out.push(cur);
      cur = "";
    } else cur += ch;
  }
  if (cur || out.length) out.push(cur);
  return out;
}

/** Replace cell references (b2) in a formula with the cells' current values. */
export function withRefs(formula: string, value: (row: number, col: number) => string): string {
  return formula.replace(/\b([a-z])(\d+)\b/gi, (m, l: string, n: string) => {
    const col = l.toLowerCase().charCodeAt(0) - 97;
    const v = value(Number(n) + 1, col);
    return v ? `(${v})` : m;
  });
}

export type Evaluate = (text: string) => Promise<{ ok: boolean; text: string; definitions: string[] }>;

/**
 * Whole-column references (a[], b[]) as list literals of the columns'
 * numbers, as the handheld lets formulas and the statistics dialogs name an
 * unnamed column.
 */
export function columnRefs(text: string, cols: ListsColumn[]): string {
  return text.replace(/\b([a-z])\[\]/gi, (_, l: string) => `{${columnNumbers(cols[l.toLowerCase().charCodeAt(0) - 97]).join(",")}}`);
}

/**
 * Work every formula out again, then define each named column as a list.
 * A formula can read a column worked out after it (to its right, or through
 * a name), so the formulas are worked out again until nothing changes; cells
 * still changing after one pass more than there are columns go round in a
 * circle, and show Error. Returns the new values and the engine definitions made.
 */
export async function recalc(p: ListsPage, run: Evaluate): Promise<{ page: ListsPage; definitions: string[] }> {
  const isFormula = (c: ListsColumn) => Boolean(c.formula) || c.cells.some((x) => x.startsWith("="));
  // Formula cells start blank, so a reference to one not worked out yet isn't its formula text.
  const cols = p.cols.map((c) => ({ ...c, values: c.cells.map((x) => (x.startsWith("=") ? "" : x)) }));
  const plain: string[] = [];
  const latest = new Map<string, string[]>();
  const valueAt = (row: number, col: number) => cols[col]?.values[row - 2] ?? "";
  const define = async (c: (typeof cols)[number]) => {
    if (!c.name) return [];
    let vals = c.values.slice();
    while (vals.length && !vals.at(-1)) vals.pop();
    vals = vals.map((v) => v || "undef");
    const r = await run(`${c.name}:={${vals.join(",")}}`);
    return r.ok ? r.definitions : [];
  };
  const formula = (text: string) => run(columnRefs(withRefs(text.slice(1), valueAt), cols));
  // Plain columns first, so formulas elsewhere can use their names.
  for (const c of cols) if (!isFormula(c)) plain.push(...(await define(c)));
  const passes = cols.length + 1;
  let moving = new Set<string>();
  for (let pass = 0; pass <= passes; pass++) {
    moving = new Set();
    for (const [ci, c] of cols.entries()) {
      if (!isFormula(c)) continue;
      const before = c.values.slice();
      if (c.formula) {
        const r = await formula(c.formula);
        c.values = r.ok ? splitList(r.text) : ["Error"];
      }
      for (let i = 0; i < c.cells.length; i++) {
        const cell = c.cells[i]!;
        if (!cell.startsWith("=")) continue;
        const r = await formula(cell);
        c.values[i] = r.ok ? r.text : "Error";
      }
      const n = Math.max(before.length, c.values.length);
      for (let i = 0; i < n; i++) if ((before[i] ?? "") !== (c.values[i] ?? "")) moving.add(`${ci}:${i}`);
      if (c.name) latest.set(c.name, await define(c));
    }
    if (!moving.size) break;
  }
  // Still changing after every pass: a circular reference.
  for (const key of moving) {
    const [ci, i] = key.split(":").map(Number) as [number, number];
    cols[ci]!.values[i] = "Error";
  }
  for (const c of cols) if (moving.size && c.name && isFormula(c)) latest.set(c.name, await define(c));
  return { page: { ...p, cols: cols.map((c) => ({ ...c })) }, definitions: [...plain, ...[...latest.values()].flat()] };
}
