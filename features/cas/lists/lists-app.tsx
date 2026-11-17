// SPDX-License-Identifier: GPL-3.0-or-later
import { useLayoutEffect, useRef } from "react";
import { cn } from "@/shared/lib/utils";
import { MathView } from "../math/render";
import type { Highlight } from "../ai/highlights";
import { FlagBadge, flagRing } from "../screen/flag";
import type { ListsPage, ListsSel } from "../state/document";
import { COLS, letter, rowsUsed, shownAt } from "./sheet";

/**
 * The spreadsheet as the handheld draws it: column letters with the list
 * names under them, the ◆ formula row, then numbered rows, the selected cell
 * outlined (filled while it's being edited).
 */
export function ListsApp({ page, onSelect, highlights = [] }: { page: ListsPage; onSelect: (sel: ListsSel) => void; highlights?: Highlight[] }) {
  const box = useRef<HTMLDivElement>(null);
  const rows = Math.max(rowsUsed(page) + 12, page.sel.row + 6, 24);
  useLayoutEffect(() => {
    box.current?.querySelector("[data-sel]")?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [page.sel.row, page.sel.col]);

  const cell = (row: number, col: number) => {
    const on = page.sel.row === row && page.sel.col === col;
    const editing = on && page.edit;
    const text = shownAt(page, row, col);
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
        {editing ? <MathView row={page.edit!.row} cursor={page.edit!.cursor} className="font-casmath" /> : <span className="truncate">{text}</span>}
        {flag && (
          <>
            <FlagBadge n={flag.n} tone={flag.tone} className="absolute top-1/2 left-[0.6cqw] -translate-y-1/2" />
            <span aria-hidden className={cn("absolute inset-0", flagRing(flag.tone))} />
          </>
        )}
      </div>
    );
  };

  return (
    <div ref={box} className="absolute inset-0 isolate overflow-auto bg-casScreen font-casui text-[calc(4cqw*var(--axiom-text,1))] text-casInk scrollbar-thin">
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
  );
}
