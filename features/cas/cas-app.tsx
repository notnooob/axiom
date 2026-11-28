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
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, MotionConfig } from "framer-motion";
import { Sparkles } from "lucide-react";
import { toast } from "sonner";
import { ScaleIn } from "@/src/components/amicro/scale-in";
import { TextShimmer } from "@/src/components/amicro/text-shimmer";
import { useWebHaptics } from "@/src/hooks/use-web-haptics";
import { cn } from "@/shared/lib/utils";
import { textBoxKey } from "./text-box";
import { historySaid, markSaid, menuSaid, pageSaid, toolSaid, wizardSaid } from "./a11y";
import { calcKey, isTemplateWizard, wizardInsert, wizardLinear } from "./calculator/calc-keys";
import { CalculatorApp } from "./calculator/calculator-app";
import { CasEngine, definedFunctions, definedNames, type EngineStatus } from "./engine/client";
import { definedSources, readDefinition } from "./engine/program";
import { fillRegion, groupIndex, groupWithNext, moveSplit, nextRegion, selectLayout, splitWith, swapApp, ungroup, unitOf, units } from "./state/layout";
import { deletePage, deleteProblem, movePage, renameProblem } from "./state/pages";
import { LayoutFrame } from "./screen/layout-frame";
import { PageSorter } from "./screen/page-sorter";
import { libraryDefinition, loadLibraries } from "./files/library";
import { DEFAULT_SETTINGS, evaluate, type Settings } from "./engine/evaluate";
import type { ProgramIO } from "./engine/eval-program";
import { formatFloat, unrounded } from "./engine/format";
import { analyze } from "./graphs/analyze";
import {
  graphKey,
  nextFree,
  deY,
  openDE,
  openEntry,
  openParametric,
  openPolar,
  openSequence,
  openSurface,
  startZoomBox,
  zoomBoxAt,
  openRelation,
  startTool,
  type GraphEffect,
} from "./graphs/graph-keys";
import { FunctionTable, GraphsApp, graphFunctions, type TableFn } from "./graphs/graphs-app";
import { deDefinition, pageDefinitions, polarXY } from "./graphs/definitions";
import { recognise } from "./graphs/mathdraw";
import { Graph3D, surfaceName } from "./graphs/graph3d";
import { classify as classifyConic, feature as conicFeature, type ConicFeature } from "./graphs/conics";
import { parseTerms, SEQ_TERMS, seqDefinition, seqName, seqTermsCommand } from "./graphs/sequence";
import { autoScale, fnName, parNames, relName, STANDARD, zoomed, type Mark, type Samples } from "./graphs/model";
import { Keypad } from "./keypad/keypad";
import { keyFromEvent, type Key } from "./keys";
import { isReservedName, parse, type Ast } from "./math/ast";
import { print } from "./math/print";
import { RENAME_IN, translate } from "./engine/translate";
import { DE_DEFAULTS, type RelationOp, type Slider } from "./state/document";
import { CARET, emptyEdit, insertText, selectBetween, selectedNodes, selection, selectionText, setRow, templateNode } from "./math/editor";
import { fromPaste as pasted, rowToLatex, rowToMathML } from "./math/latex";
import { DefinedNames } from "./math/render";
import { astToRow, chars, rowToLinear, type Row } from "./math/tree";
import { calculatorContextMenu, calculatorMenu } from "./menus/calculator-menu";
import { graphsContextMenu, graphsMenu } from "./menus/graphs-menu";
import { MenuOverlay, menuKeyPress, openMenu, type MenuState } from "./menus/menu";
import { type Menu, type MenuAction, type MenuItem, type WizardField } from "./menus/types";
import {
  CatalogOverlay,
  catalogKeyPress,
  catalogSaid,
  openCatalog,
  type CatalogResult,
  type CatalogState,
} from "./catalog/catalog";
import { PALETTE, paletteKeyPress, pickCell, TemplatePalette } from "./menus/palette";
import { FinanceSolver, financeKeyPress, financePick, newFinance, PMT_AT, type FinanceState } from "./finance/finance-solver";
import { openWizard, WizardDialog, wizardKeyPress, wizardPick, type WizardState } from "./menus/wizard";
import { download, screenPng } from "./screen/capture";
import { ADD_PAGE, BROWSE_MENU, DOC_MENU, SETTINGS_MENU } from "./menus/doc-menus";
import { app as menuApp } from "./menus/types";
import { BROWSE_START, BrowseScreen, browseKeyPress, targetFolder, visibleRows, type BrowseState } from "./files/browse";
import { HOME_START, HomeScreen, homeKeyPress, type HomeAction, type HomeSel } from "./files/home";
import * as files from "./files/store";
import { addFiles } from "./files/upload";
import { classify, decodeTns } from "./tns/decode";
import { droppedMessage, exportTns } from "./tns/export";
import { writeToDisk } from "./files/disk";
import { isShareFragment, LONG_LINK, readShareFragment, shareFragment } from "./files/share";
import { importTns } from "./tns/import";
import { ListsApp } from "./lists/lists-app";
import { listsContextMenu, listsMenu, PALETTE as COLOUR_PALETTE, type ListsMenuInfo } from "./lists/lists-menu";
import * as sheet from "./lists/sheet";
import { NotesApp, UnsupportedApp, type NotesApi } from "./notes/notes-app";
import { placedSliders } from "./notes/model";
import { notesContextMenu, notesMenu } from "./notes/notes-menu";
import { DataStatsApp } from "./data/data-app";
import { dataContextMenu, dataMenu } from "./data/data-menu";
import { dataKey, dataTakesEsc } from "./data/keys";
import { GeometryApp, geometryKey, selectionAction, SELECTION_ACTION, VIEW as GEO_VIEW, zoomed as zoomedGeo } from "./geometry/geometry-app";
import { COLOUR_OPTIONS } from "./graphs/colours";
import { geometryContextMenu, onGraphsPage, geometryMenu, type RecentItem } from "./geometry/geometry-menu";
import { freeNames } from "./geometry/numeric";
import { ASKS, nextId as nextGeoId, nextLabel as nextGeoLabel, remove as removeGeo, resolve as resolveGeo, transformWith, TOOL_NAMES as GEO_TOOLS, VAR_NAME, type GeoTool } from "./geometry/model";
import { NO_INFO, ONE_VAR, type DataInfo } from "./data/plot";
import type { GraphWindow } from "./graphs/model";
import { PythonCanvas, PythonEditor, PythonShell, type DrawOp } from "./python/python-app";
import { python, type PyStatus } from "./python/runner";
import type { StatResult } from "./engine/stats";
import { loadStats } from "./engine/eval-stats";
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
import { clearPrefs, clearTestPrefs, load, pref, save, setPref, type Saved } from "./state/persist";
import { blockedCommands, parsePtt, PTT, PTT_OPTIONS, pttLines, setPtt, type PressToTest } from "./state/ptt";
import { setBlocked } from "./engine/restrict";
import { PttPill } from "./screen/ptt-pill";
import { placeImage, shrinkImage } from "./data/image";
import { HandheldButton, HandheldPanel, type Outgoing } from "./link/handheld-panel";
import { connected as connectedHandheld } from "./link/manager";
import { baseName as handheldName } from "./link/handheld";
import { docDefaults, loadSetup, parseSetup, SETUP_OPTIONS, TEXT_SCALE, type Setup } from "./state/setup";
import { recordStep, undoStep, type UndoStacks } from "./state/undo";
import {
  bumpIds,
  editsContent,
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
  type GeoSettings,
  type ListsPage,
  type NotesRun,
  type Page,
  type PyShellPage,
  type ProgramPage,
  type PythonPage,
  type ShellLine,
} from "./state/document";
import { ProgramEditor } from "./program/program-app";
import { programMenu } from "./program/program-menu";
import * as prg from "./program/model";

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
/** Everything an evaluation defined, for the engine to replay. */
const definitionsOf = (r: { definitions?: string[]; definition?: string }) => [...(r.definitions ?? []), ...(r.definition ? [r.definition] : [])];

/** A page's sliders with `name`'s changed, or taken out when `change` gives null. */
const changeSlider = (list: Slider[] | undefined, name: string, change: (sl: Slider) => Slider | null) =>
  (list ?? []).flatMap((sl) => {
    if (sl.name !== name) return [sl];
    const next = change(sl);
    return next ? [next] : [];
  });

/** Slider Settings' result where the slider it replaces (`old`) was, else last. */
function placeSlider<T extends Slider>(list: T[] | undefined, old: string | undefined, sl: T): T[] {
  const at = (list ?? []).findIndex((x) => x.name === old);
  const rest = (list ?? []).filter((x) => x.name !== old && x.name !== sl.name);
  rest.splice(at < 0 ? rest.length : at, 0, sl);
  return rest;
}

/** A menu item's label by its action id, for the context menus' Recent ▸ (a tick dropped). */
function labelIn(menu: Menu, id: string): string | undefined {
  for (const it of menu) {
    if (it.action?.kind === "app" && it.action.id === id) return it.label.replace(/^✓ /, "");
    if (it.items) {
      const l = labelIn(it.items, id);
      if (l) return l;
    }
  }
  return undefined;
}

/** The Graphs & Geometry Settings dialog, one for both apps as on the handheld; Grid is greyed in Plane Geometry. */
function geoSettingsWizard(s: GeoSettings, grid: { value: string; enabled: boolean }, endValues: boolean, build: string) {
  const yn = (v: boolean | undefined, d: boolean) => ((v ?? d) ? "Yes" : "No");
  return openWizard({
    kind: "wizard",
    title: "Graphs & Geometry Settings",
    arrows: false,
    fields: [
      { label: "Display Digits:", value: (s.digits ?? "Float 3").replace(/^Float(\d)/, "Float $1"), options: GEO_DIGITS },
      { label: "Graphing Angle:", value: s.graphAngle ?? "Auto", options: ["Auto", "Radian", "Degree"] },
      { label: "Geometry Angle:", value: s.geoAngle ?? "Degree", options: ["Auto", "Radian", "Degree"] },
      { label: "Grid:", value: grid.value, options: ["No Grid", "Dot Grid", "Lined Grid"], disabled: !grid.enabled },
      { label: "Automatically hide plot labels", value: yn(s.hideLabels, false), check: true },
      { label: "Show axes end values", value: endValues ? "Yes" : "No", check: true },
      { label: "Show tool tips for function manipulation", value: yn(s.tooltips, false), check: true },
      { label: "Automatically find points of interest", value: yn(s.poi, true), check: true },
      { label: "Force geometric triangle angles to integers", value: yn(s.intAngles, false), check: true },
      { label: "Automatically label points", value: yn(s.labelPoints, false), check: true },
    ],
    build,
  });
}
/** A Geometry page's height for its width, as Window Settings gives it (−10 to 10 across is −6.67 to 6.67 up). */
const GEO_ASPECT = 2 / 3;
/** Display Digits' choices, as the settings list them. */
const GEO_DIGITS = ["Float", ...Array.from({ length: 12 }, (_, i) => `Float ${i + 1}`), ...Array.from({ length: 13 }, (_, i) => `Fix ${i}`)];
/** The settings back from the dialog's values (Display Digits … Automatically label points). */
function geoSettingsFrom(v: string[]): GeoSettings {
  const yes = (x: string | undefined) => x?.trim() === "Yes";
  return { digits: v[0]?.trim(), graphAngle: v[1]?.trim(), geoAngle: v[2]?.trim(), hideLabels: yes(v[4]), tooltips: yes(v[6]), poi: yes(v[7]), intAngles: yes(v[8]), labelPoints: yes(v[9]) };
}

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
const RECENT_MAX = 5;
/** Handheld Setup's Animations, for framer-motion; index.css does the same for CSS through data-motion. */
const MOTION = { System: "user", On: "never", Off: "always" } as const;

/** The Scratchpad always has a Calculator page and a Graphs page (A Calculate, B Graph). */
function withScratchPages(doc: CasDocument): CasDocument {
  const pages = doc.pages.slice();
  if (!pages.some((p) => p.kind === "calculator")) pages.unshift(newPage("calculator"));
  if (!pages.some((p) => p.kind === "graphs")) pages.push(newPage("graphs"));
  return { ...doc, title: "Scratchpad", pages };
}
const freshScratch = (): Saved => ({ doc: withScratchPages(newDocument()), settings: docDefaults(), definitions: [] });

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
  /** What a program has drawn (DrawLine …), over the page under a bar that says Finished once it's done; any key closes it. */
  const [basicDraw, setBasicDraw] = useState<{ ops: DrawOp[]; done: boolean } | null>(null);
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
  const scratchWarned = useRef(false);
  const [setup, setSetupState] = useState<Setup>(loadSetup);
  const [recent, setRecent] = useState<string[]>(() => pref<string[]>("recent", []));
  /** The Page Sorter's chosen page, while it's open. */
  const [sorter, setSorter] = useState<number | null>(null);
  /** Custom Split is moving a layout's divider. */
  const [splitting, setSplitting] = useState(false);
  /** An empty layout region waiting for the app chosen in the add-page menu. */
  const fillTarget = useRef<{ group: number; slot: number } | null>(null);
  /** Edit ▸ Copy and Cut: the latest render's (they read the selection). */
  const editOps = useRef({ copy: () => {}, cut: () => {} });
  /** A Notes page in another region gets its own handle, so the active one's isn't replaced. */
  const otherNotes = useRef<NotesApi | null>(null);
  const [confirm, setConfirm] = useState<{ title: string; lines: string[]; ok: () => void; buttons?: Choice[] } | null>(null);
  const [dragging, setDragging] = useState(false);
  const uploadInput = useRef<HTMLInputElement>(null);
  /** doc ▸ Insert ▸ Image's file picker (data/image.ts). */
  const imageInput = useRef<HTMLInputElement>(null);
  /** The next change to doc is an opening, not an edit: don't write it back. */
  const skipSave = useRef(false);
  /** New Document asked which app to start with: ADD_PAGE's answer makes the document. */
  const creatingNew = useRef(false);
  const rows = useMemo(() => visibleRows(fileList, browse), [fileList, browse]);
  const refreshFiles = useCallback(async () => setFileList(await files.all()), []);
  const hap = useCallback((t: Parameters<typeof haptic>[0]) => setup.haptics && haptic(t), [setup.haptics, haptic]);
  useEffect(() => {
    const root = document.documentElement;
    if (setup.motion === "System") delete root.dataset.motion;
    else root.dataset.motion = setup.motion.toLowerCase();
  }, [setup.motion]);

  // Python: the worker's state, the input() prompt waiting for an answer, and what a program has drawn.
  const [py, setPy] = useState<{ status: PyStatus; prompt: string | null; canvas: DrawOp[] | null }>({
    status: "off",
    prompt: null,
    canvas: null,
  });
  const pyEditor = useRef<HTMLTextAreaElement | null>(null);
  /** The Program Editor's text box, and where Find or Go to Line moved its caret from (Go Back). */
  const prgEditor = useRef<HTMLTextAreaElement | null>(null);
  const prgBack = useRef<number | null>(null);
  /** The Shell page the running program prints to. */
  const pyShell = useRef<number | null>(null);

  const restored = useRef(false);
  /** The Scratchpad's definitions are back in the engine (Start Up In waits for it before opening another document). */
  const startupReady = useRef<Promise<void>>(Promise.resolve());
  /** The problem whose definitions the engine holds now. */
  const shownProblem = useRef(1);
  /** The saved document's problem until that document is on screen (the first render still shows the default one). */
  const opening = useRef<number | null>(null);
  useEffect(() => {
    // Pick up the document from this browser's last visit, if there is one.
    const loaded = load();
    const saved = loaded ? { ...loaded, doc: withScratchPages(loaded.doc) } : null;
    const fresh = saved ? null : freshScratch();
    const e = new CasEngine(saved?.settings ?? fresh!.settings);
    engine.current = e;
    if (saved) {
      // The engine is given the active problem's definitions below: no swap on opening.
      shownProblem.current = problemOf(saved.doc.pages[saved.doc.active]);
      opening.current = shownProblem.current;
      setDoc(saved.doc);
      setSettings(saved.settings);
      startupReady.current = e.restore(saved.definitions).then(async () => {
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
    else {
      setDoc(fresh!.doc);
      setSettings(fresh!.settings);
    }
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
    if (c.isScratch) {
      // Told once a session: the Scratchpad keeps working, it just isn't kept.
      if (!save(snapshot()) && !scratchWarned.current) {
        scratchWarned.current = true;
        toast.error("The Scratchpad couldn't be saved: browser storage is full");
      }
    }
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
      if (pg.kind !== "geometry" || problemOf(pg) !== activeProblem || !pg.objects.some((o) => (o.kind === "measure" || o.kind === "calc") && o.store)) continue;
      const shapes = resolveGeo(pg.objects, { vars: Object.fromEntries((pg.sliders ?? []).map((sl) => [sl.name, sl.value])) });
      for (const o of pg.objects) {
        const s = shapes.get(o.id);
        if ((o.kind === "measure" || o.kind === "calc") && o.store && s?.t === "value" && Number.isFinite(s.value))
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
          else for (const d of definitionsOf(r)) e.remember(d);
        } catch (err) {
          setError(`Error: ${(err as Error).message}`);
        }
      }
      setDefined(definedNames(e.saved));
    }, 250);
    return () => clearTimeout(t);
  }, [storedGeo, activeProblem, status]);

  /**
   * The problem's variables a Geometry page's Calculate results and
   * conditions use (not its own sliders): read from the engine whenever the
   * problem's variables change, for the page to work them out as it moves.
   */
  const [geoEnv, setGeoEnv] = useState<Record<string, number>>({});
  const geoNeeds = useMemo(() => {
    // Every construction in the problem (a Graphs page's too, whose sliders are the problem's variables), so the assistant can read any page's values.
    const names = new Set<string>();
    for (const pg of doc.pages) {
      if (problemOf(pg) !== activeProblem) continue;
      const objects = pg.kind === "geometry" ? pg.objects : pg.kind === "graphs" ? (pg.geo?.objects ?? []) : [];
      for (const o of objects) {
        for (const src of [o.cond?.show, o.cond?.line, o.cond?.fill, o.kind === "calc" ? o.expr : undefined]) if (src) for (const n of freeNames(src)) names.add(n);
        if (o.kind === "calc") for (const v of Object.values(o.vars)) if (v.startsWith("=")) names.add(v.slice(1));
      }
    }
    // A Geometry page's own sliders win over these where they share a name (GeometryApp lays them over the top).
    return [...names].sort().join(",");
  }, [doc.pages, activeProblem]);
  useEffect(() => {
    if (status !== "ready" || !geoNeeds) return;
    let gone = false;
    void (async () => {
      const e = engine.current;
      if (!e) return;
      const out: Record<string, number> = {};
      for (const n of geoNeeds.split(",")) {
        if (!defined.has(n)) continue;
        try {
          const v = Number((await e.giac(`evalf(${RENAME_IN[n] ?? n})`)).trim());
          if (Number.isFinite(v)) out[n] = v;
        } catch {
          // Not a number: left out, so what uses it is undefined.
        }
      }
      if (!gone) setGeoEnv(out);
    })();
    return () => {
      gone = true;
    };
  }, [geoNeeds, defined, status]);

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
        if (r.ok) for (const d of definitionsOf(r)) e.remember(d);
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
        // An imported page's original XML no longer matches once what it holds is edited
        // (not when only its tool, selection or entry line changes).
        if ((next.kind === "graphs" || next.kind === "datastats" || next.kind === "notes" || next.kind === "geometry") && next.xml && editsContent(p, next)) next = { ...next, xml: undefined };
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
  /** A Graphs page's construction (Geometry ▸ tools on the graph), changed as a Geometry page would be. */
  const setGraphGeo = useCallback(
    (fn: (p: GeometryPage) => GeometryPage) =>
      update("graphs", (g) => {
        const r = fn(geoOfGraph(g));
        return { ...g, geo: { objects: r.objects, tool: r.tool ?? null, sel: r.sel ?? null, mode: r.mode ?? null, traced: r.traced, traceErased: r.traceErased, pinned: r.pinned } };
      }),
    [update],
  );
  /** Rotation and Dilation, once their object and centre are picked: the angle or scale factor. */
  const askGeoAmount = useCallback((tool: GeoTool, picked: string[]) => {
    const label = ASKS[tool];
    if (label)
      setWizard(
        openWizard({ kind: "wizard", title: GEO_TOOLS[tool], arrows: false, fields: [{ label, value: tool === "rotation" ? "90" : tool === "regpoly" ? "6" : "2" }], build: `geoamount:${tool}:${picked[0]}:${picked[1]}:{0}` }),
      );
  }, []);
  /** The window a Data & Statistics page is drawn in (its own, or the one fitting the data): what zoom works from. */
  const dataWindow = useRef<GraphWindow | null>(null);
  /** What the Data & Statistics page's lists turned out to be (text or numbers, which one is plotted), for its menu. */
  const dataInfo = useRef<DataInfo>(NO_INFO);
  /** A Lists formula waiting on Conflict Detected: the key that was entering it, and the letters asked about. */
  const listsConflict = useRef<{ key: Key; formula: string; names: string[] } | null>(null);
  /** Cells taken by Cut or Copy on a Lists page, rows of cells as typed, for Paste. */
  const listsClip = useRef<string[][] | null>(null);
  /** The Notes editor's commands, for the keypad, its menu and the assistant. */
  const notesApi = useRef<NotesApi | null>(null);
  /** A Notes maths box worked out with the problem's variables; what it defines is defined for the problem. */
  const notesEvaluate = useCallback(async (text: string, approx: boolean) => {
    const e = engine.current;
    if (!e) return { ok: false, text: "Error: The engine isn't loaded" };
    try {
      const r = await evaluate(text, e.giac, { settings: current.current.settings, approx });
      if (!r.ok) return { ok: false, text: r.error };
      for (const d of definitionsOf(r)) e.remember(d);
      setDefined(definedNames(e.saved));
      return { ok: true, text: r.outputText, warn: r.warning?.text.join(" ") };
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

  /**
   * A running program's Request and Text: the dialog waits for the student,
   * and closing it any other way than OK is a Break, as on the handheld.
   */
  const asking = useRef<((v: string | null) => void) | null>(null);
  const telling = useRef<(() => void) | null>(null);
  const programIO = useMemo<ProgramIO>(
    () => ({
      request: (prompt, text) =>
        new Promise<string | null>((resolve) => {
          asking.current = resolve;
          setWizard(openWizard({ kind: "wizard", title: text ? "Request String" : "Request", arrows: false, fields: [{ label: prompt || "Value:", value: "" }], build: "request:{0}" }));
        }),
      message: (text) =>
        new Promise<void>((resolve) => {
          telling.current = resolve;
          setWarning([text]);
        }),
      draw: (step) => setBasicDraw((d) => ({ ops: [...(d && !d.done ? d.ops : []), step as DrawOp], done: false })),
    }),
    [],
  );
  useEffect(() => {
    if (wizard || !asking.current) return;
    const answer = asking.current;
    asking.current = null;
    answer(null);
  }, [wizard]);
  useEffect(() => {
    if (warning || !telling.current) return;
    const done = telling.current;
    telling.current = null;
    done();
  }, [warning]);

  /** Put a line in the Calculator's entry line, replacing what's there, with the cursor at CARET if it has one. */
  const setEntry = useCallback((text: string) => setCalc((p) => ({ ...p, edit: insertText(emptyEdit(), text), sel: null })), [setCalc]);

  /** Refresh Libraries: every LibPub and LibPriv object in MyLib, defined here as lib\obj. */
  const refreshLibraries = useCallback(async () => {
    const e = engine.current;
    if (!e) return;
    const objs = await loadLibraries();
    let n = 0;
    for (const o of objs) {
      const siblings = objs.filter((x) => x.lib === o.lib).map((x) => x.def.name);
      const r = await evaluate(libraryDefinition(o, siblings), e.giac, { settings: current.current.settings });
      if (!r.ok) continue;
      for (const d of definitionsOf(r)) e.remember(d);
      n++;
    }
    setDefined(definedNames(e.saved));
    toast(n ? `${n} library object${n === 1 ? "" : "s"} ready to use as library\\name.` : "No library objects found in My Documents/MyLib.");
  }, []);

  /**
   * A Program Editor page for this text: the one already open for the name
   * if there is one; otherwise beside the page, as the handheld opens it (in
   * place of an editor showing a program that's stored as it is).
   */
  const openProgram = useCallback((o: { name: string; source: string; stored?: string; readOnly?: boolean; caret?: number }) => {
    const pageOf = (d: CasDocument) => d.pages.findIndex((p) => p.kind === "program" && p.name === o.name && problemOf(p) === problemOf(d.pages[d.active]));
    const place = { kind: "program" as const, id: newId(), name: o.name, source: o.source, stored: o.stored, readOnly: o.readOnly || undefined };
    setDoc((d) => {
      const at = pageOf(d);
      if (at >= 0) return { ...d, active: at };
      const here = d.pages[d.active];
      if (here?.kind === "program" && (here.readOnly || here.source === here.stored)) {
        const pages = d.pages.slice();
        pages[d.active] = { ...place, id: here.id, problem: here.problem };
        return { ...d, pages };
      }
      return splitWith(d, place);
    });
    prgBack.current = null;
    // The caret where the first statement goes (New), or at the start.
    setTimeout(() => {
      const el = prgEditor.current;
      if (!el) return;
      el.focus({ preventScroll: true });
      el.setSelectionRange(o.caret ?? 0, o.caret ?? 0);
    }, 60);
  }, []);

  /** The Program Editor's page, changed (its message goes with any change). */
  const setProgram = useCallback((fn: (p: ProgramPage) => ProgramPage) => update("program", fn), [update]);

  /** Select line `n` (counting every line from 1) in the editor. */
  const selectProgramLine = (n: number) => {
    const el = prgEditor.current;
    if (!el) return;
    const from = prg.lineStart(el.value, n);
    const end = el.value.indexOf("\n", from);
    el.focus({ preventScroll: true });
    el.setSelectionRange(from, end < 0 ? el.value.length : end);
  };

  /**
   * Check Syntax (& Store): the first line that doesn't read is selected and
   * named in an Error; otherwise the definition is stored in the problem and
   * the header says so. True when it was stored.
   */
  const storeProgram = useCallback(
    async (p: ProgramPage, store: boolean): Promise<boolean> => {
      const bad = prg.syntaxError(p.source);
      if (bad) {
        setProgram((q) => ({ ...q, status: bad.message.replace(/^Error: /, "") }));
        setTimeout(() => selectProgramLine(bad.line), 0);
        setError(bad.message);
        return false;
      }
      if (!store) {
        // Check Syntax on its own says so in a dialog, and leaves the header as it was.
        setConfirm({ title: "Check Syntax", lines: ["No syntax errors found"], ok: () => undefined });
        return true;
      }
      const e = engine.current;
      if (!e) return false;
      const r = await evaluate(p.source, e.giac, { settings: current.current.settings });
      if (!r.ok) {
        setProgram((q) => ({ ...q, status: r.error.replace(/^Error: /, "") }));
        setError(r.error);
        return false;
      }
      for (const d of definitionsOf(r)) e.remember(d);
      setDefined(definedNames(e.saved));
      const name = prg.nameOf(p.source) ?? p.name;
      setProgram((q) => ({ ...q, name, stored: p.source, status: `"${name}" stored successfully` }));
      return true;
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- selectProgramLine only reads the editor's ref
    [setProgram],
  );

  /** The Program Editor's dialogs, Recall Definition and Create Library Shortcut, once filled in. */
  const programWizard = useCallback(
    async (built: string) => {
      const e = engine.current;
      if (!e) return;
      const [kind, ...rest] = built.split(":");
      const arg = rest.join(":").trim();
      if (kind === "prgmnew") {
        const [name = "", type, access] = rest.map((s) => s.trim());
        if (!/^[A-Za-z][\w]*$/.test(name)) return setError("Error: A name is letters, digits and _, starting with a letter");
        if (definedNames(e.saved).has(name.toLowerCase())) return setError("Error: That name is already used in this problem");
        // The editor opens beside the page, with the caret on the empty line for the first statement.
        const source = prg.newSource(name.toLowerCase(), type === "Function" ? "Func" : "Prgm", (access ?? "None") as prg.LibraryAccess);
        // No * until it's changed, as on the handheld: the empty skeleton counts as unchanged.
        openProgram({ name: name.toLowerCase(), source, stored: source, caret: source.lastIndexOf("\n") });
        return;
      }
      if (kind === "prgmopen" || kind === "prgmview") {
        const def = definedSources(e.saved).get(arg);
        if (!def) return setError("Error: Not defined");
        const source = prg.sourceOf(def);
        openProgram({ name: def.name, source, stored: source, readOnly: kind === "prgmview" });
        return;
      }
      if (kind === "recalldef") {
        const def = definedSources(e.saved).get(arg);
        if (def) return setEntry(def.source);
        const fn = definedFunctions(e.saved).get(arg);
        const shown = fn ? `${arg}(${fn.params.join(",")})` : arg;
        const r = await evaluate(shown, e.giac, { settings: current.current.settings });
        if (!r.ok) return setError(r.error);
        setEntry(`Define ${shown}=${r.outputText}`);
        return;
      }
      const objs = await loadLibraries();
      if (kind === "libimport") {
        const [lib, name] = arg.split("\\");
        const o = objs.find((x) => x.lib === lib && x.def.name === name);
        if (!o) return setError("Error: Not found in the libraries");
        // A copy of the library's program in the editor, to store in this problem.
        const def = readDefinition(libraryDefinition(o, []).replace(`Define ${o.lib}.`, "Define "));
        if (!def) return setError("Error: Not found in the libraries");
        openProgram({ name: def.name, source: prg.sourceOf(def) });
        return;
      }
      if (kind === "libshortcut") {
        const [lib = "", prefix = "", priv] = rest.map((s) => s.trim().toLowerCase());
        if (!/^[a-z][a-z0-9]*$/.test(prefix)) return setError("Error: A shortcut is letters and digits, starting with a letter");
        const mine = objs.filter((o) => o.lib === lib && (o.def.access === "LibPub" || priv === "yes"));
        const siblings = objs.filter((o) => o.lib === lib).map((o) => o.def.name);
        let n = 0;
        for (const o of mine) {
          const r = await evaluate(libraryDefinition(o, siblings, prefix), e.giac, { settings: current.current.settings });
          if (!r.ok) continue;
          for (const d of definitionsOf(r)) e.remember(d);
          n++;
        }
        setDefined(definedNames(e.saved));
        toast(`${n} shortcut${n === 1 ? "" : "s"}: ${prefix}.name`);
      }
    },
    [setEntry, openProgram],
  );

  const runEvaluate = useCallback(
    async (p: CalculatorPage, approx: boolean) => {
      const e = engine.current;
      if (!e || busy.current) return;
      busy.current = true;
      const text = rowToLinear(p.edit.row);
      try {
        const res = await evaluate(text, e.giac, { settings, ans: lastAns.current ?? shownAnswer(p), approx, io: programIO });
        if (!res.ok) {
          setError(res.error);
          return;
        }
        if (res.settings) {
          setSettings(res.settings);
          void e.applySettings(res.settings);
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
          ...(res.display && { display: res.display }),
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
        setBasicDraw((d) => (d && !d.done ? { ...d, done: true } : d));
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
      setGraphs((g) => ({ ...g, sliders: changeSlider(g.sliders, name, change) })),
    [setGraphs],
  );

  const setDataSlider = useCallback(
    (name: string, change: (sl: Slider) => Slider | null) =>
      setData((p) => ({ ...p, sliders: changeSlider(p.sliders, name, change) })),
    [setData],
  );

  const setNotesSlider = useCallback(
    (name: string, change: (sl: Slider) => Slider | null) =>
      update("notes", (p) => ({ ...p, sliders: changeSlider(p.sliders, name, change) })),
    [update],
  );

  const setGeoSlider = useCallback(
    (name: string, change: (sl: Slider) => Slider | null) => setGeo((p) => ({ ...p, sliders: changeSlider(p.sliders, name, change) })),
    [setGeo],
  );

  /** A slider's value typed in place: a number, or worked out (π/4, 1/3); the range widens to take it. */
  const typedSlider = useCallback(
    async (name: string, text: string, set: (name: string, change: (sl: Slider) => Slider | null) => void) => {
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
      set(name, (sl) => ({ ...sl, value, min: Math.min(sl.min, value), max: Math.max(sl.max, value) }));
      assign(name, value, true);
      say(`${name} = ${value}`);
    },
    [settings, assign, say],
  );

  type SliderSetter = (name: string, change: (sl: Slider) => Slider | null) => void;
  /** A page's sliders wired up (Data & Statistics, Geometry, Notes): dragged, typed, and their menu's Settings, Minimize and Delete. */
  const sliderProps = (set: SliderSetter, sliders: Slider[] | undefined, onDelete?: (name: string) => void) => ({
    onSlider: (name: string, value: number, final: boolean) => {
      set(name, (sl) => ({ ...sl, value }));
      assign(name, value, final);
      if (final) say(`${name} = ${value}`);
    },
    onSliderTyped: (name: string, text: string) => void typedSlider(name, text, set),
    onSliderAction: (name: string, action: string) => {
      const sl = sliders?.find((x) => x.name === name);
      if (!sl) return;
      if (action === "settings") setWizard(sliderSettings(sl));
      else if (action === "minimize") set(name, (x) => ({ ...x, minimized: !x.minimized }));
      else if (action === "delete") {
        set(name, () => null);
        onDelete?.(name);
      }
    },
  });

  /** Insert Slider: Slider Settings for the first free name (v1, v2 …), not one the problem or the page already uses. */
  const newSlider = (own: Slider[] | undefined) => {
    const taken = new Set([...defined, ...(own ?? []).map((sl) => sl.name)]);
    let n = 1;
    while (taken.has(`v${n}`)) n++;
    setWizard(sliderSettings(null, `v${n}`));
  };

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
        const { n, texts, polar } = effect.parametric;
        // A polar curve r(θ) is drawn as x = r·cos θ, y = r·sin θ (polarXY), its θ range in the place of t's.
        const xy = polar ? polarXY(texts[0]!) : null;
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
            parDraft: { field: 0, rows: texts.map(rowOf), polar },
            edit: { row: rowOf(texts[0]!), cursor: { path: [], index: rowOf(texts[0]!).length } },
          }));
        };
        let defs: string[];
        let range: number[];
        try {
          const [xText, yText] = xy ?? [texts[0]!, texts[1]!];
          defs = [
            `${parNames(p.id, n)[0]}(t):=${translate(parse(xText), settings).giac}`,
            `${parNames(p.id, n)[1]}(t):=${translate(parse(yText), settings).giac}`,
          ];
          range = [];
          for (const t of texts.slice(polar ? 1 : 2))
            range.push(Number((await e.giac(`evalf(${translate(parse(t), settings).giac})`)).trim()));
        } catch {
          fail("Error: Syntax");
          return;
        }
        const [tmin, tmax, tstep] = range as [number, number, number];
        if (![tmin, tmax, tstep].every(Number.isFinite) || tmax <= tmin || tstep <= 0) {
          fail(polar ? "Error: Invalid θ range" : "Error: Invalid t range");
          return;
        }
        for (const d of defs) {
          if (/error/i.test(await e.giac(d))) {
            fail("Error: Invalid expression");
            return;
          }
          e.remember(d);
        }
        say(polar ? `Plotted r${n}(θ)=${texts[0]}` : `Plotted x${n}(t)=${texts[0]}, y${n}(t)=${texts[1]}`);
        offerSliders(polar ? texts.slice(0, 1) : texts.slice(0, 2), polar ? ["θ"] : ["t"], p);
        setGraphs((g) => {
          const rest = (g.parametrics ?? []).filter((c) => c.n !== n);
          const curve = {
            n,
            x: texts[0]!,
            y: polar ? "" : texts[1]!,
            xRow: rowOf(texts[0]!),
            yRow: polar ? [] : rowOf(texts[1]!),
            tmin,
            tmax,
            tstep,
            ...(polar ? { polar } : {}),
          };
          return { ...g, parametrics: [...rest, curve].sort((a, b) => a.n - b.n) };
        });
      } else if ("surface" in effect) {
        // z1(x, y): a function of x and y for the 3D view.
        const { n, text } = effect.surface;
        let def: string;
        try {
          def = `${surfaceName(p.id, n)}(x,y):=${translate(parse(text), settings).giac}`;
        } catch {
          setError("Error: Syntax");
          setGraphs((g) => openSurface(g, n));
          return;
        }
        if (/error/i.test(await e.giac(def))) return setError("Error: Invalid expression");
        e.remember(def);
        say(`Plotted z${n}(x,y)=${text}`);
        const row = (() => {
          try {
            return astToRow(parse(text));
          } catch {
            return chars(text);
          }
        })();
        setGraphs((g) => ({ ...g, surfaces: [...(g.surfaces ?? []).filter((s) => s.n !== n), { n, text, row }].sort((a, b) => a.n - b.n) }));
      } else if ("sequence" in effect) {
        // u1(n) = f(n, u1(n−1), …), its initial terms, and the n range: an engine function and the page's entry.
        const { n, texts } = effect.sequence;
        const rowOf = (t: string): Row => {
          try {
            return astToRow(parse(t));
          } catch {
            return chars(t);
          }
        };
        const fail = (msg: string) => {
          setError(msg);
          setGraphs((g) => ({ ...g, editing: n, entryKind: "seq", parDraft: { field: 0, rows: texts.map(rowOf) }, edit: { row: rowOf(texts[0]!), cursor: { path: [], index: rowOf(texts[0]!).length } } }));
        };
        const value = async (t: string) => Number((await e.giac(`evalf(${translate(parse(t), settings).giac})`)).trim());
        let def: { def: string; depth: number };
        const init: number[] = [];
        const range: number[] = [];
        try {
          def = seqDefinition(p.id, n, texts[0]!, settings);
          for (const t of (texts[1] ?? "").split(",").filter((x) => x.trim())) init.push(await value(t));
          for (const t of texts.slice(2, 5)) range.push(await value(t?.trim() ? t : "1"));
        } catch (err) {
          fail(err instanceof Error && err.message.startsWith("Error") ? err.message : "Error: Syntax");
          return;
        }
        const [nmin, nmax, nstep] = range as [number, number, number];
        if (![nmin, nmax, nstep].every(Number.isInteger) || nmax < nmin || nstep < 1) return fail("Error: Invalid n range");
        if (init.length < def.depth) return fail(`Error: Needs ${def.depth} initial term${def.depth === 1 ? "" : "s"}`);
        if (init.some((v) => !Number.isFinite(v))) return fail("Error: Initial terms must be numbers");
        if (/error/i.test(await e.giac(def.def))) return fail("Error: Invalid expression");
        e.remember(def.def);
        say(`Plotted u${n}(n)=${texts[0]}`);
        setGraphs((g) => {
          const rest = (g.sequences ?? []).filter((s) => s.n !== n);
          const s = { n, rhs: texts[0]!, row: rowOf(texts[0]!), init: texts[1] ?? "", initValues: init, depth: def.depth, nmin, nmax, nstep };
          return { ...g, sequences: [...rest, s].sort((a, b) => a.n - b.n) };
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
          other,
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
          return { ok: true, text: r.outputText, definitions: definitionsOf(r) };
        } catch {
          return { ok: false, text: "Error", definitions: [] };
        }
      };
      // A procedure's column (=OneVar(a[],1)): its results as the latest run left them, each as a cell shows it.
      const statValues = async () => {
        const store = await loadStats(e.giac).catch(() => null);
        if (!store) return null;
        const cell = (v: StatResult["rows"][number][1]): string => {
          if (typeof v === "string") return `"${v}"`;
          if (typeof v === "number") return Number.isFinite(v) ? formatFloat(v, settings.digits) : "undef";
          // A matrix [[1,2],[3,4]], or a list {1,2}.
          return Array.isArray(v[0]) ? `[${(v as number[][]).map((r) => `[${r.map((x) => cell(x)).join(",")}]`).join(",")}]` : `{${(v as number[]).map((x) => cell(x)).join(",")}}`;
        };
        return store.rows.map(([, v]) => cell(v));
      };
      const r = await sheet.recalc(p, run, statValues);
      for (const d of r.definitions) e.remember(d);
      setDefined(definedNames(e.saved));
      updatePage(p.id, (q) => (q.kind === "lists" ? { ...q, cols: r.page.cols } : q));
    },
    [settings, updatePage],
  );

  /** The handheld's Data Loss question before something overwrites a column. */
  const askDataLoss = (ok: () => void, cancel: () => void = () => undefined) =>
    setConfirm({
      title: "Data Loss",
      lines: ["This operation may overwrite data in the current column(s). Do you wish to proceed?"],
      ok: () => undefined,
      buttons: [
        { label: "OK", run: ok },
        { label: "Cancel", run: cancel },
      ],
    });

  /** What a spreadsheet key asks of the shell: an error, a recalculation, or Data Loss's question first. */
  const listsEffect = useCallback(
    (next: ListsPage, effect: sheet.ListsEffect) => {
      if (!effect) return;
      if ("error" in effect) return setError(effect.error);
      if ("dataLoss" in effect) {
        const { ok, cancel } = effect.dataLoss;
        return askDataLoss(
          () => {
            setLists(() => ok);
            void recalcLists(ok);
          },
          () => setLists(() => cancel),
        );
      }
      void recalcLists(next);
    },
    [recalcLists, setLists],
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
      if (key.k === "text" || key.k === "paste") el.setRangeText(key.text, a, b, "end");
      else if (key.k === "enter") {
        // New lines keep the indent, and go one deeper after a colon.
        const line = value.slice(value.lastIndexOf("\n", a - 1) + 1, a);
        el.setRangeText(`\n${/^\s*/.exec(line)![0]}${/:\s*$/.test(line) ? "    " : ""}`, a, b, "end");
      } else if (key.k === "tab") el.setRangeText("    ", a, b, "end");
      else if (textBoxKey(el, key) !== "edit") return;
      const text = el.value;
      setPython((p) => ({ ...p, source: text }));
    },
    [setPython],
  );

  /** The keypad's keys and the menu's inserts in the Program Editor; the keyboard types in its text box itself. */
  const prgEdit = useCallback(
    (key: Key) => {
      const el = prgEditor.current;
      if (!el || el.readOnly) return;
      const { selectionStart: a, selectionEnd: b } = el;
      if (key.k === "text" || key.k === "paste") {
        // A menu's block (If…Then…EndIf) goes in a line at a time, with the caret where its mark is.
        const t = key.k === "text" ? prg.asLines(key.text) : key.text;
        const mark = t.indexOf(CARET);
        el.setRangeText(t.replaceAll(CARET, ""), a, b, "end");
        if (mark >= 0) el.setSelectionRange(a + mark, a + mark);
      } else if (key.k === "enter") el.setRangeText("\n", a, b, "end");
      else if (textBoxKey(el, key) !== "edit") return;
      const text = el.value;
      setProgram((p) => ({ ...p, source: text, status: undefined }));
    },
    [setProgram],
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
      } else if (page?.kind === "graphs" && key.k === "esc" && page.pick !== undefined && !page.tool && page.editing === null) {
        setGraphs((g) => ({ ...g, pick: undefined }));
      } else if (page?.kind === "graphs" && (page.geo?.tool || page.geo?.sel || page.geo?.mode) && geometryKey(geoOfGraph(page), key)) {
        // A Geometry tool (or a picked object) on the graph takes esc, del and the arrows first.
        const next = geometryKey(geoOfGraph(page), key)!;
        setGraphGeo(() => next);
      } else if (page?.kind === "graphs") {
        const { page: next, effect } = graphKey(page, key, takenFns);
        setGraphs(() => next);
        if (effect) void runGraphEffect(next, effect);
      } else if (page?.kind === "lists" && page.table) {
        // The function table scrolls a step at a time with ▲ ▼; the spreadsheet under it takes no keys.
        const t = page.table;
        const resized = t.resize ? sheet.tableResizeKey(page, key, tableColumns(page, problemFunctions(doc, problemOf(page))).length) : null;
        if (resized) setLists(() => resized);
        else if (key.k === "up" || key.k === "down") setLists((p) => ({ ...p, table: { ...t, start: t.start + (key.k === "down" ? t.step : -t.step) } }));
        // ◄ ► pick a function's column, for Delete Column, Choose… and Edit Expression.
        else if (key.k === "left" || key.k === "right") {
          const count = tableColumns(page, problemFunctions(doc, problemOf(page))).length;
          setLists((p) => ({ ...p, table: { ...t, col: Math.max(0, Math.min(count - 1, (t.col ?? 0) + (key.k === "left" ? -1 : 1))) } }));
        }
      } else if (page?.kind === "lists") {
        // A formula about to be entered that uses a letter which is both a column (x is column X) and a
        // variable asks which is meant first, as the handheld's Conflict Detected does.
        const formula = key.k === "enter" || key.k === "up" || key.k === "down" ? sheet.editingFormula(page) : null;
        const conflicts = formula ? sheet.formulaConflicts(formula, (n) => defined.has(n)) : [];
        if (formula && conflicts.length) {
          listsConflict.current = { key, formula, names: conflicts };
          setWizard(
            openWizard({
              kind: "wizard",
              title: "Conflict Detected",
              note: `=${formula}`,
              arrows: false,
              fields: conflicts.map((n) => ({ label: `${n}: Column or Variable?`, value: "Column Reference", options: ["Column Reference", "Variable Reference"], stacked: true })),
              build: `listsconflict:${conflicts.map((_, i) => `{${i}}`).join(":")}`,
            }),
          );
          return;
        }
        const { page: next, effect } = sheet.listsKey(page, key);
        setLists(() => next);
        listsEffect(next, effect);
      } else if (page?.kind === "geometry") {
        const next = geometryKey(page, key);
        if (next) setGeo(() => next);
      } else if (page?.kind === "datastats") {
        const next = dataKey(page, key);
        if (next) setData(() => next);
      } else if (page?.kind === "notes") {
        notesApi.current?.key(key);
      } else if (page?.kind === "program") {
        prgEdit(key);
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
    [wizard, finance, page, defined, runEvaluate, runGraphEffect, setCalc, setGraphs, setLists, recalcLists, listsEffect, runPython, pyEdit, prgEdit, py, updatePage, shellPrint, takenFns],
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
      if (PTT?.noPython && (kind === "python" || kind === "pyshell")) {
        setError("Error: Python is disabled in Press-to-Test");
        return;
      }
      const target = fillTarget.current;
      fillTarget.current = null;
      setDoc((d) => {
        const pages = d.pages.slice();
        const page = newPage(kind, problemOf(d.pages[d.active]));
        // Its entry line starts on the problem's next free function number.
        if (page.kind === "graphs") page.editing = nextFree(page, takenFns);
        if (target) return fillRegion(d, target.group, target.slot, page);
        // After the whole of a page laid out with several apps, not between them.
        const u = units(d)[unitOf(d, d.active)];
        const at = u ? Math.max(...u.pages) + 1 : d.active + 1;
        pages.splice(at, 0, page);
        return { ...d, pages, active: at };
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
        const saved: Saved = { doc, settings: docDefaults(), definitions: [] };
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
        if (imported.lostObjects)
          toast(`${imported.lostObjects} Graphs & Geometry object${imported.lostObjects === 1 ? " was" : "s were"} built in a way Axiom can't follow yet, so ${imported.lostObjects === 1 ? "it's" : "they're"} left out. Downloading the .tns keeps ${imported.lostObjects === 1 ? "it" : "them"} until the page is edited.`);
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
      if (PTT?.noPython && first === "python") {
        setError("Error: Python is disabled in Press-to-Test");
        return;
      }
      const doc = newDocument(first, "Untitled");
      if (first === "python") doc.pages.push(newPage("pyshell"));
      await openSaved({ doc, settings: docDefaults(), definitions: [] }, null);
    },
    [openSaved],
  );

  /**
   * Save's second half for a document the installed app was opened with: the
   * file on the computer too (files/disk.ts). A .tns is only written once the
   * student has agreed, and never when pages would be lost from it.
   */
  const saveToComputer = useCallback(async (path: string, saved: Saved): Promise<void> => {
    const rec = await files.getFile(path);
    if (!rec?.handle || rec.disk === "no") return;
    const name = files.nameOf(path);
    let bytes: Uint8Array;
    if (/\.py$/i.test(name)) {
      const pys = saved.doc.pages.filter((p) => p.kind === "python");
      const py = pys.find((p) => p.file === name) ?? pys[0];
      if (!py) return;
      bytes = new TextEncoder().encode(py.source);
    } else {
      const r = exportTns(saved.doc, saved.settings, saved.definitions);
      if (r.dropped) {
        toast(`Saved in My Documents. ${name} on the computer wasn't changed: ${droppedMessage(r)?.replace(/; the rest is in the file\.$/, ".")}`);
        return;
      }
      bytes = r.bytes;
      if (rec.disk !== "yes") {
        const choice = await new Promise<"yes" | "no" | null>((resolve) =>
          setConfirm({
            title: "Save to Computer",
            lines: [
              `Also save the changes to ${name} on this computer?`,
              "",
              "Axiom's .tns writing is new: keep a copy if the file matters, in case TI's software can't open the result.",
            ],
            ok: () => resolve(null),
            buttons: [
              { label: "Yes", run: () => resolve("yes") },
              { label: "No", run: () => resolve("no") },
            ],
          }),
        );
        if (!choice) return;
        await files.patch(path, { disk: choice });
        if (choice === "no") return;
      }
    }
    try {
      if ((await writeToDisk(rec.handle, bytes)) === "denied") {
        toast(`Saved in My Documents. ${name} on the computer wasn't changed: the browser wasn't allowed to write to it.`);
        return;
      }
      await files.savedToDisk(path, bytes);
      toast.success(`Saved ${name} on the computer`);
    } catch (err) {
      toast.error(`Saved in My Documents, but couldn't write ${name} on the computer: ${(err as Error).message || "the browser refused"}`);
    }
  }, []);

  /**
   * Save's part for a document opened from the connected handheld (link/):
   * written back to it, under the same rules as a computer's file. Without
   * the handheld it's kept here and marked, to go next time.
   */
  const saveToHandheld = useCallback(async (path: string, saved: Saved): Promise<void> => {
    const rec = await files.getFile(path);
    if (!rec?.calc || rec.disk === "no") return;
    const name = handheldName(rec.calc);
    const h = connectedHandheld();
    if (!h) {
      await files.patch(path, { calcPending: true });
      toast(`Saved in My Documents. Connect the handheld and save again to update ${name} on it.`);
      return;
    }
    const r = exportTns(saved.doc, saved.settings, saved.definitions);
    if (r.dropped) {
      toast(`Saved in My Documents. ${name} on the handheld wasn't changed: ${droppedMessage(r)?.replace(/; the rest is in the file\.$/, ".")}`);
      return;
    }
    if (rec.disk !== "yes") {
      const choice = await new Promise<"yes" | "no" | null>((resolve) =>
        setConfirm({
          title: "Save to Handheld",
          lines: [`Also save the changes to ${name} on the handheld?`, "", "Axiom's .tns writing is new: keep a copy if the document matters, in case the handheld can't open the result."],
          ok: () => resolve(null),
          buttons: [
            { label: "Yes", run: () => resolve("yes") },
            { label: "No", run: () => resolve("no") },
          ],
        }),
      );
      if (!choice) return;
      await files.patch(path, { disk: choice });
      if (choice === "no") return;
    }
    const id = toast.loading(`Saving ${name} on the handheld…`);
    try {
      await h.write(rec.calc, r.bytes, (done, total) => toast.loading(`Saving ${name} on the handheld… ${Math.round((done / total) * 100)}%`, { id }));
      await files.savedToDisk(path, r.bytes);
      await files.patch(path, { calcPending: false });
      toast.success(`Saved ${name} on the handheld`, { id });
    } catch (err) {
      await files.patch(path, { calcPending: true });
      toast.error(`Saved in My Documents, but not on the handheld: ${(err as Error).message}`, { id });
    }
  }, []);

  /** Save: to the document's file, or Save As for one that hasn't been saved (or the Scratchpad). */
  const saveDocument = useCallback(
    /** Resolves false when the save failed; true once saved, or once Save As has been asked for (it runs `then` itself). */
    async (then?: () => void): Promise<boolean> => {
      const c = current.current;
      if (c.isScratch || !c.openPath) {
        afterSave.current = then ?? null;
        setWizard(openWizard({ kind: "wizard", title: "Save As", arrows: false, fields: [{ label: "File Name:", value: c.isScratch || c.doc.title === "Untitled" ? "" : c.doc.title }], build: "saveas:{0}" }));
        return true;
      }
      const saved = snapshot();
      try {
        await files.saveDoc(c.openPath, saved);
        setDirty(false);
        current.current.dirty = false;
        await writeNow();
        await refreshFiles();
      } catch (err) {
        // Storage full or IndexedDB unavailable: the document stays unsaved (and dirty), and New/Open/Close don't go ahead.
        toast.error(`Couldn't save: ${(err as Error).message || "the browser refused"}`);
        return false;
      }
      toast.success(`Saved ${files.nameOf(c.openPath)}`);
      await saveToComputer(c.openPath, saved);
      await saveToHandheld(c.openPath, saved);
      then?.();
      return true;
    },
    [snapshot, writeNow, refreshFiles, saveToComputer, saveToHandheld],
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
            { label: "Yes", run: () => void saveDocument(() => resolve(true)).then((ok) => ok || resolve(false)) },
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

  // Handheld Setup's Start Up In: Last Document opens what Home's 4 Current would, once the
  // Scratchpad has finished loading (opening sooner would mix its definitions into the document's).
  // StrictMode mounts twice: the first run is cancelled, and the second waits for the second engine.
  useEffect(() => {
    if (loadSetup().start !== "Last Document") return;
    let live = true;
    const cached = pref<Cached | null>("current", null);
    const go = () => {
      if (!live) return;
      if (cached?.saved?.doc?.pages?.length) void openSaved(cached.saved, cached.path, false, cached.dirty);
      else setView("doc");
    };
    startupReady.current.then(go, go);
    return () => {
      live = false;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // A shared link (#doc=…, files/share.ts) opens its document as a new, unsaved one:
  // on start-up once the Scratchpad has loaded, and when a link is opened in a tab that's already here.
  const openShared = useCallback(
    async (hash: string) => {
      const saved = readShareFragment(hash);
      // Off the address bar either way, so a reload doesn't open it again over the student's changes.
      history.replaceState(null, "", location.pathname + location.search);
      if (PTT) {
        toast.error(NO_FILES);
        return;
      }
      if (!saved) {
        toast.error("That link's document couldn't be read. It may have been cut short when it was sent.");
        return;
      }
      if (!(await leaveOk())) return;
      await openSaved(saved, null, false, true);
      toast(`Opened "${saved.doc.title}" from a link. Save it to keep it in My Documents.`);
    },
    [leaveOk, openSaved],
  );
  const openSharedRef = useRef(openShared);
  openSharedRef.current = openShared;
  useEffect(() => {
    let live = true;
    const go = () => {
      if (live && isShareFragment(location.hash)) void openSharedRef.current(location.hash);
    };
    startupReady.current.then(go, go);
    const onHash = () => {
      if (isShareFragment(location.hash)) void openSharedRef.current(location.hash);
    };
    window.addEventListener("hashchange", onHash);
    return () => {
      live = false;
      window.removeEventListener("hashchange", onHash);
    };
  }, []);

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

  /** A saved document as .tns bytes; pages that can't be written are added to `dropped` when it's given. */
  const tnsOf = useCallback((saved: Saved, dropped?: { dropped: number; droppedKinds: string[] }): Uint8Array => {
    const r = exportTns(saved.doc, saved.settings, saved.definitions);
    if (dropped) {
      dropped.dropped += r.dropped;
      for (const k of r.droppedKinds) if (!dropped.droppedKinds.includes(k)) dropped.droppedKinds.push(k);
    }
    return r.bytes;
  }, []);

  const downloadFile = useCallback(
    async (path: string) => {
      const rec = await files.getFile(path);
      if (!rec || rec.type !== "file") return;
      const name = files.nameOf(path);
      const lost = { dropped: 0, droppedKinds: [] as string[] };
      const bytes = rec.bytes && !rec.edited ? rec.bytes : rec.doc ? tnsOf(rec.doc, lost) : null;
      if (!bytes) return;
      download(new Blob([bytes as BlobPart]), /\.\w+$/.test(name) ? name : `${name}.tns`);
      const warn = droppedMessage(lost);
      if (warn) toast(warn);
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
        ...(PTT ? ["", "Press-to-Test is on", ...pttLines(PTT)] : []),
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

  /** Zoom – Data: a window round every scatter plot's and sequence's points, with a margin, as the handheld fits data. */
  const zoomToData = async () => {
    const e = engine.current;
    const g = page?.kind === "graphs" ? page : null;
    if (!e || !g) return;
    const pts: [number, number][] = [];
    const nums = (raw: string) => raw.trim().replace(/^(list)?\[|\]$/g, "").split(",").map(Number);
    for (const sc of g.scatters ?? []) {
      if (sc.hidden) continue;
      const xs = nums(await e.giac(`evalf(${translate(parse(sc.x), settings).giac})`));
      const ys = nums(await e.giac(`evalf(${translate(parse(sc.y), settings).giac})`));
      xs.forEach((x, i) => pts.push([x, ys[i]!]));
    }
    if (g.sequences?.length) {
      await e.giac(SEQ_TERMS);
      for (const s of g.sequences) {
        if (s.hidden) continue;
        parseTerms(await e.giac(seqTermsCommand(seqName(g.id, s.n), s.depth, s.initValues, s.nmin, s.nmax))).forEach((v, i) => pts.push([s.nmin + i, v]));
      }
    }
    const ok = pts.filter(([x, y]) => Number.isFinite(x) && Number.isFinite(y));
    if (!ok.length) return setError("Error: No data to zoom to: add a scatter plot or a sequence");
    const fit = (vs: number[]) => {
      let [lo, hi] = [Math.min(...vs), Math.max(...vs)];
      if (hi - lo < 1e-9) [lo, hi] = [lo - 1, hi + 1];
      const pad = (hi - lo) * 0.1;
      return [lo - pad, hi + pad] as const;
    };
    const [xmin, xmax] = fit(ok.map((p) => p[0]));
    const [ymin, ymax] = fit(ok.map((p) => p[1]));
    setGraphs((q) => ({ ...q, window: { xmin, xmax, ymin, ymax, xscl: autoScale(xmin, xmax), yscl: autoScale(ymin, ymax) }, marks: [] }));
  };

  /** The page's graphs by name (f1, rel1, x1 or r1, u1, s1, d1), for the Actions dialogs. */
  const graphList = (g: GraphsPage) => [
    ...g.functions.map((f) => ({ name: `f${f.n}`, kind: "fn" as const, n: f.n, hidden: f.hidden })),
    ...(g.relations ?? []).map((r) => ({ name: `rel${r.n}`, kind: "rel" as const, n: r.n, hidden: r.hidden })),
    ...(g.parametrics ?? []).map((c) => ({ name: `${c.polar ? "r" : "x"}${c.n}`, kind: "par" as const, n: c.n, hidden: c.hidden })),
    ...(g.sequences ?? []).map((s) => ({ name: `u${s.n}`, kind: "seq" as const, n: s.n, hidden: s.hidden })),
    ...(g.scatters ?? []).map((s) => ({ name: `s${s.n}`, kind: "scatter" as const, n: s.n, hidden: s.hidden })),
    ...(g.des ?? []).map((d) => ({ name: `d${d.n}`, kind: "de" as const, n: d.n, hidden: d.hidden })),
  ];

  /**
   * Geometry's Actions dialogs (Hide/Show, Attributes, Text, Coordinates and
   * Equations) on a construction: a Geometry page's, or a Graphs page's
   * when one of its objects is selected. wizardDone applies them to whichever
   * page is active.
   */
  /** The last menu items used on each app's pages, for the context menus' Recent ▸. */
  const recentUsed = useRef<Record<string, RecentItem[]>>({});
  const noteRecent = (p: Page, id: string) => {
    if (/^(geoColour|geoLink|varpick|geoZoom|geoTrace)/.test(id) && !id.startsWith("geoTool:")) return;
    const menu = p.kind === "geometry" ? geometryMenu(p) : p.kind === "graphs" ? graphsMenu({ axes: p.axes, entryLine: p.editing !== null, grid: p.grid, table: p.table, view: p.view }) : [];
    const label = labelIn(menu, id);
    if (!label) return;
    const list = (recentUsed.current[p.kind] ?? []).filter((r) => r.id !== id);
    recentUsed.current[p.kind] = [{ label, id }, ...list].slice(0, 9);
  };

  /** Set Conditions on an object: the Conditional Attributes dialog, its colour numbers listed as the handheld's Colors… shows them. */
  const geoConditions = (id: string) => {
    const o = (page?.kind === "geometry" ? page.objects : page?.kind === "graphs" ? (page.geo?.objects ?? []) : []).find((x) => x.id === id);
    if (!o) return;
    const c = o.cond ?? {};
    setWizard(
      openWizard({
        kind: "wizard",
        title: "Conditional Attributes",
        note: "Colors: 1 navy · 2 blue · 3 light blue · 4 green · 5 brown · 6 magenta · 7 red · 8 orange · 9 yellow · 10 white · 11–14 light to dark grey · 15 black",
        arrows: false,
        fields: [
          { label: "Show When:", value: c.show ?? "" },
          { label: "Line Color:", value: c.line ?? "", hint: "<Enter expression>" },
          { label: "Fill Color:", value: c.fill ?? "", hint: "<Enter expression>" },
        ],
        build: `geocond:${id}\u0001{0}\u0001{1}\u0001{2}`,
      }),
    );
  };

  const geoDialog = (which: "hide" | "attrs" | "text" | "label", p: GeometryPage) => {
    const ids = p.objects.map((o) => o.id);
    if (which === "text") {
      const v = p.view ?? GEO_VIEW;
      const at = (n: number) => String(Number(n.toFixed(2)));
      setWizard(openWizard({ kind: "wizard", title: "Text", arrows: false, fields: [{ label: "Text:", value: "" }, { label: "x:", value: at(v.x) }, { label: "y:", value: at(v.y) }], build: "geotext:{1}:{2}:{0}" }));
      return;
    }
    if (!ids.length) return setError("Error: No objects on this page");
    if (which === "hide") {
      setWizard(openWizard({ kind: "wizard", title: "Hide/Show", arrows: false, fields: p.objects.map((o) => ({ label: `Show ${o.id}`, value: o.hidden ? "No" : "Yes", check: true })), build: `geohide:${ids.join(",")}:${ids.map((_, i) => `{${i}}`).join(":")}` }));
      return;
    }
    if (which === "attrs") {
      const o = p.objects.find((x) => x.id === p.sel) ?? p.objects[0]!;
      const a = o.attrs;
      setWizard(
        openWizard({
          kind: "wizard",
          title: "Attributes",
          arrows: false,
          fields: [
            { label: "Object:", value: o.id, options: ids },
            { label: "Line Weight:", value: a?.weight ?? "Medium", options: ["Thin", "Medium", "Thick"] },
            { label: "Line Style:", value: a?.style ?? "Continuous", options: ["Continuous", "Dotted", "Dashed"] },
            { label: "Colour:", value: a?.colour ?? "Auto", options: COLOUR_OPTIONS },
          ],
          build: "geoattrs:{0}:{1}:{2}:{3}",
        }),
      );
      return;
    }
    // Coordinates and Equations: a point's coordinates, a line's or circle's equation.
    const shapes = resolveGeo(p.objects);
    const labelled = ids.filter((id) => {
      const t = shapes.get(id)?.t;
      return t === "pt" || t === "line" || t === "circle";
    });
    if (!labelled.length) return setError("Error: Coordinates and Equations needs a point, a line or a circle");
    const first = p.sel && labelled.includes(p.sel) ? p.sel : labelled[0]!;
    setWizard(openWizard({ kind: "wizard", title: "Coordinates and Equations", arrows: false, fields: [{ label: "Object:", value: first, options: labelled }], build: "geolabel:{0}" }));
  };

  /** Graphs ▸ Actions: true when the id was one of them. */
  const graphsActions = (id: string): boolean => {
    const g = page?.kind === "graphs" ? page : null;
    if (!g) return false;
    // With one of the page's geometry objects selected, these act on the construction rather than the graphs.
    if (g.geo?.sel && (id === "hideShow" || id === "attributes" || id === "coordinates")) {
      geoDialog(id === "hideShow" ? "hide" : id === "attributes" ? "attrs" : "label", geoOfGraph(g));
      return true;
    }
    const fns = g.functions.map((f) => `f${f.n}`);
    const needFns = () => (fns.length ? false : (setError("Error: No functions on this page"), true));
    // The graph picked for the context menu comes first in the dialogs.
    const picked = g.pick !== undefined && fns.includes(`f${g.pick}`) ? g.functions.find((f) => f.n === g.pick)! : g.functions[0];
    const w = g.window;
    const centre = (v: number) => String(Number(v.toPrecision(4)));
    if (id.startsWith("graphColour:")) {
      const hex = id.slice(12);
      setGraphs((q) => ({ ...q, functions: q.functions.map((f) => (f.n === q.pick ? { ...f, attrs: { ...f.attrs, colour: hex || undefined } } : f)) }));
      return true;
    }
    switch (id) {
      case "pointer":
        setGraphs((q) => ({ ...q, tool: null, zoomBox: undefined, mathDraw: undefined, selected: undefined, pathPlot: undefined }));
        return true;
      case "selectRegion":
        setGraphs((q) => ({ ...startZoomBox(q), zoomBox: { ...startZoomBox(q).zoomBox!, select: true } }));
        return true;
      case "selectImage":
        setError("Error: This page has no image to select");
        return true;
      case "selectGrid":
        setWizard(openWizard({ kind: "wizard", title: "Grid", arrows: false, fields: [{ label: "Grid:", value: { none: "No Grid", dot: "Dot Grid", line: "Lined Grid" }[g.grid], options: ["No Grid", "Dot Grid", "Lined Grid"] }], build: "gridtype:{0}" }));
        return true;
      case "hideShow": {
        const all = graphList(g).slice(0, 10);
        if (!all.length) return setError("Error: No graphs on this page"), true;
        setWizard(openWizard({ kind: "wizard", title: "Hide/Show", arrows: false, fields: all.map((x) => ({ label: `Show ${x.name}`, value: x.hidden ? "No" : "Yes", check: true })), build: `hideshow:${all.map((x) => x.name).join(",")}:${all.map((_, i) => `{${i}}`).join(":")}` }));
        return true;
      }
      case "attributes": {
        if (needFns()) return true;
        const a = picked!.attrs;
        setWizard(
          openWizard({
            kind: "wizard",
            title: "Attributes",
            arrows: false,
            fields: [
              { label: "Graph:", value: `f${picked!.n}`, options: fns },
              { label: "Line Weight:", value: a?.weight ?? "Medium", options: ["Thin", "Medium", "Thick"] },
              { label: "Line Style:", value: a?.style ?? "Continuous", options: ["Continuous", "Dotted", "Dashed"] },
              { label: "Colour:", value: a?.colour ?? "Auto", options: ["Auto", "Blue", "Red", "Green", "Orange", "Purple", "Teal", "Black"] },
            ],
            build: "attrs:{0}:{1}:{2}:{3}",
          }),
        );
        return true;
      }
      case "setConditions":
        if (needFns()) return true;
        setWizard(openWizard({ kind: "wizard", title: "Set Conditions", arrows: false, fields: [{ label: "Graph:", value: `f${picked!.n}`, options: fns }, { label: "Show when:", value: picked!.condition?.text ?? "", hint: "a>0 (blank: always)" }], build: "condition:{0}:{1}" }));
        return true;
      case "graphHidePick":
        setGraphs((q) => ({ ...q, functions: q.functions.map((f) => (f.n === q.pick ? { ...f, hidden: true } : f)), pick: undefined }));
        return true;
      case "graphDeletePick":
        setGraphs((q) => ({ ...q, functions: q.functions.filter((f) => f.n !== q.pick), marks: q.marks.filter((m) => !("fn" in m) || m.fn !== q.pick), pick: undefined }));
        return true;
      case "graphEditPick":
        if (g.pick !== undefined) setGraphs((q) => ({ ...openEntry(q, q.pick!), pick: undefined }));
        return true;
      case "graphPinAll":
        setGraphs((q) => ({ ...q, pinAll: !q.pinAll || undefined }));
        return true;
      case "graphText":
        setWizard(openWizard({ kind: "wizard", title: "Text", arrows: false, fields: [{ label: "Text:", value: "" }, { label: "x:", value: centre((w.xmin + w.xmax) / 2) }, { label: "y:", value: centre((w.ymin + w.ymax) / 2) }], build: "gtext:{1}:{2}:{0}" }));
        return true;
      case "coordinates":
        if (needFns()) return true;
        setWizard(openWizard({ kind: "wizard", title: "Coordinates and Equations", arrows: false, fields: [{ label: "Point on:", value: fns[0], options: fns }, { label: "x:", value: "0" }], build: "coords:{0}:{1}" }));
        return true;
      case "graphCalculate":
        setWizard(openWizard({ kind: "wizard", title: "Calculate", arrows: false, fields: [{ label: "Expression:", value: "", hint: "f1(2)-f2(2)" }], build: "gcalc:{0}" }));
        return true;
      case "redefine": {
        const all = graphList(g).filter((x) => x.kind !== "scatter");
        if (!all.length) return setError("Error: No graphs on this page"), true;
        setWizard(openWizard({ kind: "wizard", title: "Redefine", arrows: false, fields: [{ label: "Graph:", value: all[0]!.name, options: all.map((x) => x.name) }], build: "redefine:{0}" }));
        return true;
      }
      case "viewGraphing":
        setGraphs((q) => ({ ...q, view: undefined, axes: true }));
        return true;
      case "viewPlane":
        // Plane Geometry: no axes and no entry line; the analytic window shows as Settings says.
        setGraphs((q) => ({ ...q, view: "plane", axes: false, grid: "none", editing: null, hideAnalytic: q.gsettings?.analyticInPlane === false }));
        return true;
      case "view3d":
        if (PTT?.no3d) {
          setError("Error: 3D Graphing is disabled in Press-to-Test");
          return true;
        }
        setGraphs((q) => ({ ...q, view: "3d", tool: null, editing: null }));
        return true;
      case "viewAnalytic":
        setGraphs((q) => ({ ...q, hideAnalytic: !q.hideAnalytic }));
        return true;
      case "viewScale":
        setGraphs((q) => ({ ...q, hideScale: !q.hideScale || undefined }));
        return true;
      case "viewEndValues":
        setGraphs((q) => ({ ...q, hideEndValues: !q.hideEndValues }));
        return true;
      case "viewGuides":
        setGraphs((q) => ({ ...q, hideGuides: !q.hideGuides }));
        return true;
      case "pathFn":
      case "pathPar":
      case "pathPolar": {
        const target =
          id === "pathFn"
            ? g.functions.find((f) => !f.hidden)
            : (g.parametrics ?? []).find((c) => !c.hidden && Boolean(c.polar) === (id === "pathPolar"));
        if (!target) return setError(`Error: No ${id === "pathFn" ? "function" : id === "pathPar" ? "parametric curve" : "polar curve"} to follow`), true;
        setGraphs((q) => ({ ...q, tool: null, pathPlot: { kind: id === "pathFn" ? "fn" : "par", n: target.n, started: Date.now() } }));
        return true;
      }
      case "pathSetup":
        setWizard(openWizard({ kind: "wizard", title: "Path Setup", arrows: false, fields: [{ label: "Duration (s):", value: String(g.pathSeconds ?? 4) }], build: "pathsetup:{0}" }));
        return true;
      case "geoTrace":
        setGraphs((q) => ({ ...q, geoTrace: !q.geoTrace }));
        say(g.geoTrace ? "Geometry Trace off" : "Geometry Trace on: move a slider and the graphs leave their earlier places drawn");
        return true;
      case "geoTraceErase":
        setGraphs((q) => ({ ...q, traceErased: (q.traceErased ?? 0) + 1 }));
        return true;
      case "graphSettings": {
        const grid = { none: "No Grid", dot: "Dot Grid", line: "Lined Grid" }[g.grid];
        // Plane Geometry shows no grid, so the handheld greys Grid there.
        setWizard(geoSettingsWizard(g.gsettings ?? {}, { value: grid, enabled: g.view !== "plane" }, !g.hideEndValues, "gsettings:{0}:{1}:{2}:{3}:{4}:{5}:{6}:{7}:{8}:{9}"));
        return true;
      }
      case "mathDraw":
        setGraphs((q) => ({ ...q, tool: null, editing: null, zoomBox: undefined, mathDraw: !q.mathDraw }));
        say("MathDraw: draw a line or a circle on the graph. Esc stops.");
        return true;
    }
    return false;
  };

  /** The dialogs Graphs ▸ Actions opened, once filled in. */
  const graphsWizard = async (built: string) => {
    const e = engine.current;
    const [kind, ...rest] = built.split(":");
    const arg = rest.join(":").trim();
    const num = async (t: string) => (e ? Number((await e.giac(`evalf(${translate(parse(t || "0"), settings).giac})`)).trim()) : NaN);
    switch (kind) {
      case "pathsetup": {
        const s = await num(arg);
        if (!(s > 0)) return setError("Error: The duration is a positive number of seconds");
        return setGraphs((g) => ({ ...g, pathSeconds: s }));
      }
      case "gsettings": {
        const v = rest;
        const grid = v[3]?.trim();
        return setGraphs((g) => ({
          ...g,
          hideEndValues: v[5]?.trim() !== "Yes",
          grid: g.view === "plane" ? g.grid : grid === "Dot Grid" ? "dot" : grid === "Lined Grid" ? "line" : "none",
          gsettings: { ...g.gsettings, ...geoSettingsFrom(v) },
        }));
      }
      case "gridtype":
        return setGraphs((g) => ({ ...g, grid: arg === "Dot Grid" ? "dot" : arg === "Lined Grid" ? "line" : "none" }));
      case "hideshow": {
        const [names = "", ...vals] = rest;
        const shown = new Map(names.split(",").map((n, i) => [n, vals[i]?.trim() !== "No"]));
        const hide = (name: string, h: boolean | undefined) => (shown.has(name) ? !shown.get(name) || undefined : h);
        return setGraphs((g) => ({
          ...g,
          functions: g.functions.map((f) => ({ ...f, hidden: hide(`f${f.n}`, f.hidden) })),
          relations: g.relations?.map((r) => ({ ...r, hidden: hide(`rel${r.n}`, r.hidden) })),
          parametrics: g.parametrics?.map((c) => ({ ...c, hidden: hide(`${c.polar ? "r" : "x"}${c.n}`, c.hidden) })),
          sequences: g.sequences?.map((s) => ({ ...s, hidden: hide(`u${s.n}`, s.hidden) })),
          scatters: g.scatters?.map((s) => ({ ...s, hidden: hide(`s${s.n}`, s.hidden) })),
          des: g.des?.map((d) => ({ ...d, hidden: hide(`d${d.n}`, d.hidden) })),
        }));
      }
      case "attrs": {
        const [fn = "", weight, style, colour] = rest.map((s) => s.trim());
        const n = Number(fn.slice(1));
        return setGraphs((g) => ({
          ...g,
          functions: g.functions.map((f) => (f.n !== n ? f : { ...f, attrs: { weight: weight as "Thin", style: style as "Continuous", colour: colour === "Auto" ? undefined : colour } })),
        }));
      }
      case "condition": {
        const [fn = "", ...cond] = rest;
        const n = Number(fn.trim().slice(1));
        const text = cond.join(":").trim();
        let condition: { text: string; giac: string } | undefined;
        if (text) {
          try {
            condition = { text, giac: translate(parse(text), settings).giac };
          } catch {
            return setError("Error: Syntax");
          }
        }
        return setGraphs((g) => ({ ...g, functions: g.functions.map((f) => (f.n === n ? { ...f, condition } : f)) }));
      }
      case "gtext": {
        const [xs = "", ys = "", ...text] = rest;
        const [x, y] = [await num(xs), await num(ys)];
        if (![x, y].every(Number.isFinite)) return setError("Error: The place is two numbers, x and y");
        return setGraphs((g) => ({ ...g, texts: [...(g.texts ?? []), { x, y, text: text.join(":") }] }));
      }
      case "coords": {
        const [fn = "", xs = ""] = rest.map((s) => s.trim());
        const n = Number(fn.slice(1));
        const x = await num(xs);
        const p = page?.kind === "graphs" ? page : null;
        if (!e || !p || !Number.isFinite(x)) return setError("Error: x is a number");
        const y = Number((await e.giac(`evalf(${fnName(p.id, n)}(${x}))`)).trim());
        if (!Number.isFinite(y)) return setError(`Error: f${n} is undefined at x = ${x}`);
        const mark: Mark = { kind: "point", fn: n, x, y, title: "point" };
        setGraphs((g) => ({ ...g, marks: [...g.marks, mark] }));
        return say(markSaid(mark));
      }
      case "gcalc": {
        if (!e) return;
        const r = await evaluate(arg, e.giac, { settings });
        if (!r.ok) return setError(r.error);
        const w = page?.kind === "graphs" ? page.window : STANDARD;
        // The result goes near the top left, under any already there.
        setGraphs((g) => ({ ...g, texts: [...(g.texts ?? []), { x: w.xmin + (w.xmax - w.xmin) * 0.05, y: w.ymax - (w.ymax - w.ymin) * (0.2 + 0.07 * (g.texts?.length ?? 0)), text: `${arg} = ${r.outputText}` }] }));
        return say(`${arg} = ${r.outputText}`);
      }
      case "redefine": {
        const m = /^(f|rel|x|r|u|s|d)(\d+)$/.exec(arg);
        if (!m) return;
        const n = Number(m[2]);
        return setGraphs((g) =>
          m[1] === "f" ? openEntry(g, n) : m[1] === "rel" ? openRelation(g, n) : m[1] === "x" ? openParametric(g, settings.angle === "deg", n) : m[1] === "r" ? openPolar(g, settings.angle === "deg", n) : m[1] === "u" ? openSequence(g, n) : m[1] === "d" ? openDE(g, n) : g,
        );
      }
    }
  };

  /**
   * Analyze Conics on the page's conic: the first shown relation that is one
   * (its coefficients read from the engine), the result added as marks.
   */
  const analyzeConic = async (f: ConicFeature) => {
    const e = engine.current;
    const g = page?.kind === "graphs" ? page : null;
    if (!e || !g) return;
    for (const r of g.relations ?? []) {
      if (r.hidden || r.op !== "=") continue;
      const P = `expand(${relName(g.id, r.n)}(x_,y_))`;
      // Ax²+Bxy+Cy²+Dx+Ey+F from the derivatives at the origin.
      const at0 = (d: string) => `subst(${d},[x_,y_],[0,0])`;
      const terms = [at0("diff(P_,x_,2)/2"), at0("diff(diff(P_,x_),y_)"), at0("diff(P_,y_,2)/2"), at0("diff(P_,x_)"), at0("diff(P_,y_)"), at0("P_")];
      await e.giac(`P_:=${P}`);
      // Second degree in x and y together, or it isn't a conic.
      const degree = Number((await e.giac("degree(subst(P_,[x_,y_],[t_*x_,t_*y_]),t_)")).trim());
      const raw = degree === 2 ? await e.giac(`evalf([${terms.join(",")}])`) : "";
      await e.giac("purge(P_)");
      const coeffs = raw.trim().replace(/^\[|\]$/g, "").split(",").map(Number);
      if (coeffs.length !== 6 || coeffs.some((v) => !Number.isFinite(v))) continue;
      const k = classifyConic(coeffs);
      if (!k) continue;
      const res = conicFeature(k, f);
      if (!res) return setError(`Error: This ${k.kind} has no ${f === "latus" ? "latus rectum" : f === "axes" ? "axes of symmetry" : f}`);
      const marks: Mark[] = [
        ...res.points.map((p) => ({ kind: "point" as const, fn: 0, rel: r.n, x: p.pt[0], y: p.pt[1], title: p.title })),
        ...res.lines.map((l) => ({ kind: "line" as const, rel: r.n, ...l.line, title: l.title })),
        ...res.values.map((v) => ({ kind: "value" as const, rel: r.n, ...v })),
      ];
      setGraphs((q) => ({ ...q, marks: [...q.marks, ...marks] }));
      say(marks.map(markSaid).join(". "));
      return;
    }
    setError("Error: No conic on this page: enter one as a relation, such as x^2+y^2=4");
  };

  const graphAction = useCallback(
    (id: string) => {
      if (id.startsWith("conic:")) return void analyzeConic(id.slice(6) as ConicFeature);
      if (graphsActions(id)) return;
      if (id === "zoomBox") return setGraphs((g) => startZoomBox(g));
      if (id === "traceAll") return setGraphs((g) => startTool(g, "traceAll"));
      if (id === "traceStep") {
        const step = page?.kind === "graphs" ? page.traceStep : undefined;
        return setWizard(
          openWizard({ kind: "wizard", title: "Trace Step", arrows: false, fields: [{ label: "Trace Step:", value: step === undefined ? "Auto" : String(step), options: ["Auto"], free: true }], build: "tracestep:{0}" }),
        );
      }
      if (id === "zoomUser") return setGraphs((g) => ({ ...g, window: g.userWindow ?? STANDARD, marks: [] }));
      if (id === "zoomData") return void zoomToData();
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
      else if (id.startsWith("eqtpl:")) {
        const form = astToRow(parse(id.slice(6)));
        setGraphs((g) => {
          const o = openRelation(g);
          return { ...o, edit: { row: form, cursor: { path: [], index: form.length } } };
        });
      }
      else if (id === "insertSlider") {
        newSlider(page?.kind === "graphs" ? page.sliders : undefined);
      }
      else if (id === "entryParametric") setGraphs((g) => openParametric(g, settings.angle === "deg"));
      else if (id === "entryPolar") setGraphs((g) => openPolar(g, settings.angle === "deg"));
      else if (id === "entrySequence") setGraphs((g) => openSequence(g));
      else if (id === "entryCustom") {
        const g = page?.kind === "graphs" ? page : null;
        const names = (g?.sequences ?? []).map((s) => `u${s.n}`);
        if (names.length < 2) setError("Error: A custom plot needs two sequences");
        else
          setWizard(
            openWizard({
              kind: "wizard",
              title: "Custom Plot",
              arrows: false,
              fields: [
                { label: "X:", value: names[0], options: names },
                { label: "Y:", value: names[1], options: names },
              ],
              build: "seqcustom:{0}:{1}",
            }),
          );
      }
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

  /**
   * A change to the document's pages or problems (delete, rename, the Page
   * Sorter). When the shown problem is the one deleted, the problem shown
   * next has its variables brought back from the document; when it's only
   * renumbered, the engine already has the right ones.
   */
  const restructure = useCallback(
    (next: CasDocument | null, refused: string) => {
      if (!next) return setError(refused);
      const d = latestDoc.current;
      const e = engine.current;
      const before = problemOf(d.pages[d.active]);
      const shownId = next.pages[next.active]!.id;
      const was = problemOf(d.pages.find((p) => p.id === shownId));
      const now = problemOf(next.pages[next.active]);
      shownProblem.current = now;
      if (was === before) return setDoc(next);
      const arriving = d.problems?.[String(was)] ?? [];
      const problems = { ...(next.problems ?? {}) };
      delete problems[String(now)];
      setDoc({ ...next, problems });
      lastAns.current = undefined;
      if (e)
        void (async () => {
          await e.clearAll();
          await e.restore(arriving);
          setDefined(definedNames(arriving));
          await applyPending(now);
        })();
    },
    [applyPending],
  );

  /** Ctrl+Tab and a click on another region: the app there takes the keys; an empty region asks which app to put there. */
  const focusRegion = useCallback((dir: 1 | -1) => {
    const r = nextRegion(latestDoc.current, dir);
    if (!r) return;
    if ("active" in r) setDoc((d) => ({ ...d, active: r.active }));
    else askRegion(r.group, r.slot);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function askRegion(group: number, slot: number) {
    fillTarget.current = { group, slot };
    creatingNew.current = false;
    setMenu({ items: ADD_PAGE, state: openMenu() });
  }

  /** The Page Sorter's keys: choose, open, move or delete a page. */
  const sorterKey = useCallback(
    (key: Key) => {
      const d = latestDoc.current;
      const sel = sorter ?? 0;
      const all = units(d);
      const u = unitOf(d, sel);
      if (key.k === "esc") return setSorter(null);
      if (key.k === "enter") {
        setDoc((x) => ({ ...x, active: sel }));
        return setSorter(null);
      }
      if (key.k === "left" || key.k === "up" || key.k === "right" || key.k === "down") {
        const step = key.k === "left" || key.k === "up" ? -1 : 1;
        return setSorter(all[Math.max(0, Math.min(all.length - 1, u + step))]?.pages[0] ?? sel);
      }
      if (key.k === "selectLeft" || key.k === "selectRight") {
        const r = movePage(d, sel, key.k === "selectLeft" ? -1 : 1);
        setDoc(r.doc);
        return setSorter(r.index);
      }
      if (key.k === "delete" || key.k === "backspace" || key.k === "cut") {
        const next = deletePage(d, sel);
        restructure(next, "Error: A document keeps at least one page");
        if (next) setSorter(Math.min(sel, next.pages.length - 1));
      }
    },
    [sorter, restructure],
  );

  /** A dialog's defaults that depend on the problem: Save RegEqn to the first function not defined yet, as the handheld picks it. */
  const prepWizard = useCallback(
    (w: WizardState): WizardState => {
      const i = w.wizard.fields.findIndex((f) => f.label === "Save RegEqn to:");
      if (i < 0) return w;
      const free = Array.from({ length: 99 }, (_, k) => `f${k + 1}`).find((n) => !defined.has(n)) ?? "f1";
      return { ...w, values: w.values.map((v, k) => (k === i ? free : v)) };
    },
    [defined],
  );

  /** A new Data & Statistics page beside the active one (Quick Graph, Summary Plot, Shade area, Shade P value). */
  const plotBeside = useCallback((problem: number, plot: Partial<DataStatsPage>) => setDoc((d) => splitWith(d, { ...(newPage("datastats", problem) as DataStatsPage), ...plot })), []);

  /**
   * The highest a density (`pdf` of x, as text) reaches across the window,
   * from 41 samples. nudge: x = 0 is sampled at 0.01, where χ² and F can be
   * infinite.
   */
  const densityTop = useCallback(
    async (pdf: (x: string) => string, xmin: number, xmax: number, nudge = false) => {
      const e = engine.current;
      if (!e) return 0;
      const num = async (t: string) => Number((await e.giac(`evalf(${translate(parse(t), settings).giac})`)).trim());
      let top = 0;
      for (let k = 0; k <= 40; k++) {
        const x = xmin + ((xmax - xmin) * k) / 40;
        const y = await num(pdf(String(x === 0 && nudge ? 0.01 : x))).catch(() => 0);
        if (Number.isFinite(y)) top = Math.max(top, y);
      }
      return top;
    },
    [settings],
  );

  /**
   * Draw ▸ Shade area for a Cdf run from the spreadsheet: a Data &
   * Statistics page beside it with the distribution's density plotted, the
   * window fitted to it, and the area between the bounds shaded.
   */
  const drawDistribution = useCallback(
    async (formula: string, problem: number) => {
      const m = /^(normCdf|tCdf|χ²Cdf|FCdf)\((.*)\)$/.exec(formula);
      if (!m) return;
      const [lo = "-∞", hi = "∞", ...p] = sheet.splitList(`{${m[2]}}`).map((a) => a.trim());
      const dist = m[1];
      const pdf = (x: string) => (dist === "normCdf" ? `normPdf(${x},${p[0] ?? 0},${p[1] ?? 1})` : dist === "tCdf" ? `tPdf(${x},${p[0]})` : dist === "χ²Cdf" ? `χ²Pdf(${x},${p[0]})` : `FPdf(${x},${p[0]},${p[1]})`);
      const [mu, sd] = [Number(p[0] ?? 0), Number(p[1] ?? 1)];
      const df = Number(p[0]);
      const [xmin, xmax] = dist === "normCdf" ? [mu - 4 * sd, mu + 4 * sd] : dist === "tCdf" ? [-4.5, 4.5] : [0, dist === "χ²Cdf" ? df + 4 * Math.sqrt(2 * df) : 5];
      if (!Number.isFinite(xmin) || !Number.isFinite(xmax) || xmax <= xmin) return;
      const top = (await densityTop(pdf, xmin, xmax)) || 1;
      const bound = (b: string, edge: number) => (/∞/.test(b) ? String(edge) : b);
      plotBeside(problem, {
        functions: [pdf("x")],
        shade: { fn: 0, from: bound(lo, xmin), to: bound(hi, xmax) },
        window: { xmin, xmax, ymin: -top * 0.08, ymax: top * 1.15, xscl: 1, yscl: 1 },
      });
    },
    [densityTop, plotBeside],
  );

  /**
   * Shade P value for a test run from the spreadsheet: the test statistic's
   * distribution on a Data & Statistics page beside it, with the tail the
   * alternative hypothesis points to shaded (both tails for ≠),
   * and the P value under it.
   */
  const drawPValue = useCallback(
    async (rows: [string, unknown][], problem: number) => {
      const e = engine.current;
      if (!e) return;
      const get = (label: string) => {
        const v = rows.find(([l]) => l === label)?.[1];
        return typeof v === "number" ? v : NaN;
      };
      const hypText = String(rows.find(([l]) => l === "Alternate Hyp")?.[1] ?? "");
      const hyp = hypText.includes("<") ? -1 : hypText.includes(">") ? 1 : 0;
      const p = get("PVal");
      let pdf: (x: string) => string;
      let stat: number;
      let [xmin, xmax] = [-4, 4];
      if (Number.isFinite(get("z"))) {
        stat = get("z");
        pdf = (x) => `normPdf(${x},0,1)`;
      } else if (Number.isFinite(get("t"))) {
        stat = get("t");
        pdf = (x) => `tPdf(${x},${get("df")})`;
        [xmin, xmax] = [-4.5, 4.5];
      } else if (Number.isFinite(get("χ²"))) {
        stat = get("χ²");
        const df = get("df");
        pdf = (x) => `χ²Pdf(${x},${df})`;
        [xmin, xmax] = [0, Math.max(df + 4 * Math.sqrt(2 * df), stat * 1.15)];
      } else if (Number.isFinite(get("F"))) {
        stat = get("F");
        pdf = (x) => `FPdf(${x},${get("dfNumer")},${get("dfDenom")})`;
        [xmin, xmax] = [0, Math.max(5, stat * 1.2)];
      } else return;
      if (!Number.isFinite(stat) || pdf("x").includes("NaN")) return;
      // z and t are symmetric about 0; χ² and F start at 0.
      const symmetric = xmin < 0;
      if (symmetric) [xmin, xmax] = [Math.min(xmin, -Math.abs(stat) - 0.5), Math.max(xmax, Math.abs(stat) + 0.5)];
      const top = Math.min((await densityTop(pdf, xmin, xmax, !symmetric)) || 1, 2);
      const num = async (text: string) => Number((await e.giac(`evalf(${translate(parse(text), settings).giac})`)).trim());
      const f = (v: number) => String(Number(v.toPrecision(12)));
      const label = `PVal = ${Number(p.toPrecision(6))}`;
      let shade: NonNullable<DataStatsPage["shade"]>;
      if (symmetric && hyp === 0) shade = { fn: 0, from: f(Math.abs(stat)), to: f(xmax), also: { from: f(xmin), to: f(-Math.abs(stat)) }, label };
      else if (pdf("x").startsWith("FPdf") && hyp === 0) {
        // F's ≠ isn't symmetric: the statistic's own tail, and the other tail cut
        // where its area is the same half of the P value.
        const [dn, dd] = [get("dfNumer"), get("dfDenom")];
        const upper = (await num(`FCdf(0,${f(stat)},${dn},${dd})`).catch(() => 1)) > 0.5;
        const cut = await num(`invF(${f(upper ? p / 2 : 1 - p / 2)},${dn},${dd})`).catch(() => NaN);
        if (Number.isFinite(cut) && !upper) xmax = Math.max(xmax, cut * 1.1);
        const mirror = Number.isFinite(cut) ? (upper ? { from: f(0), to: f(cut) } : { from: f(cut), to: f(xmax) }) : undefined;
        shade = upper ? { fn: 0, from: f(stat), to: f(xmax), also: mirror, label } : { fn: 0, from: f(0), to: f(stat), also: mirror, label };
      } else {
        // χ² is always its upper tail.
        const right = !symmetric ? hyp >= 0 : hyp > 0;
        shade = right ? { fn: 0, from: f(stat), to: f(xmax), label } : { fn: 0, from: f(xmin), to: f(stat), label };
      }
      plotBeside(problem, { functions: [pdf("x")], values: [f(stat)], shade, window: { xmin, xmax, ymin: -top * 0.08, ymax: top * 1.15, xscl: 1, yscl: 1 } });
    },
    [settings, densityTop, plotBeside],
  );

  /** What the Lists menus need beyond the selection: the column's name, the problem's lists, the table's functions. */
  const listsInfo = useCallback(
    (p: ListsPage): ListsMenuInfo => {
      const n = problemOf(p);
      const lists = [...new Set(doc.pages.flatMap((q) => (q.kind === "lists" && problemOf(q) === n ? q.cols.map((c) => c.name).filter((x): x is string => Boolean(x)) : [])))];
      const fns = problemFunctions(doc, n);
      const shown = tableColumns(p, fns);
      const at = shown[p.table?.col ?? 0];
      // Link To: also the problem's list variables that aren't columns.
      const all = [...new Set([...lists, ...listNames()])].sort();
      return {
        named: p.cols[p.sel.col]?.name,
        lists: all,
        fns: fns.map((f) => ({ n: f.n, text: f.text })),
        tableFn: at ? { n: at.n, text: at.text } : undefined,
        editing: p.edit !== null,
        picked: p.pick,
        colMode: p.colModes?.[p.sel.col],
      };
    },
    [doc, listNames],
  );

  const runAction = useCallback(
    (action: MenuAction | undefined) => {
      if (!action) return;
      // Recent ▸ in the context menus: the last items used from the page's menu.
      if (action.kind === "app" && (page?.kind === "geometry" || page?.kind === "graphs")) noteRecent(page, action.id);
      // On a Notes page, the Calculations menu types into the current maths box (or a new one).
      if (page?.kind === "notes" && (action.kind === "insert" || action.kind === "template"))
        notesApi.current?.insertMath(action.kind === "insert" ? action.text.replaceAll(CARET, "") : rowToLinear([templateNode(action.template)]));
      else if (action.kind === "insert") pageKey({ k: "text", text: action.text });
      else if (action.kind === "template") pageKey({ k: "template", id: action.template });
      else if (action.kind === "wizard") setWizard(prepWizard(openWizard(action)));
      else if (action.id.startsWith("varpick:")) {
        const name = action.id.slice(8);
        const m = page?.kind === "geometry" ? page.mode : null;
        const need = m?.kind === "calculate" && m.expr !== undefined ? (m.names ?? []).find((n) => !(m.vars ?? {})[n]) : undefined;
        // Calculate's "or press VAR": the variable's value for the name it's asking about.
        if (need) setGeo((p) => (p.mode?.kind === "calculate" ? { ...p, mode: { ...p.mode, vars: { ...p.mode.vars, [need]: `=${name}` } } } : p));
        else pageKey({ k: "text", text: name });
      }
      else if (action.id === "insertProblem") setDoc(insertProblem);
      else if (action.id === "editUndo" || action.id === "editRedo") stepUndo(action.id === "editUndo");
      else if (action.id === "editCopy") editOps.current.copy();
      else if (action.id === "editCut") editOps.current.cut();
      else if (action.id === "editPaste")
        void navigator.clipboard
          ?.readText()
          .then((t) => t.trim() && pageKey({ k: "paste", text: pasted(t) }))
          .catch(() => setError("Error: The browser didn't allow reading the clipboard. Use Ctrl+V."));
      else if (action.id === "editDelete") pageKey({ k: "delete" });
      else if (action.id === "insertImage") {
        if (page?.kind === "datastats") imageInput.current?.click();
        else setError("Error: An image goes on a Data & Statistics page");
      }
      else if (action.id === "editCopyLatex" || action.id === "editCopyMathml") copyAs(action.id === "editCopyLatex" ? "latex" : "mathml");
      else if (action.id === "pageSorter") setSorter(doc.active);
      else if (action.id === "problemRename")
        setWizard(openWizard({ kind: "wizard", title: "Rename Problem", arrows: false, fields: [{ label: "Name:", value: doc.problemNames?.[String(problemOf(page))] ?? "" }], build: "problemrename:{0}" }));
      else if (action.id === "problemDelete") {
        const n = problemOf(page);
        setConfirm({
          title: "Delete Problem",
          lines: [`Delete problem ${n} and its pages?`, "", "Its variables go with it."],
          ok: () => restructure(deleteProblem(latestDoc.current, n), "Error: A document keeps at least one problem"),
        });
      } else if (/^layout[1-8]$/.test(action.id)) {
        const next = selectLayout(doc, Number(action.id.slice(6)));
        setDoc(next);
        // A new empty region asks for its app straight away.
        const g = groupIndex(next, next.pages[next.active]!.id);
        const empty = g < 0 ? -1 : next.groups![g]!.slots.indexOf(null);
        if (empty >= 0) askRegion(g, empty);
      } else if (action.id === "layoutCustom") {
        if (groupIndex(doc, page?.id ?? -1) < 0) setError("Error: Choose a layout with more than one app first");
        else setSplitting(true);
      } else if (action.id === "layoutSwap") setDoc(swapApp);
      else if (action.id === "layoutDelete") {
        if (groupIndex(doc, page?.id ?? -1) < 0) setError("Error: This page has only one app");
        else restructure(deletePage(doc, doc.active), "Error: A document keeps at least one page");
      } else if (action.id === "layoutGroup") {
        const next = groupWithNext(doc);
        if (next === doc) setError("Error: Group needs a next page in the same problem, and at most four apps");
        else setDoc(next);
      } else if (action.id === "layoutUngroup") setDoc(ungroup);
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
        const r = exportTns(doc, settings, engine.current?.saved);
        download(new Blob([r.bytes as BlobPart]), `${doc.title}.tns`);
        const warn = droppedMessage(r);
        if (warn) toast(warn);
      } else if (action.id === "fileShareLink") {
        const link = `${location.origin}${location.pathname}${shareFragment(snapshot())}`;
        const long = link.length > LONG_LINK ? ` It's long (${Math.round(link.length / 1000)} KB), so some apps may cut it short; download the .tns instead if it won't open.` : "";
        void navigator.clipboard
          ?.writeText(link)
          .then(() => toast.success(`Link copied. Anyone who opens it gets a copy of this document; nothing is uploaded.${long}`))
          .catch(() => setError("Error: The browser didn't allow writing to the clipboard."));
      } else if (action.id === "handheldSetup")
        setWizard(
          openWizard({
            kind: "wizard",
            title: "Handheld Setup",
            fields: [
              { label: "Text Size:", value: setup.text, options: [...SETUP_OPTIONS.text] },
              { label: "Haptics", value: setup.haptics ? "Yes" : "No", check: true },
              // Axiom's own, after the handheld's two.
              { label: "Keypad Layout:", value: setup.keypad, options: [...SETUP_OPTIONS.keypad] },
              { label: "Show Keypad", value: setup.showKeypad ? "Yes" : "No", check: true },
              { label: "Start Up In:", value: setup.start, options: [...SETUP_OPTIONS.start] },
              { label: "Animations:", value: setup.motion, options: [...SETUP_OPTIONS.motion] },
            ],
            build: "setup:{0}:{1}:{2}:{3}:{4}:{5}",
          }),
        );
      else if (action.id === "status") void showStatus();
      else if (action.id === "pressToTest") {
        if (PTT)
          setConfirm({
            title: "Exit Press-to-Test",
            lines: ["End the test? Everything made during it is deleted, and your own documents come back."],
            ok: () => undefined,
            buttons: [
              { label: "Exit Test", run: () => void endTest() },
              { label: "Cancel", run: () => undefined },
            ],
          });
        else
          setWizard(
            openWizard({
              kind: "wizard",
              title: "Press-to-Test",
              fields: [
                { label: "Angle Settings:", value: settings.angle === "deg" ? "Degree" : "Radian", options: ["Radian", "Degree"] },
                ...PTT_OPTIONS.map((o) => ({ label: o.label, value: o.on ? "Yes" : "No", check: true })),
              ],
              build: `ptt:${[0, ...PTT_OPTIONS.map((_, i) => i + 1)].map((i) => `{${i}}`).join(":")}`,
            }),
          );
      } else if (action.id === "factoryReset" && PTT) setError("Error: Not available in Press-to-Test");
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
            // A copy is its own file: Save doesn't write it over the computer's file the original came from.
            const { handle: _handle, disk: _disk, calc: _calc, calcPending: _pending, ...copy } = rec;
            await files.put({ ...copy, path: files.join(folder, name), modified: Date.now() });
            await refreshFiles();
            toast.success(`Pasted ${name}`);
          })().catch((err: unknown) => toast.error(`Couldn't paste: ${(err as Error).message || "the browser refused"}`));
        } else if (action.id === "browseUpload") uploadInput.current?.click();
        else if (action.id === "browseDownload" && r && !r.folder) void downloadFile(r.path);
        else if (action.id === "browseExportAll") {
          const lost = { dropped: 0, droppedKinds: [] as string[] };
          void files
            .exportAll((rec) => (rec.doc ? tnsOf(rec.doc, lost) : null))
            .then((zip) => {
              download(new Blob([zip as BlobPart]), "My Documents.zip");
              const warn = droppedMessage(lost);
              if (warn) toast(warn);
            })
            .catch((err: unknown) => toast.error(`Couldn't export: ${(err as Error).message}`));
        }
        else if (action.id === "browseSendHandheld") {
          if (!r || r.folder) return;
          const h = connectedHandheld();
          if (!h) {
            toast("Connect the handheld first.");
            setHandheldOpen(true);
            return;
          }
          void (async () => {
            const rec = await files.getFile(r.path);
            if (!rec) return;
            const lost = { dropped: 0, droppedKinds: [] as string[] };
            const bytes = rec.bytes && !rec.edited ? rec.bytes : rec.doc ? tnsOf(rec.doc, lost) : null;
            if (!bytes) return;
            const name = /\.\w+$/.test(r.name) ? r.name : `${r.name}.${h.info.ext.file || "tns"}`;
            const there = (await h.list("/")).some((e) => !e.dir && e.name.toLowerCase() === name.toLowerCase());
            const go = async () => {
              const id = toast.loading(`Sending ${name}…`);
              try {
                await h.write(`/${name}`, bytes, (done, total) => toast.loading(`Sending ${name}… ${Math.round((done / total) * 100)}%`, { id }));
                toast.success(`Sent ${name} to the handheld`, { id });
                const warn = droppedMessage(lost);
                if (warn) toast(warn);
              } catch (err) {
                toast.error((err as Error).message, { id });
              }
            };
            if (there) setConfirm({ title: "Send to Handheld", lines: [`${name} is already on the handheld. Replace it?`], ok: () => undefined, buttons: [{ label: "Replace", run: () => void go() }, { label: "Cancel", run: () => undefined }] });
            else await go();
          })().catch((err: unknown) => toast.error((err as Error).message));
        } else if (action.id === "browseSortName") setBrowse((b) => ({ ...b, sort: "name" }));
        else if (action.id === "browseSortSize") setBrowse((b) => ({ ...b, sort: "size" }));
      } else if (action.id.startsWith("lists") && page?.kind === "lists") {
        const fn = {
          listsInsertCell: sheet.insertCell,
          listsInsertRow: sheet.insertRow,
          listsDeleteRow: sheet.deleteRow,
          listsDeleteCell: sheet.deleteCell,
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
        } else if (/^listsTable(Resize|Max|Min|Auto)$/.test(action.id) && page?.kind === "lists" && page.table) {
          const shown = tableColumns(page, problemFunctions(doc, problemOf(page)));
          // A column's widest text: its definition, or a number as the table shows it (fitTableColumn allows ten characters for those).
          const chars = (i: number) => shown[i]?.text.length ?? 0;
          if (action.id === "listsTableResize") setLists(sheet.startTableResize);
          else if (action.id === "listsTableMax") setLists(sheet.maximizeTableColumn);
          else if (action.id === "listsTableMin") setLists((p) => sheet.fitTableColumn(p, p.table?.col ?? 0, chars(p.table?.col ?? 0)));
          else setLists((p) => shown.reduce((q, _, i) => sheet.fitTableColumn(q, i, chars(i)), p));
        } else if (action.id === "listsTable") setLists((p) => ({ ...p, table: p.table ? undefined : { start: 0, step: 1 }, edit: null }));
        else if (action.id === "listsRecalc") void recalcLists(page);
        else if (action.id === "listsMove") setLists(sheet.startMove);
        else if (action.id === "listsResize") setLists(sheet.startResize);
        else if (action.id === "listsRowResize") setLists(sheet.startRowResize);
        else if (action.id === "listsRange") {
          const r = sheet.startRange(page);
          if (r.error) setError(r.error);
          else setLists(() => r.page);
        } else if (action.id.startsWith("listsColMode:")) {
          const m = action.id.slice(13) as "" | "auto" | "exact" | "approx";
          const next: ListsPage = { ...page, colModes: { ...page.colModes, [page.sel.col]: m || undefined } as ListsPage["colModes"] };
          if (!m) delete next.colModes![page.sel.col];
          setLists(() => next);
          void recalcLists(next);
        } else if (action.id.startsWith("listsLink:")) {
          // Link To: the column takes the list's name and its values.
          const name = action.id.slice(10);
          const e = engine.current;
          if (e)
            void (async () => {
              const r = await evaluate(name, e.giac, { settings });
              if (!r.ok) return setError(r.error);
              const next = sheet.patchColumn(page, { name, cells: sheet.splitList(r.outputText), formula: undefined });
              setLists(() => next);
              void recalcLists(next);
            })();
        }
        else if (action.id === "listsMaxWidth") setLists(sheet.maximizeColumn);
        else if (action.id === "listsMinWidth") setLists(sheet.minimizeColumn);
        else if (action.id === "listsFill") setLists(sheet.startFill);
        else if (action.id === "listsCopy" || action.id === "listsCut") {
          const grid = sheet.copyCells(page);
          listsClip.current = grid;
          void navigator.clipboard?.writeText(grid.map((r) => r.join("\t")).join("\n")).catch(() => undefined);
          if (action.id === "listsCut") {
            const next = sheet.clearCells(page);
            setLists(() => next);
            void recalcLists(next);
          }
        } else if (action.id === "listsPaste") {
          if (!listsClip.current) return;
          const next = sheet.pasteCells(page, listsClip.current);
          setLists(() => next);
          void recalcLists(next);
        } else if (action.id.startsWith("listsColour:")) {
          const [, kind, colour = ""] = action.id.split(":");
          setLists((p) => sheet.setCellColour(p, kind === "text" ? "text" : "fill", colour));
        } else if (action.id === "listsQuickGraph") {
          // Quick Graph: a dot plot of the column beside the spreadsheet, as the handheld splits the page for it.
          const name = page.cols[page.sel.col]?.name;
          if (name) plotBeside(problemOf(page), { x: name, plot: "dot" });
        } else if (action.id === "listsTableDelete")
          setLists((p) => {
            if (!p.table) return p;
            const shown = tableColumns(p, problemFunctions(latestDoc.current, problemOf(p))).map((f) => f.n);
            const col = p.table.col ?? 0;
            return { ...p, table: { ...p.table, fns: shown.filter((_, i) => i !== col), col: Math.max(0, Math.min(col, shown.length - 2)) } };
          });
        // Select Row needs a row of values; Select Column works from any row of the column.
        else if (action.id === "listsPickRow") setLists((p) => (p.sel.row >= 2 ? { ...p, edit: null, pick: "row" } : p));
        else if (action.id === "listsPickCol") setLists((p) => ({ ...p, edit: null, pick: "col" }));
      } else if (action.id === "geoCoords") {
        setWizard(openWizard({ kind: "wizard", title: "Point by Coordinates", arrows: false, fields: [{ label: "x:", value: "0" }, { label: "y:", value: "0" }], build: "geocoords:{0}:{1}" }));
      } else if (action.id.startsWith("geoTool:") && page?.kind === "graphs") {
        const id = action.id;
        setGraphs((g) => ({ ...g, tool: null, editing: null, mathDraw: undefined, zoomBox: undefined }));
        setGraphGeo((p) => ({ ...p, tool: { name: id.slice(8) as GeoTool, picked: [] }, sel: null }));
      } else if (action.id.startsWith("geo") && page?.kind === "graphs" && page.geo?.sel) {
        // The selected object's context menu on a Graphs page (onGraphsPage): the items it leaves on.
        const id = action.id;
        if (id === "geoAttrs") geoDialog("attrs", geoOfGraph(page));
        else if (id === "geoLabel") geoDialog("label", geoOfGraph(page));
        else if (id === "geoCondSel") geoConditions(page.geo.sel);
        else if (SELECTION_ACTION.test(id)) setGraphGeo((p) => selectionAction(p, id));
      } else if (action.id.startsWith("geo") && page?.kind === "geometry") {
        const id = action.id;
        const shapes = () => resolveGeo(page.objects);
        if (id.startsWith("geoTool:")) setGeo((p) => ({ ...p, tool: { name: id.slice(8) as GeoTool, picked: [] }, mode: null, sel: null }));
        else if (id === "geoSelect") setGeo((p) => ({ ...p, tool: null, mode: null }));
        else if (id.startsWith("geoMode:")) {
          const kind = id.slice(8) as "calculate" | "redefine" | "conditions" | "mathdraw" | "region" | "zoombox";
          setGeo((p) => ({ ...p, tool: null, mode: p.mode?.kind === kind && kind === "mathdraw" ? null : { kind }, sel: null, multi: undefined }));
        } else if (SELECTION_ACTION.test(id)) setGeo((p) => selectionAction(p, id));
        else if (id === "geoCondSel") {
          if (page.sel) geoConditions(page.sel);
        } else if (id === "geoSlider") {
          newSlider(page.sliders);
        } else if (id === "geoSettings") setWizard(geoSettingsWizard(page.gsettings ?? {}, { value: page.grid ? "Lined Grid" : "No Grid", enabled: false }, true, "geosettings:{0}:{1}:{2}:{3}:{4}:{5}:{6}:{7}:{8}:{9}"));
        else if (id === "geoPathSetup")
          setWizard(openWizard({ kind: "wizard", title: "Path Setup", arrows: false, fields: [{ label: "Duration (s):", value: String(page.pathSeconds ?? 4) }], build: "geopathsetup:{0}" }));
        else if (id === "geoPinAll") setGeo((p) => ({ ...p, pinAll: !p.pinAll || undefined }));
        else if (id === "geoUnlink") setGeo((p) => ({ ...p, objects: p.objects.map((o) => (o.id === p.sel && (o.kind === "measure" || o.kind === "calc") ? { ...o, store: undefined } : o)) }));
        else if (id.startsWith("geoLink:")) {
          const name = id.slice(8);
          setGeo((p) => ({
            ...p,
            objects: p.objects.map((o) => (o.kind !== "measure" && o.kind !== "calc" ? o : o.id === p.sel ? { ...o, store: name } : o.store === name ? { ...o, store: undefined } : o)),
          }));
        } else if (id === "geoAttach") setGeo((p) => ({ ...p, objects: p.objects.map((o) => (o.id === p.sel && o.kind === "measure" ? { ...o, at: undefined } : o)) }));
        else if (id === "geoDetach") {
          const at = page.sel ? shapes().get(page.sel) : undefined;
          if (at?.t === "value") setGeo((p) => ({ ...p, objects: p.objects.map((o) => (o.id === p.sel && o.kind === "measure" ? { ...o, at: at.at } : o)) }));
        } else if (id === "geoWindow") {
          const v = page.view ?? GEO_VIEW;
          const f = (n: number) => String(Number(n.toPrecision(14)));
          const h = (v.w * GEO_ASPECT) / 2;
          setWizard(
            openWizard({
              kind: "wizard",
              title: "Window Settings",
              arrows: false,
              fields: [
                { label: "XMin:", value: f(v.x - v.w / 2) },
                { label: "XMax:", value: f(v.x + v.w / 2) },
                { label: "XScale:", value: "Auto", options: ["Auto"], free: true },
                { label: "YMin:", value: f(v.y - h) },
                { label: "YMax:", value: f(v.y + h) },
                { label: "YScale:", value: "Auto", options: ["Auto"], free: true },
              ],
              build: "geowindow:{0}:{1}:{2}:{3}:{4}:{5}",
            }),
          );
        } else if (id.startsWith("geoZoom:")) {
          const z = id.slice(8);
          setGeo((p) => {
            const v = p.view ?? GEO_VIEW;
            if (z === "quadrant1") return { ...p, view: { x: 10, y: 10 * GEO_ASPECT, w: 20 } };
            if (z === "user") return { ...p, view: p.userView };
            if (z === "trig") return { ...p, view: { x: 0, y: 0, w: (17 * Math.PI) / 4 } };
            if (z === "decimal") return { ...p, view: { x: 0, y: 0, w: 31.8 } };
            // Plane Geometry is always square, so Zoom – Square leaves the view as it is.
            if (z === "square") return p;
            // Zoom – Fit and Zoom – Data: everything on the page in view.
            const pts = [...resolveGeo(p.objects).values()].flatMap((sh) => (sh.t === "pt" ? [sh.p] : sh.t === "line" && sh.bound === "segment" ? [sh.p, sh.q] : sh.t === "circle" ? [{ x: sh.c.x - sh.r, y: sh.c.y - sh.r }, { x: sh.c.x + sh.r, y: sh.c.y + sh.r }] : sh.t === "poly" ? sh.pts : sh.t === "value" ? [sh.at] : []));
            if (!pts.length) return { ...p, view: v };
            const [x0, x1] = [Math.min(...pts.map((q) => q.x)), Math.max(...pts.map((q) => q.x))];
            const [y0, y1] = [Math.min(...pts.map((q) => q.y)), Math.max(...pts.map((q) => q.y))];
            const w = Math.max(2, (x1 - x0) * 1.2, ((y1 - y0) * 1.2) / GEO_ASPECT);
            return { ...p, view: { x: (x0 + x1) / 2, y: (y0 + y1) / 2, w } };
          });
        } else if (id === "geoScale") setGeo((p) => ({ ...p, hideScale: !p.hideScale }));
        else if (id === "geoGuides") setGeo((p) => ({ ...p, hideGuides: !p.hideGuides }));
        else if (id === "geoTraceErase") setGeo((p) => ({ ...p, traceErased: (p.traceErased ?? 0) + 1 }));
        else if (id === "geoViewGraphing" || id === "geoView3d") {
          // Graphing and 3D Graphing: the page becomes a Graphs page in that view, its construction and texts kept.
          const g = newPage("graphs", problemOf(page)) as GraphsPage;
          const next: GraphsPage = { ...g, id: page.id, problem: page.problem, editing: null, geo: { objects: page.objects, tool: null, sel: null }, ...(page.pathSeconds ? { pathSeconds: page.pathSeconds } : {}), ...(page.texts ? { texts: page.texts } : {}), ...(id === "geoView3d" ? { view: "3d" as const } : {}) };
          updatePage(page.id, () => next);
        }
        else if (id === "geoClear") setGeo((p) => ({ ...p, objects: [], tool: null, sel: null }));
        else if (id === "geoAxes") setGeo((p) => ({ ...p, axes: !p.axes }));
        else if (id === "geoAnalytic") setGeo((p) => ({ ...p, analytic: !p.analytic }));
        else if (id === "geoGrid") setGeo((p) => ({ ...p, grid: !p.grid }));
        else if (id === "geoZoomIn") setGeo((p) => zoomedGeo(p, 0.8));
        else if (id === "geoZoomOut") setGeo((p) => zoomedGeo(p, 1.25));
        else if (id === "geoZoomReset") setGeo((p) => ({ ...p, view: undefined }));
        else if (id === "geoHideShow") geoDialog("hide", page);
        else if (id === "geoAttrs") geoDialog("attrs", page);
        else if (id === "geoText") geoDialog("text", page);
        else if (id === "geoLabel") geoDialog("label", page);
        else if (id === "geoStore") {
          const m = page.objects.find((o) => o.id === page.sel && (o.kind === "measure" || o.kind === "calc"));
          if (m?.kind === "measure" || m?.kind === "calc")
            setWizard(openWizard({ kind: "wizard", title: "Store Variable", arrows: false, fields: [{ label: "Variable:", value: m.store ?? "" }], build: `geostore:${m.id}:{0}` }));
        }
      } else if (action.id.startsWith("ds") && page?.kind === "datastats") {
        const id = action.id;
        const shownWin = dataWindow.current;
        const fmt = (v: number) => String(Number(v.toPrecision(10)));
        if (id.startsWith("dsFill:")) setData((p) => ({ ...p, fill: id.slice(7) || undefined }));
        else if (id.startsWith("dsPlot:")) {
          const plot = id.slice(7) as DataStatsPage["plot"];
          setData((p) => ({ ...p, plot, window: undefined }));
        } else if (id === "dsConnect") setData((p) => ({ ...p, connect: !p.connect }));
        else if (id === "dsWhiskers") setData((p) => ({ ...p, extendWhiskers: !p.extendWhiskers }));
        else if (id === "dsNormal") setData((p) => ({ ...p, normalPdf: !p.normalPdf }));
        else if (id === "dsResidSquares") setData((p) => ({ ...p, residualSquares: !p.residualSquares }));
        else if (id === "dsResidPlot") setData((p) => ({ ...p, residualPlot: !p.residualPlot }));
        else if (id === "dsLabels") setData((p) => ({ ...p, labels: !p.labels }));
        else if (id === "dsHideText") setData((p) => ({ ...p, hideText: !p.hideText || undefined }));
        else if (id === "dsSelectImage") setData((p) => (p.image ? { ...p, imageSel: true, trace: undefined, textSel: undefined } : p));
        else if (id === "dsTrace") {
          setData((p) => ({ ...p, trace: p.trace ? undefined : { target: 0, i: 0 }, selected: undefined }));
          if (!page.trace) say("Graph Trace: ◄ ► move along, ▲ ▼ change what's traced, Esc ends");
        } else if (id === "dsSelectAll") setData((p) => ({ ...p, selected: "all", textSel: undefined }));
        else if (id === "dsText")
          setWizard(openWizard({ kind: "wizard", title: "Insert Text", arrows: false, fields: [{ label: "Text:", value: "" }], build: "ds:text:{0}" }));
        else if (id === "dsSlider") {
          newSlider(page.sliders);
        } else if (id === "dsForceX" || id === "dsForceY") {
          // The item forces the list the other way from how it reads (text numeric, numbers categorical), or undoes it.
          const axis = id === "dsForceX" ? "forceX" : "forceY";
          const text = id === "dsForceX" ? dataInfo.current.xText : dataInfo.current.yText;
          setData((p) => ({ ...p, [axis]: p[axis] ? undefined : text ? "num" : "cat", window: undefined, sort: undefined }));
        } else if (id === "dsRemoveSplit") setData((p) => ({ ...p, split: undefined, window: undefined }));
        else if (id.startsWith("dsSort:")) {
          // List order is the default, so it's stored as unset.
          const order = id.slice(7) as NonNullable<DataStatsPage["sort"]>;
          setData((p) => ({ ...p, sort: order === "list" ? undefined : order }));
        } else if (id === "dsShade") {
          // Which function (when there's more than one) and the bounds to shade between.
          const fns = page.functions ?? [];
          const s = page.shade;
          const bounds = [
            { label: "Lower Bound:", value: s?.from ?? (shownWin ? fmt(shownWin.xmin) : "") },
            { label: "Upper Bound:", value: s?.to ?? (shownWin ? fmt(shownWin.xmax) : "") },
          ];
          setWizard(
            openWizard({
              kind: "wizard",
              title: "Shade Under Function",
              arrows: false,
              fields: fns.length > 1 ? [{ label: "Function:", value: `${(s?.fn ?? 0) + 1}: ${fns[s?.fn ?? 0]}`, options: fns.map((f, i) => `${i + 1}: ${f}`) }, ...bounds] : bounds,
              build: fns.length > 1 ? "ds:shade:{0}:{1}:{2}" : "ds:shade:1:{0}:{1}",
            }),
          );
        }
        else if (id.startsWith("dsScale:")) {
          // Count is the default, so it's stored as unset; the window refits to the new heights.
          const scale = id.slice(8) as NonNullable<DataStatsPage["histScale"]>;
          setData((p) => ({ ...p, histScale: scale === "count" ? undefined : scale, window: undefined }));
        }
        else if (id.startsWith("dsAxis:")) {
          const axis = id.slice(7);
          const names = listNames();
          setMenu({
            items: names.length
              ? names.map((n) =>
                  menuApp(n, axis === "sum" ? `dsSum:${n}` : axis === "xsum" ? `dsXSum:${n}` : axis === "split" ? `dsSplit:${n}` : `dsVar:${axis}:${n}`),
                )
              : [{ label: "No lists in this problem" }],
            state: openMenu(),
          });
        } else if (id.startsWith("dsSum:")) {
          // A summary list takes the y variable's place; numbers summarised make a histogram, as on the handheld
          // (categories make a bar chart, which the page picks for them).
          const name = id.slice(6);
          setData((p) => ({ ...p, ySummary: name, y: undefined, regression: undefined, movable: undefined, plot: p.plot === "box" || p.plot === "pie" || p.plot === "bar" ? p.plot : "histogram", window: undefined }));
        } else if (id.startsWith("dsXSum:")) {
          // The same, for a list up the y-axis.
          const name = id.slice(7);
          setData((p) => ({ ...p, xSummary: name, x: undefined, regression: undefined, movable: undefined, plot: p.plot === "box" || p.plot === "pie" || p.plot === "bar" ? p.plot : "histogram", window: undefined }));
        } else if (id.startsWith("dsSplit:")) setData((p) => ({ ...p, split: id.slice(8), window: undefined }));
        else if (id.startsWith("dsVar:")) {
          const [, axis, name] = id.split(":");
          setData((p) => {
            const next = { ...p, [axis === "x" ? "x" : "y"]: name, ...(axis === "y" ? { ySummary: undefined } : { xSummary: undefined }), window: undefined };
            // Two lists make a scatter plot, one a dot plot, as on the handheld.
            if (next.x && next.y && ONE_VAR.includes(next.plot)) next.plot = "scatter";
            if (!next.y && !ONE_VAR.includes(next.plot)) next.plot = "dot";
            return next;
          });
        } else if (id === "dsRemoveX")
          setData((p) => ({ ...p, x: undefined, xSummary: undefined, forceX: undefined, plot: ONE_VAR.includes(p.plot) ? p.plot : "dot", regression: undefined, movable: undefined, window: undefined }));
        else if (id === "dsRemoveY")
          setData((p) => ({ ...p, y: undefined, ySummary: undefined, forceY: undefined, plot: ONE_VAR.includes(p.plot) ? p.plot : "dot", regression: undefined, movable: undefined, window: undefined }));
        else if (id === "dsClearAll") setData((p) => ({ kind: "datastats", id: p.id, problem: p.problem, plot: "dot" }));
        else if (id === "dsRemoveAnalysis")
          setData((p) => ({
            ...p,
            regression: undefined,
            movable: undefined,
            functions: undefined,
            values: undefined,
            shade: undefined,
            normalPdf: undefined,
            residualSquares: undefined,
            residualPlot: undefined,
          }));
        else if (id.startsWith("dsReg:")) {
          const kind = id.slice(6);
          setData((p) => ({ ...p, regression: p.regression === kind ? undefined : kind }));
        } else if (id === "dsMovable")
          setData((p) => {
            const w = shownWin ?? { xmin: -10, xmax: 10, ymin: -10, ymax: 10, xscl: 1, yscl: 1 };
            // One list: a vertical line at the middle of the window, showing its x, as the handheld adds it.
            if (!p.y && !p.ySummary) return { ...p, movable: { m: 0, b: 0, vx: Number(((w.xmin + w.xmax) / 2).toPrecision(6)) } };
            // A line through the middle of the window, at half its diagonal's slope.
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
      } else if (action.id === "notes:hideAnswer" && page?.kind === "notes") update("notes", (p) => ({ ...p, hideAnswer: !p.hideAnswer }));
      else if (action.id === "notesSlider" && page?.kind === "notes") {
        // Insert ▸ Slider: Slider Settings for a new variable (v1, v2 …), as Graphs and Geometry do.
        newSlider(page.sliders);
      }
      else if (action.id.startsWith("notes:") && page?.kind === "notes") notesApi.current?.action(action.id);
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
              // The handheld's Make Default is a button; the wizard has only OK and Cancel, so it's a box to tick.
              { label: "Make Default", value: "No", check: true },
            ],
            build: "settings:{0}:{1}:{3}:{4}:{9}",
          }),
        );
      } else if (action.id.startsWith("prg") && !action.id.startsWith("prgm") && page?.kind === "program") {
        const id = action.id;
        const el = prgEditor.current;
        const ask = (title: string, fields: WizardField[], build: string) => setWizard(openWizard({ kind: "wizard", title, arrows: false, fields, build }));
        if (id === "prgStore" || id === "prgCheck") void storeProgram(page, id === "prgStore");
        else if (id === "prgRun")
          void storeProgram(page, true).then((ok) => {
            if (!ok) return;
            // Run: the problem's Calculator page (the one beside the editor first) gets name() in its entry line, as the handheld pastes it.
            const def = readDefinition(page.source);
            const call = def ? `${def.name}(${def.params.length ? CARET : ""})` : "";
            setDoc((d) => {
              const g = d.groups?.find((x) => x.slots.includes(page.id));
              const beside = g ? d.pages.findIndex((q) => q.kind === "calculator" && g.slots.includes(q.id)) : -1;
              const near = beside >= 0 ? beside : d.pages.findIndex((q) => q.kind === "calculator" && problemOf(q) === problemOf(page));
              const withEntry = (q: CalculatorPage): CalculatorPage => ({ ...q, edit: insertText(emptyEdit(), call), sel: null });
              if (near >= 0) {
                const pages = d.pages.slice();
                pages[near] = withEntry(pages[near] as CalculatorPage);
                return { ...d, pages, active: near };
              }
              // No Calculator in the problem: a new Calculator page after the editor's, as the handheld adds one.
              const after = Math.max(...[page.id, ...(g?.slots ?? [])].map((id) => d.pages.findIndex((q) => q.id === id)));
              const pages = d.pages.slice();
              pages.splice(after + 1, 0, withEntry(newPage("calculator", problemOf(page)) as CalculatorPage));
              return { ...d, pages, active: after + 1 };
            });
          });
        else if (id === "prgComment" && el && !page.readOnly) {
          const t = prg.toggleComment(el.value, el.selectionStart, el.selectionEnd);
          setProgram((q) => ({ ...q, source: t.source, status: undefined }));
          setTimeout(() => el.setSelectionRange(t.from, t.to), 0);
        } else if (id === "prgFind") ask("Find", [{ label: "Find:", value: el ? el.value.slice(el.selectionStart, el.selectionEnd) : "" }], "prgfind:{0}");
        else if (id === "prgReplace")
          ask("Find and Replace", [{ label: "Find:", value: el ? el.value.slice(el.selectionStart, el.selectionEnd) : "" }, { label: "Replace with:", value: "" }], "prgreplace:{0}\u0001{1}");
        else if (id === "prgGoto") ask("Go to Line", [{ label: "Line Number:", value: String(prg.lineStatus(page.source, el?.selectionStart ?? 0).line) }], "prggoto:{0}");
        else if (id === "prgBack" && el && prgBack.current !== null) {
          const at = prgBack.current;
          prgBack.current = null;
          el.focus({ preventScroll: true });
          el.setSelectionRange(at, at);
        } else if (id === "prgCopy") ask("Create Copy", [{ label: "Name:", value: "" }], "prgcopy:{0}");
        else if (id === "prgRename") ask("Rename", [{ label: "Name:", value: prg.nameOf(page.source) ?? page.name }], "prgrename:{0}");
        else if (id === "prgAccess") ask("Change Library Access", [{ label: "Library Access:", value: prg.accessOf(page.source), options: ["None", "LibPriv", "LibPub"] }], "prgaccess:{0}");
        else if (id === "prgClose") {
          const close = () => restructure(deletePage(latestDoc.current, latestDoc.current.active), "Error: A document keeps at least one page");
          if (page.readOnly || page.source === page.stored) close();
          else
            setConfirm({
              title: "Program Editor",
              lines: [`"${prg.nameOf(page.source) ?? page.name}" has changes that aren't stored. Store them before closing?`],
              ok: () => undefined,
              buttons: [
                { label: "Yes", run: () => void storeProgram(page, true).then((ok) => ok && close()) },
                { label: "No", run: close },
                { label: "Cancel", run: () => undefined },
              ],
            });
        }
      } else if (action.id === "prgmNew")
        setWizard(
          openWizard({
            kind: "wizard",
            title: "New",
            arrows: false,
            fields: [
              { label: "Name:", value: "" },
              { label: "Type:", value: "Program", options: ["Program", "Function"] },
              { label: "Library Access:", value: "None", options: ["None", "LibPriv", "LibPub"] },
            ],
            build: "prgmnew:{0}:{1}:{2}",
          }),
        );
      else if (action.id === "prgmOpen" || action.id === "prgmView" || action.id === "recallDef") {
        const e = engine.current;
        if (!e) return;
        const sources = [...definedSources(e.saved).keys()];
        const names = action.id === "recallDef" ? [...new Set([...definedNames(e.saved), ...sources])].sort() : sources.sort();
        if (!names.length) return setError(action.id === "recallDef" ? "Error: Nothing is defined in this problem" : "Error: No programs or functions are defined in this problem");
        const title = { prgmOpen: "Open", prgmView: "View", recallDef: "Recall Definition" }[action.id];
        setWizard(openWizard({ kind: "wizard", title, arrows: false, fields: [{ label: "Name:", value: names[0], options: names }], build: `${action.id.toLowerCase()}:{0}` }));
      } else if (action.id === "prgmImport" || action.id === "libShortcut") {
        void loadLibraries().then((objs) => {
          if (!objs.length) return setError("Error: No library objects. A document in My Documents/MyLib defines them with Define LibPub or Define LibPriv.");
          if (action.id === "prgmImport") {
            const names = objs.map((o) => `${o.lib}\\${o.def.name}`);
            setWizard(openWizard({ kind: "wizard", title: "Import", arrows: false, fields: [{ label: "Name:", value: names[0], options: names }], build: "libimport:{0}" }));
          } else {
            const libs = [...new Set(objs.map((o) => o.lib))];
            setWizard(
              openWizard({
                kind: "wizard",
                title: "Create Library Shortcut",
                arrows: false,
                fields: [
                  { label: "Library:", value: libs[0], options: libs },
                  { label: "Shortcut:", value: libs[0]!.slice(0, 2) },
                  { label: "Include Private Objects", value: "No", check: true },
                ],
                build: "libshortcut:{0}:{1}:{2}",
              }),
            );
          }
        });
      } else if (action.id === "refreshLibs") void refreshLibraries();
      else if (action.id === "financeSolver") setFinance({ ...lastFinance.current, focus: 0, fresh: true, list: null });
      else if (action.id === "clearHistory") setCalc((p) => ({ ...p, history: [], sel: null }));
      else if (action.id === "calcShowWarning" && page?.kind === "calculator") setWarning(page.history[page.sel?.entry ?? -1]?.warning ?? null);
      else if (action.id === "calcDeleteEntry")
        // The history entry picked with ▲ goes, input and answer together, as the handheld deletes it.
        setCalc((p) => (p.sel ? { ...p, history: p.history.filter((_, i) => i !== p.sel!.entry), sel: null } : p));
      else if (action.id === "openSymbols") setCatalog(openCatalog(4));
      else if (action.id === "openTemplates") setPalette(0);
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
    [prepWizard, addPage, graphAction, pageKey, setCalc, settings, doc, setup, rows, browse, page, newDoc, writeNow, refreshFiles, showStatus, openFile, downloadFile, tnsOf, setLists, recalcLists, runPython, updatePage, startNew, closeDocument, saveDocument, isScratch, refreshLibraries], // eslint-disable-line react-hooks/exhaustive-deps
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
      if (/^(prgmnew|prgmopen|prgmview|recalldef|libimport|libshortcut):/.test(built)) {
        void programWizard(built);
        return;
      }
      if (built.startsWith("problemrename:")) {
        const n = problemOf(latestDoc.current.pages[latestDoc.current.active]);
        setDoc((d) => renameProblem(d, n, built.slice(14)));
        return;
      }
      if (/^(gridtype|hideshow|attrs|condition|gtext|coords|gcalc|redefine|pathsetup|gsettings):/.test(built)) {
        void graphsWizard(built);
        return;
      }
      if (built.startsWith("tracestep:")) {
        const v = built.slice(10).trim();
        const step = v === "Auto" || !v ? undefined : Number(v);
        if (step !== undefined && !(step > 0)) return setError("Error: The step is a positive number, or Auto");
        setGraphs((g) => ({ ...g, traceStep: step }));
        return;
      }
      if (built.startsWith("seqcustom:")) {
        const [x, y] = built.slice(10).split(":").map((v) => Number(v.trim().slice(1)));
        setGraphs((g) => {
          const n = Math.max(0, ...(g.customPlots ?? []).map((c) => c.n)) + 1;
          return { ...g, customPlots: [...(g.customPlots ?? []), { n, x: x!, y: y! }] };
        });
        return;
      }
      if (built.startsWith("request:")) {
        const answer = asking.current;
        asking.current = null;
        answer?.(built.slice(8));
        return;
      }
      if (built.startsWith("geocond:")) {
        const [id = "", show = "", line = "", fill = ""] = built.slice(8).split("\u0001").map((v) => v.trim());
        for (const src of [show, line, fill]) {
          if (!src) continue;
          try {
            parse(src);
          } catch {
            return setError("Error: Syntax error in a condition");
          }
        }
        const cond = show || line || fill ? { ...(show ? { show } : {}), ...(line ? { line } : {}), ...(fill ? { fill } : {}) } : undefined;
        const withCond = (p: GeometryPage) => ({ ...p, objects: p.objects.map((o) => (o.id === id ? { ...o, cond } : o)) });
        if (page?.kind === "graphs") setGraphGeo(withCond);
        else setGeo(withCond);
        return;
      }
      if (/^prg(find|replace|goto|copy|rename|access):/.test(built) && page?.kind === "program") {
        const [kind = "", ...restParts] = built.split(":");
        const arg = restParts.join(":");
        const el = prgEditor.current;
        const name = (n: string) => n.trim().toLowerCase();
        if (kind === "prgfind" && el) {
          const what = arg;
          if (!what) return;
          // From just after the caret, round to the top again.
          let at = el.value.indexOf(what, el.selectionEnd);
          if (at < 0) at = el.value.indexOf(what);
          if (at < 0) return setError("Error: Not found");
          prgBack.current = el.selectionStart;
          el.focus({ preventScroll: true });
          el.setSelectionRange(at, at + what.length);
        } else if (kind === "prgreplace") {
          const [what = "", by = ""] = arg.split("\u0001");
          if (!what) return;
          const n = page.source.split(what).length - 1;
          if (!n) return setError("Error: Not found");
          setProgram((q) => ({ ...q, source: q.source.split(what).join(by), status: undefined }));
          toast(`${n} replaced`);
        } else if (kind === "prggoto" && el) {
          const n = Math.round(Number(arg.trim()));
          const { total } = prg.lineStatus(page.source, 0);
          if (!(n >= 1 && n <= total)) return setError(`Error: The line number is 1 to ${total}`);
          prgBack.current = el.selectionStart;
          // Body lines are counted after the Define line and the block's first line.
          const at = prg.lineStart(page.source, n + 2);
          el.focus({ preventScroll: true });
          el.setSelectionRange(at, at);
        } else if (kind === "prgcopy" || kind === "prgrename") {
          const n = name(arg);
          if (!/^[a-z][\w]*$/.test(n)) return setError("Error: A name is letters, digits and _, starting with a letter");
          if (definedNames(engine.current?.saved ?? []).has(n)) return setError("Error: That name is already used in this problem");
          if (kind === "prgcopy") openProgram({ name: n, source: prg.renamed(page.source, n) });
          else {
            // Rename: stored under the new name, and the old name's definition taken away.
            const old = prg.nameOf(page.source) ?? page.name;
            const next = { ...page, name: n, source: prg.renamed(page.source, n) };
            setProgram(() => next);
            void storeProgram(next, true).then(async (ok) => {
              const e = engine.current;
              if (!ok || !e || !page.stored) return;
              const r = await evaluate(`DelVar ${old}`, e.giac, { settings: current.current.settings });
              if (r.ok) for (const d of definitionsOf(r)) e.remember(d);
              setDefined(definedNames(e.saved));
            });
          }
        } else if (kind === "prgaccess") setProgram((q) => ({ ...q, source: prg.withAccess(q.source, arg.trim() as prg.LibraryAccess), status: undefined }));
        return;
      }
      if (built.startsWith("geopathsetup:")) {
        // As Graphs' Path Setup: a positive number of seconds (worked out, so 3/2 is fine).
        const e = engine.current;
        void (async () => {
          let s = NaN;
          try {
            s = e ? Number((await e.giac(`evalf(${translate(parse(field("geopathsetup:") || "0"), settings).giac})`)).trim()) : NaN;
          } catch {
            // A syntax error: refused below.
          }
          if (!(s > 0)) setError("Error: The duration is a positive number of seconds");
          else setGeo((p) => ({ ...p, pathSeconds: s }));
        })();
        return;
      }
      if (built.startsWith("geosettings:")) {
        const v = built.slice(12).split(":");
        setGeo((p) => ({ ...p, gsettings: { ...p.gsettings, ...geoSettingsFrom(v) } }));
        return;
      }
      if (built.startsWith("geowindow:")) {
        const [xmin, xmax, , ymin, ymax] = built.slice(10).split(":").map((v) => Number(v.trim().replace(/−/g, "-")));
        if (![xmin, xmax, ymin, ymax].every(Number.isFinite) || !(xmax! > xmin!) || !(ymax! > ymin!)) return setError("Error: Invalid window settings");
        // The plane stays square: the width is kept, and the middle of the heights.
        const view = { x: (xmin! + xmax!) / 2, y: (ymin! + ymax!) / 2, w: xmax! - xmin! };
        setGeo((p) => ({ ...p, view, userView: view }));
        return;
      }
      if (built.startsWith("geostore:")) {
        // geostore:<measurement>:<variable>; an empty name unlinks it.
        const [id, name = ""] = built.slice(9).split(":").map((v) => v.trim());
        if (name && !VAR_NAME.test(name)) return setError("Error: A variable name is letters, digits and _, starting with a letter");
        setGeo((p) => ({
          ...p,
          objects: p.objects.map((o) => (o.kind !== "measure" && o.kind !== "calc" ? o : o.id === id ? { ...o, store: name || undefined } : o.store === name ? { ...o, store: undefined } : o)),
        }));
        return;
      }
      if (built.startsWith("geoamount:")) {
        // geoamount:<tool>:<object>:<centre>:<number> (a fraction a/b is fine too).
        const [tool, obj, centre, text = ""] = built.slice(10).split(":");
        const m = /^\s*(-?[\d.]+)\s*(?:\/\s*([\d.]+))?\s*$/.exec(text.replace("−", "-"));
        const n = m ? Number(m[1]) / (m[2] ? Number(m[2]) : 1) : NaN;
        if (!Number.isFinite(n)) return setError("Error: Type a number");
        (page?.kind === "graphs" ? setGraphGeo : setGeo)((p) => {
          const r = transformWith(p.objects, tool as GeoTool, [obj!, centre!], n);
          if ("error" in r) {
            setTimeout(() => setError(`Error: ${r.error}`));
            return p;
          }
          return { ...p, objects: r.objs! };
        });
        return;
      }
      if (/^geo(hide|attrs|text|label):/.test(built)) {
        const set = page?.kind === "graphs" ? setGraphGeo : setGeo;
        const [kind = "", ...rest] = built.split(":");
        if (kind === "geohide") {
          const [names = "", ...vals] = rest;
          const shown = new Map(names.split(",").map((n, i) => [n, vals[i]?.trim() !== "No"]));
          set((p) => ({
            ...p,
            objects: p.objects.map((o) => (shown.has(o.id) ? { ...o, hidden: !shown.get(o.id) || undefined } : o)),
            sel: p.sel && shown.get(p.sel) === false ? null : p.sel,
          }));
          const hidden = [...shown].filter(([, v]) => !v).map(([n]) => n);
          return say(hidden.length ? `Hidden: ${hidden.join(", ")}` : "Every object shown");
        }
        if (kind === "geoattrs") {
          const [id = "", weight, style, colour] = rest.map((v) => v.trim());
          set((p) => ({
            ...p,
            objects: p.objects.map((o) =>
              o.id !== id ? o : { ...o, attrs: { weight: weight as "Thin", style: style as "Continuous", colour: colour === "Auto" ? undefined : colour } },
            ),
          }));
          return say(`${id}: ${weight}, ${style}${colour && colour !== "Auto" ? `, ${colour}` : ""}`);
        }
        if (kind === "geotext") {
          const [xs = "", ys = "", ...text] = rest;
          const [x, y] = [Number(xs.trim().replace("−", "-")), Number(ys.trim().replace("−", "-"))];
          if (![x, y].every(Number.isFinite)) return setError("Error: The place is two numbers, x and y");
          if (!text.join(":").trim()) return;
          return setGeo((p) => ({ ...p, texts: [...(p.texts ?? []), { x, y, text: text.join(":") }] }));
        }
        const of = rest.join(":").trim();
        set((p) => (p.objects.some((o) => o.id === of) ? { ...p, objects: [...p.objects, { id: nextGeoId(p.objects, "coords"), kind: "coords", of }] } : p));
        return;
      }
      if (built.startsWith("geocoords:")) {
        const [xs = "", ys = ""] = built.slice(10).split(":");
        const [x, y] = [Number(xs.trim().replace("−", "-")), Number(ys.trim().replace("−", "-"))];
        if (![x, y].every(Number.isFinite)) return setError("Error: Type two numbers");
        (page?.kind === "graphs" ? setGraphGeo : setGeo)((p) => ({ ...p, objects: [...p.objects, { id: nextGeoLabel(p.objects), kind: "point", x, y }] }));
        return;
      }
      if (built.startsWith("saveas:")) {
        const name = field("saveas:").replace(/\.tns$/i, "");
        if (badName(name)) return setError("Error: Invalid file name");
        void (async () => {
          const path = files.join(files.ROOT, await files.freeName(files.ROOT, `${name}.tns`));
          const s: Saved = { doc: { ...current.current.doc, title: stem(files.nameOf(path)) }, settings: current.current.settings, definitions: engine.current?.saved ?? [] };
          try {
            await files.put({ path, type: "file", doc: s, size: files.sizeOf(s), modified: Date.now() });
          } catch (err) {
            afterSave.current = null;
            toast.error(`Couldn't save: ${(err as Error).message || "the browser refused"}`);
            return;
          }
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
      if (built.startsWith("ptt:")) {
        const p = parsePtt(built);
        setConfirm({
          title: "Press-to-Test",
          lines: ["Start Press-to-Test with:", ...pttLines(p).map((l) => `  ${l}`), "", "Your documents are put away until the test ends. Anything made during the test is deleted then."],
          ok: () => undefined,
          buttons: [
            {
              label: "Start Test",
              run: () =>
                void leaveOk().then(async (go) => {
                  if (!go) return;
                  await writeNow();
                  enterTest(p);
                }),
            },
            { label: "Cancel", run: () => undefined },
          ],
        });
        return;
      }
      if (built.startsWith("setup:")) {
        const next = parseSetup(built);
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
          if (!args[0]?.trim()) setData((p) => ({ ...p, bins: undefined, binEdges: undefined, window: undefined }));
          else if (!(width! > 0)) setError("Error: The bin width must be more than 0");
          else setData((p) => ({ ...p, bins: { width: width!, start: Number.isFinite(start) ? start! : 0 }, binEdges: undefined, window: undefined }));
        } else if (what === "vbins") {
          // Variable Bin Width: the boundaries as a list ({0,10,25,50}) or a list's name; Equal Bin Width undoes it.
          const edges = args.join(":").trim();
          if (!edges) setError("Error: Enter the bin boundaries");
          else setData((p) => ({ ...p, binEdges: edges, bins: undefined, window: undefined }));
        } else if (what === "text") {
          const text = args.join(":").trim();
          if (text)
            setData((p) => {
              const texts = p.texts ?? [];
              // New texts go down the left, under the last one (clear of a selection's readout).
              return { ...p, texts: [...texts, { text, x: 0.04, y: Math.min(0.85, 0.14 + texts.length * 0.08) }] };
            });
        } else if (what === "fn" && args.join(":").trim()) setData((p) => ({ ...p, functions: [...(p.functions ?? []), args.join(":").trim()] }));
        else if (what === "value" && args.join(":").trim()) setData((p) => ({ ...p, values: [...(p.values ?? []), args.join(":").trim()] }));
        else if (what === "window") {
          const [xmin, xmax, ymin, ymax] = args.map(Number);
          if (![xmin, xmax, ymin, ymax].every(Number.isFinite) || xmin! >= xmax! || ymin! >= ymax!) setError("Error: Invalid window settings");
          else setData((p) => ({ ...p, window: { xmin: xmin!, xmax: xmax!, ymin: ymin!, ymax: ymax!, xscl: 1, yscl: 1 } }));
        } else if (what === "settings") setData((p) => ({ ...p, digits: args[0], diagnostics: args[1] === "Yes" }));
        else if (what === "shade") {
          const fn = parseInt(args[0] ?? "1", 10) - 1;
          const [from, to] = [args[1]?.trim(), args[2]?.trim()];
          if (!from || !to) setError("Error: Enter both bounds");
          else setData((p) => (p.functions?.[fn] ? { ...p, shade: { fn, from, to } } : p));
        }
        return;
      }
      if (built.startsWith("lists:dist:") && page?.kind === "lists") {
        // A distribution from the spreadsheet goes into the selected cell as its formula (=normCdf(-∞,1,0,1)), as on the handheld.
        const rest = built.slice("lists:dist:".length);
        const draw = rest.startsWith("Yes:");
        const formula = rest.replace(/^(Yes|No):/, "");
        // Shade area: the distribution's curve beside the spreadsheet, the area between the bounds shaded.
        if (draw) void drawDistribution(formula, problemOf(page));
        const target = page.sel.row < 2 ? { ...page, sel: { row: 2, col: page.sel.col } } : page;
        const next = { ...target, edit: setRow(chars(`=${formula}`)) };
        const { page: done } = sheet.listsKey(next, { k: "enter" });
        setLists(() => done);
        void recalcLists(done);
        return;
      }
      if ((built.startsWith("lists:stat:") || built.startsWith("lists:statp:")) && page?.kind === "lists") {
        // A procedure from the spreadsheet: its results' names in the 1st Result Column, their values beside it,
        // each value column a formula that runs the procedure again when the data changes, as on the handheld.
        // A test's dialog also has Shade P value (lists:statp:Yes:…).
        const shadeP = built.startsWith("lists:statp:Yes:");
        const rest = built.startsWith("lists:statp:") ? built.replace(/^lists:statp:(Yes|No):/, "") : built.slice("lists:stat:".length);
        const cut = rest.indexOf(":");
        const target = /^\s*([a-z])\s*(\[\s*\])?\s*$/i.exec(rest.slice(0, cut));
        if (!target) return setError("Error: Invalid column reference");
        const col = target[1]!.toLowerCase().charCodeAt(0) - 97;
        // The page as it is when the work comes back: the student may have typed meanwhile.
        const latestLists = () => (latestDoc.current.pages.find((q) => q.id === page.id && q.kind === "lists") as ListsPage | undefined) ?? page;
        const [proc = "", ...after] = rest.slice(cut + 1).split(":").map((x) => x.trim());
        // CopyVar stat.RegEqn,f1 and the like; stat.results is what the columns show.
        const side = after.filter((x) => x && x !== "stat.results");
        const m = /^(\S+)\s*(.*)$/.exec(proc);
        if (!m) return;
        const [, name, args = ""] = m;
        const parts = sheet.splitList(`{${args}}`);
        // OneVar n, List1, …: a value column for each list, as the handheld lays them out.
        const multi = name === "OneVar" && /^\d+$/.test(parts[0]?.trim() ?? "") && Number(parts[0]) > 1;
        const formulas = multi ? parts.slice(1).map((l) => `=OneVar(${l.trim()},1)`) : [`=${name}(${args})`];
        const go = async () => {
          const first = formulas[0]!.slice(1);
          const r = await notesEvaluate(sheet.columnRefs(first, latestLists().cols), false);
          if (!r.ok) return setError(r.text.startsWith("Error") ? r.text : `Error: ${r.text}`);
          for (const cmd of side) {
            const s2 = await notesEvaluate(cmd, false);
            if (!s2.ok) return setError(s2.text.startsWith("Error") ? s2.text : `Error: ${s2.text}`);
          }
          const e = engine.current;
          const store = e ? await loadStats(e.giac).catch(() => null) : null;
          if (!store) return;
          const next = sheet.setStatColumns(latestLists(), col, store.rows.map(([label]) => label), formulas);
          setLists(() => next);
          void recalcLists(next);
          if (shadeP) void drawPValue(store.rows, problemOf(page));
        };
        if (sheet.columnsUsed(page, col, formulas.length + 1)) askDataLoss(() => void go());
        else void go();
        return;
      }
      if (built.startsWith("listsconflict:") && page?.kind === "lists") {
        // Each letter as the student settled it: a column reference becomes x[], a variable stays x; then the entry goes in.
        const pending = listsConflict.current;
        listsConflict.current = null;
        if (!pending || !page.edit) return;
        const picks = built.slice("listsconflict:".length).split(":");
        const choices = Object.fromEntries(pending.names.map((n, i) => [n, picks[i] === "Variable Reference" ? ("variable" as const) : ("column" as const)]));
        const { page: next, effect } = sheet.listsKey(sheet.withFormula(page, sheet.resolveConflicts(pending.formula, choices)), pending.key);
        setLists(() => next);
        listsEffect(next, effect);
        return;
      }
      if (built.startsWith("lists:tableset:") && page?.kind === "lists") {
        const [start, step] = built.slice("lists:tableset:".length).split(":").map((v) => Number(v.replace(/−/g, "-")));
        if (!Number.isFinite(start) || !(step! > 0)) setError("Error: Invalid table settings");
        else setLists((p) => ({ ...p, table: { start: start!, step: step! } }));
        return;
      }
      if (built.startsWith("lists:summary:") && page?.kind === "lists") {
        // Summary Plot: the X list's values counted by the summary list, in Data & Statistics beside the spreadsheet or on a new page.
        const [, , x = "", summary = "", where = ""] = built.split(":");
        if (!x || !summary) return setError("Error: Choose the lists");
        const plot = { ...(newPage("datastats", problemOf(page)) as DataStatsPage), x, ySummary: summary, plot: "histogram" as const };
        if (where === "New Page") {
          setDoc((d) => {
            const pages = d.pages.slice();
            const u = units(d)[unitOf(d, d.active)];
            const at = u ? Math.max(...u.pages) + 1 : d.active + 1;
            pages.splice(at, 0, plot);
            return { ...d, pages, active: at };
          });
        } else setDoc((d) => splitWith(d, plot));
        return;
      }
      if (built.startsWith("lists:tablechoose:") && page?.kind === "lists") {
        // Choose…: the selected table column shows this function instead (a new column when there's none).
        const n = Number(built.slice("lists:tablechoose:".length).replace(/^f/, ""));
        setLists((p) => {
          if (!p.table) return p;
          const shown = tableColumns(p, problemFunctions(latestDoc.current, problemOf(p))).map((f) => f.n);
          const col = p.table.col ?? 0;
          const fns = shown.length ? shown.map((v, i) => (i === col ? n : v)) : [n];
          return { ...p, table: { ...p.table, fns } };
        });
        return;
      }
      if (built.startsWith("lists:tableedit:") && page?.kind === "lists") {
        // Edit Expression: the function's definition changed where it lives, on its Graphs page, and in the engine.
        const [, , nText = "", ...text] = built.split(":");
        const n = Number(nText);
        const expr = text.join(":").trim();
        const home = latestDoc.current.pages.find((q) => q.kind === "graphs" && problemOf(q) === problemOf(page) && q.functions.some((f) => f.n === n));
        if (!home || home.kind !== "graphs" || !expr) return;
        void (async () => {
          try {
            const def = `${fnName(home.id, n)}(x):=${translate(parse(expr), settings).giac}`;
            await engine.current?.giac(def);
            engine.current?.remember(def);
          } catch {
            return setError("Error: Syntax error");
          }
          updatePage(home.id, (q) => (q.kind === "graphs" ? { ...q, functions: q.functions.map((f) => (f.n === n ? { ...f, text: expr } : f)) } : q));
        })();
        return;
      }
      if (built.startsWith("lists:goto:") && page?.kind === "lists") {
        // A cell reference such as B5 (or b5): its column letter and row number.
        const m = /^\s*([a-z])\s*(\d+)\s*$/i.exec(built.slice("lists:goto:".length));
        if (!m || Number(m[2]) < 1) return setError("Error: Invalid cell reference");
        setLists((p) => ({ ...p, edit: null, sel: { row: Number(m[2]) + 1, col: m[1]!.toUpperCase().charCodeAt(0) - 65 } }));
        return;
      }
      if (built.startsWith("lists:name:") && page?.kind === "lists") {
        // Store Var on a column's name: the column becomes that list.
        const name = built.slice(11).trim();
        if (!/^[a-zA-Z]\w*$/.test(name)) return setError("Error: Invalid name");
        const next = sheet.patchColumn(page, { name });
        setLists(() => next);
        void recalcLists(next);
        return;
      }
      if (built.startsWith("lists:sort:") && page?.kind === "lists") {
        const next = sheet.sortColumn(page, built.endsWith("Descending"));
        setLists(() => next);
        void recalcLists(next);
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
      }
      if (built.startsWith("settings:")) {
        const [digits, angle, complex, mode, makeDefault] = built.slice(9).split(":");
        const next: Settings = {
          digits: digits === "Float" ? 12 : Number(digits?.replace("Float", "")) || 6,
          angle: angle === "Degree" ? "deg" : "rad",
          complex: complex === "Rectangular" ? "rect" : complex === "Polar" ? "polar" : "real",
          mode: mode === "Exact" ? "exact" : mode === "Approximate" ? "approx" : "auto",
        };
        setSettings(next);
        void engine.current?.applySettings(next);
        // New documents start with these from now on (state/setup.ts docDefaults).
        if (makeDefault === "Yes") setPref("docDefaults", next);
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
        if (page?.kind === "geometry") {
          setGeo((p) => ({ ...p, sliders: placeSlider(p.sliders, old, sl) }));
          return;
        }
        if (page?.kind === "notes") {
          update("notes", (p) => ({ ...p, sliders: placeSlider(p.sliders, old, sl) }));
          // A new slider goes in the text at the caret; Settings renaming one renames its place.
          setTimeout(() => notesApi.current?.placeSlider(sl.name, old || undefined), 0);
          return;
        }
        if (page?.kind === "datastats") {
          // Data & Statistics keeps its sliders in a column down the left; Settings keeps one's place in it.
          setData((p) => ({ ...p, sliders: placeSlider(p.sliders, old, sl) }));
          return;
        }
        setGraphs((g) => {
          const at = (g.sliders ?? []).findIndex((x) => x.name === old);
          // Settings keep the slider where Move put it. Insert Slider puts a new
          // one at the right edge, just above the x-axis.
          return { ...g, sliders: placeSlider(g.sliders, old, { ...sl, at: at < 0 && !old ? INSERTED_AT : g.sliders?.[at]?.at }) };
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
        const window = { xmin: xmin!, xmax: xmax!, xscl: xscl!, ymin: ymin!, ymax: ymax!, yscl: yscl! };
        setGraphs((g) => ({ ...g, window, userWindow: window }));
        return;
      }
      if (built.startsWith("notesattrs:")) {
        const [, input, output] = built.split(":");
        notesApi.current?.setAttrs({ hideIn: input === "Hide", hideOut: output === "Hide" });
        return;
      }
      if (page?.kind === "notes") {
        notesApi.current?.insertMath(wizardLinear(built));
        return;
      }
      // A template from the palette's dialogs (Matrix, m by n) goes into the
      // selected cell, starting an edit the way a template key does.
      if (page?.kind === "lists" && isTemplateWizard(built)) {
        setLists((p) => ({ ...p, edit: wizardInsert(p.edit ?? emptyEdit(), built) }));
        return;
      }
      setCalc((p) => ({ ...p, edit: wizardInsert(p.edit, built), sel: null }));
      setGraphs((g) => (g.editing !== null ? { ...g, edit: wizardInsert(g.edit, built) } : g));
    },
    [setCalc, setGraphs, assign, rows, browse, page, refreshFiles, remember, setLists, recalcLists, listsEffect, programWizard, notesEvaluate, drawDistribution, drawPValue, settings, updatePage],
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

  /** The problem's variables as the var key and the context menus list them (names ending _ are the engine's own). */
  const userVars = useMemo(() => [...defined].filter((n) => !/_$/.test(n)).sort(), [defined]);

  const handleKey = useCallback(
    (key: Key) => {
      // A program's finished drawing goes at the next key, as the handheld's does.
      if (basicDraw?.done) {
        setBasicDraw(null);
        return;
      }
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
        if (!r.state && !r.action) fillTarget.current = null;
        if (!r.state && !r.action && creatingNew.current) {
          creatingNew.current = false;
          setView(backTo.current);
        }
        runAction(r.action);
        return;
      }
      if (wizard) {
        const r = wizardKeyPress(wizard, key);
        // A next step (Num of Lists → the lists) gets its defaults filled in as a dialog opened from the menu does.
        setWizard(r.state && r.state.wizard !== wizard.wizard && r.state !== wizard.back ? prepWizard(r.state) : r.state);
        if (r.error) setError(r.error);
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
      if (sorter !== null) {
        sorterKey(key);
        return;
      }
      if (splitting) {
        if (key.k === "left" || key.k === "up") setDoc((d) => moveSplit(d, -0.05));
        else if (key.k === "right" || key.k === "down") setDoc((d) => moveSplit(d, 0.05));
        else if (key.k === "enter" || key.k === "esc") setSplitting(false);
        return;
      }
      if (key.k === "switchApp") {
        focusRegion(1);
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
        else if (key.k === "esc") void openCurrent();
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
      if (key.k === "ctxmenu") {
        // ctrl menu: the context menu, where a page has one built; elsewhere the page's menu, as before.
        if (page?.kind === "lists" && !page.table) {
          setMenu({ items: listsContextMenu(page, listsInfo(page)), state: openMenu() });
          return;
        }
        if (page?.kind === "geometry") {
          setMenu({ items: geometryContextMenu(page, recentUsed.current.geometry ?? [], [...defined].sort()), state: openMenu() });
          return;
        }
        if (page?.kind === "notes") {
          const here = notesApi.current?.context() ?? { inBox: false, selection: false, warning: false, inactive: false };
          setMenu({ items: notesContextMenu({ ...here, variables: userVars }), state: openMenu() });
          return;
        }
        if (page?.kind === "datastats") {
          setMenu({ items: dataContextMenu(page, dataInfo.current, COLOUR_PALETTE), state: openMenu() });
          return;
        }
        if (page?.kind === "calculator") {
          const entry = page.history[page.sel?.entry ?? -1];
          const edit = page.edit;
          setMenu({
            items: calculatorContextMenu({
              entry: page.sel === null,
              selection: edit.anchor !== undefined && edit.anchor !== edit.cursor.index,
              warning: Boolean(entry?.warning),
              variables: userVars,
            }),
            state: openMenu(),
          });
          return;
        }
        if (page?.kind === "graphs" && page.view !== "3d" && page.geo?.sel) {
          // A selected point, line or shape: its own menu, as on a Geometry page (with axes unless the view is Plane Geometry).
          setMenu({ items: onGraphsPage(geometryContextMenu({ ...geoOfGraph(page), axes: page.view !== "plane" }, recentUsed.current.graphs ?? [], [...defined].sort())), state: openMenu() });
          return;
        }
        if (page?.kind === "graphs" && page.view !== "3d" && !page.geo?.sel) {
          const state = { axes: page.axes, entryLine: page.editing !== null, grid: page.grid, table: page.table, view: page.view, pick: page.pick, pinAll: page.pinAll, traced: Boolean(page.geoTrace) };
          setMenu({ items: graphsContextMenu(state, recentUsed.current.graphs ?? [], COLOUR_PALETTE), state: openMenu() });
          return;
        }
      }
      if (key.k === "menu" || key.k === "ctxmenu") {
        if (page?.kind === "lists") {
          // An unnamed column is a[] (column A), as the handheld writes it in the dialogs.
          const name = (i: number) => page.cols[i]?.name ?? `${sheet.letter(i).toLowerCase()}[]`;
          // A command Data pastes starts a cell with =; the formula row and an open edit need none.
          const prefix = page.edit || page.sel.row < 2 ? "" : "=";
          // y starts on the next column only when it holds data, and results go in the column after the selected one, as on the handheld.
          const next = page.cols[page.sel.col + 1];
          const y = next && (next.formula || next.cells.some((c) => c !== "")) ? name(page.sel.col + 1) : "";
          const result = page.sel.col + 1 < sheet.COLS ? `${sheet.letter(page.sel.col + 1).toLowerCase()}[]` : "";
          setMenu({ items: listsMenu(name(page.sel.col), y, page.table, prefix, result, listsInfo(page)), state: openMenu() });
          return;
        }
        if (page?.kind === "datastats") {
          setMenu({ items: dataMenu(page, dataInfo.current), state: openMenu() });
          return;
        }
        if (page?.kind === "geometry") {
          setMenu({ items: geometryMenu(page), state: openMenu() });
          return;
        }
        if (page?.kind === "notes") {
          setMenu({ items: notesMenu(page), state: openMenu() });
          return;
        }
        if (page?.kind === "python" || page?.kind === "pyshell") {
          setMenu({ items: page.kind === "python" ? PYTHON_MENU : SHELL_MENU, state: openMenu() });
          return;
        }
        if (page?.kind === "program") {
          setMenu({ items: programMenu({ readOnly: Boolean(page.readOnly), back: prgBack.current !== null }), state: openMenu() });
          return;
        }
        setMenu({
          items:
            page?.kind === "graphs"
              ? graphsMenu({ axes: page.axes, entryLine: page.editing !== null, grid: page.grid, table: page.table, hideAnalytic: page.hideAnalytic, hideEndValues: page.hideEndValues, hideGuides: page.hideGuides, view: page.view, hideScale: page.hideScale })
              : calculatorMenu,
          state: openMenu(),
        });
        return;
      }
      if (key.k === "doc") {
        setMenu({ items: DOC_MENU, state: openMenu() });
        return;
      }
      if (key.k === "vars") {
        // var: the problem's variables, to type one where the cursor is (or give Calculate its value).
        const names = userVars;
        setMenu({ items: names.length ? names.map((n) => menuApp(n, `varpick:${n}`)) : [{ label: "(no variables)", unavailable: "the problem has no variables yet" }], state: openMenu() });
        return;
      }
      if (key.k === "insertPage") {
        creatingNew.current = false;
        setMenu({ items: ADD_PAGE, state: openMenu() });
        return;
      }
      if (key.k === "prevPage" || key.k === "nextPage") {
        // By page tab: a page laid out with several apps is one step.
        setDoc((d) => {
          const all = units(d);
          const u = Math.max(0, Math.min(all.length - 1, unitOf(d, d.active) + (key.k === "prevPage" ? -1 : 1)));
          return all[u]!.pages.includes(d.active) ? d : { ...d, active: all[u]!.pages[0]! };
        });
        return;
      }
      // Esc steps back: it cancels what's open on the page first, then leaves the document.
      if (key.k === "esc" && !pageTakesEsc(page, py) && !(page?.kind === "notes" && notesApi.current?.panelOpen())) {
        leaveDocument();
        return;
      }
      pageKey(key);
    },
    [
      basicDraw,
      prepWizard,
      listsInfo,
      userVars,
      defined,
      sorter,
      splitting,
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
      openCurrent,
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
    // The Program Editor is a real text box too; its own shortcuts (Ctrl+B store, Ctrl+R run, Ctrl+T comment,
    // Ctrl+F find, Shift+Ctrl+H replace, Ctrl+G go to line) run its menu's items, as the handheld lists them.
    if ((e.target as HTMLElement).dataset.prgEditor !== undefined) {
      const ctrl = e.ctrlKey || e.metaKey;
      const k = e.key.toLowerCase();
      const shortcut = ctrl ? (e.shiftKey ? { h: "prgReplace" } : ({ b: "prgStore", r: "prgRun", t: "prgComment", f: "prgFind", g: "prgGoto" } as Record<string, string>))[k] : undefined;
      if (shortcut) {
        e.preventDefault();
        runAction({ kind: "app", id: shortcut });
        return;
      }
      const ours = ctrl ? ["m", "k", "i", "h", "s", "arrowleft", "arrowright"].includes(k) : ["Escape", "ContextMenu", "Tab"].includes(e.key);
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

  /**
   * Edit → Copy as LaTeX / MathML: the selected part of the entry line or of a
   * history item, else the selected history item, else the whole entry line,
   * laid out as the screen shows it.
   */
  const copyAs = (format: "latex" | "mathml") => {
    let row: Row | null = null;
    if (page?.kind === "calculator" && page.sel) {
      const h = page.history[page.sel.entry];
      const caret = page.sel.caret;
      if (caret && selection(caret)) row = selectedNodes(caret);
      else if (h) row = page.sel.part === "input" ? h.input : h.output;
    } else if (page?.kind === "calculator" || page?.kind === "graphs") {
      row = selection(page.edit) ? selectedNodes(page.edit) : page.edit.row;
    }
    if (!row?.length) {
      toast("Select an entry first: ▲ picks the last answer.");
      return;
    }
    const text = format === "latex" ? rowToLatex(row) : rowToMathML(row);
    void navigator.clipboard
      ?.writeText(text)
      .then(() => toast.success(format === "latex" ? "Copied as LaTeX" : "Copied as MathML"))
      .catch(() => setError("Error: The browser didn't allow writing to the clipboard."));
  };

  editOps.current = {
    copy: copySelection,
    cut: () => {
      if (page?.kind === "calculator" && page.sel) copySelection();
      else if ((page?.kind === "calculator" || page?.kind === "graphs") && selection(page.edit)) {
        copySelection();
        handleKey({ k: "delete" });
      }
    },
  };

  /** Another region's app on a page laid out with several: drawn as it stands, taking no keys. */
  const renderOther = (p: Page): ReactNode => {
    const none = () => undefined;
    const ready = status === "ready" || status === "busy";
    switch (p.kind) {
      case "calculator":
        return <CalculatorApp page={p} onPick={none} onCaret={none} onWarning={none} onCursor={none} onSelect={none} />;
      case "graphs":
        return (
          <GraphsApp
            page={{ ...p, editing: null, tool: null }}
            giac={engine.current?.giac ?? null}
            ready={ready}
            onSamples={none}
            onWindow={none}
            onToolX={none}
            onConfirm={none}
            onToolFn={none}
            onEditFn={none}
            onEditRel={none}
            onEditPar={none}
            onDESettings={none}
            onSlider={none}
            onSliderTyped={none}
            onSliderAction={none}
            onSliderPlace={none}
            onCursor={none}
            onSelect={none}
          />
        );
      case "lists":
        return <ListsApp page={p} onSelect={none} />;
      case "notes":
        return <NotesApp page={p} apiRef={otherNotes} onChange={none} evaluate={notesEvaluate} />;
      case "datastats":
        return <DataStatsApp page={p} giac={engine.current?.giac ?? null} ready={ready} toGiac={(text) => translate(parse(text), settings).giac} onAxis={none} onPage={none} onWindow={none} />;
      case "geometry":
        return <GeometryApp page={p} onChange={none} onError={none} onAsk={none} />;
      case "python":
        return <PythonEditor page={p} onChange={none} editorRef={none} />;
      case "pyshell":
        return <PythonShell page={p} prompt={null} status={py.status} />;
      case "program":
        return <ProgramEditor page={p} onChange={none} editorRef={none} />;
      default:
        return <UnsupportedApp page={p} />;
    }
  };

  const onPaste = (e: ClipboardEvent) => {
    if ((e.target as HTMLElement).dataset.pyEditor !== undefined || (e.target as HTMLElement).dataset.prgEditor !== undefined || (e.target as HTMLElement).closest?.("[data-notes-editor]")) return;
    const text = pasted(e.clipboardData.getData("text"));
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
  }, [wizard?.focus, wizard?.wizard, wizard?.list?.sel, Boolean(wizard?.list), say]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (error) {
      say(error);
      hap("error");
    }
  }, [error, say, hap]);
  useEffect(() => {
    if (warning) say(`Warning. ${warning.filter(Boolean).join(" ")}`);
  }, [warning, say]);
  useEffect(() => {
    if (catalog) say(catalogSaid(catalog));
  }, [catalog, say]);
  useEffect(() => {
    if (finance?.list) say(`PmtAt list, ${PMT_AT[finance.list.sel]}, ${finance.list.sel + 1} of ${PMT_AT.length}`);
    else if (finance) say(`Finance Solver. ${FINANCE_NAMES[finance.focus]} ${finance.values[finance.focus]}`);
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
      if (PTT) {
        toast.error(NO_FILES);
        return;
      }
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

  // The installed app opening files from the computer (the manifest's
  // file_handlers: double-click a .tns, or Open with). One document goes into
  // My Documents and opens; several, or a zip, are added as an upload is.
  const launch = useCallback(
    async (list: File[], handle?: FileSystemFileHandle) => {
      if (PTT) {
        toast.error(NO_FILES);
        return;
      }
      const f = list[0];
      if (list.length !== 1 || !f || !/\.(tns|py)$/i.test(f.name)) return upload(list);
      const bytes = new Uint8Array(await f.arrayBuffer());
      let path = files.join(files.ROOT, f.name);
      const there = await files.getFile(path);
      const same = there?.bytes?.length === bytes.length && there.bytes.every((b, i) => b === bytes[i]);
      // The same file again opens the copy here, with the changes made since.
      // A different file by that name gets a new name rather than replace it.
      if (!same) {
        if (there) path = files.join(files.ROOT, await files.freeName(files.ROOT, f.name));
        await addFiles(files.ROOT, [new File([bytes], files.nameOf(path))]);
        await refreshFiles();
      }
      // Save writes back to the computer's file too (saveToComputer).
      if (handle) await files.patch(path, { handle });
      await openFile(path);
    },
    [upload, refreshFiles, openFile],
  );
  const launchRef = useRef(launch);
  launchRef.current = launch;
  useEffect(() => {
    // Chromium only, and only in the installed app; elsewhere there's no launchQueue.
    const queue = (window as { launchQueue?: { setConsumer(fn: (p: { files: readonly FileSystemHandle[] }) => void): void } }).launchQueue;
    queue?.setConsumer(({ files: handles }) => {
      if (!handles.length) return;
      const fileHandles = handles.filter((h): h is FileSystemFileHandle => h.kind === "file");
      void Promise.all(fileHandles.map((h) => h.getFile()))
        .then((list) => launchRef.current(list, fileHandles.length === 1 ? fileHandles[0] : undefined))
        .catch((err: Error) => toast.error(`Couldn't open that file: ${err.message}`));
    });
  }, []);
  // Files shared to the installed app from another (Android's share sheet): the service
  // worker keeps them in a cache and opens ?shared=n (public/sw.js, receiveShare). They
  // open as a double-clicked file does, once the Scratchpad has loaded.
  useEffect(() => {
    if (!new URLSearchParams(location.search).has("shared") || !("caches" in window)) return;
    let live = true;
    const go = async () => {
      if (!live) return;
      history.replaceState(null, "", location.pathname + location.hash);
      const inbox = await caches.open("share-inbox");
      const list: File[] = [];
      for (const req of await inbox.keys()) {
        const res = await inbox.match(req);
        if (res) list.push(new File([await res.blob()], decodeURIComponent(res.headers.get("x-name") ?? "Shared.tns")));
        await inbox.delete(req);
      }
      if (list.length) await launchRef.current(list);
      else toast.error("The shared file didn't arrive. Try sharing it again.");
    };
    const run = () => void go().catch((err: Error) => toast.error(`Couldn't open the shared file: ${err.message}`));
    startupReady.current.then(run, run);
    return () => {
      live = false;
    };
  }, []);

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
  /** The connected handheld's documents (link/handheld-panel.tsx). */
  const [handheldOpen, setHandheldOpen] = useState(false);
  /** A document from the handheld: into My Documents/Handheld, linked so Save writes it back. */
  const openFromHandheld = async (devPath: string, bytes: Uint8Array) => {
    const path = files.join(files.join(files.ROOT, "Handheld"), devPath.replace(/^\/+/, ""));
    if (!current.current.isScratch && current.current.openPath === path) {
      toast("That document is already open.");
      return;
    }
    const there = await files.getFile(path);
    if (there?.calcPending) toast("Opened your copy: it has changes that aren't on the handheld yet. Save to send them.");
    else await files.put({ path, type: "file", bytes, size: bytes.length, modified: Date.now(), calc: devPath, ...(there?.disk ? { disk: there.disk } : {}) });
    await refreshFiles();
    await openFile(path);
  };
  const copyFromHandheld = async (devPath: string, bytes: Uint8Array) => {
    const name = await files.freeName(files.ROOT, handheldName(devPath));
    await addFiles(files.ROOT, [new File([bytes as BlobPart], name)]);
    await refreshFiles();
  };
  const currentOutgoing = (): Outgoing | null => {
    if (view !== "doc") return null;
    const r = exportTns(doc, settings, engine.current?.saved);
    return { name: isScratch ? "Scratchpad" : doc.title, bytes: r.bytes, warn: droppedMessage(r) };
  };
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
      geoValues: geoEnv,
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
    save: async (name) => {
      if (name) return wizardDone(`saveas:${name}`);
      if (!(await saveDocument())) throw new Error("The browser couldn't save the document (its storage may be full); ask the student to free some space or download it instead.");
    },
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
      if (ch.name && isReservedName(ch.name)) return `${ch.name} is the name of a command (Reserved name); choose another list name.`;
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
      // An open list would take the OK's Enter as a pick: filling the dialog closes it.
      setWizard({ ...wizard, values: out, fresh: false, list: null });
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
    select: (t) => {
      const p = latestDoc.current.pages[latestDoc.current.active];
      if (t.clear) {
        if (p?.kind === "geometry") setGeo((g) => ({ ...g, sel: null, multi: undefined }));
        else if (p?.kind === "graphs") setGraphs((g) => ({ ...g, pick: undefined, ...(g.geo ? { geo: { ...g.geo, sel: null } } : {}) }));
        else if (p?.kind === "lists") setLists((q) => ({ ...q, pick: undefined }));
        else if (p?.kind === "calculator") setCalc((q) => ({ ...q, sel: null }));
        return null;
      }
      if (t.objects) {
        const objs = p?.kind === "geometry" ? p.objects : p?.kind === "graphs" ? (p.geo?.objects ?? []) : null;
        if (!objs) return "Objects are selected on a Geometry page, or in a Graphs page's construction.";
        const missing = t.objects.find((id) => !objs.some((o) => o.id === id));
        if (missing) return `There's no object ${missing}. Objects: ${objs.map((o) => o.id).join(", ") || "none"}.`;
        const ids = t.objects;
        if (p?.kind === "graphs") {
          if (ids.length !== 1) return "A Graphs page selects one object at a time.";
          setGraphs((g) => ({ ...g, pick: undefined }));
          setGraphGeo((g) => ({ ...g, tool: null, mode: null, sel: ids[0]! }));
        } else setGeo((g) => ({ ...g, tool: null, mode: null, sel: ids.length === 1 ? ids[0]! : null, multi: ids.length > 1 ? ids : undefined }));
        return null;
      }
      if (t.graph !== undefined) {
        const n = t.graph;
        if (p?.kind !== "graphs" || !p.functions.some((f) => f.n === n)) return `There's no f${n} on this page.`;
        setGraphs((g) => ({ ...g, pick: n, ...(g.geo ? { geo: { ...g.geo, sel: null } } : {}) }));
        return null;
      }
      if (t.cell !== undefined) {
        if (p?.kind !== "lists") return "Cells are on a Lists & Spreadsheet page.";
        // B3: a cell; B: the whole column (from its name); 3: the whole row, as Actions ▸ Select picks them.
        const m = /^\s*([A-Za-z])?\s*(\d+)?\s*$/.exec(t.cell);
        if (!m || (!m[1] && !m[2]) || (m[2] && Number(m[2]) < 1)) return `"${t.cell}" isn't a cell (B3), a column (B) or a row (3).`;
        const [letterPart, rowPart] = [m[1], m[2]];
        setLists((q) => ({
          ...q,
          edit: null,
          mode: undefined,
          sel: { row: rowPart ? Number(rowPart) + 1 : 0, col: letterPart ? letterPart.toUpperCase().charCodeAt(0) - 65 : q.sel.col },
          pick: !rowPart ? "col" : !letterPart ? "row" : undefined,
        }));
        return null;
      }
      if (t.entry !== undefined) {
        const i = t.entry - 1;
        if (p?.kind !== "calculator" || !p.history[i]) return `There's no history entry ${t.entry} on this page.`;
        setCalc((q) => ({ ...q, sel: { entry: i, part: "input" } }));
        return null;
      }
      if (t.box !== undefined || t.text !== undefined) {
        if (p?.kind !== "notes") return "Maths boxes and text are selected on a Notes page.";
        // select gives null when it worked, so the missing editor is checked apart.
        return notesApi.current ? notesApi.current.select({ box: t.box, text: t.text }) : "The Notes page isn't showing.";
      }
      return "Say what to select: objects, graph, cell, entry, box, text, or clear.";
    },
    setSlider: async (name, value) => {
      const p = latestDoc.current.pages[latestDoc.current.active];
      const set = p?.kind === "graphs" ? setSlider : p?.kind === "datastats" ? setDataSlider : p?.kind === "geometry" ? setGeoSlider : p?.kind === "notes" ? setNotesSlider : null;
      const list = p?.kind === "graphs" || p?.kind === "datastats" || p?.kind === "geometry" || p?.kind === "notes" ? (p.sliders ?? []) : [];
      if (!set) return "Sliders are on Graphs, Data & Statistics, Geometry and Notes pages.";
      if (!list.some((sl) => sl.name === name)) return `There's no slider ${name} on this page${list.length ? ` (sliders: ${list.map((sl) => sl.name).join(", ")})` : "; Insert Slider makes one"}.`;
      await typedSlider(name, value, set);
      return null;
    },
  };
  // A tool holds its host across awaits: each call goes through to the newest render's, never a stale one.
  const agentProxy = useMemo(() => new Proxy({} as AgentHost, { get: (_, k) => agentHost.current[k as keyof AgentHost] }), []);
  const agent = useCallback(() => agentProxy, [agentProxy]);
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
  // The assistant's settings can stop offering the tools to browser agents; turning it back on offers them again.
  const shareTools = assistant.config.webmcp !== false;
  // Press-to-Test can switch the assistant off: its chat, AI mode and the WebMCP tools.
  const noAssistant = Boolean(PTT?.noAssistant);
  useEffect(() => (shareTools && !noAssistant ? registerWebMcp(agent) : undefined), [agent, shareTools, noAssistant]);
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
    <MotionConfig reducedMotion={MOTION[setup.motion]}>
    {/* On a wide window the calculator moves aside for the assistant rather than sitting under it; AI mode puts it away. */}
    <div className={cn(DEVICE_WIDTH, aiOpen && "ai-open", ai === "immersive" && "hidden")}>
      <header className="mb-4 flex items-center justify-between gap-3 px-1">
        <span className="text-[17px] font-semibold tracking-[-0.019em] text-ink">Axiom</span>
        <div className="flex items-center gap-2">
          {PTT && <PttPill test={PTT} />}
          {!PTT && <HandheldButton onClick={() => setHandheldOpen(true)} />}
          {!noAssistant && <button
            type="button"
            onClick={() => setAi((a) => (a === "panel" ? "off" : "panel"))}
            aria-expanded={aiOpen}
            className="flex h-8 items-center gap-1.5 rounded-full border border-white/[0.07] bg-white/[0.02] px-3 text-[13px] font-medium text-neutral-400 transition-[color,background-color,border-color,scale] duration-150 ease-out outline-none hover:border-white/15 hover:bg-white/[0.05] hover:text-neutral-100 focus-visible:ring-2 focus-visible:ring-focus/60 active:scale-[0.97] aria-expanded:border-white/15 aria-expanded:bg-white/[0.06] aria-expanded:text-neutral-100"
          >
            <Sparkles size={14} aria-hidden />
            Assistant
          </button>}
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
          if ((e.target as HTMLElement).closest("[data-py-editor], [data-prg-editor]")) return;
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
              locked={Boolean(PTT)}
              variant={view === "new" ? "doc" : view}
              pageLabels={view === "doc" ? units(doc).map((u) => pageLabel(doc, u.pages[0]!)) : []}
              active={unitOf(doc, doc.active)}
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
              onSelectPage={(u) => setDoc((d) => ({ ...d, active: units(d)[u]?.pages[0] ?? d.active }))}
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
                      onFocus={(i) => setWizard((w) => (w ? { ...w, focus: i, fresh: true, list: null } : w))}
                      onOk={() => handleKey({ k: "enter" })}
                      onCancel={() => setWizard(null)}
                      onArrow={(i) =>
                        setWizard((w) => (w ? (wizardKeyPress({ ...w, focus: i, list: null }, { k: "right" }).state ?? w) : w))
                      }
                      onPick={(i) => setWizard((w) => (w ? wizardPick(w, i) : w))}
                      onHighlight={(i) => setWizard((w) => (w?.list ? { ...w, list: { ...w.list, sel: i } } : w))}
                      onCloseList={() => setWizard((w) => (w ? { ...w, list: null } : w))}
                    />
                  )}
                  {finance && (
                    <FinanceSolver
                      state={finance}
                      onFocus={(i) => setFinance((f) => (f ? { ...f, focus: i, fresh: true, list: null } : f))}
                      onOpenList={() => setFinance((f) => (f ? (financeKeyPress({ ...f, focus: 7, list: null }, { k: "right" }).state ?? f) : f))}
                      onPick={(i) => setFinance((f) => (f ? financePick(f, i) : f))}
                      onHighlight={(i) => setFinance((f) => (f?.list ? { ...f, list: { ...f.list, sel: i } } : f))}
                      onCloseList={() => setFinance((f) => (f ? { ...f, list: null } : f))}
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
              {view === "doc" && sorter !== null && (
                <PageSorter doc={doc} sel={sorter} names={PAGE_APPS} onPick={(i, open) => (open ? (setDoc((d) => ({ ...d, active: i })), setSorter(null)) : setSorter(i))} />
              )}
              {view === "doc" && sorter === null && (
              <LayoutFrame doc={doc} renderOther={renderOther} splitting={splitting} onFocus={(id) => setDoc((d) => ({ ...d, active: Math.max(0, d.pages.findIndex((p) => p.id === id)) }))} onEmpty={askRegion}>
              {view === "doc" && page?.kind === "lists" && !page.table && (
                <ListsApp
                  page={page}
                  highlights={pageHighlights}
                  onSelect={(sel) => setLists((p) => ({ ...p, sel, edit: null, pick: undefined }))}
                />
              )}
              {view === "doc" && page?.kind === "lists" && page.table && (
                <FunctionTable
                  fns={tableColumns(page, problemFunctions(doc, problemOf(page)))}
                  selected={page.table.col ?? 0}
                  widths={page.table.widths}
                  start={page.table.start}
                  step={page.table.step}
                  giac={engine.current?.giac ?? null}
                  ready={status === "ready" || status === "busy"}
                  className="absolute inset-0"
                />
              )}
              {view === "doc" && page?.kind === "notes" && (
                <NotesApp
                  page={page}
                  apiRef={notesApi}
                  onChange={(paras) =>
                    update("notes", (p) => {
                      // A slider whose place was deleted from the text goes with it.
                      const placed = placedSliders(paras);
                      const was = placedSliders(p.paras);
                      const sliders = p.sliders?.filter((sl) => placed.has(sl.name) || !was.has(sl.name));
                      return { ...p, paras, ...(sliders ? { sliders } : {}) };
                    })
                  }
                  evaluate={notesEvaluate}
                  onReport={(text) => (text.startsWith("Error") ? setError(text) : setWarning([text.replace(/^Warning: /, "")]))}
                  {...sliderProps(setNotesSlider, page.sliders, (name) => notesApi.current?.removeSlider(name))}
                />
              )}
              {view === "doc" && page?.kind === "datastats" && (
                <DataStatsApp
                  page={page}
                  giac={engine.current?.giac ?? null}
                  ready={status === "ready" || status === "busy"}
                  toGiac={(text) => translate(parse(text), settings).giac}
                  onAxis={(axis) => runAction({ kind: "app", id: `dsAxis:${axis}` })}
                  onPage={setData}
                  onWindow={(w) => (dataWindow.current = w)}
                  onInfo={(info) => (dataInfo.current = info)}
                  onSay={say}
                  {...sliderProps(setDataSlider, page.sliders)}
                />
              )}
              {view === "doc" && page?.kind === "geometry" && (
                <GeometryApp
                  page={page}
                  highlights={pageHighlights}
                  onChange={setGeo}
                  onError={setError}
                  onAsk={askGeoAmount}
                  env={geoEnv}
                  onConditions={geoConditions}
                  {...sliderProps(setGeoSlider, page.sliders)}
                />
              )}
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
              {view === "doc" && page?.kind === "program" && (
                <ProgramEditor
                  page={page}
                  onChange={(source) => setProgram((p) => ({ ...p, source, status: undefined }))}
                  editorRef={(el) => {
                    prgEditor.current = el;
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
              {view === "doc" && basicDraw && (
                <div className="absolute inset-0 z-20 flex flex-col bg-white" onMouseDown={() => basicDraw.done && setBasicDraw(null)}>
                  <div className="shrink-0 bg-[#333] px-[2cqw] py-[1.4cqw] font-casui text-[4.4cqw] text-white">{basicDraw.done ? "Finished" : "Running..."}</div>
                  <div className="relative flex-1">
                    <PythonCanvas ops={basicDraw.ops} label="Program drawing" />
                  </div>
                </div>
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
              {view === "doc" && page?.kind === "graphs" && page.view === "3d" && (
                <Graph3D
                  page={page}
                  giac={engine.current?.giac ?? null}
                  ready={status === "ready" || status === "busy"}
                  onTurn={(dy, dp) => setGraphs((g) => {
                    const v = { yaw: -0.7, pitch: 0.55, ...g.view3d };
                    return { ...g, view3d: { yaw: v.yaw + dy, pitch: Math.max(-1.5, Math.min(1.5, v.pitch + dp)) } };
                  })}
                  onCursor={(cursor) => setGraphs((g) => ({ ...g, edit: { row: g.edit.row, cursor } }))}
                  onSelect={(a, b) => setGraphs((g) => ({ ...g, edit: selectBetween(g.edit, a, b) }))}
                />
              )}
              {view === "doc" && page?.kind === "graphs" && page.view !== "3d" && (
                <GraphsApp
                  page={page}
                  highlights={pageHighlights}
                  giac={engine.current?.giac ?? null}
                  ready={status === "ready" || status === "busy"}
                  onSamples={(s) => (samples.current = s)}
                  onWindow={(window) => setGraphs((g) => ({ ...g, window }))}
                  onToolX={onToolX}
                  onPick={(n) => setGraphs((g) => (g.pick === (n ?? undefined) ? g : { ...g, pick: n ?? undefined }))}
                  onMathDraw={(pts) => {
                    const rel = recognise(pts, page.window.xmax - page.window.xmin);
                    if (!rel) return;
                    const n = Math.max(0, ...(page.relations ?? []).map((r) => r.n)) + 1;
                    const row = astToRow(parse(rel));
                    const next = { ...page, edit: { row, cursor: { path: [], index: row.length } } };
                    void runGraphEffect(next, { relation: { n, text: rel } });
                  }}
                  onBox={(x, y, set) => setGraphs((g) => (!g.zoomBox ? g : set ? zoomBoxAt(g, x, y) : { ...g, zoomBox: { ...g.zoomBox, x, y } }))}
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
                  onEditPar={(n) => setGraphs((g) => (g.parametrics?.find((c) => c.n === n)?.polar ? openPolar(g, settings.angle === "deg", n) : openParametric(g, settings.angle === "deg", n)))}
                  onEditSeq={(n) => setGraphs((g) => openSequence(g, n))}
                  onDESettings={() => graphAction("deSettings")}
                  onSlider={(name, value, final) => {
                    setSlider(name, (sl) => ({ ...sl, value }));
                    assign(name, value, final);
                    if (final) say(`${name} = ${value}`);
                  }}
                  onSliderTyped={(name, text) => void typedSlider(name, text, setSlider)}
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
              {view === "doc" && page?.kind === "graphs" && page.view !== "3d" && !page.table && (page.geo?.objects.length || page.geo?.tool) ? (
                <GeometryApp
                  key={`graphgeo${page.id}`}
                  page={geoOfGraph(page)}
                  env={{ ...geoEnv, ...Object.fromEntries((page.sliders ?? []).map((sl) => [sl.name, sl.value])) }}
                  overlay={{
                    view: { x: (page.window.xmin + page.window.xmax) / 2, y: (page.window.ymin + page.window.ymax) / 2, w: page.window.xmax - page.window.xmin },
                    onView: (v) =>
                      setGraphs((g) => {
                        const dy = v.y - (g.window.ymin + g.window.ymax) / 2;
                        return { ...g, window: { ...g.window, xmin: v.x - v.w / 2, xmax: v.x + v.w / 2, ymin: g.window.ymin + dy, ymax: g.window.ymax + dy } };
                      }),
                  }}
                  onChange={setGraphGeo}
                  onError={setError}
                  onAsk={askGeoAmount}
                />
              ) : null}
              </LayoutFrame>
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
          {/* Show Keypad off hides it on large screens only: a phone has no other way to type. */}
          <div className={cn("@container lg:w-[min(24rem,calc(var(--cas-h)/2.1))] lg:shrink-0", !setup.showKeypad && "lg:hidden")}>
            <Keypad
              onKey={(k) => {
                hap(k.k === "enter" ? "medium" : "light");
                handleKey(k);
              }}
              onKeys={(ks) => {
                hap("light");
                handleKeys(ks);
              }}
              onPanel={(p) => {
                hap("light");
                setMenu({ items: p.items, state: openMenu(p.cols) });
              }}
              onOpen={(o) => {
                hap("light");
                if (o.open === "templates") setPalette(0);
                else setCatalog(openCatalog(o.tab));
              }}
              layout={setup.keypad}
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
          haptics={setup.haptics}
        />
        <Legal />
      </div>
      <input
        ref={imageInput}
        type="file"
        accept="image/*"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (!f) return;
          shrinkImage(f)
            .then(({ src, aspect }) => {
              // The screen is 4:3; the page's height is about three quarters of its width.
              setData((p) => ({ ...p, image: { src, ...placeImage(aspect, 0.7) }, imageSel: true }));
              say("Image inserted and selected: the arrows move it, plus and minus size it, Esc lets it go.");
            })
            .catch((err: Error) => setError(`Error: Couldn't insert the image: ${err.message}`));
        }}
      />
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
    {!PTT && <HandheldPanel open={handheldOpen} onOpenChange={setHandheldOpen} onOpenDoc={openFromHandheld} onCopyDoc={copyFromHandheld} current={currentOutgoing} />}
    <AiPanel open={aiOpen && !noAssistant} onClose={() => setAi("off")} onImmersive={() => setAi("immersive")} onSettings={() => setAiSettings(true)} assistant={assistant} doc={docActions} info={docInfo} />
    <AnimatePresence>
      {ai === "immersive" && !noAssistant && (
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
    <AssistantSettings open={aiSettings} onOpenChange={setAiSettings} config={assistant.config} setConfig={assistant.setConfig} onDeleteAll={assistant.removeAll} />
    </MotionConfig>
  );
}

/** Whether Esc has something to cancel on the page (a selection, a tool, an entry line, a cell, a running program). */
// Press-to-Test's switched-off commands, for every evaluate() (state/ptt.ts, engine/restrict.ts).
setBlocked(blockedCommands(PTT));
const NO_FILES = "Files can't be brought in during Press-to-Test.";

/** Start Press-to-Test: the page reloads into the test's own storage. */
function enterTest(p: PressToTest) {
  if (setPtt(p)) window.location.reload();
  else toast.error("The browser didn't allow keeping the test's state, so Press-to-Test couldn't start.");
}

/** End Press-to-Test: what was made during it goes, and the page reloads with the student's own documents. */
async function endTest() {
  await files.clearTestFiles().catch(() => undefined);
  clearTestPrefs();
  setPtt(null);
  window.location.reload();
}

/** The functions of a problem's Graphs pages, for a Lists & Spreadsheet function table. */
function problemFunctions(doc: CasDocument, problem: number): TableFn[] {
  return doc.pages.flatMap((p) => (p.kind === "graphs" && problemOf(p) === problem ? graphFunctions(p) : []));
}

/** The functions a Lists page's table shows, in its column order: those Choose… and Delete Column left, else all of them. */
function tableColumns(page: ListsPage, fns: TableFn[]): TableFn[] {
  const order = page.table?.fns;
  return order ? order.map((n) => fns.find((f) => f.n === n)).filter((f): f is TableFn => Boolean(f)) : fns;
}

function pageTakesEsc(page: Page | undefined, py: { status: PyStatus; canvas: DrawOp[] | null }): boolean {
  switch (page?.kind) {
    case "calculator":
      return page.sel !== null;
    case "graphs":
      return page.tool !== null || page.editing !== null || page.pick !== undefined || Boolean(page.geo?.tool || page.geo?.sel || page.geo?.mode || page.zoomBox || page.mathDraw || page.pathPlot || page.selected);
    case "geometry":
      return Boolean(page.tool || page.sel || page.mode || page.multi?.length);
    case "datastats":
      return dataTakesEsc(page);
    case "lists":
      return page.edit !== null || Boolean(page.mode || page.pick || page.table?.resize);
    case "pyshell":
      return py.status === "running" || py.canvas !== null || page.input !== "";
    default:
      return false;
  }
}

/** A Graphs page's construction as the Geometry view and keys take it: no grid or axes of its own. */
const geoOfGraph = (g: GraphsPage): GeometryPage => ({
  kind: "geometry",
  id: g.id,
  objects: g.geo?.objects ?? [],
  tool: g.geo?.tool ?? null,
  sel: g.geo?.sel ?? null,
  mode: g.geo?.mode ?? null,
  traced: g.geo?.traced,
  traceErased: g.geo?.traceErased,
  pinned: g.geo?.pinned,
});

const PAGE_APPS: Record<Page["kind"], string> = {
  calculator: "Calculator",
  graphs: "Graphs",
  lists: "Lists & Spreadsheet",
  datastats: "Data & Statistics",
  python: "Python",
  pyshell: "Python Shell",
  program: "Program Editor",
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
