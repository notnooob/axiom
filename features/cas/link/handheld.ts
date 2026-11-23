// SPDX-License-Identifier: GPL-3.0-or-later
/**
 * A TI-Nspire on a USB cable, through WebUSB (Chrome and Edge, on a
 * computer or Android): pick it once, and after that it's found again
 * whenever it's plugged in. Its documents can be listed, opened, sent,
 * renamed and deleted, as TI's own connect software does, and a document
 * opened from it saves back to it.
 *
 * Every call waits its turn (the handheld answers one request at a time).
 * Nothing goes anywhere but the cable.
 */
import { NavNetError, Session, type DeviceInfo, type Entry } from "./navnet";
import { LinkError, NnseLink, RawLink, type NnseOptions, type PacketLink, type Pipe } from "./transport";

/** TI's vendor id; the original CX and the CX II's product ids. */
const TI = 0x0451;
const PID_CX = 0xe012;
const PID_CX2 = 0xe022;
export const FILTERS = [
  { vendorId: TI, productId: PID_CX2 },
  { vendorId: TI, productId: PID_CX },
];

// The parts of WebUSB used here (TypeScript's DOM types don't include it).
type UsbEndpoint = { endpointNumber: number; direction: "in" | "out"; type: string };
type UsbInterface = { interfaceNumber: number; alternate: { endpoints: UsbEndpoint[] } };
export type UsbDevice = {
  productId: number;
  productName?: string;
  serialNumber?: string;
  opened: boolean;
  configuration: { configurationValue: number; interfaces: UsbInterface[] } | null;
  open(): Promise<void>;
  close(): Promise<void>;
  reset(): Promise<void>;
  selectConfiguration(n: number): Promise<void>;
  claimInterface(n: number): Promise<void>;
  clearHalt(direction: "in" | "out", ep: number): Promise<void>;
  transferIn(ep: number, len: number): Promise<{ data?: DataView; status: string }>;
  transferOut(ep: number, data: BufferSource): Promise<{ status: string }>;
};
type Usb = {
  requestDevice(o: { filters: typeof FILTERS }): Promise<UsbDevice>;
  getDevices(): Promise<UsbDevice[]>;
  addEventListener(t: "connect" | "disconnect", f: (e: { device: UsbDevice }) => void): void;
  removeEventListener(t: "connect" | "disconnect", f: (e: { device: UsbDevice }) => void): void;
};

export const usb = (): Usb | null => (typeof navigator !== "undefined" && "usb" in navigator ? (navigator as unknown as { usb: Usb }).usb : null);
export const isHandheld = (d: UsbDevice) => FILTERS.some((f) => f.productId === d.productId);

/** Open the device's first interface and its two bulk endpoints as a pipe. */
async function openPipe(dev: UsbDevice): Promise<Pipe> {
  if (!dev.opened) await dev.open();
  if (dev.configuration?.configurationValue !== 1) await dev.selectConfiguration(1);
  // As libnspire does: a reset makes the handheld start its handshake afresh,
  // even if an earlier session was left half way.
  await dev.reset().catch(() => undefined);
  const iface = dev.configuration?.interfaces[0];
  if (!iface) throw new LinkError("The handheld has no link interface. Is it in its normal mode (not updating its OS)?");
  await dev.claimInterface(iface.interfaceNumber);
  const eps = iface.alternate.endpoints;
  const epIn = eps.find((e) => e.direction === "in" && e.type === "bulk");
  const epOut = eps.find((e) => e.direction === "out" && e.type === "bulk");
  if (!epIn || !epOut) throw new LinkError("The handheld's link endpoints weren't found.");
  return {
    async read(maxLen) {
      for (;;) {
        const r = await dev.transferIn(epIn.endpointNumber, maxLen);
        if (r.status === "stall") {
          await dev.clearHalt("in", epIn.endpointNumber);
          continue;
        }
        if (!r.data) continue;
        return new Uint8Array(r.data.buffer, r.data.byteOffset, r.data.byteLength);
      }
    },
    async write(data) {
      const r = await dev.transferOut(epOut.endpointNumber, data as BufferSource);
      if (r.status === "stall") {
        await dev.clearHalt("out", epOut.endpointNumber);
        throw new LinkError("The handheld refused the data.");
      }
    },
  };
}

export type Progress = (done: number, total: number) => void;

export class Handheld {
  /** Calls wait their turn here. */
  private queue: Promise<unknown> = Promise.resolve();
  private constructor(
    readonly device: UsbDevice | null,
    private session: Session,
    private link: PacketLink,
    public info: DeviceInfo,
    readonly cx2: boolean,
  ) {}

  /** Over any packet link: WebUSB in the app, a simulated calculator in tests. */
  static async over(link: PacketLink, cx2: boolean, device: UsbDevice | null = null): Promise<Handheld> {
    const session = new Session(link, cx2);
    await session.init();
    const info = await session.info();
    return new Handheld(device, session, link, info, cx2);
  }

  /** Open a handheld the browser has given us. */
  /** opts: where the CX II's message numbers start, and where to say they've moved on (transport.ts). */
  static async open(dev: UsbDevice, opts: NnseOptions = {}): Promise<Handheld> {
    const pipe = await openPipe(dev);
    const cx2 = dev.productId === PID_CX2;
    const link = cx2 ? new NnseLink(pipe, opts) : new RawLink(pipe);
    try {
      return await Handheld.over(link, cx2, dev);
    } catch (e) {
      await dev.close().catch(() => undefined);
      throw e;
    }
  }

  get gone() {
    return Boolean(this.link.broken);
  }

  /** One request at a time; a failure doesn't stop the next one. */
  private run<T>(f: () => Promise<T>): Promise<T> {
    const next = this.queue.then(f, f);
    this.queue = next.catch(() => undefined);
    return next.catch((e: unknown) => {
      throw friendly(e);
    });
  }

  list(path: string): Promise<Entry[]> {
    return this.run(() => this.session.list(path));
  }
  read(path: string, onProgress?: Progress): Promise<Uint8Array> {
    return this.run(() => this.session.readFile(path, onProgress));
  }
  write(path: string, data: Uint8Array, onProgress?: Progress): Promise<void> {
    return this.run(() => this.session.writeFile(path, data, onProgress));
  }
  remove(path: string) {
    return this.run(() => this.session.remove(path));
  }
  rename(from: string, to: string) {
    return this.run(() => this.session.move(from, to));
  }
  mkdir(path: string) {
    return this.run(() => this.session.mkdir(path));
  }
  rmdir(path: string) {
    return this.run(() => this.session.rmdir(path));
  }
  async refresh(): Promise<DeviceInfo> {
    this.info = await this.run(() => this.session.info());
    return this.info;
  }
  async close() {
    await this.device?.close().catch(() => undefined);
  }
}

/** Errors in words a student can act on. */
function friendly(e: unknown): Error {
  if (e instanceof LinkError || e instanceof NavNetError) return e;
  const msg = e instanceof Error ? e.message : String(e);
  if (/disconnected|no device|NotFoundError/i.test(msg)) return new LinkError("The handheld was unplugged.");
  if (/access denied|claim|SecurityError|NetworkError/i.test(msg))
    return new LinkError("The browser couldn't use the handheld. Close TI's own software (it holds the cable), then plug the handheld in again.");
  return new LinkError(msg);
}

/** a/b and /c → a/b/c, with no doubled slashes. */
export const joinPath = (folder: string, name: string) => `${folder.replace(/\/+$/, "")}/${name}`;
export const parentPath = (path: string) => path.replace(/\/[^/]*$/, "") || "/";
export const baseName = (path: string) => path.slice(path.lastIndexOf("/") + 1);
