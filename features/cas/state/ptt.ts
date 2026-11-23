// SPDX-License-Identifier: GPL-3.0-or-later
/**
 * Press-to-Test, the handheld's exam mode. While it's on, the student's
 * documents are put away (My Documents, the Scratchpad and the recent list
 * use their own test storage), the restrictions chosen on entering apply,
 * and the screen shows a lock and when the test started, so whoever is
 * supervising can see it at a glance. Ending it deletes what was made
 * during the test and brings the documents back.
 *
 * The state is read once as the app loads: entering and ending reload the
 * page, so every part of the app starts in the right storage. A browser
 * can't stop a student clearing its data the way the handheld's hardware
 * can: what this gives a supervisor is a clear, hard-to-fake signal.
 */

export type PressToTest = {
  /** When it started (ms since 1970). */
  since: number;
  angle: "rad" | "deg";
  noIsPrime: boolean;
  noVectors: boolean;
  no3d: boolean;
  noPython: boolean;
  /** Not on the handheld, which has no assistant: Axiom's AI chat and WebMCP tools. */
  noAssistant: boolean;
};

const KEY = "axiom.ptt";

function read(): PressToTest | null {
  try {
    const raw = window.localStorage.getItem(KEY);
    const p = raw ? (JSON.parse(raw) as PressToTest) : null;
    return p && typeof p.since === "number" ? p : null;
  } catch {
    return null;
  }
}

/** Press-to-Test as the page loaded: null when it's off. */
export const PTT: PressToTest | null = typeof window === "undefined" ? null : read();

/** Turn Press-to-Test on (or off, with null); the caller reloads the page. */
export function setPtt(p: PressToTest | null): boolean {
  try {
    if (p) window.localStorage.setItem(KEY, JSON.stringify(p));
    else window.localStorage.removeItem(KEY);
    return true;
  } catch {
    return false;
  }
}

/** The restrictions as the entry dialog lists them, with each one's default. */
export const PTT_OPTIONS = [
  { key: "noIsPrime", label: "Disable isPrime", on: true },
  { key: "noVectors", label: "Disable Vector Functions", on: true },
  { key: "no3d", label: "Disable 3D Graphing", on: true },
  { key: "noPython", label: "Disable Python", on: true },
  { key: "noAssistant", label: "Disable the Assistant", on: true },
] as const satisfies readonly { key: keyof PressToTest; label: string; on: boolean }[];

/** The entry dialog's result: "ptt:<angle>:<Yes|No>…" in PTT_OPTIONS order. */
export function parsePtt(built: string, now = Date.now()): PressToTest {
  const [angle, ...checks] = built.replace(/^ptt:/, "").split(":");
  const p: PressToTest = { since: now, angle: angle === "Degree" ? "deg" : "rad", noIsPrime: false, noVectors: false, no3d: false, noPython: false, noAssistant: false };
  PTT_OPTIONS.forEach((o, i) => (p[o.key] = checks[i] === "Yes"));
  return p;
}

/** Commands the calculator refuses during the test. */
export function blockedCommands(p: PressToTest | null): Set<string> {
  const out = new Set<string>();
  if (!p) return out;
  if (p.noIsPrime) out.add("isPrime");
  if (p.noVectors) for (const c of ["unitV", "crossP", "dotP"]) out.add(c);
  return out;
}

/** What the restrictions are, one line each, for Status and the entry message. */
export function pttLines(p: PressToTest): string[] {
  return [`Angle: ${p.angle === "deg" ? "Degree" : "Radian"}`, ...PTT_OPTIONS.filter((o) => p[o.key]).map((o) => o.label)];
}

/** "since 10:42", and how long ago. */
export function pttSince(p: PressToTest, now = Date.now()): string {
  const d = new Date(p.since);
  const time = d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  const mins = Math.max(0, Math.floor((now - p.since) / 60000));
  const ago = mins < 60 ? `${mins} min` : `${Math.floor(mins / 60)} h ${mins % 60} min`;
  const day = new Date(now).toDateString() === d.toDateString() ? "" : ` ${d.toLocaleDateString()}`;
  return `since ${time}${day} (${ago})`;
}
