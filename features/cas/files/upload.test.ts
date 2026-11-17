// SPDX-License-Identifier: GPL-3.0-or-later
import { describe, expect, it } from "vitest";
import { zipPaths } from "./upload";

describe("zip upload paths", () => {
  it("drops a shared top folder and macOS clutter", () => {
    const m = zipPaths([
      "Documents/",
      "Documents/.DS_Store",
      "__MACOSX/Documents/._.DS_Store",
      "Documents/Games/Tetris.tns",
      "Documents/themes.csv",
    ]);
    expect([...m.values()]).toEqual(["Games/Tetris.tns", "themes.csv"]);
  });
  it("keeps paths when files sit at the top", () => {
    expect([...zipPaths(["a.tns", "Games/b.tns"]).values()]).toEqual(["a.tns", "Games/b.tns"]);
  });
  it("keeps the folder when the top level mixes folders", () => {
    expect([...zipPaths(["A/x.tns", "B/y.tns"]).values()]).toEqual(["A/x.tns", "B/y.tns"]);
  });
});
