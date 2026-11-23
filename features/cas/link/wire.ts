// SPDX-License-Identifier: GPL-3.0-or-later
// Ported from libnspire (GPL-3.0-or-later), https://github.com/Vogtinator/libnspire:
// src/cx2.cpp (NNSE framing), src/packet.c (NavNet packets) and src/data.c (data_build, data_scan).
/**
 * The bytes on the wire to a TI-Nspire, pure so they can be tested without
 * a calculator.
 *
 * NavNet is the handheld's link protocol: 16-byte packets (big-endian) with
 * a header checksum and a CRC over the data, between numbered services
 * (0x4060 files, 0x4020 device info …). The CX II wraps each NavNet packet
 * in an NNSE message (its own 16-byte header, a ones'-complement checksum,
 * sequence numbers and acks); the original CX sends NavNet packets bare.
 */

// ---------------------------------------------------------------- NNSE (CX II)

export const NNSE_HEADER = 16;
/** The largest NNSE message: its header and 1472 bytes. */
export const NNSE_MAX = NNSE_HEADER + 1472;

/** NNSE addresses: everyone, this computer, the calculator. */
export const Addr = { All: 0xff, Me: 0xfe, Calc: 0x01 } as const;
/** NNSE services; Ack is a flag on the service byte of an acknowledgement. */
export const Svc = { AddrReq: 0x01, Time: 0x02, Stream: 0x04, Unknown: 0x08, Ack: 0x80 } as const;

export type Nnse = { misc: number; service: number; src: number; dest: number; unknown: number; reqAck: number; seqno: number; data: Uint8Array };

/** NNSE's checksum: the 16-bit big-endian words summed with the carry folded back in. A whole message sums to 0xFFFF. */
export function nnseSum(b: Uint8Array): number {
  let acc = 0;
  for (let i = 0; i + 1 < b.length; i += 2) acc += (b[i]! << 8) | b[i + 1]!;
  if (b.length & 1) acc += b[b.length - 1]! << 8;
  while (acc > 0xffff) acc = (acc >>> 16) + (acc & 0xffff);
  return acc;
}

export function encodeNnse(m: Omit<Nnse, "misc" | "unknown"> & { misc?: number; unknown?: number }): Uint8Array {
  const out = new Uint8Array(NNSE_HEADER + m.data.length);
  const v = new DataView(out.buffer);
  out[0] = m.misc ?? 0;
  out[1] = m.service;
  out[2] = m.src;
  out[3] = m.dest;
  out[4] = m.unknown ?? 0;
  out[5] = m.reqAck;
  v.setUint16(6, out.length);
  v.setUint16(8, m.seqno & 0xffff);
  out.set(m.data, NNSE_HEADER);
  v.setUint16(10, nnseSum(out) ^ 0xffff);
  return out;
}

/** A whole message (its length from its header) or null when the checksum is wrong. */
export function decodeNnse(b: Uint8Array): Nnse | null {
  if (b.length < NNSE_HEADER || nnseSum(b) !== 0xffff) return null;
  const v = new DataView(b.buffer, b.byteOffset, b.byteLength);
  return { misc: b[0]!, service: b[1]!, src: b[2]!, dest: b[3]!, unknown: b[4]!, reqAck: b[5]!, seqno: v.getUint16(8), data: b.slice(NNSE_HEADER, v.getUint16(6)) };
}

/** Bytes as they arrive cut into whole messages; what's left waits for more. Garbage (a bad length) is dropped. */
export function splitNnse(buf: Uint8Array): { messages: Uint8Array[]; rest: Uint8Array } {
  const messages: Uint8Array[] = [];
  let at = 0;
  while (buf.length - at >= NNSE_HEADER) {
    const len = (buf[at + 6]! << 8) | buf[at + 7]!;
    if (len < NNSE_HEADER || len > NNSE_MAX) return { messages, rest: new Uint8Array(0) };
    if (buf.length - at < len) break;
    messages.push(buf.slice(at, at + len));
    at += len;
  }
  return { messages, rest: buf.slice(at) };
}

// ---------------------------------------------------------------- NavNet

export const NAVNET_HEADER = 16;
const MAGIC = 0x54fd;

export type NavNet = {
  srcAddr: number;
  srcSid: number;
  dstAddr: number;
  dstSid: number;
  ack: number;
  seq: number;
  data: Uint8Array;
};

/** The header's checksum: its first 15 bytes summed, modulo 256. */
const headerSum = (b: Uint8Array) => {
  let s = 0;
  for (let i = 0; i < NAVNET_HEADER - 1; i++) s += b[i]!;
  return s & 0xff;
};

/** NavNet's data CRC, step for step as libnspire's calculate_data_checksum. */
export function navnetCrc(data: Uint8Array): number {
  let chk = 0;
  for (const d of data) {
    const tmp1 = ((d << 8) | (chk >>> 8)) & 0xffff;
    chk &= 0xff;
    const tmp2 = ((((chk & 0xf) << 4) ^ chk) << 8) & 0xffff;
    const tmp3 = tmp2 >>> 5;
    chk = tmp3 >>> 7;
    chk = (chk ^ tmp1 ^ tmp2 ^ tmp3) & 0xffff;
  }
  return chk;
}

/** A packet's bytes. Data under 255 bytes goes in the header's size byte; more (CX II only) as 0xFF and a 32-bit size. */
export function encodeNavNet(p: NavNet): Uint8Array {
  const big = p.data.length >= 0xff;
  const full = big ? new Uint8Array(4 + p.data.length) : p.data;
  if (big) {
    new DataView(full.buffer).setUint32(0, p.data.length);
    full.set(p.data, 4);
  }
  const out = new Uint8Array(NAVNET_HEADER + full.length);
  const v = new DataView(out.buffer);
  v.setUint16(0, MAGIC);
  v.setUint16(2, p.srcAddr);
  v.setUint16(4, p.srcSid);
  v.setUint16(6, p.dstAddr);
  v.setUint16(8, p.dstSid);
  v.setUint16(10, navnetCrc(full));
  out[12] = big ? 0xff : p.data.length;
  out[13] = p.ack;
  out[14] = p.seq;
  out[15] = headerSum(out);
  out.set(full, NAVNET_HEADER);
  return out;
}

export function decodeNavNet(b: Uint8Array): NavNet | null {
  if (b.length < NAVNET_HEADER) return null;
  const v = new DataView(b.buffer, b.byteOffset, b.byteLength);
  if (v.getUint16(0) !== MAGIC || b[15] !== headerSum(b)) return null;
  const size = b[12]!;
  let full: Uint8Array;
  let data: Uint8Array;
  if (size === 0xff) {
    if (b.length < NAVNET_HEADER + 4) return null;
    const n = v.getUint32(NAVNET_HEADER);
    full = b.slice(NAVNET_HEADER, NAVNET_HEADER + 4 + n);
    data = full.slice(4);
    if (data.length !== n) return null;
  } else {
    full = b.slice(NAVNET_HEADER, NAVNET_HEADER + size);
    data = full;
    if (data.length !== size) return null;
  }
  if (navnetCrc(full) !== v.getUint16(10)) return null;
  return { srcAddr: v.getUint16(2), srcSid: v.getUint16(4), dstAddr: v.getUint16(6), dstSid: v.getUint16(8), ack: b[13]!, seq: b[14]!, data };
}

// ---------------------------------------------------------------- service payloads (data_build / data_scan)

const utf8 = new TextEncoder();
const fromUtf8 = new TextDecoder();

/** A service request's bytes, big-endian, as libnspire's data_build. */
export class Build {
  private out: number[] = [];
  u8(x: number) {
    this.out.push(x & 0xff);
    return this;
  }
  u16(x: number) {
    this.out.push((x >>> 8) & 0xff, x & 0xff);
    return this;
  }
  u32(x: number) {
    this.out.push((x >>> 24) & 0xff, (x >>> 16) & 0xff, (x >>> 8) & 0xff, x & 0xff);
    return this;
  }
  /** A name ('s'): at least 8 bytes, zero-padded, then a 0. */
  name(s: string) {
    const b = utf8.encode(s);
    this.out.push(...b);
    for (let i = b.length; i < 8; i++) this.out.push(0);
    this.out.push(0);
    return this;
  }
  /** A string ('S'): its bytes and a 0. */
  str(s: string) {
    this.out.push(...utf8.encode(s), 0);
    return this;
  }
  zero() {
    this.out.push(0);
    return this;
  }
  bytes() {
    return Uint8Array.from(this.out);
  }
}

/** A service reply read in order, as libnspire's data_scan; reading past the end throws. */
export class Scan {
  at = 0;
  constructor(readonly b: Uint8Array) {}
  private need(n: number) {
    if (this.at + n > this.b.length) throw new Error("The handheld's reply was shorter than expected");
  }
  u8() {
    this.need(1);
    return this.b[this.at++]!;
  }
  u16() {
    this.need(2);
    const x = (this.b[this.at]! << 8) | this.b[this.at + 1]!;
    this.at += 2;
    return x;
  }
  u32() {
    this.need(4);
    const x = new DataView(this.b.buffer, this.b.byteOffset + this.at, 4).getUint32(0);
    this.at += 4;
    return x;
  }
  u64() {
    this.need(8);
    const x = new DataView(this.b.buffer, this.b.byteOffset + this.at, 8).getBigUint64(0);
    this.at += 8;
    return Number(x);
  }
  skip(n: number) {
    this.need(n);
    this.at += n;
    return this;
  }
  /** A name ('s'): up to its 0, which comes no sooner than 8 bytes in. */
  name() {
    const end = this.b.indexOf(0, this.at);
    if (end < 0) throw new Error("The handheld's reply had an unfinished name");
    const s = fromUtf8.decode(this.b.subarray(this.at, end));
    this.at = Math.max(end, this.at + 8) + 1;
    return s;
  }
  /** A string ('S'): up to its 0. */
  str() {
    const end = this.b.indexOf(0, this.at);
    if (end < 0) throw new Error("The handheld's reply had an unfinished string");
    const s = fromUtf8.decode(this.b.subarray(this.at, end));
    this.at = end + 1;
    return s;
  }
}
