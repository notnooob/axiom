// SPDX-License-Identifier: GPL-3.0-or-later
/**
 * The home screen: Scratchpad (A Calculate, B Graph) beside Documents
 * (1 New, 2 Browse, 3 Recent, 4 Current, 5 Settings), and a row of app icons
 * under them. Letters and numbers pick straight away, as on the handheld.
 */
import type { ReactNode } from "react";
import { cn } from "@/shared/lib/utils";
import type { Key } from "../keys";

export type HomeAction =
  | "scratchCalc"
  | "scratchGraph"
  | "fileNew"
  | "fileOpen"
  | "recent"
  | "current"
  | "settings"
  | `newWith:${string}`;

type Item = { key: string; label: string; act: HomeAction };
const SCRATCH: Item[] = [
  { key: "A", label: "Calculate", act: "scratchCalc" },
  { key: "B", label: "Graph", act: "scratchGraph" },
];
const DOCS: Item[] = [
  { key: "1", label: "New", act: "fileNew" },
  { key: "2", label: "Browse", act: "fileOpen" },
  { key: "3", label: "Recent...", act: "recent" },
  { key: "4", label: "Current", act: "current" },
  { key: "5", label: "Settings...", act: "settings" },
];

type Icon = { app: string; label: string; colour: string; glyph: ReactNode; on: boolean };
// Our own icons and colours, one per app; greyed ones aren't built yet.
const ICONS: Icon[] = [
  { app: "calculator", label: "Calculator", colour: "#7d7f99", on: true, glyph: <CalcGlyph /> },
  { app: "graphs", label: "Graphs", colour: "#4aa3df", on: true, glyph: <GraphGlyph /> },
  { app: "geometry", label: "Geometry", colour: "#2f5fae", on: true, glyph: <TriangleGlyph /> },
  { app: "lists", label: "Lists & Spreadsheet", colour: "#17a39a", on: true, glyph: <GridGlyph /> },
  { app: "data", label: "Data & Statistics", colour: "#b8509c", on: true, glyph: <BarsGlyph /> },
  { app: "notes", label: "Notes", colour: "#e8a23d", on: true, glyph: <NotesGlyph /> },
  { app: "python", label: "Python", colour: "#3a77c2", on: true, glyph: <PyGlyph /> },
];

/** Every app's icon, for the add-page menu too (the home row shows the first seven). */
const MORE: Icon[] = [
  { app: "vernier", label: "Vernier DataQuest", colour: "#8cc63f", on: false, glyph: <FlaskGlyph /> },
  { app: "widget", label: "Widget", colour: "#6e4f9e", on: false, glyph: <WidgetGlyph /> },
  { app: "program", label: "Program Editor", colour: "#e5555c", on: false, glyph: <BinaryGlyph /> },
];
const BY_APP = new Map([...ICONS, ...MORE].map((ic) => [ic.app, ic]));

/** An app's icon as a small rounded square, sized by the text around it (the add-page menu). */
export function AppIcon({ app }: { app: string }) {
  const ic = BY_APP.get(app);
  if (!ic) return null;
  return (
    <span aria-hidden className="mr-[1.4cqw] flex size-[1.25em] shrink-0 items-center justify-center rounded-[0.22em] text-white [&>svg]:size-[0.85em]" style={{ background: ic.colour }}>
      {ic.glyph}
    </span>
  );
}

export type HomeSel = { area: "scratch" | "docs" | "icons"; i: number };
export const HOME_START: HomeSel = { area: "scratch", i: 0 };

const listOf = (area: HomeSel["area"]) => (area === "scratch" ? SCRATCH : area === "docs" ? DOCS : ICONS);

export function homeKeyPress(sel: HomeSel, key: Key, hasRecent: boolean, hasCurrent = true): { sel: HomeSel; act?: HomeAction } {
  const n = listOf(sel.area).length;
  const enabled = (s: HomeSel) =>
    !(s.area === "icons" && !ICONS[s.i]!.on) &&
    !(s.area === "docs" && DOCS[s.i]!.act === "recent" && !hasRecent) &&
    !(s.area === "docs" && DOCS[s.i]!.act === "current" && !hasCurrent);
  const actOf = (s: HomeSel): HomeAction | undefined =>
    !enabled(s) ? undefined : s.area === "icons" ? `newWith:${ICONS[s.i]!.app}` : listOf(s.area)[s.i] && (listOf(s.area)[s.i] as Item).act;
  switch (key.k) {
    case "down":
      if (sel.i + 1 < n) return { sel: { ...sel, i: sel.i + 1 } };
      return sel.area === "icons" ? { sel } : { sel: { area: "icons", i: sel.area === "docs" ? 4 : 0 } };
    case "up":
      if (sel.area === "icons") return { sel: sel.i >= 3 ? { area: "docs", i: DOCS.length - 1 } : { area: "scratch", i: SCRATCH.length - 1 } };
      return { sel: { ...sel, i: Math.max(0, sel.i - 1) } };
    case "left":
      if (sel.area === "icons") return { sel: { ...sel, i: Math.max(0, sel.i - 1) } };
      return { sel: { area: "scratch", i: Math.min(sel.i, SCRATCH.length - 1) } };
    case "right":
      if (sel.area === "icons") return { sel: { ...sel, i: Math.min(ICONS.length - 1, sel.i + 1) } };
      return { sel: { area: "docs", i: Math.min(sel.i, DOCS.length - 1) } };
    case "tab":
      return { sel: { area: sel.area === "scratch" ? "docs" : sel.area === "docs" ? "icons" : "scratch", i: 0 } };
    case "enter":
      return { sel, act: actOf(sel) };
    case "char": {
      const c = key.c.toUpperCase();
      const s = SCRATCH.findIndex((x) => x.key === c);
      if (s >= 0) return { sel: { area: "scratch", i: s }, act: SCRATCH[s]!.act };
      const d = DOCS.findIndex((x) => x.key === c);
      if (d >= 0) return { sel: { area: "docs", i: d }, act: actOf({ area: "docs", i: d }) };
      return { sel };
    }
    default:
      return { sel };
  }
}

export function HomeScreen({
  sel,
  hasRecent,
  hasCurrent = true,
  onPick,
}: {
  sel: HomeSel;
  hasRecent: boolean;
  hasCurrent?: boolean;
  onPick: (sel: HomeSel, act: HomeAction | undefined) => void;
}) {
  const row = (area: HomeSel["area"], item: Item, i: number, dim = false) => {
    const on = sel.area === area && sel.i === i;
    return (
      <button
        key={item.key}
        type="button"
        tabIndex={-1}
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => onPick({ area, i }, dim ? undefined : item.act)}
        className={cn(
          "flex h-[7.4cqw] w-full items-center gap-[3cqw] px-[2.2cqw] text-left",
          on ? "bg-casSelect text-white" : dim ? "text-casDim" : "text-white",
        )}
      >
        <span className="w-[3cqw]">{item.key}</span>
        {item.label}
      </button>
    );
  };
  return (
    <div className="absolute inset-0 flex flex-col bg-black px-[3cqw] pt-[3.4cqw] font-casui text-[5cqw] text-white">
      <div className="grid grid-cols-2 gap-x-[4cqw]">
        <div>
          <div className="pb-[1.6cqw] pl-[0.6cqw] text-[5.4cqw] font-bold">Scratchpad</div>
          {SCRATCH.map((it, i) => row("scratch", it, i))}
        </div>
        <div>
          <div className="pb-[1.6cqw] pl-[0.6cqw] text-[5.4cqw] font-bold">Documents</div>
          {DOCS.map((it, i) => row("docs", it, i, (it.act === "recent" && !hasRecent) || (it.act === "current" && !hasCurrent)))}
        </div>
      </div>
      <div className="mt-auto flex justify-center gap-[2.2cqw] pb-[5cqw]">
        {ICONS.map((ic, i) => {
          const on = sel.area === "icons" && sel.i === i;
          return (
            <button
              key={ic.app}
              type="button"
              tabIndex={-1}
              aria-label={ic.on ? `New ${ic.label} document` : `${ic.label}, not available yet`}
              title={ic.label}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => onPick({ area: "icons", i }, ic.on ? `newWith:${ic.app}` : undefined)}
              className={cn(
                "flex size-[10.4cqw] items-center justify-center rounded-[1.8cqw] text-white",
                !ic.on && "opacity-35",
                on && "outline-solid outline-[0.7cqw] outline-offset-[0.5cqw] outline-casSelect",
              )}
              style={{ background: ic.colour }}
            >
              {ic.glyph}
            </button>
          );
        })}
      </div>
    </div>
  );
}

const G = "h-[6.4cqw] w-[6.4cqw]";
function CalcGlyph() {
  return (
    <svg viewBox="0 0 24 24" className={G} aria-hidden fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
      <path d="M4 7h6M7 4v6M14 7h6M4 17h6M14 15h6M14 19h6" />
    </svg>
  );
}
function GraphGlyph() {
  return (
    <svg viewBox="0 0 24 24" className={G} aria-hidden fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <path d="M2 14h20M12 2v20" strokeWidth="1.4" />
      <path d="M6 3c1.5 12 10.5 12 12 0" strokeWidth="2.4" />
    </svg>
  );
}
function TriangleGlyph() {
  return (
    <svg viewBox="0 0 24 24" className={G} aria-hidden fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinejoin="round">
      <path d="M4 20V4l16 16Z" />
    </svg>
  );
}
function GridGlyph() {
  return (
    <svg viewBox="0 0 24 24" className={G} aria-hidden fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="3" y="4" width="18" height="16" rx="1" />
      <path d="M3 9.5h18M3 15h18M9 4v16M15 4v16" />
    </svg>
  );
}
function BarsGlyph() {
  return (
    <svg viewBox="0 0 24 24" className={G} aria-hidden fill="currentColor">
      <rect x="4" y="12" width="4" height="9" rx="0.5" />
      <rect x="10" y="4" width="4" height="17" rx="0.5" />
      <rect x="16" y="9" width="4" height="12" rx="0.5" />
    </svg>
  );
}
function NotesGlyph() {
  return (
    <svg viewBox="0 0 24 24" className={G} aria-hidden fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="4" y="3" width="16" height="18" rx="1" />
      <path d="M8 8h8M8 12h8M8 16h5" />
    </svg>
  );
}
function PyGlyph() {
  return (
    <svg viewBox="0 0 24 24" className={G} aria-hidden fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <path d="M8 6l-5 6 5 6M16 6l5 6-5 6M13.5 4l-3 16" />
    </svg>
  );
}

function FlaskGlyph() {
  return (
    <svg viewBox="0 0 24 24" className={G} aria-hidden fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round">
      <path d="M9 3h6M10 3v6l-5 10a1.5 1.5 0 0 0 1.4 2h11.2a1.5 1.5 0 0 0 1.4-2l-5-10V3M10 14h4M10.5 17h3" />
    </svg>
  );
}
function WidgetGlyph() {
  return (
    <svg viewBox="0 0 24 24" className={G} aria-hidden fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="3" y="4" width="18" height="6" rx="1" />
      <rect x="3" y="13" width="7.5" height="7" rx="1" />
      <rect x="13.5" y="13" width="7.5" height="7" rx="1" />
    </svg>
  );
}
function BinaryGlyph() {
  return (
    <svg viewBox="0 0 24 24" className={G} aria-hidden fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M4 5v5M9 5h2v5H9zM15 5v5M19 5h2v5h-2zM4 14h2v5H4zM10 14v5M14 14h2v5h-2zM20 14v5" />
    </svg>
  );
}
