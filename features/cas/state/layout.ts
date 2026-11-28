// SPDX-License-Identifier: GPL-3.0-or-later
/**
 * Page layouts (doc ▸ Page Layout): up to four apps on one page, as the
 * handheld splits its screen. Each app is still a page of the document, so
 * everything that reads pages keeps working; a group lists the pages that
 * share a screen, region by region, and the page tabs count it as one page.
 * A region can be empty until an app is chosen for it.
 */
import { problemOf, type CasDocument } from "./document";

export type PageGroup = {
  /** Page ids in region order; null is an empty region. */
  slots: (number | null)[];
  /** The handheld's layout number, 2 to 8 (1 is a page on its own). */
  layout: number;
  /** Where the first divider is, as a fraction of the width (or height). */
  split?: number;
};

/** Each layout's regions as CSS grid areas, the first divider's direction, and how many regions it has. */
export const LAYOUTS: Record<number, { areas: string[]; dir: "cols" | "rows"; regions: number }> = {
  2: { areas: ["a b"], dir: "cols", regions: 2 },
  3: { areas: ["a", "b"], dir: "rows", regions: 2 },
  4: { areas: ["a b", "a c"], dir: "cols", regions: 3 },
  5: { areas: ["a c", "b c"], dir: "cols", regions: 3 },
  6: { areas: ["a a", "b c"], dir: "rows", regions: 3 },
  7: { areas: ["a b", "c c"], dir: "rows", regions: 3 },
  8: { areas: ["a b", "c d"], dir: "cols", regions: 4 },
};

const layoutFor = (n: number) => (n <= 2 ? 2 : n === 3 ? 4 : 8);

/** Groups with deleted pages emptied, and groups with no pages left gone. */
export function tidy(doc: CasDocument): CasDocument {
  if (!doc.groups) return doc;
  const ids = new Set(doc.pages.map((p) => p.id));
  const groups = doc.groups.map((g) => ({ ...g, slots: g.slots.map((s) => (s !== null && ids.has(s) ? s : null)) })).filter((g) => g.slots.some((s) => s !== null));
  return { ...doc, groups };
}

/** The group a page is in, by index, or -1. */
export const groupIndex = (doc: CasDocument, pageId: number) => (doc.groups ?? []).findIndex((g) => g.slots.includes(pageId));

/** What the page tabs show: each page on its own, or a group's pages once, at its first page's place. */
export function units(doc: CasDocument): { pages: number[]; group: number }[] {
  const out: { pages: number[]; group: number }[] = [];
  const done = new Set<number>();
  doc.pages.forEach((p, i) => {
    const g = groupIndex(doc, p.id);
    if (g < 0) return out.push({ pages: [i], group: -1 });
    if (done.has(g)) return;
    done.add(g);
    const pages = doc.groups![g]!.slots.filter((s): s is number => s !== null).map((id) => doc.pages.findIndex((q) => q.id === id));
    out.push({ pages: pages.filter((x) => x >= 0), group: g });
  });
  return out;
}

/** The tab (unit) a page is on. */
export const unitOf = (doc: CasDocument, index: number) => units(doc).findIndex((u) => u.pages.includes(index));

/** A page's label, problem.page, a group counting as one page. */
export function unitLabel(doc: CasDocument, index: number): string {
  const all = units(doc);
  const u = all.findIndex((x) => x.pages.includes(index));
  const n = problemOf(doc.pages[index]);
  const within = all.slice(0, u + 1).filter((x) => problemOf(doc.pages[x.pages[0]!]) === n).length;
  return `${n}.${within}`;
}

/**
 * Select Layout n for the active page's tab: 1 puts its pages back on their
 * own; any other lays them out in that many regions, empty regions for
 * missing apps, and pages beyond the regions back on their own.
 */
export function selectLayout(doc: CasDocument, layout: number): CasDocument {
  const page = doc.pages[doc.active];
  if (!page) return doc;
  const g = groupIndex(doc, page.id);
  const groups = (doc.groups ?? []).slice();
  if (layout === 1) {
    if (g >= 0) groups.splice(g, 1);
    return { ...doc, groups };
  }
  const spec = LAYOUTS[layout];
  if (!spec) return doc;
  const members = g >= 0 ? groups[g]!.slots.filter((s): s is number => s !== null) : [page.id];
  const slots: (number | null)[] = [...members.slice(0, spec.regions)];
  while (slots.length < spec.regions) slots.push(null);
  const next: PageGroup = { slots, layout, split: g >= 0 ? groups[g]!.split : undefined };
  if (g >= 0) groups[g] = next;
  else groups.push(next);
  const active = slots.includes(page.id) ? doc.active : doc.pages.findIndex((p) => p.id === slots[0]);
  return { ...doc, groups, active };
}

/** Group: the active tab's pages and the next tab's (same problem), up to four, laid out for how many there are. */
export function groupWithNext(doc: CasDocument): CasDocument {
  const all = units(doc);
  const u = unitOf(doc, doc.active);
  const here = all[u];
  const next = all[u + 1];
  if (!here || !next || problemOf(doc.pages[here.pages[0]!]) !== problemOf(doc.pages[next.pages[0]!])) return doc;
  const ids = [...here.pages, ...next.pages].map((i) => doc.pages[i]!.id);
  if (ids.length > 4) return doc;
  const groups = (doc.groups ?? []).filter((_, i) => i !== here.group && i !== next.group);
  groups.push({ slots: ids, layout: layoutFor(ids.length) });
  // The group's pages sit together, in region order, where the first one was.
  const first = Math.min(...here.pages);
  const moved = ids.map((id) => doc.pages.find((p) => p.id === id)!);
  const rest = doc.pages.filter((p) => !ids.includes(p.id));
  const at = rest.findIndex((p) => doc.pages.indexOf(p) > first);
  const pages = [...rest.slice(0, at < 0 ? rest.length : at), ...moved, ...rest.slice(at < 0 ? rest.length : at)];
  const activeId = doc.pages[doc.active]!.id;
  return { ...doc, pages, groups, active: pages.findIndex((p) => p.id === activeId) };
}

/** Ungroup: the active tab's pages each back on their own. */
export function ungroup(doc: CasDocument): CasDocument {
  const g = groupIndex(doc, doc.pages[doc.active]?.id ?? -1);
  if (g < 0) return doc;
  return { ...doc, groups: doc.groups!.filter((_, i) => i !== g) };
}

/** Swap Application: the active region's app trades places with the next region's. */
export function swapApp(doc: CasDocument): CasDocument {
  const id = doc.pages[doc.active]?.id ?? -1;
  const g = groupIndex(doc, id);
  if (g < 0) return doc;
  const group = doc.groups![g]!;
  const i = group.slots.indexOf(id);
  const j = (i + 1) % group.slots.length;
  const slots = group.slots.slice();
  [slots[i], slots[j]] = [slots[j]!, slots[i]!];
  const groups = doc.groups!.slice();
  groups[g] = { ...group, slots };
  return { ...doc, groups };
}

/** The next region's page (Ctrl+Tab), or its slot when it's empty. */
export function nextRegion(doc: CasDocument, dir: 1 | -1 = 1): { active: number } | { group: number; slot: number } | null {
  const id = doc.pages[doc.active]?.id ?? -1;
  const g = groupIndex(doc, id);
  if (g < 0) return null;
  const slots = doc.groups![g]!.slots;
  const j = (slots.indexOf(id) + dir + slots.length) % slots.length;
  const target = slots[j];
  if (target === null || target === undefined) return { group: g, slot: j };
  return { active: doc.pages.findIndex((p) => p.id === target) };
}

/** An app chosen for an empty region: the new page goes after the group's pages and into the region. */
export function fillRegion(doc: CasDocument, group: number, slot: number, page: CasDocument["pages"][number]): CasDocument {
  const g = doc.groups?.[group];
  if (!g || g.slots[slot] !== null) return doc;
  const last = Math.max(...g.slots.map((id) => doc.pages.findIndex((p) => p.id === id)));
  const pages = doc.pages.slice();
  const at = last < 0 ? doc.active + 1 : last + 1;
  pages.splice(at, 0, { ...page, problem: problemOf(doc.pages[doc.active]) });
  const groups = doc.groups!.slice();
  const slots = g.slots.slice();
  slots[slot] = page.id;
  groups[group] = { ...g, slots };
  return { ...doc, pages, groups, active: at };
}

/** Custom Split: the first divider moved by step, kept between a fifth and four fifths. */
export function moveSplit(doc: CasDocument, step: number): CasDocument {
  const g = groupIndex(doc, doc.pages[doc.active]?.id ?? -1);
  if (g < 0) return doc;
  const groups = doc.groups!.slice();
  const split = Math.min(0.8, Math.max(0.2, (groups[g]!.split ?? 0.5) + step));
  groups[g] = { ...groups[g]!, split };
  return { ...doc, groups };
}

/**
 * A new app beside the active page, as Quick Graph and Summary Plot split
 * the spreadsheet's screen: the two share a page (layout 2) and the new one
 * is active. In a page already laid out, it takes an empty region, or else
 * comes as the next page.
 */
export function splitWith(doc: CasDocument, page: CasDocument["pages"][number]): CasDocument {
  const here = doc.pages[doc.active];
  if (!here) return doc;
  const placed = { ...page, problem: problemOf(here) };
  const g = groupIndex(doc, here.id);
  if (g >= 0) {
    const empty = doc.groups![g]!.slots.indexOf(null);
    if (empty >= 0) return fillRegion(doc, g, empty, placed);
    const last = Math.max(...doc.groups![g]!.slots.map((id) => doc.pages.findIndex((p) => p.id === id)));
    const pages = doc.pages.slice();
    pages.splice(last + 1, 0, placed);
    return { ...doc, pages, active: last + 1 };
  }
  const pages = doc.pages.slice();
  pages.splice(doc.active + 1, 0, placed);
  return { ...doc, pages, groups: [...(doc.groups ?? []), { slots: [here.id, placed.id], layout: 2 }], active: doc.active + 1 };
}
