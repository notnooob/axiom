// SPDX-License-Identifier: GPL-3.0-or-later
/**
 * The connected handheld's documents, as TI's connect software shows them:
 * its folders and files, what it is and how full it is. A document opens
 * in Axiom (and saves back to the handheld); documents go to it from the
 * computer or from what's open; files and folders can be renamed, made and
 * deleted. Everything works from the keyboard: the arrows move through the
 * list, Enter opens, Delete deletes, Backspace goes up a folder.
 */
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { ArrowUp, File, FolderClosed, FolderPlus, RefreshCw, Upload, Usb } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { cn } from "@/shared/lib/utils";
import { baseName, joinPath, parentPath, type Handheld } from "./handheld";
import { disconnect, linkState, pickHandheld, subscribe } from "./manager";
import type { Entry } from "./navnet";

export const useLink = () => useSyncExternalStore(subscribe, linkState, linkState);

const kb = (n: number) => (n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);

/** What a document to send is called and holds; warn: pages that couldn't be written. */
export type Outgoing = { name: string; bytes: Uint8Array; warn?: string | null };

export function HandheldPanel({
  open,
  onOpenChange,
  onOpenDoc,
  onCopyDoc,
  current,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  /** Open a document from the handheld (it saves back there). */
  onOpenDoc: (path: string, bytes: Uint8Array) => Promise<void>;
  /** Keep a copy in My Documents. */
  onCopyDoc: (path: string, bytes: Uint8Array) => Promise<void>;
  /** The open document as a .tns, to send; null when there's none. */
  current: () => Outgoing | null;
}) {
  const link = useLink();
  const h = link.status === "connected" ? link.handheld : null;
  const [dir, setDir] = useState("/");
  const [items, setItems] = useState<Entry[] | null>(null);
  const [sel, setSel] = useState(0);
  const [busy, setBusy] = useState<string | null>(null);
  const [ask, setAsk] = useState<{ kind: "rename" | "mkdir"; value: string } | { kind: "delete" } | null>(null);
  const filesIn = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLDivElement>(null);

  const refresh = useCallback(
    async (hh: Handheld, folder: string) => {
      try {
        const got = await hh.list(folder);
        got.sort((a, b) => Number(b.dir) - Number(a.dir) || a.name.localeCompare(b.name));
        setItems(got);
        setSel((s) => Math.min(s, Math.max(0, got.length - 1)));
      } catch (e) {
        setItems([]);
        toast.error((e as Error).message);
      }
    },
    [],
  );

  useEffect(() => {
    if (open && h) void refresh(h, dir);
  }, [open, h, dir, refresh]);
  useEffect(() => {
    if (!h) {
      setDir("/");
      setItems(null);
    }
  }, [h]);

  /** Run a step with a busy line; a failure is shown and the list refreshed. */
  const step = async (what: string, f: (hh: Handheld) => Promise<unknown>) => {
    if (!h || busy) return;
    setBusy(what);
    try {
      await f(h);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
      await refresh(h, dir);
      void h.refresh().catch(() => undefined);
    }
  };
  const progress = (what: string) => (done: number, total: number) => setBusy(`${what} ${Math.round((done / Math.max(1, total)) * 100)}%`);

  const item = items?.[sel];
  const path = item ? joinPath(dir, item.name) : null;
  const isDoc = (e?: Entry) => Boolean(e && !e.dir && /\.(tns|py)$/i.test(e.name));

  const openItem = (e = item) => {
    if (!e || !h) return;
    if (e.dir) {
      setDir(joinPath(dir, e.name));
      setSel(0);
      return;
    }
    if (!isDoc(e)) return toast(`${e.name} isn't a document Axiom can open.`);
    void step(`Opening ${e.name}…`, async (hh) => {
      const bytes = await hh.read(joinPath(dir, e.name), progress(`Opening ${e.name}`));
      await onOpenDoc(joinPath(dir, e.name), bytes);
      onOpenChange(false);
    });
  };

  const send = async (name: string, bytes: Uint8Array, warn?: string | null) => {
    if (!h) return;
    const ext = h.info.ext.file || "tns";
    const target = joinPath(dir, /\.\w+$/.test(name) ? name : `${name}.${ext}`);
    if (items?.some((e) => !e.dir && e.name.toLowerCase() === baseName(target).toLowerCase()) && !window.confirm(`${baseName(target)} is already on the handheld. Replace it?`)) return;
    await step(`Sending ${baseName(target)}…`, async (hh) => {
      await hh.write(target, bytes, progress(`Sending ${baseName(target)}`));
      toast.success(`Sent ${baseName(target)} to the handheld`);
      if (warn) toast(warn);
    });
  };

  const keys = (e: React.KeyboardEvent) => {
    if (ask || !items) return;
    const n = items.length;
    if (e.key === "ArrowDown") setSel((s) => Math.min(n - 1, s + 1));
    else if (e.key === "ArrowUp") setSel((s) => Math.max(0, s - 1));
    else if (e.key === "Home") setSel(0);
    else if (e.key === "End") setSel(n - 1);
    else if (e.key === "Enter") openItem();
    else if (e.key === "Delete" && item) setAsk({ kind: "delete" });
    else if (e.key === "Backspace" && dir !== "/") setDir(parentPath(dir));
    else if (e.key === "F2" && item) setAsk({ kind: "rename", value: item.name });
    else return;
    e.preventDefault();
  };
  useEffect(() => {
    list.current?.querySelector<HTMLElement>(`[data-row="${sel}"]`)?.scrollIntoView({ block: "nearest" });
  }, [sel]);

  const info = h?.info;
  const used = info ? 1 - info.storage.free / Math.max(1, info.storage.total) : 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Handheld</DialogTitle>
          <DialogDescription>
            {link.status === "unsupported"
              ? "Connecting a handheld needs Chrome or Edge (on a computer, or Android)."
              : h && info
                ? `${info.name} · OS ${info.os}${info.battery === "low" ? " · battery low" : info.charging ? " · charging" : ""}`
                : "Connect a TI-Nspire with its USB cable. Documents open here and save back to it. Nothing goes anywhere but the cable."}
          </DialogDescription>
        </DialogHeader>

        {!h ? (
          <div className="grid gap-3">
            {link.status === "error" && <p className="text-sm text-destructive">{link.error}</p>}
            {link.status !== "unsupported" && (
              <Button onClick={() => void pickHandheld()} disabled={link.status === "connecting"}>
                <Usb aria-hidden />
                {link.status === "connecting" ? "Connecting… (up to half a minute)" : "Connect handheld"}
              </Button>
            )}
            <p className="text-xs text-muted-foreground">
              Turn the handheld on and unlock it first. If it won't connect, close TI&apos;s own software, which holds the cable while it&apos;s open.
            </p>
          </div>
        ) : (
          <div className="grid gap-3">
            <div className="grid gap-1">
              <div className="h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden>
                <div className="h-full rounded-full bg-primary" style={{ width: `${Math.round(used * 100)}%` }} />
              </div>
              <span className="text-xs text-muted-foreground">
                {kb(info!.storage.free)} free of {kb(info!.storage.total)}
              </span>
            </div>

            <div className="flex items-center gap-1.5">
              <Button size="icon-sm" variant="ghost" aria-label="Up a folder" disabled={dir === "/"} onClick={() => setDir(parentPath(dir))}>
                <ArrowUp aria-hidden />
              </Button>
              <span className="min-w-0 flex-1 truncate text-sm font-medium" title={dir}>
                {dir === "/" ? "Documents" : dir.slice(1).split("/").join(" ▸ ")}
              </span>
              <Button size="icon-sm" variant="ghost" aria-label="Refresh" onClick={() => void refresh(h, dir)}>
                <RefreshCw aria-hidden />
              </Button>
              <Button size="icon-sm" variant="ghost" aria-label="New folder" onClick={() => setAsk({ kind: "mkdir", value: "" })}>
                <FolderPlus aria-hidden />
              </Button>
            </div>

            <div
              ref={list}
              role="listbox"
              tabIndex={0}
              aria-label={`Files in ${dir === "/" ? "Documents" : dir}`}
              aria-activedescendant={item ? `hh-row-${sel}` : undefined}
              onKeyDown={keys}
              className="max-h-[40vh] min-h-32 overflow-y-auto rounded-xl border outline-none focus-visible:ring-3 focus-visible:ring-ring/30"
            >
              {items === null ? (
                <p className="p-3 text-sm text-muted-foreground">Reading the handheld…</p>
              ) : !items.length ? (
                <p className="p-3 text-sm text-muted-foreground">This folder is empty.</p>
              ) : (
                items.map((e, i) => (
                  <div
                    key={e.name}
                    id={`hh-row-${i}`}
                    data-row={i}
                    role="option"
                    aria-selected={i === sel}
                    onClick={() => setSel(i)}
                    onDoubleClick={() => openItem(e)}
                    className={cn("flex cursor-default items-center gap-2 px-3 py-1.5 text-sm", i === sel && "bg-accent text-accent-foreground")}
                  >
                    {e.dir ? <FolderClosed className="size-4 shrink-0" aria-hidden /> : <File className="size-4 shrink-0" aria-hidden />}
                    <span className="min-w-0 flex-1 truncate">{e.name}</span>
                    {!e.dir && <span className="text-xs text-muted-foreground tabular-nums">{kb(e.size)}</span>}
                    {e.date > 0 && <span className="hidden text-xs text-muted-foreground sm:inline">{new Date(e.date * 1000).toLocaleDateString()}</span>}
                  </div>
                ))
              )}
            </div>

            {ask?.kind === "delete" && item ? (
              <div className="flex items-center gap-2 rounded-xl border border-destructive/40 p-2 text-sm">
                <span className="flex-1">
                  Delete {item.name} from the handheld{item.dir ? " (the folder must be empty)" : ""}?
                </span>
                <Button
                  size="sm"
                  variant="destructive"
                  autoFocus
                  onClick={() => {
                    setAsk(null);
                    void step(`Deleting ${item.name}…`, (hh) => (item.dir ? hh.rmdir(path!) : hh.remove(path!)));
                  }}
                >
                  Delete
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setAsk(null)}>
                  Cancel
                </Button>
              </div>
            ) : ask && ask.kind !== "delete" ? (
              <form
                className="flex items-center gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  const name = ask.value.trim();
                  setAsk(null);
                  if (!name || /[/\\]/.test(name)) return;
                  if (ask.kind === "mkdir") void step(`Making ${name}…`, (hh) => hh.mkdir(joinPath(dir, name)));
                  else if (item && path) {
                    // A document keeps its extension when it's left off.
                    const ext = !item.dir && !/\.\w+$/.test(name) ? item.name.match(/\.\w+$/)?.[0] ?? "" : "";
                    void step(`Renaming ${item.name}…`, (hh) => hh.rename(path, joinPath(dir, name + ext)));
                  }
                }}
              >
                <Input
                  autoFocus
                  aria-label={ask.kind === "mkdir" ? "New folder's name" : "New name"}
                  placeholder={ask.kind === "mkdir" ? "Folder name" : "New name"}
                  value={ask.value}
                  onChange={(e) => setAsk({ ...ask, value: e.target.value })}
                  onKeyDown={(e) => e.key === "Escape" && (e.stopPropagation(), setAsk(null))}
                />
                <Button size="sm" type="submit">
                  {ask.kind === "mkdir" ? "Make" : "Rename"}
                </Button>
              </form>
            ) : null}

            {busy && (
              <p role="status" className="text-sm text-muted-foreground">
                {busy}
              </p>
            )}

            <div className="flex flex-wrap gap-2">
              <Button size="sm" disabled={!item || Boolean(busy) || (!item.dir && !isDoc(item))} onClick={() => openItem()}>
                Open
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={!isDoc(item) || Boolean(busy)}
                onClick={() =>
                  item &&
                  void step(`Copying ${item.name}…`, async (hh) => {
                    await onCopyDoc(path!, await hh.read(path!, progress(`Copying ${item.name}`)));
                    toast.success(`Copied ${item.name} to My Documents`);
                  })
                }
              >
                Copy to My Documents
              </Button>
              <Button size="sm" variant="outline" disabled={!item || Boolean(busy)} onClick={() => item && setAsk({ kind: "rename", value: item.name.replace(/\.\w+$/, "") })}>
                Rename
              </Button>
              <Button size="sm" variant="outline" disabled={!item || Boolean(busy)} onClick={() => setAsk({ kind: "delete" })}>
                Delete
              </Button>
            </div>
            <div className="flex flex-wrap gap-2 border-t pt-3">
              <Button
                size="sm"
                variant="secondary"
                disabled={Boolean(busy)}
                onClick={() => {
                  const c = current();
                  if (!c) return toast("Open a document first.");
                  void send(c.name, c.bytes, c.warn);
                }}
              >
                <Upload aria-hidden />
                Send open document
              </Button>
              <Button size="sm" variant="secondary" disabled={Boolean(busy)} onClick={() => filesIn.current?.click()}>
                <Upload aria-hidden />
                Send files…
              </Button>
              <span className="flex-1" />
              <Button size="sm" variant="ghost" onClick={() => void disconnect()}>
                Disconnect
              </Button>
            </div>
            <input
              ref={filesIn}
              type="file"
              accept=".tns"
              multiple
              hidden
              onChange={async (e) => {
                const picked = [...(e.target.files ?? [])];
                e.target.value = "";
                for (const f of picked) await send(f.name, new Uint8Array(await f.arrayBuffer()));
              }}
            />
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

/** The header's Handheld button: connected or not, at a glance. */
export function HandheldButton({ onClick }: { onClick: () => void }) {
  const link = useLink();
  if (link.status === "unsupported") return null;
  const on = link.status === "connected";
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={on ? `Handheld connected: ${link.handheld.info.name}` : "Handheld"}
      className="flex h-8 items-center gap-1.5 rounded-full border border-white/[0.07] bg-white/[0.02] px-3 text-[13px] font-medium text-neutral-400 transition-[color,background-color,border-color,scale] duration-150 ease-out outline-none hover:border-white/15 hover:bg-white/[0.05] hover:text-neutral-100 focus-visible:ring-2 focus-visible:ring-focus/60 active:scale-[0.97]"
    >
      <Usb size={14} aria-hidden />
      Handheld
      {on && <span aria-hidden className="size-1.5 rounded-full bg-emerald-400" />}
    </button>
  );
}
