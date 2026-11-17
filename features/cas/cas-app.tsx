// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 VCE Hub. Part of the /cas calculator: https://github.com/vcehub/cas
"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ClipboardEvent,
  type KeyboardEvent,
} from "react";
import { createPortal } from "react-dom";
import { AnimatePresence } from "framer-motion";
import { Sparkles } from "lucide-react";
import { toast } from "sonner";
import { ScaleIn } from "@/src/components/amicro/scale-in";
import { TextShimmer } from "@/src/components/amicro/text-shimmer";
import { useWebHaptics } from "@/src/hooks/use-web-haptics";
import { cn } from "@/shared/lib/utils";
import { historySaid, markSaid, menuSaid, pageSaid, toolSaid, wizardSaid } from "./a11y";
import { calcKey, wizardInsert } from "./calculator/calc-keys";
import { CalculatorApp } from "./calculator/calculator-app";
import { CasEngine, definedFunctions, definedNames, type EngineStatus } from "./engine/client";
import { DEFAULT_SETTINGS, evaluate, type Settings } from "./engine/evaluate";
import { unrounded } from "./engine/format";
import { analyze } from "./graphs/analyze";
import {
  graphKey,
  nextFree,
  deY,
  openDE,
  openEntry,
  openParametric,
  openRelation,
  startTool,
  type GraphEffect,
} from "./graphs/graph-keys";
import { GraphsApp } from "./graphs/graphs-app";
import { deDefinition, pageDefinitions } from "./graphs/definitions";
import { autoScale, fnName, parNames, relName, zoomed, type Samples } from "./graphs/model";
import { Keypad } from "./keypad/keypad";
import { keyFromEvent, type Key } from "./keys";
import { parse, type Ast } from "./math/ast";
import { print } from "./math/print";
import { RENAME_IN, translate } from "./engine/translate";
import { DE_DEFAULTS, type RelationOp, type Slider } from "./state/document";
import { emptyEdit, selectBetween, selection, selectionText, templateNode } from "./math/editor";
import { DefinedNames } from "./math/render";
import { astToRow, chars, rowToLinear, type Row } from "./math/tree";
import { calculatorMenu } from "./menus/calculator-menu";
import { graphsMenu } from "./menus/graphs-menu";
import { MenuOverlay, menuKeyPress, openMenu, type MenuState } from "./menus/menu";
import { type Menu, type MenuAction, type MenuItem } from "./menus/types";
import {
  CatalogOverlay,
  catalogKeyPress,
  catalogSaid,
  openCatalog,
  type CatalogResult,
  type CatalogState,
} from "./catalog/catalog";
import { PALETTE, paletteKeyPress, pickCell, TemplatePalette } from "./menus/palette";
import { FinanceSolver, financeKeyPress, newFinance, type FinanceState } from "./finance/finance-solver";
import { openWizard, WizardDialog, wizardKeyPress, type WizardState } from "./menus/wizard";
import { download, screenPng } from "./screen/capture";
import { ADD_PAGE, BROWSE_MENU, DOC_MENU, SETTINGS_MENU } from "./menus/doc-menus";
import { app as menuApp } from "./menus/types";
import { BROWSE_START, BrowseScreen, browseKeyPress, targetFolder, visibleRows, type BrowseState } from "./files/browse";
import { HOME_START, HomeScreen, homeKeyPress, type HomeAction, type HomeSel } from "./files/home";
import * as files from "./files/store";
import { addFiles } from "./files/upload";
import { classify, decodeTns } from "./tns/decode";
import { exportTns } from "./tns/export";
import { importTns } from "./tns/import";
import { ListsApp } from "./lists/lists-app";
import { listsMenu } from "./lists/lists-menu";
import * as sheet from "./lists/sheet";
import { NotesApp, UnsupportedApp, type NotesApi } from "./notes/notes-app";
import { NOTES_MENU } from "./notes/notes-menu";
import { DataStatsApp } from "./data/data-app";
import { dataMenu } from "./data/data-menu";
import { GeometryApp, geometryKey, zoomed as zoomedGeo } from "./geometry/geometry-app";
import { geometryMenu } from "./geometry/geometry-menu";
import { ASKS, remove as removeGeo, resolve as resolveGeo, transformWith, TOOL_NAMES as GEO_TOOLS, VAR_NAME, type GeoTool } from "./geometry/model";
import { ONE_VAR } from "./data/plot";
import type { GraphWindow } from "./graphs/model";
import { PythonCanvas, PythonEditor, PythonShell, type DrawOp } from "./python/python-app";
import { python, type PyStatus } from "./python/runner";
import { oneVar, regression, twoVar, type StatResult } from "./engine/stats";
import { freeVariables, SLIDER_DIGITS, sliderStep, snap } from "./graphs/sliders";
import { Screen } from "./screen/screen";
import { EnginePill, ErrorDialog, Legal, MessageDialog, Notice, ScreenBar, SliderPrompt, type Choice, type SliderAsk } from "./screen/dialogs";
import { AiPanel } from "./ai/ai-panel";
import { AiMode } from "./ai/ai-mode";
import { AssistantSettings, useAssistant, type DocActions, type DocBinding } from "./ai/assistant";
import { highlightsSaid, liveHighlights, type Highlight } from "./ai/highlights";
import { ownsOpenDoc, restoreOf } from "./ai/threads";
import type { AgentDialog, AgentHost } from "./ai/tools";
import { registerWebMcp } from "./ai/webmcp";
import { clearPrefs, load, pref, save, setPref, type Saved } from "./state/persist";
import { recordStep, undoStep, type UndoStacks } from "./state/undo";
import {
  bumpIds,
  insertProblem,
  newDocument,
  newId,
  newPage,
  pageLabel,
  problemOf,
  type CalculatorPage,
  type CasDocument,
  type GraphsPage,
  type DataStatsPage,
  type GeometryPage,
  type ListsPage,
  type NotesRun,
  type Page,
  type PyShellPage,
  type PythonPage,
  type ShellLine,
} from "./state/document";

/**
 * The device's width: the page's column on phones; on wide screens the
 * keypad, the gap, the screen and the body's padding at their largest, the
 * screen as tall as the window leaves room for (--cas-h).
 */
const DEVICE_WIDTH =
  "w-full max-w-136 [--cas-h:calc(100dvh-12.5rem)] lg:max-w-[calc(min(24rem,var(--cas-h)/2.1)+1.25rem+var(--cas-h)*4/3+2.5rem)]";

/**
 * The last answer on the page, for ans when this visit has none yet (after a
 * reload, or on coming back to a problem). The handheld keeps ans with the
 * document, as it does its other system variables.
 */
function shownAnswer(page: CalculatorPage): Ast | undefined {
  const last = page.history.at(-1);
  // At full precision, as the handheld keeps it, when the shown answer is rounded.
  const text = last?.ansText ?? last?.outputText;
  if (!text) return undefined;
  try {
    return parse(text);
  } catch {
    return undefined;
  }
}

/**
 * Slider Settings; Insert Slider
 * opens it for a new slider (v1, v2 …). OK builds "slider:<old name>:<fields>",
 * handled in wizardDone.
 */
function sliderSettings(sl: Slider | null, newName = "v1") {
  const s: Slider = sl ?? { name: newName, value: 1, min: -5, max: 5, step: "auto" };
  const yes = (on: boolean) => (on ? "Yes" : "No");
  return openWizard({
    kind: "wizard",
    title: "Slider Settings",
    arrows: false,
    fields: [
      { label: "Variable:", value: s.name },
      { label: "Value:", value: String(s.value) },
      { label: "Minimum:", value: String(s.min) },
      { label: "Maximum:", value: String(s.max) },
      { label: "Step Size:", value: s.step === "auto" ? "Automatic" : String(s.step), options: ["Automatic"], free: true },
      { label: "Style:", value: s.vertical ? "Vertical" : "Horizontal", options: ["Horizontal", "Vertical"] },
      { label: "Display Digits:", value: s.digits ?? "Float 3", options: SLIDER_DIGITS },
      { label: "Minimized", value: yes(Boolean(s.minimized)), check: true },
      { label: "Show Variable", value: yes(!s.hideName), check: true },
      { label: "Show Scale", value: yes(!s.hideScale), check: true },
    ],
    build: `slider:${sl?.name ?? ""}:{0}:{1}:{2}:{3}:{4}:{5}:{6}:{7}:{8}:{9}`,
  });
}

/** Where Insert Slider puts a new slider, as fractions of the graph, as the handheld does. */
const INSERTED_AT = { x: 0.69, y: 0.26 };

const FINANCE_NAMES = ["N", "I(%)", "PV", "Pmt", "FV", "PpY", "CpY", "PmtAt"];

const DIGIT_OPTIONS = ["Float", ...Array.from({ length: 12 }, (_, i) => `Float${i + 1}`)];

/** "new": a blank document behind the add-page menu, before its first page is chosen. */
type View = "home" | "browse" | "doc" | "new";
/** The open document, kept in this browser between Saves (and while the Scratchpad is shown). */
type Cached = { saved: Saved; path: string | null; dirty: boolean };
type Setup = { text: "Small" | "Medium" | "Large"; haptics: boolean };
const TEXT_SCALE: Record<Setup["text"], number> = { Small: 0.88, Medium: 1, Large: 1.18 };
const RECENT_MAX = 5;

/** The Scratchpad always has a Calculator page and a Graphs page (A Calculate, B Graph). */
function withScratchPages(doc: CasDocument): CasDocument {
  const pages = doc.pages.slice();
  if (!pages.some((p) => p.kind === "calculator")) pages.unshift(newPage("calculator"));
  if (!pages.some((p) => p.kind === "graphs")) pages.push(newPage("graphs"));
  return { ...doc, title: "Scratchpad", pages };
}
const freshScratch = (): Saved => ({ doc: withScratchPages(newDocument()), settings: DEFAULT_SETTINGS, definitions: [] });

const stem = (name: string) => name.replace(/\.tns$/i, "");

/**
 * The whole calculator: one document, its pages, the engine, and the key
 * routing that sends every key press (keyboard or keypad) to the active
 * page, or to whichever menu or dialog is open over it.
 */
export function CasApp() {
  const [doc, setDoc] = useState<CasDocument>(newDocument);
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [status, setStatus] = useState<EngineStatus>("loading");
  const [error, setError] = useState<string | null>(null);
  /** The message of the ⚠ last clicked, while its dialog is open. */
  const [warning, setWarning] = useState<string[] | null>(null);
  const [menu, setMenu] = useState<{ items: Menu; state: MenuState } | null>(null);
  const [wizard, setWizard] = useState<WizardState | null>(null);
  /** The templates palette's selected cell, or null when it's closed. */
  const [palette, setPalette] = useState<number | null>(null);
  /** Names with a definition, shown in bold wherever they appear. */
  const [defined, setDefined] = useState<ReadonlySet<string>>(new Set());
  const [catalog, setCatalog] = useState<CatalogState | null>(null);
  /** Variables in a new graph with no value yet: Create Sliders, a box ticked for each. */
  const [sliderPrompt, setSliderPrompt] = useState<SliderAsk | null>(null);
  /** Finance Solver while it's open; its values stay for the next opening. */
  const [finance, setFinance] = useState<FinanceState | null>(null);
  const lastFinance = useRef<FinanceState>(newFinance());
  const engine = useRef<CasEngine | null>(null);
  const lastAns = useRef<Ast | undefined>(undefined);
  const samples = useRef<Samples[]>([]);
  const busy = useRef(false);
  const root = useRef<HTMLDivElement>(null);
  const screenBox = useRef<HTMLDivElement>(null);
  // Read out through the live region; n changes so a repeat is read again.
  const [said, setSaid] = useState({ text: "", n: 0 });
  const say = useCallback((text: string) => setSaid((s) => ({ text, n: s.n + 1 })), []);
  const { trigger: haptic } = useWebHaptics();
  // A focus ring for keyboard focus only: clicking a key also focuses the calculator.
  const pointerFocus = useRef(false);
  const [keyboardFocus, setKeyboardFocus] = useState(false);

  // The handheld around the document: home screen, My Documents, the open file.
  const [view, setView] = useState<View>("home");
  const [homeSel, setHomeSel] = useState<HomeSel>(HOME_START);
  const [browse, setBrowse] = useState<BrowseState>(BROWSE_START);
  const [fileList, setFileList] = useState<files.FileRecord[]>([]);
  /** The Scratchpad is on screen (it saves itself); otherwise a document. */
  const [isScratch, setIsScratch] = useState(true);
  /** The document's path in My Documents; null until it's first saved. */
  const [openPath, setOpenPath] = useState<string | null>(null);
  /** Changed since it was last saved (the * before the title, as on the handheld). */
  const [dirty, setDirty] = useState(false);
  /** The assistant thread whose document is open (it made, opened or worked on it); null for the student's own. */
  const [docOwner, setDocOwner] = useState<string | null>(null);
  /** The assistant's highlights (ai/highlights.ts): shown on their pages, never saved. */
  const [highlights, setHighlights] = useState<Highlight[]>([]);
  const docOwnerRef = useRef<string | null>(null);
  const own = useCallback((thread: string | null) => {
    docOwnerRef.current = thread;
    setDocOwner(thread);
  }, []);
  /** What to do once a Save As (asked for by "save changes?") is done. */
  const afterSave = useRef<(() => void) | null>(null);
  const [setup, setSetupState] = useState<Setup>(() => pref<Setup>("setup", { text: "Medium", haptics: true }));
  const [recent, setRecent] = useState<string[]>(() => pref<string[]>("recent", []));
  const [confirm, setConfirm] = useState<{ title: string; lines: string[]; ok: () => void; buttons?: Choice[] } | null>(null);
  const [dragging, setDragging] = useState(false);
  const uploadInput = useRef<HTMLInputElement>(null);
  /** The next change to doc is an opening, not an edit: don't write it back. */
  const skipSave = useRef(false);
  /** New Document asked which app to start with: ADD_PAGE's answer makes the document. */
  const creatingNew = useRef(false);
  const rows = useMemo(() => visibleRows(fileList, browse), [fileList, browse]);
  const refreshFiles = useCallback(async () => setFileList(await files.all()), []);
  const hap = useCallback((t: Parameters<typeof haptic>[0]) => setup.haptics && haptic(t), [setup.haptics, haptic]);

  // Python: the worker's state, the input() prompt waiting for an answer, and what a program has drawn.
  const [py, setPy] = useState<{ status: PyStatus; prompt: string | null; canvas: DrawOp[] | null }>({
    status: "off",
    prompt: null,
    canvas: null,
  });
  const pyEditor = useRef<HTMLTextAreaElement | null>(null);
  /** The Shell page the running program prints to. */
  const pyShell = useRef<number | null>(null);

  const restored = useRef(false);
  /** The problem whose definitions the engine holds now. */
  const shownProblem = useRef(1);
  /** The saved document's problem until that document is on screen (the first render still shows the default one). */
  const opening = useRef<number | null>(null);
  useEffect(() => {
    // Pick up the document from this browser's last visit, if there is one.
    const loaded = load();
    const saved = loaded ? { ...loaded, doc: withScratchPages(loaded.doc) } : null;
    const e = new CasEngine(saved?.settings ?? DEFAULT_SETTINGS);
    engine.current = e;
    if (saved) {
      // The engine is given the active problem's definitions below: no swap on opening.
      shownProblem.current = problemOf(saved.doc.pages[saved.doc.active]);
      opening.current = shownProblem.current;
      setDoc(saved.doc);
      setSettings(saved.settings);
      void e.restore(saved.definitions).then(async () => {
        // Each Graphs page's own names, for documents saved before pages had them.
        for (const pg of saved.doc.pages)
          if (pg.kind === "graphs")
            for (const d of pageDefinitions(pg, saved.settings)) {
              await e.giac(d);
              e.remember(d);
            }
      });
      setDefined(definedNames(saved.definitions));
    }
    else setDoc(freshScratch().doc);
    restored.current = true;
    skipSave.current = true;
    void refreshFiles();
    const unsubscribe = e.onStatus(setStatus);
    return () => {
      unsubscribe();
      e.dispose();
    };
  }, []);

  // Every change is kept 400 ms later: the Scratchpad in this browser's
  // storage, a document in the cache (it reaches My Documents on Save).
  // Opening a document isn't a change.
  const current = useRef({ doc, settings, openPath, isScratch, dirty });
  current.current = { doc, settings, openPath, isScratch, dirty };
  const snapshot = useCallback((): Saved => {
    const { doc: d, settings: st } = current.current;
    return { doc: d, settings: st, definitions: engine.current?.saved ?? [] };
  }, []);
  const writeNow = useCallback(async () => {
    const c = current.current;
    if (c.isScratch) save(snapshot());
    else setPref("current", { saved: snapshot(), path: c.openPath, dirty: c.dirty } satisfies Cached);
  }, [snapshot]);
  useEffect(() => {
    if (!restored.current) return;
    if (skipSave.current) {
      skipSave.current = false;
      return;
    }
    if (!current.current.isScratch) {
      setDirty(true);
      current.current.dirty = true;
    }
    const t = setTimeout(() => void writeNow(), 400);
    return () => clearTimeout(t);
  }, [doc, settings, writeNow]);

  const page = doc.pages[doc.active];
  // The assistant's highlights that still match what they marked, and those on the page on screen.
  const shownHighlights = useMemo(() => liveHighlights(doc, highlights), [doc, highlights]);
  const pageHighlights = useMemo(() => shownHighlights.filter((h) => h.pageId === page?.id), [shownHighlights, page?.id]);
  // Function numbers in use across the problem: every Graphs page's, and
  // f1, f2 … defined anywhere (the Calculator, a regression). The next graph
  // takes the lowest free one.
  const takenFns = useMemo(() => {
    const out = new Set<number>();
    for (const name of defined) {
      const m = /^f(\d+)$/.exec(name);
      if (m) out.add(Number(m[1]));
    }
    const here = problemOf(doc.pages[doc.active]);
    for (const pg of doc.pages) if (pg.kind === "graphs" && problemOf(pg) === here) for (const f of pg.functions) out.add(f.n);
    return out;
  }, [defined, doc.pages, doc.active]);

  // Each problem has its own variables: moving to a page of another problem
  // puts the current problem's definitions in the document, restarts the
  // engine and replays the other problem's.
  const activeProblem = problemOf(doc.pages[doc.active]);
  const latestDoc = useRef(doc);
  latestDoc.current = doc;
  useEffect(() => {
    const e = engine.current;
    if (opening.current !== null) {
      if (opening.current === activeProblem) opening.current = null;
      return;
    }
    const from = shownProblem.current;
    if (!e || from === activeProblem) return;
    shownProblem.current = activeProblem;
    const leaving = e.saved;
    const arriving: string[] = latestDoc.current.problems?.[String(activeProblem)] ?? [];
    setDoc((d) => {
      const problems: Record<string, string[]> = { ...(d.problems ?? {}), [String(from)]: leaving };
      delete problems[String(activeProblem)];
      return { ...d, problems };
    });
    lastAns.current = undefined;
    void (async () => {
      await e.clearAll();
      await e.restore(arriving);
      setDefined(definedNames(arriving));
      await applyPending(activeProblem);
    })();
  }, [activeProblem]); // eslint-disable-line react-hooks/exhaustive-deps

  // A stored Geometry measurement keeps its variable up to date: name:=value
  // goes to the engine once the figure settles (not on every step of a drag).
  const storedGeo = useMemo(() => {
    const out: [string, string][] = [];
    for (const pg of doc.pages) {
      if (pg.kind !== "geometry" || problemOf(pg) !== activeProblem || !pg.objects.some((o) => o.kind === "measure" && o.store)) continue;
      const shapes = resolveGeo(pg.objects);
      for (const o of pg.objects) {
        const s = shapes.get(o.id);
        if (o.kind === "measure" && o.store && s?.t === "value" && Number.isFinite(s.value))
          out.push([o.store, String(Math.abs(s.value) < 1e-10 ? 0 : Number(s.value.toPrecision(12)))]);
      }
    }
    return out;
  }, [doc.pages, activeProblem]);
  const sentGeo = useRef(new Map<string, string>());
  useEffect(() => {
    if (status !== "ready" || !storedGeo.length) return;
    const t = setTimeout(async () => {
      const e = engine.current;
      if (!e) return;
      for (const [name, value] of storedGeo) {
        const key = `${activeProblem}:${name}`;
        if (sentGeo.current.get(key) === value) continue;
        sentGeo.current.set(key, value);
        try {
          const r = await evaluate(`${name}:=${value}`, e.giac, { settings: current.current.settings });
          if (!r.ok) setError(r.error);
          else for (const d of [...(r.definitions ?? []), ...(r.definition ? [r.definition] : [])]) e.remember(d);
        } catch (err) {
          setError(`Error: ${(err as Error).message}`);
        }
      }
      setDefined(definedNames(e.saved));
    }, 250);
    return () => clearTimeout(t);
  }, [storedGeo, activeProblem, status]);

  /**
   * An imported document's variables (a:=3, Define f1(x)=…) go into the
   * engine the first time their problem is shown, then leave pendingSym.
   */
  const applyPending = useCallback(async (problem: number) => {
    const e = engine.current;
    const stmts = latestDoc.current.pendingSym?.[String(problem)];
    if (!e || !stmts?.length) return;
    for (const stmt of stmts) {
      try {
        const r = await evaluate(stmt, e.giac, { settings: current.current.settings });
        if (r.ok) for (const d of [...(r.definitions ?? []), ...(r.definition ? [r.definition] : [])]) e.remember(d);
      } catch {
        // A variable the engine can't take is left out; the rest still come across.
      }
    }
    setDefined(definedNames(e.saved));
    setDoc((d) => {
      const pendingSym = { ...(d.pendingSym ?? {}) };
      delete pendingSym[String(problem)];
      return { ...d, pendingSym };
    });
  }, []);

  /**
   * Undo and redo, per page: the entry line, and history lines removed with
   * del. An evaluated line (or a function entered on a Graphs page) is a
   * wall: what it defined is already in the engine, so undo stops there.
   */
  const undo = useRef(new Map<number, UndoStacks>());
  /** The change being made comes from typing a character: a run of them undoes as one step. */
  const typing = useRef(false);
  const recordUndo = useCallback((p: Page, n: Page) => recordStep(undo.current, p, n, typing.current), []);

  /** Update the active page if it's of the given kind. */
  const update = useCallback(
    <K extends Page["kind"]>(kind: K, fn: (p: Extract<Page, { kind: K }>) => Page) => {
      setDoc((d) => {
        const p = d.pages[d.active];
        if (!p || p.kind !== kind) return d;
        const pages = d.pages.slice();
        let next = fn(p as Extract<Page, { kind: K }>);
        // An imported Graphs page's original XML no longer matches once it's edited.
        if ((next.kind === "graphs" || next.kind === "datastats" || next.kind === "notes") && next.xml && next !== p) next = { ...next, xml: undefined };
        recordUndo(p, next);
        pages[d.active] = next;
        return { ...d, pages };
      });
    },
    [recordUndo],
  );

  /** Ctrl+Z (back) and Ctrl+Shift+Z or Ctrl+Y (forward) on the active page. */
  const lastStep = useRef<{ from: CasDocument; to: CasDocument } | null>(null);
  const stepUndo = useCallback((back: boolean) => {
    setDoc((d) => {
      // React runs this twice in development; the second run must not take a second step.
      if (lastStep.current?.from === d) return lastStep.current.to;
      const to = undoStep(d, back, undo.current);
      lastStep.current = { from: d, to };
      return to;
    });
  }, []);
  const setCalc = useCallback((fn: (p: CalculatorPage) => CalculatorPage) => update("calculator", fn), [update]);
  const setGraphs = useCallback((fn: (p: GraphsPage) => GraphsPage) => update("graphs", fn), [update]);
  const setLists = useCallback((fn: (p: ListsPage) => ListsPage) => update("lists", fn), [update]);
  const setPython = useCallback((fn: (p: PythonPage) => PythonPage) => update("python", fn), [update]);
  const setData = useCallback((fn: (p: DataStatsPage) => DataStatsPage) => update("datastats", fn), [update]);
  const setGeo = useCallback((fn: (p: GeometryPage) => GeometryPage) => update("geometry", fn), [update]);
  /** Rotation and Dilation, once their object and centre are picked: the angle or scale factor. */
  const askGeoAmount = useCallback((tool: GeoTool, picked: string[]) => {
    const label = ASKS[tool];
    if (label)
      setWizard(
        openWizard({ kind: "wizard", title: GEO_TOOLS[tool], arrows: false, fields: [{ label, value: tool === "rotation" ? "90" : "2" }], build: `geoamount:${tool}:${picked[0]}:${picked[1]}:{0}` }),
      );
  }, []);
  /** The window a Data & Statistics page is drawn in (its own, or the one fitting the data): what zoom works from. */
  const dataWindow = useRef<GraphWindow | null>(null);
  /** The Notes editor's commands, for the keypad, its menu and the assistant. */
  const notesApi = useRef<NotesApi | null>(null);
  /** A Notes maths box worked out with the problem's variables; what it defines is defined for the problem. */
  const notesEvaluate = useCallback(async (text: string, approx: boolean) => {
    const e = engine.current;
    if (!e) return { ok: false, text: "Error: The engine isn't loaded" };
    try {
      const r = await evaluate(text, e.giac, { settings: current.current.settings, approx });
      if (!r.ok) return { ok: false, text: r.error };
      for (const d of [...(r.definitions ?? []), ...(r.definition ? [r.definition] : [])]) e.remember(d);
      setDefined(definedNames(e.saved));
      return { ok: true, text: r.outputText };
    } catch (err) {
      return { ok: false, text: `Error: ${(err as Error).message}` };
    }
  }, []);
  /** The problem's lists, for Data & Statistics' variable menus: named columns, and list variables in the engine. */
  const listNames = useCallback((): string[] => {
    const d = latestDoc.current;
    const problem = problemOf(d.pages[d.active]);
    const out = new Set<string>();
    for (const p of d.pages) if (p.kind === "lists" && problemOf(p) === problem) for (const c of p.cols) if (c.name) out.add(c.name);
    const lists = (engine.current?.saved ?? []).filter((s) => /^[A-Za-z]\w*\s*:=\s*\[(?!\[)/.test(s.trim()));
    for (const n of definedNames(lists)) out.add(n);
    return [...out].sort();
  }, []);
  /** Update a page by id, whichever page is active (a Shell printing while another page is shown). */
  const updatePage = useCallback((id: number, fn: (p: Page) => Page) => {
    setDoc((d) => ({ ...d, pages: d.pages.map((p) => (p.id === id ? fn(p) : p)) }));
  }, []);
  const shellPrint = useCallback(
    (id: number, ...lines: ShellLine[]) =>
      updatePage(id, (p) => (p.kind === "pyshell" ? { ...p, lines: [...p.lines, ...lines].slice(-500) } : p)),
    [updatePage],
  );

  const runEvaluate = useCallback(
    async (p: CalculatorPage, approx: boolean) => {
      const e = engine.current;
      if (!e || busy.current) return;
      busy.current = true;
      const text = rowToLinear(p.edit.row);
      try {
        const res = await evaluate(text, e.giac, { settings, ans: lastAns.current ?? shownAnswer(p), approx });
        if (!res.ok) {
          setError(res.error);
          return;
        }
        // A recursive function's helper (in definitions) comes before the function itself.
        const defs = [...(res.definitions ?? []), ...(res.definition ? [res.definition] : [])];
        if (defs.length) {
          for (const d of defs) e.remember(d);
          setDefined(definedNames(e.saved));
        }
        lastAns.current = res.output;
        const full = print(unrounded(res.output));
        const entry = {
          id: newId(),
          input: astToRow(res.input),
          inputText: text,
          output: astToRow(res.output),
          outputText: res.outputText,
          ...(full !== print(res.output) ? { ansText: full } : {}),
          ...(res.warning && { warning: res.warning.text }),
        };
        setCalc((cur) => ({ ...cur, edit: emptyEdit(), history: [...cur.history, entry] }));
        say(historySaid(entry));
        if (res.regEqn) {
          // A regression copied to f1 (CopyVar stat.RegEqn,f1, which defines
          // f1) is plotted on every Graphs page, as the handheld's shared
          // functions are.
          const { n, text } = res.regEqn;
          let row: Row;
          try {
            row = astToRow(parse(text));
          } catch {
            row = chars(text);
          }
          for (const pg of doc.pages)
            if (pg.kind === "graphs") {
              const own = `${fnName(pg.id, n)}(x):=${translate(parse(text), settings).giac}`;
              await e.giac(own);
              e.remember(own);
            }
          setDoc((d) => ({
            ...d,
            pages: d.pages.map((pg) =>
              pg.kind === "graphs"
                ? {
                    ...pg,
                    functions: [...pg.functions.filter((f) => f.n !== n), { n, text, row }].sort((a, b) => a.n - b.n),
                  }
                : pg,
            ),
          }));
        }
      } finally {
        busy.current = false;
      }
    },
    [settings, setCalc, say, doc.pages],
  );

  /** The trace point or bound moved: x on a function, the position along a relation or parametric curve. */
  const onToolX = useCallback(
    (x: number) =>
      setGraphs((g) => {
        const t = g.tool;
        if (!t) return g;
        if (t.kind === "trace" && t.curve) return { ...g, tool: { ...t, curve: { ...t.curve, at: x } } };
        return { ...g, tool: { ...t, x } };
      }),
    [setGraphs],
  );

  // A graph using variables with no value (a in a·x) offers sliders for them.
  const offerSliders = useCallback((texts: string[], bound: string[], p: GraphsPage) => {
    const e = engine.current;
    if (!e) return;
    const have = new Set([...definedNames(e.saved), ...(p.sliders ?? []).map((sl) => sl.name)]);
    const names = freeVariables(texts, bound, have, definedFunctions(e.saved));
    if (names.length) setSliderPrompt({ names, on: names.map(() => true), focus: 0 });
  }, []);

  /** Give a variable its slider's value in the engine; kept (replayed after a restart) once final. */
  const assign = useCallback((name: string, value: number, final: boolean) => {
    const e = engine.current;
    if (!e) return;
    const cmd = `${RENAME_IN[name] ?? name}:=${value}`;
    void e.giac(cmd);
    if (final) {
      e.remember(cmd);
      setDefined(definedNames(e.saved));
    }
  }, []);

  const setSlider = useCallback(
    (name: string, change: (sl: Slider) => Slider | null) =>
      setGraphs((g) => ({
        ...g,
        sliders: (g.sliders ?? []).flatMap((sl) => {
          if (sl.name !== name) return [sl];
          const next = change(sl);
          return next ? [next] : [];
        }),
      })),
    [setGraphs],
  );

  const createSliders = useCallback(
    (names: string[]) => {
      const made: Slider[] = names.map((name) => ({ name, value: 1, min: -5, max: 5, step: "auto" }));
      for (const sl of made) assign(sl.name, sl.value, true);
      setGraphs((g) => ({ ...g, sliders: [...(g.sliders ?? []), ...made] }));
      say(`Sliders added for ${names.join(", ")}`);
    },
    [assign, setGraphs, say],
  );

  // Animating sliders step every 150 ms, starting over from the minimum at the end.
  const animating = page?.kind === "graphs" ? (page.sliders ?? []).filter((sl) => sl.animating) : [];
  const animKey = animating.map((sl) => sl.name).join(",");
  useEffect(() => {
    if (!animKey) return;
    const t = setInterval(() => {
      setGraphs((g) => ({
        ...g,
        sliders: (g.sliders ?? []).map((sl) => {
          if (!sl.animating) return sl;
          const next = sl.value + sliderStep(sl) > sl.max + 1e-12 ? sl.min : snap(sl, sl.value + sliderStep(sl));
          assign(sl.name, next, false);
          return { ...sl, value: next };
        }),
      }));
    }, 150);
    return () => clearInterval(t);
  }, [animKey, setGraphs, assign]);

  const runGraphEffect = useCallback(
    async (p: GraphsPage, effect: GraphEffect) => {
      const e = engine.current;
      if (!e || !effect) return;
      if ("define" in effect) {
        const { n, text } = effect.define;
        // The label shows the definition laid out afresh, as the handheld does (a*x^2 → a·x²).
        let row = p.edit.row;
        try {
          row = astToRow(parse(text));
        } catch {
          // Evaluating it reports the error.
        }
        const res = await evaluate(`Define f${n}(x)=${text}`, e.giac, { settings });
        if (!res.ok) {
          setError(res.error);
          setGraphs((g) => ({ ...g, editing: n }));
          return;
        }
        if (res.definition) {
          e.remember(res.definition);
          setDefined(definedNames(e.saved));
        }
        // This page's own copy, so other pages' f1 never changes its curve.
        const own = `${fnName(p.id, n)}(x):=${translate(parse(text), settings).giac}`;
        await e.giac(own);
        e.remember(own);
        say(`Plotted f${n}(x)=${text}`);
        offerSliders([text], ["x"], p);
        setGraphs((g) => {
          const rest = g.functions.filter((f) => f.n !== n);
          return { ...g, functions: [...rest, { n, text, row }].sort((a, b) => a.n - b.n) };
        });
      } else if ("relation" in effect) {
        // rel1: x²+y²=4 becomes rel1_(x,y) = left − right, which the graph
        // evaluates over a grid: its zero line is the curve, its sign the shading.
        const { n, text } = effect.relation;
        const row = p.edit.row;
        const reopen = () => setGraphs((g) => ({ ...g, editing: n, entryKind: "rel" }));
        let ast: Ast;
        try {
          ast = parse(text);
        } catch {
          setError("Error: Syntax");
          reopen();
          return;
        }
        const ops: RelationOp[] = ["=", "<", ">", "≤", "≥", "≠"];
        if (!(ast.k === "bin" && (ops as string[]).includes(ast.op))) {
          setError("Error: A relation needs =, <, >, ≤, ≥ or ≠");
          reopen();
          return;
        }
        const op = ast.op as RelationOp;
        let def: string;
        try {
          def = `${relName(p.id, n)}(x,y):=(${translate(ast.a, settings).giac})-(${translate(ast.b, settings).giac})`;
        } catch {
          setError("Error: Invalid relation");
          reopen();
          return;
        }
        const raw = await e.giac(def);
        if (/error/i.test(raw)) {
          setError("Error: Invalid relation");
          reopen();
          return;
        }
        e.remember(def);
        setDefined(definedNames(e.saved));
        say(`Plotted rel${n}: ${text}`);
        offerSliders([text], ["x", "y"], p);
        setGraphs((g) => {
          const rest = (g.relations ?? []).filter((r) => r.n !== n);
          return { ...g, relations: [...rest, { n, text, row, op }].sort((a, b) => a.n - b.n) };
        });
      } else if ("parametric" in effect) {
        // x1(t), y1(t) become xp1_(t), yp1_(t); the t range is worked out to numbers.
        const { n, texts } = effect.parametric;
        const rowOf = (t: string): Row => {
          try {
            return astToRow(parse(t));
          } catch {
            return chars(t);
          }
        };
        const fail = (msg: string) => {
          setError(msg);
          setGraphs((g) => ({
            ...g,
            editing: n,
            entryKind: "par",
            parDraft: { field: 0, rows: texts.map(rowOf) },
            edit: { row: rowOf(texts[0]!), cursor: { path: [], index: rowOf(texts[0]!).length } },
          }));
        };
        let defs: string[];
        let range: number[];
        try {
          defs = [
            `${parNames(p.id, n)[0]}(t):=${translate(parse(texts[0]!), settings).giac}`,
            `${parNames(p.id, n)[1]}(t):=${translate(parse(texts[1]!), settings).giac}`,
          ];
          range = [];
          for (const t of texts.slice(2))
            range.push(Number((await e.giac(`evalf(${translate(parse(t), settings).giac})`)).trim()));
        } catch {
          fail("Error: Syntax");
          return;
        }
        const [tmin, tmax, tstep] = range as [number, number, number];
        if (![tmin, tmax, tstep].every(Number.isFinite) || tmax <= tmin || tstep <= 0) {
          fail("Error: Invalid t range");
          return;
        }
        for (const d of defs) {
          if (/error/i.test(await e.giac(d))) {
            fail("Error: Invalid expression");
            return;
          }
          e.remember(d);
        }
        say(`Plotted x${n}(t)=${texts[0]}, y${n}(t)=${texts[1]}`);
        offerSliders(texts.slice(0, 2), ["t"], p);
        setGraphs((g) => {
          const rest = (g.parametrics ?? []).filter((c) => c.n !== n);
          const curve = {
            n,
            x: texts[0]!,
            y: texts[1]!,
            xRow: rowOf(texts[0]!),
            yRow: rowOf(texts[1]!),
            tmin,
            tmax,
            tstep,
          };
          return { ...g, parametrics: [...rest, curve].sort((a, b) => a.n - b.n) };
        });
      } else if ("de" in effect) {
        // d1: y1′ = f(x, y1), with (x0, y10) optional: the field always, the solution through it when given.
        const { n, texts } = effect.de;
        const y = deY(p, n);
        const rowOf = (t: string): Row => {
          try {
            return astToRow(parse(t));
          } catch {
            return chars(t);
          }
        };
        const fail = (msg: string) => {
          setError(msg);
          setGraphs((g) => ({
            ...g,
            editing: n,
            entryKind: "de",
            parDraft: { field: 0, rows: texts.map(rowOf) },
            edit: { row: rowOf(texts[0]!), cursor: { path: [], index: rowOf(texts[0]!).length } },
          }));
        };
        let def: string;
        const start: (number | undefined)[] = [];
        try {
          def = deDefinition(p.id, n, y, texts[0]!, settings);
          for (const t of texts.slice(1, 3))
            start.push(t?.trim() ? Number((await e.giac(`evalf(${translate(parse(t), settings).giac})`)).trim()) : undefined);
        } catch {
          fail("Error: Syntax");
          return;
        }
        const [x0, y0] = start;
        if ((x0 === undefined) !== (y0 === undefined) || [x0, y0].some((v) => v !== undefined && !Number.isFinite(v))) {
          fail("Error: Invalid initial condition");
          return;
        }
        if (/error/i.test(await e.giac(def))) {
          fail("Error: Invalid expression");
          return;
        }
        e.remember(def);
        say(`Plotted y${y}'=${texts[0]}`);
        offerSliders([texts[0]!], ["x", `y${y}`], p);
        setGraphs((g) => {
          const rest = (g.des ?? []).filter((d) => d.n !== n);
          const de = { n, y, rhs: texts[0]!, row: rowOf(texts[0]!), ...(x0 !== undefined ? { x0, y0 } : {}) };
          return { ...g, des: [...rest, de].sort((a, b) => a.n - b.n) };
        });
      } else {
        const { type, fn, a, b } = effect.analyze;
        const other = effect.analyze.other ?? p.functions.find((f) => !f.hidden && f.n !== fn)?.n;
        const mark = await analyze(
          e.giac,
          type,
          fn,
          fnName(p.id, fn),
          other === undefined ? undefined : fnName(p.id, other),
          a,
          b,
        );
        if (!mark) setError("Error: Nothing found between the bounds");
        else {
          setGraphs((g) => ({ ...g, marks: [...g.marks, mark] }));
          say(markSaid(mark));
        }
      }
    },
    [settings, setGraphs, say, offerSliders],
  );

  /** Work a Lists page out again, and give the engine its named columns. */
  const recalcLists = useCallback(
    async (p: ListsPage) => {
      const e = engine.current;
      if (!e) return;
      const run: sheet.Evaluate = async (text) => {
        try {
          const r = await evaluate(text, e.giac, { settings });
          if (!r.ok) return { ok: false, text: r.error, definitions: [] };
          return { ok: true, text: r.outputText, definitions: [...(r.definitions ?? []), ...(r.definition ? [r.definition] : [])] };
        } catch {
          return { ok: false, text: "Error", definitions: [] };
        }
      };
      const r = await sheet.recalc(p, run);
      for (const d of r.definitions) e.remember(d);
      setDefined(definedNames(e.saved));
      updatePage(p.id, (q) => (q.kind === "lists" ? { ...q, cols: r.page.cols } : q));
    },
    [settings, updatePage],
  );

  /**
   * Run Python in the problem's Shell page (made after the current page if
   * there isn't one), with the problem's programs importable by name.
   */
  const runPython = useCallback(
    (what: { file: string } | { code: string }) => {
      const d = latestDoc.current;
      const here = d.pages[d.active];
      const problem = problemOf(here);
      const programs = d.pages
        .filter((x): x is PythonPage => x.kind === "python" && problemOf(x) === problem)
        .map((x) => ({ name: x.file, source: x.source }));
      let pages = d.pages;
      let at = pages.findIndex((x) => x.kind === "pyshell" && problemOf(x) === problem);
      if (at < 0) {
        at = d.active + 1;
        pages = [...pages.slice(0, at), newPage("pyshell", problem), ...pages.slice(at)];
      }
      const shell = pages[at] as PyShellPage;
      const line: ShellLine = "file" in what ? { kind: "in", text: `#Run ${what.file.replace(/\.py$/, "")}` } : { kind: "in", text: what.code };
      pages = pages.map((x, i) => (i === at && x.kind === "pyshell" ? { ...x, lines: [...x.lines, line], input: "" } : x));
      setDoc({ ...d, pages, active: at });
      pyShell.current = shell.id;
      setPy((s) => ({ ...s, canvas: null, prompt: null }));
      const r = python();
      if (!r.isolated && "file" in what) toast("Live keys, input() and Break need this page reloaded (it sets itself up on first visit).");
      r.run(programs, what);
    },
    [],
  );

  // The Python worker's output lands in the Shell it was started from.
  useEffect(
    () =>
      python().on((ev) => {
        const id = pyShell.current;
        if (ev.type === "status") setPy((s) => ({ ...s, status: ev.status }));
        else if ((ev.type === "out" || ev.type === "err") && id !== null) shellPrint(id, { kind: ev.type, text: ev.text });
        else if (ev.type === "draw") setPy((s) => ({ ...s, canvas: ev.op === "clear" ? [ev] : [...(s.canvas ?? []), ev] }));
        else if (ev.type === "textAt") setPy((s) => ({ ...s, canvas: [...(s.canvas ?? []), { op: "textAt", row: ev.row, text: ev.text, align: ev.align }] }));
        else if (ev.type === "clearText") setPy((s) => ({ ...s, canvas: s.canvas ? [{ op: "clear", args: [] }] : s.canvas }));
        else if (ev.type === "input") setPy((s) => ({ ...s, prompt: ev.prompt }));
        else if (ev.type === "done") {
          setPy((s) => ({ ...s, prompt: null }));
          if (ev.error && id !== null) shellPrint(id, { kind: "err", text: ev.error });
        }
      }),
    [shellPrint],
  );

  /** The keypad typing into the Python editor: the textarea is edited in place, then its text saved. */
  const pyEdit = useCallback(
    (key: Key) => {
      const el = pyEditor.current;
      if (!el) return;
      const { selectionStart: a, selectionEnd: b, value } = el;
      const lineStart = value.lastIndexOf("\n", a - 1) + 1;
      const put = (t: string, from = a, to = b) => el.setRangeText(t, from, to, "end");
      switch (key.k) {
        case "char":
          put(key.c);
          break;
        case "text":
        case "paste":
          put(key.text);
          break;
        case "enter": {
          // New lines keep the indent, and go one deeper after a colon.
          const line = value.slice(lineStart, a);
          const indent = /^\s*/.exec(line)![0] + (/:\s*$/.test(line) ? "    " : "");
          put(`\n${indent}`);
          break;
        }
        case "tab":
          put("    ");
          break;
        case "backspace":
          if (a !== b) put("");
          else if (a > 0) put("", a - 1, a);
          break;
        case "delete":
          if (a !== b) put("");
          else put("", a, a + 1);
          break;
        case "left":
          el.setSelectionRange(Math.max(0, a - 1), Math.max(0, a - 1));
          return;
        case "right":
          el.setSelectionRange(b + 1, b + 1);
          return;
        case "home":
          el.setSelectionRange(lineStart, lineStart);
          return;
        case "end": {
          const e = value.indexOf("\n", a);
          const to = e < 0 ? value.length : e;
          el.setSelectionRange(to, to);
          return;
        }
        case "up":
        case "down": {
          const col = a - lineStart;
          const target =
            key.k === "up"
              ? lineStart === 0
                ? 0
                : value.lastIndexOf("\n", lineStart - 2) + 1
              : value.indexOf("\n", a) < 0
                ? value.length
                : value.indexOf("\n", a) + 1;
          const end = value.indexOf("\n", target);
          const to = Math.min(target + col, end < 0 ? value.length : end);
          el.setSelectionRange(to, to);
          return;
        }
        default:
          return;
      }
      const text = el.value;
      setPython((p) => ({ ...p, source: text }));
    },
    [setPython],
  );

  const pageKey = useCallback(
    (key: Key) => {
      typing.current = key.k === "char";
      // A panel or the catalog opened over a dialog (∞ into Normal Cdf's
      // bound): its text goes into the focused field, not the page behind.
      if (wizard || finance) {
        if (key.k !== "text" && key.k !== "char") return;
        if (wizard) setWizard((w) => (w ? (wizardKeyPress(w, key).state ?? w) : w));
        else
          setFinance((f) => {
            const next = f ? (financeKeyPress(f, key).state ?? f) : f;
            if (next) lastFinance.current = next;
            return next;
          });
        return;
      }
      if (page?.kind === "calculator") {
        // The selected history item says how far it can scroll (history.tsx).
        const max = Number(document.querySelector("[data-cas-max-scroll]")?.getAttribute("data-cas-max-scroll") ?? 0);
        const { page: next, effect } = calcKey(page, key, max);
        setCalc(() => next);
        if (effect) void runEvaluate(next, effect.evaluate === "approx");
      } else if (page?.kind === "graphs") {
        const { page: next, effect } = graphKey(page, key, takenFns);
        setGraphs(() => next);
        if (effect) void runGraphEffect(next, effect);
      } else if (page?.kind === "lists") {
        const { page: next, effect } = sheet.listsKey(page, key);
        setLists(() => next);
        if (effect && "error" in effect) setError(effect.error);
        else if (effect) void recalcLists(next);
      } else if (page?.kind === "geometry") {
        const next = geometryKey(page, key);
        if (next) setGeo(() => next);
      } else if (page?.kind === "notes") {
        notesApi.current?.key(key);
      } else if (page?.kind === "python") {
        // Ctrl+R (the √ shortcut elsewhere) runs the program, as on the handheld.
        if (key.k === "template" && key.id === "sqrt") runPython({ file: page.file });
        else pyEdit(key);
      } else if (page?.kind === "pyshell") {
        const r = python();
        // A finished drawing stays up until a key is pressed.
        if (py.canvas && py.status !== "running") {
          setPy((s) => ({ ...s, canvas: null }));
          return;
        }
        if (py.status === "running" && py.prompt === null) {
          if (key.k === "esc") r.stop();
          else r.key(key.k === "char" ? key.c : key.k);
          return;
        }
        // From the latest input, not this render's: fast typing lands several keys before a re-render.
        const editInput = (fn: (input: string) => string) => updatePage(page.id, (p) => (p.kind === "pyshell" ? { ...p, input: fn(p.input) } : p));
        const setInput = (input: string) => editInput(() => input);
        if (key.k === "char") editInput((i) => i + key.c);
        else if (key.k === "text" || key.k === "paste") editInput((i) => i + key.text);
        else if (key.k === "backspace") editInput((i) => i.slice(0, -1));
        else if (key.k === "clear" || key.k === "esc") setInput("");
        else if (key.k === "up") setInput([...page.lines].reverse().find((l) => l.kind === "in" && !l.text.startsWith("#Run"))?.text ?? page.input);
        else if (key.k === "enter") {
          if (py.prompt !== null) {
            shellPrint(page.id, { kind: "out", text: py.prompt + page.input });
            setInput("");
            setPy((s) => ({ ...s, prompt: null }));
            r.answer(page.input);
          } else if (page.input.trim()) runPython({ code: page.input });
        }
      }
    },
    [wizard, finance, page, runEvaluate, runGraphEffect, setCalc, setGraphs, setLists, recalcLists, runPython, pyEdit, py, updatePage, shellPrint, takenFns],
  );

  /** Clear all: one empty Calculator page and no variables. The settings stay. */
  const clearAll = useCallback(() => {
    shownProblem.current = 1;
    opening.current = null;
    setDoc((d) => (current.current.openPath ? { ...newDocument(), title: d.title } : withScratchPages(newDocument())));
    setMenu(null);
    setWizard(null);
    setPalette(null);
    setCatalog(null);
    setFinance(null);
    setSliderPrompt(null);
    setError(null);
    setDefined(new Set());
    lastAns.current = undefined;
    samples.current = [];
    void engine.current?.clearAll();
    root.current?.focus();
  }, []);

  // A new page is a clean sheet: a new Graphs page has no curves on it.
  const addPage = useCallback(
    (kind: "calculator" | "graphs" | "lists" | "python" | "pyshell" | "datastats" | "notes" | "geometry") => {
      setDoc((d) => {
        const pages = d.pages.slice();
        const page = newPage(kind, problemOf(d.pages[d.active]));
        // Its entry line starts on the problem's next free function number.
        if (page.kind === "graphs") page.editing = nextFree(page, takenFns);
        pages.splice(d.active + 1, 0, page);
        return { ...d, pages, active: d.active + 1 };
      });
    },
    [takenFns],
  );

  /** Put a saved document on screen: its pages, settings and the engine's definitions. */
  const openSaved = useCallback(async (saved: Saved, path: string | null, scratch = false, wasDirty = false) => {
    const e = engine.current;
    if (!e) return;
    skipSave.current = true;
    // Another document: no thread's until one claims it (the assistant's tools, or a thread being reopened).
    own(null);
    if (!scratch) setPref("current", { saved, path, dirty: wasDirty } satisfies Cached);
    bumpIds(saved.doc);
    setMenu(null);
    setWizard(null);
    setCatalog(null);
    setPalette(null);
    setFinance(null);
    setError(null);
    undo.current.clear();
    lastAns.current = undefined;
    samples.current = [];
    shownProblem.current = problemOf(saved.doc.pages[saved.doc.active]);
    opening.current = shownProblem.current;
    latestDoc.current = saved.doc;
    setDoc(saved.doc);
    setSettings(saved.settings);
    setIsScratch(scratch);
    setOpenPath(path);
    setDirty(wasDirty);
    current.current = { ...current.current, doc: saved.doc, settings: saved.settings, openPath: path, isScratch: scratch, dirty: wasDirty };
    setView("doc");
    await e.clearAll();
    await e.applySettings(saved.settings);
    await e.restore(saved.definitions);
    for (const pg of saved.doc.pages)
      if (pg.kind === "graphs")
        for (const d of pageDefinitions(pg, saved.settings)) {
          await e.giac(d);
          e.remember(d);
        }
    setDefined(definedNames(e.saved));
    await applyPending(shownProblem.current);
  }, [applyPending, own]);

  const remember = useCallback((path: string) => {
    setRecent((r) => {
      const next = [path, ...r.filter((x) => x !== path)].slice(0, RECENT_MAX);
      setPref("recent", next);
      return next;
    });
  }, []);

  /** Open a file from My Documents: a document made here, or an upload (decoded on first open). */
  const openFile = useCallback(
    async (path: string) => {
      const c = current.current;
      if (!c.isScratch && c.openPath === path) {
        setView("doc");
        return;
      }
      const rec = await files.getFile(path);
      if (!rec || rec.type !== "file") return;
      if (!(await leaveOk())) return;
      if (rec.doc) {
        remember(path);
        await openSaved(rec.doc, path);
        return;
      }
      const bytes = rec.bytes ?? new Uint8Array();
      const name = files.nameOf(path);
      if (/\.py$/i.test(name)) {
        const doc: CasDocument = { title: stem(name), pages: [{ kind: "python", id: newId(), problem: 1, file: name, source: new TextDecoder().decode(bytes) }, newPage("pyshell")], active: 0 };
        const saved: Saved = { doc, settings: DEFAULT_SETTINGS, definitions: [] };
        await files.cacheImport(path, saved);
        remember(path);
        await openSaved(saved, path);
        return;
      }
      const kind = classify(bytes);
      if (kind === "ndless") {
        setConfirm({ title: name, lines: ["This is an Ndless program.", "", "It's kept here and can be downloaded, but programs for the handheld's processor can't run in a browser."], ok: () => undefined });
        return;
      }
      if (kind !== "document") {
        setConfirm({ title: name, lines: ["This file isn't a document.", "", "It's kept here and can be downloaded (it may be data for an Ndless program)."], ok: () => undefined });
        return;
      }
      try {
        const imported = importTns(decodeTns(bytes), stem(name));
        const saved: Saved = { doc: imported.doc, settings: DEFAULT_SETTINGS, definitions: [] };
        await files.cacheImport(path, saved);
        remember(path);
        await openSaved(saved, path);
        await refreshFiles();
        if (imported.skipped) toast(`${imported.skipped} program${imported.skipped === 1 ? "" : "s"} or function${imported.skipped === 1 ? "" : "s"} in this document can't run here yet.`);
      } catch (err) {
        setError(`Error: Couldn't open ${name}: ${(err as Error).message}`);
      }
    },
    [openSaved, refreshFiles, remember], // eslint-disable-line react-hooks/exhaustive-deps
  );

  const openScratchpad = useCallback(
    async (kind: "calculator" | "graphs") => {
      if (!current.current.isScratch) {
        // The document stays in the cache: Home → Current brings it back.
        await writeNow();
        const loaded = load();
        await openSaved(loaded ? { ...loaded, doc: withScratchPages(loaded.doc) } : freshScratch(), null, true);
      }
      setDoc((d) => {
        const at = d.pages.findIndex((p) => p.kind === kind);
        return at < 0 ? d : { ...d, active: at };
      });
      setView("doc");
    },
    [openSaved, writeNow],
  );

  /** A new document, starting with the given app; it's in My Documents once it's saved. */
  const newDoc = useCallback(
    async (first: "calculator" | "graphs" | "lists" | "python" | "datastats" | "notes" | "geometry") => {
      const doc = newDocument(first, "Untitled");
      if (first === "python") doc.pages.push(newPage("pyshell"));
      await openSaved({ doc, settings: DEFAULT_SETTINGS, definitions: [] }, null);
    },
    [openSaved],
  );

  /** Save: to the document's file, or Save As for one that hasn't been saved (or the Scratchpad). */
  const saveDocument = useCallback(
    async (then?: () => void) => {
      const c = current.current;
      if (c.isScratch || !c.openPath) {
        afterSave.current = then ?? null;
        setWizard(openWizard({ kind: "wizard", title: "Save As", arrows: false, fields: [{ label: "File Name:", value: c.isScratch || c.doc.title === "Untitled" ? "" : c.doc.title }], build: "saveas:{0}" }));
        return;
      }
      await files.saveDoc(c.openPath, snapshot());
      setDirty(false);
      current.current.dirty = false;
      await writeNow();
      await refreshFiles();
      toast.success(`Saved ${files.nameOf(c.openPath)}`);
      then?.();
    },
    [snapshot, writeNow, refreshFiles],
  );

  /**
   * Before the open document is replaced (New, Open, Close): if it has
   * unsaved changes, ask Save / Don't Save / Cancel, as the handheld does.
   * Resolves true to go ahead.
   */
  const leaveOk = useCallback(
    () =>
      new Promise<boolean>((resolve) => {
        const c = current.current;
        if (c.isScratch || !c.dirty) return resolve(true);
        setConfirm({
          title: "Save Document",
          lines: [`Do you want to save changes to "${c.doc.title}"?`],
          ok: () => undefined,
          buttons: [
            { label: "Yes", run: () => void saveDocument(() => resolve(true)) },
            { label: "No", run: () => resolve(true) },
            { label: "Cancel", run: () => resolve(false) },
          ],
        });
      }),
    [saveDocument],
  );

  /** File → New, Home → New: save-or-not first, then a blank document asking for its first page. */
  const startNew = useCallback(async () => {
    if (!(await leaveOk())) return;
    creatingNew.current = true;
    setView("new");
    setMenu({ items: ADD_PAGE, state: openMenu() });
  }, [leaveOk]);

  /** The open document (Home → Current): on screen, or back from the cache after the Scratchpad. */
  const openCurrent = useCallback(async () => {
    if (!current.current.isScratch) return setView("doc");
    const cached = pref<Cached | null>("current", null);
    if (cached?.saved?.doc?.pages?.length) {
      await writeNow();
      await openSaved(cached.saved, cached.path, false, cached.dirty);
    } else toast("No document is open. Choose New or Browse.");
  }, [openSaved, writeNow]);

  /** Where leaving a document goes: the screen it was opened from (Home or My Documents). */
  const backTo = useRef<"home" | "browse">("home");
  useEffect(() => {
    if (view === "home" || view === "browse") backTo.current = view;
  }, [view]);
  const closeDocument = useCallback(async () => {
    if (!(await leaveOk())) return;
    setPref("current", null);
    const loaded = load();
    await openSaved(loaded ? { ...loaded, doc: withScratchPages(loaded.doc) } : freshScratch(), null, true);
    if (backTo.current === "browse") void refreshFiles();
    setView(backTo.current);
  }, [leaveOk, openSaved, refreshFiles]);
  /** X and Esc: close the document (Save / No / Cancel first if it has changes); the Scratchpad just steps back. */
  const leaveDocument = useCallback(() => {
    setMenu(null);
    creatingNew.current = false;
    if (current.current.isScratch) {
      void writeNow();
      setView(backTo.current);
    } else void closeDocument();
  }, [closeDocument, writeNow]);

  const tnsOf = useCallback((saved: Saved): Uint8Array => exportTns(saved.doc, saved.settings).bytes, []);

  const downloadFile = useCallback(
    async (path: string) => {
      const rec = await files.getFile(path);
      if (!rec || rec.type !== "file") return;
      const name = files.nameOf(path);
      const bytes = rec.bytes && !rec.edited ? rec.bytes : rec.doc ? tnsOf(rec.doc) : null;
      if (!bytes) return;
      download(new Blob([bytes as BlobPart]), /\.\w+$/.test(name) ? name : `${name}.tns`);
    },
    [tnsOf],
  );

  const showStatus = useCallback(async () => {
    const u = await files.usage();
    const kb = (n: number) => `${Math.round(n / 1024).toLocaleString()} KB`;
    setConfirm({
      title: "Status",
      lines: [
        "Axiom, a CAS handheld in the browser",
        "Maths: Giac 1.9.0",
        "",
        `Documents: ${u.files}`,
        `My Documents uses ${kb(u.bytes)}`,
        ...(u.used !== undefined && u.quota ? [`This site's storage: ${kb(u.used)} of ${kb(u.quota)}`] : []),
        `Python: ${python().isolated ? "ready for live keys and input()" : "runs; live keys need a reload"}`,
      ],
      ok: () => undefined,
    });
  }, []);

  const homeAction = useCallback(
    (act: HomeAction | undefined) => {
      if (!act) return;
      if (act === "scratchCalc") void openScratchpad("calculator");
      else if (act === "scratchGraph") void openScratchpad("graphs");
      else if (act === "fileNew") void startNew();
      else if (act === "fileOpen") {
        void refreshFiles();
        setView("browse");
      } else if (act === "recent")
        setMenu({ items: recent.map((r) => menuApp(files.nameOf(r), `recent:${r}`)), state: openMenu() });
      else if (act === "current") void openCurrent();
      else if (act === "settings") setMenu({ items: SETTINGS_MENU, state: openMenu() });
      else if (act.startsWith("newWith:")) {
        const app = act.slice(8);
        const first = app === "data" ? "datastats" : app;
        if (first === "calculator" || first === "graphs" || first === "lists" || first === "python" || first === "datastats" || first === "notes" || first === "geometry")
          void leaveOk().then((go) => {
            if (go) void newDoc(first);
          });
      }
    },
    [newDoc, openScratchpad, recent, refreshFiles, startNew, openCurrent, leaveOk],
  );

  const graphAction = useCallback(
    (id: string) => {
      if (id.startsWith("zoom")) {
        setGraphs((g) => ({ ...g, window: zoomed(id, g.window, samples.current, 1.5), marks: [] }));
      } else if (id === "windowSettings" && page?.kind === "graphs") {
        const w = page.window;
        // Full precision, as the handheld shows: −6.6666666666667.
        const f = (v: number) => String(Number(v.toPrecision(14)));
        const scale = (v: number, lo: number, hi: number) => (v === autoScale(lo, hi) ? "Auto" : f(v));
        const scaleField = (label: string, value: string) => ({ label, value, options: ["Auto"], free: true });
        setWizard(
          openWizard({
            kind: "wizard",
            title: "Window Settings",
            arrows: false,
            fields: [
              { label: "XMin:", value: f(w.xmin) },
              { label: "XMax:", value: f(w.xmax) },
              scaleField("XScale:", scale(w.xscl, w.xmin, w.xmax)),
              { label: "YMin:", value: f(w.ymin) },
              { label: "YMax:", value: f(w.ymax) },
              scaleField("YScale:", scale(w.yscl, w.ymin, w.ymax)),
            ],
            build: "window:{0}:{1}:{2}:{3}:{4}:{5}",
          }),
        );
      } else if (id === "graphTrace" || id.startsWith("analyze")) setGraphs((g) => startTool(g, id));
      else if (id === "tableSplit") setGraphs((g) => ({ ...g, table: !g.table }));
      else if (id === "deleteAll") setGraphs((g) => ({ ...g, functions: [], marks: [], tool: null }));
      else if (id === "viewDotGrid") setGraphs((g) => ({ ...g, grid: "dot" }));
      else if (id === "viewLinedGrid") setGraphs((g) => ({ ...g, grid: "line" }));
      else if (id === "viewNoGrid") setGraphs((g) => ({ ...g, grid: "none" }));
      else if (id === "viewHideAxes") setGraphs((g) => ({ ...g, axes: !g.axes }));
      else if (id === "viewEntryLine")
        setGraphs((g) => (g.editing === null ? openEntry(g, nextFree(g, takenFns)) : { ...g, editing: null }));
      else if (id === "entryFunction") setGraphs((g) => openEntry(g, nextFree(g, takenFns)));
      else if (id === "entryRelation") setGraphs((g) => openRelation(g));
      else if (id === "insertSlider") {
        const taken = new Set([...defined, ...(page?.kind === "graphs" ? (page.sliders ?? []).map((sl) => sl.name) : [])]);
        let n = 1;
        while (taken.has(`v${n}`)) n++;
        setWizard(sliderSettings(null, `v${n}`));
      }
      else if (id === "entryParametric") setGraphs((g) => openParametric(g, settings.angle === "deg"));
      else if (id === "entryDiffEq") setGraphs((g) => openDE(g));
      else if (id === "deSettings" && page?.kind === "graphs") {
        const s = page.deSettings ?? DE_DEFAULTS;
        const f = (v: number) => String(Number(v.toPrecision(14)));
        setWizard(
          openWizard({
            kind: "wizard",
            title: "Differential Equation",
            arrows: false,
            fields: [
              { label: "Solution Method:", value: s.method, options: ["Euler", "Runge-Kutta"] },
              { label: "Iterations Between Plot Step:", value: f(s.iterations) },
              { label: "Field:", value: s.field, options: ["Slope", "None"] },
              { label: "Plot Start:", value: f(s.start) },
              { label: "Plot End:", value: f(s.end) },
              { label: "Plot Step:", value: f(s.step) },
              { label: "Field Resolution:", value: f(s.resolution) },
            ],
            build: "deset:{0}:{1}:{2}:{3}:{4}:{5}:{6}",
          }),
        );
      }
    },
    [page, setGraphs, settings.angle, takenFns, defined],
  );

  const runAction = useCallback(
    (action: MenuAction | undefined) => {
      if (!action) return;
      // On a Notes page, the Calculations menu types into the current maths box (or a new one).
      if (page?.kind === "notes" && (action.kind === "insert" || action.kind === "template"))
        notesApi.current?.insertMath(action.kind === "insert" ? action.text : rowToLinear([templateNode(action.template)]));
      else if (action.kind === "insert") pageKey({ k: "text", text: action.text });
      else if (action.kind === "template") pageKey({ k: "template", id: action.template });
      else if (action.kind === "wizard") setWizard(openWizard(action));
      else if (action.id === "insertProblem") setDoc(insertProblem);
      else if (/^add(Calculator|Graphs|Lists|Python|Shell|Data|Notes|Geometry)$/.test(action.id)) {
        const kinds = { addCalculator: "calculator", addGraphs: "graphs", addLists: "lists", addPython: "python", addShell: "pyshell", addData: "datastats", addNotes: "notes", addGeometry: "geometry" } as const;
        const kind = kinds[action.id as keyof typeof kinds];
        if (creatingNew.current) {
          creatingNew.current = false;
          void newDoc(kind === "pyshell" ? "python" : kind);
        } else if (kind === "python") {
          setWizard(openWizard({ kind: "wizard", title: "New", arrows: false, fields: [{ label: "Name:", value: "", hint: "program" }], build: "pynew:{0}" }));
        } else addPage(kind);
      } else if (action.id === "fileNew") void startNew();
      else if (action.id === "fileOpen") {
        void writeNow().then(refreshFiles);
        setView("browse");
      } else if (action.id === "fileClose") void closeDocument();
      else if (action.id === "fileSave") void saveDocument();
      else if (action.id === "fileSaveAs") {
        afterSave.current = null;
        setWizard(openWizard({ kind: "wizard", title: "Save As", arrows: false, fields: [{ label: "File Name:", value: isScratch || doc.title === "Untitled" ? "" : doc.title }], build: "saveas:{0}" }));
      }
      else if (action.id === "fileDownload") {
        const r = exportTns(doc, settings);
        download(new Blob([r.bytes as BlobPart]), `${doc.title}.tns`);
        if (r.dropped) toast(`${r.dropped} page${r.dropped === 1 ? "" : "s"} made here can't be written to .tns yet (Graphs); the rest is in the file.`);
      } else if (action.id === "handheldSetup")
        setWizard(
          openWizard({
            kind: "wizard",
            title: "Handheld Setup",
            fields: [
              { label: "Text Size:", value: setup.text, options: ["Small", "Medium", "Large"] },
              { label: "Haptics", value: setup.haptics ? "Yes" : "No", check: true },
            ],
            build: "setup:{0}:{1}",
          }),
        );
      else if (action.id === "status") void showStatus();
      else if (action.id === "factoryReset")
        setConfirm({
          title: "Restore Factory Defaults",
          lines: ["Every document in My Documents, the Scratchpad and all settings will be deleted from this browser.", "", "This can't be undone."],
          ok: () => {
            void files.clearAll().then(() => {
              clearPrefs();
              window.location.reload();
            });
          },
        });
      else if (action.id.startsWith("recent:")) void openFile(action.id.slice(7));
      else if (action.id.startsWith("browse")) {
        const r = rows[browse.sel];
        const folder = targetFolder(rows, browse.sel);
        if (action.id === "browseNewFolder")
          setWizard(openWizard({ kind: "wizard", title: "New Folder", arrows: false, fields: [{ label: "Name:", value: "" }], build: "browse:mkdir:{0}" }));
        else if (action.id === "browseRename" && r && r.path !== files.ROOT)
          setWizard(openWizard({ kind: "wizard", title: "Rename", arrows: false, fields: [{ label: "Name:", value: r.name }], build: "browse:rename:{0}" }));
        else if (action.id === "browseDelete" && r && r.path !== files.ROOT) askDelete(r.path);
        else if (action.id === "browseCopy" && r && !r.folder) {
          setBrowse((b) => ({ ...b, clip: r.path }));
          toast(`Copied ${r.name}`);
        } else if (action.id === "browsePaste" && browse.clip) {
          const from = browse.clip;
          void (async () => {
            const rec = await files.getFile(from);
            if (!rec) return;
            const name = await files.freeName(folder, files.nameOf(from));
            await files.put({ ...rec, path: files.join(folder, name), modified: Date.now() });
            await refreshFiles();
            toast.success(`Pasted ${name}`);
          })();
        } else if (action.id === "browseUpload") uploadInput.current?.click();
        else if (action.id === "browseDownload" && r && !r.folder) void downloadFile(r.path);
        else if (action.id === "browseExportAll")
          void files.exportAll((rec) => (rec.doc ? tnsOf(rec.doc) : null)).then((zip) => download(new Blob([zip as BlobPart]), "My Documents.zip"));
        else if (action.id === "browseSortName") setBrowse((b) => ({ ...b, sort: "name" }));
        else if (action.id === "browseSortSize") setBrowse((b) => ({ ...b, sort: "size" }));
      } else if (action.id.startsWith("lists") && page?.kind === "lists") {
        const fn = {
          listsInsertRow: sheet.insertRow,
          listsDeleteRow: sheet.deleteRow,
          listsInsertColumn: sheet.insertColumn,
          listsDeleteColumn: sheet.deleteColumn,
          listsClearColumn: sheet.clearColumn,
          listsSortUp: (p: ListsPage) => sheet.sortColumn(p, false),
          listsSortDown: (p: ListsPage) => sheet.sortColumn(p, true),
        }[action.id];
        if (fn) {
          const next = fn(page);
          setLists(() => next);
          void recalcLists(next);
        }
      } else if (action.id.startsWith("geo") && page?.kind === "geometry") {
        const id = action.id;
        if (id.startsWith("geoTool:")) setGeo((p) => ({ ...p, tool: { name: id.slice(8) as GeoTool, picked: [] }, sel: null }));
        else if (id === "geoSelect") setGeo((p) => ({ ...p, tool: null }));
        else if (id === "geoDelete") setGeo((p) => (p.sel ? { ...p, objects: removeGeo(p.objects, [p.sel]), sel: null } : p));
        else if (id === "geoClear") setGeo((p) => ({ ...p, objects: [], tool: null, sel: null }));
        else if (id === "geoAxes") setGeo((p) => ({ ...p, axes: !p.axes }));
        else if (id === "geoGrid") setGeo((p) => ({ ...p, grid: !p.grid }));
        else if (id === "geoZoomIn") setGeo((p) => zoomedGeo(p, 0.8));
        else if (id === "geoZoomOut") setGeo((p) => zoomedGeo(p, 1.25));
        else if (id === "geoZoomReset") setGeo((p) => ({ ...p, view: undefined }));
        else if (id === "geoStore") {
          const m = page.objects.find((o) => o.id === page.sel && o.kind === "measure");
          if (m?.kind === "measure")
            setWizard(openWizard({ kind: "wizard", title: "Store Variable", arrows: false, fields: [{ label: "Variable:", value: m.store ?? "" }], build: `geostore:${m.id}:{0}` }));
        }
      } else if (action.id.startsWith("ds") && page?.kind === "datastats") {
        const id = action.id;
        const shownWin = dataWindow.current;
        const fmt = (v: number) => String(Number(v.toPrecision(10)));
        if (id.startsWith("dsPlot:")) {
          const plot = id.slice(7) as DataStatsPage["plot"];
          setData((p) => ({ ...p, plot, window: undefined }));
        } else if (id === "dsConnect") setData((p) => ({ ...p, connect: !p.connect }));
        else if (id === "dsWhiskers") setData((p) => ({ ...p, extendWhiskers: !p.extendWhiskers }));
        else if (id === "dsNormal") setData((p) => ({ ...p, normalPdf: !p.normalPdf }));
        else if (id.startsWith("dsAxis:")) {
          const axis = id.slice(7);
          const names = listNames();
          setMenu({
            items: names.length
              ? names.map((n) => menuApp(n, `dsVar:${axis}:${n}`))
              : [{ label: "No lists in this problem" }],
            state: openMenu(),
          });
        } else if (id.startsWith("dsVar:")) {
          const [, axis, name] = id.split(":");
          setData((p) => {
            const next = { ...p, [axis === "x" ? "x" : "y"]: name, window: undefined };
            // Two lists make a scatter plot, one a dot plot, as on the handheld.
            if (next.x && next.y && ONE_VAR.includes(next.plot)) next.plot = "scatter";
            if (!next.y && !ONE_VAR.includes(next.plot)) next.plot = "dot";
            return next;
          });
        } else if (id === "dsRemoveX") setData((p) => ({ ...p, x: undefined, window: undefined }));
        else if (id === "dsRemoveY") setData((p) => ({ ...p, y: undefined, plot: ONE_VAR.includes(p.plot) ? p.plot : "dot", regression: undefined, movable: undefined, window: undefined }));
        else if (id === "dsClearAll") setData((p) => ({ kind: "datastats", id: p.id, problem: p.problem, plot: "dot" }));
        else if (id === "dsRemoveAnalysis")
          setData((p) => ({ ...p, regression: undefined, movable: undefined, functions: undefined, values: undefined, normalPdf: undefined }));
        else if (id.startsWith("dsReg:")) {
          const kind = id.slice(6);
          setData((p) => ({ ...p, regression: p.regression === kind ? undefined : kind }));
        } else if (id === "dsMovable")
          setData((p) => {
            if (p.movable) return { ...p, movable: undefined };
            // A line through the middle of the window, at half its diagonal's slope.
            const w = shownWin ?? { xmin: -10, xmax: 10, ymin: -10, ymax: 10, xscl: 1, yscl: 1 };
            const m = ((w.ymax - w.ymin) / (w.xmax - w.xmin)) * 0.5;
            return { ...p, movable: { m, b: (w.ymin + w.ymax) / 2 - (m * (w.xmin + w.xmax)) / 2 } };
          });
        else if (id === "dsLock") setData((p) => (p.movable ? { ...p, movable: { ...p.movable, lock: !p.movable.lock, ...(!p.movable.lock ? { b: 0 } : {}) } } : p));
        else if (id === "dsWindow" && shownWin)
          setWizard(
            openWizard({
              kind: "wizard",
              title: "Window Settings",
              arrows: false,
              fields: [
                { label: "XMin:", value: fmt(shownWin.xmin) },
                { label: "XMax:", value: fmt(shownWin.xmax) },
                { label: "YMin:", value: fmt(shownWin.ymin) },
                { label: "YMax:", value: fmt(shownWin.ymax) },
              ],
              build: "ds:window:{0}:{1}:{2}:{3}",
            }),
          );
        else if (id === "dsZoomData") setData((p) => ({ ...p, window: undefined }));
        else if ((id === "dsZoomIn" || id === "dsZoomOut") && shownWin) {
          const k = id === "dsZoomIn" ? 0.5 : 2;
          const cx = (shownWin.xmin + shownWin.xmax) / 2;
          const cy = (shownWin.ymin + shownWin.ymax) / 2;
          const hx = ((shownWin.xmax - shownWin.xmin) / 2) * k;
          const hy = ((shownWin.ymax - shownWin.ymin) / 2) * k;
          setData((p) => ({ ...p, window: { xmin: cx - hx, xmax: cx + hx, ymin: cy - hy, ymax: cy + hy, xscl: 1, yscl: 1 } }));
        } else if (id === "dsSettings")
          setWizard(
            openWizard({
              kind: "wizard",
              title: "Data & Statistics Settings",
              fields: [
                { label: "Display Digits:", value: page.digits ?? "Auto", options: ["Auto", ...Array.from({ length: 8 }, (_, i) => `Float${i + 1}`)] },
                { label: "Diagnostics", value: page.diagnostics ? "Yes" : "No", check: true },
              ],
              build: "ds:settings:{0}:{1}",
            }),
          );
      } else if (action.id === "notes:attrs" && page?.kind === "notes") {
        const a = notesApi.current?.attrs();
        if (!a) setError("Error: Put the cursor in a maths box first");
        else
          setWizard(
            openWizard({
              kind: "wizard",
              title: "Math Box Attributes",
              fields: [
                { label: "Input:", value: a.hideIn ? "Hide" : "Show", options: ["Show", "Hide"] },
                { label: "Output:", value: a.hideOut ? "Hide" : "Show", options: ["Show", "Hide"] },
              ],
              build: "notesattrs:{0}:{1}",
            }),
          );
      } else if (action.id.startsWith("notes:") && page?.kind === "notes") notesApi.current?.action(action.id);
      else if (action.id === "pyRun" && page?.kind === "python") runPython({ file: page.file });
      else if (action.id === "pyClear" && page?.kind === "pyshell") updatePage(page.id, (p) => (p.kind === "pyshell" ? { ...p, lines: [] } : p));
      else if (action.id === "docSettings") {
        setWizard(
          openWizard({
            kind: "wizard",
            title: "Document Settings",
            fields: [
              {
                label: "Display Digits:",
                value: settings.digits === 12 ? "Float" : `Float${settings.digits}`,
                options: DIGIT_OPTIONS,
              },
              { label: "Angle:", value: settings.angle === "rad" ? "Radian" : "Degree", options: ["Radian", "Degree"] },
              { label: "Exponential Format:", value: "Normal", options: ["Normal"] },
              {
                label: "Real or Complex Format:",
                value: { real: "Real", rect: "Rectangular", polar: "Polar" }[settings.complex],
                options: ["Real", "Rectangular", "Polar"],
              },
              {
                label: "Calculation Mode:",
                value: { auto: "Auto", exact: "Exact", approx: "Approximate" }[settings.mode],
                options: ["Auto", "Exact", "Approximate"],
              },
              { label: "CAS Mode:", value: "On", options: ["On"] },
              { label: "Vector Format:", value: "Rectangular", options: ["Rectangular"] },
              { label: "Base:", value: "Decimal", options: ["Decimal"] },
              { label: "Unit System:", value: "SI", options: ["SI"] },
            ],
            build: "settings:{0}:{1}:{3}:{4}",
          }),
        );
      } else if (action.id === "financeSolver") setFinance({ ...lastFinance.current, focus: 0, fresh: true });
      else if (action.id === "clearHistory") setCalc((p) => ({ ...p, history: [], sel: null }));
      else if (action.id === "clearAZ") {
        const e = engine.current;
        if (e)
          void evaluate("ClearAZ", e.giac, { settings }).then((r) => {
            if (r.ok && r.definition) {
              e.remember(r.definition);
              setDefined(definedNames(e.saved));
            }
          });
      } else graphAction(action.id);
    },
    [addPage, graphAction, pageKey, setCalc, settings, doc, setup, rows, browse, page, newDoc, writeNow, refreshFiles, showStatus, openFile, downloadFile, tnsOf, setLists, recalcLists, runPython, updatePage, startNew, closeDocument, saveDocument, isScratch], // eslint-disable-line react-hooks/exhaustive-deps
  );

  function askDelete(path: string) {
    setConfirm({
      title: "Delete",
      lines: [`Delete ${files.nameOf(path)}?`, "", "It's removed from this browser; this can't be undone."],
      ok: () => {
        void files.remove(path).then(async () => {
          if (current.current.openPath && (current.current.openPath === path || current.current.openPath.startsWith(`${path}/`))) {
            setPref("current", null);
            const loaded = load();
            await openSaved(loaded ? { ...loaded, doc: withScratchPages(loaded.doc) } : freshScratch(), null, true);
            setView("browse");
          }
          setRecent((r) => {
            const next = r.filter((x) => x !== path && !x.startsWith(`${path}/`));
            setPref("recent", next);
            return next;
          });
          setBrowse((b) => ({ ...b, sel: Math.max(0, b.sel - 1) }));
          await refreshFiles();
        });
      },
    });
  }

  const wizardDone = useCallback(
    (built: string) => {
      const field = (prefix: string) => built.slice(prefix.length).trim();
      const badName = (n: string) => !n || /[/\\:*?"<>|]/.test(n);
      if (built.startsWith("geostore:")) {
        // geostore:<measurement>:<variable>; an empty name unlinks it.
        const [id, name = ""] = built.slice(9).split(":").map((v) => v.trim());
        if (name && !VAR_NAME.test(name)) return setError("Error: A variable name is letters, digits and _, starting with a letter");
        setGeo((p) => ({
          ...p,
          objects: p.objects.map((o) => (o.kind !== "measure" ? o : o.id === id ? { ...o, store: name || undefined } : o.store === name ? { ...o, store: undefined } : o)),
        }));
        return;
      }
      if (built.startsWith("geoamount:")) {
        // geoamount:<tool>:<object>:<centre>:<number> (a fraction a/b is fine too).
        const [tool, obj, centre, text = ""] = built.slice(10).split(":");
        const m = /^\s*(-?[\d.]+)\s*(?:\/\s*([\d.]+))?\s*$/.exec(text.replace("−", "-"));
        const n = m ? Number(m[1]) / (m[2] ? Number(m[2]) : 1) : NaN;
        if (!Number.isFinite(n)) return setError("Error: Type a number");
        setGeo((p) => {
          const r = transformWith(p.objects, tool as GeoTool, [obj!, centre!], n);
          if ("error" in r) {
            setTimeout(() => setError(`Error: ${r.error}`));
            return p;
          }
          return { ...p, objects: r.objs };
        });
        return;
      }
      if (built.startsWith("saveas:")) {
        const name = field("saveas:").replace(/\.tns$/i, "");
        if (badName(name)) return setError("Error: Invalid file name");
        void (async () => {
          const path = files.join(files.ROOT, await files.freeName(files.ROOT, `${name}.tns`));
          const s: Saved = { doc: { ...current.current.doc, title: stem(files.nameOf(path)) }, settings: current.current.settings, definitions: engine.current?.saved ?? [] };
          await files.put({ path, type: "file", doc: s, size: files.sizeOf(s), modified: Date.now() });
          skipSave.current = true;
          setDoc(s.doc);
          setIsScratch(false);
          setOpenPath(path);
          setDirty(false);
          current.current = { ...current.current, doc: s.doc, openPath: path, isScratch: false, dirty: false };
          setPref("current", { saved: s, path, dirty: false } satisfies Cached);
          remember(path);
          await refreshFiles();
          toast.success(`Saved as ${files.nameOf(path)}`);
          const then = afterSave.current;
          afterSave.current = null;
          then?.();
        })();
        return;
      }
      if (built.startsWith("browse:")) {
        const r = rows[browse.sel];
        const folder = targetFolder(rows, browse.sel);
        if (built.startsWith("browse:mkdir:")) {
          const name = field("browse:mkdir:");
          if (badName(name)) return setError("Error: Invalid folder name");
          void files.mkdir(files.join(folder, name)).then(refreshFiles);
        } else if (built.startsWith("browse:rename:") && r) {
          let name = field("browse:rename:");
          if (badName(name)) return setError("Error: Invalid name");
          if (!r.folder && /\.tns$/i.test(r.name) && !/\.\w+$/.test(name)) name += ".tns";
          const to = files.join(files.parentOf(r.path), name);
          void files
            .rename(r.path, to)
            .then(async () => {
              if (current.current.openPath === r.path) setOpenPath(to);
              await refreshFiles();
            })
            .catch((err: Error) => setError(`Error: ${err.message}`));
        }
        return;
      }
      if (built.startsWith("setup:")) {
        const [text, haptics] = built.slice(6).split(":");
        const next: Setup = { text: (["Small", "Medium", "Large"].includes(text!) ? text : "Medium") as Setup["text"], haptics: haptics === "Yes" };
        setSetupState(next);
        setPref("setup", next);
        return;
      }
      if (built.startsWith("pynew:")) {
        let name = field("pynew:") || "program";
        if (!/^[A-Za-z_]\w*(\.py)?$/.test(name)) return setError("Error: A program name is letters, digits and _");
        if (!name.endsWith(".py")) name += ".py";
        setDoc((d) => {
          const p: PythonPage = { kind: "python", id: newId(), problem: problemOf(d.pages[d.active]), file: name, source: "" };
          const pages = d.pages.slice();
          pages.splice(d.active + 1, 0, p);
          return { ...d, pages, active: d.active + 1 };
        });
        return;
      }
      if (built.startsWith("scatter:")) {
        const [x, y] = built.slice(8).split(":").map((v) => v.trim().toLowerCase());
        if (!x || !y) return setError("Error: Choose an x list and a y list");
        setGraphs((g) => {
          const used = new Set((g.scatters ?? []).map((sc) => sc.n));
          let n = 1;
          while (used.has(n)) n++;
          return { ...g, scatters: [...(g.scatters ?? []), { n, x, y }] };
        });
        return;
      }
      if (built.startsWith("ds:") && page?.kind === "datastats") {
        const [, what, ...args] = built.split(":");
        if (what === "bins") {
          const [width, start] = args.map((a) => (a?.trim() ? Number(a) : NaN));
          if (!args[0]?.trim()) setData((p) => ({ ...p, bins: undefined, window: undefined }));
          else if (!(width! > 0)) setError("Error: The bin width must be more than 0");
          else setData((p) => ({ ...p, bins: { width: width!, start: Number.isFinite(start) ? start! : 0 }, window: undefined }));
        } else if (what === "fn" && args.join(":").trim()) setData((p) => ({ ...p, functions: [...(p.functions ?? []), args.join(":").trim()] }));
        else if (what === "value" && args.join(":").trim()) setData((p) => ({ ...p, values: [...(p.values ?? []), args.join(":").trim()] }));
        else if (what === "window") {
          const [xmin, xmax, ymin, ymax] = args.map(Number);
          if (![xmin, xmax, ymin, ymax].every(Number.isFinite) || xmin! >= xmax! || ymin! >= ymax!) setError("Error: Invalid window settings");
          else setData((p) => ({ ...p, window: { xmin: xmin!, xmax: xmax!, ymin: ymin!, ymax: ymax!, xscl: 1, yscl: 1 } }));
        } else if (what === "settings") setData((p) => ({ ...p, digits: args[0], diagnostics: args[1] === "Yes" }));
        return;
      }
      if (built.startsWith("lists:") && page?.kind === "lists") {
        const parts = built.split(":");
        if (parts[1] === "seq") {
          const [, , formula, first, max] = parts;
          const lo = Number(first) || 1;
          const count = Math.max(1, Math.min(2500, Number(max) || 10));
          if (!formula?.trim()) return setError("Error: Enter a formula");
          const next = sheet.setColumnFormula(page, `=seq(${formula},n,${lo},${lo + count - 1})`);
          setLists(() => next);
          void recalcLists(next);
          return;
        }
        if (parts[1] === "stat") {
          const [, , cmd, xName, yName] = parts;
          const col = (n: string | undefined) =>
            page.cols.find((c) => c.name === n?.trim().toLowerCase()) ?? page.cols[(n?.trim().toUpperCase().charCodeAt(0) ?? 0) - 65];
          const xs = sheet.columnNumbers(col(xName));
          const ys = sheet.columnNumbers(col(yName));
          if (!xs.length || (yName !== undefined && !ys.length)) return setError("Error: The list has no numbers");
          let res: StatResult;
          try {
            res = cmd === "OneVar" ? oneVar(xs) : cmd === "TwoVar" ? twoVar(xs, ys) : regression(cmd!, xs, ys);
          } catch (err) {
            return setError(`Error: ${(err as Error).message}`);
          }
          const show = (v: number | string | number[]) => (Array.isArray(v) ? `{${v.map((x) => +x.toPrecision(8)).join(", ")}}` : typeof v === "number" ? String(+v.toPrecision(10)) : v);
          setWarning(res.rows.map(([label, v]) => `${label}: ${show(v)}`));
          return;
        }
      }
      if (built.startsWith("settings:")) {
        const [digits, angle, complex, mode] = built.slice(9).split(":");
        const next: Settings = {
          digits: digits === "Float" ? 12 : Number(digits?.replace("Float", "")) || 6,
          angle: angle === "Degree" ? "deg" : "rad",
          complex: complex === "Rectangular" ? "rect" : complex === "Polar" ? "polar" : "real",
          mode: mode === "Exact" ? "exact" : mode === "Approximate" ? "approx" : "auto",
        };
        setSettings(next);
        void engine.current?.applySettings(next);
        return;
      }
      if (built.startsWith("slider:")) {
        const [, old, typed, value, min, max, step, style, digits, minimized, showName, showScale] = built.split(":");
        const name = typed?.toLowerCase();
        const lo = Number(min);
        const hi = Number(max);
        const st = step?.trim() === "Automatic" ? ("auto" as const) : Number(step);
        if (!/^[A-Za-z]\w*$/.test(name ?? "") || !(hi > lo) || (st !== "auto" && !(st > 0))) {
          setError("Error: Invalid slider settings");
          return;
        }
        const sl: Slider = {
          name: name!,
          min: lo,
          max: hi,
          step: st,
          value: 0,
          vertical: style === "Vertical",
          minimized: minimized === "Yes",
          digits,
          hideName: showName === "No",
          hideScale: showScale === "No",
        };
        sl.value = snap(sl, Number.isFinite(Number(value)) ? Number(value) : lo);
        assign(sl.name, sl.value, true);
        setGraphs((g) => {
          const rest = (g.sliders ?? []).filter((x) => x.name !== old && x.name !== sl.name);
          const at = (g.sliders ?? []).findIndex((x) => x.name === old);
          const list = [...rest];
          // Settings keep the slider where Move put it. Insert Slider puts a new
          // one at the right edge, just above the x-axis.
          const place = at < 0 && !old ? INSERTED_AT : g.sliders?.[at]?.at;
          list.splice(at < 0 ? list.length : at, 0, { ...sl, at: place });
          return { ...g, sliders: list };
        });
        return;
      }
      if (built.startsWith("deset:")) {
        const [method, iterations, field, start, end, step, resolution] = built.slice(6).split(":");
        const [it, a, b, h, res] = [iterations, start, end, step, resolution].map(Number) as number[];
        const ok = [it, a, b, h, res].every(Number.isFinite) && it! >= 1 && b! > a! && h! > 0 && res! >= 2 && res! <= 60;
        if (!ok) {
          setError("Error: Invalid differential equation settings");
          return;
        }
        setGraphs((g) => ({
          ...g,
          deSettings: {
            method: method === "Runge-Kutta" ? "Runge-Kutta" : "Euler",
            iterations: Math.round(it!),
            field: field === "None" ? "None" : "Slope",
            start: a!,
            end: b!,
            step: h!,
            resolution: Math.round(res!),
          },
        }));
        return;
      }
      if (built.startsWith("window:")) {
        const parts = built.slice(7).split(":");
        const [xmin, xmax, , ymin, ymax] = parts.map(Number);
        const scl = (s: string | undefined, lo: number, hi: number) =>
          s?.trim() === "Auto" ? autoScale(lo, hi) : Number(s);
        const xscl = scl(parts[2], xmin!, xmax!);
        const yscl = scl(parts[5], ymin!, ymax!);
        const ok = [xmin, xmax, xscl, ymin, ymax, yscl].every((v) => Number.isFinite(v));
        if (!ok || xmin! >= xmax! || ymin! >= ymax!) {
          setError("Error: Invalid window settings");
          return;
        }
        setGraphs((g) => ({
          ...g,
          window: { xmin: xmin!, xmax: xmax!, xscl: xscl!, ymin: ymin!, ymax: ymax!, yscl: yscl! },
        }));
        return;
      }
      if (built.startsWith("notesattrs:")) {
        const [, input, output] = built.split(":");
        notesApi.current?.setAttrs({ hideIn: input === "Hide", hideOut: output === "Hide" });
        return;
      }
      if (page?.kind === "notes") {
        notesApi.current?.insertMath(built);
        return;
      }
      setCalc((p) => ({ ...p, edit: wizardInsert(p.edit, built), sel: null }));
      setGraphs((g) => (g.editing !== null ? { ...g, edit: wizardInsert(g.edit, built) } : g));
    },
    [setCalc, setGraphs, assign, rows, browse, page, refreshFiles, remember, setLists, recalcLists],
  );

  // The catalog's answer to a key or a click: keep it open, or close it and insert.
  const catalogResult = useCallback(
    (r: CatalogResult) => {
      setCatalog(r.state);
      if (r.insert !== undefined) pageKey({ k: "text", text: r.insert });
      if (r.template) pageKey({ k: "template", id: r.template });
      if (r.wizard) setWizard(openWizard(r.wizard));
    },
    [pageKey],
  );

  const handleKey = useCallback(
    (key: Key) => {
      if (confirm) {
        if (confirm.buttons) {
          // Enter is the first choice, Esc the last (Cancel); or the choice's first letter.
          const pick =
            key.k === "enter"
              ? confirm.buttons[0]
              : key.k === "esc"
                ? confirm.buttons.at(-1)
                : key.k === "char"
                  ? confirm.buttons.find((b) => b.label[0]!.toLowerCase() === key.c.toLowerCase())
                  : undefined;
          if (pick) {
            setConfirm(null);
            pick.run();
          }
        } else if (key.k === "enter") {
          setConfirm(null);
          confirm.ok();
        } else if (key.k === "esc") setConfirm(null);
        return;
      }
      if (error) {
        if (key.k === "enter" || key.k === "esc") setError(null);
        return;
      }
      if (warning) {
        if (key.k === "enter" || key.k === "esc") setWarning(null);
        return;
      }
      if (sliderPrompt) {
        const { names, on, focus } = sliderPrompt;
        if (key.k === "enter") createSliders(names.filter((_, i) => on[i]));
        if (key.k === "enter" || key.k === "esc") setSliderPrompt(null);
        else if (key.k === "down" || key.k === "tab" || key.k === "up") {
          const by = key.k === "up" ? names.length - 1 : 1;
          setSliderPrompt({ ...sliderPrompt, focus: (focus + by) % names.length });
        } else if ((key.k === "char" && key.c === " ") || key.k === "left" || key.k === "right")
          setSliderPrompt({ ...sliderPrompt, on: on.map((v, i) => (i === focus ? !v : v)) });
        return;
      }
      // The catalog, the palette and the keypad's panels can open over a
      // dialog (they're mouse-opened), so they take keys before it does.
      if (catalog) {
        catalogResult(catalogKeyPress(catalog, key));
        return;
      }
      if (palette !== null) {
        const r = paletteKeyPress(palette, key);
        setPalette(r.index);
        if (r.insert) pageKey({ k: "template", id: r.insert });
        if (r.wizard) setWizard(openWizard(r.wizard));
        return;
      }
      if (menu) {
        const r = menuKeyPress(menu.items, menu.state, key);
        setMenu(r.state ? { items: menu.items, state: r.state } : null);
        // Leaving New's add-page menu without choosing goes back home.
        if (!r.state && !r.action && creatingNew.current) {
          creatingNew.current = false;
          setView(backTo.current);
        }
        runAction(r.action);
        return;
      }
      if (wizard) {
        const r = wizardKeyPress(wizard, key);
        setWizard(r.state);
        if (r.done !== undefined) wizardDone(r.done);
        return;
      }
      if (finance) {
        const r = financeKeyPress(finance, key);
        if (r.state) lastFinance.current = r.state;
        setFinance(r.state);
        if (r.error) setError(r.error);
        return;
      }
      // The handheld's own keys, wherever you are.
      if (key.k === "homeScreen") {
        void writeNow();
        setView((v) => (v === "home" ? "doc" : "home"));
        return;
      }
      if (key.k === "scratchpad") {
        void openScratchpad("calculator");
        return;
      }
      if (key.k === "save") {
        void saveDocument();
        return;
      }
      if (view === "new") {
        setView(backTo.current);
        return;
      }
      if (view === "home") {
        if (key.k === "menu") setMenu({ items: SETTINGS_MENU, state: openMenu() });
        else if (key.k === "esc") setView("doc");
        else {
          const r = homeKeyPress(homeSel, key, recent.length > 0, !isScratch || Boolean(pref<Cached | null>("current", null)));
          setHomeSel(r.sel);
          homeAction(r.act);
        }
        return;
      }
      if (view === "browse") {
        if (key.k === "menu") setMenu({ items: BROWSE_MENU, state: openMenu() });
        else if (key.k === "esc") setView("home");
        else {
          const r = browseKeyPress(browse, rows, key);
          setBrowse(r.state);
          if (r.effect && "open" in r.effect && r.effect.open) void openFile(r.effect.open);
          if (r.effect && "delete" in r.effect && r.effect.delete) askDelete(r.effect.delete);
        }
        return;
      }
      if (key.k === "menu") {
        if (page?.kind === "lists") {
          const name = (i: number) => page.cols[i]?.name ?? sheet.letter(i).toLowerCase();
          setMenu({ items: listsMenu(name(page.sel.col), name(page.sel.col + 1)), state: openMenu() });
          return;
        }
        if (page?.kind === "datastats") {
          setMenu({ items: dataMenu(page), state: openMenu() });
          return;
        }
        if (page?.kind === "geometry") {
          setMenu({ items: geometryMenu(page), state: openMenu() });
          return;
        }
        if (page?.kind === "notes") {
          setMenu({ items: NOTES_MENU, state: openMenu() });
          return;
        }
        if (page?.kind === "python" || page?.kind === "pyshell") {
          setMenu({ items: page.kind === "python" ? PYTHON_MENU : SHELL_MENU, state: openMenu() });
          return;
        }
        setMenu({
          items:
            page?.kind === "graphs"
              ? graphsMenu({ axes: page.axes, entryLine: page.editing !== null, grid: page.grid, table: page.table })
              : calculatorMenu,
          state: openMenu(),
        });
        return;
      }
      if (key.k === "doc") {
        setMenu({ items: DOC_MENU, state: openMenu() });
        return;
      }
      if (key.k === "insertPage") {
        creatingNew.current = false;
        setMenu({ items: ADD_PAGE, state: openMenu() });
        return;
      }
      if (key.k === "prevPage" || key.k === "nextPage") {
        setDoc((d) => ({
          ...d,
          active: Math.max(0, Math.min(d.pages.length - 1, d.active + (key.k === "prevPage" ? -1 : 1))),
        }));
        return;
      }
      // Esc steps back: it cancels what's open on the page first, then leaves the document.
      if (key.k === "esc" && !pageTakesEsc(page, py)) {
        leaveDocument();
        return;
      }
      pageKey(key);
    },
    [
      leaveDocument,
      py,
      confirm,
      view,
      homeSel,
      recent,
      browse,
      rows,
      homeAction,
      isScratch,
      openFile,
      openScratchpad,
      writeNow,
      saveDocument,
      error,
      warning,
      sliderPrompt,
      createSliders,
      wizard,
      finance,
      catalog,
      catalogResult,
      palette,
      menu,
      page,
      pageKey,
      runAction,
      wizardDone,
    ],
  );

  // Several keys from one keypad press: fold them over the current state so
  // none is lost (each handleKey call would start from the same render).
  const handleKeys = useCallback(
    (keys: Key[]) => {
      if (menu || catalog || palette !== null) keys.forEach(handleKey);
      else if (finance) {
        let f: FinanceState | null = finance;
        for (const k of keys) if (f) f = financeKeyPress(f, k).state;
        if (f) lastFinance.current = f;
        setFinance(f);
      } else if (wizard) {
        let w: WizardState | null = wizard;
        for (const k of keys) if (w) w = wizardKeyPress(w, k).state;
        setWizard(w);
      } else if (!error && !menu && !catalog && palette === null && page?.kind === "calculator") {
        typing.current = false;
        let p = page;
        for (const k of keys) p = calcKey(p, k).page;
        setCalc(() => p);
      } else if (!error && !menu && !catalog && palette === null && page?.kind === "graphs") {
        typing.current = false;
        let p = page;
        for (const k of keys) p = graphKey(p, k, takenFns).page;
        setGraphs(() => p);
      } else if (!error && view === "doc" && page?.kind === "lists") {
        let p = page;
        for (const k of keys) p = sheet.listsKey(p, k).page;
        setLists(() => p);
      } else keys.forEach(handleKey);
    },
    [finance, wizard, error, menu, catalog, palette, page, setCalc, setGraphs, setLists, handleKey, takenFns, view],
  );

  const onKeyDown = (e: KeyboardEvent) => {
    // The Python editor is a real text box: it types, selects, copies and undoes
    // natively. Only the handheld's shortcuts (and Tab, as four spaces) come here.
    // Notes is a real editable page too: it types, formats (Ctrl+B, Ctrl+U) and undoes natively.
    if ((e.target as HTMLElement).closest?.("[data-notes-editor]")) {
      const ctrl = e.ctrlKey || e.metaKey;
      const ours = ctrl ? ["m", "k", "i", "h", "s", "arrowleft", "arrowright"].includes(e.key.toLowerCase()) : ["Escape", "ContextMenu"].includes(e.key);
      if (!ours) return;
    }
    if ((e.target as HTMLElement).dataset.pyEditor !== undefined) {
      const ctrl = e.ctrlKey || e.metaKey;
      // Enter too, so a new line keeps its indent (and indents after a colon), as the handheld's editor does.
      const ours = ctrl
        ? ["r", "m", "k", "i", "h", "s", "arrowleft", "arrowright"].includes(e.key.toLowerCase())
        : ["Escape", "ContextMenu", "Tab", "Enter"].includes(e.key);
      if (!ours) return;
    }
    // Ctrl+V reaches onPaste below; let the browser deliver it.
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "v") return;
    const key = keyFromEvent(e);
    if (!key) return;
    e.preventDefault();
    if (key.k === "copy") {
      copySelection();
      return;
    }
    if (key.k === "undo" || key.k === "redo") {
      if (!error && !warning && !sliderPrompt && !wizard && !finance && !catalog && palette === null && !menu)
        stepUndo(key.k === "undo");
      return;
    }
    if (key.k === "cut") {
      // Ctrl+X: copy the selected part of the entry line, then remove it. History can't be cut, only copied.
      if (page?.kind === "calculator" && page.sel) copySelection();
      else if ((page?.kind === "calculator" || page?.kind === "graphs") && selection(page.edit)) {
        copySelection();
        handleKey({ k: "delete" });
      }
      return;
    }
    handleKey(key);
  };

  /**
   * Ctrl+C on a selected history item copies its text, as on the handheld;
   * with part of the entry line selected it copies that.
   */
  const copySelection = () => {
    if ((page?.kind === "calculator" || page?.kind === "graphs") && !(page.kind === "calculator" && page.sel) && selection(page.edit)) {
      void navigator.clipboard?.writeText(selectionText(page.edit)).catch(() => undefined);
      return;
    }
    if (page?.kind !== "calculator" || !page.sel) return;
    // Part of a history line selected with the caret: just that part.
    const caret = page.sel.caret;
    if (caret && selection(caret)) {
      void navigator.clipboard?.writeText(selectionText(caret)).catch(() => undefined);
      return;
    }
    const h = page.history[page.sel.entry];
    if (!h) return;
    const text = page.sel.part === "input" ? h.inputText : h.outputText;
    void navigator.clipboard?.writeText(text).catch(() => undefined);
  };

  const onPaste = (e: ClipboardEvent) => {
    if ((e.target as HTMLElement).dataset.pyEditor !== undefined || (e.target as HTMLElement).closest?.("[data-notes-editor]")) return;
    const text = e.clipboardData.getData("text").replace(/\s+/g, " ").trim();
    if (!text) return;
    e.preventDefault();
    if (wizard) handleKey({ k: "text", text });
    else handleKey({ k: "paste", text });
  };

  const pickMenu = (path: number[]) => {
    if (!menu) return;
    let items: MenuItem[] = menu.items;
    let item: MenuItem | undefined;
    for (const i of path) {
      item = items[i];
      items = item?.items ?? [];
    }
    if (item?.items) setMenu({ items: menu.items, state: { path: [...path, 0] } });
    else if (item?.action) {
      setMenu(null);
      runAction(item.action);
    }
  };

  // Menus, dialogs, errors, page changes and graph tools, read out as they change.
  useEffect(() => {
    if (menu) say(menuSaid(menu.items, menu.state));
  }, [menu, say]);
  useEffect(() => {
    if (wizard) say(wizardSaid(wizard));
  }, [wizard?.focus, wizard?.wizard, say]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (error) {
      say(error);
      haptic("error");
    }
  }, [error, say, haptic]);
  useEffect(() => {
    if (warning) say(`Warning. ${warning.filter(Boolean).join(" ")}`);
  }, [warning, say]);
  useEffect(() => {
    if (catalog) say(catalogSaid(catalog));
  }, [catalog, say]);
  useEffect(() => {
    if (finance) say(`Finance Solver. ${FINANCE_NAMES[finance.focus]} ${finance.values[finance.focus]}`);
  }, [finance, say]);
  useEffect(() => {
    const c = palette !== null ? PALETTE[palette] : undefined;
    if (c) say(`${c.label}${c.id || c.wizard ? "" : ", not available"}`);
  }, [palette, say]);
  const seenPage = useRef(false);
  useEffect(() => {
    const p = doc.pages[doc.active];
    if (seenPage.current && p) say(pageSaid(p, pageLabel(doc, doc.active)));
    seenPage.current = true;
  }, [doc.active, doc.pages.length, say]); // eslint-disable-line react-hooks/exhaustive-deps
  const sel = page?.kind === "calculator" ? page.sel : null;
  useEffect(() => {
    if (!sel || page?.kind !== "calculator") return;
    const h = page.history[sel.entry];
    if (h)
      say(
        `${sel.part === "input" ? "Entry" : "Result"} ${sel.entry + 1}: ${sel.part === "input" ? h.inputText : (h.error ?? h.outputText)}${h.warning ? `. Warning: ${h.warning[0]}` : ""}`,
      );
  }, [sel?.entry, sel?.part, say]); // eslint-disable-line react-hooks/exhaustive-deps
  const tool = page?.kind === "graphs" ? page.tool : null;
  useEffect(() => {
    if (tool) say(toolSaid(tool));
  }, [tool, say]);

  const upload = useCallback(
    async (list: File[]) => {
      if (!list.length) return;
      const folder = view === "browse" ? targetFolder(rows, browse.sel) : files.ROOT;
      try {
        const n = await addFiles(folder, list);
        await refreshFiles();
        setBrowse((b) => ({ ...b, open: [...new Set([...b.open, folder])] }));
        setView("browse");
        toast.success(`Added ${n} file${n === 1 ? "" : "s"} to ${files.nameOf(folder)}`);
      } catch (err) {
        toast.error(`Couldn't add those files: ${(err as Error).message}`);
      }
    },
    [view, rows, browse.sel, refreshFiles],
  );
  // Files dropped anywhere on the page go into My Documents.
  useEffect(() => {
    const hasFiles = (e: DragEvent) => Array.from(e.dataTransfer?.types ?? []).includes("Files");
    let depth = 0;
    const enter = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      depth++;
      setDragging(true);
    };
    const leave = () => {
      depth = Math.max(0, depth - 1);
      if (!depth) setDragging(false);
    };
    const over = (e: DragEvent) => {
      if (hasFiles(e)) e.preventDefault();
    };
    const drop = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      depth = 0;
      setDragging(false);
      void uploadRef.current(Array.from(e.dataTransfer?.files ?? []));
    };
    window.addEventListener("dragenter", enter);
    window.addEventListener("dragleave", leave);
    window.addEventListener("dragover", over);
    window.addEventListener("drop", drop);
    return () => {
      window.removeEventListener("dragenter", enter);
      window.removeEventListener("dragleave", leave);
      window.removeEventListener("dragover", over);
      window.removeEventListener("drop", drop);
    };
  }, []);
  const uploadRef = useRef(upload);
  uploadRef.current = upload;

  // The window-wide key listener below reads the newest state through a ref.
  const latest = useRef({ doc, page, runAction, handleKey, addPage, setCalc });
  latest.current = { doc, page, runAction, handleKey, addPage, setCalc };

  // On a computer the calculator takes the keyboard as the page opens, so
  // typing works without a click first. Counted as pointer focus: no ring.
  useEffect(() => {
    if (!window.matchMedia("(hover: hover) and (pointer: fine)").matches) return;
    // A /cas?how= link opens a card; leave the keyboard with it.
    if (new URLSearchParams(window.location.search).has("how")) return;
    if (document.activeElement && document.activeElement !== document.body) return;
    pointerFocus.current = true;
    root.current?.focus({ preventScroll: true });
  }, []);
  // A character typed with focus on nothing (after a click on the page's
  // margin, say) goes to the calculator too. / is left for "How do I…", and
  // space for scrolling.
  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.target !== document.body || e.defaultPrevented) return;
      if (document.querySelector('[aria-modal="true"]') || immersive.current) return;
      if (e.ctrlKey || e.metaKey || e.altKey || e.key.length !== 1 || e.key === "/" || e.key === " ") return;
      e.preventDefault();
      pointerFocus.current = true;
      root.current?.focus({ preventScroll: true });
      latest.current.handleKey({ k: "char", c: e.key });
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // The assistant's (and WebMCP agents') hands on the calculator: this render's
  // state and handlers, rebuilt every render so a tool always gets the newest.
  // The assistant: off, beside the calculator, or AI mode (the chat takes the page).
  const [ai, setAi] = useState<"off" | "panel" | "immersive">("off");
  const aiOpen = ai === "panel";
  const immersive = useRef(false);
  immersive.current = ai === "immersive";
  const [aiSettings, setAiSettings] = useState(false);
  const dialogNow = (): AgentDialog | null => {
    if (confirm) return { kind: "message", title: confirm.title, lines: confirm.lines, ...(confirm.buttons ? { buttons: confirm.buttons.map((b) => b.label) } : {}) };
    if (error) return { kind: "error", lines: [error] };
    if (warning) return { kind: "warning", lines: warning };
    if (sliderPrompt) return { kind: "sliders", title: "Create sliders? (OK creates them, Cancel doesn't)", lines: sliderPrompt.names };
    if (catalog) return { kind: "catalog" };
    if (palette !== null) return { kind: "templates" };
    if (menu) return { kind: "menu", lines: menu.items.map((it) => it.label) };
    if (wizard)
      return {
        kind: "dialog",
        title: wizard.wizard.title,
        fields: wizard.wizard.fields.map((f, i) => ({ label: f.label, value: wizard.values[i] ?? "", ...(f.check ? { options: ["Yes", "No"] } : f.options && !f.free ? { options: f.options } : {}) })),
      };
    if (finance) return { kind: "finance", lines: FINANCE_NAMES.map((n, i) => `${n}: ${finance.values[i] ?? ""}`) };
    return null;
  };
  const agentHost = useRef<AgentHost>(null!);
  agentHost.current = {
    snapshot: () => ({
      view,
      doc,
      path: openPath,
      scratch: isScratch,
      dirty,
      settings,
      engine: status,
      busy: busy.current,
      dialog: dialogNow(),
      menu: menu?.items ?? null,
      // The pages' own copies of their curves (g12f1_) are plumbing, not the student's variables.
      variables: [...new Set((engine.current?.saved ?? []).filter((d) => !/^g\d+[frxyd]\d+_/.test(d)))],
      files: fileList.map((f) => ({ path: f.path, type: f.type, size: f.size })),
      python: { status: py.status, prompt: py.prompt },
      highlights: liveHighlights(doc, highlights),
    }),
    key: handleKey,
    keys: handleKeys,
    pick: (action) => {
      setMenu(null);
      runAction(action);
    },
    newDoc: async (first) => {
      creatingNew.current = false;
      setMenu(null);
      await newDoc(first);
    },
    openFile,
    save: async (name) => (name ? wizardDone(`saveas:${name}`) : saveDocument()),
    discard: () => {
      setDirty(false);
      current.current.dirty = false;
    },
    close: async () => {
      setMenu(null);
      if (isScratch) setView("home");
      else await closeDocument();
    },
    addPage,
    selectPage: (i) => {
      setDoc((d) => ({ ...d, active: Math.max(0, Math.min(d.pages.length - 1, i)) }));
      setView("doc");
    },
    go: async (to) => {
      setMenu(null);
      if (to === "home") {
        await writeNow();
        setView("home");
      } else if (to === "browse") {
        await refreshFiles();
        setView("browse");
      } else if (to === "current") await openCurrent();
      else await openScratchpad(to === "scratchGraph" ? "graphs" : "calculator");
    },
    graphEntry: (n) => {
      const num = n ?? (page?.kind === "graphs" ? nextFree(page, takenFns) : 1);
      setGraphs((g) => openEntry(g, num));
      return num;
    },
    setListColumn: (col, ch) => {
      if (page?.kind !== "lists") return "The active page isn't Lists & Spreadsheet.";
      if (ch.name && !/^[a-zA-Z]\w*$/.test(ch.name)) return "A list name is letters, digits and _, starting with a letter.";
      const cols = page.cols.slice();
      while (cols.length <= col) cols.push({ cells: [] });
      const c = { ...cols[col]! };
      if (ch.name !== undefined) {
        if (ch.name) c.name = ch.name.toLowerCase();
        else delete c.name;
      }
      if (ch.values) {
        c.cells = ch.values.map((v) => v.trim());
        delete c.formula;
        delete c.values;
      }
      if (ch.formula !== undefined) {
        if (ch.formula.trim()) c.formula = `=${ch.formula.trim().replace(/^=/, "")}`;
        else delete c.formula;
      }
      cols[col] = c;
      const next = { ...page, cols, edit: null };
      setLists(() => next);
      void recalcLists(next);
      return null;
    },
    setPython: (source) => setPython((p) => ({ ...p, source })),
    setGeometry: (fn) => setGeo(fn),
    writeNotes: async (paragraphs, replace) => {
      if (page?.kind !== "notes") return "The active page isn't Notes.";
      const paras: NotesRun[][] = [];
      for (const text of paragraphs) {
        const runs: NotesRun[] = [];
        // [[…]] is a maths box, worked out in order (so a box can use what an earlier one defined).
        const bits = text.split(/\[\[([\s\S]*?)\]\]/);
        for (let i = 0; i < bits.length; i++) {
          const bit = bits[i]!;
          if (i % 2) runs.push({ math: bit, out: (await notesEvaluate(bit, false)).text });
          else if (bit) runs.push(bit);
        }
        paras.push(runs);
      }
      update("notes", (p) => ({ ...p, paras: replace ? paras : [...p.paras, ...paras] }));
      return null;
    },
    runPython,
    fillDialog: (values) => {
      if (!wizard) return "No dialog with fields is open.";
      const key = (l: string) => l.toLowerCase().replace(/[:.…]/g, "").trim();
      const out = wizard.values.slice();
      for (const [label, raw] of Object.entries(values)) {
        const i = wizard.wizard.fields.findIndex((f) => key(f.label) === key(label));
        const f = wizard.wizard.fields[i];
        if (!f) return `No field "${label}". Fields: ${wizard.wizard.fields.map((x) => x.label).join(", ")}`;
        let v = String(raw);
        if (f.check) v = /^(yes|true|on|1)$/i.test(v) ? "Yes" : "No";
        else if (f.options && !f.free) {
          const o = f.options.find((x) => x.toLowerCase() === v.toLowerCase());
          if (!o) return `"${f.label}" is one of: ${f.options.join(", ")}`;
          v = o;
        }
        out[i] = v;
      }
      setWizard({ ...wizard, values: out, fresh: false });
      return null;
    },
    wizardDone,
    evaluate: async (text) => {
      const e = engine.current;
      if (!e) return { ok: false, text: "The engine isn't loaded." };
      try {
        const r = await evaluate(text, e.giac, { settings });
        return r.ok ? { ok: true, text: r.outputText } : { ok: false, text: r.error };
      } catch (err) {
        return { ok: false, text: (err as Error).message };
      }
    },
    screenshot: async () => {
      // The screen wherever it is now: the calculator, or AI mode's live card. Hidden, it has no width.
      const el = screenHost.firstElementChild as HTMLElement | null;
      const w = el?.getBoundingClientRect().width ?? 0;
      if (!el || w < 1) return null;
      // About 960 px wide: enough to read the screen's text, small enough to send each time.
      const blob = await screenPng(el, 960 / w);
      const bytes = new Uint8Array(await blob.arrayBuffer());
      let bin = "";
      for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
      return btoa(bin);
    },
    setHighlights: (hs) => {
      setHighlights(hs ?? []);
      say(highlightsSaid(latestDoc.current, hs ?? []));
    },
    analyzeGraph: async (spec) => {
      const d = latestDoc.current;
      const p = d.pages[d.active];
      if (p?.kind === "graphs") await runGraphEffect(p, { analyze: spec });
    },
  };
  // A tool holds its host across awaits: each call goes through to the newest render's, never a stale one.
  const agentProxy = useMemo(() => new Proxy({} as AgentHost, { get: (_, k) => agentHost.current[k as keyof AgentHost] }), []);
  const agent = useCallback(() => agentProxy, [agentProxy]);
  useEffect(() => registerWebMcp(agent), [agent]);
  // Which thread owns the open document. One calculator, many chats: a thread's document is set aside when it's left and put back when it's opened.
  const docBinding = useRef<DocBinding>(null!);
  const restoring = useRef<string | null>(null);
  docBinding.current = {
    snapshot: (thread) => {
      const c = current.current;
      return docOwnerRef.current === thread ? { doc: snapshot(), docPath: c.isScratch ? null : c.openPath } : null;
    },
    release: (thread, kept) => {
      if (docOwnerRef.current !== thread) return;
      own(null);
      const c = current.current;
      // Its changes are safe in the thread: the next chat can replace the document without asking to save it.
      if (kept && !c.isScratch && c.dirty) {
        setDirty(false);
        c.dirty = false;
        void writeNow();
      }
    },
    restore: async (t) => {
      if (docOwnerRef.current === t.id || restoring.current === t.id || (!t.doc && !t.docPath)) return;
      const c = current.current;
      if (!c.isScratch && c.dirty && docOwnerRef.current === null) {
        // The student's own unsaved document stays; the chat shows no document until it's saved or closed.
        toast(`Save or close "${c.doc.title}" to bring back this chat's document.`);
        return;
      }
      restoring.current = t.id;
      try {
        const file = t.docPath ? await files.getFile(t.docPath) : undefined;
        const r = restoreOf(t, file?.type === "file" ? file.doc : undefined);
        if (!r) return;
        await openSaved(r.saved, r.path, false, r.dirty);
        if (r.path) remember(r.path);
        own(t.id);
      } finally {
        restoring.current = null;
      }
    },
    claim: (thread) => {
      if (docOwnerRef.current !== thread) own(thread);
    },
    checkpoint: () => {
      const c = current.current;
      return {
        saved: snapshot(),
        path: c.isScratch ? null : c.openPath,
        scratch: c.isScratch,
        dirty: c.dirty,
        owner: docOwnerRef.current,
        view: view === "browse" ? "browse" : view === "doc" ? "doc" : "home",
        cached: pref<unknown>("current", null),
      };
    },
    clearHighlights: () => setHighlights([]),
    rollback: async (cp, thread) => {
      setHighlights([]);
      await openSaved(cp.saved, cp.path, cp.scratch, cp.dirty);
      // Home → Current goes back to what it was before the turn, not the document the turn made.
      setPref("current", cp.cached);
      own(cp.owner === thread ? thread : null);
      if (cp.scratch) await writeNow();
      if (cp.view !== "doc") {
        if (cp.view === "browse") await refreshFiles();
        setView(cp.view);
      }
    },
  };
  const binding = useCallback(() => docBinding.current, []);
  const assistant = useAssistant(agent, binding);
  // Back in AI mode with nothing open (a reload, say): the open chat's document comes back.
  useEffect(() => {
    if (ai === "immersive" && view !== "doc" && assistant.thread.doc) void docBinding.current.restore(assistant.thread);
  }, [ai, assistant.thread.id, Boolean(assistant.thread.doc)]); // eslint-disable-line react-hooks/exhaustive-deps

  // The screen lives in its own element, moved (never remounted) between the
  // calculator and AI mode's live view, where the agent's work is watched.
  const [screenHost] = useState(() => {
    const el = document.createElement("div");
    el.dataset.casScreenHost = "";
    el.className = "w-full";
    return el;
  });
  const [liveSlot, setLiveSlot] = useState<HTMLElement | null>(null);
  const onLiveSlot = useCallback((el: HTMLDivElement | null) => setLiveSlot(el), []);
  useLayoutEffect(() => {
    const to = liveSlot ?? screenBox.current;
    if (to && screenHost.parentElement !== to) to.appendChild(screenHost);
  });
  const pageNames = doc.pages.map((p, i) => `${pageLabel(doc, i)} ${PAGE_APPS[p.kind]}`);
  const docInfo = {
    open: ownsOpenDoc(docOwner, assistant.thread.id, view === "doc" || !isScratch),
    title: isScratch ? "Scratchpad" : doc.title,
    pages: pageNames,
    dirty: !isScratch && dirty,
    saved: !isScratch && Boolean(openPath),
    highlights: view === "doc" ? shownHighlights.length : 0,
  };
  const docActions: DocActions = {
    open: () => {
      setAi("panel");
      if (view !== "doc") void openCurrent();
    },
    download: () => runAction({ kind: "app", id: "fileDownload" }),
    save: () => void saveDocument(),
    clearHighlights: () => {
      setHighlights([]);
      say("Highlights cleared.");
    },
    // A page named in a reply ("1.2 Graphs"): that page, on the calculator.
    openPage: (i) => {
      agentHost.current.selectPage(i);
      setAi("panel");
    },
  };
  return (
    <>
    {/* On a wide window the calculator moves aside for the assistant rather than sitting under it; AI mode puts it away. */}
    <div className={cn(DEVICE_WIDTH, aiOpen && "ai-open", ai === "immersive" && "hidden")}>
      <header className="mb-4 flex items-center justify-between gap-3 px-1">
        <span className="text-[17px] font-semibold tracking-[-0.019em] text-ink">Axiom</span>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setAi((a) => (a === "panel" ? "off" : "panel"))}
            aria-expanded={aiOpen}
            className="flex h-8 items-center gap-1.5 rounded-full border border-white/[0.07] bg-white/[0.02] px-3 text-[13px] font-medium text-neutral-400 transition-[color,background-color,border-color,scale] duration-150 ease-out outline-none hover:border-white/15 hover:bg-white/[0.05] hover:text-neutral-100 focus-visible:ring-2 focus-visible:ring-focus/60 active:scale-[0.97] aria-expanded:border-white/15 aria-expanded:bg-white/[0.06] aria-expanded:text-neutral-100"
          >
            <Sparkles size={14} aria-hidden />
            Assistant
          </button>
          <EnginePill status={status} />
        </div>
      </header>
      <ScaleIn>
      <div
        ref={root}
        tabIndex={0}
        role="application"
        aria-roledescription="calculator"
        aria-label="CAS calculator"
        aria-describedby="cas-help"
        onKeyDown={onKeyDown}
        onPaste={onPaste}
        onMouseDown={(e) => {
          // A click in the Python editor keeps its own focus (and caret).
          if ((e.target as HTMLElement).closest("[data-py-editor]")) return;
          pointerFocus.current = true;
          root.current?.focus({ preventScroll: true });
        }}
        onFocus={() => setKeyboardFocus(!pointerFocus.current)}
        onBlur={() => {
          pointerFocus.current = false;
          setKeyboardFocus(false);
        }}
        className={cn(
          // One device body. Phones and narrow windows: the screen over the
          // keypad, like the handheld. Wide windows: the keypad beside a large
          // screen, both sized to fit the window's height.
          "rounded-[28px] border border-white/[0.07] bg-casBody p-[10px] shadow-[0_4px_24px_-4px_rgba(0,0,0,0.5),0_40px_80px_-32px_rgba(0,0,0,0.8),inset_0_1px_0_0_rgba(255,255,255,0.06)] outline-hidden lg:flex lg:flex-row-reverse lg:items-center lg:gap-5 lg:p-5",
          keyboardFocus && "ring-2 ring-focus ring-offset-4 ring-offset-bg",
        )}
        style={{ ["--axiom-text" as string]: TEXT_SCALE[setup.text] }}
      >
        <DefinedNames.Provider value={defined}>
          <p id="cas-help" className="sr-only">
            Type an expression and press Enter for the result, or Ctrl+Enter for a decimal. Up arrow goes back through
            earlier entries. Ctrl+M opens the menu, Ctrl+K the document menu and Ctrl+I adds a page; Ctrl+Left and
            Ctrl+Right change page. Results are read out.
          </p>
          <div role="status" aria-live="polite" className="sr-only">
            {said.text}
            {said.n % 2 ? "\u00a0" : ""}
          </div>
          {/* The screen fills the width, but no taller than the window leaves room for.
              Over the keypad (phones), it stays pinned under the nav while the keys
              scroll beneath it, except on a phone on its side, where it would fill the window. */}
          <div
            ref={screenBox}
            data-cas-screen
            className="sticky top-2 z-10 overflow-hidden rounded-[4px] ring-1 ring-black lg:static lg:min-w-0 lg:max-w-[calc(var(--cas-h)*4/3)] lg:flex-1 [@media(max-height:499px)]:static"
          >
            {createPortal(
            <Screen
              variant={view === "new" ? "doc" : view}
              pageLabels={view === "doc" ? doc.pages.map((_, i) => pageLabel(doc, i)) : []}
              active={doc.active}
              title={view === "home" ? "Axiom" : view === "browse" ? "My Documents" : view === "new" ? "Untitled" : `${dirty ? "*" : ""}${doc.title}`}
              onClose={() => {
                // X closes the document (Save / No / Cancel first when it has changes) and goes back
                // to where it was opened from; My Documents goes Home.
                if (view === "doc") leaveDocument();
                else {
                  // New's page menu was already past the save question: just go back.
                  setMenu(null);
                  creatingNew.current = false;
                  setView(view === "new" ? backTo.current : "home");
                }
              }}
              angle={settings.angle === "rad" ? "RAD" : "DEG"}
              onSelectPage={(i) => setDoc((d) => ({ ...d, active: i }))}
              onToggleAngle={() => {
                const next: Settings = { ...settings, angle: settings.angle === "rad" ? "deg" : "rad" };
                setSettings(next);
                void engine.current?.applySettings(next);
              }}
              overlay={
                <>
                  {/* Dialogs first: a panel, the catalog or the palette opened over one draws on top. */}
                  {wizard && (
                    <WizardDialog
                      state={wizard}
                      onFocus={(i) => setWizard((w) => (w ? { ...w, focus: i, fresh: true } : w))}
                      onOk={() => handleKey({ k: "enter" })}
                      onCancel={() => setWizard(null)}
                      onArrow={(i) =>
                        setWizard((w) => (w ? (wizardKeyPress({ ...w, focus: i }, { k: "right" }).state ?? w) : w))
                      }
                    />
                  )}
                  {finance && (
                    <FinanceSolver
                      state={finance}
                      onFocus={(i) => setFinance((f) => (f ? { ...f, focus: i, fresh: true } : f))}
                    />
                  )}
                  <AnimatePresence>
                  {menu && (
                    <MenuOverlay
                      key="menu"
                      menu={menu.items}
                      state={menu.state}
                      onPick={pickMenu}
                      onHover={(path) => setMenu((m) => (m ? { ...m, state: { ...m.state, path } } : m))}
                    />
                  )}
                  </AnimatePresence>
                  {catalog && (
                    <CatalogOverlay state={catalog} onChange={setCatalog} onKey={handleKey} onResult={catalogResult} />
                  )}
                  {palette !== null && (
                    <TemplatePalette
                      index={palette}
                      onPick={(i) => {
                        const r = pickCell(i);
                        setPalette(r.index);
                        if (r.insert) pageKey({ k: "template", id: r.insert });
                        if (r.wizard) setWizard(openWizard(r.wizard));
                      }}
                    />
                  )}
                  {error && <ErrorDialog message={error} onClose={() => setError(null)} />}
                  {confirm && (
                    <MessageDialog
                      title={confirm.title}
                      lines={confirm.lines}
                      onClose={() => {
                        setConfirm(null);
                        confirm.ok();
                      }}
                      onCancel={confirm.title === "Status" || confirm.lines[0]?.startsWith("This") ? undefined : () => setConfirm(null)}
                      buttons={confirm.buttons?.map((b) => ({
                        label: b.label,
                        run: () => {
                          setConfirm(null);
                          b.run();
                        },
                      }))}
                    />
                  )}
                  {warning && <MessageDialog title="Warning" lines={warning} onClose={() => setWarning(null)} />}
                  {sliderPrompt && (
                    <SliderPrompt
                      ask={sliderPrompt}
                      onToggle={(i) =>
                        setSliderPrompt((a) => a && { ...a, focus: i, on: a.on.map((v, k) => (k === i ? !v : v)) })
                      }
                      onAnswer={(yes) => {
                        if (yes) createSliders(sliderPrompt.names.filter((_, i) => sliderPrompt.on[i]));
                        setSliderPrompt(null);
                      }}
                    />
                  )}
                </>
              }
            >
              {view === "home" && <HomeScreen sel={homeSel} hasRecent={recent.length > 0} hasCurrent={!isScratch || Boolean(pref<Cached | null>("current", null))} onPick={(s, act) => {
                setHomeSel(s);
                homeAction(act);
              }} />}
              {view === "browse" && (
                <BrowseScreen
                  rows={rows}
                  state={browse}
                  onSelect={(i) => setBrowse((b) => ({ ...b, sel: i }))}
                  onOpen={(i) => {
                    const r = rows[i];
                    if (!r) return;
                    setBrowse((b) => ({ ...b, sel: i, ...(r.folder ? { open: b.open.includes(r.path) ? b.open.filter((p) => p !== r.path) : [...b.open, r.path] } : {}) }));
                    if (!r.folder) void openFile(r.path);
                  }}
                />
              )}
              {view === "doc" && page?.kind === "lists" && <ListsApp page={page} highlights={pageHighlights} onSelect={(sel) => setLists((p) => ({ ...p, sel, edit: null }))} />}
              {view === "doc" && page?.kind === "notes" && (
                <NotesApp
                  page={page}
                  apiRef={notesApi}
                  onChange={(paras) => update("notes", (p) => ({ ...p, paras }))}
                  evaluate={notesEvaluate}
                />
              )}
              {view === "doc" && page?.kind === "datastats" && (
                <DataStatsApp
                  page={page}
                  giac={engine.current?.giac ?? null}
                  ready={status === "ready" || status === "busy"}
                  toGiac={(text) => translate(parse(text), settings).giac}
                  onAxis={(axis) => runAction({ kind: "app", id: `dsAxis:${axis}` })}
                  onMovable={(m, b) => setData((p) => (p.movable ? { ...p, movable: { ...p.movable, m, b } } : p))}
                  onWindow={(w) => (dataWindow.current = w)}
                />
              )}
              {view === "doc" && page?.kind === "geometry" && <GeometryApp page={page} highlights={pageHighlights} onChange={setGeo} onError={setError} onAsk={askGeoAmount} />}
              {view === "doc" && page?.kind === "unsupported" && <UnsupportedApp page={page} />}
              {view === "doc" && page?.kind === "python" && (
                <PythonEditor
                  page={page}
                  onChange={(source) => setPython((p) => ({ ...p, source }))}
                  editorRef={(el) => {
                    pyEditor.current = el;
                  }}
                />
              )}
              {view === "doc" && page?.kind === "pyshell" && (
                <>
                  <PythonShell page={page} prompt={py.prompt} status={py.status} />
                  {/* The drawing steps aside while input() waits for an answer in the Shell. */}
                  {py.canvas && py.prompt === null && <PythonCanvas ops={py.canvas} />}
                </>
              )}
              {view === "doc" && page?.kind === "calculator" && (
                <CalculatorApp
                  page={page}
                  highlights={pageHighlights}
                  onPick={(entry, part, paste) =>
                    setCalc((p) => {
                      const q = { ...p, sel: { entry, part } };
                      return paste ? calcKey(q, { k: "enter" }).page : q;
                    })
                  }
                  onCaret={(entry, part, caret) => setCalc((p) => ({ ...p, sel: { entry, part, caret } }))}
                  onWarning={(entry) => setWarning(page.history[entry]?.warning ?? null)}
                  onCursor={(cursor) => setCalc((p) => ({ ...p, sel: null, edit: { row: p.edit.row, cursor } }))}
                  onSelect={(a, b) => setCalc((p) => ({ ...p, sel: null, edit: selectBetween(p.edit, a, b) }))}
                />
              )}
              {view === "doc" && page?.kind === "graphs" && (
                <GraphsApp
                  page={page}
                  highlights={pageHighlights}
                  giac={engine.current?.giac ?? null}
                  ready={status === "ready" || status === "busy"}
                  onSamples={(s) => (samples.current = s)}
                  onWindow={(window) => setGraphs((g) => ({ ...g, window }))}
                  onToolX={onToolX}
                  onToolFn={(n, pick) =>
                    setGraphs((g) =>
                      g.tool?.kind === "bounds"
                        ? { ...g, tool: { ...g.tool, fn: n, ...(pick ? { stage: "lower" as const, x: pick.x } : {}) } }
                        : g,
                    )
                  }
                  onConfirm={(x) => {
                    // Set the bound where the click landed, then confirm it as Enter does.
                    if (page.tool?.kind !== "bounds") return;
                    const { page: next, effect } = graphKey({ ...page, tool: { ...page.tool, x } }, { k: "enter" });
                    setGraphs(() => next);
                    if (effect) void runGraphEffect(next, effect);
                  }}
                  onEditFn={(n) => setGraphs((g) => openEntry(g, n))}
                  onEditRel={(n) => setGraphs((g) => openRelation(g, n))}
                  onEditPar={(n) => setGraphs((g) => openParametric(g, settings.angle === "deg", n))}
                  onDESettings={() => graphAction("deSettings")}
                  onSlider={(name, value, final) => {
                    setSlider(name, (sl) => ({ ...sl, value }));
                    assign(name, value, final);
                    if (final) say(`${name} = ${value}`);
                  }}
                  onSliderTyped={async (name, text) => {
                    // A number as typed, or worked out (π/4, 1/3); the range widens to take it.
                    let value = Number(text.replace(/−/g, "-"));
                    if (!Number.isFinite(value) && engine.current) {
                      try {
                        value = Number((await engine.current.giac(`evalf(${translate(parse(text), settings).giac})`)).trim());
                      } catch {
                        value = NaN;
                      }
                    }
                    if (!Number.isFinite(value)) {
                      setError("Error: Enter a number");
                      return;
                    }
                    setSlider(name, (sl) => ({ ...sl, value, min: Math.min(sl.min, value), max: Math.max(sl.max, value) }));
                    assign(name, value, true);
                    say(`${name} = ${value}`);
                  }}
                  onSliderPlace={(name, at) => setSlider(name, (sl) => ({ ...sl, at }))}
                  onSliderAction={(name, action) => {
                    const sl = page.sliders?.find((x) => x.name === name);
                    if (!sl) return;
                    if (action === "settings") setWizard(sliderSettings(sl));
                    else if (action === "animate") {
                      if (sl.animating) assign(name, sl.value, true);
                      setSlider(name, (x) => ({ ...x, animating: !x.animating }));
                    } else if (action === "minimize") setSlider(name, (x) => ({ ...x, minimized: !x.minimized }));
                    else setSlider(name, () => null);
                  }}
                  onCursor={(cursor) => setGraphs((g) => ({ ...g, edit: { row: g.edit.row, cursor } }))}
                  onSelect={(a, b) => setGraphs((g) => ({ ...g, edit: selectBetween(g.edit, a, b) }))}
                />
              )}
              {status === "loading" && (
                <Notice>
                  <TextShimmer className="text-casLabel">Loading</TextShimmer>
                </Notice>
              )}
              {status === "failed" && (
                <Notice>
                  The maths engine didn&apos;t load{engine.current?.lastError ? ` (${engine.current.lastError})` : ""}. Reload the page to try again.
                </Notice>
              )}
            </Screen>,
            screenHost,
            )}
          </div>
          <div className="@container lg:w-[min(24rem,calc(var(--cas-h)/2.1))] lg:shrink-0">
            <Keypad
              onKey={(k) => {
                haptic(k.k === "enter" ? "medium" : "light");
                handleKey(k);
              }}
              onKeys={(ks) => {
                haptic("light");
                handleKeys(ks);
              }}
              onPanel={(p) => {
                haptic("light");
                setMenu({ items: p.items, state: openMenu(p.cols) });
              }}
              onOpen={(o) => {
                haptic("light");
                if (o.open === "templates") setPalette(0);
                else setCatalog(openCatalog(o.tab));
              }}
            />
          </div>
        </DefinedNames.Provider>
      </div>
      </ScaleIn>
      <div className="mt-4 flex flex-col gap-3 px-1">
        <ScreenBar
          screen={() => screenHost.firstElementChild as HTMLElement | null}
          label={pageLabel(doc, doc.active)}
          onClear={clearAll}
        />
        <Legal />
      </div>
      <input
        ref={uploadInput}
        type="file"
        multiple
        accept=".tns,.zip,.py"
        className="hidden"
        onChange={(e) => {
          void upload(Array.from(e.target.files ?? []));
          e.target.value = "";
        }}
      />
      {dragging && (
        <div className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs">
          <div className="rounded-3xl border border-white/18 bg-[#181818] px-8 py-6 text-center text-[15px] font-medium text-neutral-200 shadow-[0_4px_24px_-4px_rgba(0,0,0,0.5)]">
            Drop files to add them to My Documents
            <div className="mt-1 text-[13px] text-neutral-500">.tns documents, .py programs, or a zip of a whole folder</div>
          </div>
        </div>
      )}
    </div>
    <AiPanel open={aiOpen} onClose={() => setAi("off")} onImmersive={() => setAi("immersive")} onSettings={() => setAiSettings(true)} assistant={assistant} doc={docActions} info={docInfo} />
    <AnimatePresence>
      {ai === "immersive" && (
        <AiMode
          key="ai-mode"
          assistant={assistant}
          info={docInfo}
          doc={docActions}
          onExit={() => setAi("panel")}
          onSettings={() => setAiSettings(true)}
          onLiveSlot={onLiveSlot}
          onSaveAs={async (name) => {
            wizardDone(`saveas:${name}`);
            await new Promise((r) => setTimeout(r, 300));
          }}
        />
      )}
    </AnimatePresence>
    <AssistantSettings open={aiSettings} onOpenChange={setAiSettings} config={assistant.config} setConfig={assistant.setConfig} />
    </>
  );
}

/** Whether Esc has something to cancel on the page (a selection, a tool, an entry line, a cell, a running program). */
function pageTakesEsc(page: Page | undefined, py: { status: PyStatus; canvas: DrawOp[] | null }): boolean {
  switch (page?.kind) {
    case "calculator":
      return page.sel !== null;
    case "graphs":
      return page.tool !== null || page.editing !== null;
    case "geometry":
      return Boolean(page.tool || page.sel);
    case "lists":
      return page.edit !== null;
    case "pyshell":
      return py.status === "running" || py.canvas !== null || page.input !== "";
    default:
      return false;
  }
}

const PAGE_APPS: Record<Page["kind"], string> = {
  calculator: "Calculator",
  graphs: "Graphs",
  lists: "Lists & Spreadsheet",
  datastats: "Data & Statistics",
  python: "Python",
  pyshell: "Python Shell",
  notes: "Notes",
  geometry: "Geometry",
  unsupported: "Unsupported",
};

/** The menu key in the Python editor and Shell. */
const PYTHON_MENU: Menu = [
  menuApp("Run", "pyRun"),
  {
    label: "Built-ins",
    items: [
      { label: "def function():", action: { kind: "insert", text: "def f(x):\n    return " } },
      { label: "if..", action: { kind: "insert", text: "if :\n    " } },
      { label: "for index in range(size):", action: { kind: "insert", text: "for i in range(10):\n    " } },
      { label: "while..", action: { kind: "insert", text: "while :\n    " } },
      { label: "print()", action: { kind: "insert", text: "print()" } },
      { label: "input()", action: { kind: "insert", text: "input()" } },
    ],
  },
  {
    label: "Modules",
    items: [
      { label: "from math import *", action: { kind: "insert", text: "from math import *\n" } },
      { label: "from random import *", action: { kind: "insert", text: "from random import *\n" } },
      { label: "from ti_system import *", action: { kind: "insert", text: "from ti_system import *\n" } },
      { label: "from ti_draw import *", action: { kind: "insert", text: "from ti_draw import *\n" } },
      { label: "import ti_plotlib as plt", action: { kind: "insert", text: "import ti_plotlib as plt\n" } },
    ],
  },
];
const SHELL_MENU: Menu = [menuApp("Clear History", "pyClear")];
