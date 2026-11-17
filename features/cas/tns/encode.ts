// SPDX-License-Identifier: GPL-3.0-or-later
/**
 * Writing a .tns: XML entries go through TIXC and method 13, other entries
 * (Python sources) are stored deflated (method 8), in a ZIP whose first local
 * header is "*TIMLP0500" and whose end record is "TIPD", as TI's own files are.
 */
import { deflateSync } from "fflate";
import { encryptMethod13 } from "./method13";
import { encodeTixc } from "./tixc";

const enc = new TextEncoder();

function crc32(data: Uint8Array): number {
  let c = ~0;
  for (let i = 0; i < data.length; i++) {
    c ^= data[i]!;
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return ~c >>> 0;
}

type Entry = { name: Uint8Array; method: number; crc: number; data: Uint8Array; size: number; offset: number };

export function buildTns(xml: Map<string, string>, files: Map<string, Uint8Array> = new Map()): Uint8Array {
  const entries: Entry[] = [];
  // Document.xml first: TI reads it from the first local header.
  const names = [...xml.keys()].sort((a, b) => (a === "Document.xml" ? -1 : b === "Document.xml" ? 1 : a.localeCompare(b, "en", { numeric: true })));
  for (const n of names) {
    const raw = enc.encode(xml.get(n)!);
    entries.push({ name: enc.encode(n), method: 13, crc: crc32(raw), data: encryptMethod13(encodeTixc(raw)), size: raw.length, offset: 0 });
  }
  for (const [n, raw] of files)
    entries.push({ name: enc.encode(n), method: 8, crc: crc32(raw), data: deflateSync(raw, { level: 9 }), size: raw.length, offset: 0 });

  const parts: Uint8Array[] = [];
  let pos = 0;
  const put = (b: Uint8Array) => {
    parts.push(b);
    pos += b.length;
  };
  entries.forEach((e, i) => {
    e.offset = pos;
    // The first header's signature is the 10-byte "*TIMLP0500"; the rest are "PK\3\4".
    const sig = i === 0 ? enc.encode("*TIMLP0500") : Uint8Array.of(0x50, 0x4b, 3, 4);
    const h = new Uint8Array(sig.length + 26);
    h.set(sig);
    const v = new DataView(h.buffer, sig.length);
    v.setUint16(0, 20, true); // version needed
    v.setUint16(2, 0, true);
    v.setUint16(4, e.method, true);
    v.setUint32(10, e.crc, true);
    v.setUint32(14, e.data.length, true);
    v.setUint32(18, e.size, true);
    v.setUint16(22, e.name.length, true);
    put(h);
    put(e.name);
    put(e.data);
  });
  const cdStart = pos;
  for (const e of entries) {
    const h = new Uint8Array(46);
    const v = new DataView(h.buffer);
    h.set([0x50, 0x4b, 1, 2]);
    v.setUint16(4, 20, true);
    v.setUint16(6, 20, true);
    v.setUint16(10, e.method, true);
    v.setUint32(16, e.crc, true);
    v.setUint32(20, e.data.length, true);
    v.setUint32(24, e.size, true);
    v.setUint16(28, e.name.length, true);
    v.setUint32(42, e.offset, true);
    put(h);
    put(e.name);
  }
  const end = new Uint8Array(22);
  const v = new DataView(end.buffer);
  end.set(enc.encode("TIPD"));
  v.setUint16(8, entries.length, true);
  v.setUint16(10, entries.length, true);
  v.setUint32(12, pos - cdStart, true);
  v.setUint32(16, cdStart, true);
  put(end);

  const out = new Uint8Array(pos);
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}
