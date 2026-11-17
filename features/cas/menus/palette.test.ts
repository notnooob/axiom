// SPDX-License-Identifier: GPL-3.0-or-later
// The templates palette and the catalog's Templates tab: what picking a cell does.
import { describe, expect, it } from "vitest";
import { catalogKeyPress, openCatalog } from "../catalog/catalog";
import { MATRIX_WIZARD } from "./types";
import { PALETTE, paletteKeyPress, pickCell, TEMPLATE_CELLS } from "./palette";

const at = (label: string) => {
  const i = PALETTE.findIndex((c) => c.label === label);
  if (i < 0) throw new Error(`no palette cell ${label}`);
  return i;
};

describe("templates palette", () => {
  it("inserts the row and column matrix templates", () => {
    expect(pickCell(at("Row matrix"))).toEqual({ index: null, insert: "rowmatrix" });
    expect(pickCell(at("Column matrix"))).toEqual({ index: null, insert: "colmatrix" });
  });
  it("closes and opens the Create a Matrix dialog for the m by n matrix", () => {
    expect(pickCell(at("Matrix, m by n"))).toEqual({ index: null, wizard: MATRIX_WIZARD });
    expect(paletteKeyPress(at("Matrix, m by n"), { k: "enter" })).toEqual({ index: null, wizard: MATRIX_WIZARD });
  });
  it("shows the matrix cells as available", () => {
    for (const label of ["Row matrix", "Column matrix", "Matrix, m by n"]) expect(TEMPLATE_CELLS[at(label)]?.enabled).toBe(true);
  });
});

describe("catalog Templates tab", () => {
  const tab = { ...openCatalog(5), template: at("Matrix, m by n") };
  it("opens the same dialog as the palette", () => {
    expect(catalogKeyPress(tab, { k: "enter" })).toEqual({ state: null, wizard: MATRIX_WIZARD });
  });
  it("inserts a plain template", () => {
    expect(catalogKeyPress({ ...tab, template: at("Row matrix") }, { k: "enter" })).toEqual({ state: null, template: "rowmatrix" });
  });
});
