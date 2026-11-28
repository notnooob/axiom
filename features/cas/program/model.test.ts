// SPDX-License-Identifier: GPL-3.0-or-later
import { describe, expect, it } from "vitest";
import { readDefinition } from "../engine/program";
import { CARET } from "../math/editor";
import { accessOf, asLines, lineStart, lineStatus, nameOf, newSource, renamed, sourceOf, syntaxError, toggleComment, withAccess } from "./model";

describe("program editor text", () => {
  it("starts a program or function as the handheld's New does", () => {
    expect(newSource("tst", "Prgm")).toBe("Define tst()=\nPrgm\n\nEndPrgm");
    expect(newSource("f", "Func", "LibPub")).toBe("Define LibPub f()=\nFunc\n\nEndFunc");
  });
  it("reads back as the same definition the engine stores", () => {
    const def = readDefinition("Define LibPriv p(a,b)=Prgm:Disp a:Disp b:EndPrgm")!;
    const src = sourceOf(def);
    expect(src).toBe("Define LibPriv p(a,b)=\nPrgm\nDisp a\nDisp b\nEndPrgm");
    expect(readDefinition(src)).toEqual(def);
  });
  it("counts body lines for the header", () => {
    const src = "Define t()=\nPrgm\nDisp 1\nDisp 2\nEndPrgm";
    expect(lineStatus(src, 0)).toEqual({ line: 1, total: 2 });
    expect(lineStatus(src, src.indexOf("Disp 2"))).toEqual({ line: 2, total: 2 });
    expect(lineStatus(newSource("t", "Prgm"), 0)).toEqual({ line: 1, total: 1 });
    expect(lineStart(src, 3)).toBe(src.indexOf("Disp 1"));
  });
  it("finds the first line that doesn't read", () => {
    expect(syntaxError("Define t()=\nPrgm\nDisp 1\nEndPrgm")).toBeNull();
    expect(syntaxError("Define t()=\nPrgm\nDisp 1+)\nEndPrgm")).toEqual({ line: 3, message: "Error: Syntax" });
    expect(syntaxError("Define t()=\nPrgm\nDisp 1")?.message).toBe("Error: Missing EndPrgm");
    expect(syntaxError("Define t(n)=\nPrgm\nLocal i\nFor i,1,n\nIf i>2 Then\nDisp i\nEndIf\nEndFor\n©note (\nEndPrgm")).toBeNull();
  });
  it("comments and uncomments the lines a selection touches", () => {
    const src = "Define t()=\nPrgm\nDisp 1\nDisp 2\nEndPrgm";
    const on = toggleComment(src, src.indexOf("Disp 1"), src.indexOf("Disp 2") + 2);
    expect(on.source).toBe("Define t()=\nPrgm\n©Disp 1\n©Disp 2\nEndPrgm");
    expect(toggleComment(on.source, on.from, on.to).source).toBe(src);
  });
  it("renames and changes library access on the Define line", () => {
    const src = "Define LibPub t(x)=\nFunc\nReturn x\nEndFunc";
    expect(nameOf(src)).toBe("t");
    expect(renamed(src, "u")).toBe("Define LibPub u(x)=\nFunc\nReturn x\nEndFunc");
    expect(accessOf(src)).toBe("LibPub");
    expect(withAccess(src, "None")).toBe("Define t(x)=\nFunc\nReturn x\nEndFunc");
    expect(withAccess(withAccess(src, "None"), "LibPriv").startsWith("Define LibPriv t(x)=")).toBe(true);
  });
  it("turns a menu block's : into new lines, keeping :=", () => {
    expect(asLines(`If ${CARET} Then::EndIf`)).toBe(`If ${CARET} Then\n\nEndIf`);
    expect(asLines("x:=1")).toBe("x:=1");
  });
});
