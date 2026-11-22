// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 VCE Hub. Part of the /cas calculator: https://github.com/vcehub/cas
import { fmt3, type Mark, type Tool } from "./graphs/model";
import { isEnabled, menuKey, type Menu, type MenuItem } from "./menus/types";
import type { MenuState } from "./menus/menu";
import type { WizardState } from "./menus/wizard";
import type { GraphsPage, HistoryEntry, Page } from "./state/document";

/**
 * What a screen reader hears. Focus stays on the calculator while it's in
 * use, so changes on the screen are read out through one live region:
 * results, errors, the menu row under the cursor, the wizard field, page
 * changes and Analyze Graph prompts and results.
 */

export function historySaid(entry: HistoryEntry): string {
  if (entry.error) return `${entry.inputText}. ${entry.error}`;
  return `${entry.inputText}. Result: ${entry.outputText}${entry.warning ? `. Warning: ${entry.warning[0]}` : ""}`;
}

export function menuSaid(menu: Menu, state: MenuState): string {
  let items: MenuItem[] = menu;
  const depth = state.path.length - 1;
  for (let d = 0; d < depth; d++) items = items[state.path[d]!]?.items ?? [];
  const i = state.path[depth] ?? 0;
  const item = items[i];
  if (!item) return "";
  const notes = [item.items ? "submenu" : "", isEnabled(item) ? "" : "not available"].filter(Boolean).join(", ");
  return `${menuKey(i)} ${item.label}${notes ? `, ${notes}` : ""}. ${i + 1} of ${items.length}`;
}

export function wizardSaid(w: WizardState): string {
  // A dropdown's open list: the highlighted option and where it is in the list.
  const lf = w.list ? w.wizard.fields[w.list.field] : undefined;
  if (w.list && lf?.options) return `${lf.label.replace(/:$/, "")} list, ${lf.options[w.list.sel]}, ${w.list.sel + 1} of ${lf.options.length}`;
  const f = w.wizard.fields[w.focus];
  const title = w.wizard.note ? `${w.wizard.title}. ${w.wizard.note}` : w.wizard.title;
  return f ? `${title}. ${f.label} ${w.values[w.focus] ?? ""}` : title;
}

/** Each app's name, as the page's tab and the add-page menu give it. */
const APP_SAID: Record<Page["kind"], string> = {
  calculator: "Calculator",
  graphs: "Graphs",
  lists: "Lists & Spreadsheet",
  datastats: "Data & Statistics",
  notes: "Notes",
  geometry: "Geometry",
  python: "Python",
  pyshell: "Python Shell",
  unsupported: "an app Axiom doesn't have yet",
};

export function pageSaid(page: Page, label: string): string {
  return `Page ${label}, ${page.kind === "unsupported" ? `${page.app}, not built yet` : APP_SAID[page.kind]}`;
}

export function toolSaid(tool: Tool | null): string {
  if (!tool) return "";
  if (tool.kind === "bounds")
    return tool.stage === "graph" ? `which graph? f${tool.fn}` : `f${tool.fn}, ${tool.stage} bound? x ${fmt3(tool.x)}`;
  if (tool.kind === "trace" && tool.curve) return tool.curve.kind === "rel" ? `rel${tool.curve.n}` : `x${tool.curve.n}, y${tool.curve.n}, t ${fmt3(tool.curve.at)}`;
  return `f${tool.fn}, x ${fmt3(tool.x)}`;
}

export function markSaid(mark: Mark): string {
  if (mark.kind === "area" && mark.other !== undefined) return `Area between f${mark.fn} and f${mark.other} from ${fmt3(mark.a)} to ${fmt3(mark.b)}: ${fmt3(mark.value)}`;
  if (mark.kind === "area") return `Integral of f${mark.fn} from ${fmt3(mark.a)} to ${fmt3(mark.b)}: ${fmt3(mark.value)}`;
  if (mark.kind === "line") return `${mark.title} of rel${mark.rel}: ${fmt3(mark.a)}x + ${fmt3(mark.b)}y = ${fmt3(mark.c)}`;
  if (mark.kind === "value") return `${mark.title} of rel${mark.rel}: ${fmt3(mark.value)}`;
  return `${mark.title ? `${mark.title}, ` : ""}${mark.rel !== undefined ? `rel${mark.rel}` : `f${mark.fn}`}: (${fmt3(mark.x)}, ${fmt3(mark.y)})`;
}

/** The graph canvas's text alternative. */
export function graphSaid(page: GraphsPage): string {
  const shown = page.functions.filter((f) => !f.hidden && f.text.trim());
  const w = page.window;
  const rels = (page.relations ?? []).filter((r) => !r.hidden).map((r) => `rel${r.n}: ${r.text}`);
  const pars = (page.parametrics ?? []).filter((c) => !c.hidden).map((c) => `x${c.n}(t)=${c.x}, y${c.n}(t)=${c.y}`);
  const des = (page.des ?? []).filter((d) => !d.hidden).map((d) => `y${d.y}'=${d.rhs}${d.x0 !== undefined ? ` through (${d.x0}, ${d.y0})` : ""}`);
  const all = [...shown.map((f) => `f${f.n}(x)=${f.text}`), ...rels, ...pars, ...des];
  const fns = all.length ? all.join("; ") : "no functions";
  return `Graph of ${fns}. x from ${fmt3(w.xmin)} to ${fmt3(w.xmax)}, y from ${fmt3(w.ymin)} to ${fmt3(w.ymax)}.`;
}
