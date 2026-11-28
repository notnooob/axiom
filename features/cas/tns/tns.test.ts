// SPDX-License-Identifier: GPL-3.0-or-later
/**
 * Decoder checks against a private corpus (TI's documents can't be committed):
 *   AXIOM_TNS_CORPUS  a .zip of .tns files (e.g. a calculator's Documents folder)
 *   AXIOM_TNS_GOLDEN  optional: TnsTools' XML for the same files, <golden>/<flattened name>/<entry>.xml
 * Without them only the synthetic round trip runs.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { unzipSync } from "fflate";
import { describe, expect, it } from "vitest";
import { buildTns } from "./encode";
import { droppedMessage, exportTns } from "./export";
import { DEFAULT_SETTINGS } from "../engine/evaluate";
import { newPage, type CasDocument } from "../state/document";
import { classify, decodeTns } from "./decode";
import { decryptMethod13, encryptMethod13 } from "./method13";
import { decodeTixc, encodeTixc } from "./tixc";

const corpus = process.env.AXIOM_TNS_CORPUS;
const golden = process.env.AXIOM_TNS_GOLDEN;
const enc = new TextEncoder();
const dec = new TextDecoder();

const SAMPLE = `<?xml version="1.0" encoding="UTF-8" ?><prob xmlns="urn:TI.Problem" ver="1.0"><n> </n><n> lead</n><sym><e t="3"><n>a</n><v>−2.5</v></e></sym><card><wdgt type="TI.Scratchpad"><sp:entr>solve(x^2=4,x) ≠ π</sp:entr><sp:entr/></wdgt></card><![CDATA[x < y]]></prob>`;

describe("TIXC and method 13", () => {
  it("round-trips XML through TIXC", () => {
    expect(dec.decode(decodeTixc(encodeTixc(enc.encode(SAMPLE))))).toBe(SAMPLE);
  });

  it("round-trips more tag names than the 256-entry dictionary holds", () => {
    // Big Graphs pages use more than 256 names: the ones past the dictionary are written (and closed) in full.
    const many = Array.from({ length: 300 }, (_, i) => `<g:t${i}>${i}.5</g:t${i}><g:t${i}>again</g:t${i}>`).join("");
    const xml = `<?xml version="1.0" encoding="UTF-8" ?><prob>${many}<g:t299 a="1"/></prob>`;
    expect(dec.decode(decodeTixc(encodeTixc(enc.encode(xml))))).toBe(xml);
  });
  it("round-trips a payload through method 13", () => {
    const tixc = encodeTixc(enc.encode(SAMPLE));
    expect(decryptMethod13(encryptMethod13(tixc))).toEqual(tixc);
  });
  it("round-trips a whole document", () => {
    const doc = `<?xml version="1.0" encoding="UTF-8" ?><doc ver="1.0"><nps>1</nps></doc>`;
    const tns = buildTns(new Map([["Document.xml", doc], ["Problem1.xml", SAMPLE]]), new Map([["a.py", enc.encode("print(1)")]]));
    expect(classify(tns)).toBe("document");
    const back = decodeTns(tns);
    expect(back.xml.get("Problem1.xml")).toBe(SAMPLE);
    expect(dec.decode(back.files.get("a.py"))).toBe("print(1)");
  });
});

describe("export", () => {
  it("writes calculator, lists and python pages that decode again", () => {
    const calc = newPage("calculator");
    if (calc.kind === "calculator")
      calc.history.push({ id: 1, input: [], inputText: "2+3<4", output: [], outputText: "5" });
    const doc: CasDocument = {
      title: "t",
      active: 0,
      pages: [
        calc,
        { kind: "lists", id: 2, problem: 1, sel: { row: 2, col: 0 }, edit: null, cols: [{ name: "xs", cells: ["1", "2"] }] },
        { kind: "python", id: 3, problem: 1, file: "a.py", source: "print(1)" },
        { kind: "graphs", id: 4, problem: 2, functions: [], window: { xmin: -1, xmax: 1, xscl: 1, ymin: -1, ymax: 1, yscl: 1 }, editing: null, edit: { row: [], cursor: { path: [], index: 0 } }, tool: null, marks: [], table: false, grid: "none", axes: true },
      ],
    };
    const { bytes, dropped, droppedKinds } = exportTns(doc, DEFAULT_SETTINGS);
    expect(dropped).toBe(1); // the Graphs page made here
    expect(droppedKinds).toEqual(["Graphs"]);
    expect(droppedMessage({ dropped, droppedKinds })).toContain("(Graphs)");
    const back = decodeTns(bytes);
    const p1 = back.xml.get("Problem1.xml")!;
    expect(p1).toContain("<sp:entr>2+3&lt;4</sp:entr>");
    expect(p1).toContain("<tb:globalName>xs</tb:globalName>");
    expect(p1).toContain("<n>xs</n><v>{1,2}</v>");
    expect(back.xml.has("Problem2.xml")).toBe(true);
    expect(back.xml.get("Document.xml")).toContain("<nps>2</nps>");
    expect(dec.decode(back.files.get("a.py"))).toBe("print(1)");
  });

  it("keeps imported variables and functions that were never opened", () => {
    // importTns needs a DOMParser, so this reads the <sym> entries it would: the same shape import.ts takes back.
    const doc: CasDocument = { title: "t", active: 0, pages: [newPage("calculator")], pendingSym: { "1": ["a:=3", "Define g(x)=x^2+1"] } };
    const p1 = decodeTns(exportTns(doc, DEFAULT_SETTINGS).bytes).xml.get("Problem1.xml")!;
    expect(p1).toContain('<e t="3" f="0" c="0"><n>a</n><v>3</v></e>');
    expect(p1).toContain('<e t="6" f="0" c="0"><n>g</n><p>x</p><v>x^2+1</v></e>');
  });

  it("writes programs and Program Editor pages as TI keeps them", () => {
    const src = "Define LibPub chk(n)=Prgm:Disp n:Disp 2:EndPrgm";
    const stored = `src_chk_:="${btoa(src)}"`;
    const doc: CasDocument = {
      title: "t",
      active: 0,
      pages: [{ kind: "program", id: 1, problem: 1, name: "chk", source: "Define LibPub chk(n)=\nPrgm\nDisp n\nDisp 2\nEndPrgm", stored: "Define LibPub chk(n)=\nPrgm\nDisp n\nDisp 2\nEndPrgm" }],
      pendingSym: { "1": ["Define f(x)=Func\nReturn x+1\nEndFunc"] },
    };
    const { bytes, dropped } = exportTns(doc, DEFAULT_SETTINGS, [stored]);
    expect(dropped).toBe(0);
    const p1 = decodeTns(bytes).xml.get("Problem1.xml")!;
    expect(p1).toContain('<e t="7" f="0" c="0"><n>chk</n><p>n</p><v>Prgm&#13;:Disp n&#13;:Disp 2&#13;:EndPrgm</v></e>');
    expect(p1).toContain('<e t="6" f="0" c="0"><n>f</n><p>x</p><v>Func&#13;:Return x+1&#13;:EndFunc</v></e>');
    expect(p1).toContain('type="TI.ProgramEditor"');
    expect(p1).toContain("<pe:dirty>0</pe:dirty><pe:name>chk</pe:name><pe:type>Prgm</pe:type><pe:laststoredexpr>Define LibPub chk(n)=\nPrgm&#13;:Disp n");
    // The editor's text: the Define line with the name in bold, then a node per line.
    expect(p1).toContain("&lt;node name=&quot;0prgm&quot; readonly=&quot;1&quot;&gt;");
    expect(p1).toContain("pp0=&quot;6&quot;&gt;Disp n&lt;/leaf&gt;");
  });

  it("puts two apps side by side back on one card", () => {
    const calc = newPage("calculator", 1);
    const editor = { kind: "program" as const, id: 77, problem: 1, name: "p", source: "Define p()=\nPrgm\n\nEndPrgm" };
    const doc: CasDocument = { title: "t", active: 0, pages: [calc, editor], groups: [{ slots: [calc.id, editor.id], layout: 2 }] };
    const p1 = decodeTns(exportTns(doc, DEFAULT_SETTINGS).bytes).xml.get("Problem1.xml")!;
    expect(p1.match(/<card /g)?.length).toBe(1);
    expect(p1).toMatch(/<card clay="1"[^>]*w1="5000"[^>]*>.*type="TI.Scratchpad".*type="TI.ProgramEditor"/s);
  });
});

describe.skipIf(!corpus || !existsSync(corpus))("user corpus", () => {
  const zip = corpus ? unzipSync(readFileSync(corpus)) : {};
  const docs = Object.entries(zip).filter(([n, b]) => n.endsWith(".tns") && !n.startsWith("__MACOSX") && classify(b) === "document");
  // TnsTools itself can't decode these yet (a TIXC state it doesn't know, or an
  // inflate size mismatch); they're tracked rather than hidden.
  const known = new Set(["Examples/Getting Started.tns", "Games/DoodleJump.tns", "Games/Rocket Cat.tns", "ndless/ndless_installer_5.2.0-5.3.0.tns"]);

  it("finds documents", () => expect(docs.length).toBeGreaterThan(20));

  for (const [name, bytes] of docs) {
    const short = name.replace(/^Documents\//, "");
    it.skipIf(known.has(short))(`decodes ${short}`, () => {
      const { xml } = decodeTns(bytes);
      expect(xml.get("Document.xml")).toContain("<doc");
      if (!golden) return;
      const dir = join(golden, short.replace(/\//g, "__"));
      for (const [entry, text] of xml) {
        const want = join(dir, entry);
        if (existsSync(want)) expect(text).toBe(readFileSync(want, "utf8"));
      }
      // Every XML entry re-encodes to the same XML.
      for (const text of xml.values()) expect(dec.decode(decodeTixc(encodeTixc(enc.encode(text))))).toBe(text);
    });
  }
});
