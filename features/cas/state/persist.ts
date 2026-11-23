// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 VCE Hub. Part of the /cas calculator: https://github.com/vcehub/cas
import type { Settings } from "../engine/evaluate";
import { bumpIds, type CasDocument } from "./document";
import { PTT } from "./ptt";

/**
 * The Scratchpad: the file-less document kept in this browser between visits
 * (pages, history, settings, and the definitions to replay into the engine).
 * Named documents live in My Documents (files/store.ts). Storage can be
 * missing or full (private windows, blocked site data), so every access is
 * guarded and the page works the same without it.
 */
// Press-to-Test has its own Scratchpad, and its own open document and recent files (state/ptt.ts).
const KEY = PTT ? "axiom.ptt.scratchpad" : "axiom.scratchpad";
const TEST_PREFS = new Set(["current", "recent"]);
const prefKey = (key: string) => `axiom.${PTT && TEST_PREFS.has(key) ? `ptt.${key}` : key}`;

/** Press-to-Test's ending: its Scratchpad and open document go. */
export function clearTestPrefs() {
  try {
    for (const k of ["axiom.ptt.scratchpad", ...[...TEST_PREFS].map((p) => `axiom.ptt.${p}`)]) window.localStorage.removeItem(k);
  } catch {
    // Nothing kept, nothing to clear.
  }
}
/** Before the rename, the one auto-saved document lived here; it becomes the Scratchpad. */
const OLD_KEY = "vcehub.cas.v1";

export type Saved = { doc: CasDocument; settings: Settings; definitions: string[] };

export function load(): Saved | null {
  try {
    const raw = window.localStorage.getItem(KEY) ?? (PTT ? null : window.localStorage.getItem(OLD_KEY));
    if (!raw) return null;
    const saved = JSON.parse(raw) as Saved;
    if (!saved?.doc?.pages?.length) return null;
    bumpIds(saved.doc);
    return saved;
  } catch {
    return null;
  }
}

/** Keep the Scratchpad; false when the browser wouldn't (storage full or unavailable). */
export function save(s: Saved): boolean {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(s));
    if (!PTT) window.localStorage.removeItem(OLD_KEY);
    return true;
  } catch {
    // Storage unavailable: carry on without it, and let the caller say so.
    return false;
  }
}

/** Small preferences (recent files, handheld setup), each guarded the same way. */
export function pref<T>(key: string, fallback: T): T {
  try {
    const raw = window.localStorage.getItem(prefKey(key));
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

export function setPref(key: string, value: unknown): void {
  try {
    window.localStorage.setItem(prefKey(key), JSON.stringify(value));
  } catch {
    // As above.
  }
}

/** Restore Factory Defaults: every axiom.* key. */
export function clearPrefs(): void {
  try {
    for (const k of Object.keys(window.localStorage)) if (k.startsWith("axiom.") || k === OLD_KEY) window.localStorage.removeItem(k);
  } catch {
    // Nothing to clear.
  }
}
