// SPDX-License-Identifier: GPL-3.0-or-later
import { unzipSync } from "fflate";
import { join, put, type FileRecord } from "./store";

/**
 * Where each member of an uploaded zip goes: macOS's __MACOSX and .DS_Store
 * are dropped, and when every member shares one top folder (a zipped
 * "Documents" folder) that folder is dropped too, so its subfolders land
 * straight in the target folder.
 */
export function zipPaths(names: string[]): Map<string, string> {
  const keep = names.filter((n) => !n.endsWith("/") && !n.startsWith("__MACOSX/") && !/(^|\/)\.DS_Store$/.test(n));
  const tops = new Set(keep.map((n) => (n.includes("/") ? n.slice(0, n.indexOf("/")) : "")));
  const strip = tops.size === 1 && !tops.has("") ? [...tops][0]!.length + 1 : 0;
  return new Map(keep.map((n) => [n, n.slice(strip)]));
}

/** Add uploaded files to a folder; a .zip is unpacked. Returns how many files were added. */
export async function addFiles(folder: string, files: File[]): Promise<number> {
  let added = 0;
  for (const f of files) {
    const bytes = new Uint8Array(await f.arrayBuffer());
    if (f.name.toLowerCase().endsWith(".zip")) {
      const zip = unzipSync(bytes);
      for (const [member, rel] of zipPaths(Object.keys(zip))) {
        await put(record(join(folder, rel), zip[member]!));
        added++;
      }
    } else {
      await put(record(join(folder, f.name), bytes));
      added++;
    }
  }
  return added;
}

const record = (path: string, bytes: Uint8Array): FileRecord => ({ path, type: "file", bytes, size: bytes.length, modified: Date.now() });
