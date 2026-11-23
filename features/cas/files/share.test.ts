// SPDX-License-Identifier: GPL-3.0-or-later
import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS } from "../engine/evaluate";
import { newDocument } from "../state/document";
import { isShareFragment, readShareFragment, shareFragment } from "./share";

const saved = () => ({ doc: { ...newDocument("calculator", "Homework 3") }, settings: DEFAULT_SETTINGS, definitions: ["a:=5", "f(x):=x^2"] });

describe("share links", () => {
  it("round-trips a document through the fragment", () => {
    const s = saved();
    const hash = shareFragment(s);
    expect(isShareFragment(hash)).toBe(true);
    expect(hash).toMatch(/^#doc=1\.[A-Za-z0-9_-]+$/);
    expect(readShareFragment(hash)).toEqual(s);
  });

  it("reads a fragment the browser percent-encoded", () => {
    const s = saved();
    expect(readShareFragment(encodeURI(shareFragment(s)))).toEqual(s);
  });

  it("refuses a cut-short or foreign fragment", () => {
    const hash = shareFragment(saved());
    expect(readShareFragment(hash.slice(0, hash.length - 10))).toBeNull();
    expect(readShareFragment("#doc=2.abc")).toBeNull();
    expect(readShareFragment("#top")).toBeNull();
  });
});
