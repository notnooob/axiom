// SPDX-License-Identifier: GPL-3.0-or-later
import { useLayoutEffect, useRef } from "react";
import { cn } from "@/shared/lib/utils";
import { MathView } from "../math/render";
import type { Row } from "../math/tree";
import type { Highlight } from "../ai/highlights";
import { FlagBadge, flagRing } from "../screen/flag";
import type { ListsPage, ListsSel } from "../state/document";
import { cellLine, COLS, displayRow, letter, rowsUsed } from "./sheet";

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
  onLineKey,
  highlights = [],
}: {
  page: ListsPage;
  onSelect: (sel: ListsSel) => void;
  /** The cell line's ◄ ► buttons: move the cursor in the selected cell. */
  onLineKey?: (dir: "left" | "right") => void;
  highlights?: Highlight[];
}) {
  const box = useRef<HTMLDivElement>(null);
  const rows = Math.max(rowsUsed(page) + 12, page.sel.row + 6, 24);
  useLayoutEffect(() => {
    box.current?.querySelector("[data-sel]")?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [page.sel.row, page.sel.col]);

  const cell = (row: number, col: number) => {
    const on = page.sel.row === row && page.sel.col === col;
    const editing = on && page.edit;
    const isFormula = row >= 2 && (page.cols[col]?.cells[row - 2] ?? "").startsWith("=");
    // The assistant's highlight on this cell (its row counts from the first row of values).
    const flag = highlights.find((h) => h.target.kind === "cell" && h.target.col === col && h.target.row === row - 1);
    return (
      <div
        key={col}
        {...(on ? { "data-sel": true } : {})}
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => onSelect({ row, col })}
        className={cn(
          "relative flex h-[6.4cqw] w-[21cqw] shrink-0 items-center overflow-hidden whitespace-nowrap border-b border-r border-casRule px-[1cqw]",
          row >= 2 ? "justify-end" : "justify-start",
          row === 1 && "bg-casTab",
          on && !editing && "outline-solid outline-[0.5cqw] outline-offset-[-0.5cqw] outline-casInk",
          editing && "bg-casSelectSoft",
          isFormula && !on && "text-[#1b4fa8]",
        )}
      >
        {/* Each cell's contents as maths, as the handheld draws them (log typed shows as log₁₀ once entered). */}
        <span className={cn(tall(editing ? page.edit!.row : displayRow(page, row, col)) && "text-[0.62em]")}>
          {editing ? <MathView row={page.edit!.row} cursor={page.edit!.cursor} className="font-casmath" /> : <MathView row={displayRow(page, row, col)} className="font-casmath" />}
        </span>
        {flag && (
          <>
            <FlagBadge n={flag.n} tone={flag.tone} className="absolute top-1/2 left-[0.6cqw] -translate-y-1/2" />
            <span aria-hidden className={cn("absolute inset-0", flagRing(flag.tone))} />
          </>
        )}
      </div>
    );
  };

  const line = cellLine(page);
  return (
    <div className="absolute inset-0 flex flex-col bg-casScreen font-casui text-[calc(4cqw*var(--axiom-text,1))] text-casInk">
    <div ref={box} className="relative isolate min-h-0 flex-1 overflow-auto scrollbar-thin">
      <div className="w-max">
        <div className="sticky top-0 z-10 flex bg-[#e8e8e8]">
          <div className="sticky left-0 z-10 h-[6.4cqw] w-[8cqw] shrink-0 border-b border-r border-casRule bg-[#e8e8e8]" />
          {Array.from({ length: COLS }, (_, c) => {
            const name = page.cols[c]?.name;
            const on = page.sel.row === 0 && page.sel.col === c;
            return (
              <div
                key={c}
                {...(on ? { "data-sel": true } : {})}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => onSelect({ row: 0, col: c })}
                className={cn(
                  "flex h-[6.4cqw] w-[21cqw] shrink-0 items-center gap-[1.4cqw] border-b border-r border-casRule px-[1cqw]",
                  on && "outline-solid outline-[0.5cqw] outline-offset-[-0.5cqw] outline-casInk",
                  on && page.edit && "bg-casSelectSoft",
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
            <div className="sticky left-0 z-5 flex h-[6.4cqw] w-[8cqw] shrink-0 items-center justify-center border-b border-r border-casRule bg-[#e8e8e8] text-[0.85em] text-casLabel">
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
        {/* ◄ ► at the right end, as on the handheld: the cursor in the cell, a step at a time. */}
        {(["left", "right"] as const).map((dir) => (
          <button
            key={dir}
            type="button"
            tabIndex={-1}
            aria-label={dir === "left" ? "Move the cursor left in the cell" : "Move the cursor right in the cell"}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => onLineKey?.(dir)}
            className="flex w-[6cqw] shrink-0 items-center justify-center self-stretch border-l border-casRule text-[0.8em] text-casInk hover:bg-[#e2e2e2]"
          >
            {dir === "left" ? "◄" : "►"}
          </button>
        ))}
      </div>
    </div>
  );
}
