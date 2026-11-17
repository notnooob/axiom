// SPDX-License-Identifier: GPL-3.0-or-later
/**
 * A page laid out with several apps (doc ▸ Page Layout): the regions of its
 * layout, the active app in its own and the others drawn as they stand.
 * Each region is its own container, so an app's cqw sizes fit its region,
 * as if it were a smaller screen. A click on another region makes it active;
 * a click on an empty one asks which app to put there.
 */
import type { ReactNode } from "react";
import { cn } from "@/shared/lib/utils";
import type { CasDocument, Page } from "../state/document";
import { groupIndex, LAYOUTS } from "../state/layout";

const AREAS = ["a", "b", "c", "d"];

export function LayoutFrame({
  doc,
  renderOther,
  onFocus,
  onEmpty,
  splitting,
  children,
}: {
  doc: CasDocument;
  /** Another region's app, drawn but not taking keys. */
  renderOther: (page: Page) => ReactNode;
  onFocus: (pageId: number) => void;
  onEmpty: (group: number, slot: number) => void;
  /** Custom Split is moving the divider: the regions are outlined. */
  splitting?: boolean;
  children: ReactNode;
}) {
  const id = doc.pages[doc.active]?.id ?? -1;
  const g = groupIndex(doc, id);
  const group = g < 0 ? null : doc.groups![g]!;
  const spec = group ? LAYOUTS[group.layout] : null;
  if (!group || !spec) return <>{children}</>;
  const split = group.split ?? 0.5;
  const tracks = `${split}fr ${1 - split}fr`;
  const twoCols = spec.areas[0]!.split(" ").length === 2;
  const twoRows = spec.areas.length === 2;
  return (
    <div
      className="absolute inset-0 grid gap-[0.5cqw] bg-casInk"
      style={{
        gridTemplateAreas: spec.areas.map((r) => `"${r}"`).join(" "),
        gridTemplateColumns: twoCols ? (spec.dir === "cols" ? tracks : "1fr 1fr") : "1fr",
        gridTemplateRows: twoRows ? (spec.dir === "rows" ? tracks : "1fr 1fr") : "1fr",
      }}
    >
      {group.slots.map((slot, i) => {
        const page = slot === null ? undefined : doc.pages.find((p) => p.id === slot);
        const active = slot === id;
        return (
          <div
            key={slot ?? `empty${i}`}
            style={{ gridArea: AREAS[i], containerType: "size" }}
            className={cn("relative min-h-0 min-w-0 overflow-hidden bg-casScreen", splitting && "outline-2 -outline-offset-2 outline-dashed outline-casSelect")}
            onMouseDownCapture={(e) => {
              if (active) return;
              e.preventDefault();
              e.stopPropagation();
              if (slot === null) onEmpty(g, i);
              else onFocus(slot);
            }}
          >
            {slot === null || !page ? (
              <div className="flex h-full items-center justify-center p-[4cqw] text-center text-[5cqw] text-casDim">Press menu to choose an app</div>
            ) : active ? (
              children
            ) : (
              <div className="pointer-events-none h-full">{renderOther(page)}</div>
            )}
          </div>
        );
      })}
    </div>
  );
}
