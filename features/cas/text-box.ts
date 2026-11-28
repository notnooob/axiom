// SPDX-License-Identifier: GPL-3.0-or-later
/** Keypad keys in a plain text box: the Python editor's and the Program Editor's shared typing and caret moves. */
import type { Key } from "./keys";

/** The part of a <textarea> the keys use (a stand-in in tests). */
export type TextBox = Pick<HTMLTextAreaElement, "value" | "selectionStart" | "selectionEnd" | "setRangeText" | "setSelectionRange">;

/**
 * A keypad key in a plain text box (the Python and Program editors): a
 * character, deleting, and the arrows moving the caret by character and by
 * line. "edit" when the text may have changed, "move" when only the caret
 * did, null for a key left to the editor.
 */
export function textBoxKey(el: TextBox, key: Key): "edit" | "move" | null {
  const { selectionStart: a, selectionEnd: b, value } = el;
  const lineStart = value.lastIndexOf("\n", a - 1) + 1;
  const lineEnd = (from: number) => (value.indexOf("\n", from) < 0 ? value.length : value.indexOf("\n", from));
  const put = (from: number, to: number, t = "") => (el.setRangeText(t, from, to, "end"), "edit" as const);
  const go = (to: number) => (el.setSelectionRange(to, to), "move" as const);
  switch (key.k) {
    case "char":
      return put(a, b, key.c);
    case "backspace":
      return a !== b ? put(a, b) : a > 0 ? put(a - 1, a) : "edit";
    case "delete":
      return put(a, a !== b ? b : a + 1);
    case "left":
      return go(Math.max(0, a - 1));
    case "right":
      return go(b + 1);
    case "home":
      return go(lineStart);
    case "end":
      return go(lineEnd(a));
    case "up":
    case "down": {
      // The same column on the line above or below, or that line's end if it's shorter.
      const target = key.k === "up" ? (lineStart === 0 ? 0 : value.lastIndexOf("\n", lineStart - 2) + 1) : lineEnd(a) === value.length ? value.length : lineEnd(a) + 1;
      return go(Math.min(target + (a - lineStart), lineEnd(target)));
    }
    default:
      return null;
  }
}
