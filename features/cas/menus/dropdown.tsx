// SPDX-License-Identifier: GPL-3.0-or-later
/**
 * A dialog's dropdown list, as the handheld draws it: ► (or a click) opens
 * the list under the field, ▲▼ move the highlight, Enter picks, Esc or ◄
 * closes it unchanged, and a letter jumps to the next option starting with
 * it. A list taller than the room under the field scrolls, and opens above
 * the field if there's more room there. Used by wizards (wizard.tsx) and the
 * Finance Solver.
 */
import { useLayoutEffect, useRef, useState } from "react";
import { cn } from "@/shared/lib/utils";
import type { Key } from "../keys";

/** An open list: which field it belongs to and the highlighted option. */
export type ListState = { field: number; sel: number };

export const openList = (field: number, options: readonly string[], value: string): ListState => ({
  field,
  sel: Math.max(0, options.indexOf(value)),
});

/**
 * A key while the list is open. pick: the option chosen (the list closes).
 * pass: the list closed and the key still belongs to the dialog (Tab moves on).
 */
export function listKeyPress(l: ListState, options: readonly string[], key: Key): { list: ListState | null; pick?: number; pass?: boolean } {
  const n = options.length;
  if (!n) return { list: null };
  switch (key.k) {
    case "up":
      return { list: { ...l, sel: (l.sel - 1 + n) % n } };
    case "down":
      return { list: { ...l, sel: (l.sel + 1) % n } };
    case "home":
      return { list: { ...l, sel: 0 } };
    case "end":
      return { list: { ...l, sel: n - 1 } };
    case "enter":
      return { list: null, pick: l.sel };
    case "esc":
    case "left":
      return { list: null };
    case "tab":
      return { list: null, pass: true };
    case "char": {
      const c = key.c.toLowerCase();
      for (let k = 1; k <= n; k++) {
        const i = (l.sel + k) % n;
        if (options[i]!.toLowerCase().startsWith(c)) return { list: { ...l, sel: i } };
      }
      return { list: l };
    }
    default:
      return { list: l };
  }
}

/** The field's arrow: ▸ while the list is shut, ▼ while it's open. */
export function DropArrow({ open }: { open: boolean }) {
  return open ? (
    <svg aria-hidden viewBox="0 0 10 6" className="w-[2.4cqw]">
      <path d="M0.5 0.5 L9.5 0.5 L5 5.5 Z" fill="currentColor" />
    </svg>
  ) : (
    <svg aria-hidden viewBox="0 0 6 10" className="h-[2cqw]">
      <path d="M0.5 0.5 L5.5 5 L0.5 9.5 Z" fill="currentColor" />
    </svg>
  );
}

type Place = { left: number; width: number; top?: number; bottom?: number; maxHeight: number };

/**
 * The open list, drawn over the whole screen (root) so it isn't cut off by
 * the dialog. anchor: the field it hangs from. Clicking anywhere else closes it.
 */
export function DropdownList({
  root,
  anchor,
  options,
  sel,
  label,
  onPick,
  onHighlight,
  onClose,
}: {
  root: HTMLElement | null;
  anchor: HTMLElement | null;
  options: readonly string[];
  sel: number;
  label: string;
  onPick: (i: number) => void;
  /** The pointer moved onto option i: it becomes the one highlight, as the handheld's pointer does. */
  onHighlight: (i: number) => void;
  onClose: () => void;
}) {
  const list = useRef<HTMLDivElement>(null);
  const [place, setPlace] = useState<Place | null>(null);

  useLayoutEffect(() => {
    if (!root || !anchor) return;
    const measure = () => {
      const r = root.getBoundingClientRect();
      const a = anchor.getBoundingClientRect();
      // A row is as tall as the field; leave a small margin at the screen's edge.
      const margin = a.height * 0.15;
      const want = a.height * options.length;
      const below = r.bottom - a.bottom - margin;
      const above = a.top - r.top - margin;
      const up = below < Math.min(want, a.height * 3) && above > below;
      setPlace({
        left: a.left - r.left,
        width: a.width,
        ...(up ? { bottom: r.bottom - a.top } : { top: a.bottom - r.top }),
        maxHeight: Math.max(a.height, up ? above : below),
      });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(root);
    // The dialog's fields scroll: the list follows its field.
    const scroller = anchor.closest<HTMLElement>("[data-scroll]");
    scroller?.addEventListener("scroll", measure);
    return () => {
      ro.disconnect();
      scroller?.removeEventListener("scroll", measure);
    };
  }, [root, anchor, options.length]);

  // Keep the highlighted option in view as ▲▼ move it.
  useLayoutEffect(() => {
    const box = list.current;
    const el = box?.children[sel] as HTMLElement | undefined;
    if (!box || !el) return;
    if (el.offsetTop < box.scrollTop) box.scrollTop = el.offsetTop;
    else if (el.offsetTop + el.offsetHeight > box.scrollTop + box.clientHeight) box.scrollTop = el.offsetTop + el.offsetHeight - box.clientHeight;
  }, [sel, place]);

  return (
    <>
      <div
        aria-hidden
        className="absolute inset-0"
        onMouseDown={(e) => {
          e.preventDefault();
          onClose();
        }}
      />
      {place && (
        <div
          ref={list}
          role="listbox"
          aria-label={label}
          className="absolute overflow-y-auto border-[0.4cqw] border-casSelect bg-casScreen scrollbar-thin"
          style={{ left: place.left, width: place.width, top: place.top, bottom: place.bottom, maxHeight: place.maxHeight }}
        >
          {options.map((o, i) => (
            <div
              key={o}
              role="option"
              aria-selected={i === sel}
              onMouseDown={(e) => e.preventDefault()}
              onMouseMove={() => i !== sel && onHighlight(i)}
              onClick={() => onPick(i)}
              className={cn(
                "flex h-[6.2cqw] cursor-default items-center whitespace-nowrap px-[1.2cqw]",
                i === sel ? "bg-casSelect text-casScreen" : "text-casLabel",
              )}
            >
              {o}
            </div>
          ))}
        </div>
      )}
    </>
  );
}
