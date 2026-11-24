// SPDX-License-Identifier: GPL-3.0-or-later
// Ported from libnspire (GPL-3.0-or-later), https://github.com/Vogtinator/libnspire:
// src/init.c, src/data.c, src/service.c, src/services/file.c, dir.c and devinfo.c.
/**
 * A NavNet session with the handheld: the address exchange, then one
 * service at a time (files 0x4060, device info 0x4020), each request
 * answered before the next goes. The steps and their bytes follow
 * libnspire, which has been tested against real calculators.
 */
import type { PacketLink } from "./transport";
import { Build, decodeNavNet, encodeNavNet, Scan, type NavNet } from "./wire";

const HOST_ADDR = 0x6400;
const DEVICE_ADDR = 0x6401;
const FILES = 0x4060;
const DEVINFO = 0x4020;
/** A service's disconnect goes from this service id. */
const DISCONNECT = 0x40de;
/** How long one reply may take. Writing a big file is many replies, each its own wait. */
const REPLY_MS = 15_000;

export type Entry = { name: string; size: number; date: number; dir: boolean };

export type DeviceInfo = {
  name: string;
  os: string;
  storage: { free: number; total: number };
  ram: { free: number; total: number };
  battery: "powered" | "low" | "ok" | "unknown";
  charging: boolean;
  /** The extension documents have (tns), and an OS update file's, without the dot. */
  ext: { file: string; os: string };
  hwType: number;
  lcd: { width: number; height: number };
};

export class NavNetError extends Error {}

export class Session {
  private hostSid = 0x4003;
  private deviceSid = 0x4003;
  private seq = 1;
  private busy = false;

  constructor(
    private link: PacketLink,
    private cx2: boolean,
  ) {}

  /** The most data one packet carries. */
  get maxData() {
    return this.cx2 ? 1440 : 254;
  }

  /** The address exchange that opens the session. */
  async init() {
    // The original CX asks for an address first; the CX II's NNSE handshake has done that.
    if (!this.cx2) await this.link.recv(REPLY_MS);
    await this.link.send(encodeNavNet(this.packet(Uint8Array.of(0x64, 0x01, 0xff, 0x00))));
    this.hostSid = 0x8000;
  }

  private packet(data: Uint8Array, over: Partial<NavNet> = {}): NavNet {
    return { srcAddr: HOST_ADDR, dstAddr: DEVICE_ADDR, srcSid: this.hostSid, dstSid: this.deviceSid, ack: 0, seq: this.cx2 ? 0 : this.seq, data, ...over };
  }

  private async recvPacket(): Promise<NavNet> {
    for (;;) {
      const p = decodeNavNet(await this.link.recv(REPLY_MS));
      if (p) return p;
      // A damaged packet: the original CX would resend once refused; the CX II's NNSE checksum has caught it already.
    }
  }

  private ackFor(p: NavNet, nack = false) {
    return encodeNavNet(this.packet(Uint8Array.of(p.dstSid >> 8, p.dstSid & 0xff), { srcSid: nack ? 0xd3 : p.seq ? 0xff : 0xfe, dstSid: p.srcSid, seq: p.seq, ack: 0x0a }));
  }

  /** A packet meant for no service of ours: a disconnect is acknowledged, anything else refused. */
  private async unknown(p: NavNet) {
    await this.link.send(this.ackFor(p, p.dstSid !== DISCONNECT));
  }

  private async write(data: Uint8Array, srcSid?: number) {
    if (data.length > this.maxData) throw new NavNetError("Too much data for one packet");
    await this.link.send(encodeNavNet(this.packet(data, srcSid === undefined ? {} : { srcSid })));
    // The CX II's acknowledgement came with the NNSE message.
    if (this.cx2) return;
    for (;;) {
      const p = await this.recvPacket();
      if (p.dstSid !== this.hostSid) {
        await this.unknown(p);
        continue;
      }
      if (p.srcSid === 0xff || p.srcSid === 0xfe) {
        this.seq = (this.seq + 1) & 0xff || 1;
        return;
      }
      if (p.srcSid === 0xd3) throw new NavNetError("The handheld refused a packet.");
    }
  }

  private async read(): Promise<Uint8Array> {
    for (;;) {
      const p = await this.recvPacket();
      if (p.dstSid !== this.hostSid) {
        await this.unknown(p);
        continue;
      }
      if (!this.cx2) await this.link.send(this.ackFor(p));
      return p.data;
    }
  }

  /** One service conversation, disconnected afterwards whatever happens. One at a time. */
  private async service<T>(sid: number, body: () => Promise<T>): Promise<T> {
    if (this.busy) throw new NavNetError("The link is busy.");
    this.busy = true;
    this.deviceSid = sid;
    try {
      return await body();
    } finally {
      try {
        await this.write(Uint8Array.of(this.hostSid >> 8, this.hostSid & 0xff), DISCONNECT);
      } catch {
        // The conversation is over either way.
      }
      this.hostSid = (this.hostSid + 1) & 0xffff;
      this.busy = false;
    }
  }

  // ---------------------------------------------------------------- files and folders

  /** What's in a folder ("/" is the top of the handheld's documents). */
  list(path: string): Promise<Entry[]> {
    return this.service(FILES, async () => {
      await this.write(new Build().u8(0x0d).name(path).zero().bytes());
      const r = await this.read();
      if (r[1] === 0x0a) throw new NavNetError(`There's no folder ${path} on the handheld.`);
      if (r[1] === 0x0f) throw new NavNetError(`${path} isn't a folder the handheld can list.`);
      const out: Entry[] = [];
      for (;;) {
        await this.write(Uint8Array.of(0x0e));
        const e = await this.read();
        if (e[0] === 0xff) break;
        const s = new Scan(e).skip(3);
        const name = s.name();
        const size = s.u32();
        const date = s.u32();
        const dir = s.u8() === 1;
        if (name !== "." && name !== "..") out.push({ name, size, date, dir });
      }
      await this.write(Uint8Array.of(0x0f));
      await this.read();
      return out;
    });
  }

  readFile(path: string, onProgress?: (done: number, total: number) => void): Promise<Uint8Array> {
    return this.service(FILES, async () => {
      await this.write(new Build().u16(0x0701).name(path).bytes());
      const r = new Scan(await this.read());
      if (r.u16() !== 0x0301) throw new NavNetError(`There's no file ${path} on the handheld.`);
      // libnspire reads nine zero bytes here (an empty name), then the size.
      const total = r.skip(9).u32();
      await this.write(Uint8Array.of(0x04));
      const out = new Uint8Array(total);
      let done = 0;
      while (done < total) {
        const chunk = await this.read();
        // Each chunk starts with its code (0x05).
        const body = chunk.subarray(1, 1 + Math.min(chunk.length - 1, total - done));
        out.set(body, done);
        done += body.length;
        onProgress?.(done, total);
        if (!body.length) throw new NavNetError("The handheld sent an empty piece of the file.");
      }
      await this.write(Uint8Array.of(0xff, 0x00));
      return out;
    });
  }

  writeFile(path: string, data: Uint8Array, onProgress?: (done: number, total: number) => void): Promise<void> {
    return this.service(FILES, async () => {
      await this.write(new Build().u16(0x0301).name(path).u32(data.length).bytes());
      const r = await this.read();
      if (r[0] !== 0x04) throw new NavNetError(`The handheld wouldn't take ${path}. Its memory may be full.`);
      const room = this.maxData - 1;
      for (let at = 0; at < data.length; at += room) {
        const piece = data.subarray(at, at + room);
        const out = new Uint8Array(piece.length + 1);
        out[0] = 0x05;
        out.set(piece, 1);
        await this.write(out);
        onProgress?.(Math.min(at + room, data.length), data.length);
      }
      if (new Scan(await this.read()).u16() !== 0xff00) throw new NavNetError(`The handheld didn't keep ${path}.`);
    });
  }

  private simple(sid: number, request: Uint8Array, failure: string): Promise<void> {
    return this.service(sid, async () => {
      await this.write(request);
      const r = await this.read();
      if (new Scan(r).u16() !== 0xff00) throw new NavNetError(failure);
    });
  }

  remove(path: string) {
    return this.simple(FILES, new Build().u16(0x0901).name(path).zero().bytes(), `The handheld couldn't delete ${path}.`);
  }
  move(from: string, to: string) {
    return this.simple(FILES, new Build().u16(0x2101).name(from).name(to).zero().bytes(), `The handheld couldn't move ${from}. Is the new name taken?`);
  }
  copy(from: string, to: string) {
    return this.simple(FILES, new Build().u16(0x0c01).name(from).name(to).zero().bytes(), `The handheld couldn't copy ${from}.`);
  }
  mkdir(path: string) {
    return this.simple(FILES, new Build().u16(0x0a03).name(path).bytes(), `The handheld couldn't make the folder ${path}. Is the name taken?`);
  }
  rmdir(path: string) {
    return this.simple(FILES, new Build().u16(0x0b03).name(path).bytes(), `The handheld couldn't delete the folder ${path}.`);
  }

  // ---------------------------------------------------------------- the device

  info(): Promise<DeviceInfo> {
    return this.service(DEVINFO, async () => {
      await this.write(Uint8Array.of(0x01));
      const s = new Scan(await this.read()).skip(1);
      const storage = { free: s.u64(), total: s.u64() };
      const ram = { free: s.u64(), total: s.u64() };
      const batt = s.u8();
      s.skip(1);
      const charging = s.u8() !== 0;
      s.skip(1); // clock speed
      const [maj, min] = [s.u8(), s.u8()];
      const build = s.u16();
      s.skip(8 + 4 + 2 + 4); // boot1, boot2, hardware version, run level, lcd x and y
      const lcd = { width: s.u16(), height: s.u16() };
      s.skip(2);
      const hwType = s.u8();
      await this.write(Uint8Array.of(0x02));
      const name = new Scan(await this.read()).skip(1).str();
      await this.write(Uint8Array.of(0x03));
      const e = new Scan(await this.read()).skip(1);
      // A real CX II says ".tns" and ".tcc2", with the dot.
      const ext = { file: e.str().replace(/^\./, ""), os: e.str().replace(/^\./, "") };
      return {
        name,
        // The minor byte holds two digits: 5, 30, 564 is OS 5.3.0.564.
        os: `${maj}.${Math.floor(min / 10)}.${min % 10}.${build}`,
        storage,
        ram,
        battery: batt === 0x00 ? "powered" : batt === 0xf1 ? "low" : batt === 0x7f ? "ok" : "unknown",
        charging,
        ext,
        hwType,
        lcd,
      };
    });
  }
}
