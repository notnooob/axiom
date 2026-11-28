// SPDX-License-Identifier: GPL-3.0-or-later
import { describe, expect, it } from "vitest";
import { textBoxKey, type TextBox } from "./text-box";

/** A text box with the caret at `|` (or a selection between two of them). */
function box(text: string): TextBox {
  const [a, b = a] = [...text.matchAll(/\|/g)].map((m, i) => m.index! - i);
  const t = {
    value: text.replaceAll("|", ""),
    selectionStart: a!,
    selectionEnd: b!,
    setRangeText(s: string, from: number, to: number) {
      t.value = t.value.slice(0, from) + s + t.value.slice(to);
      t.selectionStart = t.selectionEnd = from + s.length;
    },
    setSelectionRange(from: number, to: number) {
      t.selectionStart = Math.min(from, t.value.length);
      t.selectionEnd = Math.min(to, t.value.length);
    },
  };
  return t as TextBox;
}
const shown = (t: TextBox) => t.value.slice(0, t.selectionStart) + "|" + t.value.slice(t.selectionEnd);

describe("textBoxKey", () => {
  it("types and deletes", () => {
    const t = box("ab|c");
    expect(textBoxKey(t, { k: "char", c: "x" })).toBe("edit");
    expect(shown(t)).toBe("abx|c");
    textBoxKey(t, { k: "backspace" });
    textBoxKey(t, { k: "delete" });
    expect(shown(t)).toBe("ab|");
    const s = box("a|bc|d");
    textBoxKey(s, { k: "backspace" });
    expect(shown(s)).toBe("a|d");
  });
  it("moves along a line and keeps the column between lines", () => {
    const t = box("abcd\nx|y\nlonger");
    expect(textBoxKey(t, { k: "up" })).toBe("move");
    expect(shown(t)).toBe("a|bcd\nxy\nlonger");
    textBoxKey(t, { k: "end" });
    textBoxKey(t, { k: "down" });
    expect(shown(t)).toBe("abcd\nxy|\nlonger");
    textBoxKey(t, { k: "down" });
    textBoxKey(t, { k: "home" });
    expect(shown(t)).toBe("abcd\nxy\n|longer");
  });
  it("leaves the editor's own keys to it", () => {
    expect(textBoxKey(box("|"), { k: "enter" })).toBeNull();
  });
});
