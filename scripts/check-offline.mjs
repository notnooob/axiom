#!/usr/bin/env node
// SPDX-License-Identifier: GPL-3.0-or-later
/**
 * Checks Axiom works offline: loads the built app once (the service worker
 * fills its cache), goes offline, reloads, then works out 2^10 with Giac
 * and runs a line of Python, both from the cache.
 *
 * Setup:  npx playwright install chromium; npm run build && npm run preview (in another terminal)
 * Run:    node scripts/check-offline.mjs [url]      (default http://localhost:4173)
 */
import { chromium } from "playwright";

const url = process.argv[2] || "http://localhost:4173";
const browser = await chromium.launch();
const context = await browser.newContext();
const page = await context.newPage();
const fail = (msg) => {
  console.error(`✗ ${msg}`);
  process.exitCode = 1;
};

try {
  await page.goto(url);
  // First visit: the worker takes over, the page reloads once for isolation, then the cache fills.
  await page.waitForFunction(() => navigator.serviceWorker.controller && crossOriginIsolated, null, { timeout: 60000 });
  await page.waitForFunction(
    async () => {
      const keys = await caches.keys();
      const list = await (await fetch("precache.json")).json();
      for (const k of keys) {
        const c = await caches.open(k);
        if ((await c.keys()).length >= list.files.length) return true;
      }
      return false;
    },
    null,
    { timeout: 180000, polling: 1000 },
  );
  console.log("✓ cache filled");
  // Let the first load finish (Giac arrives over the network then): cutting it off mid-download fails the reload.
  await page.waitForFunction(() => document.body.innerText.includes("Engine ready"), null, { timeout: 120000 });

  await context.setOffline(true);
  await page.reload();
  await page.waitForFunction(() => document.body.innerText.includes("Engine ready"), null, { timeout: 120000 });
  if (!(await page.evaluate(() => crossOriginIsolated))) fail("not cross-origin isolated offline");
  else console.log("✓ offline, isolated, engine ready");

  // A fresh browser opens on My Documents: Esc goes back to the Scratchpad's Calculator.
  await page.keyboard.press("Escape");
  // 2^10 through Giac (brackets are templates in the 2D editor, awkward to type from a script).
  await page.keyboard.type("2^10");
  await page.keyboard.press("Enter");
  const solved = await page.waitForFunction(() => document.body.innerText.includes("1024"), null, { timeout: 30000 }).then(() => true, () => false);
  if (solved) console.log("✓ 2^10 = 1024 offline");
  else fail("2^10 gave no answer offline");

  const py = await page.evaluate(async () => {
    const { loadPyodide } = await import(new URL("pyodide/pyodide.mjs", location.href).href);
    const p = await loadPyodide({ indexURL: new URL("pyodide/", location.href).href });
    return p.runPython("print(1) or 6*7");
  });
  if (py === 42) console.log("✓ Python offline");
  else fail(`Python gave ${py}`);
} catch (e) {
  fail(e.message);
} finally {
  await browser.close();
}
