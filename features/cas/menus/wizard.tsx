// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 VCE Hub. Part of the /cas calculator: https://github.com/vcehub/cas
import { useEffect, useRef, useState } from "react";
import { cn } from "@/shared/lib/utils";
import type { Key } from "../keys";
import { DropArrow, DropdownList, listKeyPress, openList, type ListState } from "./dropdown";
import type { MenuAction } from "./types";

/**
 * Wizard dialogs ("Normal Cdf…", "Solve System of Equations…"): labelled
 * fields, Tab or the arrows between them, Enter for OK. OK pastes the built
 * command into the entry line, as the handheld does. A dropdown field opens
 * its list with ► or a click (dropdown.tsx), as on the handheld.
 */
type Wizard = Extract<MenuAction, { kind: "wizard" }>;
/** `fresh`: the focused field's contents are selected, so typing replaces them. `list`: a dropdown's open list. */
export type WizardState = { wizard: Wizard; values: string[]; focus: number; fresh: boolean; list?: ListState | null; back?: WizardState };

export const openWizard = (wizard: Wizard): WizardState => ({
  wizard,
  values: wizard.fields.map((f) => f.value ?? f.options?.[0] ?? ""),
  focus: 0,
  fresh: true,
});

/** The command text a filled-in wizard builds, empty trailing arguments dropped. */
export function buildWizard(w: WizardState): string {
  // Any number of fields: a long Hide/Show lists every object.
  const value = (i: number) => {
    const f = w.wizard.fields[i];
    const v = w.values[i]?.trim() ?? "";
    // A worded choice puts its code in the command.
    const at = f?.codes && f.options ? f.options.indexOf(v) : -1;
    return at >= 0 ? f!.codes![at]! : v;
  };
  let out = w.wizard.build.replace(/\{(\d+)\}/g, (_, i: string) => value(Number(i)));
  // Blank arguments at the end of a call or a command (before ":" or the end) are dropped.
  out = out.replace(/,+\)/g, ")").replace(/,+(?=\s*(:|$))/g, "");
  return out;
}

/** Choose option i of the open list's field, and close the list. */
export function wizardPick(w: WizardState, i: number): WizardState {
  const l = w.list;
  const v = l ? w.wizard.fields[l.field]?.options?.[i] : undefined;
  if (!l || v === undefined) return { ...w, list: null };
  return { ...w, list: null, focus: l.field, fresh: true, values: w.values.map((x, k) => (k === l.field ? v : x)) };
}

/** The first required field left empty, as the handheld's Input Error names it, or null. */
export function missingField(w: WizardState): string | null {
  const i = w.wizard.fields.findIndex((f, k) => f.required && !w.values[k]?.trim());
  return i < 0 ? null : `Input Error: Required field is empty! Field # ${i + 1}: ${w.wizard.fields[i]!.label}`;
}

export function wizardKeyPress(w: WizardState, key: Key): { state: WizardState | null; done?: string; error?: string } {
  if (w.list) {
    const r = listKeyPress(w.list, w.wizard.fields[w.list.field]?.options ?? [], key);
    if (r.pick !== undefined) return { state: wizardPick(w, r.pick) };
    if (!r.pass) return { state: { ...w, list: r.list } };
    w = { ...w, list: null };
  }
  const field = w.wizard.fields[w.focus];
  const set = (v: string) => ({ state: { ...w, fresh: false, values: w.values.map((x, i) => (i === w.focus ? v : x)) } });
  const current = w.fresh ? "" : (w.values[w.focus] ?? "");
  const n = w.wizard.fields.length;
  switch (key.k) {
    case "esc":
      return { state: w.back ?? null };
    case "enter": {
      const missing = missingField(w);
      if (missing) return { state: w, error: missing };
      if (w.wizard.then) return { state: { ...openWizard(w.wizard.then(w.values)), back: w } };
      return { state: null, done: buildWizard(w) };
    }
    case "tab":
    case "down":
    case "up": {
      // A greyed field is passed over.
      const d = key.k === "up" ? -1 : 1;
      let f = w.focus;
      for (let i = 0; i < n; i++) {
        f = (f + d + n) % n;
        if (!w.wizard.fields[f]?.disabled) break;
      }
      return { state: { ...w, focus: f, fresh: true } };
    }
    case "left":
    case "right":
      if (field?.check) return set(w.values[w.focus] === "Yes" ? "No" : "Yes");
      // ► opens a dropdown's list; ◄ does nothing to it, as on the handheld.
      if (key.k === "right" && field?.options?.length) return { state: { ...w, list: openList(w.focus, field.options, w.values[w.focus] ?? "") } };
      return { state: w };
    case "backspace":
      return field?.check || (field?.options && !field.free) ? { state: w } : set(current.slice(0, -1));
    case "char":
      if (field?.check) return key.c === " " ? set(w.values[w.focus] === "Yes" ? "No" : "Yes") : { state: w };
      return field?.options && !field.free ? { state: w } : set(current + key.c);
    case "text":
      return field?.check || (field?.options && !field.free) ? { state: w } : set(current + key.text);
    default:
      return { state: w };
  }
}

export function WizardDialog({
  state,
  onFocus,
  onOk,
  onCancel,
  onArrow,
  onPick,
  onHighlight,
  onCloseList,
}: {
  state: WizardState;
  onFocus: (i: number) => void;
  onOk: () => void;
  onCancel: () => void;
  /** ► on field i: a dropdown's list opens, a checkbox toggles. */
  onArrow: (i: number) => void;
  /** An option clicked in the open list. */
  onPick: (i: number) => void;
  onHighlight: (i: number) => void;
  onCloseList: () => void;
}) {
  const arrows = state.wizard.arrows ?? true;
  const fields = useRef<HTMLDivElement>(null);
  // The whole screen: the open list is drawn over it, not cut off by the dialog.
  const [root, setRoot] = useState<HTMLDivElement | null>(null);
  const list = state.list;
  const listField = list ? state.wizard.fields[list.field] : undefined;
  // A long dialog (Document Settings) scrolls; keep the focused field in view.
  useEffect(() => {
    const box = fields.current;
    const el = box?.querySelector<HTMLElement>(`[data-field="${state.focus}"]`);
    if (!box || !el) return;
    if (el.offsetTop < box.scrollTop) box.scrollTop = el.offsetTop - 4;
    else if (el.offsetTop + el.offsetHeight > box.scrollTop + box.clientHeight)
      box.scrollTop = el.offsetTop + el.offsetHeight - box.clientHeight + 4;
  }, [state.focus]);
  // A box floating over the page, as on the handheld, with a flat offset shadow.
  return (
    <div ref={setRoot} className="absolute inset-0 flex items-start justify-center py-[3.4cqw] font-casui text-[3.9cqw]">
      <div className="relative flex max-h-full w-[76%] animate-pop">
        <div aria-hidden className="absolute inset-0 translate-x-[0.6cqw] translate-y-[0.6cqw] bg-casRule" />
        <div role="dialog" aria-label={state.wizard.title} className="relative flex min-h-0 w-full flex-col border border-casRule bg-casScreen">
          <div className="px-[2cqw] pb-[2.4cqw] pt-[1.6cqw] text-[4.3cqw] font-bold">{state.wizard.title}</div>
          {state.wizard.note && <div className="-mt-[1cqw] px-[2cqw] pb-[1.8cqw] text-casLabel">{state.wizard.note}</div>}
          <div
            ref={fields}
            data-scroll
            className="relative grid min-h-0 grid-cols-[auto_1fr] items-center gap-x-[2cqw] gap-y-[1.8cqw] overflow-y-auto px-[2cqw] py-[0.4cqw] scrollbar-thin"
          >
            {state.wizard.fields.map((f, i) =>
              f.check ? (
                <button
                  key={f.label}
                  type="button"
                  tabIndex={-1}
                  role="checkbox"
                  aria-checked={state.values[i] === "Yes"}
                  data-field={i}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => {
                    onFocus(i);
                    onArrow(i);
                  }}
                  className={cn(
                    "col-span-2 flex items-center gap-[1.4cqw] justify-self-start border-[0.4cqw] p-[0.6cqw] text-casLabel",
                    i === state.focus ? "border-casSelect" : "border-transparent",
                  )}
                >
                  <CheckBox on={state.values[i] === "Yes"} />
                  {f.label}
                </button>
              ) : (
              <div key={f.label} className={cn("contents", f.disabled && "[&>*]:pointer-events-none [&>*]:opacity-45")}>
                <label className={cn("whitespace-nowrap text-casLabel", f.stacked ? "col-span-2 text-left" : "text-right")}>{f.label}</label>
                <button
                  type="button"
                  tabIndex={-1}
                  data-field={i}
                  aria-disabled={f.disabled || undefined}
                  {...(f.options ? { "aria-haspopup": "listbox" as const, "aria-expanded": list?.field === i } : {})}
                  onMouseDown={(e) => e.preventDefault()}
                  // A click on a dropdown opens its list, as on the handheld; a field that also takes typing opens it from its arrow.
                  onClick={() => (f.options && !f.free ? onArrow(i) : onFocus(i))}
                  className={cn(
                    "flex h-[6.6cqw] items-center justify-between text-left",
                    f.stacked && "col-span-2",
                    i === state.focus ? "border-[0.4cqw] border-casSelect" : "border-[0.25cqw] border-casInk",
                  )}
                >
                  <span className="flex min-w-0 flex-1 items-center px-[1.2cqw]">
                    <span className={cn(list?.field === i ? "text-casLabel" : i === state.focus && state.fresh && state.values[i] && "bg-casSelectSoft")}>
                      {state.values[i] || (f.hint && i !== state.focus && <span className="text-casDim">{f.hint}</span>)}
                    </span>
                    {i === state.focus && !list && !(f.options && !f.free) && (
                      <span className="ml-px h-[4cqw] w-px bg-casInk motion-safe:animate-casblink" />
                    )}
                  </span>
                  {(arrows || f.options) && (
                    <span
                      onClick={(e) => {
                        e.stopPropagation();
                        onFocus(i);
                        if (f.options) onArrow(i);
                      }}
                      className="flex h-full w-[5cqw] shrink-0 items-center justify-center border-l-[0.25cqw] border-casInk"
                    >
                      <DropArrow open={list?.field === i} />
                    </span>
                  )}
                </button>
              </div>
              ),
            )}
          </div>
          <div className="flex justify-end gap-[2cqw] px-[2cqw] pb-[2cqw] pt-[2.4cqw]">
            <button
              type="button"
              tabIndex={-1}
              onMouseDown={(e) => e.preventDefault()}
              onClick={onOk}
              className="border-[0.25cqw] border-casRule px-[4.4cqw] py-[1cqw]"
            >
              OK
            </button>
            <button
              type="button"
              tabIndex={-1}
              onMouseDown={(e) => e.preventDefault()}
              onClick={onCancel}
              className="px-[2cqw] py-[1cqw]"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
      {list && listField?.options && (
        <DropdownList
          root={root}
          anchor={root?.querySelector<HTMLElement>(`[data-field="${list.field}"]`) ?? null}
          options={listField.options}
          sel={list.sel}
          label={listField.label.replace(/:$/, "")}
          onPick={onPick}
          onHighlight={onHighlight}
          onClose={onCloseList}
        />
      )}
    </div>
  );
}

/** The handheld's checkbox: a square, with a tick when on. */
export function CheckBox({ on }: { on: boolean }) {
  return (
    <svg aria-hidden viewBox="0 0 10 10" className="h-[4cqw] w-[4cqw] shrink-0">
      <rect x="0.5" y="0.5" width="9" height="9" fill="none" stroke="currentColor" strokeWidth={0.8} className="text-casInk" />
      {on && <path d="M2 5.2 L4.2 7.4 L8.2 2.6" fill="none" strokeWidth={1.3} className="stroke-casSelect" />}
    </svg>
  );
}
