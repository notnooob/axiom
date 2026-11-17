// SPDX-License-Identifier: GPL-3.0-or-later
/**
 * Where a command lives in the Calculator's menu, as keys a student presses
 * ("menu 3 1") and as labels ("Algebra ▸ Solve"), so the assistant can say how
 * to reach it on the handheld rather than only what to type.
 */
import { calculatorMenu } from "../menus/calculator-menu";
import { menuKey, type Menu, type MenuItem, type TemplateId } from "../menus/types";

/** Templates and the command each one writes. */
const TEMPLATE_COMMANDS: Partial<Record<TemplateId, string>> = {
  deriv: "d",
  nderiv: "d",
  integral: "∫",
  defintegral: "∫",
  limit: "limit",
  sum: "Σ",
  product: "Π",
};

/** The command a menu item puts in the entry line, if any. */
function commandOf(item: MenuItem): string | null {
  const a = item.action;
  if (!a) return null;
  if (a.kind === "insert") return /^([^\s(]+)\(?$/.exec(a.text.trim())?.[1] ?? null;
  if (a.kind === "wizard") return /^([^\s(:]+)[\s(]/.exec(a.build)?.[1] ?? null;
  if (a.kind === "template") return TEMPLATE_COMMANDS[a.template] ?? null;
  return null;
}

export type MenuPath = { keys: string; path: string };

/** The shallowest menu item that writes command, or null. */
export function menuPathOf(command: string, menu: Menu = calculatorMenu): MenuPath | null {
  const want = command.trim().toLowerCase();
  if (!want) return null;
  type Spot = { at: number[]; labels: string[] };
  // Breadth first, so a command under two submenus is given by its shorter path.
  let level: (Spot & { items: MenuItem[] })[] = [{ items: menu, at: [], labels: [] }];
  while (level.length) {
    const next: typeof level = [];
    for (const { items, at, labels } of level)
      for (const [i, it] of items.entries()) {
        const here: Spot = { at: [...at, i], labels: [...labels, it.label.replace(/\.\.\.$|…$/, "")] };
        if (it.items) next.push({ items: it.items, ...here });
        else if (commandOf(it)?.toLowerCase() === want) return { keys: `menu ${here.at.map(menuKey).join(" ")}`, path: here.labels.join(" ▸ ") };
      }
    level = next;
  }
  return null;
}

/** The outer command of a Calculator entry: solve(x^2=4,x) → solve, LinRegMx x,y,1 → LinRegMx, x^2-4 → null. */
export function outerCommand(text: string): string | null {
  return /^\s*([A-Za-zΣΠ∫][\w]*)(?=\s*\(|\s+[\w{])/.exec(text)?.[1] ?? null;
}
