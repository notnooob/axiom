// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 VCE Hub. Part of the /cas calculator: https://github.com/vcehub/cas
import { emptyEdit, type EditState } from "../math/editor";
import type { Row } from "../math/tree";
import { STANDARD, type GraphWindow, type Mark, type Tool } from "../graphs/model";
import type { GeoObj, GeoTool } from "../geometry/model";
import type { PageGroup } from "./layout";

/**
 * One document of problems, each with any number of pages (1.1, 1.2, 2.1 …).
 * Variables live in the engine, so every page in a problem sees the same
 * ones; each problem has its own, as on the handheld (the engine is swapped
 * over when the active page moves to another problem).
 */
export type AppKind = "calculator" | "graphs" | "lists" | "python" | "pyshell" | "datastats" | "notes" | "geometry";

export type HistoryEntry = {
  id: number;
  input: Row;
  /** The linear text that was evaluated (what Enter on a history row pastes). */
  inputText: string;
  output: Row;
  outputText: string;
  /**
   * The answer at the precision it was worked out to, when the output shows
   * it rounded to Display Digits: what ans carries on with after a reload.
   */
  ansText?: string;
  /** An error replaces the output, shown as the handheld's message. */
  error?: string;
  /** The handheld's ⚠ message for the answer, a line per string ("" between paragraphs). */
  warning?: string[];
  /** What a program showed (Disp), a line per entry, each its parts: a string in quotes is plain text, anything else maths. */
  display?: string[][];
};

/** A selected history item: up-arrow from the entry line walks these. */
/**
 * A selected history item; `scroll` is how many steps a too-wide one has been
 * scrolled with →. A click puts a caret in it instead (`caret`): the arrows
 * move it and shift+arrows select part of the line, which stays read-only.
 */
export type HistorySelection = { entry: number; part: "input" | "output"; scroll?: number; caret?: EditState };

export type CalculatorPage = {
  kind: "calculator";
  id: number;
  /** The problem it belongs to, 1 … (missing on documents saved before problems: 1). */
  problem?: number;
  history: HistoryEntry[];
  edit: EditState;
  sel: HistorySelection | null;
};

export type GraphFunction = {
  /** 1 for f1 … */
  n: number;
  text: string;
  row: Row;
  hidden?: boolean;
  /** Attributes: line weight, style and colour (a palette name); unset is the handheld's default. */
  attrs?: { weight?: "Thin" | "Medium" | "Thick"; style?: "Continuous" | "Dotted" | "Dashed"; colour?: string };
  /** Set Conditions: shown only while this holds (as typed, and as Giac tests it). */
  condition?: { text: string; giac: string };
};

/** A Text on a Graphs page, at a point of the graph. */
export type GraphText = { x: number; y: number; text: string };

/** A relation in x and y: x²+y²=4 draws a curve, y<x+1 shades a region. */
export type RelationOp = "=" | "<" | ">" | "≤" | "≥" | "≠";
export type GraphRelation = { n: number; text: string; row: Row; op: RelationOp; hidden?: boolean };

/** A parametric curve: x(t) and y(t) for t from tmin to tmax in steps of tstep. */
export type GraphParametric = {
  n: number;
  x: string;
  y: string;
  xRow: Row;
  yRow: Row;
  tmin: number;
  tmax: number;
  tstep: number;
  hidden?: boolean;
  /** A polar curve r(θ): `x` holds r and `y` is unused; it's drawn as r·cos θ, r·sin θ, with t standing for θ. */
  polar?: boolean;
};

/**
 * A differential equation y′ = f(x, y) (Graph Entry → Diff Eq): d1 with its
 * own y (y1, or the next one the page's parametric curves leave free), a
 * slope field, and the solution through (x0, y0) when that's given.
 */
export type GraphDE = { n: number; y: number; rhs: string; row: Row; x0?: number; y0?: number; hidden?: boolean };

/**
 * A sequence (Graph Entry ▸ Sequence): u1(n) from n and its earlier terms,
 * its initial terms (as many as it looks back, comma-separated), and the n
 * range and step its points are drawn for.
 */
export type GraphSequence = { n: number; rhs: string; row: Row; init: string; initValues: number[]; depth: number; nmin: number; nmax: number; nstep: number; hidden?: boolean };

/** A Custom sequence plot: one sequence's terms (x) against another's (y). */
export type CustomPlot = { n: number; x: number; y: number; hidden?: boolean };

/** The Differential Equation dialog's settings, one set per page; defaults as on the handheld. */
export type DESettings = {
  method: "Euler" | "Runge-Kutta";
  iterations: number;
  field: "Slope" | "None";
  start: number;
  end: number;
  step: number;
  resolution: number;
};
export const DE_DEFAULTS: DESettings = { method: "Euler", iterations: 1, field: "Slope", start: -10, end: 10, step: 0.1, resolution: 14 };

/**
 * A slider on a Graphs page: it sets a variable (shared with the rest of the
 * problem) between min and max. step "auto" is a tenth of the range (see
 * sliderStep).
 */
export type Slider = {
  name: string;
  value: number;
  min: number;
  max: number;
  step: number | "auto";
  vertical?: boolean;
  minimized?: boolean;
  animating?: boolean;
  /** Display Digits, as the settings list names it ("Float 3", the default). */
  digits?: string;
  /** Show Variable and Show Scale turned off (both are on by default). */
  hideName?: boolean;
  hideScale?: boolean;
  /** Where Move put it, as fractions of the graph's width and height; unset, it takes the next place down the left. */
  at?: { x: number; y: number };
};

/** A scatter plot (s1 …): an x list and a y list, by variable name. */
export type ScatterPlot = { n: number; x: string; y: string; hidden?: boolean };

export type GraphsPage = {
  kind: "graphs";
  id: number;
  problem?: number;
  /** The imported card, written back unchanged on export while the page is unedited. */
  xml?: string;
  functions: GraphFunction[];
  /** Missing on documents saved before relations existed. */
  relations?: GraphRelation[];
  parametrics?: GraphParametric[];
  des?: GraphDE[];
  deSettings?: DESettings;
  sequences?: GraphSequence[];
  customPlots?: CustomPlot[];
  sliders?: Slider[];
  scatters?: ScatterPlot[];
  /** The parametric entry line's five fields (x, y, tmin, tmax, tstep), or a Diff Eq's three (f, x0, y0), while it's open; `field` is the one being edited. */
  parDraft?: { field: number; rows: Row[]; fresh?: boolean; polar?: boolean };
  window: GraphWindow;
  /** Trace Step: how far one arrow press moves a trace along x; unset is Auto (a hundredth of the window). */
  traceStep?: number;
  /** The window last set in Window Settings, which Zoom – User goes back to. */
  userWindow?: GraphWindow;
  /** Zoom – Box (and Select ▸ Region): the crosshair, and the first corner once it's set. */
  zoomBox?: { x: number; y: number; first?: { x: number; y: number }; select?: boolean };
  /** Texts placed with Actions ▸ Text and Calculate. */
  texts?: GraphText[];
  /** What Select ▸ Region picked: marks and texts by index, which del deletes. */
  selected?: { marks: number[]; texts: number[] };
  /** MathDraw: a stroke drawn on the graph becomes the line or circle it looks like. */
  mathDraw?: boolean;
  /** View: Graphing (unset), Plane Geometry (no axes) or 3D Graphing. */
  view?: "plane" | "3d";
  /** 3D Graphing's surfaces z1(x, y) …, and how the view is turned. */
  surfaces?: { n: number; text: string; row: Row; hidden?: boolean }[];
  view3d?: { yaw: number; pitch: number };
  /** View ▸ Hide Analytic Window, Hide Axes End Values and Hide Object Selection Guides. */
  hideAnalytic?: boolean;
  hideEndValues?: boolean;
  hideGuides?: boolean;
  /** Graphs & Geometry Settings, as the dialog's fields left them. */
  gsettings?: { digits?: string; graphAngle?: string; geoAngle?: string; hideLabels?: boolean; tooltips?: boolean; poi?: boolean; intAngles?: boolean; labelPoints?: boolean; analyticInPlane?: boolean };
  /** Path Plot: a point running along a graph, drawing it as it goes. */
  pathPlot?: { kind: "fn" | "par"; n: number; started: number };
  /** Path Setup: how long a Path Plot takes, in seconds. */
  pathSeconds?: number;
  /** Geometry ▸ tools on the graph: a construction drawn over it, in its coordinates. */
  geo?: { objects: GeoObj[]; tool?: { name: GeoTool; picked: string[] } | null; sel?: string | null };
  /** Geometry Trace: a moved graph leaves its earlier positions drawn faintly; the number goes up on each Erase. */
  geoTrace?: boolean;
  traceErased?: number;
  /** The entry line: which f (or rel) it's editing, or null when hidden. */
  editing: number | null;
  /** "rel", "par" or "de" while the entry line edits a relation, a parametric or a Diff Eq, else a function. */
  entryKind?: "rel" | "par" | "de" | "seq" | "z";
  edit: EditState;
  tool: Tool | null;
  marks: Mark[];
  table: boolean;
  grid: "none" | "dot" | "line";
  axes: boolean;
};

/**
 * Lists & Spreadsheet. Each column has an optional name (which makes it a
 * list variable for the whole problem), an optional column formula, and its
 * cells as typed ("=" starts a cell formula). `values` holds what each cell
 * shows after the last recalculation.
 */
export type ListsColumn = { name?: string; formula?: string; cells: string[]; values?: string[] };
/** row: 0 is the name row, 1 the ◆ formula row, 2… the cells (cell index row − 2). */
export type ListsSel = { row: number; col: number };
export type ListsPage = {
  kind: "lists";
  id: number;
  problem?: number;
  cols: ListsColumn[];
  sel: ListsSel;
  /** The cell being edited, or null. */
  edit: EditState | null;
};

/**
 * Data & Statistics: a plot of a list (x) or two lists (x against y), by
 * variable name, with what's been added to it from Analyze. `window` unset
 * fits the data.
 */
export type DataPlot = "dot" | "box" | "histogram" | "normprob" | "scatter" | "xyline";
/** Histogram Scale: what a bar's height counts (Frequency, Percent or Density on the y-axis). */
export type HistScale = "count" | "percent" | "density";
export type DataStatsPage = {
  kind: "datastats";
  id: number;
  problem?: number;
  x?: string;
  y?: string;
  plot: DataPlot;
  window?: GraphWindow;
  connect?: boolean;
  extendWhiskers?: boolean;
  bins?: { width: number; start: number };
  /** Unset is Count, the handheld's default. */
  histScale?: HistScale;
  /** A regression command (LinRegMx, QuadReg …) shown with its equation. */
  regression?: string;
  movable?: { m: number; b: number; lock?: boolean };
  /** Analyze ▸ Residuals: squares from each point to the curve, and a plot of the residuals under the data. */
  residualSquares?: boolean;
  residualPlot?: boolean;
  /** Plot Function: expressions in x. */
  functions?: string[];
  /** Plot Value: expressions (mean(a) …) drawn as vertical lines. */
  values?: string[];
  normalPdf?: boolean;
  digits?: string;
  diagnostics?: boolean;
  xml?: string;
};

/** A Python program in the editor: one file per page, as on the handheld. */
export type PythonPage = { kind: "python"; id: number; problem?: number; file: string; source: string };
/** The Python Shell: what's been printed and typed, and the line being typed. */
export type ShellLine = { kind: "in" | "out" | "err"; text: string };
export type PyShellPage = { kind: "pyshell"; id: number; problem?: number; lines: ShellLine[]; input: string };

/** Text formatting in Notes. */
export type NotesStyle = { b?: boolean; i?: boolean; u?: boolean; s?: boolean; sub?: boolean; sup?: boolean };
export type NotesMath = { math: string; out?: string; approx?: boolean; hideIn?: boolean; hideOut?: boolean };
/**
 * A piece of a Notes paragraph: plain text (a string), formatted text, a maths
 * box (its input, and its result once worked out), a chem box, or a comment.
 */
export type NotesRun = string | ({ text: string } & NotesStyle) | NotesMath | { chem: string } | { comment: string; by: "Teacher" | "Reviewer" };
export type NotesPage = { kind: "notes"; id: number; problem?: number; paras: NotesRun[][]; xml?: string };

/**
 * A Geometry page: its construction, the tool in use (and what it has picked so
 * far), the selected object, and whether the axes and grid show.
 */
export type GeometryPage = {
  kind: "geometry";
  id: number;
  problem?: number;
  objects: GeoObj[];
  tool?: { name: GeoTool; picked: string[] } | null;
  sel?: string | null;
  axes?: boolean;
  grid?: boolean;
  /** What's shown: the centre (cm) and the width across; unset is (0, 0) and 20 cm. */
  view?: { x: number; y: number; w: number };
  /** Texts placed with Actions ▸ Text, at a point of the plane (cm). */
  texts?: GraphText[];
};

/** A page from an app that isn't built yet (Lua, Widgets…), kept so the document stays whole. */
export type UnsupportedPage = { kind: "unsupported"; id: number; problem?: number; app: string; xml?: string };

export type Page = CalculatorPage | GraphsPage | ListsPage | PythonPage | PyShellPage | NotesPage | UnsupportedPage | DataStatsPage | GeometryPage;

export type CasDocument = {
  title: string;
  pages: Page[];
  active: number;
  /** The engine definitions of each problem other than the active one, by problem number. */
  problems?: Record<string, string[]>;
  /**
   * Imported variables not yet in the engine, as TI statements (a:=3,
   * Define f(x)=…), by problem: evaluated the first time the problem is shown.
   */
  pendingSym?: Record<string, string[]>;
  /** Names given with Problem ▸ Rename, by problem number. */
  problemNames?: Record<string, string>;
  /** Pages sharing one screen (doc ▸ Page Layout), state/layout.ts. */
  groups?: PageGroup[];
};

let nextId = 1;
export const newId = () => nextId++;

/** After restoring a saved document, keep new ids clear of the old ones. */
export function bumpIds(doc: CasDocument): void {
  for (const p of doc.pages) {
    nextId = Math.max(nextId, p.id + 1);
    if (p.kind === "calculator") for (const h of p.history) nextId = Math.max(nextId, h.id + 1);
  }
}

export function newPage(kind: AppKind, problem = 1): Page {
  if (kind === "calculator") return { kind, id: newId(), problem, history: [], edit: emptyEdit(), sel: null };
  if (kind === "lists") return { kind, id: newId(), problem, cols: [], sel: { row: 2, col: 0 }, edit: null };
  if (kind === "python") return { kind, id: newId(), problem, file: "program.py", source: "" };
  if (kind === "pyshell") return { kind, id: newId(), problem, lines: [], input: "" };
  if (kind === "datastats") return { kind, id: newId(), problem, plot: "dot" };
  if (kind === "notes") return { kind, id: newId(), problem, paras: [] };
  if (kind === "geometry") return { kind, id: newId(), problem, objects: [] };
  return {
    kind,
    id: newId(),
    problem,
    functions: [],
    window: STANDARD,
    editing: 1,
    edit: emptyEdit(),
    tool: null,
    marks: [],
    table: false,
    grid: "none",
    axes: true,
  };
}

export function newDocument(first: AppKind = "calculator", title = "Untitled"): CasDocument {
  return { title, pages: [newPage(first)], active: 0 };
}

export const problemOf = (p: Page | undefined): number => p?.problem ?? 1;

/**
 * What a page shows while it's being worked on, rather than what it holds:
 * the tool in use, the selection, the entry line. Changing only these leaves
 * an imported page's original card still true to it.
 */
const VIEW_ONLY: Partial<Record<Page["kind"], ReadonlySet<string>>> = {
  graphs: new Set(["tool", "editing", "entryKind", "edit", "parDraft", "zoomBox", "selected", "mathDraw", "pathPlot"]),
};

/** Whether next changes what page p holds (so its imported card no longer matches), not just how it's being worked on. */
export function editsContent(p: Page, next: Page): boolean {
  if (p === next) return false;
  if (p.kind !== next.kind) return true;
  const view = VIEW_ONLY[p.kind];
  const a = p as Record<string, unknown>;
  const b = next as Record<string, unknown>;
  for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) {
    if (k === "xml" || view?.has(k) || a[k] === b[k]) continue;
    // A Graphs page's construction: its tool and selection are view, its objects are content.
    if (k === "geo" && p.kind === "graphs") {
      const g = a.geo as GraphsPage["geo"];
      const h = b.geo as GraphsPage["geo"];
      if ((g?.objects ?? []) === (h?.objects ?? []) || (!g?.objects?.length && !h?.objects?.length)) continue;
    }
    return true;
  }
  return false;
}

/** A page's label, problem.page: 2.1 is the first page of problem 2. Pages laid out together on one screen share theirs. */
export function pageLabel(doc: CasDocument, i: number): string {
  const p = doc.pages[i];
  const n = problemOf(p);
  const groupOf = (id: number) => (doc.groups ?? []).findIndex((g) => g.slots.includes(id));
  const counted = new Set<number>();
  let within = 0;
  for (const q of doc.pages) {
    const g = groupOf(q.id);
    const unit = g < 0 || !counted.has(g);
    if (g >= 0) counted.add(g);
    if (unit && problemOf(q) === n) within++;
    if (q === p || (g >= 0 && g === groupOf(p?.id ?? -1))) break;
  }
  return `${n}.${within}`;
}

/** A new problem after the active one's last page: one Calculator page, active. */
export function insertProblem(doc: CasDocument): CasDocument {
  const current = problemOf(doc.pages[doc.active]);
  const next = Math.max(...doc.pages.map(problemOf)) + 1;
  let at = doc.active;
  while (at + 1 < doc.pages.length && problemOf(doc.pages[at + 1]) === current) at++;
  const pages = doc.pages.slice();
  pages.splice(at + 1, 0, newPage("calculator", next));
  return { ...doc, pages, active: at + 1 };
}
