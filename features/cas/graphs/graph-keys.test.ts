// SPDX-License-Identifier: GPL-3.0-or-later
import { describe, expect, it } from "vitest";
import type { Key } from "../keys";
import { newPage, type GraphsPage } from "../state/document";
import { graphKey } from "./graph-keys";
import { STANDARD } from "./model";

const graphs = () => newPage("graphs") as GraphsPage;

describe("Graphs keys", () => {
  it("a new page opens f1's entry line on the standard window", () => {
    expect(graphs().editing).toBe(1);
    expect(graphs().window).toEqual(STANDARD);
  });
  it("enter defines what was typed as f1 and closes the entry line", () => {
    const keys: Key[] = [{ k: "char", c: "x" }, { k: "char", c: "^" }, { k: "char", c: "2" }, { k: "enter" }];
    let r: ReturnType<typeof graphKey> = { page: graphs(), effect: null };
    for (const k of keys) r = graphKey(r.page, k);
    expect(r.effect).toEqual({ define: { n: 1, text: "x^(2)" } });
    expect(r.page.editing).toBeNull();
  });
  it("ctrl+T toggles the table", () => {
    const g = graphs();
    expect(graphKey(g, { k: "table" }).page.table).toBe(!g.table);
  });
});
