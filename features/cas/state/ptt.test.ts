// SPDX-License-Identifier: GPL-3.0-or-later
import { afterEach, describe, expect, it } from "vitest";
import { blockedIn, setBlocked } from "../engine/restrict";
import { blockedCommands, parsePtt, PTT_OPTIONS, pttLines, pttSince } from "./ptt";

describe("Press-to-Test", () => {
  afterEach(() => setBlocked(new Set()));

  it("reads the entry dialog's choices", () => {
    const p = parsePtt(`ptt:Degree:${PTT_OPTIONS.map((o) => (o.key === "noPython" ? "No" : "Yes")).join(":")}`, 1000);
    expect(p).toEqual({ since: 1000, angle: "deg", noIsPrime: true, noVectors: true, no3d: true, noPython: false, noAssistant: true });
    expect(pttLines(p)).toEqual(["Angle: Degree", "Disable isPrime", "Disable Vector Functions", "Disable 3D Graphing", "Disable the Assistant"]);
  });

  it("switches off the chosen commands wherever they're used", () => {
    setBlocked(blockedCommands(parsePtt("ptt:Radian:Yes:Yes:No:No:No")));
    expect(blockedIn("isPrime(7)")).toBe("isPrime");
    expect(blockedIn("2+dotP([1,2],[3,4])")).toBe("dotP");
    expect(blockedIn("Define f(x)=crossP(x,[1,0,0])")).toBe("crossP");
    expect(blockedIn("factor(x^2-1)")).toBeNull();
    // A program's lines don't parse as one expression; the names are still found.
    expect(blockedIn("Func\nReturn isPrime(x)\nEndFunc")).toBe("isPrime");
  });

  it("blocks nothing when it's off", () => {
    expect(blockedCommands(null).size).toBe(0);
    expect(blockedIn("isPrime(7)")).toBeNull();
  });

  it("says when the test started and how long ago", () => {
    const start = new Date(2026, 10, 23, 9, 5).getTime();
    expect(pttSince(parsePtt("ptt:Radian", start), start + 75 * 60000)).toMatch(/^since .*9.*05.* \(1 h 15 min\)$/);
  });
});
