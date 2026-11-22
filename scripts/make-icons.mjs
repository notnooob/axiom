// SPDX-License-Identifier: GPL-3.0-or-later
/**
 * The installed app's PNG icons, drawn from public/icon.svg. Run it again
 * after changing the icon: `node scripts/make-icons.mjs`. The PNGs are
 * committed, so builds don't need a browser.
 *
 * - icon-192.png, icon-512.png: the icon as it is, for install prompts,
 *   Windows and ChromeOS, where an SVG icon isn't always used.
 * - icon-maskable-512.png: Android crops to its own shape (a circle, a
 *   squircle…), so the background fills the square and the drawing shrinks
 *   into the middle 80%, the part every mask keeps.
 * - apple-touch-icon.png: iOS rounds the corners itself and turns
 *   transparent pixels black, so it gets square corners.
 *
 * Uses Playwright (a dev dependency) with its own Chromium, or with Edge or
 * Chrome if Chromium hasn't been installed (`npx playwright install chromium`).
 */
import { readFileSync, writeFileSync } from "node:fs";
import { chromium } from "playwright";

const pub = new URL("../public/", import.meta.url);
const svg = readFileSync(new URL("icon.svg", pub), "utf8").replace(/<!--.*?-->\s*/s, "");

// The first <rect> is the background; everything after it is the drawing.
const bg = svg.match(/<rect[^>]*\/>/)[0];
const art = svg.slice(svg.indexOf(bg) + bg.length, svg.lastIndexOf("</svg>"));
const square = bg.replace(/\s*rx="[^"]*"/, "");
/** The background without its rounded corners, and the drawing (y 5 to 26) scaled about its middle and centred. */
const fullBleed = (scale) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">${square}<g transform="translate(16 16) scale(${scale}) translate(-16 -15.5)">${art}</g></svg>`;

const icons = [
  { file: "icon-192.png", size: 192, svg },
  { file: "icon-512.png", size: 512, svg },
  // The drawing spans 22 × 21 of 32; at 0.75 its corners sit inside the 12.8-unit safe circle.
  { file: "icon-maskable-512.png", size: 512, svg: fullBleed(0.75) },
  { file: "apple-touch-icon.png", size: 180, svg: fullBleed(1) },
];

async function launch() {
  for (const channel of [undefined, "msedge", "chrome"]) {
    try {
      return await chromium.launch({ channel });
    } catch {
      /* try the next browser */
    }
  }
  throw new Error("No browser for Playwright: run `npx playwright install chromium`.");
}

const browser = await launch();
try {
  for (const icon of icons) {
    const page = await browser.newPage({ viewport: { width: icon.size, height: icon.size } });
    const src = `data:image/svg+xml;base64,${Buffer.from(icon.svg).toString("base64")}`;
    await page.setContent(`<style>*{margin:0}img{display:block}</style><img src="${src}" width="${icon.size}" height="${icon.size}">`);
    await page.waitForFunction(() => document.querySelector("img")?.complete);
    writeFileSync(new URL(icon.file, pub), await page.screenshot({ omitBackground: true }));
    await page.close();
    console.log(`public/${icon.file}`);
  }
} finally {
  await browser.close();
}
