// SPDX-License-Identifier: GPL-3.0-or-later
/**
 * The assistant's highlights on the screen (ai/highlights.ts): a ring round
 * what it marks and a round numbered badge, crimson for a mistake and amber
 * for something to look at. Sized in cqw, so they scale with the screen. The
 * badge is hidden from screen readers: highlights are read out when they're set.
 */
import type { CSSProperties } from "react";
import { palette } from "@/shared/lib/tokens";
import { cn } from "@/shared/lib/utils";
import type { HighlightTone } from "../ai/highlights";

/** What a page's view needs to draw one highlight. */
export type Flag = { n: number; tone: HighlightTone };

/** An inset ring for an element that's position: relative or fills its box. */
export const flagRing = (tone: HighlightTone) =>
  cn("pointer-events-none ring-[length:0.6cqw] ring-inset", tone === "look" ? "ring-casLook" : "ring-casFlag");

/** The colour itself, for canvas and SVG drawing. */
export const flagHex = (tone: HighlightTone) => (tone === "look" ? palette.casLook : palette.casFlag);

export function FlagBadge({ n, tone, className, style }: Flag & { className?: string; style?: CSSProperties }) {
  return (
    <span
      aria-hidden
      style={style}
      className={cn(
        "pointer-events-none z-20 grid size-[3.8cqw] shrink-0 place-items-center rounded-full font-casui text-[2.6cqw] leading-none font-semibold text-white shadow-[0_0_0_0.3cqw_white]",
        tone === "look" ? "bg-casLook" : "bg-casFlag",
        className,
      )}
    >
      {n}
    </span>
  );
}
