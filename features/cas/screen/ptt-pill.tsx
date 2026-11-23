// SPDX-License-Identifier: GPL-3.0-or-later
/**
 * Press-to-Test's sign above the calculator: a blinking light, as the
 * handheld's LED blinks during a test, and when the test started, so a
 * supervisor can see at a glance that it's on and hasn't been restarted.
 */
import { useEffect, useState } from "react";
import { pttLines, pttSince, type PressToTest } from "../state/ptt";

export function PttPill({ test }: { test: PressToTest }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(t);
  }, []);
  const since = pttSince(test, now);
  return (
    <span
      role="status"
      title={pttLines(test).join("\n")}
      className="inline-flex h-8 items-center gap-2 rounded-full border border-amber-400/30 bg-amber-400/10 px-3 text-[12px] font-medium text-amber-200"
    >
      <span aria-hidden className="size-2 rounded-full bg-emerald-400 motion-safe:animate-pulse" />
      <span>
        Press-to-Test <span className="text-amber-200/70">{since}</span>
      </span>
    </span>
  );
}
