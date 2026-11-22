// SPDX-License-Identifier: GPL-3.0-or-later
/**
 * Libraries, as on the handheld: a document in My Documents/MyLib whose
 * first problem defines functions or programs with Define LibPub (listed in
 * the catalog there) or Define LibPriv (usable, not listed). Refresh
 * Libraries brings them into the open document as lib\obj, kept here as
 * the group name lib.obj, which the engine already knows.
 */
import { definedSources, type Definition } from "../engine/program";
import { problemOf } from "../state/document";
import { join, list, mkdir, ROOT } from "./store";

export const LIB_FOLDER = join(ROOT, "MyLib");

export type LibObject = { lib: string; def: Definition & { source: string } };

/** A library's name as it's typed before the \\: the file's name, lower case, letters and digits only. */
export const libName = (fileName: string) => fileName.replace(/\.tns$/i, "").toLowerCase().replace(/[^a-z0-9]/g, "");

/** Every LibPub and LibPriv object in MyLib's documents. */
export async function loadLibraries(): Promise<LibObject[]> {
  await mkdir(LIB_FOLDER).catch(() => undefined);
  const out: LibObject[] = [];
  for (const rec of await list(LIB_FOLDER)) {
    if (rec.type !== "file" || !rec.doc) continue;
    const saved = rec.doc;
    const active = problemOf(saved.doc.pages[saved.doc.active]);
    const defs = active === 1 ? saved.definitions : (saved.doc.problems?.["1"] ?? []);
    const lib = libName(rec.path.slice(rec.path.lastIndexOf("/") + 1));
    if (!lib) continue;
    for (const def of definedSources(defs).values()) if (def.access) out.push({ lib, def });
  }
  return out;
}

/**
 * A library object's definition in the open document, under lib.obj: its
 * calls to the library's other objects renamed to match.
 */
export function libraryDefinition(o: LibObject, siblings: string[], prefix = o.lib): string {
  const rename = (line: string) =>
    siblings.reduce((l, s) => l.replace(new RegExp(`(^|[^\\w.])${s}\\s*\\(`, "gi"), (_, pre: string) => `${pre}${prefix}.${s}(`), line);
  const lines = o.def.lines.map(rename);
  return `Define ${prefix}.${o.def.name}(${o.def.params.join(",")})=${o.def.kind}:${lines.map((l) => `${l}:`).join("")}End${o.def.kind}`;
}
