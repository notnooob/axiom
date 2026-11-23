// SPDX-License-Identifier: GPL-3.0-or-later
/**
 * The link against a simulated CX II (fake-calc.ts): the framing, checksums,
 * acknowledgements and each service's steps agree end to end; only a real
 * handheld can confirm the calculator's side.
 */
import { describe, expect, it } from "vitest";
import { Handheld } from "./handheld";
import { FakeCalc } from "./fake-calc";
import { NnseLink } from "./transport";
import { Build, decodeNavNet, decodeNnse, encodeNavNet, encodeNnse, navnetCrc, nnseSum, Scan } from "./wire";

const HOST = 0x6400;
const DEV = 0x6401;


describe("wire formats", () => {
  it("checks NNSE messages", () => {
    const m = encodeNnse({ service: 4, src: 0xfe, dest: 1, reqAck: 1, seqno: 7, data: Uint8Array.of(1, 2, 3) });
    expect(nnseSum(m)).toBe(0xffff);
    expect(decodeNnse(m)).toMatchObject({ service: 4, seqno: 7, data: Uint8Array.of(1, 2, 3) });
    m[13] ^= 1;
    expect(decodeNnse(m)).toBeNull();
  });

  it("round-trips small and big NavNet packets", () => {
    for (const n of [0, 5, 254, 255, 1440]) {
      const data = Uint8Array.from({ length: n }, (_, i) => (i * 7) & 0xff);
      const p = { srcAddr: HOST, dstAddr: DEV, srcSid: 0x8000, dstSid: 0x4060, ack: 0, seq: 3, data };
      expect(decodeNavNet(encodeNavNet(p))).toEqual(p);
    }
  });

  it("computes NavNet's data checksum as libnspire does", () => {
    // Worked by hand, step by step through calculate_data_checksum.
    expect(navnetCrc(Uint8Array.of(0x01))).toBe(0x0100);
    expect(navnetCrc(Uint8Array.of(0x12, 0x34, 0x56))).toBe(0x65a7);
    expect(navnetCrc(new Uint8Array(0))).toBe(0);
  });

  it("pads names to eight bytes and reads them back", () => {
    const b = new Build().u16(0x0301).name("a.tns").u32(9).bytes();
    expect(b.length).toBe(2 + 9 + 4);
    const s = new Scan(b);
    expect([s.u16(), s.name(), s.u32()]).toEqual([0x0301, "a.tns", 9]);
  });
});

describe("a handheld on the link", () => {
  const connect = async () => {
    const calc = new FakeCalc();
    const h = await Handheld.over(new NnseLink(calc.pipe, () => 1_700_000_000_000), true);
    return { calc, h };
  };

  it("says what it is", async () => {
    const { h } = await connect();
    expect(h.info).toMatchObject({ name: "TI-Nspire CX II CAS", os: "6.2.0.300", storage: { free: 50_000_000, total: 100_000_000 }, battery: "ok", ext: { file: "tns" }, lcd: { width: 320, height: 240 } });
  });

  it("lists, sends, reads, renames and deletes documents", async () => {
    const { calc, h } = await connect();
    expect(await h.list("/")).toEqual([{ name: "Examples", size: 0, date: 1_700_000_000, dir: true }]);
    expect((await h.list("/Examples")).map((e) => e.name)).toEqual(["Welcome.tns"]);
    // Bigger than one packet, so it goes in pieces.
    const doc = Uint8Array.from({ length: 4000 }, (_, i) => (i * 31) & 0xff);
    const seen: number[] = [];
    await h.write("/Homework.tns", doc, (done) => seen.push(done));
    expect(calc.files.get("/Homework.tns")).toEqual(doc);
    expect(seen.at(-1)).toBe(4000);
    expect(await h.read("/Examples/Welcome.tns")).toEqual(calc.files.get("/Examples/Welcome.tns"));
    await h.rename("/Homework.tns", "/Homework 2.tns");
    expect([...calc.files.keys()]).toContain("/Homework 2.tns");
    await h.remove("/Homework 2.tns");
    expect(calc.files.has("/Homework 2.tns")).toBe(false);
    await expect(h.remove("/nope.tns")).rejects.toThrow(/couldn't delete/);
    // A failure leaves the link usable.
    expect((await h.list("/")).length).toBe(1);
  });

  it("makes and deletes folders", async () => {
    const { calc, h } = await connect();
    await h.mkdir("/Maths");
    expect(calc.dirs.has("/Maths")).toBe(true);
    await expect(h.mkdir("/Maths")).rejects.toThrow(/taken/);
    await h.rmdir("/Maths");
    expect(calc.dirs.has("/Maths")).toBe(false);
    await expect(h.list("/Maths")).rejects.toThrow(/no folder/);
  });

  it("picks up a session an earlier page left open, finding the message number it waits for", async () => {
    // As a real CX II does after a reload: no handshake, and only message 1234 taken next.
    const calc = new FakeCalc({ resume: 1234 });
    const saved: number[] = [];
    const h = await Handheld.over(new NnseLink(calc.pipe, { onSeq: (n) => saved.push(n) }), true);
    expect(h.info.name).toBe("TI-Nspire CX II CAS");
    expect((await h.list("/")).map((e) => e.name)).toEqual(["Examples"]);
    // The number it got to is kept, so the next page starts there and needs one short run.
    const next = saved.at(-1)!;
    expect(next).toBe(calc.expected);
    const later = new FakeCalc({ resume: next });
    const again = await Handheld.over(new NnseLink(later.pipe, { seq: next }), true);
    expect((await again.list("/Examples")).map((e) => e.name)).toEqual(["Welcome.tns"]);
  }, 30_000);

  it("sends again when an acknowledgement goes missing", async () => {
    const { calc, h } = await connect();
    calc.dropAck = 1;
    await h.mkdir("/Retry");
    expect(calc.sawRetry).toBe(true);
    expect(calc.dirs.has("/Retry")).toBe(true);
  }, 15_000);

  it("runs requests one at a time when they're made together", async () => {
    const { h } = await connect();
    const [a, b] = await Promise.all([h.list("/"), h.list("/Examples")]);
    expect(a.map((e) => e.name)).toEqual(["Examples"]);
    expect(b.map((e) => e.name)).toEqual(["Welcome.tns"]);
  });
});
