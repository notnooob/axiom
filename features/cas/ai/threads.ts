// SPDX-License-Identifier: GPL-3.0-or-later
/**
 * The assistant's chats, kept in this browser (IndexedDB), never sent
 * anywhere. Each thread has its own messages and, once the agent has made or
 * worked on one, a snapshot of its document in My Documents' form (Saved), so
 * opening the thread again brings its document back to the calculator.
 */
import { createStore, del, set, values } from "idb-keyval";
import type { Saved } from "../state/persist";
import type { CalcMessage } from "./agent";

/**
 * The calculator as it was when a turn began, so the student can take back
 * what that reply did (Undo changes). owner: the thread whose document was
 * open then; view: where the calculator was; cached: Home → Current's document.
 */
export type Checkpoint = {
  saved: Saved;
  path: string | null;
  scratch: boolean;
  dirty: boolean;
  owner: string | null;
  view: "home" | "browse" | "doc";
  cached: unknown;
};

export type Thread = {
  id: string;
  title: string;
  /** Named by the model or the student; until then the title is the first message, cut short. */
  titled: boolean;
  created: number;
  updated: number;
  messages: CalcMessage[];
  /** The document this thread made or worked on, as it was when the thread was last left. */
  doc?: Saved;
  /** Its file in My Documents, once it's been saved. */
  docPath?: string | null;
  /** The calculator before the latest turn that changed it; after: that turn's user message. */
  checkpoint?: Checkpoint & { after: string };
};

const store = createStore("axiom-chats", "threads");
/** The open thread's id (localStorage). */
export const ACTIVE_KEY = "axiom.chat.active";

export const listThreads = async () => newestFirst(await values<Thread>(store));
export const putThread = (t: Thread) => set(t.id, t, store);
export const deleteThread = (id: string) => del(id, store);

export const newThread = (now = Date.now()): Thread => ({ id: crypto.randomUUID(), title: "New chat", titled: false, created: now, updated: now, messages: [] });

export const newestFirst = (ts: Thread[]) => [...ts].sort((a, b) => b.updated - a.updated || b.created - a.created);

/** The first message, on one line and cut to fit the list. */
export function fallbackTitle(text: string, max = 40): string {
  const t = text.replace(/\s+/g, " ").trim();
  if (!t) return "New chat";
  return t.length <= max ? t : `${t.slice(0, max - 1).trimEnd()}…`;
}

/** A model's title, tidied: its first line, no wrapping quotes or closing stop, six words at most. */
export function cleanTitle(raw: string): string {
  const line = raw.trim().split("\n")[0] ?? "";
  return line
    .replace(/^title:\s*/i, "")
    .replace(/^["'“‘`*]+|["'”’`*]+$/g, "")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 6)
    .join(" ")
    .replace(/[.!:;]+$/, "");
}

/**
 * How a thread's document comes back: with its file in My Documents if it
 * has one (unsaved changes kept), otherwise as an unsaved document. Null for
 * a thread with nothing to bring back.
 */
export function restoreOf(t: Thread, file: Saved | undefined): { saved: Saved; path: string | null; dirty: boolean } | null {
  if (t.docPath && file) {
    const saved = t.doc ?? file;
    return { saved, path: t.docPath, dirty: JSON.stringify(saved.doc) !== JSON.stringify(file.doc) };
  }
  return t.doc ? { saved: t.doc, path: null, dirty: true } : null;
}

/** The calculator's document shows in the chat only while it's the active thread's own. */
export const ownsOpenDoc = (owner: string | null, active: string, docOnScreen: boolean) => owner === active && docOnScreen;
