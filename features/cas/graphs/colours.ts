// SPDX-License-Identifier: GPL-3.0-or-later
/** The colours the Attributes dialogs offer (Graphs' functions, Geometry's objects), by the names they list. */
import { palette } from "@/shared/lib/tokens";

export const NAMED_COLOURS: Record<string, string> = {
  Blue: palette.casF1,
  Red: palette.casF2,
  Green: palette.casF3,
  Orange: palette.casF4,
  Purple: palette.casF5,
  Teal: palette.casF6,
  Black: palette.casInk,
};

/** The Colour field's choices: Auto (the default) first. */
export const COLOUR_OPTIONS = ["Auto", ...Object.keys(NAMED_COLOURS)];

/** Line Weight as a multiple of the usual width, and Line Style as a dash pattern (px). */
export const weightFactor = (w?: string) => (w === "Thin" ? 0.6 : w === "Thick" ? 1.9 : 1);
export const dashPattern = (s?: string): number[] => (s === "Dotted" ? [1.5, 4] : s === "Dashed" ? [8, 5] : []);

/**
 * Set Conditions' colour numbers, 1 to 15, in the order its Colors… list
 * shows them: an expression's value picks the colour.
 */
export const CONDITION_COLOURS = [
  "#000080", "#0000ff", "#3399ff", "#008000", "#993300",
  "#ff00ff", "#ff0000", "#ff9933", "#ffff00", "#ffffff",
  "#e0e0e0", "#c0c0c0", "#808080", "#555555", "#000000",
];
/** The colour a condition's value names, or undefined outside 1–15. */
export const conditionColour = (v: number): string | undefined => (Number.isFinite(v) ? CONDITION_COLOURS[Math.round(v) - 1] : undefined);
