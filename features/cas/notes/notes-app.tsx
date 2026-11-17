// SPDX-License-Identifier: GPL-3.0-or-later
/**
 * Notes: a text page with maths boxes. The text is a real editable element
 * (typing, selecting, copying and undo are the browser's own); the keypad and
 * the menu work on it through the same commands. A maths box is worked out
 * with Enter (Ctrl+Enter for a decimal), with the problem's variables, and
 * what it defines (a:=5) is defined for the problem.
 */
import { useEffect, useLayoutEffect, useRef, type MutableRefObject } from "react";
import type { Key } from "../keys";
import { templateNode } from "../math/editor";
import { rowToLinear } from "../math/tree";
import type { NotesMath, NotesPage, NotesRun, UnsupportedPage } from "../state/document";
import { chemBoxHtml, chemHtml, commentHtml, mathBoxHtml, notesHtml, readNotes } from "./model";

export type NotesApi = {
  /** A key from the keypad (the keyboard types straight into the page). */
  key(k: Key): void;
  /** A Notes menu item (notes:…). */
  action(id: string): void;
  /** Text into the current maths box, or a new one: the Calculations menu, a wizard's command. */
  insertMath(text: string): void;
  /** The current maths box's attributes, for the Math Box Attributes dialog (null outside a box). */
  attrs(): NotesMath | null;
  setAttrs(a: { hideIn: boolean; hideOut: boolean }): void;
};

type Evaluate = (text: string, approx: boolean) => Promise<{ ok: boolean; text: string }>;

export function NotesApp({
  page,
  onChange,
  evaluate,
  apiRef,
}: {
  page: NotesPage;
  onChange: (paras: NotesRun[][]) => void;
  evaluate: Evaluate;
  apiRef: MutableRefObject<NotesApi | null>;
}) {
  const el = useRef<HTMLDivElement>(null);
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

  useEffect(() => {
    document.execCommand("defaultParagraphSeparator", false, "div");
    const keep = () => {
      const sel = document.getSelection();
      if (sel?.rangeCount && el.current?.contains(sel.anchorNode)) range.current = sel.getRangeAt(0).cloneRange();
    };
    document.addEventListener("selectionchange", keep);
    return () => document.removeEventListener("selectionchange", keep);
  }, []);

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
    box.toggleAttribute("data-approx", approx);
    emit();
  };

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
          void (async () => {
            for (const box of Array.from(el.current?.querySelectorAll<HTMLElement>("[data-math]") ?? [])) await work(box, box.dataset.approx !== undefined);
          })();
          return;
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
          if (arg === "qa") return insertHtml("<div data-p><b>Question:</b> </div><div data-p><b>Answer:</b> </div>");
          if (arg === "proof") return insertHtml("<div data-p><b>Statements</b> | <b>Reasons</b></div><div data-p>1. </div>");
          return;
        default:
          return;
      }
    },
    insertMath,
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

  return (
    <div className="absolute inset-0 overflow-y-auto bg-casScreen scrollbar-thin">
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
