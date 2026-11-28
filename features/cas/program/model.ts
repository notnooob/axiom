// SPDX-License-Identifier: GPL-3.0-or-later
/**
 * The Program Editor's text, as pure functions: a new function or program's
 * skeleton, the header's line counter, the syntax check Store runs first,
 * Comment/Uncomment, and the Actions that rewrite the Define line (Rename,
 * Change Library Access). The editor shows a definition over several lines
 * (Define …=, Prgm, the body, EndPrgm), as the handheld does; the engine
 * reads it with its lines split at new lines as well as ":".
 */
import { parse } from "../math/ast";
import { splitArgs, splitLines, type Definition } from "../engine/program";

export type ProgramKind = "Prgm" | "Func";
export type LibraryAccess = "None" | "LibPriv" | "LibPub";

const DEFINE = /^(\s*Define\s+)(?:(LibPub|LibPriv)\s+)?([A-Za-zÀ-￿][\w.À-￿]*)(\s*\()/i;

/** A new one, as Actions ▸ New leaves it: the Define line, the block's first line, an empty line for the body, its End. */
export function newSource(name: string, kind: ProgramKind, access: LibraryAccess = "None"): string {
  const lib = access === "None" ? "" : `${access} `;
  return `Define ${lib}${name}()=\n${kind}\n\nEnd${kind}`;
}

/** A stored definition back in the editor, one statement a line. */
export function sourceOf(d: Pick<Definition, "access" | "name" | "params" | "kind" | "lines">): string {
  const lib = d.access ? `${d.access} ` : "";
  return [`Define ${lib}${d.name}(${d.params.join(",")})=`, d.kind, ...d.lines, `End${d.kind}`].join("\n");
}

/** The name on the Define line, or null when there isn't one. */
export function nameOf(source: string): string | null {
  return DEFINE.exec(source)?.[3]?.toLowerCase() ?? null;
}

/** The Define line with a new name (Rename, Create Copy). */
export const renamed = (source: string, name: string): string => source.replace(DEFINE, (_, def: string, lib: string | undefined, _old: string, open: string) => `${def}${lib ? `${lib} ` : ""}${name}${open}`);

/** The Define line with another library access (Change Library Access). */
export const withAccess = (source: string, access: LibraryAccess): string =>
  source.replace(DEFINE, (_, def: string, _lib: string | undefined, name: string, open: string) => `${def}${access === "None" ? "" : `${access} `}${name}${open}`);

/** The library access on the Define line. */
export function accessOf(source: string): LibraryAccess {
  const lib = DEFINE.exec(source)?.[2]?.toLowerCase();
  return lib === "libpub" ? "LibPub" : lib === "libpriv" ? "LibPriv" : "None";
}

/**
 * The header's counter: the body line the caret is on, of how many, as the
 * handheld counts them (the Define line and the block's first and last lines
 * aren't counted; on them it shows the nearest body line).
 */
export function lineStatus(source: string, caret: number): { line: number; total: number } {
  const lines = source.split("\n");
  const total = Math.max(1, lines.length - 3);
  const at = source.slice(0, caret).split("\n").length - 1;
  return { line: Math.max(1, Math.min(total, at - 1)), total };
}

/** Where line `n` (from 1, counting every line) starts in the text, clamped to the text. */
export function lineStart(source: string, n: number): number {
  const lines = source.split("\n");
  const upto = Math.max(0, Math.min(lines.length - 1, n - 1));
  return lines.slice(0, upto).reduce((a, l) => a + l.length + 1, 0);
}

/** Statements that start with a command; what follows it is checked as expressions. */
const STATEMENT =
  /^(Disp|DispAt|Text|Request|RequestStr|Local|Return|Wait|Lbl|Goto|DelVar|Lock|unLock|Send|Get|GetStr|While|ElseIf|If|For|Define|DrawLine|DrawRect|FillRect|DrawCircle|FillCircle|DrawText|DrawArc|FillArc|DrawPoly|FillPoly|PlotXY|SetColor|SetPen|SetWindow|UseBuffer|PaintBuffer)\b\s*/i;
const ALONE = /^(Prgm|EndPrgm|Func|EndFunc|Then|Else|EndIf|EndFor|EndWhile|Loop|EndLoop|Try|EndTry|Cycle|Exit|Stop|ClrErr|PassErr|Clear|RefreshProbeVars)$/i;

/**
 * Check Syntax: the first line that doesn't read, by its number in the text
 * (from 1), or null when they all do. Comments (©) are skipped.
 */
export function syntaxError(source: string): { line: number; message: string } | null {
  const lines = source.split("\n");
  if (!DEFINE.test(lines[0] ?? "")) return { line: 1, message: "Error: Syntax" };
  const kind = /^\s*(Prgm|Func)\s*$/i.exec(lines[1] ?? "")?.[1];
  const end = lines.map((l) => l.trim()).filter(Boolean).at(-1);
  if (!kind || end?.toLowerCase() !== `end${kind.toLowerCase()}`) return { line: kind ? lines.length : 2, message: `Error: Missing End${kind ?? "Prgm"}` };
  for (let i = 0; i < lines.length; i++) {
    for (const stmt of splitLines(lines[i]!)) {
      if (i === 0 || ALONE.test(stmt)) continue;
      let body = stmt.replace(STATEMENT, "");
      // If … Then and While's condition, For's variable and bounds.
      body = body.replace(/\s+Then$/i, "");
      for (const arg of splitArgs(body)) {
        try {
          parse(arg);
        } catch {
          return { line: i + 1, message: "Error: Syntax" };
        }
      }
    }
  }
  return null;
}

/** Comment/Uncomment: © put in front of each line the selection touches, or taken off when they all have one. */
export function toggleComment(source: string, from: number, to: number): { source: string; from: number; to: number } {
  const start = source.lastIndexOf("\n", from - 1) + 1;
  const endAt = source.indexOf("\n", Math.max(from, to - (to > from ? 1 : 0)));
  const end = endAt < 0 ? source.length : endAt;
  const block = source.slice(start, end).split("\n");
  const off = block.every((l) => l.trimStart().startsWith("©"));
  const next = block.map((l) => (off ? l.replace(/^(\s*)©\s?/, "$1") : `©${l}`)).join("\n");
  const shift = next.length - (end - start);
  return { source: source.slice(0, start) + next + source.slice(end), from: Math.max(start, from + (off ? -Math.min(2, from - start) : 1)), to: to + shift };
}

/** A menu's insert text for the editor: the entry line's ":" between lines becomes a new line, and the caret mark stays. */
export const asLines = (text: string): string => text.replace(/:(?!=)/g, "\n");
