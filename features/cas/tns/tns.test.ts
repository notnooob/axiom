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
import { exportTns } from "./export";
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
    const { bytes, dropped } = exportTns(doc, DEFAULT_SETTINGS);
    expect(dropped).toBe(1); // the Graphs page made here
    const back = decodeTns(bytes);
    const p1 = back.xml.get("Problem1.xml")!;
    expect(p1).toContain("<sp:entr>2+3&lt;4</sp:entr>");
    expect(p1).toContain("<tb:globalName>xs</tb:globalName>");
    expect(p1).toContain("<n>xs</n><v>{1,2}</v>");
    expect(back.xml.has("Problem2.xml")).toBe(true);
    expect(back.xml.get("Document.xml")).toContain("<nps>2</nps>");
    expect(dec.decode(back.files.get("a.py"))).toBe("print(1)");
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
