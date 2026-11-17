// SPDX-License-Identifier: GPL-3.0-or-later
import { useEffect, useLayoutEffect, useRef } from "react";
import type { PyShellPage, PythonPage } from "../state/document";

/**
 * The Python editor: the program's file name over its source, with line
 * numbers. The textarea takes typing directly; the keypad's keys come in
 * through `insert` (cas-app). Ctrl+R runs it in the Shell.
 */
export function PythonEditor({
  page,
  onChange,
  editorRef,
}: {
  page: PythonPage;
  onChange: (source: string) => void;
  editorRef: (el: HTMLTextAreaElement | null) => void;
}) {
  const lines = page.source.split("\n").length;
  const gutter = useRef<HTMLDivElement>(null);
  return (
    <div className="absolute inset-0 flex flex-col bg-casScreen font-casui text-casInk">
      <div className="flex shrink-0 items-center justify-between border-b border-casRule bg-casTab px-[2cqw] py-[0.8cqw] text-[3.4cqw]">
        <span className="font-semibold">{page.file}</span>
        <span className="text-casLabel">Ctrl+R runs it</span>
      </div>
      <div className="flex min-h-0 flex-1">
        <div
          ref={gutter}
          aria-hidden
          className="w-[7cqw] shrink-0 overflow-hidden border-r border-casRule bg-[#f7f7f7] pt-[1cqw] text-right font-casmono text-[calc(3.4cqw*var(--axiom-text,1))] leading-[1.45] text-casDim"
        >
          {Array.from({ length: lines }, (_, i) => (
            <div key={i} className="pr-[1cqw]">
              {i + 1}
            </div>
          ))}
        </div>
        <textarea
          ref={editorRef}
          data-py-editor
          value={page.source}
          spellCheck={false}
          autoCapitalize="off"
          autoCorrect="off"
          aria-label={`Python program ${page.file}`}
          onChange={(e) => onChange(e.target.value)}
          onScroll={(e) => {
            if (gutter.current) gutter.current.scrollTop = e.currentTarget.scrollTop;
          }}
          className="min-w-0 flex-1 resize-none whitespace-pre bg-transparent px-[1.4cqw] pt-[1cqw] font-casmono text-[calc(3.4cqw*var(--axiom-text,1))] leading-[1.45] outline-hidden"
        />
      </div>
    </div>
  );
}

/** The Shell: printed output, errors in red, and the line being typed after ">>>" (or after an input() prompt). */
export function PythonShell({ page, prompt, status }: { page: PyShellPage; prompt: string | null; status: string }) {
  const box = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    box.current?.scrollTo({ top: box.current.scrollHeight });
  }, [page.lines.length, page.input, prompt]);
  const busy = status === "running" && prompt === null;
  return (
    <div ref={box} className="absolute inset-0 overflow-y-auto bg-casScreen px-[2cqw] py-[1.4cqw] font-casmono text-[calc(3.4cqw*var(--axiom-text,1))] leading-[1.45] text-casInk scrollbar-thin">
      {page.lines.map((l, i) => (
        <div key={i} className={l.kind === "err" ? "whitespace-pre-wrap text-[#c0281d]" : "whitespace-pre-wrap"}>
          {l.kind === "in" ? `>>>${l.text}` : l.text}
        </div>
      ))}
      {status === "loading" && <div className="text-casLabel">Starting Python…</div>}
      {!busy && (
        <div className="whitespace-pre-wrap">
          {prompt ?? ">>>"}
          {page.input}
          <span className="ml-px inline-block h-[1.1em] w-[0.12em] translate-y-[0.2em] animate-pulse bg-casInk" />
        </div>
      )}
    </div>
  );
}

export type DrawOp = { op: string; args: unknown[] } | { op: "textAt"; row: number; text: string; align: string };

/**
 * What ti_draw and ti_plotlib draw: replayed onto a 318×212 canvas (the
 * handheld's screen), over the Shell while a program draws.
 */
export function PythonCanvas({ ops }: { ops: DrawOp[] }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = canvas.current?.getContext("2d");
    if (!c) return;
    c.setTransform(2, 0, 0, 2, 0, 0);
    c.fillStyle = "#fff";
    c.fillRect(0, 0, 318, 212);
    let colour = "#000";
    let win: [number, number, number, number] | null = null;
    const X = (x: number) => (win ? ((x - win[0]) / (win[1] - win[0])) * 318 : x);
    const Y = (y: number) => (win ? ((win[3] - y) / (win[3] - win[2])) * 212 : y);
    const n = (v: unknown) => Number(v);
    c.lineWidth = 1;
    c.font = "11px 'Source Sans 3 Variable', sans-serif";
    for (const d of ops) {
      if (d.op === "textAt") {
        const t = d as { row: number; text: string; align: string };
        c.fillStyle = colour;
        c.textAlign = t.align === "right" ? "right" : t.align === "center" ? "center" : "left";
        c.fillText(t.text, t.align === "right" ? 314 : t.align === "center" ? 159 : 4, t.row * 17 - 4);
        continue;
      }
      const a = (d as { args: unknown[] }).args;
      c.strokeStyle = c.fillStyle = colour;
      switch (d.op) {
        case "clear":
          c.fillStyle = "#fff";
          c.fillRect(0, 0, 318, 212);
          break;
        case "clear_rect":
          c.fillStyle = "#fff";
          c.fillRect(X(n(a[0])), Y(n(a[1])), n(a[2]), n(a[3]));
          break;
        case "color":
          colour = `rgb(${n(a[0])},${n(a[1])},${n(a[2])})`;
          break;
        case "pen":
          c.lineWidth = a[0] === "thick" ? 3 : a[0] === "medium" ? 2 : 1;
          c.setLineDash(a[1] === "dashed" ? [6, 4] : a[1] === "dotted" ? [1, 3] : []);
          break;
        case "window":
          win = [n(a[0]), n(a[1]), n(a[2]), n(a[3])];
          break;
        case "line":
          c.beginPath();
          c.moveTo(X(n(a[0])), Y(n(a[1])));
          c.lineTo(X(n(a[2])), Y(n(a[3])));
          c.stroke();
          break;
        case "rect":
          c.strokeRect(X(n(a[0])), Y(n(a[1])), n(a[2]), n(a[3]));
          break;
        case "fill_rect":
          c.fillRect(X(n(a[0])), Y(n(a[1])), n(a[2]), n(a[3]));
          break;
        case "circle":
        case "fill_circle":
          c.beginPath();
          c.arc(X(n(a[0])), Y(n(a[1])), n(a[2]), 0, Math.PI * 2);
          if (d.op === "circle") c.stroke();
          else c.fill();
          break;
        case "arc":
        case "fill_arc": {
          const [x, y, w, h, s, e] = a.map(n) as [number, number, number, number, number, number];
          c.beginPath();
          c.ellipse(X(x) + w / 2, Y(y) + h / 2, w / 2, h / 2, 0, (-s * Math.PI) / 180, (-(s + e) * Math.PI) / 180, true);
          if (d.op === "arc") c.stroke();
          else c.fill();
          break;
        }
        case "text":
          c.textAlign = "left";
          c.fillText(String(a[2]), X(n(a[0])), Y(n(a[1])));
          break;
        case "poly":
        case "fill_poly": {
          const xs = (a[0] as number[]) ?? [];
          const ys = (a[1] as number[]) ?? [];
          c.beginPath();
          xs.forEach((x, i) => (i ? c.lineTo(X(x), Y(ys[i]!)) : c.moveTo(X(x), Y(ys[i]!))));
          c.closePath();
          if (d.op === "poly") c.stroke();
          else c.fill();
          break;
        }
        case "point":
          c.fillRect(X(n(a[0])) - 1.5, Y(n(a[1])) - 1.5, 3, 3);
          break;
      }
    }
  }, [ops]);
  return (
    <div className="absolute inset-0 bg-white">
      <canvas ref={canvas} width={636} height={424} className="h-full w-full" aria-label="Python drawing" />
    </div>
  );
}
