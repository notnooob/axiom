// SPDX-License-Identifier: GPL-3.0-or-later
import { describe, expect, it } from "vitest";
import { print } from "../math/print";
import { compileFunc, compileProgram, definedSources, definitionText, encodeSource, parseBlock, readDefinition, runProgram, splitLines } from "./program";

describe("lines and blocks", () => {
  it("split at : but not :=, quotes or brackets", () => {
    expect(splitLines('a:=1:Disp "x:y",f(1,2):b:=a')).toEqual(["a:=1", 'Disp "x:y",f(1,2)', "b:=a"]);
  });
  it("read If…ElseIf…Else, For and a one-line If", () => {
    const b = parseBlock(splitLines("If x>1 Then:a:=1:ElseIf x=1 Then:a:=2:Else:a:=3:EndIf:For k,1,3:If k=2:Cycle:EndFor"));
    expect(b[0]).toMatchObject({ k: "if", branches: [{ cond: "x>1" }, { cond: "x=1" }], otherwise: [{ k: "expr", text: "a:=3" }] });
    expect(b[1]).toMatchObject({ k: "for", v: "k", from: "1", to: "3", body: [{ k: "if", branches: [{ body: [{ k: "cycle" }] }] }] });
  });
  it("needs its End", () => {
    expect(() => readDefinition("Define f(x)=Func:x+1")).toThrow("Missing EndFunc");
    expect(() => parseBlock(splitLines("While x<3:x:=x+1"))).toThrow("Missing End");
  });
});

describe("Define", () => {
  it("reads and writes back a definition", () => {
    const d = readDefinition("Define LibPub sq(x)=Func:Return x^2:EndFunc")!;
    expect(d).toMatchObject({ access: "LibPub", name: "sq", params: ["x"], kind: "Func", lines: ["Return x^2"] });
    expect(definitionText(d)).toBe("Define LibPub sq(x)=Func:Return x^2:EndFunc");
  });
  it("lists the problem's sources, without the deleted ones", () => {
    const src = (t: string) => `src_${readDefinition(t)!.name}_:="${encodeSource(t)}"`;
    const defs = [src("Define a()=Prgm:Disp 1:EndPrgm"), src("Define b(x)=Func:x:EndFunc"), "purge(src_a_)"];
    expect([...definedSources(defs).keys()]).toEqual(["b"]);
  });
});

describe("functions compile to Giac", () => {
  const tr = (a: Parameters<Parameters<typeof compileFunc>[1]>[0]) => print(a);
  it("If, ElseIf and equality", () => {
    expect(compileFunc(splitLines("If x=1 Then:Return 1:Else:Return 0:EndIf"), tr)).toBe("{if ((x)==(1)) {return(1);} else {return(0);};}");
  });
  it("Local, For and While", () => {
    expect(compileFunc(splitLines("Local t:t:=0:For k,1,n,2:t:=t+k:EndFor:While t>9:t:=t-1:EndWhile:t"), tr)).toBe(
      "{local t; t:=0; for k from 1 to n step 2 do t:=t+k; od; while (t>9) {t:=t-1;}; t;}",
    );
  });
  it("refuses I/O", () => {
    expect(() => compileFunc(["Disp x"], tr)).toThrow("Invalid in a Func");
  });
});

describe("programs run step by step", () => {
  // A toy calculator: numbers and assignments to single letters, tests with < and =.
  const fake = () => {
    const vars = new Map<string, number>();
    const value = (t: string): number => {
      const s = t.trim();
      for (const op of ["+", "-", "*"]) {
        const i = s.lastIndexOf(op);
        if (i > 0) {
          const [a, b] = [value(s.slice(0, i)), value(s.slice(i + 1))];
          return op === "+" ? a + b : op === "-" ? a - b : a * b;
        }
      }
      return /^[\d.]+$/.test(s) ? Number(s) : (vars.get(s) ?? NaN);
    };
    return {
      vars,
      run: async (text: string) => {
        const set = /^(\w+):=(.+)$/.exec(text);
        if (set) vars.set(set[1]!, value(set[2]!));
        const cmp = /^(.+)(<|=|>)(.+)$/.exec(text);
        const out = set ? String(vars.get(set[1]!)) : cmp && !set ? String(cmp[2] === "<" ? value(cmp[1]!) < value(cmp[3]!) : cmp[2] === ">" ? value(cmp[1]!) > value(cmp[3]!) : value(cmp[1]!) === value(cmp[3]!)) : String(value(text));
        return { output: out === "true" || out === "false" ? { k: "sym" as const, name: out } : { k: "num" as const, v: out }, outputText: out, definitions: [] };
      },
    };
  };
  it("For, Disp, Goto and Exit", async () => {
    const host = fake();
    const prog = compileProgram(splitLines("Local i:For i,1,3:Disp i*i:EndFor:i:=0:Lbl a:i:=i+1:If i<4:Goto a:Disp i:Loop:i:=i+1:If i>6:Exit:EndLoop:Disp i"));
    const r = await runProgram(prog, [], [], host);
    expect(r.display).toEqual([["1"], ["4"], ["9"], ["4"], ["7"]]);
    expect(r.temps).toEqual(["i_prgm_"]);
  });
  it("Try catches an error", async () => {
    const host = fake();
    const run = host.run;
    host.run = async (t: string) => {
      if (t === "boom") throw new Error("Error: Domain error");
      return run(t);
    };
    const r = await runProgram(compileProgram(splitLines("Try:boom:Disp 1:Else:Disp 2:EndTry")), [], [], host);
    expect(r.display).toEqual([["2"]]);
  });
});
