// SPDX-License-Identifier: GPL-3.0-or-later
/**
 * Installing Axiom as an app. Chromium browsers (Chrome, Edge, Android) offer
 * an install prompt once the page qualifies; it's held here from the moment
 * it fires, before React has drawn anything, so a button can show it later.
 * Safari and Firefox have no prompt: there the browser's own Share or page
 * menu installs it ("Add to Home Screen", "Add to Dock"), and no button shows.
 */
import { useSyncExternalStore } from "react";

type InstallPrompt = Event & {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

let prompt: InstallPrompt | null = null;
const listeners = new Set<() => void>();
const set = (p: InstallPrompt | null) => {
  prompt = p;
  for (const l of listeners) l();
};

/** Call once at startup, before the browser can fire its prompt. */
export function listenForInstall() {
  window.addEventListener("beforeinstallprompt", (e) => {
    // Our button instead of Chrome's own bar along the bottom of a phone's screen.
    e.preventDefault();
    set(e as InstallPrompt);
  });
  window.addEventListener("appinstalled", () => set(null));
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

/** Shows the browser's install dialog, or null when it can't (installed already, or no prompt in this browser). */
export function useInstall(): (() => Promise<void>) | null {
  const p = useSyncExternalStore(subscribe, () => prompt, () => null);
  if (!p) return null;
  return async () => {
    await p.prompt();
    await p.userChoice;
    // A prompt is good for one answer; the browser fires a fresh one if it's dismissed.
    set(null);
  };
}
