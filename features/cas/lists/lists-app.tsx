// SPDX-License-Identifier: GPL-3.0-or-later
import { useLayoutEffect, useRef, useState } from "react";
import { cn } from "@/shared/lib/utils";
import { MathView } from "../math/render";
import type { Row } from "../math/tree";
import type { Highlight } from "../ai/highlights";
import { FlagBadge, flagRing } from "../screen/flag";
import type { ListsPage, ListsSel } from "../state/document";
import { cellLine, COLS, displayRow, fillRange, heightOf, letter, rowsUsed, styleAt, textAt, widthOf } from "./sheet";

/** Maths two or more lines tall (a fraction, a matrix …) is drawn smaller in a cell so it fits the row; the cell line shows it full size. */
const tall = (row: Row) => /"t":"(frac|matrix|piecewise|system|integral|bigop|limit|deriv)"/.test(JSON.stringify(row));

/**
 * The spreadsheet as the handheld draws it: column letters with the list
 * names under them, the ◆ formula row, then numbered rows, the selected cell
 * outlined (filled while it's being edited).
 */
export function ListsApp({
  page,
  onSelect,
  highlights = [],
}: {
  page: ListsPage;
  onSelect: (sel: ListsSel) => void;
  highlights?: Highlight[];
}) {
  const box = useRef<HTMLDivElement>(null);
  const rows = Math.max(rowsUsed(page) + 12, page.sel.row + 6, 24);
  // How far the spreadsheet can still scroll each way, for the cell line's ◄ ► (greyed at either end).
  const [ends, setEnds] = useState({ left: true, right: false });
  // Where a ◄ ► scroll is heading, so presses in quick succession each move a further column.
  const heading = useRef<number | null>(null);
  const measure = () => {
    const el = box.current;
    if (!el) return;
    if (heading.current !== null && Math.abs(el.scrollLeft - heading.current) < 2) heading.current = null;
    setEnds({ left: el.scrollLeft <= 1, right: el.scrollLeft + el.clientWidth >= el.scrollWidth - 1 });
  };
  useLayoutEffect(measure, []);
  /** ◄ ►: the spreadsheet a column to the left or right, landing on a column's edge; the selection stays where it is. */
  const scrollColumns = (dir: -1 | 1) => {
    const el = box.current;
    const width = el?.querySelector<HTMLElement>("[data-colhead]")?.offsetWidth;
    if (!el || !width) return;
    const from = heading.current ?? el.scrollLeft;
    const to = Math.min(el.scrollWidth - el.clientWidth, Math.max(0, (Math.round(from / width) + dir) * width));
    heading.current = to;
    el.scrollTo({ left: to, behavior: "smooth" });
  };
  useLayoutEffect(() => {
    box.current?.querySelector("[data-sel]")?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [page.sel.row, page.sel.col]);

  const cell = (row: number, col: number) => {
    const on = page.sel.row === row && page.sel.col === col;
    // Move Column's line: the gap the column will go into, at this column's left edge.
    const gap = page.mode?.kind === "move" && page.mode.to === col;
    // Fill and Select Formula Range both mark the cells they cover with a dotted outline.
    const filling = (page.mode?.kind === "fill" || page.mode?.kind === "range") && fill.has(`${row}:${col}`);
    const style = styleAt(page, row, col);
    // A row or column picked with Actions ▸ Select is shaded, as the handheld marks it.
    const picked = page.pick === "col" ? col === page.sel.col : page.pick === "row" && row === page.sel.row;
    const editing = on && page.edit;
    // Text (a result's name, a category) reads as words on the left, as the handheld shows it.
    const text = editing ? null : textAt(page, row, col);
    const isFormula = row >= 2 && !text && (page.cols[col]?.cells[row - 2] ?? "").startsWith("=");
    // The assistant's highlight on this cell (its row counts from the first row of values).
    const flag = highlights.find((h) => h.target.kind === "cell" && h.target.col === col && h.target.row === row - 1);
    return (
      <div
        key={col}
        {...(on ? { "data-sel": true } : {})}
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => onSelect({ row, col })}
        style={{ width: `${widthOf(page, col)}cqw`, height: `${heightOf(page, row)}cqw`, background: style?.fill, color: style?.text }}
        className={cn(
          "relative flex shrink-0 items-center overflow-hidden whitespace-nowrap border-b border-r border-casRule px-[1cqw]",
          gap && "border-l-[0.7cqw] border-l-casSelect",
          filling && !on && "outline-dotted outline-[0.4cqw] outline-offset-[-0.4cqw] outline-casSelect",
          row >= 2 && text === null ? "justify-end" : "justify-start",
          row === 1 && "bg-casTab",
          on && !editing && "outline-solid outline-[0.5cqw] outline-offset-[-0.5cqw] outline-casInk",
          (editing || picked) && "bg-casSelectSoft",
          isFormula && !on && "text-[#1b4fa8]",
        )}
      >
        {/* Each cell's contents as maths, as the handheld draws them (log typed shows as log₁₀ once entered). */}
        {text !== null ? (
          <span className="truncate">{text}</span>
        ) : (
          <span className={cn(tall(editing ? page.edit!.row : displayRow(page, row, col)) && "text-[0.62em]")}>
            {editing ? <MathView row={page.edit!.row} cursor={page.edit!.cursor} className="font-casmath" /> : <MathView row={displayRow(page, row, col)} className="font-casmath" />}
          </span>
        )}
        {flag && (
          <>
            <FlagBadge n={flag.n} tone={flag.tone} className="absolute top-1/2 left-[0.6cqw] -translate-y-1/2" />
            <span aria-hidden className={cn("absolute inset-0", flagRing(flag.tone))} />
          </>
        )}
      </div>
    );
  };

  const fill = new Set(fillRange(page).map((c) => `${c.row}:${c.col}`));
  const line = cellLine(page);
  return (
    <div className="absolute inset-0 flex flex-col bg-casScreen font-casui text-[calc(4cqw*var(--axiom-text,1))] text-casInk">
    <div ref={box} onScroll={measure} onWheel={() => (heading.current = null)} className="relative isolate min-h-0 flex-1 overflow-auto scrollbar-thin">
      <div className="w-max">
        <div className="sticky top-0 z-10 flex bg-[#e8e8e8]">
          <div className="sticky left-0 z-10 h-[6.4cqw] w-[8cqw] shrink-0 border-b border-r border-casRule bg-[#e8e8e8]" />
          {Array.from({ length: COLS }, (_, c) => {
            const name = page.cols[c]?.name;
            const on = page.sel.row === 0 && page.sel.col === c;
            return (
              <div
                key={c}
                data-colhead
                {...(on ? { "data-sel": true } : {})}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => onSelect({ row: 0, col: c })}
                style={{ width: `${widthOf(page, c)}cqw` }}
                className={cn(
                  "flex h-[6.4cqw] shrink-0 items-center gap-[1.4cqw] border-b border-r border-casRule px-[1cqw]",
                  page.mode?.kind === "move" && page.mode.to === c && "border-l-[0.7cqw] border-l-casSelect",
                  on && "outline-solid outline-[0.5cqw] outline-offset-[-0.5cqw] outline-casInk",
                  ((on && page.edit) || (page.pick === "col" && page.sel.col === c)) && "bg-casSelectSoft",
                )}
              >
                <span className="text-casLabel">{letter(c)}</span>
                {on && page.edit ? (
                  <MathView row={page.edit.row} cursor={page.edit.cursor} />
                ) : (
                  <span className="truncate font-semibold">{name}</span>
                )}
              </div>
            );
          })}
        </div>
        {Array.from({ length: rows - 1 }, (_, i) => i + 1).map((row) => (
          <div key={row} className="flex">
            <div
              style={{ height: `${heightOf(page, row)}cqw` }}
              className={cn(
                "sticky left-0 z-5 flex w-[8cqw] shrink-0 items-center justify-center border-b border-r border-casRule bg-[#e8e8e8] text-[0.85em] text-casLabel",
                page.mode?.kind === "rowsize" && page.sel.row === row && "bg-casSelectSoft",
              )}
            >
              {row === 1 ? "◆" : row - 1}
            </div>
            {Array.from({ length: COLS }, (_, c) => cell(row, c))}
          </div>
        ))}
      </div>
    </div>
      {/*
        The cell line, as on the handheld: the selected cell's reference and what it holds in full (a formula
        as typed, not its value), in larger maths. It grows to fit whatever is in the cell, a template's
        subscripts included, and mirrors the cell while it's being edited.
      */}
      <div className="flex min-h-[8cqw] shrink-0 items-center border-t-[0.3cqw] border-casRule bg-[#f4f4f4]" aria-label={`Cell ${line.ref}`}>
        <div className="w-[8cqw] shrink-0 self-stretch border-r border-casRule bg-[#e8e8e8] text-center font-casmath italic leading-[8cqw] text-casLabel">{line.ref}</div>
        <div className="min-w-0 flex-1 overflow-x-auto px-[1.4cqw] py-[0.8cqw] text-[1.15em] scrollbar-none">
          {/* The cursor shows only while the cell is being edited, wherever it is in the cell. */}
          {page.edit ? <MathView row={page.edit.row} cursor={page.edit.cursor} className="font-casmath" /> : <MathView row={line.row} className="font-casmath" />}
        </div>
        {/* ◄ ► at the right end, as on the handheld: they scroll the spreadsheet a column left or right, to reach more columns. */}
        {(["left", "right"] as const).map((dir) => (
          <button
            key={dir}
            type="button"
            tabIndex={-1}
            disabled={ends[dir]}
            aria-label={dir === "left" ? "Scroll the columns left" : "Scroll the columns right"}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => scrollColumns(dir === "left" ? -1 : 1)}
            className="flex w-[6cqw] shrink-0 items-center justify-center self-stretch border-l border-casRule text-[0.8em] text-casInk hover:bg-[#e2e2e2] disabled:text-casDim disabled:hover:bg-transparent"
          >
            {dir === "left" ? "◄" : "►"}
          </button>
        ))}
      </div>
    </div>
  );
}
