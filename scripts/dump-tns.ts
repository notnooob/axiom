// SPDX-License-Identifier: GPL-3.0-or-later
/**
 * Prints a .tns document's XML, one tag per line and indented, to read how
 * TI stores a page (for tns/import.ts and export.ts). A reading aid only:
 * neither the files nor what this prints go in the repo (AGENTS.md).
 *
 *   npx vite-node scripts/dump-tns.ts <file.tns> [more.tns …]
 */
import { readFileSync } from "node:fs";
import { decodeTns } from "../features/cas/tns/decode";

function indent(xml: string): string {
  let depth = 0;
  return xml
    .replace(/>\s*</g, ">\n<")
    .split("\n")
    .map((line) => {
      if (/^<\//.test(line)) depth = Math.max(0, depth - 1);
      const out = "  ".repeat(depth) + line;
      // An opening tag that isn't closed on the same line, self-closed, or a declaration.
      if (/^<[^/?!][^>]*[^/]>$|^<[^/?!]>$/.test(line) && !/<\/[^>]+>$/.test(line)) depth++;
      return out;
    })
    .join("\n");
}

for (const path of process.argv.slice(2)) {
  const { xml, files } = decodeTns(new Uint8Array(readFileSync(path)));
  console.log(`=== ${path}`);
  for (const [name, text] of xml) console.log(`--- ${name}\n${indent(text)}\n`);
  for (const [name, bytes] of files) console.log(`--- ${name} (${bytes.length} bytes, not XML)`);
}
