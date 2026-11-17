// SPDX-License-Identifier: GPL-3.0-or-later
// Ported from TnsTools (MIT, github.com/MaksimirKurtov/TnsTools) tns_outer_parse.py.
/**
 * The .tns container: a ZIP whose first local header starts "*TIMLP####"
 * instead of "PK\x03\x04" (and so is 6 bytes longer), and whose end record
 * may be "TIPD" instead of "PK\x05\x06".
 */

export type TnsEntry = {
  name: string;
  method: number;
  crc32: number;
  compressedSize: number;
  uncompressedSize: number;
  dataOffset: number;
};

const LOCAL = [0x50, 0x4b, 0x03, 0x04];
const CENTRAL = [0x50, 0x4b, 0x01, 0x02];
const EOCD = [0x50, 0x4b, 0x05, 0x06];
const TIPD = [0x54, 0x49, 0x50, 0x44];
const TIMLP = [0x2a, 0x54, 0x49, 0x4d, 0x4c, 0x50];

const at = (d: Uint8Array, off: number, sig: number[]) => off >= 0 && sig.every((b, i) => d[off + i] === b);
const u16 = (d: Uint8Array, off: number) => d[off]! | (d[off + 1]! << 8);
const u32 = (d: Uint8Array, off: number) => (d[off]! | (d[off + 1]! << 8) | (d[off + 2]! << 16) | (d[off + 3]! << 24)) >>> 0;

function lastIndexOf(d: Uint8Array, sig: number[]): number {
  for (let i = d.length - sig.length; i >= 0; i--) if (at(d, i, sig)) return i;
  return -1;
}

const utf8 = new TextDecoder("utf-8", { fatal: true });
const latin1 = new TextDecoder("latin1");
function decodeName(raw: Uint8Array): string {
  try {
    return utf8.decode(raw);
  } catch {
    return latin1.decode(raw);
  }
}

/** A local header at off: its sizes and where its data starts. */
function local(d: Uint8Array, off: number) {
  let base: number;
  if (at(d, off, LOCAL)) base = off + 4;
  else if (at(d, off, TIMLP) && off + 10 <= d.length) base = off + 10;
  else return null;
  if (base + 26 > d.length) return null;
  const nlen = u16(d, base + 22);
  const xlen = u16(d, base + 24);
  return {
    method: u16(d, base + 4),
    crc32: u32(d, base + 10),
    csize: u32(d, base + 14),
    usize: u32(d, base + 18),
    nlen,
    xlen,
    dataOffset: base + 26 + nlen + xlen,
  };
}

function fromCentral(d: Uint8Array): TnsEntry[] {
  const eocd = Math.max(lastIndexOf(d, EOCD), lastIndexOf(d, TIPD));
  if (eocd < 0 || eocd + 22 > d.length) return [];
  const total = u16(d, eocd + 10);
  const cdOff = u32(d, eocd + 16);
  // The TIMLP header's extra 6 bytes shift the recorded offsets in some files.
  for (const start of [cdOff, cdOff - 6, cdOff + 6, d.findIndex((_, i) => at(d, i, CENTRAL))]) {
    if (start < 0 || start + 46 > d.length || !at(d, start, CENTRAL)) continue;
    const out: TnsEntry[] = [];
    let off = start;
    let ok = true;
    for (let n = 0; n < (total || 10_000); n++) {
      if (off + 46 > d.length || !at(d, off, CENTRAL)) {
        ok = total === 0 || out.length === total;
        break;
      }
      const nlen = u16(d, off + 28);
      const xlen = u16(d, off + 30);
      const clen = u16(d, off + 32);
      const localOff = u32(d, off + 42);
      let loc = null;
      for (const cand of [localOff, localOff + 6, localOff - 6]) if ((loc = local(d, cand))) break;
      if (!loc) {
        ok = false;
        break;
      }
      out.push({
        name: decodeName(d.subarray(off + 46, off + 46 + nlen)),
        method: u16(d, off + 10) || loc.method,
        crc32: u32(d, off + 16) || loc.crc32,
        compressedSize: u32(d, off + 20) || loc.csize,
        uncompressedSize: u32(d, off + 24) || loc.usize,
        dataOffset: loc.dataOffset,
      });
      off += 46 + nlen + xlen + clen;
    }
    if (ok && out.length) return out;
  }
  return [];
}

function fromLocalScan(d: Uint8Array): TnsEntry[] {
  const out: TnsEntry[] = [];
  for (let off = 0; off < d.length; off++) {
    if (!(off === 0 && at(d, 0, TIMLP)) && !at(d, off, LOCAL)) continue;
    const loc = local(d, off);
    if (!loc || loc.dataOffset + loc.csize > d.length) continue;
    const nameStart = loc.dataOffset - loc.nlen - loc.xlen;
    const name = decodeName(d.subarray(nameStart, nameStart + loc.nlen));
    if (!name) continue;
    out.push({
      name,
      method: loc.method,
      crc32: loc.crc32,
      compressedSize: loc.csize,
      uncompressedSize: loc.usize,
      dataOffset: loc.dataOffset,
    });
  }
  return out;
}

export function parseContainer(d: Uint8Array): TnsEntry[] {
  const central = fromCentral(d);
  return central.length ? central : fromLocalScan(d);
}

export const payload = (d: Uint8Array, e: TnsEntry) => d.subarray(e.dataOffset, e.dataOffset + e.compressedSize);
