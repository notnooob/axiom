// SPDX-License-Identifier: GPL-3.0-or-later
/**
 * The Page Sorter (doc ▸ View ▸ Page Sorter): the document's pages by
 * problem, each a tile with its label and app. ←/→ (or ↑/↓) choose one,
 * Enter goes to it, Shift with an arrow moves it within its problem, del
 * deletes it and esc goes back, as on the handheld.
 */
import { cn } from "@/shared/lib/utils";
import { pageLabel, problemOf, type CasDocument } from "../state/document";
import { units } from "../state/layout";
import { problemTitle } from "../state/pages";

export function PageSorter({ doc, sel, names, onPick }: { doc: CasDocument; sel: number; names: Record<string, string>; onPick: (index: number, open: boolean) => void }) {
  const all = units(doc);
  const problems = [...new Set(doc.pages.map(problemOf))];
  return (
    <div className="absolute inset-0 overflow-y-auto bg-casRowAlt p-[2cqw]" role="listbox" aria-label="Page Sorter">
      {problems.map((n) => (
        <section key={n} className="mb-[2.4cqw]">
          <h3 className="mb-[1cqw] font-semibold text-[3.4cqw]">
            {n}: {problemTitle(doc, n)}
          </h3>
          <div className="flex flex-wrap gap-[1.6cqw]">
            {all
              .filter((u) => problemOf(doc.pages[u.pages[0]!]) === n)
              .map((u) => {
                const first = u.pages[0]!;
                const chosen = u.pages.includes(sel);
                return (
                  <button
                    key={doc.pages[first]!.id}
                    type="button"
                    role="option"
                    aria-selected={chosen}
                    onClick={() => onPick(first, false)}
                    onDoubleClick={() => onPick(first, true)}
                    className={cn("flex h-[15cqw] w-[20cqw] flex-col items-center justify-center gap-[0.6cqw] rounded-[0.6cqw] border-[0.4cqw] bg-casScreen text-[2.6cqw]", chosen ? "border-casSelect" : "border-casRule")}
                  >
                    <span className="font-semibold text-[3.2cqw]">{pageLabel(doc, first)}</span>
                    {u.pages.map((i) => (
                      <span key={i} className="leading-tight text-casLabel">
                        {names[doc.pages[i]!.kind]}
                      </span>
                    ))}
                  </button>
                );
              })}
          </div>
        </section>
      ))}
    </div>
  );
}
