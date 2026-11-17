// SPDX-License-Identifier: GPL-3.0-or-later
/**
 * Registers public/sw.js (production builds only; the dev server sends the
 * isolation headers itself) and tells the student what it's doing: once
 * everything is kept for offline use, and when a new version is ready.
 */
import { toast } from "sonner";

const RELOADED = "axiom-isolation-reload";

export function registerOffline() {
  if (!import.meta.env.PROD || !("serviceWorker" in navigator)) return;
  const sw = navigator.serviceWorker;
  const firstVisit = !sw.controller;

  sw.addEventListener("message", (e: MessageEvent<{ type: string; added?: number; error?: string }>) => {
    if (e.data?.type === "cached" && e.data.added) toast.success("Axiom is ready to use offline.");
    if (e.data?.type === "cache-failed") console.warn("Offline cache incomplete:", e.data.error);
  });

  let updating = false;
  sw.addEventListener("controllerchange", () => {
    // An update the student accepted: load the new version.
    if (updating) return location.reload();
    // The first visit: the worker took over without the isolation headers on
    // this page. Reload once, as coi-serviceworker did, so Python's shared memory works.
    if (firstVisit && !crossOriginIsolated && !sessionStorage.getItem(RELOADED)) {
      sessionStorage.setItem(RELOADED, "1");
      location.reload();
    }
  });

  const offerUpdate = (w: ServiceWorker) =>
    toast("Axiom has been updated.", {
      duration: Infinity,
      action: {
        label: "Reload",
        onClick: () => {
          updating = true;
          w.postMessage("skip-waiting");
        },
      },
    });

  sw.register("./sw.js", { scope: "./" }).then((reg) => {
    if (reg.waiting && sw.controller) offerUpdate(reg.waiting);
    reg.addEventListener("updatefound", () => {
      const w = reg.installing;
      w?.addEventListener("statechange", () => {
        if (w.state === "installed" && sw.controller) offerUpdate(w);
      });
    });
    // Fill (or finish filling) the cache; quick when it's already full. Not
    // from a first-visit page about to reload for isolation: the reloaded one asks.
    if (!firstVisit || crossOriginIsolated) sw.ready.then((r) => r.active?.postMessage("precache"));
    void navigator.storage?.persist?.();
  }, (err) => console.warn("Service worker not registered:", err));
}
