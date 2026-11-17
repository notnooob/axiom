// SPDX-License-Identifier: GPL-3.0-or-later
import { describe, expect, it } from "vitest";
import { notesFmtxt, notesHtml, runText } from "./model";
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
