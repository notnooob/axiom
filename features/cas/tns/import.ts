// SPDX-License-Identifier: GPL-3.0-or-later
/**
 * A decoded .tns to a document. Each ProblemN.xml is
 *   <prob><sym> variables </sym><card><wdgt type="…">…</wdgt></card>…</prob>
 * with one card per page. The widget types, by app:
 *   TI.Scratchpad  Calculator        <sp:erow> entr (typed), rslt/disp (shown)
 *   tabulator      Lists & Spreadsheet  <tb:column> globalName, cells (rowId, formula)
 *   TI.Notepad     Notes             rich text (r2dtotree) with maths boxes
 *   TI.PythonEditor / TI.PythonShell  the .py file is a separate container entry
 *   TI.DataGrapher Data & Statistics (an x/y scatter becomes a Graphs page)
 *   TI.GeoGrapher  Graphs & Geometry (its f1… come from the problem's variables)
 *   TI.ScriptApp   Lua: not supported
 */
import { parse } from "../math/ast";
import { astToRow, chars, type Row } from "../math/tree";
import { newId, newPage, type CasDocument, type HistoryEntry, type NotesRun, type Page } from "../state/document";
import type { TnsContents } from "./decode";

const parser = () => new DOMParser();

/** Elements by local name, whatever prefix the file gave the namespace. */
const all = (el: Element | Document, name: string) => Array.from(el.getElementsByTagNameNS("*", name));
const first = (el: Element | Document, name: string) => el.getElementsByTagNameNS("*", name)[0];
const text = (el: Element | Document, name: string) => first(el, name)?.textContent ?? "";
/** Direct children by local name. */
const kids = (el: Element, name: string) => Array.from(el.children).filter((c) => c.localName === name);

function mathRow(t: string): Row {
  try {
    return astToRow(parse(t));
  } catch {
    return chars(t);
  }
}

// ---- Calculator

function calculator(w: Element, problem: number): Page {
  const page = newPage("calculator", problem);
  if (page.kind !== "calculator") throw new Error("unreachable");
  for (const row of all(w, "erow")) {
    const input = text(row, "entr");
    if (!input) continue;
    const shown = text(row, "disp");
    const err = first(row, "err")?.textContent;
    // shortcut: a program's Disp output (<sp:intr>, rich text) isn't shown; add it once history rows can carry text.
    const entry: HistoryEntry = {
      id: newId(),
      input: mathRow(input),
      inputText: input,
      output: mathRow(shown),
      outputText: shown,
      ...(err && err !== "0" ? { error: `Error: ${err}` } : {}),
    };
    page.history.push(entry);
  }
  return page;
}

// ---- Lists & Spreadsheet

function lists(w: Element, problem: number): Page {
  const page = newPage("lists", problem);
  if (page.kind !== "lists") throw new Error("unreachable");
  // Only the sheet's own columns: a function table inside the widget has columns too.
  for (const col of all(w, "column").filter((c) => (c.getAttribute("type") ?? "cell-column") === "cell-column")) {
    const name = text(col, "globalName") || undefined;
    const cells: string[] = [];
    const values: string[] = [];
    for (const cell of all(col, "cell")) {
      const row = Number(text(cell, "rowId")) - 1;
      if (!(row >= 0)) continue;
      cells[row] = text(cell, "formula");
      values[row] = text(cell, "data");
    }
    page.cols.push({ ...(name ? { name } : {}), cells: Array.from(cells, (c) => c ?? ""), values: Array.from(values, (v) => v ?? "") });
  }
  return page;
}

// ---- Notes: r2dtotree paragraphs of words, with maths boxes (an input and, read-only, its output)

function notes(w: Element, problem: number): Page {
  const raw = text(w, "fmtxt");
  const paras: NotesRun[][] = [];
  if (raw) {
    const tree = parser().parseFromString(raw, "application/xml");
    for (const para of all(tree, "node").filter((n) => n.getAttribute("name") === "1para")) {
      const runs: NotesRun[] = [];
      const walk = (el: Element) => {
        for (const c of Array.from(el.children)) {
          const name = c.getAttribute("name");
          if (c.localName === "leaf" && name === "1word") runs.push(c.textContent ?? "");
          else if (c.localName === "node" && name === "0el" && kids(c, "mbox").length) {
            const parts = kids(c, "node").map((n) => n.textContent ?? "");
            const out = text(c, "full") || parts[1];
            runs.push({ math: parts[0] ?? "", ...(out ? { out } : {}) });
          } else if (c.localName === "node" && name !== "1para") walk(c);
        }
      };
      walk(para);
      // Join consecutive words: the file splits text into one leaf per word.
      const joined: NotesRun[] = [];
      for (const r of runs)
        if (typeof r === "string" && typeof joined.at(-1) === "string") joined[joined.length - 1] += r;
        else joined.push(r);
      paras.push(joined);
    }
  }
  return { kind: "notes", id: newId(), problem, paras, xml: cardXml(w.parentElement) };
}

/** A card as XML text, without the namespace declaration the serializer copies down from <prob>. */
function cardXml(c: Element | null): string | undefined {
  return c ? new XMLSerializer().serializeToString(c).replace(' xmlns="urn:TI.Problem"', "") : undefined;
}

// ---- The import

const APP_NAMES: Record<string, string> = {
  "TI.ScriptApp": "Lua program",
  "TI.GeoGrapher": "Geometry",
  "TI.DataGrapher": "Data & Statistics",
  "TI.Widget": "Widget",
  "TI.Vernier": "Vernier DataQuest",
};

const utf8 = new TextDecoder();

/** One card's page: an app built here, or an "unsupported" page that keeps its XML. */
function card(c: Element, problem: number, files: Map<string, Uint8Array>, sym: Map<string, SymEntry>): Page {
  const w = first(c, "wdgt");
  const type = w?.getAttribute("type") ?? "";
  if (!w) return { kind: "unsupported", id: newId(), problem, app: "Unknown" };
  if (type === "TI.Scratchpad") return calculator(w, problem);
  if (type === "tabulator") return lists(w, problem);
  if (type === "TI.Notepad") return notes(w, problem);
  if (type === "TI.PythonEditor") {
    const file = text(w, "name") || "program.py";
    const src = files.get(file);
    return { kind: "python", id: newId(), problem, file, source: src ? utf8.decode(src) : "" };
  }
  if (type === "TI.PythonShell") return { kind: "pyshell", id: newId(), problem, lines: [], input: "" };
  if (type === "TI.DataGrapher") {
    const x = text(w, "XAttr").trim();
    const y = text(w, "YAttr").trim();
    return {
      kind: "datastats",
      id: newId(),
      problem,
      ...(x ? { x } : {}),
      ...(y ? { y } : {}),
      plot: x && y ? "scatter" : "dot",
      xml: cardXml(c),
    };
  }
  if (type === "TI.GeoGrapher") {
    // Graphs keeps its curves as the problem's f1, f2 … functions of x.
    const page = newPage("graphs", problem);
    if (page.kind === "graphs") {
      for (const [name, e] of sym) {
        const m = /^f(\d+)$/.exec(name);
        if (m && e.t === "6" && e.p === "x") page.functions.push({ n: Number(m[1]), text: e.v, row: mathRow(e.v) });
      }
      page.functions.sort((a, b) => a.n - b.n);
      page.editing = null;
      page.xml = cardXml(c);
      if (page.functions.length) return page;
    }
  }
  return { kind: "unsupported", id: newId(), problem, app: APP_NAMES[type] ?? type.replace(/^TI\./, ""), xml: cardXml(c) };
}

type SymEntry = { t: string; p?: string; v: string };

/**
 * The problem's variables as statements to evaluate. Numbers, lists,
 * matrices and one-line functions come across; multi-line programs and
 * functions (Func … EndFunc, t 6/7 with line breaks) and stat.* results don't
 * yet, and are counted so the user can be told.
 */
function statements(sym: Map<string, SymEntry>): { run: string[]; skipped: number } {
  const run: string[] = [];
  let skipped = 0;
  for (const [name, e] of sym) {
    if (name.includes(".")) continue;
    if (/[\r\n]/.test(e.v) || e.t === "7") {
      skipped++;
      continue;
    }
    if (e.t === "6") run.push(`Define ${name}(${e.p ?? ""})=${e.v}`);
    else if (e.t === "1" || e.t === "2" || e.t === "3" || e.t === "5") run.push(`${name}:=${e.v}`);
    else skipped++;
  }
  return { run, skipped };
}

export type Imported = { doc: CasDocument; skipped: number };

export function importTns(contents: TnsContents, title: string): Imported {
  const pages: Page[] = [];
  const pendingSym: Record<string, string[]> = {};
  let skipped = 0;
  const problems = [...contents.xml.keys()]
    .map((k) => /^Problem(\d+)\.xml$/.exec(k))
    .filter((m): m is RegExpExecArray => m !== null)
    .map((m) => Number(m[1]))
    .sort((a, b) => a - b);
  for (const n of problems) {
    const xml = parser().parseFromString(contents.xml.get(`Problem${n}.xml`)!, "application/xml");
    const sym = new Map<string, SymEntry>();
    const symEl = first(xml, "sym");
    if (symEl)
      for (const e of kids(symEl, "e")) {
        const name = text(e, "n");
        if (name) sym.set(name, { t: e.getAttribute("t") ?? "", p: first(e, "p")?.textContent ?? undefined, v: text(e, "v").replace(/\r/g, "\n") });
      }
    const st = statements(sym);
    skipped += st.skipped;
    if (st.run.length) pendingSym[String(n)] = st.run;
    const root = xml.documentElement;
    for (const c of kids(root, "card")) {
      if (text(c, "isDummyCard") === "1") continue;
      pages.push(card(c, n, contents.files, sym));
    }
  }
  if (!pages.length) pages.push(newPage("calculator"));
  return { doc: { title, pages, active: 0, ...(Object.keys(pendingSym).length ? { pendingSym } : {}) }, skipped };
}

