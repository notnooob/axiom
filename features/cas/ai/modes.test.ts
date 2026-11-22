// SPDX-License-Identifier: GPL-3.0-or-later
import { describe, expect, it } from "vitest";
import { allowedTools, modeOf, MODE_IDS, restrictToReadOnly } from "./modes";
import { TOOLS } from "./tools";

const ALL = [...TOOLS, { name: "ask_user", readOnly: true }];
const CHANGES = new Set(TOOLS.filter((t) => !t.readOnly && t.name !== "highlight").map((t) => t.name));

describe("allowedTools", () => {
  it("gives Solve everything", () => {
    expect(allowedTools("solve", ALL)).toHaveLength(ALL.length);
  });
  it("keeps Exam to what a student would use in an exam", () => {
    const exam = allowedTools("exam", ALL);
    for (const t of ["python", "write_notes", "construct_geometry", "evaluate"]) expect(exam).not.toContain(t);
    for (const t of ["calculate", "plot_function", "analyze_graph", "run_menu", "highlight", "ask_user"]) expect(exam).toContain(t);
  });
  it("never lets Guide change the calculator, or work things out unseen", () => {
    const guide = allowedTools("guide", ALL);
    expect(guide.filter((t) => CHANGES.has(t))).toEqual([]);
    expect(guide).not.toContain("evaluate");
    for (const t of ["read_page", "look_at_screen", "highlight", "ask_user"]) expect(guide).toContain(t);
  });
  it("lets Check work things out and highlight, not change anything", () => {
    const check = allowedTools("check", ALL);
    expect(check.filter((t) => CHANGES.has(t))).toEqual([]);
    for (const t of ["evaluate", "highlight", "read_page", "ask_user"]) expect(check).toContain(t);
  });
});

describe("modeOf", () => {
  it("reads a saved mode, and an older tutor setting as Guide", () => {
    expect(modeOf({ mode: "exam" })).toBe("exam");
    expect(modeOf({ tutor: true })).toBe("guide");
    expect(modeOf({})).toBe("solve");
    expect(modeOf({ mode: "nonsense" })).toBe("solve");
    expect(MODE_IDS).toEqual(["solve", "exam", "guide", "check"]);
  });
});

describe("restrictToReadOnly", () => {
  it("keeps only looking, highlight and ask_user, in every mode", () => {
    for (const mode of MODE_IDS) {
      const kept = restrictToReadOnly(allowedTools(mode, ALL), ALL);
      for (const n of kept) expect(CHANGES.has(n)).toBe(false);
      expect(kept).toContain("ask_user");
      expect(kept.length).toBeGreaterThan(1);
    }
  });

  it("never adds a tool the mode doesn't allow", () => {
    for (const mode of MODE_IDS) {
      const byMode = new Set(allowedTools(mode, ALL));
      for (const n of restrictToReadOnly([...byMode], ALL)) expect(byMode.has(n)).toBe(true);
    }
  });
});
