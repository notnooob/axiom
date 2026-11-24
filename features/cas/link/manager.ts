// SPDX-License-Identifier: GPL-3.0-or-later
/**
 * The one connected handheld, outside React so a second render (StrictMode)
 * can't open the device twice. A handheld picked earlier in this visit, or
 * before a reload, is opened again by itself; unplugging it is noticed, and
 * the browser forgets it then (handheld.ts), so it's picked again after.
 */
import { Handheld, isHandheld, usb, type UsbDevice } from "./handheld";
import { FILTERS } from "./handheld";

export type LinkState =
  | { status: "unsupported" }
  | { status: "none" }
  | { status: "connecting" }
  | { status: "connected"; handheld: Handheld }
  | { status: "error"; error: string };

let state: LinkState = usb() ? { status: "none" } : { status: "unsupported" };
const listeners = new Set<() => void>();
let opening: Promise<void> | null = null;
let started = false;

function set(s: LinkState) {
  state = s;
  for (const f of listeners) f();
}

export const linkState = () => state;

export function subscribe(f: () => void) {
  listeners.add(f);
  start();
  return () => listeners.delete(f);
}

/**
 * The CX II's next message number, kept between visits: after a reload the calculator is
 * still in the last session and takes only the number after its last (transport.ts).
 */
const SEQ_KEY = "axiom.handheld.seq";
const savedSeq = () => {
  try {
    return Number(window.localStorage.getItem(SEQ_KEY)) || 0;
  } catch {
    return 0;
  }
};
const saveSeq = (n: number) => {
  try {
    window.localStorage.setItem(SEQ_KEY, String(n));
  } catch {
    // Without storage, resync finds it each time.
  }
};

/** The connected handheld, or null. */
export const connected = (): Handheld | null => (state.status === "connected" && !state.handheld.gone ? state.handheld : null);

async function openDevice(dev: UsbDevice) {
  if (opening) return opening;
  set({ status: "connecting" });
  opening = (async () => {
    try {
      set({ status: "connected", handheld: await Handheld.open(dev, { seq: savedSeq(), onSeq: saveSeq }) });
    } catch (e) {
      set({ status: "error", error: (e as Error).message || "The handheld couldn't be opened." });
    } finally {
      opening = null;
    }
  })();
  return opening;
}

/** Ask the browser for a handheld (needs a click) and open it. */
export async function pickHandheld(): Promise<void> {
  const u = usb();
  if (!u) return;
  let dev: UsbDevice;
  try {
    dev = await u.requestDevice({ filters: FILTERS });
  } catch {
    // The student closed the chooser.
    return;
  }
  await openDevice(dev);
}

export async function disconnect() {
  const s = state;
  set({ status: "none" });
  if (s.status === "connected") await s.handheld.close();
}

/** Listen for plugging in and out, and open a handheld picked before that's already plugged in. */
function start() {
  const u = usb();
  if (started || !u) return;
  started = true;
  u.addEventListener("connect", ({ device }) => {
    if (isHandheld(device) && state.status !== "connected") void openDevice(device);
  });
  u.addEventListener("disconnect", ({ device }) => {
    if (state.status === "connected" && state.handheld.device === device) set({ status: "none" });
  });
  void u.getDevices().then((devs) => {
    const d = devs.find(isHandheld);
    if (d && state.status === "none") void openDevice(d);
  });
}
