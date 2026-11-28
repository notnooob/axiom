// SPDX-License-Identifier: GPL-3.0-or-later
/**
 * Notes: a text page with maths boxes. The text is a real editable element
 * (typing, selecting, copying and undo are the browser's own); the keypad and
 * the menu work on it through the same commands. A maths box is worked out
 * with Enter (Ctrl+Enter for a decimal), with the problem's variables, and
 * what it defines (a:=5) is defined for the problem.
 */
import { useEffect, useLayoutEffect, useRef, useState, type MutableRefObject } from "react";
import { createPortal } from "react-dom";
import { SliderMenu } from "../graphs/graphs-app";
import { SliderView } from "../graphs/sliders";
import type { Key } from "../keys";
import { templateNode } from "../math/editor";
import { rowToLinear } from "../math/tree";
import type { NotesMath, NotesPage, NotesRun, Slider, UnsupportedPage } from "../state/document";
import { BUTTONS, FormatPanel, formatPanelKey, openFormatPanel, type FormatButton, type FormatChoice, type FormatPanelState } from "./format-panel";
import { chemBoxHtml, chemHtml, commentHtml, mathBoxHtml, notesHtml, readNotes, sliderHtml } from "./model";

export type NotesApi = {
  /** A key from the keypad (the keyboard types straight into the page). */
  key(k: Key): void;
  /** A Notes menu item (notes:…). */
  action(id: string): void;
  /** Text into the current maths box, or a new one: the Calculations menu, a wizard's command. */
  insertMath(text: string): void;
  /** Insert ▸ Slider: the slider's place at the caret (after the box the caret is in), or `old`'s place renamed. */
  placeSlider(name: string, old?: string): void;
  /** A deleted slider's place taken out of the text. */
  removeSlider(name: string): void;
  /** Format text…'s panel is open: Esc closes it rather than leaving the page. */
  panelOpen(): boolean;
  /** Where the caret is, for the ctrl menu: in a maths box (and what it holds), and whether text is selected. */
  context(): { inBox: boolean; selection: boolean; warning: boolean; inactive: boolean };
  /** The assistant's pointing: the caret into maths box `box` (from 1), or `text` selected; an error, or null. */
  select(where: { box?: number; text?: string }): string | null;
  /** The current maths box's attributes, for the Math Box Attributes dialog (null outside a box). */
  attrs(): NotesMath | null;
  setAttrs(a: { hideIn: boolean; hideOut: boolean }): void;
};

type Evaluate = (text: string, approx: boolean) => Promise<{ ok: boolean; text: string; warn?: string }>;

export function NotesApp({
  page,
  onChange,
  evaluate,
  apiRef,
  onReport,
  onSlider,
  onSliderTyped,
  onSliderAction,
}: {
  page: NotesPage;
  onChange: (paras: NotesRun[][]) => void;
  evaluate: Evaluate;
  apiRef: MutableRefObject<NotesApi | null>;
  /** Show Error… and Show Warning Info…: a message for the shell to show. */
  onReport?: (text: string) => void;
  /** Insert ▸ Slider's sliders: a value dragged or stepped to (final once it's let go), or typed. */
  onSlider?: (name: string, value: number, final: boolean) => void;
  onSliderTyped?: (name: string, text: string) => void;
  onSliderAction?: (name: string, action: "move" | "settings" | "animate" | "minimize" | "delete") => void;
}) {
  const el = useRef<HTMLDivElement>(null);
  const outer = useRef<HTMLDivElement>(null);
  const [fs, setFs] = useState(16);
  const [sliderMenu, setSliderMenu] = useState<{ name: string; x: number; y: number } | null>(null);
  /** Format text…'s panel, and what the selection has (shown in its lists and buttons). */
  const [panel, setPanel] = useState<FormatPanelState | null>(null);
  const [choice, setChoice] = useState<FormatChoice>({ font: "TI-Nspire Sans", size: "11", on: Object.fromEntries(BUTTONS.map((b) => [b, false])) as FormatChoice["on"] });
  /** The places in the text the sliders are drawn into, found again whenever the text's elements change. */
  const [holes, setHoles] = useState<HTMLElement[]>([]);
  useEffect(() => {
    const root = el.current;
    if (!root) return;
    const scan = () => {
      const found = Array.from(root.querySelectorAll<HTMLElement>("[data-slider]"));
      setHoles((was) => (was.length === found.length && was.every((h, i) => h === found[i]) ? was : found));
    };
    scan();
    const mo = new MutationObserver(scan);
    mo.observe(root, { childList: true, subtree: true, attributes: true, attributeFilter: ["data-slider"] });
    return () => mo.disconnect();
  }, []);
  useEffect(() => {
    const box = el.current;
    if (!box) return;
    const ro = new ResizeObserver(() => setFs(parseFloat(getComputedStyle(box).fontSize) || 16));
    ro.observe(box);
    return () => ro.disconnect();
  }, []);
  /** The paragraphs this editor last reported: anything else arriving is a change from outside, drawn afresh. */
  const emitted = useRef<NotesRun[][] | null>(null);
  /** Where the caret was, so the keypad and menus (which take focus) act there. */
  const range = useRef<Range | null>(null);
  const lastBox = useRef<HTMLElement | null>(null);

  useLayoutEffect(() => {
    if (!el.current || page.paras === emitted.current) return;
    el.current.innerHTML = notesHtml(page.paras);
    emitted.current = page.paras;
    range.current = null;
  }, [page.paras, page.id]);

  // Hide Answer (Q&A): each paragraph that starts with a bold "Answer:" is an answer, hidden after its label while the page asks.
  useLayoutEffect(() => {
    const root = el.current;
    if (!root) return;
    root.toggleAttribute("data-hide-answer", Boolean(page.hideAnswer));
    for (const p of Array.from(root.querySelectorAll<HTMLElement>("[data-p]"))) {
      const first = p.firstElementChild;
      p.toggleAttribute("data-answer", first?.tagName === "B" && first.textContent?.trim() === "Answer:");
    }
  });

  useEffect(() => {
    document.execCommand("defaultParagraphSeparator", false, "div");
    const keep = () => {
      const sel = document.getSelection();
      if (sel?.rangeCount && el.current?.contains(sel.anchorNode)) range.current = sel.getRangeAt(0).cloneRange();
    };
    document.addEventListener("selectionchange", keep);
    return () => document.removeEventListener("selectionchange", keep);
  }, []);

  /** What the text at the caret is set to, for Format Text's lists and buttons. */
  const readChoice = () => {
    const r = range.current;
    const n = r?.startContainer;
    const at = n instanceof HTMLElement ? n : n?.parentElement;
    if (!at || !el.current?.contains(at)) return;
    const cs = getComputedStyle(at);
    const page = parseFloat(getComputedStyle(el.current).fontSize) || 16;
    const pt = Math.round((parseFloat(cs.fontSize) / page) * 11);
    setChoice({
      font: cs.fontFamily.includes("STIX") ? "TI-Nspire" : "TI-Nspire Sans",
      size: String(pt),
      on: Object.fromEntries(BUTTONS.map((b) => [b, document.queryCommandState(b)])) as FormatChoice["on"],
    });
  };
  useEffect(() => {
    if (!panel) return;
    readChoice();
    document.addEventListener("selectionchange", readChoice);
    return () => document.removeEventListener("selectionchange", readChoice);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- readChoice only reads the page and the kept range
  }, [Boolean(panel)]);

  /** Font or size on the selected text: wrapped in a span that sets it, the same setting inside it cleared. */
  const wrapSelection = (css: { fontSize?: string; fontFamily?: string }) => {
    restore();
    const sel = document.getSelection();
    if (!sel?.rangeCount) return;
    const r = sel.getRangeAt(0);
    if (r.collapsed) return;
    const frag = r.extractContents();
    for (const e of Array.from(frag.querySelectorAll<HTMLElement>("[style]"))) {
      if (css.fontSize !== undefined) e.style.fontSize = "";
      if (css.fontFamily !== undefined) e.style.fontFamily = "";
    }
    const span = document.createElement("span");
    if (css.fontSize) span.style.fontSize = css.fontSize;
    if (css.fontFamily) span.style.fontFamily = css.fontFamily;
    span.appendChild(frag);
    r.insertNode(span);
    const next = document.createRange();
    next.selectNodeContents(span);
    sel.removeAllRanges();
    sel.addRange(next);
    range.current = next.cloneRange();
    emit();
    readChoice();
  };
  const panelFont = (font: string) => wrapSelection({ fontFamily: font === "TI-Nspire" ? "var(--font-casmath)" : "" });
  const panelSize = (size: number) => wrapSelection({ fontSize: size === 11 ? "" : `${size / 11}em` });
  const panelPress = (b: FormatButton) => {
    exec(b);
    readChoice();
  };
  /** A key while the panel is open (from the keypad, or typed while the page has focus). */
  const panelKey = (k: Key) => {
    if (!panel) return;
    const r = formatPanelKey(panel, k, choice);
    setPanel(r.state);
    if (r.font) panelFont(r.font);
    if (r.size) panelSize(r.size);
    if (r.press) panelPress(r.press);
  };

  const emit = () => {
    if (!el.current) return;
    const paras = readNotes(el.current);
    emitted.current = paras;
    onChange(paras);
  };

  /** Focus the page with the caret back where it was (or at the end). */
  const restore = () => {
    const root = el.current;
    if (!root) return;
    const r = range.current && root.contains(range.current.startContainer) ? range.current : null;
    const target = r ? (r.startContainer instanceof HTMLElement ? r.startContainer : r.startContainer.parentElement)?.closest<HTMLElement>("[contenteditable='true']") : null;
    (target ?? root).focus({ preventScroll: true });
    const sel = document.getSelection();
    if (!sel) return;
    if (r) {
      sel.removeAllRanges();
      sel.addRange(r);
    } else if (!root.contains(sel.anchorNode)) {
      const end = document.createRange();
      end.selectNodeContents(root.lastElementChild ?? root);
      end.collapse(false);
      sel.removeAllRanges();
      sel.addRange(end);
    }
  };

  const boxAtCaret = (kind: "math" | "any" = "math") => {
    const n = document.getSelection()?.anchorNode;
    const e = n instanceof HTMLElement ? n : n?.parentElement;
    return e && el.current?.contains(e) ? e.closest<HTMLElement>(kind === "math" ? "[data-math]" : "[data-math],[data-chem],[data-comment]") : null;
  };

  /** Put the caret just after a box (on the zero-width space that follows it). */
  const after = (box: HTMLElement) => {
    const next = box.nextSibling ?? box.parentElement!.appendChild(document.createTextNode("​"));
    el.current?.focus({ preventScroll: true });
    const r = document.createRange();
    r.setStart(next, next.nodeType === Node.TEXT_NODE ? Math.min(1, next.textContent?.length ?? 0) : 0);
    r.collapse(true);
    const sel = document.getSelection()!;
    sel.removeAllRanges();
    sel.addRange(r);
  };

  /**
   * Insert HTML at the caret; a box marked data-new gets the caret inside it.
   * Through the Range API: Chrome's insertHTML puts a non-editable box after the paragraph, not in it.
   */
  const insertHtml = (html: string) => {
    restore();
    const sel = document.getSelection();
    const root = el.current;
    if (!sel?.rangeCount || !root) return;
    const r = sel.getRangeAt(0);
    r.deleteContents();
    // Outside every paragraph (an empty page): into the first one.
    if (r.startContainer === root) {
      const para = root.querySelector("[data-p]") ?? root.appendChild(Object.assign(document.createElement("div"), { innerHTML: "<br>" }));
      if (para instanceof HTMLElement) para.dataset.p = "";
      r.selectNodeContents(para);
      r.collapse(false);
    }
    const tpl = document.createElement("template");
    tpl.innerHTML = html;
    const last = tpl.content.lastChild;
    // A paragraph holding only its placeholder <br> loses it.
    const host = r.startContainer instanceof HTMLElement ? r.startContainer : r.startContainer.parentElement;
    if (host?.matches("[data-p]") && host.childNodes.length === 1 && host.firstChild?.nodeName === "BR") host.firstChild.remove();
    r.insertNode(tpl.content);
    if (last) {
      r.setStartAfter(last);
      r.collapse(true);
      sel.removeAllRanges();
      sel.addRange(r);
    }
    const box = root.querySelector<HTMLElement>("[data-new]");
    if (box) {
      box.removeAttribute("data-new");
      const input = box.querySelector<HTMLElement>("[data-in]") ?? box;
      input.focus({ preventScroll: true });
      const r = document.createRange();
      r.selectNodeContents(input);
      r.collapse(false);
      const sel = document.getSelection()!;
      sel.removeAllRanges();
      sel.addRange(r);
    }
    emit();
  };

  const work = async (box: HTMLElement, approx: boolean) => {
    const input = (box.querySelector("[data-in]")?.textContent ?? "").replace(/​/g, "").trim();
    const out = box.querySelector<HTMLElement>("[data-out]");
    if (!out) return;
    if (!input) {
      out.textContent = "";
      emit();
      return;
    }
    const r = await evaluate(input, approx);
    out.textContent = r.text;
    out.toggleAttribute("data-error", !r.ok);
    // The warning that came with the result, for Show Warning Info.
    if (r.ok && r.warn) box.dataset.warn = r.warn;
    else delete box.dataset.warn;
    box.toggleAttribute("data-approx", approx);
    emit();
  };

  /*
   * A slider moved: every maths box with an answer is worked out again with
   * the new value, as the handheld updates them. One pass at a time; a
   * value that arrives mid-pass waits for the next one, so dragging doesn't
   * pile work up in the engine.
   */
  const sliderKey = (page.sliders ?? []).map((sl) => `${sl.name}=${sl.value}`).join(",");
  const seenKey = useRef(sliderKey);
  const pass = useRef<{ busy: boolean; again: boolean }>({ busy: false, again: false });
  useEffect(() => {
    if (sliderKey === seenKey.current) return;
    seenKey.current = sliderKey;
    const run = async () => {
      if (pass.current.busy) {
        pass.current.again = true;
        return;
      }
      pass.current.busy = true;
      do {
        pass.current.again = false;
        const boxes = [...(el.current?.querySelectorAll<HTMLElement>("[data-math]") ?? [])].filter((b) => b.querySelector("[data-out]")?.textContent);
        for (const b of boxes) if (b.isConnected) await work(b, b.hasAttribute("data-approx"));
      } while (pass.current.again);
      pass.current.busy = false;
    };
    void run();
    // work is recreated each render; the slider values are what this follows.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sliderKey]);

  const evaluateHere = (approx: boolean) => {
    restore();
    const box = boxAtCaret();
    if (box) {
      void work(box, approx).then(() => after(box));
      return true;
    }
    return false;
  };

  const exec = (cmd: string, value?: string) => {
    restore();
    document.execCommand(cmd, false, value);
    emit();
  };

  const move = (dir: "backward" | "forward", by: "character" | "line" | "lineboundary") => {
    restore();
    document.getSelection()?.modify("move", dir, by);
  };

  /** Into the current maths box (or a new one), with the caret in the first empty slot: d(▮,x). */
  const insertMath = (text: string) => {
    restore();
    if (boxAtCaret()) exec("insertText", text);
    else insertHtml(mathBoxHtml({ math: text }, true));
    const slot = /\((?=[,)])/.exec(text);
    if (slot) for (let i = text.length - slot.index - 1; i > 0; i--) document.getSelection()?.modify("move", "backward", "character");
  };

  apiRef.current = {
    key(k) {
      if (panel) return panelKey(k);
      switch (k.k) {
        case "char":
          return exec("insertText", k.c);
        case "text":
        case "paste":
          return exec("insertText", k.text);
        case "template":
          return insertMath(rowToLinear([templateNode(k.id)]));
        case "enter":
          if (!evaluateHere(false)) exec("insertParagraph");
          return;
        case "approx":
          evaluateHere(true);
          return;
        case "backspace":
          return exec("delete");
        case "delete":
          return exec("forwardDelete");
        case "left":
          return move("backward", "character");
        case "right":
          return move("forward", "character");
        case "up":
          return move("backward", "line");
        case "down":
          return move("forward", "line");
        case "home":
          return move("backward", "lineboundary");
        case "end":
          return move("forward", "lineboundary");
        case "selectAll":
          return exec("selectAll");
        case "tab":
          return exec("insertText", "    ");
        default:
          return;
      }
    },
    action(id) {
      const [, what, arg] = id.split(":");
      switch (what) {
        case "formatPanel":
          setPanel(openFormatPanel());
          return;
        case "deleteBox": {
          // The ctrl menu's Delete in a maths box with nothing selected: the box goes.
          restore();
          const box = boxAtCaret();
          if (!box) return;
          removeBox(box);
          emit();
          return;
        }
        case "math":
          return insertHtml(mathBoxHtml({ math: "" }, true));
        case "chem":
          return insertHtml(chemBoxHtml("", true));
        case "comment":
          return insertHtml(commentHtml("", arg === "Reviewer" ? "Reviewer" : "Teacher", true));
        case "shape":
          return exec("insertText", arg ?? "");
        case "fmt":
          return exec(arg ?? "bold");
        case "eval":
        case "approx":
          evaluateHere(what === "approx");
          return;
        case "evalAll":
          // An inactive box keeps the result it had.
          void (async () => {
            for (const box of Array.from(el.current?.querySelectorAll<HTMLElement>("[data-math]:not([data-inactive])") ?? [])) await work(box, box.dataset.approx !== undefined);
          })();
          return;
        case "evalReplace": {
          // Evaluate & Replace: the result takes the expression's place in the box.
          restore();
          const box = boxAtCaret();
          if (!box) return;
          void work(box, false).then(() => {
            const input = box.querySelector<HTMLElement>("[data-in]");
            const out = box.querySelector<HTMLElement>("[data-out]");
            if (!input || !out || out.dataset.error !== undefined || !out.textContent) return;
            input.textContent = out.textContent;
            out.textContent = "";
            emit();
            after(box);
          });
          return;
        }
        case "active": {
          // Deactivate and Activate, here or in every box: an inactive box keeps its result as the problem changes.
          restore();
          const boxes = arg === "all-on" || arg === "all-off" ? Array.from(el.current?.querySelectorAll<HTMLElement>("[data-math]") ?? []) : [boxAtCaret()].filter((b): b is HTMLElement => Boolean(b));
          for (const box of boxes) box.toggleAttribute("data-inactive", arg === "off" || arg === "all-off");
          emit();
          return;
        }
        case "colour": {
          // Text color and Fill color on the selected text, a colour or none.
          const [, , kind, colour = ""] = id.split(":");
          document.execCommand("styleWithCSS", false, "true");
          exec(kind === "fill" ? "hiliteColor" : "foreColor", colour || (kind === "fill" ? "transparent" : "inherit"));
          return;
        }
        case "report": {
          // Show Error… and Show Warning Info…: what the box at the caret's result came with.
          restore();
          const box = boxAtCaret();
          const out = box?.querySelector<HTMLElement>("[data-out]");
          const text = arg === "warn" ? box?.dataset.warn : out?.dataset.error !== undefined ? out.textContent : undefined;
          onReport?.(text || (arg === "warn" ? "Warning: This result came with no warning" : "Error: This box has no error"));
          return;
        }
        case "toMath": {
          restore();
          const text = document.getSelection()?.toString().replace(/​/g, "") ?? "";
          insertHtml(mathBoxHtml({ math: text }, true));
          const box = boxAtCaret();
          if (box && text.trim()) void work(box, false);
          return;
        }
        case "toText": {
          restore();
          const box = boxAtCaret("any");
          if (!box) return;
          box.replaceWith(document.createTextNode((box.querySelector("[data-in]")?.textContent ?? "").replace(/​/g, "")));
          emit();
          return;
        }
        case "tpl":
          if (arg === "qa") return insertHtml("<div data-p><b>Question:</b> </div><div data-p data-answer><b>Answer:</b> </div>");
          if (arg === "proof") return insertHtml("<div data-p><b>Statements</b> | <b>Reasons</b></div><div data-p>1. </div>");
          return;
        default:
          return;
      }
    },
    insertMath,
    placeSlider(name, old) {
      const root = el.current;
      if (!root) return;
      if (old) {
        // Settings: the place keeps up with a new name (a slider from before places were kept has none).
        const was = root.querySelector<HTMLElement>(`[data-slider="${CSS.escape(old)}"]`);
        if (!was) return;
        was.dataset.slider = name;
      } else {
        restore();
        // Never inside a maths box: just after it.
        const box = boxAtCaret("any");
        if (box) after(box);
        insertHtml(sliderHtml(name));
      }
      emit();
    },
    select({ box, text }) {
      const root = el.current;
      if (!root) return "The Notes page isn't showing.";
      const r = document.createRange();
      if (box !== undefined) {
        const boxes = root.querySelectorAll<HTMLElement>("[data-math]");
        const input = boxes[box - 1]?.querySelector<HTMLElement>("[data-in]");
        if (!input) return `There's no maths box ${box}; the page has ${boxes.length}.`;
        r.selectNodeContents(input);
        r.collapse(false);
      } else if (text) {
        // The text may run across formatting (bold, colour), so it's found in the page's text as a whole.
        const nodes: Text[] = [];
        const walk = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
        while (walk.nextNode()) nodes.push(walk.currentNode as Text);
        const all = nodes.map((n) => n.data).join("");
        const at = all.indexOf(text);
        if (at < 0) return `"${text}" isn't on the page.`;
        // Where an offset into the whole text falls: its node and the offset in it.
        const spot = (k: number, end: boolean): [Text, number] => {
          let from = 0;
          for (const n of nodes) {
            if (k < from + n.data.length || (end && k === from + n.data.length)) return [n, k - from];
            from += n.data.length;
          }
          return [nodes.at(-1)!, nodes.at(-1)!.data.length];
        };
        r.setStart(...spot(at, false));
        r.setEnd(...spot(at + text.length, true));
      } else return "Say a maths box or some text.";
      range.current = r;
      restore();
      return null;
    },
    panelOpen: () => panel !== null,
    context() {
      // The caret as it was before the keypad or menu took focus.
      const r = range.current && el.current?.contains(range.current.startContainer) ? range.current : null;
      const n = r?.startContainer;
      const at = n instanceof HTMLElement ? n : n?.parentElement;
      const box = at?.closest<HTMLElement>("[data-math]") ?? null;
      return { inBox: Boolean(box), selection: Boolean(r && !r.collapsed), warning: Boolean(box?.dataset.warn), inactive: box?.dataset.inactive !== undefined };
    },
    removeSlider(name) {
      const hole = el.current?.querySelector<HTMLElement>(`[data-slider="${CSS.escape(name)}"]`);
      if (!hole) return;
      removeBox(hole);
      emit();
    },
    attrs() {
      restore();
      const box = boxAtCaret();
      lastBox.current = box;
      if (!box) return null;
      return {
        math: box.querySelector("[data-in]")?.textContent ?? "",
        hideIn: box.dataset.hideIn !== undefined,
        hideOut: box.dataset.hideOut !== undefined,
      };
    },
    setAttrs({ hideIn, hideOut }) {
      const box = lastBox.current;
      if (!box?.isConnected) return;
      box.toggleAttribute("data-hide-in", hideIn);
      box.toggleAttribute("data-hide-out", hideOut);
      emit();
    },
  };

  /** One of the page's sliders, drawn in the text where it was put (or across the top). */
  const slider = (sl: Slider, i: number) => (
    <SliderView
      key={sl.name}
      inline
      slider={sl}
      index={i}
      fs={fs}
      size={{ w: 0, h: 0 }}
      active={false}
      onValue={(v, final) => onSlider?.(sl.name, v, final)}
      onTyped={(text) => onSliderTyped?.(sl.name, text)}
      onMenu={(x, y) => {
        const r = outer.current!.getBoundingClientRect();
        setSliderMenu({ name: sl.name, x: x - r.left, y: y - r.top + outer.current!.scrollTop });
      }}
    />
  );

  return (
    <div ref={outer} className="absolute inset-0 overflow-y-auto bg-casScreen scrollbar-thin">
      {/* Sliders with no place in the text (from before they had one) stay across the top of the page. */}
      {page.sliders?.some((sl) => !holes.some((h) => h.dataset.slider === sl.name)) ? (
        <div className="flex flex-wrap items-start gap-x-[6cqw] gap-y-[1.5cqw] px-[5cqw] pt-[2cqw]">
          {page.sliders.filter((sl) => !holes.some((h) => h.dataset.slider === sl.name)).map((sl, i) => slider(sl, i))}
        </div>
      ) : null}
      <div
        ref={el}
        data-notes-editor
        contentEditable
        suppressContentEditableWarning
        role="textbox"
        aria-multiline="true"
        aria-label="Notes"
        spellCheck={false}
        className="nb-editor min-h-full px-[3cqw] py-[2cqw] font-casui text-[calc(4cqw*var(--axiom-text,1))] leading-normal break-words whitespace-pre-wrap text-casInk outline-hidden"
        onInput={emit}
        onKeyDown={(e) => {
          // While Format Text is open, its controls take the arrows, Tab, Enter and Esc.
          if (panel) {
            const map: Record<string, Key> = { Escape: { k: "esc" }, Tab: { k: "tab" }, Enter: { k: "enter" }, ArrowLeft: { k: "left" }, ArrowRight: { k: "right" }, ArrowUp: { k: "up" }, ArrowDown: { k: "down" } };
            const k = map[e.key];
            if (k) {
              e.preventDefault();
              e.stopPropagation();
              panelKey(k);
              return;
            }
          }
          if (e.key !== "Enter") return;
          const box = boxAtCaret("any");
          if (!box) return;
          // Enter in a box works it out (Ctrl+Enter for a decimal) and steps out of it; it never splits the box.
          e.preventDefault();
          e.stopPropagation();
          if (box.dataset.math !== undefined) void work(box, e.ctrlKey || e.metaKey).then(() => after(box));
          else after(box);
        }}
        onBlur={(e) => {
          // A chem box shows its digits as subscripts once it's left.
          const chem = (e.target as HTMLElement).closest?.("[data-chem]");
          const input = chem?.querySelector("[data-in]");
          if (input) input.innerHTML = chemHtml((input.textContent ?? "").replace(/​/g, ""));
        }}
        onPaste={(e) => {
          // Pasted text arrives as text, not someone else's formatting.
          e.preventDefault();
          e.stopPropagation();
          document.execCommand("insertText", false, e.clipboardData.getData("text"));
        }}
      />
      {/* Insert ▸ Slider's sliders, each drawn where it was put in the text, as the handheld places them. */}
      {holes.map((hole) => {
        const i = page.sliders?.findIndex((sl) => sl.name === hole.dataset.slider) ?? -1;
        const sl = page.sliders?.[i];
        if (!sl) return null;
        return createPortal(slider(sl, i), hole, sl.name);
      })}
      {panel && (
        <FormatPanel
          state={panel}
          now={choice}
          root={outer.current}
          onState={setPanel}
          onFont={panelFont}
          onSize={panelSize}
          onPress={panelPress}
          onClose={() => setPanel(null)}
        />
      )}
      {sliderMenu && (
        <SliderMenu
          slider={page.sliders?.find((sl) => sl.name === sliderMenu.name)}
          at={sliderMenu}
          fs={fs}
          without={["move", "animate"]}
          onPick={(action) => {
            setSliderMenu(null);
            onSliderAction?.(sliderMenu.name, action);
          }}
          onClose={() => setSliderMenu(null)}
        />
      )}
    </div>
  );
}

/** A page from an app that isn't built yet: it keeps its tab and its data, and says so. */
export function UnsupportedApp({ page }: { page: UnsupportedPage }) {
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center gap-[1.6cqw] bg-casScreen px-[8cqw] text-center font-casui text-casInk">
      <div className="text-[5cqw] font-semibold">{page.app} pages can&apos;t open yet</div>
      <div className="text-[3.6cqw] text-casLabel">The page is kept with the document, so downloading it again keeps it whole.</div>
    </div>
  );
}

/** A box taken out of the text, with the zero-width space that follows it for the caret. */
function removeBox(box: HTMLElement) {
  if (box.nextSibling?.nodeType === Node.TEXT_NODE && box.nextSibling.textContent === "\u200b") box.nextSibling.remove();
  box.remove();
}
