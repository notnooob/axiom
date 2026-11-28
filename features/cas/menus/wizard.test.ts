// SPDX-License-Identifier: GPL-3.0-or-later
import { describe, expect, it } from "vitest";
import { CONFIDENCE_INTERVALS, STAT_CALCULATIONS, STAT_TESTS } from "./calculator-menu";
import type { MenuAction } from "./types";
import { buildWizard, openWizard, wizardKeyPress, type WizardState } from "./wizard";

type Dialog = Extract<MenuAction, { kind: "wizard" }>;
const dialogOf = (items: { label: string; action?: MenuAction }[], label: string) => items.find((i) => i.label === label)!.action as Dialog;
const type = (w: WizardState, text: string) => wizardKeyPress(w, { k: "text", text }).state!;
const tab = (w: WizardState) => wizardKeyPress(w, { k: "tab" }).state!;

describe("statistics dialogs, step by step as on the handheld", () => {
  it("asks Num of Lists first, then the lists; Esc goes back a step", () => {
    const first = openWizard(dialogOf(STAT_CALCULATIONS, "One-Variable Statistics..."));
    expect(first.wizard.fields.map((f) => f.label)).toEqual(["Num of Lists:"]);
    const second = wizardKeyPress(type(first, "2"), { k: "enter" }).state!;
    expect(second.wizard.fields.map((f) => f.label)).toEqual(["X1 List:", "X2 List:"]);
    expect(wizardKeyPress(second, { k: "esc" }).state).toBe(second.back);
    const filled = type(tab(type(second, "a")), "b");
    expect(wizardKeyPress(filled, { k: "enter" }).done).toBe("OneVar 2,a,b");
  });

  it("asks Data or Stats, and words the hypothesis while the command takes its code", () => {
    const first = openWizard(dialogOf(STAT_TESTS, "t Test..."));
    expect(first.values).toEqual(["Data"]);
    const data = wizardKeyPress(first, { k: "enter" }).state!;
    expect(data.wizard.fields.map((f) => f.label)).toEqual(["μ0:", "List:", "Frequency List:", "Alternate Hyp:"]);
    expect(data.values[3]).toBe("Ha: μ ≠ μ0");
    const done = { ...data, values: ["5", "a", "1", "Ha: μ > μ0"] };
    expect(buildWizard(done)).toBe("tTest 5,a,1,1");
  });

  it("refuses OK with a required field empty, naming it as the handheld's Input Error does", () => {
    const stats = wizardKeyPress({ ...openWizard(dialogOf(CONFIDENCE_INTERVALS, "t Interval...")), values: ["Stats"] }, { k: "enter" }).state!;
    const r = wizardKeyPress(stats, { k: "enter" });
    expect(r.error).toBe("Input Error: Required field is empty! Field # 1: x̄:");
    expect(r.state).toBe(stats);
  });
});
