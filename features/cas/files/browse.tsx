// SPDX-License-Identifier: GPL-3.0-or-later
/**
 * My Documents, as the handheld's browser shows it: a Name / Size list with
 * folders that open in place, the selected row in blue. The list is a flat
 * array of visible rows (folders expanded or not) so the arrows just move an
 * index.
 */
import { useLayoutEffect, useRef } from "react";
import { cn } from "@/shared/lib/utils";
import type { Key } from "../keys";
import { nameOf, parentOf, ROOT, type FileRecord } from "./store";

export type BrowseState = { open: string[]; sel: number; sort: "name" | "size"; clip: string | null };
export const BROWSE_START: BrowseState = { open: [ROOT], sel: 0, sort: "name", clip: null };

export type BrowseRow = { path: string; name: string; depth: number; folder: boolean; size: number };

export function visibleRows(files: FileRecord[], state: BrowseState): BrowseRow[] {
  const sizes = new Map<string, number>();
  for (const f of files)
    if (f.type === "file") for (let p = f.path; p.includes("/"); p = parentOf(p)) sizes.set(parentOf(p), (sizes.get(parentOf(p)) ?? 0) + f.size);
  const children = new Map<string, FileRecord[]>();
  for (const f of files) children.set(parentOf(f.path), [...(children.get(parentOf(f.path)) ?? []), f]);
  const out: BrowseRow[] = [{ path: ROOT, name: ROOT, depth: 0, folder: true, size: sizes.get(ROOT) ?? 0 }];
  const walk = (folder: string, depth: number) => {
    if (!state.open.includes(folder)) return;
    const kids = (children.get(folder) ?? []).slice().sort((a, b) =>
      state.sort === "size" ? (sizes.get(b.path) ?? b.size) - (sizes.get(a.path) ?? a.size) : nameOf(a.path).localeCompare(nameOf(b.path), "en", { numeric: true, sensitivity: "base" }),
    );
    for (const k of kids) {
      const folderRow = k.type === "folder";
      out.push({ path: k.path, name: nameOf(k.path), depth, folder: folderRow, size: folderRow ? (sizes.get(k.path) ?? 0) : k.size });
      if (folderRow) walk(k.path, depth + 1);
    }
  };
  walk(ROOT, 1);
  return out;
}

export function formatSize(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)}M`;
  return `${Math.round(bytes / 1024)}K`;
}

/** The folder new files go into: the selected folder, or the selected file's folder. */
export function targetFolder(rows: BrowseRow[], sel: number): string {
  const r = rows[sel];
  if (!r) return ROOT;
  return r.folder ? r.path : parentOf(r.path);
}

export type BrowseEffect = { open?: string } | { delete?: string } | undefined;

export function browseKeyPress(state: BrowseState, rows: BrowseRow[], key: Key): { state: BrowseState; effect?: BrowseEffect } {
  const r = rows[state.sel];
  const toggle = (path: string, open: boolean) => ({
    ...state,
    open: open ? [...new Set([...state.open, path])] : state.open.filter((p) => p !== path && !p.startsWith(`${path}/`)),
  });
  switch (key.k) {
    case "down":
      return { state: { ...state, sel: Math.min(rows.length - 1, state.sel + 1) } };
    case "up":
      return { state: { ...state, sel: Math.max(0, state.sel - 1) } };
    case "right":
      return r?.folder ? { state: toggle(r.path, true) } : { state };
    case "left":
      if (r?.folder && state.open.includes(r.path) && r.path !== ROOT) return { state: toggle(r.path, false) };
      if (r && r.path !== ROOT) {
        const parent = rows.findIndex((x) => x.path === parentOf(r.path));
        return { state: { ...state, sel: Math.max(0, parent) } };
      }
      return { state };
    case "enter":
      if (!r) return { state };
      if (r.folder) return { state: toggle(r.path, !state.open.includes(r.path)) };
      return { state, effect: { open: r.path } };
    case "delete":
    case "backspace":
      return r && r.path !== ROOT ? { state, effect: { delete: r.path } } : { state };
    default:
      return { state };
  }
}

export function BrowseScreen({
  rows,
  state,
  onSelect,
  onOpen,
}: {
  rows: BrowseRow[];
  state: BrowseState;
  onSelect: (i: number) => void;
  onOpen: (i: number) => void;
}) {
  const list = useRef<HTMLDivElement>(null);
  // Keep the selected row in view.
  useLayoutEffect(() => {
    const el = list.current?.children[state.sel] as HTMLElement | undefined;
    el?.scrollIntoView({ block: "nearest" });
  }, [state.sel]);
  return (
    <div className="absolute inset-0 flex flex-col bg-casScreen font-casui text-[4.4cqw] text-casInk">
      <div className="grid shrink-0 grid-cols-[1fr_17cqw] border-b border-casRule bg-[#e0e0e0] text-[4.2cqw] font-bold text-[#555]">
        <span className="flex items-center justify-between px-[2cqw] py-[0.8cqw]">
          Name
          <span aria-hidden className="text-[3cqw]">{state.sort === "name" ? "▲" : ""}</span>
        </span>
        <span className="border-l border-casRule px-[2cqw] py-[0.8cqw]">Size{state.sort === "size" ? " ▼" : ""}</span>
      </div>
      <div ref={list} role="listbox" aria-label="My Documents" className="min-h-0 flex-1 overflow-y-auto scrollbar-thin">
        {rows.map((r, i) => {
          const on = i === state.sel;
          const open = state.open.includes(r.path);
          return (
            <div
              key={r.path}
              role="option"
              aria-selected={on}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => (on ? onOpen(i) : onSelect(i))}
              onDoubleClick={() => onOpen(i)}
              className={cn("grid h-[7.2cqw] cursor-default grid-cols-[1fr_17cqw] items-center", on ? "bg-casSelect text-white" : "")}
            >
              <span className="flex min-w-0 items-center gap-[1.6cqw] truncate" style={{ paddingLeft: `${1.6 + r.depth * 3}cqw` }}>
                {r.folder ? <FolderIcon open={open} on={on} /> : <FileIcon name={r.name} />}
                <span className="truncate">{r.name}</span>
              </span>
              <span className={cn("h-full border-l px-[2cqw] text-right leading-[7.2cqw]", on ? "border-white/40" : "border-casRule")}>{formatSize(r.size)}</span>
            </div>
          );
        })}
        {rows.length === 1 && (
          <p className="px-[3cqw] py-[3cqw] text-[3.6cqw] text-casLabel">
            No documents yet. Drop .tns files or a zip of your calculator&apos;s folder here, or press menu → Upload.
          </p>
        )}
      </div>
    </div>
  );
}

function FolderIcon({ open, on }: { open: boolean; on: boolean }) {
  return (
    <svg viewBox="0 0 16 13" className="h-[4cqw] w-[5cqw] shrink-0" aria-hidden>
      <path d="M1 3.5h5l1.2 1.5H15v7H1Z" fill="none" stroke="currentColor" strokeWidth="1.1" />
      <path d={open ? "M10 0.6h4L12 3Z" : "M11 0.2v4l2.4-2Z"} fill={on ? "white" : "#2c64c8"} />
    </svg>
  );
}

function FileIcon({ name }: { name: string }) {
  const tns = name.toLowerCase().endsWith(".tns");
  return (
    <svg viewBox="0 0 12 14" className="h-[4cqw] w-[3.6cqw] shrink-0" aria-hidden>
      <path d="M1 0.6h6.5L11 4v9.4H1Z" fill="none" stroke="currentColor" strokeWidth="1" />
      {tns && <path d="M3 7h6M3 9.4h6M3 11.6h4" stroke="currentColor" strokeWidth="0.9" />}
    </svg>
  );
}
