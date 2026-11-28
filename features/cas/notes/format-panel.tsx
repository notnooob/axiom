// SPDX-License-Identifier: GPL-3.0-or-later
/**
 * Notes ▸ Format text…: the handheld's Format Text panel. A font list
 * (TI-Nspire Sans, or the serif TI-Nspire) and a size list over six buttons:
 * Bold, Italic, Underline, Superscript, Subscript and Strikethrough. It acts
 * on the selected text and stays open until it's closed (Esc or its ×).
 * Tab and the arrows move between its controls, ► opens a list, Enter
 * presses a button or picks from a list.
 */
import { useRef, type ReactNode } from "react";
import { cn } from "@/shared/lib/utils";
import type { Key } from "../keys";
import { DropArrow, DropdownList, listKeyPress, openList, type ListState } from "../menus/dropdown";

export const FONTS = ["TI-Nspire Sans", "TI-Nspire"] as const;
export const SIZES = ["7", "9", "10", "11", "12", "16", "24"] as const;
/** The buttons, in the panel's order (two rows of three), as the editor's commands. */
export const BUTTONS = ["bold", "italic", "underline", "superscript", "subscript", "strikeThrough"] as const;
export type FormatButton = (typeof BUTTONS)[number];

/** focus: 0 the font, 1 the size, 2–7 the buttons; list: a list that's open. */
export type FormatPanelState = { focus: number; list: ListState | null };
export const openFormatPanel = (): FormatPanelState => ({ focus: 0, list: null });

export type FormatChoice = { font: (typeof FONTS)[number]; size: string; on: Record<FormatButton, boolean> };

/** A key while the panel is open: the next state (null closes it), and what to apply. */
export function formatPanelKey(s: FormatPanelState, key: Key, now: FormatChoice): { state: FormatPanelState | null; font?: string; size?: number; press?: FormatButton } {
  if (s.list) {
    const options = s.list.field === 0 ? FONTS : SIZES;
    const r = listKeyPress(s.list, options, key);
    if (r.pick !== undefined) return { state: { ...s, list: null }, ...(s.list.field === 0 ? { font: options[r.pick] } : { size: Number(options[r.pick]) }) };
    if (r.pass) return { state: { focus: (s.focus + 1) % 8, list: null } };
    return { state: { ...s, list: r.list } };
  }
  const f = s.focus;
  switch (key.k) {
    case "esc":
      return { state: null };
    case "tab":
      return { state: { ...s, focus: (f + 1) % 8 } };
    case "right":
      if (f < 2) return { state: { ...s, list: openList(f, f === 0 ? FONTS : SIZES, f === 0 ? now.font : now.size) } };
      return { state: { ...s, focus: f === 7 ? 2 : f + 1 } };
    case "left":
      return { state: { ...s, focus: f <= 2 ? f : f - 1 } };
    case "down":
      return { state: { ...s, focus: f < 2 ? f + 1 : f < 5 ? f + 3 : f } };
    case "up":
      return { state: { ...s, focus: f === 0 ? 0 : f <= 2 ? f - 1 : f < 5 ? 1 : f - 3 } };
    case "enter":
      if (f < 2) return { state: { ...s, list: openList(f, f === 0 ? FONTS : SIZES, f === 0 ? now.font : now.size) } };
      return { state: s, press: BUTTONS[f - 2] };
    default:
      return { state: s };
  }
}

/** The buttons' faces: the letters the handheld draws, in our own drawing. */
const FACES: Record<FormatButton, ReactNode> = {
  bold: <span className="font-casmath font-bold">B</span>,
  italic: <span className="font-casmath italic">I</span>,
  underline: <span className="font-casmath underline decoration-[#2f5fd0] decoration-[0.25cqw] underline-offset-[0.6cqw]">U</span>,
  superscript: (
    <span className="font-casmath font-bold">
      A<sup className="text-[#2f5fd0]">a</sup>
    </span>
  ),
  subscript: (
    <span className="font-casmath font-bold">
      A<sub className="text-[#2f5fd0]">a</sub>
    </span>
  ),
  strikeThrough: <span className="font-casmath text-[0.8em] line-through">ABC</span>,
};
const NAMES: Record<FormatButton, string> = { bold: "Bold", italic: "Italic", underline: "Underline", superscript: "Superscript", subscript: "Subscript", strikeThrough: "Strikethrough" };

export function FormatPanel({
  state,
  now,
  root,
  onState,
  onFont,
  onSize,
  onPress,
  onClose,
}: {
  state: FormatPanelState;
  now: FormatChoice;
  /** What the lists open over (the page), so they aren't cut off by the panel. */
  root: HTMLElement | null;
  onState: (s: FormatPanelState) => void;
  onFont: (font: string) => void;
  onSize: (size: number) => void;
  onPress: (b: FormatButton) => void;
  onClose: () => void;
}) {
  const fields = useRef<(HTMLElement | null)[]>([]);
  // Pressing in the panel keeps the text's selection: nothing here takes focus.
  const keep = (e: React.MouseEvent) => e.preventDefault();
  const field = (i: 0 | 1, value: string, wide: boolean) => (
    <button
      ref={(el) => {
        fields.current[i] = el;
      }}
      type="button"
      onMouseDown={keep}
      onClick={() => onState({ focus: i, list: state.list ? null : openList(i, i === 0 ? FONTS : SIZES, value) })}
      aria-label={`${i === 0 ? "Font" : "Size"}: ${value}`}
      className={cn(
        "flex items-center justify-between border-[0.3cqw] bg-white text-left",
        wide ? "w-[38cqw]" : "w-[14cqw]",
        state.focus === i ? "border-[#3b78d8]" : "border-casInk",
      )}
    >
      <span className={cn("px-[1.2cqw] py-[0.6cqw]", i === 0 && "text-casLabel")}>{value}</span>
      <span className="flex self-stretch items-center border-l-[0.3cqw] border-inherit px-[1.2cqw]">
        <DropArrow open={state.list?.field === i} />
      </span>
    </button>
  );
  return (
    <div
      role="dialog"
      aria-label="Format Text"
      onMouseDown={keep}
      className="absolute right-[3cqw] top-[2cqw] z-30 w-[44cqw] bg-white px-[2cqw] pb-[2.4cqw] pt-[1.4cqw] font-casui text-[3.6cqw] text-casInk shadow-[0_0.6cqw_2cqw_rgba(0,0,0,0.3)]"
    >
      <div className="mb-[1.6cqw] flex items-center justify-between">
        <span className="text-[4cqw] font-semibold">Format Text</span>
        <button type="button" aria-label="Close" onMouseDown={keep} onClick={onClose} className="px-[0.6cqw] text-[5cqw] leading-none">
          ×
        </button>
      </div>
      <div className="flex flex-col gap-[1.6cqw]">
        {field(0, now.font, true)}
        {field(1, now.size, false)}
      </div>
      <div className="mt-[2cqw] grid grid-cols-3 gap-y-[1.6cqw] text-[5cqw]">
        {BUTTONS.map((b, i) => (
          <button
            key={b}
            type="button"
            aria-label={NAMES[b]}
            aria-pressed={now.on[b]}
            onMouseDown={keep}
            onClick={() => {
              onState({ focus: i + 2, list: null });
              onPress(b);
            }}
            className={cn(
              "mx-auto flex h-[7cqw] w-[9cqw] items-center justify-center rounded-[0.6cqw] border-[0.3cqw]",
              state.focus === i + 2 ? "border-[#3b78d8]" : "border-transparent",
              now.on[b] && "bg-casSelectSoft",
            )}
          >
            {FACES[b]}
          </button>
        ))}
      </div>
      {state.list && (
        <DropdownList
          root={root}
          anchor={fields.current[state.list.field] ?? null}
          options={state.list.field === 0 ? FONTS : SIZES}
          sel={state.list.sel}
          label={state.list.field === 0 ? "Font" : "Size"}
          onPick={(i) => {
            const f = state.list!.field;
            onState({ focus: f, list: null });
            if (f === 0) onFont(FONTS[i]!);
            else onSize(Number(SIZES[i]));
          }}
          onHighlight={(i) => onState({ ...state, list: { ...state.list!, sel: i } })}
          onClose={() => onState({ ...state, list: null })}
        />
      )}
    </div>
  );
}
