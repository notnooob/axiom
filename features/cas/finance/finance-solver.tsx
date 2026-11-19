// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 VCE Hub. Part of the /cas calculator: https://github.com/vcehub/cas
import { useEffect, useRef, useState } from "react";
import { cn } from "@/shared/lib/utils";
import { formatFloat } from "../engine/format";
import type { Key } from "../keys";
import { DropArrow, DropdownList, listKeyPress, openList, type ListState } from "../menus/dropdown";
import { solveTvm, type TvmField } from "./tvm";

/**
 * Finance Solver: a full-screen form of N,
 * I(%), PV, Pmt, FV, PpY, CpY and PmtAt. Enter on any of the first five
 * works it out from the others. Values stay between openings, as on the
 * handheld. Changing PpY sets CpY to match.
 */
type Field = { key: TvmField | "ppy" | "cpy" | "at"; label: string; help: string };

const FIELDS: Field[] = [
  { key: "n", label: "N:", help: "N: the number of payments" },
  { key: "i", label: "I(%):", help: "I(%): the yearly interest rate" },
  { key: "pv", label: "PV:", help: "PV: the present value" },
  { key: "pmt", label: "Pmt:", help: "Pmt: the payment each period" },
  { key: "fv", label: "FV:", help: "FV: the future value" },
  { key: "ppy", label: "PpY:", help: "PpY: payments a year" },
  { key: "cpy", label: "CpY:", help: "CpY: compounding periods a year" },
  { key: "at", label: "PmtAt:", help: "PmtAt: payments at the end or the start of each period" },
];

/**
 * `full` keeps a solved value at full precision behind its 12-digit display,
 * as the handheld does, so solving back for another field comes out exact.
 * Editing a field drops its full value.
 */
export type FinanceState = { values: string[]; full?: (number | undefined)[]; focus: number; fresh: boolean; list?: ListState | null };

/** PmtAt's dropdown. */
const AT = 7;
export const PMT_AT = ["END", "BEGIN"];

/** Choose PmtAt's option i from its open list. */
export function financePick(s: FinanceState, i: number): FinanceState {
  const v = PMT_AT[i];
  if (!s.list || v === undefined) return { ...s, list: null };
  return { ...s, list: null, focus: AT, fresh: true, values: s.values.map((x, k) => (k === AT ? v : x)) };
}

export const newFinance = (): FinanceState => ({
  values: ["0.", "0.", "0.", "0.", "0.", "1", "1", "END"],
  focus: 0,
  fresh: true,
});

/** Numbers as the handheld fills them in: up to 12 significant digits, with the decimal point. */
const show = (v: number) => formatFloat(v, 12);

export type FinanceResult = { state: FinanceState | null; error?: string };

export function financeKeyPress(s: FinanceState, key: Key): FinanceResult {
  if (s.list) {
    const r = listKeyPress(s.list, PMT_AT, key);
    if (r.pick !== undefined) return { state: financePick(s, r.pick) };
    if (!r.pass) return { state: { ...s, list: r.list } };
    s = { ...s, list: null };
  }
  const field = FIELDS[s.focus]!;
  const n = FIELDS.length;
  const set = (v: string): FinanceResult => {
    const values = s.values.map((x, i) => (i === s.focus ? v : x));
    const full = (s.full ?? []).map((x, i) => (i === s.focus ? undefined : x));
    // A new PpY brings CpY with it.
    if (field.key === "ppy") {
      values[6] = v;
      full[6] = undefined;
    }
    return { state: { ...s, values, full, fresh: false } };
  };
  const current = s.fresh ? "" : (s.values[s.focus] ?? "");
  switch (key.k) {
    case "esc":
      return { state: null };
    case "tab":
    case "down":
      return { state: { ...s, focus: (s.focus + 1) % n, fresh: true } };
    case "up":
      return { state: { ...s, focus: (s.focus - 1 + n) % n, fresh: true } };
    case "right":
      // ► opens PmtAt's list, as on the handheld.
      if (field.key === "at") return { state: { ...s, list: openList(AT, PMT_AT, s.values[AT] ?? "") } };
      return { state: s };
    case "backspace":
      return field.key === "at" ? { state: s } : set(current.slice(0, -1));
    case "char":
      return field.key === "at" ? { state: s } : set(current + key.c);
    case "text":
    case "paste":
      return field.key === "at" ? { state: s } : set(current + key.text);
    case "enter": {
      if (field.key === "ppy" || field.key === "cpy" || field.key === "at") {
        return { state: { ...s, focus: (s.focus + 1) % n, fresh: true } };
      }
      const num = (i: number) => s.full?.[i] ?? Number((s.values[i] ?? "").replace("−", "-"));
      const t = {
        n: num(0),
        i: num(1),
        pv: num(2),
        pmt: num(3),
        fv: num(4),
        ppy: num(5),
        cpy: num(6),
        begin: s.values[7] === "BEGIN",
      };
      const others = [0, 1, 2, 3, 4, 5, 6].filter((i) => i !== s.focus).map(num);
      if (others.some((v) => !Number.isFinite(v)) || !(t.ppy > 0) || !(t.cpy > 0)) {
        return { state: s, error: "Error: Invalid value" };
      }
      const v = solveTvm(t, field.key);
      if (!Number.isFinite(v)) return { state: s, error: "Error: No solution found" };
      const full = [...(s.full ?? [])];
      full[s.focus] = v;
      return { state: { ...s, values: s.values.map((x, i) => (i === s.focus ? show(v) : x)), full, fresh: true } };
    }
    default:
      return { state: s };
  }
}

export function FinanceSolver({
  state,
  onFocus,
  onOpenList,
  onPick,
  onHighlight,
  onCloseList,
}: {
  state: FinanceState;
  onFocus: (i: number) => void;
  /** PmtAt clicked: its list opens. */
  onOpenList: () => void;
  onPick: (i: number) => void;
  onHighlight: (i: number) => void;
  onCloseList: () => void;
}) {
  const list = useRef<HTMLDivElement>(null);
  const [root, setRoot] = useState<HTMLDivElement | null>(null);
  useEffect(() => {
    const box = list.current;
    const el = box?.querySelector<HTMLElement>(`[data-field="${state.focus}"]`);
    if (!box || !el) return;
    if (el.offsetTop < box.scrollTop) box.scrollTop = el.offsetTop - 4;
    else if (el.offsetTop + el.offsetHeight > box.scrollTop + box.clientHeight)
      box.scrollTop = el.offsetTop + el.offsetHeight - box.clientHeight + 4;
  }, [state.focus]);

  const field = FIELDS[state.focus]!;
  const solvable = state.focus < 5;
  return (
    <div
      ref={setRoot}
      role="dialog"
      aria-label="Finance Solver"
      className="absolute inset-0 flex animate-fade flex-col bg-casScreen font-casui text-[3.9cqw]"
    >
      <div className="border-b-[0.25cqw] border-casRule px-[1.4cqw] pb-[1.2cqw] pt-[1.4cqw] text-[4.3cqw] font-bold">
        Finance Solver
      </div>
      <div
        ref={list}
        data-scroll
        className="relative grid min-h-0 flex-1 grid-cols-[auto_1fr] items-center gap-x-[2cqw] gap-y-[1.8cqw] overflow-y-auto py-[1.4cqw] pl-[2cqw] pr-[3cqw] scrollbar-thin"
      >
        {FIELDS.map((f, i) => {
          const focused = i === state.focus;
          const spinner = f.key === "ppy" || f.key === "cpy";
          const at = f.key === "at";
          return (
            <div key={f.key} className="contents">
              <label className="whitespace-nowrap text-right text-casLabel">{f.label}</label>
              <button
                type="button"
                tabIndex={-1}
                data-field={i}
                {...(at ? { "aria-haspopup": "listbox" as const, "aria-expanded": Boolean(state.list) } : {})}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => (at ? onOpenList() : onFocus(i))}
                className={cn(
                  "flex h-[6.6cqw] items-center justify-between text-left",
                  focused ? "border-[0.4cqw] border-casSelect" : "border-[0.25cqw] border-casInk",
                )}
              >
                <span className={cn("flex min-w-0 flex-1 items-center px-[1.2cqw]", spinner && "justify-center")}>
                  <span className={cn(focused && state.fresh && !(at && state.list) && "bg-casSelectSoft", at && "text-casLabel")}>
                    {state.values[i]}
                  </span>
                  {focused && !at && (
                    <span className="ml-px h-[4cqw] w-px bg-casInk motion-safe:animate-casblink" />
                  )}
                </span>
                <span className="flex h-full w-[5cqw] shrink-0 items-center justify-center border-l-[0.25cqw] border-casInk">
                  {spinner ? (
                    <svg aria-hidden viewBox="0 0 6 10" className="h-[2cqw]">
                      <path d="M3 0.5 L5.5 4 L0.5 4 Z M3 9.5 L5.5 6 L0.5 6 Z" fill="currentColor" />
                    </svg>
                  ) : (
                    <DropArrow open={at && Boolean(state.list)} />
                  )}
                </span>
              </button>
            </div>
          );
        })}
      </div>
      <div className="flex h-[16cqw] shrink-0 flex-col items-center justify-center gap-[1.4cqw] border-t-[0.5cqw] border-casRule text-casLabel">
        {solvable && <span>Enter works this one out from the others</span>}
        <span>{field.help}</span>
      </div>
      {state.list && (
        <DropdownList
          root={root}
          anchor={root?.querySelector<HTMLElement>(`[data-field="${AT}"]`) ?? null}
          options={PMT_AT}
          sel={state.list.sel}
          label="PmtAt"
          onPick={onPick}
          onHighlight={onHighlight}
          onClose={onCloseList}
        />
      )}
    </div>
  );
}
