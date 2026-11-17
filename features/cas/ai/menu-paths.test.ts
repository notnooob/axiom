// SPDX-License-Identifier: GPL-3.0-or-later
import { describe, expect, it } from "vitest";
import { calculatorMenu } from "../menus/calculator-menu";
import { menuKey, type MenuItem } from "../menus/types";
import { menuPathOf, outerCommand } from "./menu-paths";

/** Follow a path of labels through the real menu, as the keys a student would press. */
function keysFor(labels: string[]): string {
  let items: MenuItem[] = calculatorMenu;
  const keys: string[] = [];
  for (const l of labels) {
    const i = items.findIndex((it) => it.label.replace(/\.\.\.$/, "") === l);
    expect(i, `${l} in the menu`).toBeGreaterThanOrEqual(0);
    keys.push(menuKey(i));
    items = items[i]!.items ?? [];
  }
  return `menu ${keys.join(" ")}`;
}

describe("menuPathOf", () => {
  it("finds commands the menu inserts, builds in a dialog, or writes as a template", () => {
    const solve = menuPathOf("solve");
    expect(solve?.path).toBe("Algebra ▸ Solve");
    expect(solve?.keys).toBe("menu 3 1");
    for (const [cmd, start] of [
      ["binomCdf", "Probability ▸ Distributions"],
      ["d", "Calculus ▸ Derivative"],
      ["∫", "Calculus ▸ Integral"],
      ["nCr", "Probability ▸ Combinations"],
    ] as const) {
      const p = menuPathOf(cmd);
      expect(p?.path.startsWith(start), `${cmd}: ${p?.path}`).toBe(true);
      expect(p?.keys).toBe(keysFor(p!.path.split(" ▸ ")));
    }
  });
  it("gives null for what isn't in the menu", () => {
    expect(menuPathOf("frobnicate")).toBeNull();
    expect(menuPathOf("")).toBeNull();
  });
});

describe("outerCommand", () => {
  it("reads the command an entry starts with", () => {
    expect(outerCommand("solve(x^2=4,x)")).toBe("solve");
    expect(outerCommand("∫(x^2,x,0,1)")).toBe("∫");
    expect(outerCommand("LinRegMx a,b,1")).toBe("LinRegMx");
    expect(outerCommand("x^2-4")).toBeNull();
    expect(outerCommand("a:=5")).toBeNull();
  });
});
