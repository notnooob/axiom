import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vite";
import { finishPrecache } from "./scripts/precache.mjs";

// base "./" so the build works from any folder or subpath (GitHub Pages, a file share).
// Cross-origin isolation, so Python's live keys, input() and Break can use
// SharedArrayBuffer. Static hosts that can't set headers get the same from
// the service worker (public/sw.js), which also keeps the app for offline use.
const isolation = { "Cross-Origin-Opener-Policy": "same-origin", "Cross-Origin-Embedder-Policy": "require-corp" };

/** After the build: the offline cache's file list and the worker's version (scripts/precache.mjs). */
const precache = (): Plugin => {
  let outDir = "dist";
  return {
    name: "axiom-precache",
    apply: "build",
    configResolved: (c) => void (outDir = c.build.outDir),
    closeBundle: () => void finishPrecache(outDir),
  };
};

/** package.json's version, shown under the screen (screen/dialogs.tsx, Legal). */
const version: string = JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf8")).version;

export default defineConfig({
  base: "./",
  define: { __APP_VERSION__: JSON.stringify(version) },
  server: { headers: isolation },
  preview: { headers: isolation },
  worker: { format: "es" },
  plugins: [react(), tailwindcss(), precache()],
  resolve: { alias: { "@": fileURLToPath(new URL(".", import.meta.url)) } },
});
