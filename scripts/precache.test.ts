// SPDX-License-Identifier: GPL-3.0-or-later
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { finishPrecache, precacheManifest } from "./precache.mjs";

function dist() {
  const d = mkdtempSync(join(tmpdir(), "axiom-dist-"));
  mkdirSync(join(d, "assets"));
  writeFileSync(join(d, "index.html"), "<html>");
  writeFileSync(join(d, "assets", "app.js"), "1");
  writeFileSync(join(d, "sw.js"), 'const VERSION = "__AXIOM_VERSION__";');
  writeFileSync(join(d, "_headers"), "/*");
  return d;
}

describe("precache manifest", () => {
  it("lists every file but the worker, its list and host config", () => {
    expect(precacheManifest(dist()).files).toEqual(["assets/app.js", "index.html"]);
  });
  it("changes version when a file changes", () => {
    const d = dist();
    const a = precacheManifest(d).version;
    expect(precacheManifest(d).version).toBe(a);
    writeFileSync(join(d, "assets", "app.js"), "2");
    expect(precacheManifest(d).version).not.toBe(a);
  });
  it("stamps the version into sw.js", () => {
    const d = dist();
    const m = finishPrecache(d);
    expect(readFileSync(join(d, "sw.js"), "utf8")).toBe(`const VERSION = "${m.version}";`);
    expect(JSON.parse(readFileSync(join(d, "precache.json"), "utf8"))).toEqual(m);
  });
});
