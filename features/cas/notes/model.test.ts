// SPDX-License-Identifier: GPL-3.0-or-later
import { describe, expect, it } from "vitest";
import { notesFmtxt, notesHtml, placedSliders, runText } from "./model";
import type { NotesRun } from "../state/document";

const page: NotesRun[][] = [
  ["Roots: ", { math: "solve(x^2=4,x)", out: "x=-2 or x=2" }],
  [{ text: "Key", b: true }, " and ", { chem: "H2O" }],
  [{ comment: "check units", by: "Teacher" }],
];

describe("notes", () => {
  it("draws boxes, formatting and chem subscripts", () => {
    const html = notesHtml(page);
    expect(html).toContain('<span data-in contenteditable="true" spellcheck="false">solve(x^2=4,x)</span>');
    expect(html).toContain("<b>Key</b>");
    expect(html).toContain("H<sub>2</sub>O");
    expect(html).toContain('data-comment="Teacher"');
    expect(notesHtml([])).toBe("<div data-p><br></div>");
  });
  it("reads as text for the assistant", () => {
    expect(page.map((p) => p.map(runText).join("")).join("\n")).toBe("Roots: [solve(x^2=4,x) → x=-2 or x=2]\nKey and [chem H2O]\n[Teacher comment: check units]");
  });
  it("writes TI's tree: paragraphs, a bold format, maths box with its result", () => {
    const x = notesFmtxt(page);
    expect(x.match(/<node name="1para">/g)).toHaveLength(3);
    expect(x).toContain('fst="1"');
    expect(x).toContain("<full>x=-2 or x=2</full>");
    expect(x).toContain('pp0="14">solve(x^2=4,x)</leaf>');
  });
});

describe("notes formatting and boxes", () => {
  it("writes a coloured run and an inactive box with its warning", () => {
    const html = notesHtml([[{ text: "red", color: "#ff0000", fill: "#ffff00" }, { math: "x", out: "x", inactive: true, warn: "Domain may be wrong" }]]);
    expect(html).toContain('style="color:#ff0000;background-color:#ffff00;"');
    expect(html).toContain("data-inactive");
    expect(html).toContain('data-warn="Domain may be wrong"');
  });
});

describe("notes format text", () => {
  const sized: NotesRun[][] = [["a ", { text: "big", size: 16, serif: true, b: true }]];
  it("writes Format Text's size and font", () => {
    expect(notesHtml(sized)).toContain('style="font-size:1.4545454545454546em;font-family:var(--font-casmath);"');
    expect(notesFmtxt(sized)).toContain('fs="16" fst="1"');
    expect(notesFmtxt(sized)).toContain('fn0="TI-Nspire"');
  });
});

describe("notes sliders", () => {
  const withSlider: NotesRun[][] = [["Speed ", { slider: "v1" }, " m/s"]];
  it("keeps a slider's place in the text", () => {
    expect(notesHtml(withSlider)).toContain('<span data-slider="v1" contenteditable="false" class="nb-slider"></span>');
    expect(runText(withSlider[0]![1]!)).toBe("[slider v1]");
    expect([...placedSliders(withSlider)]).toEqual(["v1"]);
  });
  it("leaves sliders out of TI's text", () => {
    expect(notesFmtxt(withSlider)).not.toContain("v1");
  });
});
