// SPDX-License-Identifier: GPL-3.0-or-later
// Ported line by line from TnsTools (MIT, github.com/MaksimirKurtov/TnsTools)
// tixc_decode.py and tixc_encode.py. State numbers follow the original.
/**
 * TIXC0100: TI's token-compressed XML. Tag and attribute names go into
 * dictionaries on first use and are referenced by index after; text packs
 * common letters and digits two to a byte and re-encodes UTF-8.
 */

const ETA = bytes(" etaionsrhAlcduFmfpgybwvkxqjz,.'");
const DIGIT = bytes("0123456789AN,.EFx; (){}[]^+-/*PB");
const TAG_END = new Set([0x0e, 0x0f, 0x20, 0x2f, 0x3e]);
const CDATA_OPEN = bytes("<![CDATA[");
const CDATA_CLOSE = bytes("]]>");
const A = 0x41, F = 0x46, N = 0x4e, E = 0x45, P = 0x50, B = 0x42;

function bytes(s: string): Uint8Array {
  return new TextEncoder().encode(s);
}

function specialDigit(b: number): number[] {
  if (b === N) return [0xe2, 0x88, 0x92]; // −
  if (b === E) return [0xef, 0x80, 0x80]; // TI's EE
  if (b === P) return [0x29, 0x29];
  if (b === B) return [0x5d, 0x5b];
  return [b];
}

class TextDecoderState {
  state = 0;
  count = 0;
  tmp = 0;
  reset() {
    this.state = this.count = this.tmp = 0;
  }
  decode(byte: number): number[] {
    const s = this.state;
    if (s === 0) {
      if (byte < 0xa0) {
        const needsUtf = (byte <= 0x1f && (((-9729 >>> 0) >>> byte) & 1) === 1) || byte >= 0x7f;
        if (needsUtf) {
          if ((byte & 0xf0) === 0x80) {
            this.count = (byte & 0x0f) + 1;
            this.state = 28;
            return [];
          }
          if (byte >= 8) {
            if (byte === 8) {
              this.state = 30;
              return [];
            }
            if (byte === 11) {
              this.state = 33;
              return [];
            }
            throw new Error(`unsupported TIXC text control byte 0x${byte.toString(16)}`);
          }
          this.tmp = (((byte & 7) | 0xf0) << 2) & 0xff;
          this.count = 1;
          this.state = 27;
          return [];
        }
        return [byte];
      }
      if ((byte & 0xf0) === 0xa0) {
        const ch = ETA[byte & 0x0f]!;
        if (ch === F) {
          this.state = 24;
          return [];
        }
        if (ch === A) {
          this.state = 0;
          return [];
        }
        this.state = 23;
        return [ch];
      }
      if ((byte & 0xf0) === 0xf0) {
        const ch = DIGIT[byte & 0x0f]!;
        if (ch === A) {
          this.state = 26;
          return [];
        }
        if (ch === F) {
          this.state = 0;
          return [];
        }
        this.state = 25;
        return specialDigit(ch);
      }
      return [];
    }
    if (s === 23) {
      const ch1 = ETA[byte >> 4]!;
      if (ch1 === F) return [ETA[(byte & 0x0f) + 16]!];
      if (ch1 === A) {
        this.state = 0;
        return [];
      }
      const ch2 = ETA[byte & 0x0f]!;
      if (ch2 === F) {
        this.state = 24;
        return [ch1];
      }
      if (ch2 === A) {
        this.state = 0;
        return [ch1];
      }
      return [ch1, ch2];
    }
    if (s === 24) {
      const out = [ETA[(byte >> 4) + 16]!];
      const ch2 = ETA[byte & 0x0f]!;
      if (ch2 === F) return out;
      if (ch2 === A) {
        this.state = 0;
        return out;
      }
      this.state = 23;
      return [...out, ch2];
    }
    if (s === 25) {
      const ch1 = DIGIT[byte >> 4]!;
      if (ch1 === A) {
        const ch2 = DIGIT[(byte & 0x0f) + 16]!;
        return specialDigit(ch2);
      }
      if (ch1 === F) {
        this.state = 0;
        return [];
      }
      const out = specialDigit(ch1);
      const ch2 = DIGIT[byte & 0x0f]!;
      if (ch2 === A) {
        this.state = 26;
        return out;
      }
      if (ch2 === F) {
        this.state = 0;
        return out;
      }
      return [...out, ...specialDigit(ch2)];
    }
    if (s === 26) {
      const out = specialDigit(DIGIT[(byte >> 4) + 16]!);
      const ch2 = DIGIT[byte & 0x0f]!;
      if (ch2 === A) return out;
      if (ch2 === F) {
        this.state = 0;
        return out;
      }
      this.state = 25;
      return [...out, ...specialDigit(ch2)];
    }
    if (s === 27) {
      this.state = 0;
      this.count = 0;
      return [(this.tmp | (byte >> 6)) & 0xff, (byte & 0x3f) | 0x80];
    }
    if (s === 28) {
      this.state = 29;
      this.tmp = byte;
      return [(byte >> 4) | 0xe0];
    }
    if (s === 29) {
      this.count -= 1;
      this.state = this.count <= 0 ? 0 : 28;
      return [((byte >> 6) | (((this.tmp & 0x0f) | 0xe0) << 2)) & 0xff, (byte & 0x3f) | 0x80];
    }
    if (s === 30) {
      this.tmp = byte;
      this.state = 31;
      if (byte >= 0x20) {
        this.count = 2;
        return [0xf8, (byte >> 2) | 0x80];
      }
      this.count = 1;
      return [((byte >> 2) & 7) | 0xf0];
    }
    if (s === 31 || s === 35) {
      this.count = 1;
      this.state = 32;
      const out = [((byte >> 4) | (((this.tmp & 3) | 0xf8) << 4)) & 0xff];
      this.tmp = byte;
      return out;
    }
    if (s === 32 || s === 36) {
      this.state = 0;
      this.count = 0;
      return [((byte >> 6) | (((this.tmp & 0x0f) | 0xe0) << 2)) & 0xff, (byte & 0x3f) | 0x80];
    }
    if (s === 33) {
      this.state = 34;
      if (byte >= 4) return [(((byte & 0x40) !== 0 ? 1 : 0) | 0xfc) & 0xff, (byte & 0x3f) | 0x80];
      return [(byte & 3) | 0xf8];
    }
    if (s === 34) {
      this.state = 35;
      this.tmp = byte;
      this.count = 1;
      return [(byte >> 2) | 0x80];
    }
    throw new Error(`unsupported TIXC text state ${s}`);
  }
}

/** Growable byte buffer. */
class Out {
  buf = new Uint8Array(1 << 16);
  len = 0;
  push(...bs: number[]) {
    for (const b of bs) {
      if (this.len === this.buf.length) {
        const next = new Uint8Array(this.buf.length * 2);
        next.set(this.buf);
        this.buf = next;
      }
      this.buf[this.len++] = b;
    }
  }
  add(bs: ArrayLike<number>) {
    for (let i = 0; i < bs.length; i++) this.push(bs[i]!);
  }
  bytes() {
    return this.buf.slice(0, this.len);
  }
}

const startsWith = (d: Uint8Array, s: Uint8Array, at: number) => s.every((b, i) => d[at + i] === b);
const indexOf = (d: Uint8Array, b: number, from: number) => d.indexOf(b, from);

export function decodeTixc(data: Uint8Array): Uint8Array {
  if (!startsWith(data, bytes("TIXC"), 0)) throw new Error("TIXC stream does not start with TIXC");
  const dash = indexOf(data, 0x2d, 4);
  const q = indexOf(data, 0x3f, dash + 1);
  if (dash < 0 || q < 0 || data[q + 1] !== 0x3e) throw new Error("invalid TIXC header");
  const out = new Out();
  out.add(bytes('<?xml version="'));
  out.add(data.subarray(dash + 1, q));
  out.add(bytes('" encoding="UTF-8" ?>'));
  const tags: Uint8Array[] = [];
  const attrs: Uint8Array[] = [];
  let token: number[] = [];
  const text = new TextDecoderState();
  let state = 1;
  let cdata = 0;
  let pos = q + 2;

  const fail = (msg: string): never => {
    const tail = new TextDecoder().decode(out.buf.subarray(Math.max(0, out.len - 120), out.len));
    throw new Error(`${msg} (at byte ${pos}, after …${tail})`);
  };
  while (pos < data.length) {
    const b = data[pos]!;
    switch (state) {
      case 1:
        if (b !== 0x3c) fail("expected root '<' after TIXC header");
        out.push(b);
        pos++;
        state = 2;
        break;
      case 2:
        if (TAG_END.has(b)) {
          if (b === 0x0e) {
            out.add(bytes("></"));
            state = 12;
          } else if (b === 0x0f) {
            out.push(0x20);
            state = 13;
          } else if (b === 0x20) {
            if (!token.length) fail("empty tag before attribute separator");
            out.push(0x20);
            state = 4;
          } else if (b === 0x2f) {
            out.push(0x2f);
            // <tag/ (self-closing) or </name> written out in full: once the tag
            // dictionary holds 256 names (big Graphs pages), closing tags for
            // names past it can't be referenced by index, so they're spelt out.
            // State 9 copies through to the '>' either way. (TnsTools went to
            // state 10 here, which only allows "/>", and failed on such files.)
            state = 9;
          } else {
            if (!token.length) fail("empty tag before '>'");
            out.push(0x3e);
            state = 3;
          }
          if (token.length) {
            if (tags.length < 256) tags.push(Uint8Array.from(token));
            token = [];
          }
          pos++;
        } else {
          if (token.length >= 64) fail("tag token exceeds 64 bytes");
          token.push(b);
          out.push(b);
          pos++;
        }
        break;
      case 3:
        text.reset();
        if (b === 0x3c) {
          out.push(b);
          pos++;
          token = [];
          state = 17;
        } else if (b === 0x0c) {
          out.push(0x3c);
          pos++;
          token = [];
          state = 11;
        } else if (b === 0x0e) {
          out.add(bytes("</"));
          pos++;
          token = [];
          state = 12;
        } else {
          token = [];
          state = 8;
        }
        break;
      case 4:
        if (b === 0x3d) {
          if (attrs.length < 256) attrs.push(Uint8Array.from(token));
          token = [];
          out.push(b);
          pos++;
          state = 5;
        } else {
          token.push(b);
          out.push(b);
          pos++;
        }
        break;
      case 5:
        pos++;
        if (b === 0x22) {
          out.push(b);
          state = 6;
        } else if (b !== 0x20) fail("expected quote after attribute '='");
        break;
      case 6:
        if (b === 0x22 && text.state === 0) {
          out.push(b);
          pos++;
          token = [];
          state = 7;
        } else {
          out.add(text.decode(b));
          pos++;
        }
        break;
      case 7:
        if (b === 0x3e) {
          out.push(b);
          pos++;
          state = 3;
        } else if (b === 0x2f) {
          out.push(b);
          pos++;
          state = 10;
        } else if (b === 0x20) {
          out.push(b);
          pos++;
          state = 4;
        } else if (b === 0x0f) {
          out.push(0x20);
          pos++;
          state = 13;
        } else fail(`unexpected byte 0x${b.toString(16)} after attribute value`);
        break;
      case 8:
        if (b === 0x3c && text.state === 0) {
          out.push(b);
          pos++;
          token = [];
          state = 2;
        } else if (b === 0x0c && text.state === 0) {
          out.push(0x3c);
          pos++;
          token = [];
          state = 11;
        } else if (b === 0x0e && text.state === 0) {
          out.add(bytes("</"));
          pos++;
          token = [];
          state = 12;
        } else {
          out.add(text.decode(b));
          pos++;
        }
        break;
      case 9:
        out.push(b);
        pos++;
        if (b === 0x3e) state = 3;
        break;
      case 10:
        if (b !== 0x3e) fail("expected '>' after '/'");
        out.push(b);
        pos++;
        state = 3;
        break;
      case 11:
        if (b >= tags.length) fail(`tag dictionary index ${b} out of range`);
        out.add(tags[b]!);
        pos++;
        state = 14;
        break;
      case 12:
        if (b >= tags.length) fail(`tag dictionary index ${b} out of range`);
        out.add(tags[b]!);
        out.push(0x3e);
        pos++;
        state = 3;
        break;
      case 13:
        if (b >= attrs.length) fail(`attribute dictionary index ${b} out of range`);
        out.add(attrs[b]!);
        out.add(bytes('="'));
        pos++;
        text.reset();
        state = 6;
        break;
      case 14:
        if (b === 0x20) {
          out.push(0x20);
          pos++;
          state = 4;
        } else if (b === 0x2f) {
          pos++;
          state = 15;
        } else if (b === 0x0f) {
          out.push(0x20);
          pos++;
          state = 13;
        } else {
          out.push(0x3e);
          state = 3;
        }
        break;
      case 15:
        if (b === 0x3e) {
          out.push(0x2f);
          state = 10;
        } else {
          out.push(0x3e);
          state = 3;
        }
        break;
      case 17:
        if (b === 0x21) {
          out.push(b);
          pos++;
          cdata = 2;
          state = 18;
        } else state = 2;
        break;
      case 18:
        if (cdata >= CDATA_OPEN.length) {
          state = 19;
          token = [];
          break;
        }
        if (b !== CDATA_OPEN[cdata]) fail("invalid CDATA opener");
        out.push(b);
        pos++;
        cdata++;
        break;
      case 19:
        out.push(b);
        pos++;
        if (b === 0x5d) {
          cdata = 1;
          state = 20;
        }
        break;
      case 20:
        out.push(b);
        pos++;
        if (cdata < CDATA_CLOSE.length && b === CDATA_CLOSE[cdata]) cdata++;
        else {
          state = 19;
          cdata = 0;
        }
        if (cdata === CDATA_CLOSE.length) {
          state = 3;
          cdata = 0;
        }
        break;
      default:
        fail(`unsupported TIXC parser state ${state}`);
    }
  }
  if (state !== 3) fail(`TIXC stream ended in state ${state}`);
  return out.bytes();
}

// ---- Encoder: literal first-use names, dictionary references after, text escaped only where TIXC needs it.

function encodeUtf8Seq(seq: Uint8Array): number[] {
  const [a, b, c, d] = seq as unknown as number[];
  if (seq.length === 2) return [(a! & 0x1c) >> 2, ((a! & 0x03) << 6) | (b! & 0x3f)];
  if (seq.length === 3) return [0x80, ((a! & 0x0f) << 4) | ((b! & 0x3c) >> 2), ((b! & 0x03) << 6) | (c! & 0x3f)];
  if (seq.length === 4)
    return [0x08, ((a! & 0x07) << 2) | ((b! & 0x30) >> 4), ((b! & 0x0f) << 4) | ((c! & 0x3c) >> 2), ((c! & 0x03) << 6) | (d! & 0x3f)];
  throw new Error("unsupported UTF-8 sequence");
}

function encodeText(data: Uint8Array, out: Out, afterRef = false) {
  let i = 0;
  // After a dictionary tag reference (implicit '>'), a literal space would read
  // as an attribute separator: send it as a one-letter table run instead (0xA0 = ETA[0]
  // = ' ', then the run's 'A' terminator).
  if (afterRef && data[0] === 0x20) {
    out.push(0xa0, 0xa0);
    i = 1;
  } else if (afterRef && data[0] === 0x2f) throw new Error("text starting with '/' after a repeated tag can't be encoded");
  while (i < data.length) {
    const b = data[i]!;
    if (b < 0x80) {
      if (b === 0x09 || b === 0x0a || b === 0x0d || (b >= 0x20 && b <= 0x7e)) {
        out.push(b);
        i++;
        continue;
      }
      throw new Error(`unsupported XML text control byte 0x${b.toString(16)}`);
    }
    const size = b >= 0xf0 ? 4 : b >= 0xe0 ? 3 : b >= 0xc0 ? 2 : 0;
    if (!size || i + size > data.length) throw new Error("invalid UTF-8 in XML text");
    out.push(...encodeUtf8Seq(data.subarray(i, i + size)));
    i += size;
  }
}

const isWs = (b: number | undefined) => b === 0x20 || b === 0x09 || b === 0x0d || b === 0x0a;
function nameEnd(d: Uint8Array, p: number) {
  while (p < d.length && !isWs(d[p]) && d[p] !== 0x2f && d[p] !== 0x3d && d[p] !== 0x3e) p++;
  return p;
}
function skipWs(d: Uint8Array, p: number) {
  while (p < d.length && isWs(d[p])) p++;
  return p;
}
const key = (b: Uint8Array) => String.fromCharCode(...b);

export function encodeTixc(xml: Uint8Array): Uint8Array {
  const m = /^<\?xml\s+version="([^"]+)"\s+encoding="UTF-8"\s+\?>/.exec(new TextDecoder().decode(xml.subarray(0, 64)));
  if (!m) throw new Error("XML must start with a UTF-8 declaration");
  const body = xml.subarray(bytes(m[0]).length);
  const out = new Out();
  out.add(bytes(`TIXC0100-${m[1]}?>`));
  const tagIndex = new Map<string, number>();
  /** The last thing written was a tag reference with an implicit '>'. */
  let afterRef = false;
  let i = 0;
  while (i < body.length) {
    if (body[i] === 0x3c) afterRef = false;
    if (startsWith(body, CDATA_OPEN, i)) {
      let end = i + 9;
      while (end < body.length && !startsWith(body, CDATA_CLOSE, end)) end++;
      if (end >= body.length) throw new Error("unterminated CDATA section");
      out.add(body.subarray(i, end + 3));
      i = end + 3;
      continue;
    }
    if (body[i] !== 0x3c) {
      let next = indexOf(body, 0x3c, i);
      if (next < 0) next = body.length;
      encodeText(body.subarray(i, next), out, afterRef);
      afterRef = false;
      i = next;
      continue;
    }
    if (body[i + 1] === 0x2f) {
      const end = indexOf(body, 0x3e, i + 2);
      if (end < 0) throw new Error("unterminated close tag");
      const idx = tagIndex.get(key(body.subarray(i + 2, end)));
      if (idx !== undefined) out.push(0x0e, idx);
      // A name past the full dictionary is closed in full, as TI's files do.
      else if (tagIndex.size >= 256) out.add(body.subarray(i, end + 1));
      else throw new Error("close tag has no dictionary entry");
      i = end + 1;
      continue;
    }
    if (body[i + 1] === 0x3f || body[i + 1] === 0x21) throw new Error("only CDATA markup is supported");
    let p = i + 1;
    const ne = nameEnd(body, p);
    if (ne === p) throw new Error("empty tag name");
    const name = body.subarray(p, ne);
    let idx = tagIndex.get(key(name));
    const usedRef = idx !== undefined;
    if (idx === undefined) {
      // The dictionary holds 256 names; after that a new name is written out every time.
      if (tagIndex.size < 256) tagIndex.set(key(name), tagIndex.size);
      out.push(0x3c);
      out.add(name);
    } else out.push(0x0c, idx);
    p = ne;
    let hasAttrs = false;
    for (;;) {
      p = skipWs(body, p);
      if (p >= body.length) throw new Error("unterminated start tag");
      if (body[p] === 0x2f && body[p + 1] === 0x3e) {
        out.push(0x2f, 0x3e);
        i = p + 2;
        break;
      }
      if (body[p] === 0x3e) {
        // A dictionary reference has an implicit '>' unless attributes followed it.
        if (!usedRef || hasAttrs) out.push(0x3e);
        afterRef = usedRef && !hasAttrs;
        i = p + 1;
        break;
      }
      const ae = nameEnd(body, p);
      const attr = body.subarray(p, ae);
      p = skipWs(body, ae);
      if (body[p] !== 0x3d) throw new Error("expected '=' after attribute");
      p = skipWs(body, p + 1);
      if (body[p] !== 0x22) throw new Error("expected double quote for attribute");
      const vs = p + 1;
      const ve = indexOf(body, 0x22, vs);
      if (ve < 0) throw new Error("unterminated attribute value");
      hasAttrs = true;
      out.push(0x20);
      out.add(attr);
      out.push(0x3d, 0x22);
      encodeText(body.subarray(vs, ve), out);
      out.push(0x22);
      p = ve + 1;
    }
  }
  return out.bytes();
}
