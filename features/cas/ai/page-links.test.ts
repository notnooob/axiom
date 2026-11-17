// SPDX-License-Identifier: GPL-3.0-or-later
import { describe, expect, it } from "vitest";
import { linkPages, PAGE_LINK } from "./page-links";

const pages = ["1.1 Lists & Spreadsheet", "1.2 Data & Statistics", "1.3 Calculator", "2.1 Graphs"];

describe("linkPages", () => {
  it("links the open document's pages", () => {
    expect(linkPages("Working on 1.3 Calculator and 2.1 Graphs.", pages)).toBe("Working on [1.3 Calculator](#axiom-page-2) and [2.1 Graphs](#axiom-page-3).");
    // The short name of an app still links.
    expect(linkPages("Data in 1.1 Lists (weight).", pages)).toBe("Data in [1.1 Lists](#axiom-page-0) (weight).");
    expect(linkPages("**1.2 Data & Statistics**", pages)).toBe("**[1.2 Data & Statistics](#axiom-page-1)**");
  });

  it("leaves pages that aren't in the document, or are another app", () => {
    expect(linkPages("See 3.1 Graphs.", pages)).toBe("See 3.1 Graphs.");
    expect(linkPages("See 1.3 Graphs.", pages)).toBe("See 1.3 Graphs.");
    expect(linkPages("See 1.3 Calculator.", [])).toBe("See 1.3 Calculator.");
    expect(linkPages("x = 11.3 Calculator", pages)).toBe("x = 11.3 Calculator");
  });

  it("never touches code or maths", () => {
    const text = "`1.3 Calculator` and $1.3 Calculator$ and $$2.1 Graphs$$ but 2.1 Graphs";
    expect(linkPages(text, pages)).toBe("`1.3 Calculator` and $1.3 Calculator$ and $$2.1 Graphs$$ but [2.1 Graphs](#axiom-page-3)");
    expect(linkPages("```\n1.3 Calculator\n```", pages)).toBe("```\n1.3 Calculator\n```");
  });

  it("doesn't link a link twice", () => {
    const once = linkPages("On 2.1 Graphs.", pages);
    expect(linkPages(once, pages)).toBe(once);
  });

  it("reads a link's page back", () => {
    expect(PAGE_LINK.exec("#axiom-page-3")?.[1]).toBe("3");
    expect(PAGE_LINK.test("https://example.com/#axiom-page-3")).toBe(false);
  });
});
