// SPDX-License-Identifier: GPL-3.0-or-later
// Ported from libnspire (GPL-3.0-or-later), https://github.com/Vogtinator/libnspire: src/cx2.cpp.
/**
 * Carrying NavNet packets to and from the handheld over USB.
 *
 * A USB read can't be cancelled, so one loop reads for as long as the link
 * is open and sorts what arrives: the CX II's handshake (an address request
 * and a time request, answered here), acknowledgements, and stream messages,
 * which carry NavNet packets and wait in an inbox until they're asked for.
 *
 * Found on a real CX II (OS 5.3), beyond libnspire: the calculator offers its
 * handshake about every 15 seconds while it has no host, only once per time
 * it's plugged in, and afterwards takes only the message numbered one after
 * the last it took, ignoring any other without a word. A reloaded page starts
 * counting again, so it finds the number again (resync) and remembers it.
 */
import { Addr, decodeNnse, encodeNavNet, encodeNnse, NAVNET_HEADER, NNSE_MAX, nnseSum, splitNnse, Svc } from "./wire";

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

/** How long to wait for the CX II's handshake: it comes round about every 15 seconds. */
export const HANDSHAKE_MS = 35_000;

/**
 * Where an NNSE link starts numbering its messages, and where to say when the number
 * moves on, so the app can keep it between visits.
 */
export type NnseOptions = { clock?: () => number; seq?: number; onSeq?: (next: number) => void };

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** NavNet's opening packet (the address exchange): harmless to send again, so resync probes with it. */
const PROBE = encodeNavNet({ srcAddr: 0x6400, dstAddr: 0x6401, srcSid: 0x4003, dstSid: 0x4003, ack: 0, seq: 0, data: Uint8Array.of(0x64, 0x01, 0xff, 0x00) });
/** Resync sends this many numbers at a time, and tries this many runs. */
const WINDOW = 256;
const WINDOWS = 16;

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
  /** Drop what's waiting to be taken. */
  clear() {
    this.items = [];
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
  private seqno: number;
  private buf: Uint8Array = new Uint8Array(0);
  private streams = new Inbox<Uint8Array>();
  private acks = new Map<number, () => void>();
  private ready = false;
  private onReady: (() => void)[] = [];
  /** Writes one at a time, in order. */
  private writing: Promise<unknown> = Promise.resolve();
  private clock: () => number;
  private onSeq?: (next: number) => void;
  /** Resync hears every acknowledgement while it runs. */
  private ackSeen: ((seq: number) => void) | null = null;
  private starting: Promise<void> | null = null;

  constructor(
    private pipe: Pipe,
    opts: NnseOptions = {},
  ) {
    this.clock = opts.clock ?? (() => Date.now());
    this.seqno = (opts.seq ?? 0) & 0xffff;
    this.onSeq = opts.onSeq;
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

  /** A message with the next number: every message counts, whatever its service. */
  private message(service: number, data: Uint8Array, reqAck = 0) {
    const seqno = this.seqno;
    this.seqno = (seqno + 1) & 0xffff;
    this.onSeq?.(this.seqno);
    return encodeNnse({ service, src: Addr.Me, dest: Addr.Calc, reqAck, seqno, data });
  }

  private handle(raw: Uint8Array) {
    const m = decodeNnse(raw);
    if (!m || (m.dest !== Addr.Me && m.dest !== Addr.All)) return;
    if (m.service & Svc.Ack) {
      this.ackSeen?.(m.seqno);
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
        this.becomeReady();
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

  private becomeReady() {
    this.ready = true;
    for (const f of this.onReady.splice(0)) f();
  }

  /** Whether the handshake is done within the time (false when it isn't: the link is still usable). */
  private handshakeWithin(ms: number): Promise<boolean> {
    if (this.ready) return Promise.resolve(true);
    return new Promise((resolve) => {
      const done = () => {
        clearTimeout(timer);
        resolve(true);
      };
      const timer = setTimeout(() => {
        this.onReady = this.onReady.filter((f) => f !== done);
        resolve(false);
      }, ms);
      this.onReady.push(done);
    });
  }

  /**
   * Ready to carry packets. A calculator just plugged in offers its handshake soon (and
   * again about every 15 seconds). One that already had a session (the page reloaded, or
   * the tab closed) offers none until it's unplugged: it carries on that session, and
   * resync finds where it had got to.
   */
  private whenReady(): Promise<void> {
    if (this.ready) return Promise.resolve();
    if (this.broken) return Promise.reject(this.broken);
    return (this.starting ??= (async () => {
      if (await this.handshakeWithin(2500)) return;
      if (await this.resync()) return;
      if (await this.handshakeWithin(HANDSHAKE_MS)) return;
      if (this.broken) throw this.broken;
      throw new LinkError("The handheld didn't answer. Unplug it and plug it in again with its screen on, then connect.");
    })().finally(() => (this.starting = null)));
  }

  /**
   * The calculator takes only the message numbered one after the last it took. So send a
   * run of numbers, each with the harmless opening packet: it takes the one it was waiting
   * for and every one after, and its acknowledgements say which. The remembered number
   * goes first, then runs from 0 up.
   */
  private async resync(): Promise<boolean> {
    const seen: number[] = [];
    this.ackSeen = (seq) => seen.push(seq);
    try {
      const first = (this.seqno - 32) & 0xffff;
      const starts = [first];
      for (let from = 0; starts.length < WINDOWS; from += WINDOW) if (Math.abs(from - first) >= WINDOW) starts.push(from);
      for (const from of starts) {
        if (this.ready || this.broken) return this.ready;
        for (let i = 0; i < WINDOW; i++) await this.write(encodeNnse({ service: Svc.Stream, src: Addr.Me, dest: Addr.Calc, reqAck: 1, seqno: (from + i) & 0xffff, data: PROBE }));
        // It works through the run slowly (a real CX II took seconds for a couple of hundred),
        // and the next number is only known once it's finished: wait until the acknowledgements stop.
        const until = Date.now() + 15_000;
        let count = -1;
        await sleep(400);
        while (seen.length !== count && Date.now() < until) {
          count = seen.length;
          await sleep(500);
        }
        if (seen.length) {
          this.seqno = (seen[seen.length - 1]! + 1) & 0xffff;
          this.onSeq?.(this.seqno);
          // Anything said back to the probes isn't for the session about to start.
          this.streams.clear();
          this.becomeReady();
          return true;
        }
      }
      return false;
    } finally {
      this.ackSeen = null;
    }
  }

  async send(packet: Uint8Array) {
    if (this.broken) throw this.broken;
    await this.whenReady();
    // Acknowledged within a few seconds. One more try, with the same number (it only takes
    // the next one) and flagged as a retry, before giving up.
    const msg = this.message(Svc.Stream, packet, 0x01);
    const seq = (msg[8]! << 8) | msg[9]!;
    for (let attempt = 0; attempt < 2; attempt++) {
      if (attempt) {
        msg[5] = 0x09;
        msg[10] = msg[11] = 0;
        const sum = nnseSum(msg) ^ 0xffff;
        msg[10] = sum >> 8;
        msg[11] = sum & 0xff;
      }
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
        for (;;) this.inbox.put(await this.pipe.read(NAVNET_HEADER + 254));
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
