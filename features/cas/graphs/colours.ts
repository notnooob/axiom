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
