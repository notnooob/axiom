// SPDX-License-Identifier: GPL-3.0-or-later
/**
 * Notes pages: paragraphs of runs (text, formatted text, maths boxes, chem
 * boxes, comments) to and from the editor's HTML, as plain text for the
 * assistant, and as TI's Notes XML (r2dtotree) for .tns export.
 */
import type { NotesMath, NotesRun, NotesStyle } from "../state/document";

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const ZW = /​/g;
const STYLE_TAGS: [keyof NotesStyle, string][] = [
  ["b", "b"],
  ["i", "i"],
  ["u", "u"],
  ["s", "s"],
  ["sub", "sub"],
  ["sup", "sup"],
];

export const isMath = (r: NotesRun): r is NotesMath => typeof r === "object" && "math" in r;

// ---- Model → editor HTML

/**
 * A maths box: its input (editable) and result. The box itself isn't
 * editable text, so the caret steps over it; a zero-width space after it
 * gives the caret somewhere to land at the end of a line.
 */
export function mathBoxHtml(r: NotesMath, mark = false): string {
  const flags = `${r.approx ? " data-approx" : ""}${r.hideIn ? " data-hide-in" : ""}${r.hideOut ? " data-hide-out" : ""}${mark ? " data-new" : ""}`;
  return (
    `<span data-math${flags} contenteditable="false" class="nb-box nb-math">` +
    `<span data-in contenteditable="true" spellcheck="false">${esc(r.math)}</span>` +
    `<span data-out${r.out?.startsWith("Error") ? " data-error" : ""}>${r.out !== undefined ? esc(r.out) : ""}</span></span>​`
  );
}

/** A chem box: digits drawn as subscripts (H2O → H₂O); the text is what's typed. */
export const chemHtml = (text: string) => esc(text).replace(/(\d+)/g, "<sub>$1</sub>");
export function chemBoxHtml(text: string, mark = false): string {
  return `<span data-chem${mark ? " data-new" : ""} contenteditable="false" class="nb-box nb-chem"><span data-in contenteditable="true" spellcheck="false">${chemHtml(text)}</span></span>​`;
}

/** A comment: a box too, so typing ends at its edge (Enter steps out), as a maths box does. */
export const commentHtml = (text: string, by: "Teacher" | "Reviewer", mark = false) =>
  `<span data-comment="${by}"${mark ? " data-new" : ""} contenteditable="false" class="nb-comment"><span data-in contenteditable="true" spellcheck="false">${esc(text)}</span></span>​`;

function runHtml(r: NotesRun): string {
  if (typeof r === "string") return esc(r);
  if ("text" in r) {
    let h = esc(r.text);
    for (const [k, tag] of STYLE_TAGS) if (r[k]) h = `<${tag}>${h}</${tag}>`;
    return h;
  }
  if ("math" in r) return mathBoxHtml(r);
  if ("chem" in r) return chemBoxHtml(r.chem);
  return commentHtml(r.comment, r.by);
}

export function notesHtml(paras: NotesRun[][]): string {
  return (paras.length ? paras : [[]]).map((p) => `<div data-p>${p.map(runHtml).join("") || "<br>"}</div>`).join("");
}

// ---- Editor HTML → model

type Acc = { paras: NotesRun[][]; fresh: boolean };

const same = (a: NotesStyle, b: NotesStyle) => STYLE_TAGS.every(([k]) => Boolean(a[k]) === Boolean(b[k]));
const plain = (st: NotesStyle) => STYLE_TAGS.every(([k]) => !st[k]);

function current(a: Acc): NotesRun[] {
  if (a.fresh || !a.paras.length) {
    a.paras.push([]);
    a.fresh = false;
  }
  return a.paras.at(-1)!;
}

function addText(a: Acc, text: string, st: NotesStyle) {
  if (!text) return;
  const para = current(a);
  const last = para.at(-1);
  if (typeof last === "string" && plain(st)) para[para.length - 1] = last + text;
  else if (last && typeof last === "object" && "text" in last && same(last, st)) para[para.length - 1] = { ...last, text: last.text + text };
  else para.push(plain(st) ? text : { text, ...Object.fromEntries(STYLE_TAGS.filter(([k]) => st[k]).map(([k]) => [k, true])) });
}

function styleOf(el: HTMLElement, st: NotesStyle): NotesStyle {
  const tag = el.tagName.toLowerCase();
  const next = { ...st };
  if (tag === "b" || tag === "strong" || Number(el.style.fontWeight) >= 600 || el.style.fontWeight === "bold") next.b = true;
  if (tag === "i" || tag === "em" || el.style.fontStyle === "italic") next.i = true;
  if (tag === "u" || el.style.textDecoration.includes("underline")) next.u = true;
  if (tag === "s" || tag === "strike" || tag === "del" || el.style.textDecoration.includes("line-through")) next.s = true;
  if (tag === "sub") next.sub = true;
  if (tag === "sup") next.sup = true;
  return next;
}

const text = (el: Element | null | undefined) => (el?.textContent ?? "").replace(ZW, "");

function walk(n: Node, st: NotesStyle, a: Acc) {
  for (const c of Array.from(n.childNodes)) {
    if (c.nodeType === Node.TEXT_NODE) {
      addText(a, (c.textContent ?? "").replace(ZW, ""), st);
      continue;
    }
    if (!(c instanceof HTMLElement)) continue;
    if (c.dataset.math !== undefined) {
      const out = c.querySelector("[data-out]");
      current(a).push({
        math: text(c.querySelector("[data-in]")),
        ...(text(out) ? { out: text(out) } : {}),
        ...(c.dataset.approx !== undefined ? { approx: true } : {}),
        ...(c.dataset.hideIn !== undefined ? { hideIn: true } : {}),
        ...(c.dataset.hideOut !== undefined ? { hideOut: true } : {}),
      });
      continue;
    }
    if (c.dataset.chem !== undefined) {
      current(a).push({ chem: text(c.querySelector("[data-in]")) });
      continue;
    }
    if (c.dataset.comment) {
      current(a).push({ comment: text(c.querySelector("[data-in]") ?? c), by: c.dataset.comment === "Reviewer" ? "Reviewer" : "Teacher" });
      continue;
    }
    const tag = c.tagName.toLowerCase();
    if (tag === "br") continue;
    if (tag === "div" || tag === "p") {
      // A block is a paragraph of its own; an empty one (just <br>) still counts.
      const before = a.paras.length;
      a.fresh = true;
      walk(c, st, a);
      if (a.paras.length === before) a.paras.push([]);
      a.fresh = true;
      continue;
    }
    walk(c, styleOf(c, st), a);
  }
}

export function readNotes(root: HTMLElement): NotesRun[][] {
  const a: Acc = { paras: [], fresh: false };
  walk(root, {}, a);
  // One empty paragraph is an empty page.
  return a.paras.length === 1 && !a.paras[0]!.length ? [] : a.paras;
}

// ---- Plain text (the assistant reads pages this way)

export function runText(r: NotesRun): string {
  if (typeof r === "string") return r;
  if ("text" in r) return r.text;
  if ("math" in r) return `[${r.math}${r.out !== undefined ? ` → ${r.out}` : ""}]`;
  if ("chem" in r) return `[chem ${r.chem}]`;
  return `[${r.by} comment: ${r.comment}]`;
}

// ---- TI's Notes XML

/**
 * The page as TI's r2dtotree. Experimental, like all of export: text, its
 * formatting, and maths boxes with their results; chem boxes and comments go
 * as text.
 */
export function notesFmtxt(paras: NotesRun[][]): string {
  const styles: NotesStyle[] = [{}];
  const fmt = (st: NotesStyle) => {
    let i = styles.findIndex((x) => same(x, st));
    if (i < 0) i = styles.push(st) - 1;
    return i;
  };
  const word = (t: string, f: number) => `<leaf name="1word" np="1" id0="${f}" pp0="${t.length}">${esc(t)}</leaf>`;
  const body = (paras.length ? paras : [[]])
    .map((p) => {
      const runs = p
        .map((r) => {
          if (isMath(r)) {
            const out = r.out ?? "";
            return (
              `<node name="0el" flags="8" id0="0"><mbox><attr iomode="1" digits="0" angle="0" symbol="1" wrap="true" warn="true" comp="2" active="true" id0="0"/>` +
              `<out><full>${esc(out)}</full><warn>{}</warn><err>0</err></out></mbox>` +
              `<node name="0el" id0="0"><leaf name="0text" np="1" id0="0" pp0="${r.math.length}">${esc(r.math)}</leaf></node>` +
              `<node name="0el" id0="0"><leaf name="0text" readonly="1" np="1" id0="0" pp0="${out.length}">${esc(out)}</leaf></node></node>`
            );
          }
          if (typeof r === "string") return word(r, 0);
          if ("text" in r) return word(r.text, fmt(r));
          return word("chem" in r ? r.chem : `${r.by}: ${r.comment}`, 0);
        })
        .join("");
      return `<node name="1para"><node name="1rtline">${runs || word("", 0)}</node></node>`;
    })
    .join("");
  const entries = styles
    .map(
      (st, i) =>
        `<formatEntry entryIndex="${i}" entryID="${i}" entryRefCnt="1" tc="0" fc="268435199" fs="11" fst="${(st.b ? 1 : 0) | (st.i ? 2 : 0)}" cc="0" ` +
        `fest="${st.s ? 1 : 0}" feun="${st.u ? 1 : 0}" fesub="${st.sub ? 1 : 0}" fesup="${st.sup ? 1 : 0}" fn0="TI-Nspire Sans"></formatEntry>`,
    )
    .join("");
  return `<r2dtotree version="1"><formatManager tableSize="${styles.length}" capacity="${styles.length}">${entries}</formatManager><node name="1doc">${body}</node></r2dtotree>`;
}
