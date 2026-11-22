// SPDX-License-Identifier: GPL-3.0-or-later
/**
 * Handheld Setup: the settings that belong to this browser rather than to a
 * document (Home → 5 Settings). The first two are the handheld's own; the
 * rest are Axiom's, added after them so the fields keep their places. Saved
 * as axiom.setup, which Restore Factory Defaults clears with the rest.
 */
import { DEFAULT_SETTINGS, type Settings } from "../engine/evaluate";
import { pref } from "./persist";

export type Setup = {
  text: "Small" | "Medium" | "Large";
  haptics: boolean;
  keypad: "ABC" | "QWERTY";
  /** On large screens only: a phone has no other way to type. */
  showKeypad: boolean;
  start: "Home" | "Last Document";
  /** System follows the computer's reduce-motion setting. */
  motion: "System" | "On" | "Off";
};

export const DEFAULT_SETUP: Setup = { text: "Medium", haptics: true, keypad: "ABC", showKeypad: true, start: "Home", motion: "System" };

export const TEXT_SCALE: Record<Setup["text"], number> = { Small: 0.88, Medium: 1, Large: 1.18 };

export const SETUP_OPTIONS = {
  text: ["Small", "Medium", "Large"],
  keypad: ["ABC", "QWERTY"],
  start: ["Home", "Last Document"],
  motion: ["System", "On", "Off"],
} as const satisfies Partial<Record<keyof Setup, readonly string[]>>;

const pick = <T extends string>(options: readonly T[], v: string | undefined, fallback: T): T => (options.includes(v as T) ? (v as T) : fallback);

/** The saved setup, with Axiom's newer settings filled in for a setup saved before they existed. */
export function loadSetup(): Setup {
  return { ...DEFAULT_SETUP, ...pref<Partial<Setup>>("setup", {}) };
}

/** The Handheld Setup wizard's answer, `setup:{text}:{haptics}:{keypad}:{showKeypad}:{start}:{motion}`; anything unknown stays at its default. */
export function parseSetup(built: string): Setup {
  const [text, haptics, keypad, showKeypad, start, motion] = built.replace(/^setup:/, "").split(":");
  return {
    text: pick(SETUP_OPTIONS.text, text, DEFAULT_SETUP.text),
    haptics: haptics === undefined ? DEFAULT_SETUP.haptics : haptics === "Yes",
    keypad: pick(SETUP_OPTIONS.keypad, keypad, DEFAULT_SETUP.keypad),
    showKeypad: showKeypad === undefined ? DEFAULT_SETUP.showKeypad : showKeypad === "Yes",
    start: pick(SETUP_OPTIONS.start, start, DEFAULT_SETUP.start),
    motion: pick(SETUP_OPTIONS.motion, motion, DEFAULT_SETUP.motion),
  };
}

/** Document Settings' Make Default: what a new document starts with. */
export function docDefaults(): Settings {
  return { ...DEFAULT_SETTINGS, ...pref<Partial<Settings>>("docDefaults", {}) };
}
