// SPDX-License-Identifier: GPL-3.0-or-later
import { inflateSync } from "fflate";
import { parseContainer, payload } from "./container";
import { decryptMethod13 } from "./method13";
import { decodeTixc } from "./tixc";

export type FileKind = "document" | "ndless" | "data";

/** What a file is, by its first bytes: a TI document, an Ndless program, or anything else. */
export function classify(bytes: Uint8Array): FileKind {
  const head = String.fromCharCode(...bytes.subarray(0, 6));
  if (head === "*TIMLP") return "document";
  if (head.startsWith("PRG\0")) return "ndless";
  return "data";
}

/** Every entry of a .tns document: XML as text, everything else (Python sources, images) as bytes. */
export type TnsContents = { xml: Map<string, string>; files: Map<string, Uint8Array> };

const utf8 = new TextDecoder();

export function decodeTns(bytes: Uint8Array): TnsContents {
  const xml = new Map<string, string>();
  const files = new Map<string, Uint8Array>();
  for (const e of parseContainer(bytes)) {
    const raw = payload(bytes, e);
    let data: Uint8Array;
    if (e.method === 0) data = raw;
    else if (e.method === 8) data = inflateSync(raw);
    else if (e.method === 13) {
      const tixc = decryptMethod13(raw);
      data = String.fromCharCode(...tixc.subarray(0, 8)) === "TIXC0100" ? decodeTixc(tixc) : tixc;
    } else throw new Error(`${e.name}: unsupported compression method ${e.method}`);
    if (e.name.toLowerCase().endsWith(".xml")) xml.set(e.name, utf8.decode(data));
    else files.set(e.name, data);
  }
  if (!xml.has("Document.xml")) throw new Error("not a TI document: Document.xml is missing");
  return { xml, files };
}
