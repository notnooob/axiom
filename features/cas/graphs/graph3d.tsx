// SPDX-License-Identifier: GPL-3.0-or-later
/**
 * 3D Graphing (Graphs ▸ View ▸ 3D Graphing): surfaces z1(x, y), z2 … over
 * the x and y range, drawn as shaded patches seen from a direction the
 * arrows (or a drag) turn, with the axes through the origin.
 */
import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { palette } from "@/shared/lib/tokens";
import type { Giac } from "../engine/evaluate";
import type { Cursor } from "../math/cursor";
import { selection } from "../math/editor";
import { MathView } from "../math/render";
import { chars } from "../math/tree";
import type { GraphsPage } from "../state/document";

/** The engine's name for a page's surface. */
export const surfaceName = (page: number, n: number) => `g${page}z${n}_`;

/** Where the view looks from, and the x and y range; the handheld's default turn. */
export const VIEW3D = { yaw: -0.7, pitch: 0.55, min: -5, max: 5 };

const GRID = 28;
const COLOURS = [palette.casF1, palette.casF2, palette.casF3, palette.casF4, palette.casF5, palette.casF6];

type Surface = { n: number; z: number[][] };

function rgb(hex: string): [number, number, number] {
  const v = Number.parseInt(hex.slice(1), 16);
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
}

export function Graph3D({
  page,
  giac,
  ready,
  onTurn,
  onCursor,
  onSelect,
}: {
  page: GraphsPage;
  giac: Giac | null;
  ready: boolean;
  /** A drag turned the view by these angles. */
  onTurn: (dyaw: number, dpitch: number) => void;
  onCursor: (c: Cursor) => void;
  onSelect: (from: Cursor, to: Cursor) => void;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const box = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [surfaces, setSurfaces] = useState<Surface[]>([]);
  const view = { ...VIEW3D, ...page.view3d };
  const list = page.surfaces ?? [];
  const key = list.map((s) => `${s.n}:${s.text}:${s.hidden ? 1 : 0}`).join("|") + `:${view.min}:${view.max}`;

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    if (!giac || !ready) return;
    let cancelled = false;
    void (async () => {
      const out: Surface[] = [];
      const step = (view.max - view.min) / GRID;
      for (const s of list) {
        if (s.hidden) continue;
        const raw = await giac(`evalf(seq(seq(${surfaceName(page.id, s.n)}(${view.min}+i_*${step},${view.min}+j_*${step}),j_,0,${GRID}),i_,0,${GRID}))`);
        const rows = raw
          .trim()
          .replace(/^\[\[|\]\]$/g, "")
          .split(/\]\s*,\s*\[/)
          .map((r) => r.split(",").map((t) => (/^[-+0-9.eE]+$/.test(t.trim()) ? Number(t) : NaN)));
        out.push({ n: s.n, z: rows });
      }
      if (!cancelled) setSurfaces(out);
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- key stands for the surfaces
  }, [giac, ready, key, page.id]);

  useEffect(() => {
    const c = canvas.current;
    if (!c || !size.w) return;
    const dpr = window.devicePixelRatio || 1;
    c.width = size.w * dpr;
    c.height = size.h * dpr;
    const g = c.getContext("2d");
    if (!g) return;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.fillStyle = palette.casScreen;
    g.fillRect(0, 0, size.w, size.h);
    // z is scaled into the same box as x and y.
    const zs = surfaces.flatMap((s) => s.z.flat()).filter(Number.isFinite);
    const [zlo, zhi] = zs.length ? [Math.min(...zs), Math.max(...zs)] : [-5, 5];
    const span = view.max - view.min;
    const zscale = zhi - zlo > 1e-9 ? span / (zhi - zlo) : 1;
    const zmid = (zlo + zhi) / 2;
    const [cy, sy, cp, sp] = [Math.cos(view.yaw), Math.sin(view.yaw), Math.cos(view.pitch), Math.sin(view.pitch)];
    const scale = Math.min(size.w, size.h) / (span * 1.9);
    // A point of the graph on screen, and how far back it is.
    const project = (x: number, y: number, z: number): [number, number, number] => {
      const zz = (z - zmid) * zscale;
      const X = x * cy - y * sy;
      const Y = x * sy + y * cy;
      const up = zz * cp - Y * sp;
      const depth = zz * sp + Y * cp;
      return [size.w / 2 + X * scale, size.h / 2 - up * scale, depth];
    };
    const step = span / GRID;
    const quads: { pts: [number, number][]; depth: number; colour: [number, number, number]; light: number }[] = [];
    surfaces.forEach((s) => {
      const base = rgb(COLOURS[(s.n - 1) % COLOURS.length]!);
      for (let i = 0; i < GRID; i++)
        for (let j = 0; j < GRID; j++) {
          const corners = [
            [i, j],
            [i + 1, j],
            [i + 1, j + 1],
            [i, j + 1],
          ].map(([a, b]) => [view.min + a! * step, view.min + b! * step, s.z[a!]?.[b!] ?? NaN] as const);
          if (corners.some((c) => !Number.isFinite(c[2]))) continue;
          const p = corners.map((c) => project(c[0], c[1], c[2]));
          // Shade by how squarely the patch faces the light (from above and in front).
          const [ux, uy, uz] = [corners[1]![0] - corners[0]![0], corners[1]![1] - corners[0]![1], (corners[1]![2] - corners[0]![2]) * zscale];
          const [vx, vy, vz] = [corners[3]![0] - corners[0]![0], corners[3]![1] - corners[0]![1], (corners[3]![2] - corners[0]![2]) * zscale];
          const n = [uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx];
          const len = Math.hypot(n[0]!, n[1]!, n[2]!) || 1;
          const light = 0.45 + 0.55 * Math.abs(n[2]! / len);
          quads.push({ pts: p.map((q) => [q[0], q[1]]), depth: p.reduce((t, q) => t + q[2], 0) / 4, colour: base, light });
        }
    });
    quads.sort((a, b) => b.depth - a.depth);
    for (const q of quads) {
      g.beginPath();
      q.pts.forEach(([x, y], k) => (k ? g.lineTo(x, y) : g.moveTo(x, y)));
      g.closePath();
      const [r, gg, b] = q.colour.map((v) => Math.round(255 - (255 - v) * q.light * 0.8));
      g.fillStyle = `rgb(${r},${gg},${b})`;
      g.fill();
      g.strokeStyle = "rgba(0,0,0,0.18)";
      g.lineWidth = 0.6;
      g.stroke();
    }
    // The axes, through the origin, with their names at the positive ends.
    g.strokeStyle = palette.casInk;
    g.fillStyle = palette.casInk;
    g.lineWidth = 1.2;
    g.font = `${Math.max(10, size.w * 0.03)}px Arial, Helvetica, sans-serif`;
    const zAt = (v: number) => v / zscale + zmid;
    for (const [name, a, b] of [
      ["x", project(view.min, 0, zmid), project(view.max, 0, zmid)],
      ["y", project(0, view.min, zmid), project(0, view.max, zmid)],
      ["z", project(0, 0, zAt(-span / 2)), project(0, 0, zAt(span / 2))],
    ] as const) {
      g.beginPath();
      g.moveTo(a[0], a[1]);
      g.lineTo(b[0], b[1]);
      g.stroke();
      g.fillText(name, b[0] + 4, b[1] - 4);
    }
  }, [size, surfaces, view.yaw, view.pitch, view.min, view.max]);

  const drag = useRef<{ x: number; y: number } | null>(null);
  const pointer = {
    onPointerDown: (e: ReactPointerEvent) => {
      drag.current = { x: e.clientX, y: e.clientY };
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    },
    onPointerMove: (e: ReactPointerEvent) => {
      const d = drag.current;
      if (!d || !size.w) return;
      onTurn(((e.clientX - d.x) / size.w) * 3, ((e.clientY - d.y) / size.h) * 3);
      drag.current = { x: e.clientX, y: e.clientY };
    },
    onPointerUp: () => {
      drag.current = null;
    },
  };

  return (
    <div className="absolute inset-0 flex flex-col">
      {page.editing !== null && page.entryKind === "z" && (
        <div className="flex min-h-[9cqw] items-center gap-[0.4em] border-b-[0.3cqw] border-casStrip bg-casScreen py-[1cqw] pl-[4.4cqw] pr-[2cqw] text-[4.4cqw]">
          <MathView row={chars(`z${page.editing}(x,y)=`)} />
          <MathView row={page.edit.row} cursor={page.edit.cursor} selection={selection(page.edit)} onPick={onCursor} onSelect={onSelect} />
        </div>
      )}
      <div ref={box} className="relative min-h-0 flex-1 touch-none" {...pointer}>
        <canvas ref={canvas} className="absolute inset-0 h-full w-full" />
        <div className="pointer-events-none absolute left-[1.6cqw] top-[1.2cqw] flex flex-col font-casmath text-[3.6cqw]">
          {list
            .filter((s) => !s.hidden)
            .map((s) => (
              <span key={s.n} className="inline-flex items-center" style={{ color: COLOURS[(s.n - 1) % COLOURS.length] }}>
                <b>z{s.n}</b>
                <MathView row={[...chars("(x,y)="), ...s.row]} />
              </span>
            ))}
        </div>
        {!list.length && page.editing === null && (
          <div className="pointer-events-none absolute inset-x-0 bottom-[2cqw] text-center font-casui text-[3.4cqw] text-casDim">Press enter to type z(x,y); the arrows turn the view</div>
        )}
      </div>
    </div>
  );
}
