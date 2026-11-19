// SPDX-License-Identifier: GPL-3.0-or-later
// Dialog dropdowns: the open list's keys, in a wizard and in the Finance Solver.
import { describe, expect, it } from "vitest";
import { financeKeyPress, financePick, newFinance } from "../finance/finance-solver";
import type { Key } from "../keys";
import { listKeyPress, openList } from "./dropdown";
import { openWizard, wizardKeyPress, wizardPick, type WizardState } from "./wizard";

const OPTS = ["Small", "Medium", "Large"];

describe("listKeyPress", () => {
  it("opens on the current value", () => {
    expect(openList(2, OPTS, "Large")).toEqual({ field: 2, sel: 2 });
    expect(openList(0, OPTS, "typed")).toEqual({ field: 0, sel: 0 });
  });

  it("moves the highlight, wrapping at the ends", () => {
    const l = openList(0, OPTS, "Small");
    expect(listKeyPress(l, OPTS, { k: "up" }).list?.sel).toBe(2);
    expect(listKeyPress(l, OPTS, { k: "down" }).list?.sel).toBe(1);
    expect(listKeyPress({ ...l, sel: 1 }, OPTS, { k: "end" }).list?.sel).toBe(2);
    expect(listKeyPress({ ...l, sel: 1 }, OPTS, { k: "home" }).list?.sel).toBe(0);
  });

  it("picks with Enter and closes unchanged with Esc or ◄", () => {
    const l = { field: 0, sel: 1 };
    expect(listKeyPress(l, OPTS, { k: "enter" })).toEqual({ list: null, pick: 1 });
    expect(listKeyPress(l, OPTS, { k: "esc" })).toEqual({ list: null });
    expect(listKeyPress(l, OPTS, { k: "left" })).toEqual({ list: null });
    expect(listKeyPress(l, OPTS, { k: "tab" })).toEqual({ list: null, pass: true });
  });

  it("jumps to the next option starting with a letter", () => {
    const opts = ["Float", "Float1", "Float2", "Fix"];
    expect(listKeyPress({ field: 0, sel: 0 }, opts, { k: "char", c: "f" }).list?.sel).toBe(1);
    expect(listKeyPress({ field: 0, sel: 3 }, opts, { k: "char", c: "F" }).list?.sel).toBe(0);
    expect(listKeyPress({ field: 0, sel: 2 }, opts, { k: "char", c: "z" }).list?.sel).toBe(2);
  });
});

describe("a wizard's dropdown", () => {
  const w0 = openWizard({
    kind: "wizard",
    title: "Handheld Setup",
    fields: [
      { label: "Text Size:", value: "Medium", options: OPTS },
      { label: "Haptics", value: "Yes", check: true },
      { label: "Name:", value: "" },
    ],
    build: "setup:{0}:{1}:{2}",
  });
  const press = (w: WizardState, ...keys: Key[]) => keys.reduce<WizardState>((s, k) => wizardKeyPress(s, k).state!, w);

  it("doesn't cycle: ► opens the list and ◄ does nothing", () => {
    expect(press(w0, { k: "left" })).toEqual(w0);
    const open = press(w0, { k: "right" });
    expect(open.values[0]).toBe("Medium");
    expect(open.list).toEqual({ field: 0, sel: 1 });
  });

  it("picks from the list with ▼ and Enter, without pressing OK", () => {
    const w = press(w0, { k: "right" }, { k: "down" });
    const r = wizardKeyPress(w, { k: "enter" });
    expect(r.done).toBeUndefined();
    expect(r.state?.values[0]).toBe("Large");
    expect(r.state?.list).toBeNull();
    // With the list shut, Enter is OK again.
    expect(wizardKeyPress(r.state!, { k: "enter" }).done).toBe("setup:Large:Yes:");
  });

  it("Esc closes the list, not the dialog", () => {
    const r = wizardKeyPress(press(w0, { k: "right" }, { k: "down" }), { k: "esc" });
    expect(r.state?.list).toBeNull();
    expect(r.state?.values[0]).toBe("Medium");
  });

  it("Tab shuts the list and moves on", () => {
    const w = press(w0, { k: "right" }, { k: "tab" });
    expect(w.list).toBeNull();
    expect(w.focus).toBe(1);
  });

  it("a click on an option picks it", () => {
    expect(wizardPick(press(w0, { k: "right" }), 0).values[0]).toBe("Small");
  });

  it("checkboxes still toggle with the arrows", () => {
    expect(press(w0, { k: "down" }, { k: "right" }).values[1]).toBe("No");
  });
});

describe("Finance Solver's PmtAt", () => {
  const at = { ...newFinance(), focus: 7 };

  it("opens a list rather than flipping", () => {
    const s = financeKeyPress(at, { k: "right" }).state!;
    expect(s.values[7]).toBe("END");
    expect(s.list).toEqual({ field: 7, sel: 0 });
    expect(financeKeyPress(at, { k: "left" }).state).toEqual(at);
  });

  it("picks BEGIN from the list", () => {
    const s = financeKeyPress(financeKeyPress(at, { k: "right" }).state!, { k: "down" }).state!;
    const picked = financeKeyPress(s, { k: "enter" }).state!;
    expect(picked.values[7]).toBe("BEGIN");
    expect(picked.list).toBeNull();
    expect(picked.focus).toBe(7);
    expect(financePick({ ...at, list: { field: 7, sel: 0 } }, 1).values[7]).toBe("BEGIN");
  });
});
