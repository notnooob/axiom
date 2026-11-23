// SPDX-License-Identifier: GPL-3.0-or-later
/**
 * Share by link: the whole document, compressed, in the link's #fragment
 * (#doc=1.…). Browsers never send the fragment to the server, so the
 * document goes from one student's browser to another's without being
 * uploaded anywhere: the link is the file.
 */
import { deflateSync, inflateSync, strFromU8, strToU8 } from "fflate";
import type { Saved } from "../state/persist";

const PREFIX = "#doc=";
/** The format's version, so links made now still open after it changes. */
const VERSION = "1";

/** Links longer than this may be cut short by chat apps and email. */
export const LONG_LINK = 8000;

const toBase64Url = (bytes: Uint8Array) => {
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};
const fromBase64Url = (s: string) => {
  const bin = atob(s.replace(/-/g, "+").replace(/_/g, "/"));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
};

/** The fragment for a document: #doc=1.<deflated JSON, base64url>. */
export function shareFragment(saved: Saved): string {
  return `${PREFIX}${VERSION}.${toBase64Url(deflateSync(strToU8(JSON.stringify(saved)), { level: 9 }))}`;
}

/** Whether a URL's hash carries a shared document. */
export const isShareFragment = (hash: string) => hash.startsWith(PREFIX);

/**
 * The document in a #doc= fragment, or null when it isn't one or can't be
 * read (cut short, say). Only the document's shape is checked: what's in it
 * is the student's to open, as an uploaded file is.
 */
export function readShareFragment(hash: string): Saved | null {
  if (!isShareFragment(hash)) return null;
  const body = hash.slice(PREFIX.length);
  const dot = body.indexOf(".");
  if (dot < 0 || body.slice(0, dot) !== VERSION) return null;
  try {
    const saved = JSON.parse(strFromU8(inflateSync(fromBase64Url(decodeURIComponent(body.slice(dot + 1)))))) as Saved;
    const doc = saved?.doc;
    if (!doc || !Array.isArray(doc.pages) || !doc.pages.length || typeof doc.active !== "number" || !saved.settings) return null;
    if (doc.active < 0 || doc.active >= doc.pages.length) doc.active = 0;
    if (typeof doc.title !== "string" || !doc.title) doc.title = "Shared";
    return { doc, settings: saved.settings, definitions: Array.isArray(saved.definitions) ? saved.definitions.filter((d) => typeof d === "string") : [] };
  } catch {
    return null;
  }
}
