// SPDX-License-Identifier: GPL-3.0-or-later
// Ported from libnspire (GPL-3.0-or-later), https://github.com/Vogtinator/libnspire: src/cx2.cpp.
/**
 * Carrying NavNet packets to and from the handheld over USB.
 *
 * A USB read can't be cancelled, so one loop reads for as long as the link
 * is open and sorts what arrives: the CX II's handshake (an address request
 * and a time request, answered here), acknowledgements, and stream messages,
 * which carry NavNet packets and wait in an inbox until they're asked for.
 */
import { Addr, decodeNnse, encodeNnse, NNSE_HEADER, NNSE_MAX, splitNnse, Svc } from "./wire";

/** One USB bulk endpoint pair. read resolves with one transfer; both reject once the device has gone. */
export interface Pipe {
  read(maxLen: number): Promise<Uint8Array>;
  write(data: Uint8Array): Promise<void>;
}

/** Whole NavNet packets out and in. */
export interface PacketLink {
  send(packet: Uint8Array): Promise<void>;
  recv(timeoutMs: number): Promise<Uint8Array>;
  /** Once it's broken (unplugged, or an error), every call fails with this. */
  readonly broken: Error | null;
}

export class LinkError extends Error {}

/** Values waiting to be taken, in order, with a time limit on each wait. */
export class Inbox<T> {
  private items: T[] = [];
  private waiting: { resolve: (v: T) => void; reject: (e: Error) => void }[] = [];
  private failed: Error | null = null;
  put(v: T) {
    const w = this.waiting.shift();
    if (w) w.resolve(v);
    else this.items.push(v);
  }
  fail(e: Error) {
    this.failed = e;
    for (const w of this.waiting.splice(0)) w.reject(e);
  }
  take(timeoutMs: number, what: string): Promise<T> {
    if (this.items.length) return Promise.resolve(this.items.shift()!);
    if (this.failed) return Promise.reject(this.failed);
    return new Promise<T>((resolve, reject) => {
      const w = {
        resolve: (v: T) => {
          clearTimeout(timer);
          resolve(v);
        },
        reject: (e: Error) => {
          clearTimeout(timer);
          reject(e);
        },
      };
      const timer = setTimeout(() => {
        this.waiting = this.waiting.filter((x) => x !== w);
        reject(new LinkError(what));
      }, timeoutMs);
      this.waiting.push(w);
    });
  }
}

/** The CX II: NavNet packets in NNSE stream messages, each acknowledged. */
export class NnseLink implements PacketLink {
  broken: Error | null = null;
  private seqno = 0;
  private buf: Uint8Array = new Uint8Array(0);
  private streams = new Inbox<Uint8Array>();
  private acks = new Map<number, () => void>();
  private ready = false;
  private onReady: (() => void)[] = [];
  /** Writes one at a time, in order. */
  private writing: Promise<unknown> = Promise.resolve();

  constructor(
    private pipe: Pipe,
    private clock: () => number = () => Date.now(),
  ) {
    void this.pump();
  }

  private async pump() {
    try {
      for (;;) this.feed(await this.pipe.read(NNSE_MAX));
    } catch (e) {
      this.breakWith(e instanceof Error ? e : new Error(String(e)));
    }
  }

  private breakWith(e: Error) {
    if (this.broken) return;
    this.broken = e;
    this.streams.fail(e);
  }

  /** Bytes from the calculator, cut into messages. */
  feed(chunk: Uint8Array) {
    const all = new Uint8Array(this.buf.length + chunk.length);
    all.set(this.buf);
    all.set(chunk, this.buf.length);
    const { messages, rest } = splitNnse(all);
    this.buf = rest;
    for (const m of messages) this.handle(m);
  }

  private write(bytes: Uint8Array) {
    const next = this.writing.then(() => this.pipe.write(bytes));
    this.writing = next.catch(() => undefined);
    return next;
  }

  private message(service: number, data: Uint8Array, reqAck = 0) {
    return encodeNnse({ service, src: Addr.Me, dest: Addr.Calc, reqAck, seqno: this.seqno++, data });
  }

  private handle(raw: Uint8Array) {
    const m = decodeNnse(raw);
    if (!m || (m.dest !== Addr.Me && m.dest !== Addr.All)) return;
    if (m.service & Svc.Ack) {
      this.acks.get(m.seqno)?.();
      return;
    }
    if (m.reqAck & 1)
      void this.write(encodeNnse({ misc: m.misc, service: m.service | Svc.Ack, src: m.dest, dest: m.src, unknown: m.unknown, reqAck: m.reqAck & ~1, seqno: m.seqno, data: new Uint8Array(0) })).catch(() => undefined);
    switch (m.service) {
      case Svc.AddrReq:
        if (m.data[0] !== 0) return;
        // libnspire's note: the calculator sometimes ignores the first message after
        // reconnecting, so the answer goes twice; a second one it receives is ignored.
        for (let i = 0; i < 2; i++) void this.write(this.message(Svc.AddrReq, Uint8Array.of(0x80))).catch(() => undefined);
        return;
      case Svc.Time: {
        if (m.data[0] !== 0) return;
        const out = new Uint8Array(1 + 4 + 8 + 4);
        out[0] = 0x80;
        new DataView(out.buffer).setUint32(1, Math.floor(this.clock() / 1000));
        void this.write(this.message(Svc.Time, out)).catch(() => undefined);
        // The time request is the handshake's last step.
        this.ready = true;
        for (const f of this.onReady.splice(0)) f();
        return;
      }
      case Svc.Unknown:
        if (m.data.length === 1 && m.data[0] === 1) void this.write(this.message(Svc.Unknown, Uint8Array.of(0x81, 0x03))).catch(() => undefined);
        return;
      case Svc.Stream:
        this.streams.put(m.data);
        return;
    }
  }

  /** The handshake done: the calculator starts it once the link opens. */
  waitReady(timeoutMs: number): Promise<void> {
    if (this.ready) return Promise.resolve();
    if (this.broken) return Promise.reject(this.broken);
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new LinkError("The handheld didn't start talking. Make sure it's on and unlocked, then plug it in again.")), timeoutMs);
      this.onReady.push(() => {
        clearTimeout(timer);
        resolve();
      });
    });
  }

  async send(packet: Uint8Array) {
    if (this.broken) throw this.broken;
    await this.waitReady(20_000);
    // Acknowledged within a few seconds; one more try (flagged as a retry) before giving up.
    for (let attempt = 0; attempt < 2; attempt++) {
      const msg = this.message(Svc.Stream, packet, attempt ? 0x09 : 0x01);
      const seq = (msg[8]! << 8) | msg[9]!;
      const acked = new Promise<boolean>((resolve) => {
        const timer = setTimeout(() => resolve(false), 5000);
        this.acks.set(seq, () => {
          clearTimeout(timer);
          resolve(true);
        });
      });
      await this.write(msg);
      const ok = await acked;
      this.acks.delete(seq);
      if (ok) return;
      if (this.broken) throw this.broken;
    }
    throw new LinkError("The handheld stopped answering.");
  }

  recv(timeoutMs: number) {
    return this.streams.take(timeoutMs, "The handheld took too long to answer.");
  }
}

/** The original CX: NavNet packets on their own, one per USB transfer. */
export class RawLink implements PacketLink {
  broken: Error | null = null;
  private inbox = new Inbox<Uint8Array>();
  constructor(private pipe: Pipe) {
    void (async () => {
      try {
        for (;;) this.inbox.put(await this.pipe.read(NNSE_HEADER + 4 + 254));
      } catch (e) {
        this.broken = e instanceof Error ? e : new Error(String(e));
        this.inbox.fail(this.broken);
      }
    })();
  }
  async send(packet: Uint8Array) {
    if (this.broken) throw this.broken;
    await this.pipe.write(packet);
  }
  recv(timeoutMs: number) {
    return this.inbox.take(timeoutMs, "The handheld took too long to answer.");
  }
}
