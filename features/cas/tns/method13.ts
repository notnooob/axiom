// SPDX-License-Identifier: GPL-3.0-or-later
// Ported from TnsTools (MIT, github.com/MaksimirKurtov/TnsTools) tns_method13.py.
/**
 * ZIP method 13, TI's envelope for document XML:
 *   40-byte header, 3DES-ECB under a fixed key ("TIEN0100", block size, seed, body key)
 *   body: XORed with a 3DES keystream of a counter (seed + block index)
 *   inside: raw deflate of a TIXC0100 token stream.
 */
import CryptoJS from "crypto-js";
import { deflateSync, inflateSync } from "fflate";

const HEADER_KEY = hex("79c4e0f45eef7a5b70137a57c2fd3d2cc2707cc1ad2f1575");
/** TnsTools' defaults for files we write: any key material and seed work. */
const DEFAULT_KEY_MATERIAL = hex("8d24ef911c6eb62702b538e04b13e0e9d4e03d7516");
const DEFAULT_SEED = 0x6d657468;

function hex(s: string): Uint8Array {
  return Uint8Array.from(s.match(/../g)!.map((h) => parseInt(h, 16)));
}

type Block = (words: number[], offset: number) => void;
type BlockCipher = { encryptBlock: Block; decryptBlock: Block };

/** A 3DES-ECB block cipher, used a block at a time (crypto-js's whole-message API is far slower). */
function des3(key: Uint8Array, encrypt: boolean): (block: Uint8Array) => Uint8Array {
  const keyWords = CryptoJS.lib.WordArray.create(Array.from({ length: 6 }, (_, i) => be32(key, i * 4)), 24);
  const opts = { mode: CryptoJS.mode.ECB, padding: CryptoJS.pad.NoPadding };
  const c = (
    encrypt ? CryptoJS.algo.TripleDES.createEncryptor(keyWords, opts) : CryptoJS.algo.TripleDES.createDecryptor(keyWords, opts)
  ) as unknown as BlockCipher;
  return (block) => {
    const w = [be32(block, 0), be32(block, 4)];
    if (encrypt) c.encryptBlock(w, 0);
    else c.decryptBlock(w, 0);
    const out = new Uint8Array(8);
    putBe32(out, 0, w[0]!);
    putBe32(out, 4, w[1]!);
    return out;
  };
}

const be32 = (b: Uint8Array, o: number) => ((b[o]! << 24) | (b[o + 1]! << 16) | (b[o + 2]! << 8) | b[o + 3]!) | 0;
function putBe32(b: Uint8Array, o: number, v: number) {
  b[o] = v >>> 24;
  b[o + 1] = (v >>> 16) & 0xff;
  b[o + 2] = (v >>> 8) & 0xff;
  b[o + 3] = v & 0xff;
}

function ecb(key: Uint8Array, data: Uint8Array, encrypt: boolean): Uint8Array {
  const f = des3(key, encrypt);
  const out = new Uint8Array(data.length);
  for (let o = 0; o < data.length; o += 8) out.set(f(data.subarray(o, o + 8)), o);
  return out;
}

const oddParity = (b: number) => {
  b &= 0xfe;
  let bits = 0;
  for (let v = b; v; v >>= 1) bits += v & 1;
  return bits % 2 === 0 ? b | 1 : b;
};

/** TI packs each DES key in 7 bytes (56 key bits); 3DES wants 8 with parity bits. */
function key7to8(k: Uint8Array): number[] {
  const b = Array.from(k);
  return [
    b[0]! & 0xfe,
    ((b[1]! >> 1) & 0x7e) | ((b[0]! << 7) & 0xff),
    ((b[2]! >> 2) & 0x3e) | ((b[1]! << 6) & 0xff),
    ((b[3]! >> 3) & 0x1e) | ((b[2]! << 5) & 0xff),
    ((b[4]! >> 4) & 0x0e) | ((b[3]! << 4) & 0xff),
    ((b[5]! >> 5) & 0x06) | ((b[4]! << 3) & 0xff),
    ((b[6]! >> 6) & 0x02) | ((b[5]! << 2) & 0xff),
    (b[6]! << 1) & 0xff,
  ].map(oddParity);
}

/** The body transform is its own inverse: XOR with 3DES(counter). */
function cryptBody(data: Uint8Array, seed: number, keyMaterial: Uint8Array): Uint8Array {
  const key = Uint8Array.from([0, 7, 14].flatMap((i) => key7to8(keyMaterial.subarray(i, i + 7))));
  const f = des3(key, true);
  const out = new Uint8Array(data.length);
  const counter = new Uint8Array(8);
  for (let off = 0; off < data.length; off += 8) {
    const block = (off / 8) % 0x400;
    const v = (seed + block) >>> 0;
    counter[4] = v & 0xff;
    counter[5] = (v >>> 8) & 0xff;
    counter[6] = (v >>> 16) & 0xff;
    counter[7] = v >>> 24;
    const ks = f(counter);
    for (let i = 0; i < 8 && off + i < data.length; i++) out[off + i] = data[off + i]! ^ ks[i]!;
  }
  return out;
}

const u32le = (b: Uint8Array, o: number) => (b[o]! | (b[o + 1]! << 8) | (b[o + 2]! << 16) | (b[o + 3]! << 24)) >>> 0;
const TIEN = "TIEN0100";

/** A method 13 payload to its inflated TIXC stream. */
export function decryptMethod13(payload: Uint8Array): Uint8Array {
  if (payload.length < 40) throw new Error("method 13 payload is shorter than its 40-byte header");
  const header = ecb(HEADER_KEY, payload.subarray(0, 40), false);
  if (String.fromCharCode(...header.subarray(0, 8)) !== TIEN) throw new Error("bad method 13 header");
  if (u32le(header, 8) !== 0x400) throw new Error("unsupported method 13 block size");
  const body = cryptBody(payload.subarray(40), u32le(header, 12), header.subarray(16, 37));
  return inflateSync(body);
}

/** A TIXC stream to a method 13 payload. */
export function encryptMethod13(tixc: Uint8Array, seed = DEFAULT_SEED, keyMaterial = DEFAULT_KEY_MATERIAL): Uint8Array {
  const deflated = deflateSync(tixc, { level: 9 });
  const header = new Uint8Array(40);
  header.set(Array.from(TIEN, (c) => c.charCodeAt(0)), 0);
  new DataView(header.buffer).setUint32(8, 0x400, true);
  new DataView(header.buffer).setUint32(12, seed >>> 0, true);
  header.set(keyMaterial, 16);
  const out = new Uint8Array(40 + deflated.length);
  out.set(ecb(HEADER_KEY, header, true), 0);
  out.set(cryptBody(deflated, seed, keyMaterial), 40);
  return out;
}
