// SPDX-License-Identifier: GPL-3.0-or-later
/**
 * The calculator's tools for AI agents: the assistant panel's model, and any
 * browser agent through WebMCP (webmcp.ts). Every tool works the calculator
 * the way a student does (keys, menus, dialogs, the same handlers), so what
 * an agent does is on screen, in the document, and undoable as usual.
 */
import type { EngineStatus } from "../engine/client";
import type { Settings } from "../engine/evaluate";
import type { Key } from "../keys";
import { rowToLinear } from "../math/tree";
import type { Menu, MenuAction, MenuItem } from "../menus/types";
import { letter } from "../lists/sheet";
import { pageLabel, type AppKind, type CasDocument, type GeometryPage, type Page } from "../state/document";
import { addSpec, describe as describeGeometry, remove as removeGeometry, type GeoSpec } from "../geometry/model";
import type { AnalyzeKind } from "../graphs/model";
import { runText } from "../notes/model";
import { badge, highlightsSaid, resolveHighlights, targetSaid, type Highlight, type HighlightInput } from "./highlights";
import { menuPathOf, outerCommand } from "./menu-paths";
import type { PyStatus } from "../python/runner";

export type AgentDialog = {
  kind: "menu" | "dialog" | "message" | "error" | "warning" | "sliders" | "catalog" | "finance" | "templates";
  title?: string;
  lines?: string[];
  fields?: { label: string; value: string; options?: string[] }[];
  buttons?: string[];
};

export type AgentSnapshot = {
  view: "home" | "browse" | "doc" | "new";
  doc: CasDocument;
  path: string | null;
  scratch: boolean;
  dirty: boolean;
  settings: Settings;
  engine: EngineStatus;
  busy: boolean;
  dialog: AgentDialog | null;
  menu: Menu | null;
  variables: string[];
  files: { path: string; type: "file" | "folder"; size: number }[];
  python: { status: PyStatus; prompt: string | null };
  /** The assistant's highlights still on screen (highlights.ts). */
  highlights: Highlight[];
  /** The problem's variables that Geometry constructions use (Calculate's "=name", conditions), as numbers. */
  geoValues: Record<string, number>;
};

/** What cas-app.tsx lends the tools: its state, read fresh each call, and its own handlers. */
export type AgentHost = {
  snapshot(): AgentSnapshot;
  key(k: Key): void;
  /** Several keys folded over one state, as the keypad sends them (no key lost between renders). */
  keys(ks: Key[]): void;
  pick(action: MenuAction): void;
  newDoc(first: "calculator" | "graphs" | "lists" | "python" | "datastats" | "notes" | "geometry"): Promise<void>;
  openFile(path: string): Promise<void>;
  save(name?: string): Promise<void>;
  /** The open document's changes are given up: no Save prompt on leaving it. */
  discard(): void;
  close(): Promise<void>;
  addPage(kind: AppKind): void;
  selectPage(i: number): void;
  go(to: "home" | "browse" | "scratchCalc" | "scratchGraph" | "current"): Promise<void>;
  graphEntry(n?: number): number;
  setListColumn(col: number, change: { name?: string; formula?: string; values?: string[] }): string | null;
  setPython(source: string): void;
  /** Add paragraphs to the active Notes page ([[expr]] is a maths box, worked out); replace starts it afresh. */
  writeNotes(paragraphs: string[], replace: boolean): Promise<string | null>;
  /** Change the active Geometry page (as its menu and pointer do). */
  setGeometry(fn: (p: GeometryPage) => GeometryPage): void;
  runPython(what: { file: string } | { code: string }): void;
  fillDialog(values: Record<string, string>): string | null;
  wizardDone(built: string): void;
  evaluate(text: string): Promise<{ ok: boolean; text: string }>;
  /** The calculator screen as a base64 PNG about 960 px wide; null when it isn't laid out (hidden). */
  screenshot(): Promise<string | null>;
  /** Graphs ▸ Analyze Graph on the active Graphs page, between a and b: its mark goes on the graph, as the menu's does. */
  analyzeGraph(spec: { type: AnalyzeKind; fn: number; other?: number; a: number; b: number }): Promise<void>;
  /** Put the assistant's highlights on the calculator (replacing any), or take them off (null). */
  setHighlights(hs: Highlight[] | null): void;
  /** Select on the active page, as a click or the arrows would (for its context menu and Delete); an error, or null. */
  select(target: SelectTarget): string | null;
  /** A slider on the active page set to a value (worked out, so π/4 is fine), as typing in it does; an error, or null. */
  setSlider(name: string, value: string): Promise<string | null>;
};

/**
 * What select picks: Geometry objects (several, as Select ▸ Region takes in),
 * a Graphs page's graph or construction object, a spreadsheet cell, column
 * (B) or row (3), a Calculator history entry (from 1), a Notes maths box
 * (from 1) or text, or nothing.
 */
export type SelectTarget = { objects?: string[]; graph?: number; cell?: string; entry?: number; box?: number; text?: string; clear?: boolean };

export type ToolImage = { data: string; mediaType: "image/png" };

/** A tool's result that has words and, when the screen could be pictured, a picture (look_at_screen). */
export class Picture {
  constructor(
    readonly text: string,
    readonly image: ToolImage | null,
  ) {}
}

export type AgentTool = {
  name: string;
  title: string;
  description: string;
  inputSchema: Record<string, unknown>;
  readOnly?: boolean;
  run(args: Record<string, unknown>, host: AgentHost): Promise<unknown>;
};

// ---- Waiting for the page to catch up

const tick = (ms = 40) => new Promise((r) => setTimeout(r, ms));

/** Let React render what the last key did, then wait while the engine works. */
async function settle(h: AgentHost, timeout = 20000) {
  await tick();
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    const s = h.snapshot();
    if (!s.busy && s.engine !== "busy" && s.engine !== "loading") return;
    await tick(60);
  }
}

async function until(test: () => boolean, timeout: number) {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    if (test()) return true;
    await tick(60);
  }
  return false;
}

const active = (h: AgentHost) => {
  const s = h.snapshot();
  return s.view === "doc" ? s.doc.pages[s.doc.active] : undefined;
};

const KIND_NAMES: Record<Page["kind"], string> = {
  calculator: "Calculator",
  graphs: "Graphs",
  lists: "Lists & Spreadsheet",
  datastats: "Data & Statistics",
  python: "Python editor",
  pyshell: "Python shell",
  notes: "Notes",
  geometry: "Geometry",
  program: "Program Editor",
  unsupported: "unsupported app",
};

/** The active page, if it's the kind the tool works on; otherwise a message saying how to get one. */
async function need<K extends Page["kind"]>(h: AgentHost, kind: K): Promise<Extract<Page, { kind: K }>> {
  const s = h.snapshot();
  if (s.dialog?.kind === "menu") {
    h.key({ k: "esc" });
    await tick();
  } else if (s.dialog) throw new Error(`A ${s.dialog.kind} is open (${s.dialog.title ?? ""}). Answer it with respond_to_dialog first.`);
  const p = active(h);
  if (p?.kind !== kind)
    throw new Error(
      `The active page is ${p ? KIND_NAMES[p.kind] : `not a page (view: ${s.view})`}, not ${KIND_NAMES[kind]}. Use select_page or add_page first.`,
    );
  return p as Extract<Page, { kind: K }>;
}

// ---- Reading

const short = (v: unknown) => (typeof v === "string" && v.length > 4000 ? `${v.slice(0, 4000)}… (${v.length} characters)` : v);

/** A page as an agent reads it: what's on it, without the editor's layout trees. */
/** A coordinate as the assistant reads it. */
const num = (v: number) => Number(v.toFixed(4));

export function pageContent(doc: CasDocument, i: number, values: Record<string, number> = {}): Record<string, unknown> {
  const p = doc.pages[i]!;
  const base = { page: pageLabel(doc, i), index: i, app: KIND_NAMES[p.kind] };
  switch (p.kind) {
    case "calculator":
      return {
        ...base,
        history: p.history.map((e, n) => ({
          n: n + 1,
          input: e.inputText,
          ...(e.error ? { error: e.error } : { output: e.outputText }),
          ...(e.warning ? { warning: e.warning.join(" ") } : {}),
        })),
        entryLine: rowToLinear(p.edit.row),
        ...(p.sel ? { selectedEntry: p.sel.entry + 1 } : {}),
      };
    case "graphs":
      return {
        ...base,
        functions: p.functions.map((f) => ({ name: `f${f.n}(x)`, expr: f.text, ...(f.hidden ? { hidden: true } : {}) })),
        relations: (p.relations ?? []).map((r) => ({ name: `rel${r.n}`, expr: r.text })),
        parametrics: (p.parametrics ?? []).map((c) => ({ n: c.n, x: c.x, y: c.y, t: [c.tmin, c.tmax, c.tstep] })),
        differentialEquations: (p.des ?? []).map((d) => ({ n: d.n, [`y${d.y}'`]: d.rhs, ...(d.x0 !== undefined ? { x0: d.x0, y0: d.y0 } : {}) })),
        scatterPlots: p.scatters ?? [],
        sliders: (p.sliders ?? []).map((s) => ({ name: s.name, value: s.value, min: s.min, max: s.max })),
        window: p.window,
        marks: JSON.parse(JSON.stringify(p.marks, (k, v) => (k === "row" ? undefined : v))) as unknown,
        entryLine: p.editing === null ? null : { n: p.editing, kind: p.entryKind ?? "function", text: rowToLinear(p.edit.row) },
        ...(p.pick !== undefined ? { selectedGraph: `f${p.pick}` } : {}),
        // Geometry tools used on the graph: the construction over it, in the graph's coordinates.
        ...(p.geo?.objects.length ? { construction: describeGeometry(p.geo.objects, { vars: { ...values, ...Object.fromEntries((p.sliders ?? []).map((sl) => [sl.name, sl.value])) } }) } : {}),
        ...(p.geo?.sel ? { selectedObject: p.geo.sel } : {}),
      };
    case "lists":
      return {
        ...base,
        columns: p.cols
          .map((c, n) => ({ column: letter(n), name: c.name, formula: c.formula, cells: c.cells, values: c.values }))
          .filter((c) => c.name || c.formula || c.cells.length),
        selected: { column: letter(p.sel.col), row: p.sel.row < 2 ? (p.sel.row ? "formula" : "name") : p.sel.row - 1 },
        ...(p.table ? { showing: `the function table (Table menu), x from ${p.table.start} in steps of ${p.table.step}` } : {}),
        ...(p.pick ? { picked: p.pick === "col" ? "the whole column" : "the whole row" } : {}),
        ...(p.mode ? { mode: p.mode.kind } : {}),
        // Data ▸ Exact or Approximate on a column, in place of the document's setting.
        ...(p.colModes && Object.keys(p.colModes).length ? { columnModes: Object.fromEntries(Object.entries(p.colModes).map(([c, m]) => [letter(Number(c)), m])) } : {}),
      };
    case "datastats":
      return { ...base, ...JSON.parse(JSON.stringify(p, (k, v) => (k === "xml" || k === "id" || k === "kind" ? undefined : v))) };
    case "python":
      return { ...base, file: p.file, source: short(p.source) };
    case "program":
      return { ...base, name: p.name, source: short(p.source), stored: p.source === p.stored, ...(p.readOnly ? { readOnly: true } : {}) };
    case "pyshell":
      return { ...base, lines: p.lines.slice(-150).map((l) => (l.kind === "in" ? `>>> ${l.text}` : l.kind === "err" ? `! ${l.text}` : l.text)) };
    case "notes":
      return {
        ...base,
        text: short(p.paras.map((runs) => runs.map(runText).join("")).join("\n")),
        ...(p.sliders?.length ? { sliders: p.sliders.map((sl) => ({ name: sl.name, value: sl.value, min: sl.min, max: sl.max })) } : {}),
        ...(p.hideAnswer ? { answersHidden: true } : {}),
      };
    case "geometry":
      return {
        ...base,
        units: `lengths in cm, angles in degrees; the page shows x from ${num((p.view?.x ?? 0) - (p.view?.w ?? 20) / 2)} to ${num((p.view?.x ?? 0) + (p.view?.w ?? 20) / 2)}, centred on y = ${num(p.view?.y ?? 0)}`,
        objects: describeGeometry(p.objects, geoEnvOf(p, values)),
        ...(p.texts?.length ? { texts: p.texts } : {}),
        ...(p.tool ? { tool: p.tool } : {}),
        ...(p.mode ? { mode: p.mode.kind } : {}),
        ...(p.sel ? { selected: p.sel } : {}),
        ...(p.multi?.length ? { selected: p.multi } : {}),
        ...(p.sliders?.length ? { sliders: p.sliders.map((sl) => ({ name: sl.name, value: sl.value, min: sl.min, max: sl.max })) } : {}),
        ...(p.gsettings?.geoAngle === "Radian" ? { angles: "radians (Geometry Angle setting)" } : {}),
        ...(p.axes ? { axes: true } : {}),
      };
    case "unsupported":
      return { ...base, app: p.app, note: "This app isn't built in Axiom; the page is kept so the document stays whole." };
  }
}

/** What a Geometry page's values are worked out with: the problem's variables, its own sliders over them, and its settings. */
const geoEnvOf = (p: GeometryPage, values: Record<string, number>) => ({ vars: { ...values, ...Object.fromEntries((p.sliders ?? []).map((sl) => [sl.name, sl.value])) }, digits: p.gsettings?.digits, radians: p.gsettings?.geoAngle === "Radian" });

export function stateOf(s: AgentSnapshot) {
  const d = s.doc;
  return {
    view: { home: "Home screen", browse: "My Documents", doc: "a document", new: "choosing a new document's first page" }[s.view],
    document:
      s.view === "doc"
        ? {
            title: s.scratch ? "Scratchpad" : d.title,
            file: s.path,
            unsavedChanges: !s.scratch && s.dirty,
            pages: d.pages.map((p, i) => `${pageLabel(d, i)} ${KIND_NAMES[p.kind]}${i === d.active ? " (active)" : ""}`),
          }
        : null,
    settings: {
      angle: s.settings.angle === "rad" ? "radian" : "degree",
      displayDigits: s.settings.digits === 12 ? "Float" : `Float${s.settings.digits}`,
      calculationMode: s.settings.mode,
      complexFormat: s.settings.complex,
    },
    engine: s.engine,
    openDialog: s.dialog,
    variables: s.variables.slice(0, 60),
    python: s.python.status === "off" ? undefined : s.python,
    highlights: s.highlights?.length ? highlightsSaid(d, s.highlights) : undefined,
  };
}

const said = (v: number) => String(Number(v.toPrecision(6)));

/**
 * The screen in words: what look_at_screen sends with its picture, and
 * instead of it when there's no picture (a model that can't read images, or
 * the calculator out of sight). Short: what the student sees, not the page's data.
 */
export function describeScreen(s: AgentSnapshot): string {
  const out: string[] = [];
  if (s.view !== "doc") {
    out.push(`The calculator shows ${{ home: "the Home screen", browse: "My Documents", new: "the list of apps for a new document's first page" }[s.view]}.`);
    if (s.view === "browse") out.push(`Files: ${s.files.slice(0, 12).map((f) => f.path.replace(/^.*\//, "")).join(", ") || "none"}.`);
  } else {
    const d = s.doc;
    const p = d.pages[d.active]!;
    out.push(
      `Page ${pageLabel(d, d.active)} ${KIND_NAMES[p.kind]} of "${s.scratch ? "Scratchpad" : d.title}"${!s.scratch && s.dirty ? " (unsaved changes)" : ""}, in ${s.settings.angle === "rad" ? "radian" : "degree"} mode. Pages: ${d.pages.map((_, i) => pageLabel(d, i)).join(", ")}.`,
    );
    switch (p.kind) {
      case "calculator": {
        const from = Math.max(0, p.history.length - 6);
        if (!p.history.length) out.push("The history is empty.");
        else out.push(`History${from ? ` (last 6 of ${p.history.length})` : ""}:`, ...p.history.slice(from).map((e, k) => `  ${from + k + 1}. ${e.inputText} → ${e.error ?? e.outputText}`));
        const line = rowToLinear(p.edit.row);
        if (line) out.push(`Entry line: ${line}`);
        break;
      }
      case "graphs": {
        const w = p.window;
        out.push(`Window: x from ${said(w.xmin)} to ${said(w.xmax)}, y from ${said(w.ymin)} to ${said(w.ymax)}.`);
        const shown = p.functions.filter((f) => !f.hidden);
        out.push(shown.length ? `Graphed: ${shown.map((f) => `f${f.n}(x)=${f.text}`).join("; ")}.` : "No functions graphed.");
        const hidden = p.functions.filter((f) => f.hidden);
        if (hidden.length) out.push(`Hidden: ${hidden.map((f) => `f${f.n}`).join(", ")}.`);
        if (p.relations?.length) out.push(`Relations: ${p.relations.map((r) => r.text).join("; ")}.`);
        if (p.marks.length)
          out.push(`Marked: ${p.marks.map((m) => (m.kind === "area" ? `area ${said(m.value)} under f${m.fn} on [${said(m.a)}, ${said(m.b)}]` : m.kind === "line" ? `${m.title} ${said(m.a)}x+${said(m.b)}y=${said(m.c)}` : m.kind === "value" ? `${m.title} ${said(m.value)}` : `${m.title ?? "point"} (${said(m.x)}, ${said(m.y)})`)).join("; ")}.`);
        if (p.sliders?.length) out.push(`Sliders: ${p.sliders.map((x) => `${x.name} = ${x.value}`).join(", ")}.`);
        break;
      }
      case "lists": {
        const cols = p.cols.map((c, n) => ({ c, n })).filter(({ c }) => c.name || c.cells.length);
        if (!cols.length) out.push("The spreadsheet is empty.");
        for (const { c, n } of cols.slice(0, 8)) {
          const vals = (c.values?.length ? c.values : c.cells).slice(0, 8);
          const more = Math.max(c.values?.length ?? 0, c.cells.length) - vals.length;
          out.push(`  ${letter(n)}${c.name ? ` ${c.name}` : ""}${c.formula ? ` (${c.formula})` : ""}: ${vals.join(", ")}${more > 0 ? `, … ${more} more` : ""}`);
        }
        break;
      }
      case "geometry": {
        const v = p.view ?? { x: 0, y: 0, w: 20 };
        out.push(`Showing x from ${said(v.x - v.w / 2)} to ${said(v.x + v.w / 2)} cm.${p.axes ? " Axes on." : ""}`);
        const objs = describeGeometry(p.objects, geoEnvOf(p, s.geoValues));
        out.push(objs.length ? `Objects: ${objs.slice(0, 20).map((o) => JSON.stringify(o)).join("; ")}${objs.length > 20 ? "; …" : ""}` : "The page is empty.");
        if (p.texts?.length) out.push(`Texts: ${p.texts.map((t) => `"${t.text}" at (${said(t.x)}, ${said(t.y)})`).join("; ")}`);
        if (p.sliders?.length) out.push(`Sliders: ${p.sliders.map((x) => `${x.name} = ${x.value}`).join(", ")}.`);
        break;
      }
      case "notes":
        out.push(`Text: ${p.paras.map((runs) => runs.map(runText).join("")).join("\n").slice(0, 400) || "(empty)"}`);
        if (p.sliders?.length) out.push(`Sliders: ${p.sliders.map((x) => `${x.name} = ${x.value}`).join(", ")}.`);
        break;
      case "datastats":
        out.push(
          `Plot: ${p.plot}${p.x ? ` of ${p.x}` : " (no list chosen)"}${p.y ? ` against ${p.y}` : ""}${p.ySummary ? ` with summary list ${p.ySummary}` : ""}${p.regression ? `, with ${p.regression}` : ""}${p.shade ? `, shaded under f(x) = ${p.functions?.[p.shade.fn]} from ${p.shade.from} to ${p.shade.to}` : ""}.`,
        );
        break;
      case "python":
        out.push(`Program ${p.file}: ${p.source.slice(0, 300) || "(empty)"}`);
        break;
      case "program":
        out.push(`Program Editor: ${p.name}${p.source === p.stored ? "" : " (changed, not stored)"}`);
        break;
      case "pyshell":
        out.push(`Shell: ${p.lines.slice(-8).map((l) => (l.kind === "in" ? `>>> ${l.text}` : l.text)).join(" / ") || "(empty)"}`);
        break;
      case "unsupported":
        out.push(`A ${p.app} page, which Axiom doesn't show.`);
    }
  }
  if (s.menu) out.push(`A menu is open: ${menuText(s.menu, 0, 0).slice(0, 16).join("; ")}.`);
  if (s.dialog)
    out.push(
      `A ${s.dialog.kind} is open${s.dialog.title ? ` (${s.dialog.title})` : ""}${s.dialog.lines?.length ? `: ${s.dialog.lines.join(" ")}` : ""}${s.dialog.fields?.length ? `: ${s.dialog.fields.map((f) => `${f.label} ${f.value}`).join(", ")}` : ""}.`,
    );
  if (s.highlights?.length) out.push(`Your highlights on screen: ${s.highlights.map((h) => `${badge(h.n)} ${targetSaid(h.target)}`).join(", ")}.`);
  return out.join("\n");
}

// ---- Menus

const norm = (s: string) =>
  s
    .toLowerCase()
    .replace(/[✓✔…]|\.\.\./g, "")
    .replace(/\s+/g, " ")
    .trim();

function findItem(items: MenuItem[], want: string): MenuItem | undefined {
  const w = norm(want);
  const byKey = /^[1-9a-z]$/i.test(w) ? items["123456789abcdefghijklmnopqrstuvwxyz".indexOf(w)] : undefined;
  return items.find((it) => norm(it.label) === w) ?? items.find((it) => norm(it.label).startsWith(w)) ?? byKey;
}

function menuText(items: MenuItem[], depth = 0, max = 4): string[] {
  return items.flatMap((it, i) => {
    const line = `${"  ".repeat(depth)}${"123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ"[i] ?? "-"}: ${it.label.replace(/^[✓✔]\s*/, "✓ ")}${
      it.items ? " ▸" : it.action ? "" : it.unavailable ? ` (greyed now: ${it.unavailable})` : " (not built in Axiom yet)"
    }`;
    return [line, ...(it.items && depth < max ? menuText(it.items, depth + 1, max) : [])];
  });
}

const MENU_KEYS = { page: { k: "menu" }, context: { k: "ctxmenu" }, document: { k: "doc" }, add_page: { k: "insertPage" } } as const;

async function openMenuOf(h: AgentHost, which: string): Promise<Menu> {
  const s = h.snapshot();
  if (which === "open") {
    if (!s.menu) throw new Error("No menu is open.");
    return s.menu;
  }
  if (s.dialog?.kind === "menu") {
    h.key({ k: "esc" });
    await tick();
  } else if (s.dialog) throw new Error(`A ${s.dialog.kind} is open; answer it with respond_to_dialog first.`);
  h.key(MENU_KEYS[which as keyof typeof MENU_KEYS] ?? { k: "menu" });
  await tick();
  const menu = h.snapshot().menu;
  if (!menu) throw new Error("That menu didn't open here.");
  return menu;
}

// ---- Typing

const SPECIAL: Record<string, Key> = {
  enter: { k: "enter" },
  approx: { k: "approx" },
  "ctrl+enter": { k: "approx" },
  esc: { k: "esc" },
  tab: { k: "tab" },
  up: { k: "up" },
  down: { k: "down" },
  left: { k: "left" },
  right: { k: "right" },
  backspace: { k: "backspace" },
  del: { k: "delete" },
  delete: { k: "delete" },
  home: { k: "home" },
  end: { k: "end" },
  clear: { k: "clear" },
  menu: { k: "menu" },
  ctxmenu: { k: "ctxmenu" },
  vars: { k: "vars" },
  doc: { k: "doc" },
  insertpage: { k: "insertPage" },
  prevpage: { k: "prevPage" },
  nextpage: { k: "nextPage" },
  save: { k: "save" },
  homescreen: { k: "homeScreen" },
  scratchpad: { k: "scratchpad" },
  selectall: { k: "selectAll" },
  undo: { k: "undo" },
  redo: { k: "redo" },
  space: { k: "char", c: " " },
  frac: { k: "template", id: "frac" },
  sqrt: { k: "template", id: "sqrt" },
};

/** "2+3{enter}" → text, then Enter. Text goes in as linear maths on the maths pages, and key by key elsewhere. */
export async function typeKeys(h: AgentHost, input: string) {
  const parts = input.split(/(\{[a-z+]+\})/i).filter(Boolean);
  for (const part of parts) {
    const special = /^\{([a-z+]+)\}$/i.exec(part);
    if (special) {
      const k = SPECIAL[special[1]!.toLowerCase()];
      if (!k) throw new Error(`Unknown key {${special[1]}}. Keys: ${Object.keys(SPECIAL).map((n) => `{${n}}`).join(" ")}`);
      h.key(k);
      await settle(h);
      continue;
    }
    const s = h.snapshot();
    const p = active(h);
    if (s.dialog?.kind === "dialog") h.key({ k: "text", text: part });
    else if (!s.dialog && p && ["calculator", "graphs", "lists", "python", "pyshell", "program"].includes(p.kind)) h.key({ k: "paste", text: part });
    else
      for (const c of part) {
        h.key({ k: "char", c });
        await tick();
      }
    await settle(h);
  }
}

// ---- The tools

const APPS = ["calculator", "graphs", "lists", "datastats", "notes", "geometry", "python"] as const;
const unsavedArg = {
  type: "string",
  enum: ["save", "discard"],
  description: "Only if the open document has unsaved changes: what the user chose to do with them. Ask the user; never discard on your own.",
};

/** Before the open document is replaced: what the user said to do with its changes. */
async function leave(h: AgentHost, unsaved: unknown) {
  const s = h.snapshot();
  if (s.scratch || !s.dirty) return;
  if (unsaved === "discard") return h.discard();
  if (unsaved === "save") {
    if (!s.path) throw new Error(`"${s.doc.title}" has never been saved: call save_document with a name first.`);
    await h.save();
    return;
  }
  throw new Error(`"${s.doc.title}" has unsaved changes. Ask the user whether to save or discard them, then call again with unsaved.`);
}

const describe = (h: AgentHost) => stateOf(h.snapshot());

export const TOOLS: AgentTool[] = [
  {
    name: "get_state",
    title: "Read the calculator's state",
    description:
      "What's on screen: the view (Home, My Documents, a document), the open document's pages and which is active, settings, any open menu or dialog, and the engine's variables.",
    inputSchema: { type: "object", properties: {} },
    readOnly: true,
    run: async (_, h) => describe(h),
  },
  {
    name: "read_page",
    title: "Read a page",
    description:
      "Everything on a page of the open document: Calculator history (inputs and results), Graphs functions/window/marks, Lists columns and values, Data & Statistics settings, Python source or shell output, Notes text. Omit index for the active page; use all:true for every page.",
    inputSchema: {
      type: "object",
      properties: { index: { type: "integer", description: "0-based page index" }, all: { type: "boolean" } },
    },
    readOnly: true,
    run: async (a, h) => {
      const s = h.snapshot();
      if (s.view !== "doc") throw new Error(`No document is on screen (view: ${s.view}).`);
      if (a.all) return s.doc.pages.map((_, i) => pageContent(s.doc, i, s.geoValues));
      const i = typeof a.index === "number" ? a.index : s.doc.active;
      if (!s.doc.pages[i]) throw new Error(`No page ${i}; the document has ${s.doc.pages.length}.`);
      return pageContent(s.doc, i, s.geoValues);
    },
  },
  {
    name: "look_at_screen",
    title: "Look at the screen",
    description:
      "The calculator screen as the student sees it: a description in words, and a picture when the model can read images. Use it when the look matters: whether a graph's window shows the features asked for (turning points, intercepts, asymptotes), how a sketch or a Geometry figure looks, the layout of a page, your highlights, or when the student asks what they're looking at. For the page's full contents, read_page is quicker.",
    inputSchema: { type: "object", properties: {} },
    readOnly: true,
    run: async (_, h) => {
      const data = await h.screenshot().catch(() => null);
      const words = describeScreen(h.snapshot());
      // Out of sight (AI mode with no document card, say): the words alone, rather than an error.
      if (!data) return new Picture(`The calculator screen isn't showing, so there's no picture; here it is in words.\n${words}`, null);
      return new Picture(`The calculator screen (picture attached when you can read images; if not, work from these words).\n${words}`, { data, mediaType: "image/png" });
    },
  },
  {
    name: "evaluate",
    title: "Work something out (not shown)",
    description:
      "Evaluate an expression with the CAS engine without adding it to any page, to check working before showing it. TI-Nspire syntax. It sees the current problem's variables. It can't define variables or functions: use calculate for that.",
    inputSchema: {
      type: "object",
      properties: { expression: { type: "string" }, approximate: { type: "boolean", description: "A decimal answer, as Ctrl+Enter" } },
      required: ["expression"],
    },
    readOnly: true,
    run: async (a, h) => {
      const text = String(a.expression ?? "");
      if (/:=|→|\bDefine\b|\bDelVar\b|\bClearAZ\b/i.test(text)) throw new Error("evaluate can't define or delete variables; use calculate so the student sees it.");
      const r = await h.evaluate(a.approximate ? `approx(${text})` : text);
      return r.ok ? { result: r.text } : { error: r.text };
    },
  },
  {
    name: "calculate",
    title: "Type into the Calculator",
    description:
      "Type each entry into the active Calculator page and press Enter (or Ctrl+Enter with approximate), as the student would. Results stay in the page's history. Definitions (a:=5, Define f(x)=x^2) carry over to the whole problem. Returns each result or error.",
    inputSchema: {
      type: "object",
      properties: {
        entries: { type: "array", items: { type: "string" }, description: "TI-Nspire CAS syntax, e.g. solve(x^2-5x+6=0,x)" },
        approximate: { type: "boolean" },
      },
      required: ["entries"],
    },
    run: async (a, h) => {
      const out: unknown[] = [];
      for (const text of (a.entries as string[]) ?? []) {
        await need(h, "calculator");
        await settle(h);
        h.key({ k: "clear" });
        await tick();
        h.key({ k: "paste", text });
        await tick();
        const before = (active(h) as Extract<Page, { kind: "calculator" }>).history.length;
        h.key({ k: a.approximate ? "approx" : "enter" });
        await until(() => {
          const s = h.snapshot();
          const p = active(h);
          return s.dialog?.kind === "error" || (p?.kind === "calculator" && p.history.length > before);
        }, 30000);
        const s = h.snapshot();
        if (s.dialog?.kind === "error") {
          out.push({ input: text, error: s.dialog.lines?.join(" ") });
          h.key({ k: "esc" });
          await tick();
          h.key({ k: "clear" });
          await tick();
          continue;
        }
        const p = active(h);
        const e = p?.kind === "calculator" ? p.history.at(-1) : undefined;
        // Where the command is on the handheld's menu, so the reply can give the keys ("menu 3 1").
        const where = menuPathOf(outerCommand(text) ?? "");
        out.push(
          e
            ? { input: e.inputText, output: e.outputText, ...(e.warning ? { warning: e.warning.join(" ") } : {}), ...(where ? { menu: `${where.keys} · ${where.path}` } : {}) }
            : { input: text, error: "No result (timed out)" },
        );
      }
      return out;
    },
  },
  {
    name: "plot_function",
    title: "Graph a function",
    description:
      "On the active Graphs page, enter f(x) in the entry line and press Enter, as the student would: it's plotted and defined as f1, f2… for the problem. Give n to replace that function.",
    inputSchema: {
      type: "object",
      properties: {
        expression: { type: "string", description: "The right-hand side in x, e.g. x^2-4 or 2*sin(x)" },
        n: { type: "integer", description: "Function number (f1 = 1). Omit for the next free one." },
      },
      required: ["expression"],
    },
    run: async (a, h) => {
      await need(h, "graphs");
      const n = h.graphEntry(typeof a.n === "number" ? a.n : undefined);
      await tick();
      h.key({ k: "selectAll" });
      await tick();
      h.key({ k: "paste", text: String(a.expression) });
      await tick();
      const before = (active(h) as Extract<Page, { kind: "graphs" }>).functions.find((f) => f.n === n)?.text;
      h.key({ k: "enter" });
      await until(() => {
        const s = h.snapshot();
        const p = active(h);
        return Boolean(s.dialog) || (p?.kind === "graphs" && p.functions.find((f) => f.n === n)?.text !== before);
      }, 15000);
      const s = h.snapshot();
      if (s.dialog?.kind === "error") {
        const msg = s.dialog.lines?.join(" ");
        h.key({ k: "esc" });
        await tick();
        h.key({ k: "esc" });
        throw new Error(`${msg}`);
      }
      return { plotted: `f${n}(x)=${String(a.expression)}`, ...(s.dialog ? { dialog: s.dialog } : {}) };
    },
  },
  {
    name: "analyze_graph",
    title: "Analyze a graph",
    description:
      "Graphs ▸ Analyze Graph on the active Graphs page, as the student would: a zero, minimum, maximum, inflection point, the intersection with another function, or the integral of a plotted function between a lower and upper x bound. The result is marked on the graph and its coordinates (or area) come back, numerically. dydx gives the slope at x (no mark). Use it for graph features a student finds on the Graphs page; give exact values from the Calculator when the question wants them.",
    inputSchema: {
      type: "object",
      properties: {
        type: { type: "string", enum: ["zero", "minimum", "maximum", "inflection", "intersection", "integral", "dydx"] },
        fn: { type: "integer", description: "The function: 1 for f1(x)." },
        other: { type: "integer", description: "intersection: the other function's number. Omit for the first other function shown." },
        lower: { type: "number", description: "The lower x bound (all types but dydx)." },
        upper: { type: "number", description: "The upper x bound (all types but dydx)." },
        x: { type: "number", description: "dydx: where to take the slope." },
      },
      required: ["type", "fn"],
    },
    run: async (a, h) => {
      const p = await need(h, "graphs");
      const type = String(a.type);
      const fn = Number(a.fn);
      const shown = p.functions.filter((f) => !f.hidden);
      const list = shown.map((f) => `f${f.n}`).join(", ") || "none";
      const f = p.functions.find((x) => x.n === fn);
      if (!f) throw new Error(`There's no f${a.fn}(x) on this page (shown: ${list}). Plot it with plot_function first.`);
      if (f.hidden) throw new Error(`f${fn}(x) is hidden; Analyze Graph only works on functions shown on the graph (shown: ${list}).`);
      const sig = (v: number) => Number(v.toPrecision(10));
      if (type === "dydx") {
        const x = Number(a.x);
        if (a.x === undefined || !Number.isFinite(x)) throw new Error("dydx needs x, the point to take the slope at.");
        const r = await h.evaluate(`approx(d(f${fn}(x),x)|x=${x})`);
        if (!r.ok) throw new Error(r.text);
        return { fn: `f${fn}(x)`, x, dydx: r.text };
      }
      const kinds: Record<string, AnalyzeKind> = { zero: "zero", minimum: "min", maximum: "max", inflection: "inflection", intersection: "intersection", integral: "integral" };
      const kind = kinds[type];
      if (!kind) throw new Error(`type is one of: ${[...Object.keys(kinds), "dydx"].join(", ")}.`);
      const [lo, hi] = [Number(a.lower), Number(a.upper)];
      if (a.lower === undefined || a.upper === undefined || !Number.isFinite(lo) || !Number.isFinite(hi)) throw new Error(`${type} needs lower and upper, the x bounds to search between.`);
      if (lo >= hi) throw new Error(`lower (${lo}) must be less than upper (${hi}).`);
      let other: number | undefined;
      if (kind === "intersection") {
        other = a.other === undefined ? shown.find((x) => x.n !== fn)?.n : Number(a.other);
        if (other === undefined) throw new Error("An intersection needs a second function shown on the page; plot it first.");
        if (other === fn) throw new Error("other must be a different function from fn.");
        if (!shown.some((x) => x.n === other)) throw new Error(`f${other}(x) isn't shown on this page (shown: ${list}).`);
      }
      const before = p.marks.length;
      await h.analyzeGraph({ type: kind, fn, ...(other !== undefined ? { other } : {}), a: lo, b: hi });
      await until(() => {
        const q = active(h);
        return Boolean(h.snapshot().dialog) || (q?.kind === "graphs" && q.marks.length > before);
      }, 15000);
      const s = h.snapshot();
      if (s.dialog?.kind === "error") {
        const msg = (s.dialog.lines?.join(" ") ?? "Nothing found").replace(/^Error:\s*/, "");
        h.key({ k: "esc" });
        throw new Error(`${msg}. Check the bounds take in the feature (read_page or look_at_screen), then try again.`);
      }
      const q = active(h);
      const mark = q?.kind === "graphs" && q.marks.length > before ? q.marks[q.marks.length - 1] : undefined;
      if (!mark) throw new Error("No result came back; try again.");
      const between = { lower: lo, upper: hi };
      if (mark.kind === "line" || mark.kind === "value") throw new Error("No result came back; try again.");
      return mark.kind === "area"
        ? { fn: `f${fn}(x)`, integral: sig(mark.value), ...between, shown: "shaded on the graph" }
        : { fn: `f${fn}(x)`, [mark.title ?? kind]: { x: sig(mark.x), y: sig(mark.y) }, ...(other !== undefined ? { with: `f${other}(x)` } : {}), ...between, shown: "marked on the graph" };
    },
  },
  {
    name: "set_window",
    title: "Set the graph window",
    description: "Window Settings for the active Graphs or Data & Statistics page.",
    inputSchema: {
      type: "object",
      properties: { xmin: { type: "number" }, xmax: { type: "number" }, ymin: { type: "number" }, ymax: { type: "number" } },
      required: ["xmin", "xmax", "ymin", "ymax"],
    },
    run: async (a, h) => {
      const p = active(h);
      const [x0, x1, y0, y1] = [a.xmin, a.xmax, a.ymin, a.ymax].map(Number);
      if (p?.kind === "graphs") h.wizardDone(`window:${x0}:${x1}:Auto:${y0}:${y1}:Auto`);
      else if (p?.kind === "datastats") h.wizardDone(`ds:window:${x0}:${x1}:${y0}:${y1}`);
      else throw new Error("The active page isn't Graphs or Data & Statistics.");
      await settle(h);
      const s = h.snapshot();
      if (s.dialog?.kind === "error") {
        h.key({ k: "esc" });
        throw new Error(s.dialog.lines?.join(" "));
      }
      return "Window set.";
    },
  },
  {
    name: "set_list",
    title: "Fill a spreadsheet column",
    description:
      "On the active Lists & Spreadsheet page: name a column (which makes it a list variable for the whole problem, usable from Calculator and Data & Statistics) and fill it with values, or give it a column formula such as =seq(n^2,n,1,10) or =a*2.",
    inputSchema: {
      type: "object",
      properties: {
        column: { type: "string", description: "Column letter, A–Z" },
        name: { type: "string", description: "List name: letters, digits, _; starts with a letter" },
        values: { type: "array", items: { type: "string" }, description: "Cell values as typed, e.g. [\"1\", \"2.5\", \"3/4\"]" },
        formula: { type: "string" },
      },
      required: ["column"],
    },
    run: async (a, h) => {
      await need(h, "lists");
      const col = String(a.column ?? "A").trim().toUpperCase().charCodeAt(0) - 65;
      if (!(col >= 0 && col < 26)) throw new Error("column is a letter A–Z");
      const err = h.setListColumn(col, {
        ...(a.name !== undefined ? { name: String(a.name) } : {}),
        ...(a.formula !== undefined ? { formula: String(a.formula) } : {}),
        ...(Array.isArray(a.values) ? { values: a.values.map(String) } : {}),
      });
      if (err) throw new Error(err);
      await tick(150);
      await settle(h);
      const p = active(h);
      const s = h.snapshot();
      return p?.kind === "lists" ? pageContent(s.doc, s.doc.active, s.geoValues) : "Done.";
    },
  },
  {
    name: "configure_data_stats",
    title: "Set up Data & Statistics",
    description:
      "On the active Data & Statistics page: choose the x and y lists (named list columns or list variables), or a summary list (frequencies of each x value) in place of y, the plot type, a regression shown on a scatter plot, and diagnostics (r², shown with the regression). A list of text (\"red\", \"blue\" …) is categorical: it takes dotchart, bar or pie, and numbers take the other plots. The page draws it; compute the numbers with calculate (e.g. LinRegMx x,y then stat.results) to report them.",
    inputSchema: {
      type: "object",
      properties: {
        x: { type: "string" },
        y: { type: "string" },
        summary: { type: "string", description: "A frequency list for x, in place of y" },
        plot: { type: "string", enum: ["dot", "box", "histogram", "normprob", "scatter", "xyline", "dotchart", "bar", "pie"] },
        regression: { type: "string", enum: ["none", "LinRegMx", "LinRegBx", "QuadReg", "PowerReg", "ExpReg", "LnReg", "SinReg", "Logistic", "LogisticD"] },
        diagnostics: { type: "boolean" },
      },
    },
    run: async (a, h) => {
      await need(h, "datastats");
      const app = (id: string) => h.pick({ kind: "app", id });
      if (a.x) app(`dsVar:x:${String(a.x).toLowerCase()}`);
      await tick();
      if (a.y) app(`dsVar:y:${String(a.y).toLowerCase()}`);
      else if (a.summary) app(`dsSum:${String(a.summary).toLowerCase()}`);
      await tick();
      if (a.plot) app(`dsPlot:${String(a.plot)}`);
      await tick();
      const p = active(h) as Extract<Page, { kind: "datastats" }>;
      if (a.regression !== undefined) {
        const want = a.regression === "none" ? undefined : String(a.regression);
        if (p.regression !== want) app(`dsReg:${want ?? p.regression}`);
        await tick();
      }
      if (a.diagnostics !== undefined) h.wizardDone(`ds:settings:${p.digits ?? "Auto"}:${a.diagnostics ? "Yes" : "No"}`);
      await settle(h);
      const s = h.snapshot();
      return pageContent(s.doc, s.doc.active, s.geoValues);
    },
  },
  {
    name: "python",
    title: "Write and run Python",
    description:
      "On the active Python editor page: replace the program's source, and optionally run it (Ctrl+R). Output appears in the problem's Python Shell page, which becomes active. input() prompts are answered from inputs in order. ti_plotlib, ti_draw and ti_system work; ti_hub/ti_rover don't. Returns the shell output.",
    inputSchema: {
      type: "object",
      properties: {
        source: { type: "string" },
        run: { type: "boolean" },
        inputs: { type: "array", items: { type: "string" } },
      },
    },
    run: async (a, h) => {
      const p = await need(h, "python");
      if (typeof a.source === "string") h.setPython(a.source);
      if (!a.run) return "Source saved.";
      await tick();
      const shellBefore = h.snapshot().doc.pages.find((x) => x.kind === "pyshell" && (x.problem ?? 1) === (p.problem ?? 1));
      const from = shellBefore?.kind === "pyshell" ? shellBefore.lines.length : 0;
      h.runPython({ file: p.file });
      const inputs = [...((a.inputs as string[]) ?? [])];
      await tick(300);
      let finished = false;
      for (const end = Date.now() + 60000; Date.now() < end; await tick(60)) {
        const s = h.snapshot();
        if (s.python.prompt !== null && inputs.length) {
          // Typed, then Enter once the Shell has it (Enter reads the Shell's input as rendered).
          h.key({ k: "paste", text: inputs.shift()! });
          await tick();
          h.key({ k: "enter" });
          await tick();
          continue;
        }
        if (s.python.status !== "running" && s.python.status !== "loading") {
          finished = true;
          break;
        }
        if (s.python.prompt !== null) break;
      }
      const s = h.snapshot();
      const shell = s.doc.pages.find((x) => x.kind === "pyshell" && (x.problem ?? 1) === (p.problem ?? 1));
      const lines = shell?.kind === "pyshell" ? shell.lines.slice(from).map((l) => (l.kind === "err" ? `! ${l.text}` : l.text)) : [];
      return {
        output: lines.slice(-200),
        ...(s.python.prompt !== null ? { waitingForInput: s.python.prompt } : {}),
        ...(!finished ? { note: "Still running after 60 s; press {esc} with type_keys to stop it." } : {}),
      };
    },
  },
  {
    name: "write_notes",
    title: "Write notes",
    description:
      "On the active Notes page: add paragraphs of text (or replace the page). Write [[expression]] for a maths box, which is worked out like a Calculator entry and shows its result (e.g. The area is [[π*3^2]]); a maths box can define variables for the problem ([[r:=3]]). For explanations the student keeps beside their working.",
    inputSchema: {
      type: "object",
      properties: { paragraphs: { type: "array", items: { type: "string" } }, replace: { type: "boolean" } },
      required: ["paragraphs"],
    },
    run: async (a, h) => {
      await need(h, "notes");
      const err = await h.writeNotes(((a.paragraphs as string[]) ?? []).map(String), Boolean(a.replace));
      if (err) throw new Error(err);
      await settle(h);
      const s = h.snapshot();
      return pageContent(s.doc, s.doc.active, s.geoValues);
    },
  },
  {
    name: "construct_geometry",
    title: "Construct geometry",
    description:
      "On the active Geometry page: add objects in order (each may use the ones before it), move free points (a point with an existing name moves, and everything built on it follows), remove objects (with what's built on them), or clear the page. Lengths are cm, angles degrees; unless the student has panned or zoomed (read_page says), the page shows x from -10 to 10 and y about -7 to 7, so keep figures inside that. Points are named with a capital letter (A, B, C1); a transformed point's image is named with a prime (A'). Refer to a line by its id (returned) or by two point names (\"AB\"). Measurements (length, area, perimeter, angle, slope) appear on the page and their values come back; store: a variable name keeps the value in that variable for the problem's Calculator pages, updated as the figure changes. Transformations (symmetry, reflection, translation, rotation, dilation) make a live image of each object in of. calculate (Actions ▸ Calculate) puts expr's value at x, y, kept up to date as the figure moves. redefine (Actions ▸ Redefine) gives point name a new definition: on the object to (a line, circle, polygon), merged into the point to, or free at x, y; what's built on it follows. All or nothing: if one object fails, nothing is added and the error says which.",
    inputSchema: {
      type: "object",
      properties: {
        objects: {
          type: "array",
          items: {
            type: "object",
            properties: {
              type: {
                type: "string",
                enum: ["point", "segment", "line", "ray", "circle", "triangle", "polygon", "midpoint", "intersection", "perpendicular", "parallel", "perpendicular_bisector", "angle_bisector", "length", "area", "perimeter", "angle", "slope", "symmetry", "reflection", "translation", "rotation", "dilation", "calculate", "redefine"],
              },
              name: { type: "string", description: "Points: a capital letter, optionally with digits. Others: optional id." },
              x: { type: "number" },
              y: { type: "number" },
              points: { type: "array", items: { type: "string" }, description: "Point names: segment/line/ray/midpoint/perpendicular_bisector 2, triangle 3, polygon 3+, angle_bisector and angle 3 with the vertex in the middle, circle [centre], translation [from, to] (the vector)." },
              of: { type: "array", items: { type: "string" }, description: "intersection: two lines or circles (ids or \"AB\"); length/area/perimeter/slope: the object, or two points for a length; a transformation: the object(s) to transform." },
              through: { type: "string", description: "perpendicular/parallel: the point it passes through; circle: a point on it (instead of radius); symmetry/rotation/dilation: the centre." },
              to: { type: "string", description: "perpendicular/parallel: the line (id or \"AB\"); reflection: the line to reflect in; rotation/dilation: a measurement id to take the angle or factor from (instead of angle/factor), so the image follows it." },
              radius: { type: "number" },
              angle: { type: "number", description: "rotation: degrees anticlockwise." },
              factor: { type: "number", description: "dilation: the scale factor (negative goes through the centre)." },
              store: { type: "string", description: "A measurement or calculate: the variable to keep its value in (letters, digits, _)." },
              expr: { type: "string", description: "calculate: the expression, e.g. 2*a+b." },
              vars: { type: "object", additionalProperties: { type: "string" }, description: "calculate: each variable's value, a measurement's (or another result's) id, or \"=name\" for the problem's variable; the page's sliders are used as they are." },
            },
            required: ["type"],
          },
        },
        remove: { type: "array", items: { type: "string" } },
        clear: { type: "boolean" },
        axes: { type: "boolean" },
        grid: { type: "boolean" },
      },
    },
    run: async (a, h) => {
      const p = await need(h, "geometry");
      let objects = a.clear ? [] : p.objects;
      if (Array.isArray(a.remove)) objects = removeGeometry(objects, (a.remove as unknown[]).map(String));
      for (const [i, spec] of ((a.objects as GeoSpec[]) ?? []).entries()) {
        const r = addSpec(objects, spec);
        if ("error" in r) throw new Error(`objects[${i}] (${spec.type}${spec.name ? ` ${spec.name}` : ""}): ${r.error}. Nothing was changed.`);
        objects = r.objs;
      }
      h.setGeometry((g) => ({
        ...g,
        objects,
        tool: null,
        sel: null,
        ...(a.axes !== undefined ? { axes: Boolean(a.axes) } : {}),
        ...(a.grid !== undefined ? { grid: Boolean(a.grid) } : {}),
      }));
      await settle(h);
      const s = h.snapshot();
      return pageContent(s.doc, s.doc.active, s.geoValues);
    },
  },
  {
    name: "highlight",
    title: "Highlight on the calculator",
    description:
      "Put numbered rings (①, ②…) on the student's own work on the calculator, to show where it went wrong or what to look at: a Calculator history entry (entry: its number n from read_page), a Lists & Spreadsheet cell (cell: \"B3\", row 1 being the first row of values), a Graphs function (fn: 1 for f1) or point (point: {x, y}), or a Geometry object (object: its id). Each item needs a note of a few words. They replace any earlier highlights; refer to them in your reply by number. They're never saved, and each goes by itself once the student changes what it marks; clear: true takes them all off. Highlight only the student's work, not what you made.",
    inputSchema: {
      type: "object",
      properties: {
        items: {
          type: "array",
          maxItems: 9,
          items: {
            type: "object",
            properties: {
              page: { type: "integer", description: "0-based page index; omit for the active page." },
              entry: { type: "integer" },
              cell: { type: "string" },
              fn: { type: "integer" },
              point: { type: "object", properties: { x: { type: "number" }, y: { type: "number" } }, required: ["x", "y"] },
              object: { type: "string" },
              tone: { type: "string", enum: ["mistake", "look"], description: "mistake (red, the default) or look (amber: something to notice)." },
              note: { type: "string", description: "A few words: what's wrong, or what to look at." },
            },
            required: ["note"],
          },
        },
        clear: { type: "boolean" },
      },
    },
    run: async (a, h) => {
      const s = h.snapshot();
      if (s.view !== "doc") throw new Error(`No document is on screen (view: ${s.view}); nothing to highlight.`);
      if (a.clear && !Array.isArray(a.items)) {
        h.setHighlights(null);
        return "Highlights cleared.";
      }
      const r = resolveHighlights(s.doc, (a.items as HighlightInput[]) ?? []);
      if ("error" in r) throw new Error(r.error);
      h.setHighlights(r.highlights);
      await tick();
      return `${highlightsSaid(s.doc, r.highlights)} Refer to them as ${r.highlights.map((x) => badge(x.n)).join(" ")}.`;
    },
  },
  {
    name: "add_page",
    title: "Add a page",
    description: "Add a page after the active one in the open document, and make it active.",
    inputSchema: { type: "object", properties: { app: { type: "string", enum: [...APPS, "pyshell"] } }, required: ["app"] },
    run: async (a, h) => {
      const s = h.snapshot();
      if (s.view !== "doc") throw new Error("No document is open: use new_document.");
      if (s.dialog) {
        h.key({ k: "esc" });
        await tick();
      }
      h.addPage(a.app as AppKind);
      await settle(h);
      return describe(h);
    },
  },
  {
    name: "select_page",
    title: "Go to a page",
    description: "Make a page of the open document active, by 0-based index.",
    inputSchema: { type: "object", properties: { index: { type: "integer" } }, required: ["index"] },
    run: async (a, h) => {
      const s = h.snapshot();
      if (!s.doc.pages[Number(a.index)]) throw new Error(`No page ${a.index}.`);
      h.selectPage(Number(a.index));
      await settle(h);
      return describe(h);
    },
  },
  {
    name: "new_document",
    title: "New document",
    description: "Start a new, unsaved document whose first page is the given app (Python also gets a Shell page).",
    inputSchema: { type: "object", properties: { first_page: { type: "string", enum: APPS }, unsaved: unsavedArg }, required: ["first_page"] },
    run: async (a, h) => {
      await leave(h, a.unsaved);
      await h.newDoc(a.first_page as (typeof APPS)[number]);
      await settle(h);
      return describe(h);
    },
  },
  {
    name: "save_document",
    title: "Save the document",
    description: "Save the open document to My Documents. A name saves a copy under that name (Save As); a document never saved needs one.",
    inputSchema: { type: "object", properties: { name: { type: "string" } } },
    run: async (a, h) => {
      const s = h.snapshot();
      if (s.view !== "doc") throw new Error("No document is open.");
      if (!a.name && (s.scratch || !s.path)) throw new Error("This document hasn't been saved before: give it a name.");
      await h.save(a.name ? String(a.name) : undefined);
      const ok = await until(() => !h.snapshot().dirty && Boolean(h.snapshot().path), 5000);
      const e = h.snapshot().dialog;
      if (e?.kind === "error") {
        h.key({ k: "esc" });
        throw new Error(e.lines?.join(" "));
      }
      return ok ? `Saved as ${h.snapshot().path}` : "Save didn't finish.";
    },
  },
  {
    name: "list_documents",
    title: "List My Documents",
    description: "Every file and folder in My Documents (saved documents, uploaded .tns files, Python programs).",
    inputSchema: { type: "object", properties: {} },
    readOnly: true,
    run: async (_, h) => h.snapshot().files,
  },
  {
    name: "open_document",
    title: "Open a document",
    description: "Open a file from My Documents by its path (from list_documents).",
    inputSchema: { type: "object", properties: { path: { type: "string" }, unsaved: unsavedArg }, required: ["path"] },
    run: async (a, h) => {
      await leave(h, a.unsaved);
      await h.openFile(String(a.path));
      await settle(h);
      const s = h.snapshot();
      if (s.dialog) return { dialog: s.dialog };
      return describe(h);
    },
  },
  {
    name: "close_document",
    title: "Close the document",
    description: "Close the open document and go to the Home screen.",
    inputSchema: { type: "object", properties: { unsaved: unsavedArg } },
    run: async (a, h) => {
      await leave(h, a.unsaved);
      await h.close();
      await settle(h);
      return describe(h);
    },
  },
  {
    name: "navigate",
    title: "Go somewhere",
    description: "Go to the Home screen, My Documents, the Scratchpad's Calculator or Graphs, or back to the current document.",
    inputSchema: {
      type: "object",
      properties: { to: { type: "string", enum: ["home", "browse", "scratchCalc", "scratchGraph", "current"] } },
      required: ["to"],
    },
    run: async (a, h) => {
      await h.go(a.to as "home");
      await settle(h);
      return describe(h);
    },
  },
  {
    name: "select",
    title: "Select",
    description:
      "Select on the active page, as a click or the arrows would, so the context menu (run_menu 'context') and Delete act on it: objects (Geometry object ids; several take them all in, as Select ▸ Region; on a Graphs page, one object of its construction), graph (n of fn on a Graphs page), cell (Lists: \"B3\", a whole column \"B\", a whole row \"3\"), entry (a Calculator history entry, from 1), box (Notes: the caret into maths box n, from 1), text (Notes: that text selected), or clear.",
    inputSchema: {
      type: "object",
      properties: {
        objects: { type: "array", items: { type: "string" } },
        graph: { type: "number" },
        cell: { type: "string" },
        entry: { type: "number" },
        box: { type: "number" },
        text: { type: "string" },
        clear: { type: "boolean" },
      },
    },
    run: async (a, h) => {
      const err = h.select(a as SelectTarget);
      if (err) throw new Error(err);
      await settle(h);
      const s = h.snapshot();
      return pageContent(s.doc, s.doc.active, s.geoValues);
    },
  },
  {
    name: "set_slider",
    title: "Set a slider",
    description: "Set a slider on the active page (Graphs, Data & Statistics, Geometry, Notes) to a value, as typing in it does: its variable changes for the problem and what uses it follows. The range widens to take the value. Make a slider with the page's Insert Slider menu item first.",
    inputSchema: { type: "object", properties: { name: { type: "string" }, value: { type: "string", description: "A number, or something worked out (pi/4)" } }, required: ["name", "value"] },
    run: async (a, h) => {
      const err = await h.setSlider(String(a.name), String(a.value));
      if (err) throw new Error(err);
      await settle(h);
      const s = h.snapshot();
      return { ...(s.dialog ? { dialog: s.dialog } : {}), page: pageContent(s.doc, s.doc.active, s.geoValues) };
    },
  },
  {
    name: "list_menu",
    title: "Show a menu",
    description:
      "List a menu's items as the student sees them: 'page' (the menu key on the active page: Calculator's Algebra/Calculus/…, Graphs, Lists, Data & Statistics), 'context' (ctrl menu: what's selected, so select it first, or the page's own), 'document' (File, Edit, Insert, Settings), 'add_page', or 'open' (whatever menu is open now). Give path to list one submenu.",
    inputSchema: {
      type: "object",
      properties: { menu: { type: "string", enum: ["page", "context", "document", "add_page", "open"] }, path: { type: "array", items: { type: "string" } } },
      required: ["menu"],
    },
    readOnly: true,
    run: async (a, h) => {
      const was = h.snapshot().menu;
      let items = await openMenuOf(h, String(a.menu));
      for (const step of (a.path as string[]) ?? []) {
        const it = findItem(items, step);
        if (!it?.items) throw new Error(`No submenu "${step}". Items: ${items.map((x) => x.label).join(", ")}`);
        items = it.items;
      }
      if (!was || a.menu !== "open") h.key({ k: "esc" });
      await tick();
      return menuText(items, 0, a.path ? 4 : 1).join("\n");
    },
  },
  {
    name: "run_menu",
    title: "Choose a menu item",
    description:
      "Choose a menu item by its labels (or number keys), as the student would, e.g. menu 'page', path ['Calculus','Derivative'], or menu 'context' for what's selected (select it first: Cut/Copy/Paste and colours on cells, Label/Pin/Redefine/Set Conditions on a Geometry object, Hide/Delete/Color on a graph, Delete Entry in the Calculator). It may insert a template, open a dialog (fill it with respond_to_dialog), or act at once. Use list_menu first if unsure of labels.",
    inputSchema: {
      type: "object",
      properties: {
        menu: { type: "string", enum: ["page", "context", "document", "add_page", "open"] },
        path: { type: "array", items: { type: "string" }, minItems: 1 },
      },
      required: ["menu", "path"],
    },
    run: async (a, h) => {
      let items = await openMenuOf(h, String(a.menu));
      let item: MenuItem | undefined;
      for (const step of a.path as string[]) {
        item = findItem(items, step);
        if (!item) {
          h.key({ k: "esc" });
          throw new Error(`No item "${step}". Items: ${items.map((x) => x.label).join(", ")}`);
        }
        items = item.items ?? [];
      }
      if (item?.items) {
        h.key({ k: "esc" });
        throw new Error(`"${item.label}" is a submenu: ${item.items.map((x) => x.label).join(", ")}`);
      }
      if (!item?.action) {
        h.key({ k: "esc" });
        throw new Error(item?.unavailable ? `"${item.label}" is greyed just now: ${item.unavailable}.` : `"${item?.label}" isn't built in Axiom yet.`);
      }
      h.pick(item.action);
      await settle(h);
      const s = h.snapshot();
      return { chose: item.label, ...(s.dialog ? { dialog: s.dialog } : {}), page: s.view === "doc" ? pageContent(s.doc, s.doc.active, s.geoValues) : stateOf(s) };
    },
  },
  {
    name: "respond_to_dialog",
    title: "Answer a dialog",
    description:
      "Fill the open dialog's fields by label (dropdowns take one of their options; checkboxes Yes/No) and press OK, or press a button of a message (e.g. Yes, No, Cancel, OK).",
    inputSchema: {
      type: "object",
      properties: {
        fields: {
          type: "array",
          items: { type: "object", properties: { label: { type: "string" }, value: { type: "string" } }, required: ["label", "value"] },
        },
        button: { type: "string", description: "OK (default), Cancel, or a message's button label" },
      },
    },
    run: async (a, h) => {
      const d = h.snapshot().dialog;
      if (!d) throw new Error("No dialog is open.");
      const button = String(a.button ?? "OK");
      // Always through fillDialog: it also shuts an open dropdown list, which would take OK's Enter as a pick.
      if (d.kind === "dialog") {
        const fields = Array.isArray(a.fields) ? (a.fields as { label: string; value: string }[]) : [];
        const err = h.fillDialog(Object.fromEntries(fields.map((f) => [f.label, String(f.value)])));
        if (err) throw new Error(err);
        await tick();
      }
      if (/^cancel$/i.test(button) && !d.buttons?.some((b) => /^cancel$/i.test(b))) h.key({ k: "esc" });
      else if (d.buttons?.length) {
        const b = d.buttons.find((x) => norm(x) === norm(button));
        if (!b) throw new Error(`Buttons: ${d.buttons.join(", ")}`);
        h.key({ k: "char", c: b[0]! });
      } else h.key({ k: "enter" });
      await settle(h);
      const s = h.snapshot();
      return { ...(s.dialog ? { dialog: s.dialog } : {}), page: s.view === "doc" ? pageContent(s.doc, s.doc.active, s.geoValues) : stateOf(s) };
    },
  },
  {
    name: "type_keys",
    title: "Press keys",
    description:
      "Press keys on the calculator, for anything the other tools don't cover. Text is typed; keys go in braces: {enter} {approx} {esc} {tab} {up} {down} {left} {right} {backspace} {del} {clear} {menu} {ctxmenu} {vars} {doc} {insertpage} {prevpage} {nextpage} {save} {homescreen} {selectall} {undo} {redo} {frac} {sqrt} {space}.",
    inputSchema: { type: "object", properties: { keys: { type: "string" } }, required: ["keys"] },
    run: async (a, h) => {
      await typeKeys(h, String(a.keys));
      const s = h.snapshot();
      return { ...(s.dialog ? { dialog: s.dialog } : {}), ...(s.view === "doc" ? { page: pageContent(s.doc, s.doc.active, s.geoValues) } : { state: stateOf(s) }) };
    },
  },
];

export type ToolRun = { ok: boolean; text: string; image?: ToolImage };

/** Run a tool by name; errors come back as text, for the model to read and recover from. */
export async function runTool(name: string, args: Record<string, unknown>, host: AgentHost): Promise<ToolRun> {
  const t = TOOLS.find((x) => x.name === name);
  if (!t) return { ok: false, text: `Error: no tool ${name}` };
  try {
    const r = await t.run(args ?? {}, host);
    if (r instanceof Picture) return { ok: true, text: r.text, ...(r.image ? { image: r.image } : {}) };
    return { ok: true, text: typeof r === "string" ? r : JSON.stringify(r) };
  } catch (e) {
    return { ok: false, text: `Error: ${(e as Error).message}` };
  }
}
