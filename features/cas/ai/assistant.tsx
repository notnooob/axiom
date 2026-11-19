// SPDX-License-Identifier: GPL-3.0-or-later
/**
 * The assistant's chat, built from shadcn's AI Elements patterns (Chat,
 * Message, Reasoning, Tool, Prompt Input, Model Selector): one conversation
 * shared by the side panel and AI mode. In AI mode the calculator's own
 * screen is lent to the reply while the agent works (LiveView), then kept as
 * a picture on the document card.
 */
import * as React from "react";
import { Chat, useChat } from "@ai-sdk/react";
import { getToolName, isToolUIPart, lastAssistantMessageIsCompleteWithToolCalls, type FileUIPart } from "ai";
import { Combobox } from "@base-ui/react/combobox";
import { AnimatePresence, motion, useReducedMotionConfig } from "framer-motion";
import {
  NotebookPenIcon,
  TriangleIcon,
  ArrowUpIcon,
  BrainIcon,
  CalculatorIcon,
  ChartScatterIcon,
  ChartSplineIcon,
  CheckIcon,
  ChevronDownIcon,
  CircleCheckIcon,
  CodeIcon,
  CompassIcon,
  CopyIcon,
  CrosshairIcon,
  DownloadIcon,
  EraserIcon,
  EyeIcon,
  FilePlusIcon,
  FolderIcon,
  FolderOpenIcon,
  GraduationCapIcon,
  HighlighterIcon,
  KeyboardIcon,
  KeyRoundIcon,
  LayersIcon,
  ListChecksIcon,
  LoaderCircleIcon,
  MenuIcon,
  MessageSquareIcon,
  MessageCircleQuestionIcon,
  PauseIcon,
  PenLineIcon,
  PlusIcon,
  RefreshCcwIcon,
  SaveIcon,
  ScanIcon,
  SheetIcon,
  SigmaIcon,
  SparklesIcon,
  SquareIcon,
  SquarePlusIcon,
  Undo2Icon,
  XIcon,
  type LucideIcon,
} from "lucide-react";
import { toast } from "sonner";

import { Markdown } from "@/components/markdown";
import { Attachment, AttachmentMedia } from "@/components/ui/attachment";
import { Bubble, BubbleContent } from "@/components/ui/bubble";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent } from "@/components/ui/collapsible";
import { CodeBlock, CodeBlockContent } from "@/components/ui/code-block";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupTextarea } from "@/components/ui/input-group";
import { Message, MessageContent, MessageFooter } from "@/components/ui/message";
import {
  MessageScroller,
  MessageScrollerButton,
  MessageScrollerContent,
  MessageScrollerItem,
  MessageScrollerProvider,
  MessageScrollerViewport,
} from "@/components/ui/message-scroller";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  Trace,
  TraceCollapsible,
  TraceCollapsibleContent,
  TraceCollapsibleTrigger,
  TraceIcon,
  TraceLine,
  TraceTitle,
} from "@/components/ui/trace";
import { cn } from "@/lib/utils";
import { pref, setPref, type Saved } from "../state/persist";
import {
  CalcTransport,
  configured,
  DEFAULT_CONFIG,
  listModels,
  MAX_STEPS,
  modelName,
  modelOf,
  modelsFor,
  PROVIDERS,
  titleFor,
  usable,
  type AiConfig,
  type AskUserInput,
  type CalcMessage,
  type Effort,
  type ProviderId,
} from "./agent";
import { isScreenOutput } from "./history";
import { MODE_IDS, MODES, modeOf, type Mode } from "./modes";
import { linkPages } from "./page-links";
import { contextBlock } from "./prompt";
import { pageContent, stateOf, TOOLS, type AgentHost } from "./tools";
import { groups, moves, MOVES, type Group, type Move, type Part, type StepItem, type ToolPart } from "./steps";
import { visionKey } from "./vision";
import { modelContext } from "./webmcp";
import { ACTIVE_KEY, cleanTitle, deleteThread, fallbackTitle, listThreads, newestFirst, newThread, putThread, type Checkpoint, type Thread } from "./threads";

// ---- State shared by the panel and AI mode

/**
 * What cas-app.tsx lends the chats: which thread owns the calculator's open
 * document. There's one calculator, so a thread's document is put back on it
 * when the thread is opened again, and set aside (snapshotted) when it's left.
 */
export type DocBinding = {
  /** The open document and its file, if it's this thread's own. */
  snapshot(thread: string): { doc: Saved; docPath: string | null } | null;
  /** The open document is no longer this thread's. kept: its snapshot is safe in the thread, so its changes needn't be saved here. */
  release(thread: string, kept: boolean): void;
  /** Put the thread's document back on the calculator, if it has one. */
  restore(thread: Thread): Promise<void>;
  /** The agent changed the calculator in this thread: the open document is now its own. */
  claim(thread: string): void;
  /** The calculator as it is now, to go back to if the student undoes the coming reply. */
  checkpoint(): Checkpoint;
  /** Put the calculator back as it was at cp (files saved since stay in My Documents). */
  rollback(cp: Checkpoint, thread: string): Promise<void>;
  /** Take the assistant's highlights off the calculator (a new turn: it highlights afresh if it needs to). */
  clearHighlights(): void;
};

export type Assistant = {
  chat: Chat<CalcMessage>;
  config: AiConfig;
  setConfig: (c: AiConfig) => void;
  host: () => AgentHost;
  /** The open thread (in threads only once it has a message). */
  thread: Thread;
  /** Saved threads, newest first. */
  threads: Thread[];
  newChat: () => void;
  switchTo: (id: string) => Promise<void>;
  rename: (id: string, title: string) => void;
  remove: (id: string) => Promise<void>;
  /** Undo what the open thread's latest reply did to the calculator. False if there was nothing to undo. */
  undoLast: () => Promise<boolean>;
  /** Whether the student undid a reply since the last message (said once, in the next message's context). */
  takeNote: () => boolean;
};

export const chatBusy = (c: Chat<CalcMessage>) => c.status === "streaming" || c.status === "submitted";

/** Send on by itself once the student has answered ask_user (not, say, after a turn cut off between tools). */
const answeredAsk = ({ messages }: { messages: CalcMessage[] }) =>
  lastAssistantMessageIsCompleteWithToolCalls({ messages }) && Boolean(messages.at(-1)?.parts.some((p) => isToolUIPart(p) && getToolName(p) === "ask_user"));

/** The threads and the one Chat open now, kept outside React so every chat's callbacks see the same state. */
function threadStore(config: () => AiConfig, host: () => AgentHost, binding: () => DocBinding, render: () => void, textOnly: () => void) {
  const records = new Map<string, Thread>();
  const titling = new Set<string>();
  /** Each thread's checkpoint from the start of its turn, kept on the thread only once the turn changes something. */
  const pending = new Map<string, NonNullable<Thread["checkpoint"]>>();
  /** Threads whose latest reply the student undid, to tell the model with their next message. */
  const undone = new Set<string>();
  let list: Thread[] = [];
  let cur: { thread: Thread; chat: Chat<CalcMessage> };

  /** A thread's record, with the open chat's messages if it's the open one. */
  const fresh = (id: string): Thread | undefined => {
    const t = records.get(id) ?? (cur.thread.id === id ? cur.thread : undefined);
    return t && cur.thread.id === id ? { ...t, messages: cur.chat.messages } : t;
  };
  const publish = () => {
    list = newestFirst([...records.values()].filter((r) => r.messages.length > 0));
    render();
  };
  const commit = (t: Thread) => {
    records.set(t.id, t);
    if (cur.thread.id === t.id) cur = { ...cur, thread: t };
    if (t.messages.length) void putThread(t).catch(() => undefined);
    publish();
  };
  /** Save the open thread's messages (and, at the end of a turn, its document). */
  const keep = (chat: Chat<CalcMessage>, withDoc: boolean) => {
    if (cur.chat !== chat || !chat.messages.length) return;
    const moved = records.get(cur.thread.id)?.messages !== chat.messages;
    const t = fresh(cur.thread.id)!;
    commit({ ...t, updated: moved ? Date.now() : t.updated, ...(withDoc ? (binding().snapshot(t.id) ?? {}) : {}) });
  };
  /** After the first message: its text as the title at once, then the model's title, silently, if it gives one. */
  const name = (chat: Chat<CalcMessage>) => {
    const t = cur.chat === chat ? fresh(cur.thread.id) : undefined;
    if (!t || t.titled || titling.has(t.id)) return;
    const first = t.messages.find((m) => m.role === "user");
    const text = first ? textOf(first) : "";
    if (!text) return;
    titling.add(t.id);
    commit({ ...t, title: fallbackTitle(text) });
    void titleFor(config(), text)
      .then((raw) => {
        const title = cleanTitle(raw);
        const now = fresh(t.id);
        // Renamed (or deleted) meanwhile: the student's choice wins.
        if (title && now && !now.titled && records.has(t.id)) commit({ ...now, title, titled: true });
      })
      .catch(() => undefined);
  };
  /** A turn's first change: the calculator as it was before the turn goes on the thread, for Undo changes. */
  const keepCheckpoint = (id: string) => {
    const cp = pending.get(id);
    const t = fresh(id);
    if (!cp || !t) return;
    pending.delete(id);
    commit({ ...t, checkpoint: cp });
  };
  const make = (t: Thread): Chat<CalcMessage> => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const chat: Chat<CalcMessage> = new Chat<CalcMessage>({
      id: t.id,
      messages: t.messages,
      transport: new CalcTransport(() => ({
        config: config(),
        host,
        claim: () => {
          binding().claim(t.id);
          keepCheckpoint(t.id);
        },
        turnStart: (after) => {
          // Highlights belong to the reply that made them: a new message starts without them.
          binding().clearHighlights();
          // Retrying a message keeps the checkpoint from before its first try, so undo goes back past both.
          if (fresh(t.id)?.checkpoint?.after === after) return;
          pending.set(t.id, { ...binding().checkpoint(), after });
        },
        onTextOnly: textOnly,
      })),
      sendAutomaticallyWhen: answeredAsk,
      onFinish: () => {
        clearTimeout(timer);
        keep(chat, true);
      },
    });
    // While it streams it's saved a second after the last change, so a reload picks up where it was.
    chat["~registerMessagesCallback"](() => {
      clearTimeout(timer);
      timer = setTimeout(() => keep(chat, false), 1000);
      name(chat);
    });
    return chat;
  };
  const select = (t: Thread) => {
    cur = { thread: t, chat: make(t) };
    try {
      window.localStorage.setItem(ACTIVE_KEY, t.id);
    } catch {
      // Storage unavailable: the next visit starts a new chat.
    }
    render();
  };
  /** Set the open thread aside, its document with it. */
  const leave = () => {
    const b = binding();
    const t = fresh(cur.thread.id)!;
    if (t.messages.length) commit({ ...t, ...(b.snapshot(t.id) ?? {}) });
    b.release(t.id, t.messages.length > 0);
  };

  let active: string | null = null;
  try {
    active = window.localStorage.getItem(ACTIVE_KEY);
  } catch {
    // As above.
  }
  const first = { ...newThread(), ...(active ? { id: active } : {}) };
  cur = { thread: first, chat: make(first) };

  return {
    get cur() {
      return cur;
    },
    get list() {
      return list;
    },
    load: () => {
      let live = true;
      void listThreads()
        .then((ts) => {
          if (!live) return;
          for (const t of ts) if (!records.has(t.id)) records.set(t.id, t);
          const open = records.get(cur.thread.id);
          if (open && !cur.chat.messages.length) select(open);
          publish();
        })
        .catch(() => undefined);
      return () => {
        live = false;
      };
    },
    keepNow: () => keep(cur.chat, true),
    newChat: () => {
      if (chatBusy(cur.chat) || !cur.chat.messages.length) return;
      leave();
      select(newThread());
    },
    switchTo: async (id: string) => {
      const to = records.get(id);
      if (!to || id === cur.thread.id || chatBusy(cur.chat)) return;
      leave();
      select(to);
      await binding().restore(to);
    },
    rename: (id: string, title: string) => {
      const t = fresh(id);
      if (t && title.trim() && title.trim() !== t.title) commit({ ...t, title: title.trim(), titled: true });
    },
    remove: async (id: string) => {
      const open = id === cur.thread.id;
      if (open && chatBusy(cur.chat)) return;
      records.delete(id);
      await deleteThread(id).catch(() => undefined);
      if (open) {
        // Its document stays on the calculator, its changes still to save there.
        binding().release(id, false);
        select(newThread());
      }
      publish();
    },
    undoLast: async () => {
      const id = cur.thread.id;
      const cp = fresh(id)?.checkpoint;
      if (!cp || chatBusy(cur.chat)) return false;
      const b = binding();
      await b.rollback(cp, id);
      undone.add(id);
      // The thread's document is now what it was before that reply (none, if the reply made the first one).
      const s = b.snapshot(id);
      const t = fresh(id);
      if (t) commit({ ...t, checkpoint: undefined, doc: s?.doc, docPath: s?.docPath });
      return true;
    },
    takeNote: () => undone.delete(cur.thread.id),
  };
}

export function useAssistant(host: () => AgentHost, binding: () => DocBinding): Assistant {
  const [config, setConfigState] = React.useState<AiConfig>(() => {
    const saved = { ...DEFAULT_CONFIG, ...pref<Partial<AiConfig>>("ai", {}) };
    // Tutor mode was a switch before there were modes: it's Guide now.
    const { tutor: _old, ...rest } = saved;
    return { ...rest, mode: modeOf(saved) };
  });
  const latest = React.useRef(config);
  latest.current = config;
  const [, render] = React.useReducer((n: number) => n + 1, 0);
  const setRef = React.useRef<(c: AiConfig) => void>(() => undefined);
  // A model that refused a picture: remembered (Settings ▸ Images shows it), and said once.
  const textOnly = () => {
    const c = latest.current;
    const key = visionKey(c.provider, modelOf(c));
    if (c.vision?.[key] === false) return;
    setRef.current({ ...c, vision: { ...c.vision, [key]: false } });
    toast(`${modelName(modelOf(c))} can't read images, so it'll get the screen described in words instead.`);
  };
  const [store] = React.useState(() => threadStore(() => latest.current, host, binding, render, textOnly));
  React.useEffect(() => store.load(), [store]);
  React.useEffect(() => {
    // The tab is hidden (or closed): the open thread's document is kept with it.
    const hide = () => document.visibilityState === "hidden" && store.keepNow();
    document.addEventListener("visibilitychange", hide);
    return () => document.removeEventListener("visibilitychange", hide);
  }, [store]);
  const setConfig = React.useCallback((c: AiConfig) => {
    latest.current = c;
    setConfigState(c);
    setPref("ai", c);
  }, []);
  setRef.current = setConfig;
  return {
    chat: store.cur.chat,
    thread: store.cur.thread,
    threads: store.list,
    config,
    setConfig,
    host,
    newChat: store.newChat,
    switchTo: store.switchTo,
    rename: store.rename,
    remove: store.remove,
    undoLast: store.undoLast,
    takeNote: store.takeNote,
  };
}

// ---- Tool and thinking steps (the Tool and Reasoning patterns, on Trace)

const TOOL_ICONS: Record<string, LucideIcon> = {
  get_state: EyeIcon,
  read_page: EyeIcon,
  evaluate: SigmaIcon,
  calculate: CalculatorIcon,
  plot_function: ChartSplineIcon,
  set_window: ScanIcon,
  set_list: SheetIcon,
  configure_data_stats: ChartScatterIcon,
  python: CodeIcon,
  add_page: SquarePlusIcon,
  select_page: LayersIcon,
  new_document: FilePlusIcon,
  save_document: SaveIcon,
  list_documents: FolderIcon,
  open_document: FolderOpenIcon,
  close_document: XIcon,
  navigate: CompassIcon,
  list_menu: MenuIcon,
  run_menu: MenuIcon,
  respond_to_dialog: MessageSquareIcon,
  type_keys: KeyboardIcon,
  write_notes: NotebookPenIcon,
  construct_geometry: TriangleIcon,
  highlight: HighlighterIcon,
  ask_user: MessageCircleQuestionIcon,
  look_at_screen: EyeIcon,
  analyze_graph: CrosshairIcon,
};

/** Running and done, as a student reads them: "Typing solve(…)", "Typed solve(…)". */
const TOOL_VERBS: Record<string, [string, string]> = {
  get_state: ["Looking at the calculator", "Looked at the calculator"],
  read_page: ["Reading the page", "Read the page"],
  evaluate: ["Checking", "Checked"],
  calculate: ["Typing", "Typed"],
  plot_function: ["Graphing", "Graphed"],
  set_window: ["Setting the window", "Set the window"],
  set_list: ["Filling column", "Filled column"],
  configure_data_stats: ["Plotting", "Plotted"],
  python: ["Running Python", "Ran Python"],
  add_page: ["Adding a page", "Added a page"],
  select_page: ["Going to page", "Went to page"],
  new_document: ["Starting a document", "Started a document"],
  save_document: ["Saving", "Saved"],
  list_documents: ["Looking in My Documents", "Looked in My Documents"],
  open_document: ["Opening", "Opened"],
  close_document: ["Closing the document", "Closed the document"],
  navigate: ["Going to", "Went to"],
  list_menu: ["Reading the menu", "Read the menu"],
  run_menu: ["Choosing", "Chose"],
  respond_to_dialog: ["Answering the dialog", "Answered the dialog"],
  type_keys: ["Pressing", "Pressed"],
  ask_user: ["Asking you", "Asked you"],
  write_notes: ["Writing notes", "Wrote notes"],
  construct_geometry: ["Constructing", "Constructed"],
  look_at_screen: ["Looking at the screen", "Looked at the screen"],
  highlight: ["Highlighting", "Highlighted"],
  analyze_graph: ["Analysing", "Analysed"],
};

/** Tools that only look (and asking the student): the rest change what's on screen, so AI mode shows them live. */
const LOOKING = new Set([...TOOLS.filter((t) => t.readOnly).map((t) => t.name), "ask_user"]);

const APP_NAMES: Record<string, string> = { calculator: "Calculator", graphs: "Graphs", geometry: "Geometry", lists: "Lists & Spreadsheet", datastats: "Data & Statistics", notes: "Notes", python: "Python", pyshell: "Python Shell" };

function toolSubject(name: string, input: Record<string, unknown> | undefined): string {
  const a = (input ?? {}) as Record<string, unknown>;
  switch (name) {
    case "calculate":
      return ((a.entries as string[]) ?? []).join(", ");
    case "plot_function":
      return `f${a.n ?? ""}(x) = ${a.expression ?? ""}`;
    case "evaluate":
      return String(a.expression ?? "");
    case "set_list":
      return [a.column, a.name].filter(Boolean).join(" ");
    case "configure_data_stats":
      return [a.x, a.y].filter(Boolean).join(" against ");
    case "add_page":
      return APP_NAMES[String(a.app)] ?? String(a.app ?? "");
    case "new_document":
      return APP_NAMES[String(a.first_page)] ? `with ${APP_NAMES[String(a.first_page)]}` : "";
    case "select_page":
      return String(Number(a.index ?? 0) + 1);
    case "save_document":
      return a.name ? `as ${a.name}` : "";
    case "open_document":
      return String(a.path ?? "").replace(/^.*\//, "");
    case "navigate":
      return { home: "Home", browse: "My Documents", scratchCalc: "the Scratchpad", scratchGraph: "the Scratchpad graph", current: "the document" }[String(a.to)] ?? "";
    case "run_menu":
    case "list_menu":
      return ((a.path as string[]) ?? []).join(" ▸ ");
    case "type_keys":
      return String(a.keys ?? "");
    case "highlight": {
      // "entry 3 on 1.1, cell B4": what it marked (pages by index, as the tool takes them).
      if (a.clear && !Array.isArray(a.items)) return "nothing (cleared)";
      const items = (a.items as { page?: number; entry?: number; cell?: string; fn?: number; point?: { x: number; y: number }; object?: string }[] | undefined) ?? [];
      const said = items.map((it) =>
        it.entry !== undefined
          ? `entry ${it.entry}`
          : it.cell
            ? `cell ${it.cell}`
            : it.fn !== undefined
              ? `f${it.fn}`
              : it.point
                ? `point (${it.point.x}, ${it.point.y})`
                : it.object
                  ? `object ${it.object}`
                  : "",
      );
      return said.filter(Boolean).slice(0, 3).join(", ") + (said.length > 3 ? "…" : "");
    }
    case "analyze_graph": {
      // "minimum of f1 on [0, 3]", "intersection of f1 and f2 on [−1, 2]", "dy/dx of f1 at x = 2".
      const f = `f${a.fn ?? ""}`;
      if (a.type === "dydx") return `dy/dx of ${f}${a.x !== undefined ? ` at x = ${a.x}` : ""}`;
      const what = a.type === "intersection" ? `intersection of ${f}${a.other !== undefined ? ` and f${a.other}` : ""}` : `${a.type ?? ""} of ${f}`;
      return a.lower !== undefined && a.upper !== undefined ? `${what} on [${a.lower}, ${a.upper}]` : what;
    }
    case "construct_geometry": {
      // "triangle ABC, length BC": what it built, as the student would say it.
      const objs = (a.objects as { type?: string; name?: string; points?: string[]; of?: string[] }[] | undefined) ?? [];
      const said = objs.filter((o) => o.type !== "point").map((o) => [String(o.type ?? "").replace(/_/g, " "), (o.points ?? o.of)?.join("") ?? o.name].filter(Boolean).join(" "));
      return said.length ? said.slice(0, 3).join(", ") + (said.length > 3 ? "…" : "") : objs.length ? `${objs.length} point${objs.length === 1 ? "" : "s"}` : "";
    }
    default:
      return "";
  }
}

/** A tool's result, readable: Calculator entries as "input → output", everything else as JSON. */
function toolOutput(name: string, output: unknown): string {
  const text = typeof output === "string" ? output : JSON.stringify(output);
  try {
    const j = JSON.parse(text) as unknown;
    if (name === "calculate" && Array.isArray(j))
      return (j as { input: string; output?: string; error?: string }[]).map((e) => `${e.input}  →  ${e.output ?? e.error}`).join("\n");
    return JSON.stringify(j, null, 2);
  } catch {
    return text;
  }
}


/** A step added while the agent works settles in once; its wrapper stays put when the step finishes and turns collapsible. */
function Step({ fresh, children }: { fresh: boolean; children: React.ReactNode }) {
  const [enter] = React.useState(fresh);
  return <div className={cn("min-w-0", enter && "ui-rise")}>{children}</div>;
}

function ToolStep({ part, running }: { part: ToolPart; running: boolean }) {
  const name = getToolName(part);
  const Icon = TOOL_ICONS[name] ?? CircleCheckIcon;
  const [doing, did] = TOOL_VERBS[name] ?? [name, name];
  const subject = toolSubject(name, part.input as Record<string, unknown>);
  const finished = part.state === "output-available" || part.state === "output-error";
  const title = (
    <>
      {running && !finished ? doing : did}
      {subject && <span className="ml-1 font-casmath text-[1.02em] text-foreground/80">{subject}</span>}
    </>
  );
  if (part.state === "output-available" || part.state === "output-error") {
    const failed = part.state === "output-error";
    return (
      <TraceCollapsible>
        <TraceCollapsibleTrigger>
          <TraceLine status={failed ? "error" : undefined}>
            <TraceIcon>
              <Icon />
            </TraceIcon>
            <TraceTitle className="truncate">{title}</TraceTitle>
          </TraceLine>
        </TraceCollapsibleTrigger>
        <TraceCollapsibleContent>
          {!failed && isScreenOutput(part.output) ? (
            // What the agent saw, as a picture, not its base64.
            <img
              src={`data:${part.output.image.mediaType};base64,${part.output.image.data}`}
              alt={part.output.text}
              className="max-h-56 w-auto max-w-full rounded-lg border"
            />
          ) : (
            <CodeBlock size="sm">
              <CodeBlockContent wrap className="max-h-64">
                {failed ? part.errorText : toolOutput(name, part.output)}
              </CodeBlockContent>
            </CodeBlock>
          )}
        </TraceCollapsibleContent>
      </TraceCollapsible>
    );
  }
  return (
    <TraceLine status={running ? "running" : "error"}>
      <TraceIcon>{running ? <LoaderCircleIcon className="animate-spin" /> : <Icon />}</TraceIcon>
      <TraceTitle className="truncate">{running ? title : <>Stopped: {title}</>}</TraceTitle>
    </TraceLine>
  );
}

function ReasoningStep({ text, running }: { text: string; running: boolean }) {
  const [open, setOpen] = React.useState<boolean>();
  return (
    <TraceCollapsible open={open ?? running} onOpenChange={setOpen}>
      <TraceCollapsibleTrigger>
        <TraceLine status={running ? "running" : undefined}>
          <TraceIcon>{running ? <BrainIcon /> : <CircleCheckIcon />}</TraceIcon>
          <TraceTitle>{running ? "Thinking" : "Thought"}</TraceTitle>
        </TraceLine>
      </TraceCollapsibleTrigger>
      <TraceCollapsibleContent className="whitespace-pre-wrap text-muted-foreground">{text}</TraceCollapsibleContent>
    </TraceCollapsible>
  );
}

// ---- The live view and the document card (AI mode)

/** What the agent is doing now, for the live view's status line. */
function activity(parts: Part[]): string {
  for (let i = parts.length - 1; i >= 0; i--) {
    const p = parts[i]!;
    if (isToolUIPart(p) && (p.state === "input-streaming" || p.state === "input-available")) {
      const name = getToolName(p);
      const subject = toolSubject(name, p.input as Record<string, unknown>);
      return `${(TOOL_VERBS[name] ?? [name])[0]}${subject ? ` ${subject}` : ""}`;
    }
    if (p.type === "reasoning" && p.state === "streaming") return "Thinking";
    if (p.type === "text" && p.state === "streaming") return "Writing the answer";
  }
  // Between steps: what it last did, which is what the screen shows.
  const done = [...parts].reverse().find(isToolUIPart);
  if (done) {
    const name = getToolName(done);
    const subject = toolSubject(name, done.input as Record<string, unknown>);
    return `${(TOOL_VERBS[name] ?? [name, name])[1]}${subject ? ` ${subject}` : ""}`;
  }
  return "Working";
}

/** highlights: how many of the assistant's highlights are on the calculator now. */
export type DocInfo = { open: boolean; title: string; pages: string[]; dirty: boolean; saved: boolean; highlights?: number };

/**
 * AI mode's calculator: the real screen (moved in through onSlot), seen but
 * never touched, always at the end of the conversation. While the agent
 * works it's live, under a turning light and a sweep; otherwise it's the
 * document as it stands, with Save, .tns and Open.
 */
function CalculatorCard({
  onSlot,
  live,
  status,
  info,
  doc,
}: {
  onSlot: (el: HTMLDivElement | null) => void;
  live: boolean;
  status: string;
  info: DocInfo;
  doc: DocActions;
}) {
  // Seen arriving (the agent made or opened it just now): it settles in; one already there is simply shown.
  const [enter] = React.useState(live);
  // The bars keep their height in both states, so going live and back never moves the chat: only what's in them crossfades.
  const bar = "absolute inset-0 flex items-center gap-2 px-3 transition-opacity duration-300 ease-out";
  return (
    <motion.div
      key="card"
      initial={enter ? { opacity: 0, y: 12, scale: 0.98 } : false}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, scale: 0.98, transition: { duration: 0.18, ease: [0.23, 1, 0.32, 1] } }}
      transition={{ type: "spring", duration: 0.5, bounce: 0 }}
      data-live={live}
      className="relative w-full max-w-xl overflow-hidden rounded-2xl bg-border p-px shadow-[0_12px_40px_-16px_rgba(0,0,0,0.7)]"
      aria-label={live ? `Live view: ${status}` : `${info.title}, as it stands`}
      role={live ? "status" : "group"}
    >
      <div aria-hidden className="live-border absolute -inset-1/2" />
      <div className="relative overflow-hidden rounded-[15px] bg-card">
        <div className="relative h-9 border-b border-border/60 text-xs">
          <div className={cn(bar, !live && "pointer-events-none opacity-0")} aria-hidden={!live}>
            <span className="relative flex size-2 shrink-0">
              <span className="absolute inline-flex size-full animate-ping rounded-full bg-sky-400 opacity-60" />
              <span className="relative inline-flex size-2 rounded-full bg-sky-400" />
            </span>
            <span className="shimmer truncate font-medium text-muted-foreground">{status}</span>
            <span className="ml-auto shrink-0 rounded-full bg-sky-400/10 px-2 py-0.5 text-[10px] font-semibold tracking-wide text-sky-300 uppercase">Live</span>
          </div>
          <div className={cn(bar, live && "pointer-events-none opacity-0")} aria-hidden={live}>
            <CalculatorIcon className="size-3.5 shrink-0 text-muted-foreground" />
            <span className="truncate font-medium">
              {info.dirty ? "*" : ""}
              {info.title}
            </span>
            <span className="truncate text-muted-foreground">{info.pages.join(" · ")}</span>
          </div>
        </div>
        <div className="relative">
          {/* The calculator's own screen is put in here: seen, never touched. */}
          <div ref={onSlot} inert className="pointer-events-none select-none" />
          <div aria-hidden className="live-sweep pointer-events-none absolute inset-0" />
        </div>
        <div inert={live} className={cn("flex h-11 items-center justify-end gap-1 border-t px-2 transition-opacity duration-300 ease-out", live && "opacity-40")}>
            {info.open && !info.saved && (
              <Button variant="ghost" size="sm" onClick={doc.save}>
                <SaveIcon data-icon="inline-start" />
                Save
              </Button>
            )}
            {info.open && (
              <Button variant="ghost" size="sm" onClick={doc.download}>
                <DownloadIcon data-icon="inline-start" />
                .tns
              </Button>
            )}
            <Button variant="outline" size="sm" onClick={doc.open}>
              Open in the calculator
            </Button>
        </div>
      </div>
    </motion.div>
  );
}

// ---- Messages

function MessageAction({ label, children, ...props }: React.ComponentProps<typeof Button> & { label: string }) {
  return (
    <Tooltip>
      <TooltipTrigger render={<Button variant="ghost" size="icon-sm" aria-label={label} {...props} />}>{children}</TooltipTrigger>
      <TooltipContent>
        <p>{label}</p>
      </TooltipContent>
    </Tooltip>
  );
}

const textOf = (m: CalcMessage) => m.parts.flatMap((p) => (p.type === "text" ? [p.text] : [])).join("\n\n");

function StepItems({ items, running }: { items: StepItem[]; running: boolean }) {
  // Runs of thinking and tool steps share one trace line; what it said and asked sit between them.
  const runs: StepItem[][] = [];
  for (const it of items) {
    const last = runs.at(-1);
    if (it.kind === "part" && last?.[0]?.kind === "part") last.push(it);
    else runs.push([it]);
  }
  return (
    <div className="flex flex-col gap-2">
      {runs.map((run) => {
        const first = run[0]!;
        if (first.kind === "ask") return <AskUser key={first.key} part={first.part} />;
        if (first.kind === "text")
          return (
            <Step key={first.key} fresh={running}>
              <Markdown streaming={running && first.streaming} className="text-muted-foreground">
                {first.text}
              </Markdown>
            </Step>
          );
        return (
          <Trace key={first.key}>
            {run.map((it) =>
              it.kind !== "part" ? null : it.part.type === "reasoning" ? (
                <Step key={it.key} fresh={running}>
                  <ReasoningStep text={it.part.text} running={running && it.part.state === "streaming"} />
                </Step>
              ) : isToolUIPart(it.part) ? (
                <Step key={it.key} fresh={running}>
                  <ToolStep part={it.part} running={running} />
                </Step>
              ) : null,
            )}
          </Trace>
        );
      })}
    </div>
  );
}

/**
 * One move: its steps open while it's the one under way, folded to a line
 * ("Added a page Graphs · 3 steps") once it's done. Earlier moves fold away
 * entirely while the agent works, so only the latest one is in view.
 */
function MoveFold({ move, running, current, shown }: { move: Move; running: boolean; current: boolean; shown: boolean }) {
  const [open, setOpen] = React.useState<boolean>();
  const tools = move.items.flatMap((it) => (it.kind === "part" && isToolUIPart(it.part) ? [it.part] : []));
  const failed = tools.some((p) => p.state === "output-error");
  const lead = [...tools].reverse().find((p) => MOVES.has(getToolName(p))) ?? tools[0];
  const name = lead ? getToolName(lead) : "";
  const Icon = lead ? (TOOL_ICONS[name] ?? CircleCheckIcon) : BrainIcon;
  const subject = lead ? toolSubject(name, lead.input as Record<string, unknown>) : "";
  const verb = lead ? (TOOL_VERBS[name] ?? [name, name])[1] : current ? "Thinking" : "Thought it through";
  return (
    <Collapsible open={shown}>
      <CollapsibleContent
        keepMounted
        className="h-(--collapsible-panel-height) overflow-hidden transition-[height,opacity] duration-250 ease-out data-ending-style:h-0 data-ending-style:opacity-0 data-starting-style:h-0 data-starting-style:opacity-0"
      >
        <Step fresh={running}>
          <TraceCollapsible open={open ?? current} onOpenChange={setOpen}>
            <TraceCollapsibleTrigger>
              <TraceLine status={current ? "running" : failed ? "error" : undefined}>
                <TraceIcon>{current ? <LoaderCircleIcon className="animate-spin" /> : <Icon />}</TraceIcon>
                <TraceTitle className="truncate">
                  {verb}
                  {subject && <span className="ml-1 font-casmath text-[1.02em] text-foreground/80">{subject}</span>}
                  {tools.length > 1 && <span className="ml-1.5 text-muted-foreground/70">· {tools.length} steps</span>}
                </TraceTitle>
              </TraceLine>
            </TraceCollapsibleTrigger>
            <TraceCollapsibleContent keepMounted>
              <StepItems items={move.items} running={running} />
            </TraceCollapsibleContent>
          </TraceCollapsible>
        </Step>
      </CollapsibleContent>
    </Collapsible>
  );
}

/**
 * The Chain of Thought pattern: every step of a turn (thinking, tool runs and
 * what it said between them) in one trace, open while the agent works and
 * folded away when it's done, so the answer stands on its own.
 */
function ChainOfThought({ steps, running, parts }: { steps: Group[]; running: boolean; parts: Part[] }) {
  const [open, setOpen] = React.useState<boolean>();
  const tools = parts.filter(isToolUIPart);
  const failed = tools.filter((p) => p.state === "output-error").length;
  const thought = parts.some((p) => p.type === "reasoning");
  const changed = tools.some((p) => !LOOKING.has(getToolName(p)));
  const summary = tools.length
    ? `${changed ? "Worked on the calculator" : "Looked at the calculator"} in ${tools.length} step${tools.length === 1 ? "" : "s"}${failed ? `, ${failed} failed` : ""}`
    : "Thought";
  const status = running ? "running" : failed ? "error" : undefined;
  // Seen working in this view: the summary fades in over the last activity as the trace folds away.
  const worked = React.useRef(running);
  if (running) worked.current = true;
  const list = moves(steps);
  return (
    <Trace>
      <TraceCollapsible open={open ?? running} onOpenChange={setOpen}>
        <TraceCollapsibleTrigger>
          <TraceLine status={status}>
            <TraceIcon>{running ? <LoaderCircleIcon className="animate-spin" /> : thought && !tools.length ? <BrainIcon /> : <CircleCheckIcon />}</TraceIcon>
            <TraceTitle key={running ? "running" : "done"} className={cn(!running && worked.current && "ui-fade")}>
              {running ? activity(parts) : summary}
            </TraceTitle>
          </TraceLine>
        </TraceCollapsibleTrigger>
        <TraceCollapsibleContent keepMounted className="flex flex-col gap-2">
          {/* Kept as moves while it works, so the first folds away (rather than jumping) when the second starts. */}
          {list.length === 1 && !running ? (
            <StepItems items={list[0]!.items} running={running} />
          ) : (
            list.map((m, i) => <MoveFold key={m.key} move={m} running={running} current={running && i === list.length - 1} shown={!running || i === list.length - 1} />)
          )}
        </TraceCollapsibleContent>
      </TraceCollapsible>
    </Trace>
  );
}

/** ask_user: the question, its options and (if allowed) a box for their own answer; once answered, what they said. */
function AskUser({ part, onAnswer }: { part: ToolPart; onAnswer?: (answer: string) => void }) {
  const [text, setText] = React.useState("");
  // Asked while this view is open: the card settles in, and the answer fades in where the options were.
  const [live] = React.useState(() => part.state !== "output-available");
  if (part.state === "input-streaming") return null;
  const input = (part.input ?? {}) as AskUserInput;
  const options = (input.options ?? []).slice(0, 4);
  const answered = part.state === "output-available" ? String(part.output) : null;
  const free = input.allowFreeText || !options.length;
  return (
    <div role="group" aria-label="The assistant asks" className={cn("flex flex-col gap-3 rounded-2xl border bg-card p-3.5", live && "ui-rise")}>
      <p className="flex gap-2.5 leading-snug font-medium text-foreground">
        <MessageCircleQuestionIcon className="mt-px size-4 shrink-0 text-sky-300" aria-hidden />
        {input.question}
      </p>
      {answered !== null ? (
        <p className={cn("flex items-baseline gap-1.5 pl-6.5 text-muted-foreground", live && "ui-fade")}>
          You answered: <span className="text-foreground">{answered}</span>
        </p>
      ) : !onAnswer ? (
        <p className="pl-6.5 text-muted-foreground">Not answered.</p>
      ) : (
        <>
          {options.length > 0 && (
            <div className="flex flex-col gap-1.5 pl-6.5">
              {options.map((o) => (
                <Button
                  key={o}
                  variant="outline"
                  size="sm"
                  className="h-auto min-h-8 w-full justify-start rounded-xl py-1.5 text-left font-normal whitespace-normal"
                  onClick={() => onAnswer(o)}
                >
                  {o}
                </Button>
              ))}
            </div>
          )}
          {free && (
            <form
              className="flex gap-2 pl-6.5"
              onSubmit={(e) => {
                e.preventDefault();
                if (text.trim()) onAnswer(text.trim());
              }}
            >
              <Input aria-label="Your answer" placeholder={options.length ? "Or type your own answer" : "Type your answer"} value={text} onChange={(e) => setText(e.target.value)} />
              <Button type="submit" size="sm" disabled={!text.trim()}>
                Send
              </Button>
            </form>
          )}
        </>
      )}
    </div>
  );
}

/** Under a student's message: the mode it was sent in, when it wasn't Solve. */
function ModeChip({ mode }: { mode: Mode }) {
  const Icon = MODE_ICONS[mode];
  return (
    <span className="flex items-center gap-1 self-end text-xs text-sky-300/90">
      <Icon className="size-3" aria-hidden />
      {MODES[mode].label} mode
    </span>
  );
}

function CopyAction({ text }: { text: string }) {
  const [copied, setCopied] = React.useState(false);
  return (
    <MessageAction
      label={copied ? "Copied" : "Copy"}
      onClick={() => {
        void navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }}
    >
      {copied ? <CheckIcon /> : <CopyIcon />}
    </MessageAction>
  );
}

/**
 * Undo changes: the first click asks (a toast, the button turns red), the
 * second puts the calculator back, as the screen's Clear all does.
 */
function UndoAction({ onUndo }: { onUndo: () => Promise<boolean> }) {
  const [confirming, setConfirming] = React.useState(false);
  React.useEffect(() => {
    if (!confirming) return;
    const t = setTimeout(() => setConfirming(false), 4000);
    return () => clearTimeout(t);
  }, [confirming]);
  return (
    <MessageAction
      label={confirming ? "Click again to undo" : "Undo changes"}
      className={cn(confirming && "text-destructive hover:text-destructive")}
      onClick={() => {
        if (!confirming) {
          setConfirming(true);
          toast("What this reply did on the calculator will be undone. Click again to undo it.");
          return;
        }
        setConfirming(false);
        void onUndo().then((done) => done && toast.success("Undid the assistant's changes. Files it saved stay in My Documents."));
      }}
    >
      <Undo2Icon />
    </MessageAction>
  );
}

function AssistantTurn({
  message,
  busy,
  last,
  onRetry,
  onAnswer,
  onUndo,
  onContinue,
  onClearHighlights,
  pages,
  onPageLink,
}: {
  message: CalcMessage;
  busy: boolean;
  last: boolean;
  onRetry: () => void;
  /** Answers this turn's open question; only while it's the last message. */
  onAnswer?: (toolCallId: string, answer: string) => void;
  /** Only on the latest reply, when it changed the calculator and the chat's document is open. */
  onUndo?: () => Promise<boolean>;
  /** Only on the latest reply, when it stopped at the step limit. */
  onContinue?: () => void;
  /** Only on the latest reply, while the assistant's highlights are on the calculator. */
  onClearHighlights?: () => void;
  /** The chat's open document's pages, which page names in the reply link to. */
  pages?: string[];
  onPageLink?: (i: number) => void;
}) {
  const running = busy && last;
  const reply = textOf(message);
  const all = groups(message.parts);
  // The answer is what follows the last step; everything before it is working.
  const lastStep = all.map((g) => g.kind).lastIndexOf("steps");
  const steps = all.slice(0, lastStep + 1);
  const answer = all.slice(lastStep + 1).filter((g) => g.kind !== "steps");
  const paused = Boolean(message.metadata?.limit) && !running;
  return (
    <Message>
      <MessageContent className="gap-3">
        {steps.length > 0 && <ChainOfThought steps={steps} running={running && !answer.length} parts={message.parts} />}
        {answer.map((g, i) =>
          g.kind === "ask" ? (
            <AskUser key={g.part.toolCallId} part={g.part} onAnswer={onAnswer && !busy ? (a) => onAnswer(g.part.toolCallId, a) : undefined} />
          ) : (
            <Markdown key={i} streaming={running && g.streaming} onPageLink={pages?.length ? onPageLink : undefined}>
              {pages?.length ? linkPages(g.text, pages) : g.text}
            </Markdown>
          ),
        )}
        {paused && (
          <div className="ui-fade flex flex-wrap items-center gap-x-2 gap-y-1.5 text-sm text-muted-foreground">
            <PauseIcon className="size-3.5 shrink-0" aria-hidden />
            Paused after {MAX_STEPS} steps.
            {onContinue && (
              <Button size="xs" variant="outline" onClick={onContinue}>
                Continue
              </Button>
            )}
          </div>
        )}
        {/* Held in place (hidden) while the reply streams, so it doesn't push the page down when the reply ends. */}
        {(reply || onUndo || onClearHighlights) && (
          <MessageFooter
            className={cn(
              "-ml-2 px-0 opacity-0 transition-opacity duration-200 group-hover/message:opacity-100 focus-within:opacity-100 pointer-coarse:opacity-100",
              running && "invisible",
            )}
          >
            {reply && <CopyAction text={reply} />}
            {last && (
              <MessageAction label="Retry" onClick={onRetry}>
                <RefreshCcwIcon />
              </MessageAction>
            )}
            {onUndo && <UndoAction onUndo={onUndo} />}
            {onClearHighlights && (
              <MessageAction label="Clear highlights" onClick={onClearHighlights}>
                <EraserIcon />
              </MessageAction>
            )}
          </MessageFooter>
        )}
      </MessageContent>
    </Message>
  );
}

// ---- Model selector (two menus: the model, and how hard it thinks)

const EFFORTS: { id: Effort; name: string }[] = [
  { id: "off", name: "Off" },
  { id: "low", name: "Low" },
  { id: "medium", name: "Medium" },
  { id: "high", name: "High" },
];

/** compact: the side panel, where the thinking menu shows only its icon (its name stays in its label). */
function ModelSelector({ config, setConfig, onKeys, compact = false }: { config: AiConfig; setConfig: (c: AiConfig) => void; onKeys: () => void; compact?: boolean }) {
  const providers = (Object.keys(PROVIDERS) as ProviderId[]).filter((p) => usable(config, p));
  const value = `${config.provider}::${modelOf(config)}`;
  const effort = EFFORTS.find((e) => e.id === (config.effort ?? "low")) ?? EFFORTS[1]!;
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={<InputGroupButton size="sm" variant="ghost" aria-label={`Model: ${modelName(modelOf(config))}`} className="max-w-48 min-w-0 shrink text-muted-foreground" />}
        >
          <span className="truncate">{configured(config) ? modelName(modelOf(config)) : "Choose a model"}</span>
          <ChevronDownIcon />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" side="top" className="max-h-80 w-60">
          <DropdownMenuRadioGroup
            value={value}
            onValueChange={(v: string) => {
              const [p, id] = v.split("::") as [ProviderId, string];
              setConfig({ ...config, provider: p, models: { ...config.models, [p]: id } });
            }}
          >
            {providers.map((p, i) => (
              <React.Fragment key={p}>
                {i > 0 && <DropdownMenuSeparator />}
                <DropdownMenuGroup>
                  <DropdownMenuLabel>{PROVIDERS[p].label}</DropdownMenuLabel>
                  {modelsFor(config, p).map((id) => (
                    <DropdownMenuRadioItem key={id} value={`${p}::${id}`} closeOnClick>
                      {modelName(id)}
                    </DropdownMenuRadioItem>
                  ))}
                </DropdownMenuGroup>
              </React.Fragment>
            ))}
          </DropdownMenuRadioGroup>
          {providers.length > 0 && <DropdownMenuSeparator />}
          <DropdownMenuItem onClick={onKeys}>
            <KeyRoundIcon />
            {providers.length ? "Keys and services…" : "Add an API key…"}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <DropdownMenu>
        <DropdownMenuTrigger render={<InputGroupButton size="sm" variant="ghost" aria-label={`Thinking: ${effort.name}`} className="text-muted-foreground" />}>
          <BrainIcon />
          {!compact && effort.name}
          <ChevronDownIcon />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" side="top" className="w-40">
          <DropdownMenuGroup>
            <DropdownMenuLabel>Thinking</DropdownMenuLabel>
            <DropdownMenuRadioGroup value={effort.id} onValueChange={(v: string) => setConfig({ ...config, effort: v as Effort })}>
              {EFFORTS.map((e) => (
                <DropdownMenuRadioItem key={e.id} value={e.id} closeOnClick>
                  {e.name}
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  );
}

const MODE_ICONS: Record<Mode, LucideIcon> = { solve: SparklesIcon, exam: PenLineIcon, guide: GraduationCapIcon, check: ListChecksIcon };

/** The mode menu: how much the assistant does (modes.ts). Anything but Solve shows its name in colour, so it's never forgotten. */
function ModeSelector({ config, setConfig, compact = false }: { config: AiConfig; setConfig: (c: AiConfig) => void; compact?: boolean }) {
  const mode = modeOf(config);
  const Icon = MODE_ICONS[mode];
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <InputGroupButton size="sm" variant="ghost" aria-label={`Mode: ${MODES[mode].label}`} className={cn("text-muted-foreground", mode !== "solve" && "text-sky-300")} />
        }
      >
        <Icon />
        {/* In the narrow panel only Solve hides its name: another mode is named, so it's never forgotten. */}
        {(!compact || mode !== "solve") && MODES[mode].label}
        <ChevronDownIcon />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" side="top" className="w-72">
        <DropdownMenuGroup>
          <DropdownMenuLabel>Mode</DropdownMenuLabel>
          <DropdownMenuRadioGroup value={mode} onValueChange={(v: string) => setConfig({ ...config, mode: v as Mode, tutor: undefined })}>
            {MODE_IDS.map((id) => {
              const I = MODE_ICONS[id];
              return (
                <DropdownMenuRadioItem key={id} value={id} closeOnClick className="items-start">
                  <I className="mt-0.5" />
                  <span className="flex flex-col">
                    {MODES[id].label}
                    <span className="text-xs text-muted-foreground">{MODES[id].blurb}</span>
                  </span>
                </DropdownMenuRadioItem>
              );
            })}
          </DropdownMenuRadioGroup>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

// ---- Settings: one service at a time

const SERVICE_NAMES: Record<ProviderId, string> = { ...Object.fromEntries((Object.keys(PROVIDERS) as ProviderId[]).map((p) => [p, PROVIDERS[p].label])), custom: "Custom (OpenAI-compatible)" } as Record<ProviderId, string>;

/** The model ID: typed, or (once the service has listed its models) picked from them, filtered as you type. */
function ModelField({ id, value, list, placeholder, onChange }: { id: string; value: string; list: string[]; placeholder: string; onChange: (v: string) => void }) {
  if (!list.length) return <Input id={id} spellCheck={false} placeholder={placeholder} value={value} onChange={(e) => onChange(e.target.value)} />;
  return (
    <Combobox.Root
      items={list}
      inputValue={value}
      // Only what the student types: closing the list would otherwise reset a model ID that isn't listed.
      onInputValueChange={(v, d) => d.reason === "input-change" && onChange(v)}
      value={list.includes(value) ? value : null}
      onValueChange={(v) => v && onChange(v)}
    >
      <Combobox.Input id={id} spellCheck={false} placeholder={placeholder} render={<Input />} />
      <Combobox.Portal>
        <Combobox.Positioner sideOffset={4} className="isolate z-50">
          <Combobox.Popup className="ui-pop max-h-[min(18rem,var(--available-height))] w-(--anchor-width) overflow-y-auto rounded-2xl bg-popover p-1 text-popover-foreground shadow-lg ring-1 ring-foreground/5 dark:ring-foreground/10">
            <Combobox.Empty className="px-2 py-1.5 text-sm text-muted-foreground empty:hidden">No listed model matches. It&apos;s used as typed.</Combobox.Empty>
            <Combobox.List>
              {(m: string) => (
                <Combobox.Item
                  key={m}
                  value={m}
                  className="flex min-h-7 cursor-default items-center rounded-xl px-2 py-1.5 text-sm outline-hidden select-none data-highlighted:bg-accent data-highlighted:text-accent-foreground"
                >
                  {m}
                </Combobox.Item>
              )}
            </Combobox.List>
          </Combobox.Popup>
        </Combobox.Positioner>
      </Combobox.Portal>
    </Combobox.Root>
  );
}

const IMAGE_CHOICES = { auto: "Detect automatically", yes: "Yes", no: "No (describe the screen in words)" };

/**
 * Whether this model reads images (OpenAI-compatible services, where some
 * don't). Detect tries a picture and, if it's refused, remembers No; the
 * screen then goes to the model in words. The student can set it either way.
 */
function ImagesField({ value, onChange }: { value: boolean | undefined; onChange: (v: boolean | undefined) => void }) {
  const choice = value === undefined ? "auto" : value ? "yes" : "no";
  return (
    <div className="grid gap-1.5">
      <span className="text-sm font-medium">This model reads images</span>
      <Select items={IMAGE_CHOICES} value={choice} onValueChange={(v) => v && onChange(v === "auto" ? undefined : v === "yes")}>
        <SelectTrigger className="w-full" aria-label="This model reads images">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            {(Object.keys(IMAGE_CHOICES) as (keyof typeof IMAGE_CHOICES)[]).map((id) => (
              <SelectItem key={id} value={id}>
                {IMAGE_CHOICES[id]}
              </SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>
      <p className="text-xs text-muted-foreground">Screenshots and pictures you attach go only to models that read them; others get the screen described in words.</p>
    </div>
  );
}

export function AssistantSettings({ open, onOpenChange, config, setConfig }: { open: boolean; onOpenChange: (o: boolean) => void; config: AiConfig; setConfig: (c: AiConfig) => void }) {
  const [draft, setDraft] = React.useState(config);
  const [fetching, setFetching] = React.useState(false);
  const [fetched, setFetched] = React.useState<string | null>(null);
  React.useEffect(() => {
    if (open) setDraft(config);
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  React.useEffect(() => setFetched(null), [draft.provider]);
  const p = draft.provider;
  const list = draft.lists?.[p] ?? [];
  const fetchModels = async () => {
    setFetching(true);
    const ids = await listModels(draft, p);
    setDraft((d) => ({ ...d, lists: { ...(d.lists ?? {}), [p]: ids } }));
    setFetched(ids.length ? null : "Couldn't list the models. Check the key (and URL), or type the model ID.");
    setFetching(false);
  };
  const keyUrl = PROVIDERS[p].keyUrl;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>AI service</DialogTitle>
          <DialogDescription>Bring your own key. It stays in this browser and goes only to this service, with the calculator&apos;s state for each message.</DialogDescription>
        </DialogHeader>
        <form
          id="ai-service"
          className="grid gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            setConfig(draft);
            onOpenChange(false);
          }}
        >
          <div className="grid gap-1.5">
            <span className="text-sm font-medium">Service</span>
            <Select items={SERVICE_NAMES} value={p} onValueChange={(v) => v && setDraft({ ...draft, provider: v as ProviderId })}>
              <SelectTrigger className="w-full" aria-label="Service">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {(Object.keys(PROVIDERS) as ProviderId[]).map((id) => (
                    <SelectItem key={id} value={id}>
                      {SERVICE_NAMES[id]}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </div>
          {p === "custom" && (
            <div className="grid gap-1.5">
              <label htmlFor="ai-base" className="text-sm font-medium">
                Base URL
              </label>
              <Input
                id="ai-base"
                placeholder="https://…/v1 or http://localhost:11434/v1"
                spellCheck={false}
                value={draft.baseUrl}
                onChange={(e) => setDraft({ ...draft, baseUrl: e.target.value.trim() })}
              />
            </div>
          )}
          <div className="grid gap-1.5">
            <div className="flex items-center justify-between">
              <label htmlFor="ai-key" className="text-sm font-medium">
                API key{p === "custom" ? " (if it needs one)" : ""}
              </label>
              {keyUrl && (
                <a href={keyUrl} target="_blank" rel="noreferrer" className="text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline">
                  Get a key
                </a>
              )}
            </div>
            <Input
              id="ai-key"
              type="password"
              autoComplete="off"
              spellCheck={false}
              placeholder="Paste your key"
              value={draft.keys[p] ?? ""}
              onChange={(e) => setDraft({ ...draft, keys: { ...draft.keys, [p]: e.target.value.trim() } })}
            />
          </div>
          <div className="grid gap-1.5">
            <div className="flex items-center justify-between">
              <label htmlFor="ai-model" className="text-sm font-medium">
                Model
              </label>
              <Button type="button" variant="ghost" size="xs" disabled={fetching || !(p === "custom" ? draft.baseUrl : draft.keys[p])} onClick={() => void fetchModels()}>
                {fetching ? <LoaderCircleIcon className="animate-spin" data-icon="inline-start" /> : <RefreshCcwIcon data-icon="inline-start" />}
                Fetch models
              </Button>
            </div>
            <ModelField
              id="ai-model"
              placeholder={PROVIDERS[p].model || "model ID"}
              value={draft.models[p] ?? ""}
              list={list}
              onChange={(v) => setDraft((d) => ({ ...d, models: { ...d.models, [p]: v.trim() } }))}
            />
            {fetched && <p className="text-xs text-destructive">{fetched}</p>}
          </div>
          {(p === "custom" || p === "openrouter") && modelOf(draft, p) && (
            <ImagesField
              value={draft.vision?.[visionKey(p, modelOf(draft, p))]}
              onChange={(v) => {
                const key = visionKey(p, modelOf(draft, p));
                const { [key]: _was, ...rest } = draft.vision ?? {};
                setDraft({ ...draft, vision: v === undefined ? rest : { ...rest, [key]: v } });
              }}
            />
          )}
        </form>
        <p className="text-xs text-muted-foreground">
          WebMCP:{" "}
          {modelContext()
            ? `this browser has it, so its agents can use the calculator's ${TOOLS.length} tools too.`
            : "not in this browser, so only this chat uses the calculator's tools."}
        </p>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="submit" form="ai-service" disabled={!usable(draft, p) || !modelOf(draft)}>
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---- The chat

/**
 * A message's box, widened by what hangs outside it: the actions sit 8 px out
 * (-ml-2, -mr-2) and their focus rings 3 px more, and the item's
 * content-visibility: auto clips its painting to its own box.
 */
const ITEM = "-mx-3 -mb-1 px-3 pb-1";


/** A big screenshot is scaled to 1568 px on its long side (what vision models read at), as JPEG. */
async function imageFile(file: File): Promise<FileUIPart | null> {
  if (!file.type.startsWith("image/")) return null;
  const bmp = await createImageBitmap(file);
  const k = Math.min(1, 1568 / Math.max(bmp.width, bmp.height));
  const c = document.createElement("canvas");
  c.width = Math.round(bmp.width * k);
  c.height = Math.round(bmp.height * k);
  const g = c.getContext("2d")!;
  g.fillStyle = "#fff";
  g.fillRect(0, 0, c.width, c.height);
  g.drawImage(bmp, 0, 0, c.width, c.height);
  return { type: "file", mediaType: "image/jpeg", filename: file.name, url: c.toDataURL("image/jpeg", 0.9) };
}

/** openPage: show a page of the chat's document on the calculator (a page name clicked in a reply). */
export type DocActions = { open: () => void; download: () => void; save: () => void; openPage: (i: number) => void; clearHighlights: () => void };

export function AssistantChat({
  assistant,
  immersive = false,
  onSettings,
  onLiveSlot,
  info,
  doc,
  className,
}: {
  assistant: Assistant;
  /** AI mode: the reply shows the calculator's screen live while the agent works on it. */
  immersive?: boolean;
  onSettings: () => void;
  onLiveSlot?: (el: HTMLDivElement | null) => void;
  /** The open document, for AI mode's calculator card. */
  info?: DocInfo;
  doc: DocActions;
  className?: string;
}) {
  const { chat, config, setConfig, host } = assistant;
  const { messages, sendMessage, status, stop, regenerate, error, clearError, addToolOutput } = useChat({ chat });
  const [draft, setDraft] = React.useState("");
  const [files, setFiles] = React.useState<FileUIPart[]>([]);
  const formRef = React.useRef<HTMLFormElement>(null);
  const picker = React.useRef<HTMLInputElement>(null);
  const reduce = useReducedMotionConfig();
  const busy = status === "submitted" || status === "streaming";
  const ready = configured(config);
  const lastAssistant = [...messages].reverse().find((m) => m.role === "assistant");
  const working = Boolean(lastAssistant?.parts.some((p) => isToolUIPart(p) && !LOOKING.has(getToolName(p))));
  // Undo changes: on the latest reply, if its turn changed the calculator and the chat's document is still the one open.
  const lastUser = [...messages].reverse().find((m) => m.role === "user");
  const undoable =
    !busy && Boolean(info?.open) && Boolean(lastUser) && assistant.thread.checkpoint?.after === lastUser!.id && messages.indexOf(lastAssistant!) > messages.indexOf(lastUser!);
  // Page names in replies link to the chat's document, while it's open.
  const pages = info?.open ? info.pages : undefined;
  // The messages a chat already had when it was opened are just shown; only ones sent since rise in.
  const shown = React.useRef<{ chat: Chat<CalcMessage>; ids: Set<string> } | null>(null);
  if (shown.current?.chat !== chat) shown.current = { chat, ids: new Set(messages.map((m) => m.id)) };
  const opened = shown.current.ids;

  // AI mode's calculator card, always last: live while the agent changes things, otherwise the document as it stands.
  // Only this chat's own document: a new chat has none until the agent makes or opens one.
  const card = immersive && info?.open && onLiveSlot && (
    <CalculatorCard onSlot={onLiveSlot} live={busy && working} status={lastAssistant ? activity(lastAssistant.parts) : "Working"} info={info} doc={doc} />
  );

  const send = (text: string) => {
    if (busy || !ready || (!text.trim() && !files.length)) return;
    const s = host().snapshot();
    const mode = modeOf(config);
    const note = assistant.takeNote()
      ? "The student undid your last reply's changes: the calculator is back as it was before that reply (files it saved stay in My Documents)."
      : undefined;
    const state = {
      ...stateOf(s),
      ...(immersive ? { studentView: "AI mode: they see this chat and a live view of the screen while you work, not the calculator itself" } : {}),
      ...(mode !== "solve" ? { mode } : {}),
      ...(note ? { note } : {}),
    };
    const context = contextBlock(state, s.view === "doc" ? pageContent(s.doc, s.doc.active) : null);
    clearError();
    void sendMessage({ text: text.trim(), files, metadata: { context, ...(mode !== "solve" ? { mode } : {}) } });
    setDraft("");
    setFiles([]);
  };
  const addFiles = async (list: File[]) => {
    const parts = (await Promise.all(list.map(imageFile))).filter((p): p is FileUIPart => p !== null);
    if (parts.length) setFiles((f) => [...f, ...parts].slice(0, 4));
  };

  return (
    <MessageScrollerProvider autoScroll>
      <div className={cn("flex min-h-0 flex-1 flex-col", className)}>
        <div className="relative min-h-0 flex-1">
          {messages.length === 0 ? (
            <div className="h-full overflow-y-auto">
            <Empty className="min-h-full">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <SigmaIcon />
                </EmptyMedia>
                <EmptyTitle>{modeOf(config) !== "solve" || immersive ? MODES[modeOf(config)].title : "Ask about your maths"}</EmptyTitle>
                <EmptyDescription>
                  {ready
                    ? MODES[modeOf(config)].description
                    : "Add an API key to start. It stays in this browser."}
                </EmptyDescription>
              </EmptyHeader>
              {ready ? (
                <div className="flex max-w-md flex-wrap justify-center gap-2">
                  {MODES[modeOf(config)].suggestions.map((s) => (
                    <Button key={s} variant="outline" size="sm" className="rounded-full font-normal" onClick={() => send(s)}>
                      {s}
                    </Button>
                  ))}
                </div>
              ) : (
                <Button onClick={onSettings}>
                  <KeyRoundIcon data-icon="inline-start" />
                  Add an API key
                </Button>
              )}
              {card && <div className="mt-4 flex w-full justify-center">{card}</div>}
            </Empty>
            </div>
          ) : (
            <MessageScroller>
              <MessageScrollerViewport>
                <MessageScrollerContent aria-busy={busy} className={cn("gap-6 py-4", immersive ? "mx-auto w-full max-w-3xl px-6 pb-8" : "px-4")}>
                  {messages.map((m) =>
                    m.role === "user" ? (
                      <motion.div
                        key={m.id}
                        initial={reduce || opened.has(m.id) ? false : { opacity: 0, y: 10, scale: 0.98 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        transition={{ type: "spring", duration: 0.4, bounce: 0 }}
                        className="origin-bottom-right"
                      >
                        <MessageScrollerItem messageId={m.id} scrollAnchor className={ITEM}>
                          <Message align="end">
                            <MessageContent>
                              {m.parts.map((p, i) =>
                                p.type === "file" && p.mediaType.startsWith("image/") ? (
                                  <img key={i} src={p.url} alt={p.filename ?? "Attached image"} className="max-h-48 rounded-2xl border" />
                                ) : null,
                              )}
                              {textOf(m) && (
                                <Bubble align="end" variant="muted">
                                  <BubbleContent className="whitespace-pre-wrap">{textOf(m)}</BubbleContent>
                                </Bubble>
                              )}
                              {m.metadata?.mode && m.metadata.mode !== "solve" && <ModeChip mode={m.metadata.mode} />}
                              {textOf(m) && (
                                <MessageFooter className="-mr-2 px-0 opacity-0 transition-opacity group-hover/message:opacity-100 focus-within:opacity-100 pointer-coarse:opacity-100">
                                  <CopyAction text={textOf(m)} />
                                </MessageFooter>
                              )}
                            </MessageContent>
                          </Message>
                        </MessageScrollerItem>
                      </motion.div>
                    ) : (
                      <MessageScrollerItem key={m.id} messageId={m.id} className={ITEM}>
                        <AssistantTurn
                          message={m}
                          busy={busy}
                          last={m === lastAssistant}
                          onRetry={() => void regenerate({ messageId: m.id })}
                          onAnswer={m === messages.at(-1) ? (toolCallId, output) => void addToolOutput({ tool: "ask_user", toolCallId, output }) : undefined}
                          onUndo={undoable && m === lastAssistant ? assistant.undoLast : undefined}
                          onClearHighlights={m === lastAssistant && !busy && info?.highlights ? doc.clearHighlights : undefined}
                          onContinue={m === messages.at(-1) && !busy ? () => send("Continue.") : undefined}
                          pages={pages}
                          onPageLink={doc.openPage}
                        />
                      </MessageScrollerItem>
                    ),
                  )}
                  <AnimatePresence initial={false}>{card}</AnimatePresence>
                  {status === "submitted" && (
                    <Message className="ui-fade">
                      <MessageContent>
                        <TraceLine status="running">
                          <TraceIcon>
                            <LoaderCircleIcon className="animate-spin" />
                          </TraceIcon>
                          <TraceTitle>Working</TraceTitle>
                        </TraceLine>
                      </MessageContent>
                    </Message>
                  )}
                  {error && (
                    <div role="alert" className="ui-rise rounded-2xl border border-destructive/30 bg-destructive/10 px-3.5 py-2.5 text-sm text-destructive">
                      {error.message}
                      <div className="mt-2 flex gap-2">
                        <Button size="xs" variant="outline" onClick={() => void regenerate()}>
                          Try again
                        </Button>
                        <Button size="xs" variant="ghost" onClick={onSettings}>
                          Keys and services
                        </Button>
                      </div>
                    </div>
                  )}
                </MessageScrollerContent>
              </MessageScrollerViewport>
              <MessageScrollerButton />
            </MessageScroller>
          )}
        </div>
        <form
          ref={formRef}
          className={cn("shrink-0 pb-4", immersive ? "mx-auto w-full max-w-3xl px-6" : "px-3 pt-1")}
          onSubmit={(e) => {
            e.preventDefault();
            send(draft);
          }}
        >
          <InputGroup className="rounded-3xl border-white/[0.07] bg-[#1a1a1a] shadow-[0_1px_0_0_rgba(255,255,255,0.04)_inset,0_10px_32px_-14px_rgba(0,0,0,0.7)]">
            {files.length > 0 && (
              <InputGroupAddon align="block-start" className="flex-wrap gap-2 px-3 pt-3">
                {files.map((f, i) => (
                  <Attachment key={i} size="sm" className="relative">
                    <AttachmentMedia variant="image" className="size-12 overflow-hidden rounded-lg">
                      <img src={f.url} alt={f.filename ?? "Attached image"} />
                    </AttachmentMedia>
                    <button
                      type="button"
                      aria-label="Remove image"
                      onClick={() => setFiles((fs) => fs.filter((_, j) => j !== i))}
                      className="absolute -top-1.5 -right-1.5 grid size-5 place-items-center rounded-full bg-secondary text-foreground ring-1 ring-border"
                    >
                      <XIcon className="size-3" />
                    </button>
                  </Attachment>
                ))}
              </InputGroupAddon>
            )}
            <InputGroupTextarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder={ready ? "Ask about your maths…" : "Add an API key to start"}
              aria-label="Message the assistant"
              className="max-h-48 min-h-14 px-4 pt-3.5"
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                  e.preventDefault();
                  formRef.current?.requestSubmit();
                }
              }}
              onPaste={(e) => {
                const imgs = Array.from(e.clipboardData.files).filter((f) => f.type.startsWith("image/"));
                if (imgs.length) {
                  e.preventDefault();
                  void addFiles(imgs);
                }
              }}
            />
            <InputGroupAddon align="block-end" className="gap-1 px-2 pb-2">
              <InputGroupButton type="button" size="icon-sm" variant="ghost" className="rounded-full" aria-label="Attach an image" onClick={() => picker.current?.click()}>
                <PlusIcon />
              </InputGroupButton>
              <ModeSelector config={config} setConfig={setConfig} compact={!immersive} />
              <ModelSelector config={config} setConfig={setConfig} onKeys={onSettings} compact={!immersive} />
              {busy ? (
                <InputGroupButton key="stop" type="button" size="icon-sm" variant="default" className="ui-swap ml-auto rounded-full" aria-label="Stop" onClick={() => void stop()}>
                  <SquareIcon className="fill-current" />
                </InputGroupButton>
              ) : (
                <InputGroupButton
                  key="send"
                  type="submit"
                  size="icon-sm"
                  variant="default"
                  className="ui-swap ml-auto rounded-full"
                  aria-label="Send"
                  disabled={!ready || (!draft.trim() && !files.length)}
                >
                  <ArrowUpIcon />
                </InputGroupButton>
              )}
            </InputGroupAddon>
          </InputGroup>
          <input
            ref={picker}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={(e) => {
              void addFiles(Array.from(e.target.files ?? []));
              e.target.value = "";
            }}
          />
        </form>
      </div>
    </MessageScrollerProvider>
  );
}
