// SPDX-License-Identifier: GPL-3.0-or-later
/**
 * Axiom's service worker: keeps every file of the build (Giac and Pyodide
 * included) so the calculator works offline, and adds the cross-origin
 * isolation headers Python's shared memory needs on hosts that can't send
 * them (GitHub Pages). Only same-origin GETs are touched: the assistant's
 * calls to the student's AI provider go straight to the network.
 *
 * First visit: it takes over at once (as coi-serviceworker did) and the page
 * asks it to fill the cache in the background ("precache" message), so
 * nothing waits on 32 MB. An update: the new version fills its own cache
 * while installing, then waits until the page says "skip-waiting".
 */
const VERSION = "__AXIOM_VERSION__"; // stamped by scripts/precache.mjs at build
const CACHE = `axiom-${VERSION}`;
const scope = () => self.registration.scope;
// Hosts send Vary: Origin; a module script's request has an Origin the cached fetch didn't.
const ANY = { ignoreVary: true };

async function precache() {
  const list = await (await fetch(new URL("precache.json", scope()), { cache: "no-cache" })).json();
  const cache = await caches.open(CACHE);
  let added = 0;
  // Only what's missing, so an interrupted fill carries on where it stopped.
  for (const f of list.files) {
    const url = new URL(f, scope()).href;
    if (await cache.match(url, ANY)) continue;
    const res = await fetch(url, { cache: "reload" });
    if (!res.ok) throw new Error(`${f}: ${res.status}`);
    await cache.put(url, res);
    added++;
  }
  return added;
}

/** One fill at a time: two pages asking share it. */
let filling = null;
const fill = () => (filling ??= precache().finally(() => (filling = null)));

self.addEventListener("install", (e) => {
  if (self.registration.active) e.waitUntil(fill());
  else self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    (async () => {
      for (const k of await caches.keys()) if (k.startsWith("axiom-") && k !== CACHE) await caches.delete(k);
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("message", (e) => {
  if (e.data === "skip-waiting") self.skipWaiting();
  if (e.data === "precache")
    e.waitUntil(
      fill().then(
        (added) => e.source?.postMessage({ type: "cached", added }),
        (err) => e.source?.postMessage({ type: "cache-failed", error: String(err) }),
      ),
    );
});

/** The response again, with the headers that make the page cross-origin isolated. */
function isolated(res) {
  if (res.status === 0) return res;
  const headers = new Headers(res.headers);
  headers.set("Cross-Origin-Opener-Policy", "same-origin");
  headers.set("Cross-Origin-Embedder-Policy", "require-corp");
  headers.set("Cross-Origin-Resource-Policy", "same-origin");
  return new Response(res.body, { status: res.status, statusText: res.statusText, headers });
}

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET" || new URL(req.url).origin !== self.location.origin) return;
  e.respondWith(
    (async () => {
      const cache = await caches.open(CACHE);
      // The app is one page: a navigation to anything that isn't a kept file
      // (the start URL, a query) gets index.html. Kept files such as Giac's
      // COPYING, which the GPL line links to, open as themselves.
      let hit = await cache.match(req, ANY);
      if (!hit && req.mode === "navigate") hit = await cache.match(new URL("index.html", scope()).href, ANY);
      return isolated(hit ?? (await fetch(req)));
    })(),
  );
});
