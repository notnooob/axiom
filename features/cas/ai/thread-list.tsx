// SPDX-License-Identifier: GPL-3.0-or-later
/**
 * The assistant's past chats: AI mode's sidebar (a sheet on narrow screens)
 * and the panel's history dropdown share one list, where a chat is opened,
 * renamed in place, or deleted (after asking).
 */
import * as React from "react";
import { Dialog as DialogPrimitive } from "@base-ui/react/dialog";
import { Popover } from "@base-ui/react/popover";
import { AnimatePresence, motion, useReducedMotionConfig } from "framer-motion";
import { HistoryIcon, PencilIcon, SquarePenIcon, Trash2Icon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { chatBusy, type Assistant } from "./assistant";
import type { Thread } from "./threads";

/** A chat's name; when it changes (renamed, or the model's title arriving) the new one fades in over the old. */
function Title({ text }: { text: string }) {
  const [first] = React.useState(text);
  return (
    <span key={text} className={cn("block truncate", text !== first && "ui-fade")}>
      {text}
    </span>
  );
}

function ThreadList({ assistant, onPicked, onDelete }: { assistant: Assistant; onPicked?: () => void; onDelete: (t: Thread) => void }) {
  const { threads, thread, switchTo, rename, chat } = assistant;
  const busy = chatBusy(chat);
  const [editing, setEditing] = React.useState<string | null>(null);
  const [name, setName] = React.useState("");
  if (!threads.length) return <p className="px-3 py-6 text-center text-xs text-muted-foreground">Your chats will be kept here, in this browser.</p>;
  const done = (t: Thread) => {
    rename(t.id, name);
    setEditing(null);
  };
  return (
    <ul aria-label="Chats" className="relative flex flex-col gap-0.5">
      {/* Chats that are there when the list opens are just there; a new one comes in, a deleted one goes
          while the rest close the gap, and one that moves to the top slides there. */}
      <AnimatePresence initial={false} mode="popLayout">
      {threads.map((t) => (
        <motion.li
          key={t.id}
          layout="position"
          initial={{ opacity: 0, scale: 0.97 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.97, transition: { duration: 0.15, ease: [0.23, 1, 0.32, 1] } }}
          transition={{ type: "spring", duration: 0.35, bounce: 0 }}
          className={cn(
            "group/thread flex items-center gap-0.5 rounded-xl pr-1 transition-colors duration-150 hover:bg-white/[0.04]",
            t.id === thread.id && "bg-white/[0.07] hover:bg-white/[0.07]",
          )}
        >
          {editing === t.id ? (
            <form
              className="min-w-0 flex-1 p-0.5"
              onSubmit={(e) => {
                e.preventDefault();
                done(t);
              }}
            >
              <Input
                autoFocus
                aria-label="Chat name"
                value={name}
                className="h-7"
                onChange={(e) => setName(e.target.value)}
                onBlur={() => done(t)}
                onKeyDown={(e) => {
                  if (e.key === "Escape") {
                    // Cancels the rename only, not the panel or menu around it.
                    e.preventDefault();
                    e.stopPropagation();
                    setEditing(null);
                  }
                }}
              />
            </form>
          ) : (
            <>
              <button
                type="button"
                aria-current={t.id === thread.id ? "true" : undefined}
                disabled={busy && t.id !== thread.id}
                title={t.title}
                onClick={() => {
                  void switchTo(t.id);
                  onPicked?.();
                }}
                className="min-w-0 flex-1 truncate rounded-xl px-2.5 py-1.5 text-left text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/30 disabled:opacity-50"
              >
                <Title text={t.title} />
              </button>
              <Button
                variant="ghost"
                size="icon-xs"
                aria-label={`Rename "${t.title}"`}
                className="opacity-0 group-hover/thread:opacity-100 focus-visible:opacity-100 pointer-coarse:opacity-100"
                onClick={() => {
                  setName(t.title);
                  setEditing(t.id);
                }}
              >
                <PencilIcon />
              </Button>
              <Button
                variant="ghost"
                size="icon-xs"
                aria-label={`Delete "${t.title}"`}
                disabled={busy && t.id === thread.id}
                className="opacity-0 group-hover/thread:opacity-100 focus-visible:opacity-100 pointer-coarse:opacity-100"
                onClick={() => onDelete(t)}
              >
                <Trash2Icon />
              </Button>
            </>
          )}
        </motion.li>
      ))}
      </AnimatePresence>
    </ul>
  );
}

/** Delete, after asking: the chat that's going, or null when nothing is. */
function useDeleteThread(assistant: Assistant): [(t: Thread) => void, React.ReactNode] {
  const [doomed, setDoomed] = React.useState<Thread | null>(null);
  const dialog = (
    <Dialog open={doomed !== null} onOpenChange={(o) => !o && setDoomed(null)}>
      <DialogContent className="dark font-sans text-foreground sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Delete this chat?</DialogTitle>
          <DialogDescription>
            &ldquo;{doomed?.title}&rdquo; and its messages are removed from this browser. Documents saved in My Documents stay.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setDoomed(null)}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={() => {
              if (doomed) void assistant.remove(doomed.id);
              setDoomed(null);
            }}
          >
            Delete
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
  return [setDoomed, dialog];
}

/** The panel's history: a dropdown of past chats. */
export function ThreadMenu({ assistant }: { assistant: Assistant }) {
  const [open, setOpen] = React.useState(false);
  const [ask, dialog] = useDeleteThread(assistant);
  return (
    <>
      <Popover.Root open={open} onOpenChange={setOpen}>
        <Popover.Trigger render={<Button variant="ghost" size="icon-sm" aria-label="Chat history" />}>
          <HistoryIcon />
        </Popover.Trigger>
        <Popover.Portal>
          <Popover.Positioner side="bottom" align="end" sideOffset={6} className="isolate z-50">
            <Popover.Popup
              aria-label="Chat history"
              className="dark ui-pop max-h-[min(24rem,var(--available-height))] w-72 overflow-y-auto rounded-2xl bg-popover p-1 font-sans text-popover-foreground shadow-lg ring-1 ring-foreground/10 outline-none"
            >
              <ThreadList
                assistant={assistant}
                onPicked={() => setOpen(false)}
                onDelete={(t) => {
                  setOpen(false);
                  ask(t);
                }}
              />
            </Popover.Popup>
          </Popover.Positioner>
        </Popover.Portal>
      </Popover.Root>
      {dialog}
    </>
  );
}

const WIDE = "(min-width: 768px)";
function useWide() {
  return React.useSyncExternalStore(
    (cb) => {
      const m = window.matchMedia(WIDE);
      m.addEventListener("change", cb);
      return () => m.removeEventListener("change", cb);
    },
    () => window.matchMedia(WIDE).matches,
  );
}

/** AI mode's sidebar: beside the chat on a wide screen (it folds away), a sheet from the left on a narrow one. */
export function ThreadSidebar({ assistant, open, onOpenChange }: { assistant: Assistant; open: boolean; onOpenChange: (o: boolean) => void }) {
  const wide = useWide();
  const reduce = useReducedMotionConfig();
  const [ask, dialog] = useDeleteThread(assistant);
  const body = (
    <>
      <Button
        variant="ghost"
        size="sm"
        className="mb-1 justify-start"
        disabled={chatBusy(assistant.chat)}
        onClick={() => {
          assistant.newChat();
          if (!wide) onOpenChange(false);
        }}
      >
        <SquarePenIcon data-icon="inline-start" />
        New chat
      </Button>
      <ThreadList assistant={assistant} onPicked={wide ? undefined : () => onOpenChange(false)} onDelete={ask} />
    </>
  );
  return (
    <>
      {wide ? (
        // Folds away beside the chat: its width opens (there's no transform that makes room), while
        // its content, at a fixed width, slides with it rather than rewrapping.
        <AnimatePresence initial={false}>
          {open && (
            <motion.nav
              key="chats"
              aria-label="Chats"
              initial={{ width: 0, opacity: 0 }}
              animate={{ width: 256, opacity: 1 }}
              exit={{ width: 0, opacity: 0 }}
              transition={reduce ? { duration: 0 } : { type: "spring", duration: 0.4, bounce: 0 }}
              className="relative shrink-0 overflow-hidden border-r border-white/[0.06]"
            >
              <div className="flex h-full w-64 flex-col overflow-y-auto px-2 py-2">{body}</div>
            </motion.nav>
          )}
        </AnimatePresence>
      ) : (
        <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
          <DialogPrimitive.Portal>
            <DialogPrimitive.Backdrop className="ui-backdrop fixed inset-0 z-50 bg-black/50" />
            <DialogPrimitive.Popup
              aria-label="Chats"
              className="dark ui-sheet fixed inset-y-0 left-0 z-50 flex w-72 max-w-[85vw] flex-col overflow-y-auto border-r border-white/[0.06] bg-[#141414] px-2 py-3 font-sans text-foreground shadow-xl outline-none"
            >
              <DialogPrimitive.Title className="px-2.5 pb-2 text-sm font-semibold">Chats</DialogPrimitive.Title>
              {body}
            </DialogPrimitive.Popup>
          </DialogPrimitive.Portal>
        </DialogPrimitive.Root>
      )}
      {dialog}
    </>
  );
}
