// SPDX-License-Identifier: GPL-3.0-or-later
/**
 * Commands switched off for Press-to-Test (state/ptt.ts): evaluate() refuses
 * an entry that calls one, whichever page or program it comes from.
 */
import { parse, type Ast } from "../math/ast";

let blocked: ReadonlySet<string> = new Set();

export function setBlocked(names: ReadonlySet<string>) {
  blocked = names;
}

/** The first switched-off command the entry uses, or null. */
export function blockedIn(text: string): string | null {
  if (!blocked.size) return null;
  let a: Ast;
  try {
    a = parse(text);
  } catch {
    // Not one expression (a program's lines): look for the names themselves.
    for (const name of blocked) if (new RegExp(`(^|[^\\w])${name}\\s*\\(`).test(text)) return name;
    return null;
  }
  return find(a);
}

function find(a: Ast): string | null {
  switch (a.k) {
    case "call":
      if (blocked.has(a.f)) return a.f;
      for (const x of a.args) {
        const f = find(x);
        if (f) return f;
      }
      return null;
    case "bin":
      return find(a.a) ?? find(a.b);
    case "neg":
    case "not":
    case "post":
      return find(a.a);
    case "list":
      for (const x of a.items) {
        const f = find(x);
        if (f) return f;
      }
      return null;
    case "mat":
      for (const r of a.rows)
        for (const x of r) {
          const f = find(x);
          if (f) return f;
        }
      return null;
    case "define":
      return find(a.lhs) ?? find(a.rhs);
    default:
      return null;
  }
}
