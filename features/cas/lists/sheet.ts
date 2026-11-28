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
import { isReservedName, parse } from "../math/ast";
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

/**
 * What the formula row starts with, as the handheld writes it: the column's
 * name and := for a named column (b:=log(x)), else =.
 */
export const formulaPrefix = (p: ListsPage, col: number) => {
  const name = p.cols[col]?.name;
  return name ? `${name}:=` : "=";
};

/** A cell's text as maths: a formula keeps its = (or name:=) in front, so editing it doesn't lose it. */
function formulaRow(prefix: string, body: string): Row {
  return [...chars(prefix), ...toRow(body)];
}

/** The row an edit starts from: what the cell holds, with a formula's = or name:= in front. */
export function editRow(p: ListsPage, row: number, col: number): Row {
  const raw = rawAt(p, row, col);
  if (row === 0) return chars(raw);
  if (row === 1) return raw ? formulaRow(formulaPrefix(p, col), raw.replace(/^=/, "")) : chars(formulaPrefix(p, col));
  return raw.startsWith("=") ? formulaRow("=", raw.slice(1)) : toRow(raw);
}

/** A cell whose value is text ("red", a result's name): the text, shown as words rather than maths. */
export function textAt(p: ListsPage, row: number, col: number): string | null {
  if (row < 2) return null;
  return /^"([^"]*)"$/.exec(shownAt(p, row, col))?.[1] ?? null;
}

/** What a cell shows when it isn't being edited: the formula row's formula, else the worked-out value. */
export function displayRow(p: ListsPage, row: number, col: number): Row {
  if (row === 0) return chars(rawAt(p, 0, col));
  if (row === 1) return rawAt(p, 1, col) ? editRow(p, 1, col) : [];
  // Text shows without its quotes, as the handheld shows a result's name ("Title" as Title).
  const text = textAt(p, row, col);
  if (text !== null) return chars(text);
  const shown = shownAt(p, row, col);
  return shown.startsWith("=") ? formulaRow("=", shown.slice(1)) : shown ? toRow(shown) : [];
}

/**
 * The line under the spreadsheet: the selected cell's reference (B for the
 * formula row, B3 for a cell) and what it holds in full, a formula as
 * typed rather than its value, as the handheld shows it.
 */
export function cellLine(p: ListsPage): { ref: string; row: Row } {
  const { row, col } = p.sel;
  const ref = row < 2 ? letter(col) : `${letter(col)}${row - 1}`;
  // A cell filled by its column's formula has nothing typed in it: the line shows its value.
  return { ref, row: row < 2 || !rawAt(p, row, col) ? displayRow(p, row, col) : editRow(p, row, col) };
}

/** Names a formula binds for itself (seq's n, Σ's k): they refer to nothing outside it. */
const BINDERS = new Set(["seq", "Σ", "Π", "∫", "d", "limit", "sum", "product", "seqGen"]);

/**
 * The single letters a formula uses that are both a column's letter and a
 * defined variable (a column named x makes the variable x, and x is also
 * column X): the handheld asks which is meant (Conflict Detected).
 */
export function formulaConflicts(formula: string, isVariable: (name: string) => boolean): string[] {
  let ast: unknown;
  try {
    // Column references written out (x[]) are settled already.
    ast = parse(formula.replace(/^=/, "").replace(/\b[a-z]\[\]/gi, "0"));
  } catch {
    return [];
  }
  const found = new Set<string>();
  const bound = new Set<string>();
  const walk = (n: unknown): void => {
    if (!n || typeof n !== "object") return;
    if (Array.isArray(n)) return n.forEach(walk);
    const node = n as { k?: string; name?: string; f?: string; args?: { k?: string; name?: string }[] };
    if (node.k === "call" && node.f && BINDERS.has(node.f) && node.args?.[1]?.k === "sym" && node.args[1].name) bound.add(node.args[1].name);
    if (node.k === "sym" && node.name && /^[a-z]$/.test(node.name)) found.add(node.name);
    Object.values(node).forEach(walk);
  };
  walk(ast);
  return [...found].filter((name) => !bound.has(name) && isVariable(name)).sort();
}

/** The formula with each conflicting letter settled: a column reference becomes x[], a variable stays x. */
export function resolveConflicts(formula: string, choices: Record<string, "column" | "variable">): string {
  return formula.replace(/(?<![\w.])([a-z])(?![\w[(])/g, (m, name: string) => (choices[name] === "column" ? `${name}[]` : m));
}

/** The formula an edit is about to commit, without its = or name:=, or null when it isn't a formula. */
export function editingFormula(p: ListsPage): string | null {
  if (!p.edit || p.sel.row === 0) return null;
  const text = rowText(p.edit);
  if (p.sel.row === 1) return text.startsWith(formulaPrefix(p, p.sel.col)) ? text.slice(formulaPrefix(p, p.sel.col).length) : text.replace(/^=/, "");
  return text.startsWith("=") ? text.slice(1) : null;
}

/** The edit with its formula replaced (after Conflict Detected), its = or name:= kept. */
export function withFormula(p: ListsPage, formula: string): ListsPage {
  const prefix = p.sel.row === 1 ? formulaPrefix(p, p.sel.col) : "=";
  return { ...p, edit: setRow(chars(`${prefix}${formula}`)) };
}

/**
 * dataLoss: the entry would wipe out what's in its column (a value typed into a
 * column a formula fills, or a column formula over typed values), so the shell
 * asks first, as the handheld's Data Loss does: OK is `ok`, Cancel is `cancel`.
 */
export type ListsEffect = { recalc: true } | { error: string } | { dataLoss: { ok: ListsPage; cancel: ListsPage } } | null;

export function listsKey(p: ListsPage, key: Key): { page: ListsPage; effect: ListsEffect } {
  const done = (page: ListsPage, effect: ListsEffect = null) => ({ page, effect });
  if (p.mode) return modeKey(p, key);
  // A picked row or column lets go at the next key; ▼ from a picked column comes back to its name, as on the handheld.
  if (p.pick) {
    const { pick: _, ...rest } = p;
    return key.k === "down" && p.pick === "col" ? done(rest) : listsKey(rest, key);
  }
  const { row, col } = p.sel;
  const move = (dr: number, dc: number) => ({ ...p, sel: { row: Math.max(0, row + dr), col: Math.max(0, Math.min(COLS - 1, col + dc)) } });

  if (p.edit) {
    const commit = (then: ListsPage["sel"]) => {
      let text = rowText(p.edit!);
      // The formula row is stored as =formula, without the column's name:= in front of it.
      if (row === 1) {
        const prefix = formulaPrefix(p, col);
        const body = text.startsWith(prefix) ? text.slice(prefix.length) : text.replace(/^=/, "");
        text = body.trim() ? `=${body}` : "";
      }
      if (row === 0 && text && !/^[a-zA-Z]\w*$/.test(text)) return done({ ...p, edit: null }, { error: "Error: Invalid name" });
      // A command's name (count, mean …) can't hold a list: the engine would refuse it without a word.
      if (row === 0 && text && isReservedName(text)) return done({ ...p, edit: null }, { error: "Error: Reserved name" });
      const entered: ListsPage = { ...setRaw(p, row, col, text), edit: null, sel: then };
      const c = p.cols[col];
      const cancel: ListsPage = { ...p, edit: null, sel: then };
      // A value typed into a column its formula fills: OK takes the formula (and all it filled) away and keeps just the value.
      if (row >= 2 && c?.formula && text && text !== (c.cells[row - 2] ?? "")) {
        const cols = entered.cols.slice();
        const { formula: _f, values: _v, ...rest } = cols[col]!;
        cols[col] = rest;
        return done(p, { dataLoss: { ok: { ...entered, cols }, cancel } });
      }
      // A column formula over typed values: OK replaces them with what the formula gives.
      if (row === 1 && text && !c?.formula && c?.cells.some((x) => x !== "")) {
        const cols = entered.cols.slice();
        cols[col] = { ...cols[col]!, cells: [] };
        return done(p, { dataLoss: { ok: { ...entered, cols }, cancel } });
      }
      return done(entered, { recalc: true });
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
      // Above a column's name is the column itself: ▲ there picks the whole column.
      return done(row === 0 ? { ...p, pick: "col" } : move(-1, 0));
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
      return done({ ...p, edit: setRow(editRow(p, row, col)) });
    case "backspace":
    case "delete":
    case "clear":
      return done(setRaw(p, row, col, ""), { recalc: true });
    case "char":
    case "text":
    case "paste":
    case "template": {
      // Typing on a cell starts editing it afresh; on the formula row, after the column's name:= (or =).
      const start = row === 1 ? setRow(chars(formulaPrefix(p, col))) : emptyEdit();
      const next = editorKey(start, key);
      return done({ ...p, edit: next ?? start });
    }
    default:
      return done(p);
  }
}

// ---- Modes the arrows drive: Move Column, Resize, Fill

/** A column's width in cqw: as Resize left it, or the standard width. */
export const DEFAULT_WIDTH = 21;
export const MIN_WIDTH = 6;
/** Maximize: the screen's width less the row numbers and the scrollbar. */
export const MAX_WIDTH = 88;
export const widthOf = (p: ListsPage, col: number) => p.widths?.[col] ?? DEFAULT_WIDTH;
const withWidth = (p: ListsPage, col: number, w: number): ListsPage => ({ ...p, widths: { ...p.widths, [col]: Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, w)) } });

/** Actions ▸ Move Column: the column is picked and a line shows the gap it will go into, starting just right of it. */
export const startMove = (p: ListsPage): ListsPage => ({ ...p, edit: null, pick: "col", mode: { kind: "move", to: p.sel.col + 1 } });
/** Resize ▸ Resize Column Width: ◄ ► narrow and widen it. */
export const startResize = (p: ListsPage): ListsPage => ({ ...p, edit: null, mode: { kind: "resize", from: widthOf(p, p.sel.col) } });
export const maximizeColumn = (p: ListsPage): ListsPage => withWidth(p, p.sel.col, MAX_WIDTH);
/** Minimize: just wide enough for the column's longest entry. */
export function minimizeColumn(p: ListsPage): ListsPage {
  const c = p.cols[p.sel.col];
  const longest = Math.max(1, (c?.name ?? "").length + 2, ...Array.from({ length: rowsUsed(p) }, (_, i) => shownAt(p, i + 2, p.sel.col).length));
  return withWidth(p, p.sel.col, longest * 2.1 + 2);
}
// ---- The function table's column widths (Actions ▸ Resize while it shows)

/** A function column's width in cqw: as Resize left it, or its even share with the x column of `count` columns. */
export function tableWidth(p: ListsPage, col: number, count: number): number {
  return p.table?.widths?.[col] ?? 97 / (count + 1);
}
function withTableWidth(p: ListsPage, col: number, w: number | undefined): ListsPage {
  if (!p.table) return p;
  const widths = { ...p.table.widths };
  if (w === undefined) delete widths[col];
  else widths[col] = Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, w));
  return { ...p, table: { ...p.table, widths } };
}
/** Resize Column Width on the table's picked column. */
export const startTableResize = (p: ListsPage): ListsPage => (p.table ? { ...p, table: { ...p.table, resize: { from: p.table.widths?.[p.table.col ?? 0] } } } : p);
/** ◄ ► narrow and widen the column, Enter keeps it and Esc puts it back; null for a key the mode doesn't take. */
export function tableResizeKey(p: ListsPage, key: Key, count: number): ListsPage | null {
  const t = p.table;
  if (!t?.resize) return null;
  const col = t.col ?? 0;
  if (key.k === "left" || key.k === "right") return withTableWidth(p, col, tableWidth(p, col, count) + (key.k === "left" ? -2 : 2));
  const { resize, ...rest } = t;
  if (key.k === "enter") return { ...p, table: rest };
  if (key.k === "esc") return withTableWidth({ ...p, table: rest }, col, resize.from);
  return p;
}
/** Maximize Column Width: as wide as the screen allows. */
export const maximizeTableColumn = (p: ListsPage): ListsPage => withTableWidth(p, p.table?.col ?? 0, MAX_WIDTH);
/** Just wide enough for `chars` characters (the column's definition or its numbers, whichever is longer). */
export const fitTableColumn = (p: ListsPage, col: number, chars: number): ListsPage => withTableWidth(p, col, Math.max(10, chars) * 2.1 + 2);

/** Data ▸ Fill: from a cell, the arrows stretch a range down or right, and Enter copies the cell into it. */
export const startFill = (p: ListsPage): ListsPage => (p.sel.row < 2 ? p : { ...p, edit: null, mode: { kind: "fill", rows: 0, cols: 0 } });

/** The cells a Fill range (or Select Formula Range's) covers, row by row. */
export function fillRange(p: ListsPage): { row: number; col: number }[] {
  const m = p.mode;
  const far = m?.kind === "range" ? m.to : m?.kind === "fill" ? { row: p.sel.row + m.rows, col: p.sel.col + m.cols } : null;
  if (!far) return [];
  const out: { row: number; col: number }[] = [];
  for (let r = Math.min(p.sel.row, far.row); r <= Math.max(p.sel.row, far.row); r++)
    for (let c = Math.min(p.sel.col, far.col); c <= Math.max(p.sel.col, far.col); c++) out.push({ row: r, col: c });
  return out;
}

/** A formula's cell references moved by rows and columns, as Fill copies it; $ fixes a reference's row or column. */
export function shiftRefs(formula: string, rows: number, cols: number): string {
  return formula.replace(/(\$?)\b([a-z])(\$?)(\d+)\b/gi, (m, fixCol: string, l: string, fixRow: string, n: string) => {
    const col = fixCol ? l : String.fromCharCode(l.toLowerCase().charCodeAt(0) + cols);
    const row = fixRow ? Number(n) : Number(n) + rows;
    if (!/[a-z]/i.test(col) || col.toLowerCase() > "z" || row < 1) return m;
    return `${fixCol}${col}${fixRow}${row}`;
  });
}

/** Move the selected column into the gap before column `to` (0 to COLS). */
export function moveColumn(p: ListsPage, to: number): ListsPage {
  const from = p.sel.col;
  if (to === from || to === from + 1) return p;
  const cols = p.cols.slice();
  while (cols.length < Math.max(from + 1, to)) cols.push({ cells: [] });
  const [moved] = cols.splice(from, 1);
  const at = to > from ? to - 1 : to;
  cols.splice(at, 0, moved!);
  return { ...p, cols: cols.slice(0, COLS), sel: { ...p.sel, col: at } };
}

/** A row's height in cqw: as Resize Row Height left it, or the standard one. */
export const DEFAULT_HEIGHT = 6.4;
export const heightOf = (p: ListsPage, row: number) => p.heights?.[row] ?? DEFAULT_HEIGHT;
/** Resize ▸ Resize Row Height: ▲ ▼ lower and raise the selected row. */
export const startRowResize = (p: ListsPage): ListsPage => ({ ...p, edit: null, mode: { kind: "rowsize", from: heightOf(p, p.sel.row) } });
const withHeight = (p: ListsPage, row: number, h: number): ListsPage => ({ ...p, heights: { ...p.heights, [row]: Math.max(4, Math.min(40, h)) } });

/** A cell's reference as a formula writes it (b3), or a range (a1:b3). */
const ref = (row: number, col: number) => `${letter(col).toLowerCase()}${row - 1}`;
export function rangeText(from: { row: number; col: number }, to: { row: number; col: number }): string {
  const [r0, r1] = [Math.min(from.row, to.row), Math.max(from.row, to.row)];
  const [c0, c1] = [Math.min(from.col, to.col), Math.max(from.col, to.col)];
  return r0 === r1 && c0 === c1 ? ref(r0, c0) : `${ref(r0, c0)}:${ref(r1, c1)}`;
}

/**
 * Actions ▸ Select ▸ Select Formula Range, while a formula is being edited:
 * the range starts at the cell, and what it covers is written at the
 * cursor. Only a formula (starting =) takes one, as on the handheld.
 */
export function startRange(p: ListsPage): { page: ListsPage; error?: string } {
  if (!p.edit || p.sel.row < 2) return { page: p, error: "Error: A range is picked while a cell's formula is being edited" };
  if (!rowText(p.edit).trimStart().startsWith("=")) return { page: p, error: "Syntax Error: A range can only go in a formula that starts with =" };
  const base = p.edit;
  const to = { ...p.sel };
  return { page: { ...p, edit: editorKey(base, { k: "text", text: rangeText(p.sel, to) }) ?? base, mode: { kind: "range", base, to } } };
}

function modeKey(p: ListsPage, key: Key): { page: ListsPage; effect: ListsEffect } {
  const m = p.mode!;
  const { mode: _, ...rest } = p;
  const done = (page: ListsPage, effect: ListsEffect = null) => ({ page, effect });
  if (m.kind === "range") {
    const step = { up: [-1, 0], down: [1, 0], left: [0, -1], right: [0, 1] }[key.k as string];
    if (step) {
      const to = { row: Math.max(2, m.to.row + step[0]!), col: Math.max(0, Math.min(COLS - 1, m.to.col + step[1]!)) };
      return done({ ...p, edit: editorKey(m.base, { k: "text", text: rangeText(p.sel, to) }) ?? m.base, mode: { ...m, to } });
    }
    // Enter keeps the range in the formula and goes on editing it; Esc takes it out again.
    if (key.k === "enter") return done(rest);
    if (key.k === "esc") return done({ ...rest, edit: m.base });
    return done(p);
  }
  if (m.kind === "rowsize") {
    if (key.k === "up" || key.k === "down") return done(withHeight(p, p.sel.row, heightOf(p, p.sel.row) + (key.k === "up" ? -0.8 : 0.8)));
    if (key.k === "enter") return done(rest);
    if (key.k === "esc") return done(withHeight(rest, p.sel.row, m.from));
    return done(p);
  }
  if (m.kind === "move") {
    if (key.k === "left" || key.k === "right") return done({ ...p, mode: { kind: "move", to: Math.max(0, Math.min(COLS, m.to + (key.k === "left" ? -1 : 1))) } });
    if (key.k === "enter") return done({ ...moveColumn(rest, m.to), pick: "col" }, { recalc: true });
    if (key.k === "esc") return done(rest);
    return done(p);
  }
  if (m.kind === "resize") {
    if (key.k === "left" || key.k === "right") return done(withWidth(p, p.sel.col, widthOf(p, p.sel.col) + (key.k === "left" ? -2 : 2)));
    if (key.k === "enter") return done(rest);
    if (key.k === "esc") return done(withWidth(rest, p.sel.col, m.from));
    return done(p);
  }
  // Fill: the arrows stretch the range from the selected cell; Enter copies the cell into every cell of it.
  const grow = (rows: number, cols: number) => done({ ...p, mode: { kind: "fill", rows: Math.max(0, rows), cols: Math.max(0, Math.min(COLS - 1 - p.sel.col, cols)) } });
  if (key.k === "down") return grow(m.rows + 1, m.cols);
  if (key.k === "up") return grow(m.rows - 1, m.cols);
  if (key.k === "right") return grow(m.rows, m.cols + 1);
  if (key.k === "left") return grow(m.rows, m.cols - 1);
  if (key.k === "esc") return done(rest);
  if (key.k !== "enter") return done(p);
  const source = rawAt(p, p.sel.row, p.sel.col);
  let out: ListsPage = rest;
  for (const { row, col } of fillRange(p)) {
    if (row === p.sel.row && col === p.sel.col) continue;
    const dr = row - p.sel.row;
    const dc = col - p.sel.col;
    out = setRaw(out, row, col, source.startsWith("=") ? `=${shiftRefs(source.slice(1), dr, dc)}` : source);
  }
  return done(out, { recalc: true });
}

// ---- Cut, Copy and Paste (the context menu)

/** What Copy takes: the picked column or row, else the selected cell, as rows of cells as typed. */
export function copyCells(p: ListsPage): string[][] {
  if (p.pick === "col") return Array.from({ length: Math.max(1, p.cols[p.sel.col]?.cells.length ?? 0) }, (_, i) => [rawAt(p, i + 2, p.sel.col)]);
  if (p.pick === "row") return [Array.from({ length: Math.max(1, p.cols.length) }, (_, c) => rawAt(p, p.sel.row, c))];
  return [[rawAt(p, p.sel.row, p.sel.col)]];
}
/** Cut: Copy, then the cells emptied. */
export function clearCells(p: ListsPage): ListsPage {
  if (p.pick === "col") return clearColumn(p);
  if (p.pick === "row") return p.cols.reduce((q, _, c) => setRaw(q, p.sel.row, c, ""), p);
  return setRaw(p, p.sel.row, p.sel.col, "");
}
/** Paste: the copied cells with their top left at the selection (a column's first value for a picked column). */
export function pasteCells(p: ListsPage, grid: string[][]): ListsPage {
  const top = p.pick === "col" || p.sel.row < 2 ? 2 : p.sel.row;
  const left = p.pick === "row" ? 0 : p.sel.col;
  let out: ListsPage = { ...p, pick: undefined };
  grid.forEach((cells, r) => cells.forEach((text, c) => left + c < COLS && (out = setRaw(out, top + r, left + c, text))));
  return out;
}

// ---- Color ▸ Fill Color, Text Color

const cellKey = (row: number, col: number) => `${col}:${row}`;
export const styleAt = (p: ListsPage, row: number, col: number) => p.styles?.[cellKey(row, col)];
/** A colour for the selected cell, or every cell of a picked column or row; "" takes it off. */
export function setCellColour(p: ListsPage, kind: "fill" | "text", colour: string): ListsPage {
  const cells =
    p.pick === "col"
      ? Array.from({ length: Math.max(rowsUsed(p), 1) + 2 }, (_, r) => ({ row: r, col: p.sel.col }))
      : p.pick === "row"
        ? Array.from({ length: COLS }, (_, c) => ({ row: p.sel.row, col: c }))
        : [{ row: p.sel.row, col: p.sel.col }];
  const styles = { ...p.styles };
  for (const { row, col } of cells) {
    const k = cellKey(row, col);
    const next = { ...styles[k], [kind]: colour || undefined };
    if (!next.fill && !next.text) delete styles[k];
    else styles[k] = next;
  }
  return { ...p, styles };
}

// ---- Menu actions on the selected column and row

export function insertRow(p: ListsPage): ListsPage {
  const at = p.sel.row - 2;
  if (at < 0) return p;
  return { ...p, cols: p.cols.map((c) => (c.formula ? c : { ...c, cells: [...c.cells.slice(0, at), "", ...c.cells.slice(at)] })) };
}
/** Insert ▸ Cell: an empty cell at the selection, the column's cells below it moving down one. */
export function insertCell(p: ListsPage): ListsPage {
  const at = p.sel.row - 2;
  const c = p.cols[p.sel.col];
  if (at < 0 || !c || c.formula || at >= c.cells.length) return p;
  return { ...p, cols: p.cols.map((col, i) => (i === p.sel.col ? { ...col, cells: [...col.cells.slice(0, at), "", ...col.cells.slice(at)] } : col)) };
}
/** Delete Cell: the selected cell taken out, the column's cells below it moving up one. */
export function deleteCell(p: ListsPage): ListsPage {
  const at = p.sel.row - 2;
  const c = p.cols[p.sel.col];
  if (at < 0 || !c || c.formula) return p;
  return { ...p, cols: p.cols.map((col, i) => (i === p.sel.col ? { ...col, cells: col.cells.filter((_, j) => j !== at), values: undefined } : col)) };
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

/** The selected column with `patch` applied (made, with any before it, if the page doesn't reach it yet): Link To, a name from Store Var. */
export function patchColumn(p: ListsPage, patch: Partial<ListsColumn>): ListsPage {
  const col = p.sel.col;
  return { ...p, cols: Array.from({ length: Math.max(p.cols.length, col + 1) }, (_, i) => (i === col ? { ...(p.cols[i] ?? { cells: [] }), ...patch } : (p.cols[i] ?? { cells: [] }))) };
}

/** Whether any of `width` columns from `col` holds something: the handheld asks before a result overwrites it (Data Loss). */
export function columnsUsed(p: ListsPage, col: number, width: number): boolean {
  return p.cols.slice(col, col + width).some((c) => Boolean(c.formula) || c.cells.some((x) => x !== ""));
}

/**
 * A statistics procedure's results, as the handheld writes them from the
 * spreadsheet: the results' names in column `col` (="Title", ="x̄" …) and,
 * in each column after it, a column formula that runs the procedure
 * (=OneVar(a[],1)), so the values follow the data. Names are kept.
 */
export function setStatColumns(p: ListsPage, col: number, labels: string[], formulas: string[]): ListsPage {
  const cols = p.cols.slice();
  while (cols.length < col + 1 + formulas.length) cols.push({ cells: [] });
  const keepName = (c: ListsColumn | undefined) => (c?.name ? { name: c.name } : {});
  cols[col] = { ...keepName(cols[col]), cells: labels.map((l) => `="${l.replace(/"/g, "'")}"`) };
  formulas.forEach((f, i) => (cols[col + 1 + i] = { ...keepName(cols[col + 1 + i]), formula: f, cells: [] }));
  return { ...p, cols: cols.slice(0, COLS) };
}

/** A procedure run from the spreadsheet (=OneVar(…)): its column holds the procedure's results, not a list it returns. */
export const STAT_FORMULA =
  /^=\s*(OneVar|TwoVar|LinRegMx|LinRegBx|MedMed|QuadReg|CubicReg|QuartReg|PowerReg|ExpReg|LnReg|SinReg|Logistic|LogisticD|MultReg|zInterval|tInterval|zInterval_2Samp|tInterval_2Samp|zInterval_1Prop|zInterval_2Prop|LinRegtIntervals|MultRegIntervals|zTest|tTest|zTest_2Samp|tTest_2Samp|zTest_1Prop|zTest_2Prop|χ²GOF|χ²2way|FTest_2Samp|LinRegtTest|MultRegTests|ANOVA|ANOVA2way)\s*\(/;

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
  // A range (a1:a3) is the list of its cells, or a matrix of them across several columns, as on the handheld.
  const ranged = formula.replace(/\b([a-z])(\d+):([a-z])(\d+)\b/gi, (m, l1: string, n1: string, l2: string, n2: string) => {
    const [c0, c1] = [l1, l2].map((l) => l.toLowerCase().charCodeAt(0) - 97).sort((a, b) => a - b) as [number, number];
    const [r0, r1] = [Number(n1), Number(n2)].sort((a, b) => a - b) as [number, number];
    const cell = (r: number, c: number) => value(r + 1, c) || "undef";
    const rows = Array.from({ length: r1 - r0 + 1 }, (_, i) => Array.from({ length: c1 - c0 + 1 }, (_, j) => cell(r0 + i, c0 + j)));
    return c0 === c1 ? `{${rows.map((r) => r[0]).join(",")}}` : `[${rows.map((r) => `[${r.join(",")}]`).join(",")}]`;
  });
  return ranged.replace(/\b([a-z])(\d+)\b/gi, (m, l: string, n: string) => {
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
export async function recalc(p: ListsPage, run: Evaluate, statValues?: () => Promise<string[] | null>): Promise<{ page: ListsPage; definitions: string[] }> {
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
  // Data ▸ Exact or Approximate on a column works its formulas out that way, whatever the document's setting.
  const formula = (text: string, ci?: number) => {
    const body = columnRefs(withRefs(text.slice(1), valueAt), cols);
    const m = ci === undefined ? undefined : p.colModes?.[ci];
    return run(m === "approx" ? `approx(${body})` : m === "exact" ? `exact(${body})` : body);
  };
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
        const r = await formula(c.formula, ci);
        // A procedure's column shows each of its results, read back as the procedure left them.
        const stat = statValues && STAT_FORMULA.test(c.formula) ? (r.ok ? await statValues() : null) : undefined;
        c.values = stat !== undefined ? (stat ?? ["Error"]) : r.ok ? splitList(r.text) : ["Error"];
      }
      for (let i = 0; i < c.cells.length; i++) {
        const cell = c.cells[i]!;
        if (!cell.startsWith("=")) continue;
        // ="Title": text is its own value; the engine would rewrite some of its characters (²).
        if (/^="[^"]*"$/.test(cell)) {
          c.values[i] = cell.slice(1);
          continue;
        }
        const r = await formula(cell, ci);
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
