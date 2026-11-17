// SPDX-License-Identifier: GPL-3.0-or-later
import { app, off, rule, sub, type Menu, type WizardField } from "../menus/types";

const listField = (label: string, value: string): WizardField => ({ label, value });

/**
 * The menu key on a Lists & Spreadsheet page. The statistics dialogs start on
 * the selected column (and the next one for two-variable work).
 */
export function listsMenu(x: string, y: string): Menu {
  const wiz = (label: string, title: string, fields: WizardField[], build: string) => ({
    label,
    action: { kind: "wizard" as const, title, fields, build },
  });
  const twoVar = (label: string, cmd: string) =>
    wiz(label, label, [listField("X List:", x), listField("Y List:", y)], `lists:stat:${cmd}:{0}:{1}`);
  return [
    sub("Actions", [
      app("Insert Row", "listsInsertRow"),
      app("Insert Column", "listsInsertColumn"),
      app("Delete Row", "listsDeleteRow"),
      app("Delete Column", "listsDeleteColumn"),
      rule(app("Clear Data", "listsClearColumn")),
    ]),
    off("Insert"),
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
      sub("Stat Calculations", [
        wiz("One-Variable Statistics...", "One-Variable Statistics", [listField("X1 List:", x)], "lists:stat:OneVar:{0}"),
        twoVar("Two-Variable Statistics...", "TwoVar"),
        rule(twoVar("Linear Regression (mx+b)...", "LinRegMx")),
        twoVar("Linear Regression (a+bx)...", "LinRegBx"),
        twoVar("Quadratic Regression...", "QuadReg"),
        twoVar("Exponential Regression...", "ExpReg"),
        twoVar("Power Regression...", "PowerReg"),
        twoVar("Logarithmic Regression...", "LnReg"),
      ]),
    ]),
    off("Table"),
  ];
}
