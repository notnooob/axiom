// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 VCE Hub. Part of the /cas calculator: https://github.com/vcehub/cas
import { ins, type Menu } from "./types";

/**
 * The keypad's panels, with the column count of the grid the handheld shows
 * them in. A panel without one
 * opens as a list.
 */
export type Panel = { items: Menu; cols?: number };

/** The trig key: the six functions over their inverses. */
export const trigPanel: Panel = {
  items: ["sin", "cos", "tan", "csc", "sec", "cot", "sin⁻¹", "cos⁻¹", "tan⁻¹", "csc⁻¹", "sec⁻¹", "cot⁻¹"].map((f) =>
    ins(f, `${f}(`),
  ),
  cols: 6,
};

/** ctrl =: the inequalities and the with operator. */
export const relationsPanel: Panel = { items: [">", "<", "≠", "≥", "≤", "|"].map((c) => ins(c, c)), cols: 3 };

/** π▸: the constants over the angle marks: degrees, radians (ʳ) and gradians (ᵍ). */
export const constantsPanel: Panel = {
  items: [ins("π", "π"), ins("𝑖", "i"), ins("∞", "∞"), ins("ℯ", "ℯ"), ins("θ", "θ"), ins("°", "°"), ins("r", "ʳ"), ins("g", "ᵍ"), ins("'", "'")],
  cols: 5,
};

/** ?!▸: punctuation (its grid isn't known yet, so a list). */
export const punctuationPanel: Panel = {
  items: ["?", "!", "$", "%", "'", '"', ":", ";", "_", "#", "&", "@", "\\"].map((c) => ins(c, c)),
};
