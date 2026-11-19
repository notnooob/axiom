// SPDX-License-Identifier: GPL-3.0-or-later
/**
 * The assistant's modes: how much it does for the student. Solve works the
 * whole calculator; Exam works it only the way a student would in a CAS-active
 * exam; Guide coaches while the student presses the keys; Check marks their
 * working. Each mode limits which tools the model is given (streamText's
 * activeTools), so the limit holds whatever the model decides; the prompt says
 * how to behave in each.
 */

export type Mode = "solve" | "exam" | "guide" | "check";

export type ModeInfo = {
  label: string;
  /** One line in the mode menu. */
  blurb: string;
  /** The chat's empty state in this mode. */
  title: string;
  /** Under the title: what happens in this mode. */
  description: string;
  suggestions: string[];
};

export const MODES: Record<Mode, ModeInfo> = {
  solve: {
    label: "Solve",
    blurb: "Works it all out on the calculator, with every app",
    title: "What are we solving?",
    description: "Paste a question or a screenshot. The working happens on the calculator, so you can follow it.",
    suggestions: ["Solve x² − 5x + 6 = 0 and graph it", "Find the turning points of f(x) = x³ − 3x", "Explain what's on this page"],
  },
  exam: {
    label: "Exam",
    blurb: "Shows how you'd do it in the exam: the keys, and what to write",
    title: "Which question? I'll do it the exam way.",
    description: "Each step comes with the keys to press and the lines to write on paper, using only what you'd use in the exam.",
    suggestions: ["X ~ Bi(12, 0.3). Find P(X ≥ 5)", "Find the area between y = x² and y = 2x", "Solve 2sin(x) = 1 for x in [0, 2π]"],
  },
  guide: {
    label: "Guide",
    blurb: "You press the keys and write the working; it coaches one step at a time",
    title: "What are you working on? I'll coach you through it.",
    description: "You press the keys and write the working. One step or hint at a time, checked as you go; mistakes are highlighted on the calculator.",
    suggestions: ["Walk me through finding a turning point by hand", "Help me set up a normal distribution question", "I'm stuck on this question"],
  },
  check: {
    label: "Check",
    blurb: "Marks your working, on the calculator or in a photo, and highlights mistakes",
    title: "Show me your working and I'll mark it.",
    description: "Point to your working on the calculator, or attach a photo of it. The first mistake is named and highlighted, with the marks the rest would still earn.",
    suggestions: ["Check the working on this page", "Is my answer on this page right?", "Mark my working (attach a photo)"],
  },
};

export const MODE_IDS = Object.keys(MODES) as Mode[];

/** Never in Exam mode: what a student wouldn't use in an exam, and side checks they can't see. */
const NOT_IN_EXAM = new Set(["python", "write_notes", "construct_geometry", "evaluate"]);

/**
 * The tools a mode may call. all: every tool with whether it only looks.
 * Guide and Check never change the calculator: they look, highlight and ask.
 * Check may also work things out (evaluate) to mark against.
 */
export function allowedTools(mode: Mode, all: { name: string; readOnly?: boolean }[]): string[] {
  const names = all.map((t) => t.name);
  switch (mode) {
    case "solve":
      return names;
    case "exam":
      return names.filter((n) => !NOT_IN_EXAM.has(n));
    case "guide":
      return all.filter((t) => (t.readOnly && t.name !== "evaluate") || t.name === "highlight" || t.name === "ask_user").map((t) => t.name);
    case "check":
      return all.filter((t) => t.readOnly || t.name === "highlight" || t.name === "ask_user").map((t) => t.name);
  }
}

/**
 * The settings' "Let the assistant change the calculator" off: of a mode's
 * tools, only those that look, plus highlight (rings that are never saved)
 * and ask_user.
 */
export function restrictToReadOnly(names: string[], all: { name: string; readOnly?: boolean }[]): string[] {
  const looks = new Set(all.filter((t) => t.readOnly || t.name === "highlight" || t.name === "ask_user").map((t) => t.name));
  return names.filter((n) => looks.has(n));
}

/** The mode a saved setting means; an older setting's tutor: true is Guide. */
export function modeOf(c: { mode?: string; tutor?: boolean }): Mode {
  if (c.mode && c.mode in MODES) return c.mode as Mode;
  return c.tutor ? "guide" : "solve";
}
