// SPDX-License-Identifier: GPL-3.0-or-later
/**
 * A simulated CX II for tests (link.test.ts, and driving the app in a
 * browser without a calculator): the device's side of NNSE and NavNet,
 * written from the same reading of libnspire, with an in-memory file system.
 * It shows the two sides agree; only a real handheld can confirm the
 * calculator's. Not part of the app's bundle.
 */
import type { Pipe } from "./transport";
import { Addr, Build, decodeNavNet, decodeNnse, encodeNavNet, encodeNnse, Scan, splitNnse, Svc, type NavNet } from "./wire";

const HOST = 0x6400;
const DEV = 0x6401;

/** A CX II on the other end of a pipe. */
export class FakeCalc {
  files = new Map<string, Uint8Array>([["/Examples/Welcome.tns", Uint8Array.from({ length: 3000 }, (_, i) => i % 251)]]);
  dirs = new Set(["/", "/Examples"]);
  private out: Uint8Array[] = [];
  private readers: ((b: Uint8Array) => void)[] = [];
  private seq = 0;
  /** What the conversation with the current service is doing. */
  private conv: { kind: "write"; path: string; size: number; got: number[] } | { kind: "read"; data: Uint8Array } | { kind: "list"; items: [string, number, boolean][] } | null = null;
  /** Drop the host's next stream ack, to see it try again. */
  dropAck = 0;
  sawRetry = false;

  pipe: Pipe = {
    read: () => (this.out.length ? Promise.resolve(this.out.shift()!) : new Promise((r) => this.readers.push(r))),
    write: async (b) => this.receive(b),
  };

  constructor() {
    // The calculator opens with its handshake: an address request, then the time.
    this.sendNnse(Svc.AddrReq, Uint8Array.from([0, ...new Array(64).fill(0x41)]));
    this.sendNnse(Svc.Time, Uint8Array.of(0));
  }

  private push(b: Uint8Array) {
    // Big messages arrive in two transfers, to check they're put back together.
    const parts = b.length > 100 ? [b.subarray(0, 37), b.subarray(37)] : [b];
    for (const p of parts) {
      const r = this.readers.shift();
      if (r) r(p);
      else this.out.push(p);
    }
  }

  private sendNnse(service: number, data: Uint8Array) {
    this.push(encodeNnse({ service, src: Addr.Calc, dest: Addr.Me, reqAck: 1, seqno: this.seq++, data }));
  }

  private reply(to: NavNet, data: Uint8Array) {
    this.sendNnse(Svc.Stream, encodeNavNet({ srcAddr: DEV, dstAddr: HOST, srcSid: to.dstSid, dstSid: to.srcSid, ack: 0, seq: 0, data }));
  }

  private receive(b: Uint8Array) {
    for (const raw of splitNnse(b).messages) {
      const m = decodeNnse(raw);
      if (!m) throw new Error("The host sent a damaged NNSE message");
      if (m.service & Svc.Ack || m.service !== Svc.Stream) continue;
      if (m.reqAck === 0x09) this.sawRetry = true;
      if (this.dropAck) {
        this.dropAck--;
        continue;
      }
      this.push(encodeNnse({ service: Svc.Stream | Svc.Ack, src: Addr.Calc, dest: Addr.Me, reqAck: 0, seqno: m.seqno, data: new Uint8Array(0) }));
      const p = decodeNavNet(m.data);
      if (!p) throw new Error("The host sent a damaged NavNet packet");
      this.navnet(p);
    }
  }

  private navnet(p: NavNet) {
    const d = p.data;
    if (p.srcSid === 0x40de || (p.dstSid === 0x4003 && d[0] === 0x64)) {
      this.conv = null;
      return;
    }
    const s = new Scan(d);
    if (p.dstSid === 0x4020) {
      if (d[0] === 1) {
        const info = new Uint8Array(1 + 108);
        info[0] = 1;
        const v = new DataView(info.buffer);
        v.setBigUint64(1, 50_000_000n);
        v.setBigUint64(9, 100_000_000n);
        info[33] = 0x7f;
        info.set([6, 2, 0x01, 0x2c], 37);
        v.setUint16(1 + 58, 320);
        v.setUint16(1 + 60, 240);
        return this.reply(p, info);
      }
      if (d[0] === 2) return this.reply(p, new Build().u8(2).str("TI-Nspire CX II CAS").bytes());
      return this.reply(p, new Build().u8(3).str("tns").str("tco2").bytes());
    }
    const ok = () => this.reply(p, Uint8Array.of(0xff, 0x00));
    const no = () => this.reply(p, Uint8Array.of(0x0a, 0x00));
    const conv = this.conv;
    if (conv?.kind === "write" && d[0] === 0x05) {
      conv.got.push(...d.subarray(1));
      if (conv.got.length >= conv.size) {
        this.files.set(conv.path, Uint8Array.from(conv.got));
        ok();
      }
      return;
    }
    if (conv?.kind === "read") {
      if (d[0] === 0x04) for (let at = 0; at < conv.data.length; at += 1439) this.reply(p, Uint8Array.from([0x05, ...conv.data.subarray(at, at + 1439)]));
      return;
    }
    if (d[0] === 0x0d) {
      const path = s.skip(1).name();
      if (!this.dirs.has(path)) return this.reply(p, Uint8Array.of(0x0d, 0x0a));
      const under = (q: string) => q.startsWith(`${path === "/" ? "" : path}/`) && !q.slice(path === "/" ? 1 : path.length + 1).includes("/");
      this.conv = {
        kind: "list",
        items: [
          [".", 0, true],
          ...[...this.dirs].filter((q) => q !== "/" && under(q)).map((q) => [q.slice(q.lastIndexOf("/") + 1), 0, true] as [string, number, boolean]),
          ...[...this.files].filter(([q]) => under(q)).map(([q, b]) => [q.slice(q.lastIndexOf("/") + 1), b.length, false] as [string, number, boolean]),
        ],
      };
      return this.reply(p, Uint8Array.of(0x0d, 0x00));
    }
    if (d[0] === 0x0e && conv?.kind === "list") {
      const next = conv.items.shift();
      if (!next) return this.reply(p, Uint8Array.of(0xff, 0x00));
      return this.reply(p, new Build().u16(0x0e10).u8(0).name(next[0]).u32(next[1]).u32(1_700_000_000).u8(next[2] ? 1 : 0).zero().bytes());
    }
    if (d[0] === 0x0f) return ok();
    const op = s.u16();
    if (op === 0x0301) {
      const path = s.name();
      this.conv = { kind: "write", path, size: s.u32(), got: [] };
      return this.reply(p, Uint8Array.of(0x04));
    }
    if (op === 0x0701) {
      const data = this.files.get(s.name());
      if (!data) return no();
      this.conv = { kind: "read", data };
      return this.reply(p, new Build().u16(0x0301).zero().zero().zero().zero().zero().zero().zero().zero().zero().u32(data.length).bytes());
    }
    if (op === 0xff00) return;
    const path = s.name();
    if (op === 0x0901) return this.files.delete(path) ? ok() : no();
    if (op === 0x2101) {
      const to = s.name();
      const f = this.files.get(path);
      if (!f || this.files.has(to)) return no();
      this.files.delete(path);
      this.files.set(to, f);
      return ok();
    }
    if (op === 0x0a03) return this.dirs.has(path) ? no() : (this.dirs.add(path), ok());
    if (op === 0x0b03) return this.dirs.delete(path) ? ok() : no();
    no();
  }
}
