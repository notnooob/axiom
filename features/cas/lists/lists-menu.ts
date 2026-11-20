// SPDX-License-Identifier: GPL-3.0-or-later
import { CONFIDENCE_INTERVALS, DISTRIBUTIONS, STAT_CALCULATIONS, STAT_TESTS } from "../menus/calculator-menu";
import { app, na, off, rule, sub, type Menu, type MenuItem, type WizardField } from "../menus/types";

/** Where a dialog's list fields start: the selected column on x, the next one on y. */
const X_FIELDS = new Set(["X List:", "X1 List:"]);
const Y_FIELDS = new Set(["Y List:"]);

/**
 * One of the Calculator's statistics items as Lists & Spreadsheet runs it:
 * the same dialog, starting on the selected columns, and run by the page
 * (lists:run:…) instead of pasted into an entry line. Items that only paste
 * text keep their place, greyed, so the keys still line up.
 */
export function forLists(item: MenuItem, x: string, y: string): MenuItem {
  const keep = item.rule ? { rule: true } : {};
  if (item.items) return { ...sub(item.label, item.items.map((i) => forLists(i, x, y))), ...keep };
  const a = item.action;
  if (a?.kind !== "wizard") return { ...off(item.label), ...keep };
  const fields = a.fields.map((f): WizardField => (X_FIELDS.has(f.label) ? { ...f, value: x } : Y_FIELDS.has(f.label) ? { ...f, value: y } : f));
  return { ...item, action: { ...a, fields, build: `lists:run:${a.build}` } };
}

/**
 * The menu key on a Lists & Spreadsheet page. The statistics are the
 * Calculator's, in the handheld's order, starting on the selected column
 * (and the next one for two-variable work): its name, or a[] for an unnamed
 * column A, as the handheld writes it.
 */
export function listsMenu(x: string, y: string, table?: { start: number; step: number }): Menu {
  const wiz = (label: string, title: string, fields: WizardField[], build: string) => ({
    label,
    action: { kind: "wizard" as const, title, fields, build },
  });
  const stats = (items: MenuItem[]) => items.map((i) => forLists(i, x, y));
  return [
    sub("Actions", [
      app("Insert Row", "listsInsertRow"),
      app("Insert Column", "listsInsertColumn"),
      app("Delete Row", "listsDeleteRow"),
      app("Delete Column", "listsDeleteColumn"),
      rule(app("Clear Data", "listsClearColumn")),
    ]),
    // A cell, a row or a column at the selection (the same row and column as Actions inserts).
    sub("Insert", [
      { ...app("Cell", "listsInsertCell"), unverified: true },
      { ...app("Row", "listsInsertRow"), unverified: true },
      { ...app("Column", "listsInsertColumn"), unverified: true },
    ]),
    sub("Data", [
      wiz("Generate Sequence...", "Sequence", [
        { label: "Formula: u(n)=", value: "", hint: "n^2" },
        { label: "Initial Terms:", value: "1" },
        { label: "Max No. Terms:", value: "10" },
      ], "lists:seq:{0}:{1}:{2}"),
      rule(app("Sort Ascending", "listsSortUp")),
      app("Sort Descending", "listsSortDown"),
    ]),
    sub("Statistics", [
      sub("Stat Calculations", stats(STAT_CALCULATIONS)),
      sub("Distributions", stats(DISTRIBUTIONS)),
      sub("Confidence Intervals", stats(CONFIDENCE_INTERVALS)),
      sub("Stat Tests", stats(STAT_TESTS)),
    ]),
    // The problem's functions as a table of values, in place of the spreadsheet (Ctrl+T on a Graphs page splits the screen instead).
    sub("Table", [
      { ...app(table ? "Switch to Lists & Spreadsheet" : "Switch to Table", "listsTable"), unverified: true },
      table
        ? {
            ...wiz(
              "Edit Function Table Settings...",
              "Function Table Settings",
              [
                { label: "Table Start:", value: String(table.start) },
                { label: "Table Step:", value: String(table.step) },
              ],
              "lists:tableset:{0}:{1}",
            ),
            unverified: true,
          }
        : na("Edit Function Table Settings...", "switch to the table first"),
    ]),
  ];
}
