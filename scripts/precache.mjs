// SPDX-License-Identifier: GPL-3.0-or-later
/**
 * The offline cache's file list, made after `vite build` (vite.config.ts):
 * every file in dist/ the service worker should keep, and a version that
 * changes whenever any of them does. finishPrecache writes dist/precache.json
 * and stamps the version into dist/sw.js, so each deploy installs as an update.
 */
import { createHash } from "node:crypto";
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, relative, sep } from "node:path";

/** Not cached: the worker itself, its list, and host config. */
const SKIP = new Set(["sw.js", "precache.json", "_headers"]);

/** @param {string} dir @returns {{ version: string, files: string[] }} */
export function precacheManifest(dir) {
  const files = [];
  const walk = (d) => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      const p = join(d, e.name);
      if (e.isDirectory()) walk(p);
      else {
        const rel = relative(dir, p).split(sep).join("/");
        // .woff/.ttf are KaTeX's fallbacks: every browser with service workers takes the .woff2.
        if (!SKIP.has(rel) && !/\.(woff|ttf)$/.test(rel)) files.push(rel);
      }
    }
  };
  walk(dir);
  files.sort();
  const hash = createHash("sha256");
  for (const f of files) hash.update(f).update("\0").update(readFileSync(join(dir, f))).update("\0");
  return { version: hash.digest("hex").slice(0, 12), files };
}

/** @param {string} dir */
export function finishPrecache(dir) {
  const m = precacheManifest(dir);
  writeFileSync(join(dir, "precache.json"), JSON.stringify(m));
  const sw = join(dir, "sw.js");
  writeFileSync(sw, readFileSync(sw, "utf8").replace("__AXIOM_VERSION__", m.version));
  return m;
}
