// SPDX-License-Identifier: GPL-3.0-or-later
/**
 * The one connected handheld, outside React so a second render (StrictMode)
 * can't open the device twice. A handheld the student has picked before is
 * opened again by itself when it's plugged in; unplugging it is noticed.
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

/** The connected handheld, or null. */
export const connected = (): Handheld | null => (state.status === "connected" && !state.handheld.gone ? state.handheld : null);

async function openDevice(dev: UsbDevice) {
  if (opening) return opening;
  set({ status: "connecting" });
  opening = (async () => {
    try {
      set({ status: "connected", handheld: await Handheld.open(dev) });
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
