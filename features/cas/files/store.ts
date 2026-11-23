// SPDX-License-Identifier: GPL-3.0-or-later
/**
 * My Documents: files and folders kept in this browser (IndexedDB), never
 * sent anywhere. A record is keyed by its path, "My Documents/Games/Tetris.tns".
 * A document carries `doc` (the editable form) and, when it came from an
 * upload, `bytes` (the original file, downloaded as-is until it's edited).
 */
import { createStore, del, delMany, entries, get, set, setMany } from "idb-keyval";
import { strToU8, zipSync } from "fflate";
import type { Saved } from "../state/persist";
import { PTT } from "../state/ptt";

export const ROOT = "My Documents";

export type FileRecord = {
  path: string;
  type: "folder" | "file";
  size: number;
  modified: number;
  doc?: Saved;
  bytes?: Uint8Array;
  /** The document was changed after upload, so `bytes` no longer matches it. */
  edited?: boolean;
  /**
   * The file on the computer this came from, when the installed app was
   * opened with it (Chromium's file handlers): Save writes back to it too.
   * Kept in IndexedDB, which stores handles; the browser asks again for
   * permission to write after a restart.
   */
  handle?: FileSystemFileHandle;
  /** Whether Save may write a .tns back to `handle`, once the student has said (Axiom's .tns writing is experimental). */
  disk?: "yes" | "no";
};

// Press-to-Test keeps its own files, so the student's own are put away for the test (state/ptt.ts).
const store = PTT ? createStore("axiom-ptt-files", "files") : createStore("axiom-files", "files");

/** Press-to-Test's ending: everything made during the test goes. */
export async function clearTestFiles(): Promise<void> {
  const test = createStore("axiom-ptt-files", "files");
  await delMany((await entries<string, FileRecord>(test)).map(([k]) => k), test);
}

export const parentOf = (path: string) => path.slice(0, path.lastIndexOf("/"));
export const nameOf = (path: string) => path.slice(path.lastIndexOf("/") + 1);
export const join = (folder: string, name: string) => `${folder}/${name}`;

let persisted = false;
/** Ask once that the browser keep these files when it's short of space. */
function persist() {
  if (persisted) return;
  persisted = true;
  void navigator.storage?.persist?.().catch(() => undefined);
}

export async function all(): Promise<FileRecord[]> {
  return (await entries<string, FileRecord>(store)).map(([, v]) => v);
}

export async function list(folder: string): Promise<FileRecord[]> {
  return (await all()).filter((r) => parentOf(r.path) === folder);
}

export const getFile = (path: string) => get<FileRecord>(path, store);

/** Make a folder and any missing parents. */
export async function mkdir(path: string): Promise<void> {
  const parts = path.split("/");
  const missing: [string, FileRecord][] = [];
  for (let i = 2; i <= parts.length; i++) {
    const p = parts.slice(0, i).join("/");
    if (!(await getFile(p))) missing.push([p, { path: p, type: "folder", size: 0, modified: Date.now() }]);
  }
  if (missing.length) await setMany(missing, store);
}

export async function put(rec: FileRecord): Promise<void> {
  persist();
  await mkdir(parentOf(rec.path));
  await set(rec.path, rec, store);
}

/** A file's size as it would download: the original bytes, or the saved document's JSON. */
export const sizeOf = (doc?: Saved, bytes?: Uint8Array) => bytes?.length ?? (doc ? JSON.stringify(doc).length : 0);

export async function saveDoc(path: string, doc: Saved): Promise<void> {
  const old = await getFile(path);
  await put({
    path,
    type: "file",
    doc,
    ...(old?.bytes ? { bytes: old.bytes, edited: true } : {}),
    ...(old?.handle ? { handle: old.handle, ...(old.disk ? { disk: old.disk } : {}) } : {}),
    size: old?.bytes?.length ?? sizeOf(doc),
    modified: Date.now(),
  });
}

/** Change some of a record's fields (the computer's file it came from), leaving its contents and date as they are. */
export async function patch(path: string, fields: Partial<Pick<FileRecord, "handle" | "disk">>): Promise<void> {
  const old = await getFile(path);
  if (old) await set(path, { ...old, ...fields }, store);
}

/** After Save wrote `bytes` to the computer's file: they're the file again, as if just uploaded. */
export async function savedToDisk(path: string, bytes: Uint8Array): Promise<void> {
  const old = await getFile(path);
  if (old) await set(path, { ...old, bytes, edited: false, size: bytes.length }, store);
}

/** Cache the imported form of an uploaded document without marking it edited. */
export async function cacheImport(path: string, doc: Saved): Promise<void> {
  const old = await getFile(path);
  if (old) await set(path, { ...old, doc }, store);
}

export async function remove(path: string): Promise<void> {
  const under = (await all()).filter((r) => r.path === path || r.path.startsWith(`${path}/`)).map((r) => r.path);
  await delMany(under, store);
}

export async function rename(from: string, to: string): Promise<void> {
  if (from === to) return;
  if (await getFile(to)) throw new Error(`"${nameOf(to)}" already exists`);
  const moved = (await all()).filter((r) => r.path === from || r.path.startsWith(`${from}/`));
  await setMany(moved.map((r) => [to + r.path.slice(from.length), { ...r, path: to + r.path.slice(from.length), modified: Date.now() }]), store);
  await delMany(moved.map((r) => r.path), store);
}

/** A name in the folder not yet taken: "Untitled", "Untitled 2" … (keeping the extension). */
export async function freeName(folder: string, want: string): Promise<string> {
  const taken = new Set((await list(folder)).map((r) => nameOf(r.path).toLowerCase()));
  const dot = want.lastIndexOf(".");
  const [stem, ext] = dot > 0 ? [want.slice(0, dot), want.slice(dot)] : [want, ""];
  let name = want;
  for (let n = 2; taken.has(name.toLowerCase()); n++) name = `${stem} ${n}${ext}`;
  return name;
}

export async function usage(): Promise<{ files: number; bytes: number; quota?: number; used?: number }> {
  const recs = (await all()).filter((r) => r.type === "file");
  const est = await navigator.storage?.estimate?.().catch(() => undefined);
  return { files: recs.length, bytes: recs.reduce((n, r) => n + r.size, 0), quota: est?.quota, used: est?.usage };
}

export async function clearAll(): Promise<void> {
  await delMany((await all()).map((r) => r.path), store);
}

export const removeOne = (path: string) => del(path, store);

/**
 * Everything as one zip: originals as they were uploaded, and documents made
 * here (or edited) as .tns via `toTns`.
 */
export async function exportAll(toTns: (r: FileRecord) => Uint8Array | null): Promise<Uint8Array> {
  const files: Record<string, Uint8Array> = {};
  for (const r of await all()) {
    if (r.type !== "file") continue;
    const rel = r.path.slice(ROOT.length + 1);
    const bytes = r.bytes && !r.edited ? r.bytes : toTns(r);
    files[rel] = bytes ?? strToU8(JSON.stringify(r.doc));
  }
  return zipSync(files);
}
