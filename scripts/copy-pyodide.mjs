#!/usr/bin/env node
// SPDX-License-Identifier: GPL-3.0-or-later
/**
 * Self-host Pyodide: copy the files the Python pages
 * load from node_modules into public/, so the site never fetches them from a
 * CDN. Run before dev and build (package.json). The copies are gitignored.
 */
import { copyFileSync, existsSync, mkdirSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const from = join(root, "node_modules", "pyodide");
const to = join(root, "public", "pyodide");
mkdirSync(to, { recursive: true });
for (const f of ["pyodide.mjs", "pyodide.asm.mjs", "pyodide.asm.wasm", "python_stdlib.zip", "pyodide-lock.json"]) {
  const src = join(from, f);
  const dst = join(to, f);
  if (!existsSync(src)) throw new Error(`pyodide is missing ${f}: run npm install`);
  if (!existsSync(dst) || statSync(dst).size !== statSync(src).size) copyFileSync(src, dst);
}
