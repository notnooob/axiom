// SPDX-License-Identifier: GPL-3.0-or-later
/**
 * Page names in a reply ("Working on 1.2 Graphs") become links that open
 * that page on the calculator. Only pages of the open document, and never
 * inside code (`…`) or maths ($…$), where the text means something else.
 */

/** A link's target: #axiom-page-<0-based index>. */
export const PAGE_LINK = /^#axiom-page-(\d+)$/;

const APP = "Lists & Spreadsheet|Data & Statistics|Python Shell|Calculator|Graphs|Lists|Notes|Geometry|Python";
const LABEL = new RegExp(`(?<![\\d.])(\\d+\\.\\d+)\\s+(${APP})\\b`, "g");
/** Left as they are: code blocks and spans, display and inline maths, and links already made. */
const PROTECTED = /(```[\s\S]*?```|`[^`\n]*`|\$\$[\s\S]*?\$\$|\$[^$\n]+\$|\[[^\]\n]*\]\([^)\n]*\))/;

const first = (s: string) => s.split(" ")[0];

/** pages: the open document's pages as the chat names them ("1.2 Graphs", "1.3 Lists & Spreadsheet"). */
export function linkPages(text: string, pages: string[]): string {
  if (!pages.length) return text;
  return text
    .split(PROTECTED)
    .map((bit, i) =>
      i % 2
        ? bit
        : bit.replace(LABEL, (all, label: string, app: string) => {
            const at = pages.findIndex((p) => p.startsWith(`${label} `) && first(p.slice(label.length + 1)) === first(app));
            return at < 0 ? all : `[${label} ${app}](#axiom-page-${at})`;
          }),
    )
    .join("");
}
