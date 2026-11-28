// SPDX-License-Identifier: GPL-3.0-or-later
import { CONFIDENCE_INTERVALS, DISTRIBUTIONS, STAT_CALCULATIONS, STAT_TESTS } from "../menus/calculator-menu";
import { app, ins, na, off, rule, sub, type Menu, type MenuAction, type MenuItem, type WizardField } from "../menus/types";
import type { ListsPage } from "../state/document";

/** Where a dialog's list fields start: the selected column on x, the next one on y. */
const X_FIELDS = new Set(["X List:", "X1 List:", "List:", "List 1:"]);
const Y_FIELDS = new Set(["Y List:"]);

type Dialog = Extract<MenuAction, { kind: "wizard" }>;

/** A distribution's dialog builds a call (normCdf(…)); the procedures build a command (OneVar …). */
export const isDistribution = (build: string) => /^[\wχ²]+\(/.test(build);

/**
 * A statistics dialog as Lists & Spreadsheet runs it, as the handheld does:
 * its list fields start on the selected column (and the next for y). A
 * distribution goes into the selected cell as a formula (lists:dist:…). A
 * procedure asks for a 1st Result Column too, the column after the selected
 * one, and fills that column with the results' names and the next with
 * their values (lists:stat:…).
 */
function forListsDialog(d: Dialog, x: string, y: string, result: string): Dialog {
  if (d.then) return { ...d, then: (v) => forListsDialog(d.then!(v), x, y, result) };
  const fields = d.fields.map((f): WizardField => (X_FIELDS.has(f.label) ? { ...f, value: x } : Y_FIELDS.has(f.label) ? { ...f, value: y } : f));
  // A continuous distribution's area can be drawn too (Draw: Shade area), as the handheld offers from the spreadsheet.
  if (isDistribution(d.build))
    return /^(normCdf|tCdf|χ²Cdf|FCdf)\(/.test(d.build)
      ? { ...d, fields: [...fields, { label: "Shade area", check: true, value: "No" }], build: `lists:dist:{${fields.length}}:${d.build}` }
      : { ...d, fields, build: `lists:dist:No:${d.build}` };
  // A test's P value can be drawn too: its distribution beside the spreadsheet with the tail (or tails) shaded.
  if (TESTS.test(d.build))
    return {
      ...d,
      fields: [...fields, { label: "1st Result Column:", value: result, required: true }, { label: "Shade P value", check: true, value: "No" }],
      build: `lists:statp:{${fields.length + 1}}:{${fields.length}}:${d.build}`,
    };
  return { ...d, fields: [...fields, { label: "1st Result Column:", value: result, required: true }], build: `lists:stat:{${fields.length}}:${d.build}` };
}
/** The tests whose P value comes from a z, t, χ² or F statistic, which Shade P value can draw. */
const TESTS = /^(zTest|tTest|zTest_2Samp|tTest_2Samp|zTest_1Prop|zTest_2Prop|χ²GOF|χ²2way|FTest_2Samp|LinRegtTest)\b/;

/**
 * One of the Calculator's statistics items as Lists & Spreadsheet runs it.
 * Items that only paste text keep their place, greyed, so the keys still
 * line up.
 */
export function forLists(item: MenuItem, x: string, y: string, result: string): MenuItem {
  const keep = item.rule ? { rule: true } : {};
  if (item.items) return { ...sub(item.label, item.items.map((i) => forLists(i, x, y, result))), ...keep };
  const a = item.action;
  if (a?.kind !== "wizard") return { ...off(item.label), ...keep };
  return { ...item, action: forListsDialog(a, x, y, result) };
}

/** Sort, on a picked column (Actions ▸ Select ▸ Select Column). */
const SORT = (info: ListsMenuInfo): MenuItem =>
  info.picked === "col"
    ? { label: "Sort", action: { kind: "wizard", title: "Sort", fields: [{ label: "Order:", value: "Ascending", options: ["Ascending", "Descending"] }], build: "lists:sort:{0}" } }
    : na("Sort", "pick the column first: Actions ▸ Select ▸ Select Column");

/** Resize ▸ for a column, each working on the selected column. */
const RESIZE_ITEMS = (): MenuItem[] => [
  app("Resize Column Width", "listsResize"),
  app("Maximize Column Width", "listsMaxWidth"),
  app("Minimize Column Width", "listsMinWidth"),
];

/**
 * Color ▸ Fill Color and Text Color: the handheld's palette of fifteen
 * colours and None, here one row each (the handheld shows them as swatches).
 */
export const PALETTE: [string, string][] = [
  ["Navy", "#000080"],
  ["Blue", "#0000ff"],
  ["Brown", "#993300"],
  ["Red", "#ff0000"],
  ["Magenta", "#ff00ff"],
  ["Green", "#008000"],
  ["Light Blue", "#3399ff"],
  ["Orange", "#ff9933"],
  ["Yellow", "#ffff00"],
  ["White", "#ffffff"],
  ["Light Gray", "#e0e0e0"],
  ["Silver", "#c0c0c0"],
  ["Gray", "#808080"],
  ["Dark Gray", "#555555"],
  ["Black", "#000000"],
];
const COLOR = sub("Color", [
  off("Line Color"),
  sub("Fill Color", [...PALETTE.map(([name, hex]) => app(name, `listsColour:fill:${hex}`)), app("None", "listsColour:fill:")]),
  sub("Text Color", [...PALETTE.map(([name, hex]) => app(name, `listsColour:text:${hex}`)), app("None", "listsColour:text:")]),
]);

/** What the menus need to know about the page beyond the selection. */
export type ListsMenuInfo = {
  /** The selected column's list name, if it has one: Quick Graph needs it. */
  named?: string;
  /** The problem's list names, for Summary Plot's dropdowns. */
  lists?: string[];
  /** The functions the table can show, by number, and the selected table column's function. */
  fns?: { n: number; text: string }[];
  tableFn?: { n: number; text: string };
  /** A cell is being edited: the handheld greys what can't act then, and offers Select Formula Range. */
  editing?: boolean;
  /** A whole column or row picked (Actions ▸ Select): Sort works on a picked column. */
  picked?: "row" | "col";
  /** The selected column's calculation mode, where Data ▸ set one. */
  colMode?: "auto" | "exact" | "approx";
};

/**
 * The menu key on a Lists & Spreadsheet page, item for item as the
 * handheld's. The statistics are the Calculator's, in the handheld's order,
 * starting on the selected column (and the next one for two-variable work):
 * its name, or a[] for an unnamed column A, as the handheld writes it.
 * `prefix` goes in front of a command Data pastes: "=" when it starts a
 * cell, as the handheld writes it, nothing when the cell is being edited
 * or the formula row adds its own.
 *
 * Delete Row and Delete Column aren't here: the handheld keeps them in the
 * context menu (Ctrl+Menu) on a selected row or column.
 */
export function listsMenu(x: string, y: string, table?: { start: number; step: number }, prefix = "=", result = "", info: ListsMenuInfo = {}): Menu {
  const wiz = (label: string, title: string, fields: WizardField[], build: string) => ({
    label,
    action: { kind: "wizard" as const, title, fields, build },
  });
  const stats = (items: MenuItem[]) => items.map((i) => forLists(i, x, y, result));
  const cmd = (label: string, text: string) => ins(label, `${prefix}${text}`);
  // Switched to a function table, the handheld's menu is only these two.
  if (table) {
    const fn = info.tableFn;
    return [
      // Resize acts on the function column picked with ◄ ►; Auto-size fits every column to what it shows.
      sub("Actions", [
        sub(
          "Resize",
          fn
            ? [app("Resize Column Width", "listsTableResize"), app("Maximize Column Width", "listsTableMax"), app("Minimize Column Width", "listsTableMin"), app("Auto-size", "listsTableAuto")]
            : ["Resize Column Width", "Maximize Column Width", "Minimize Column Width", "Auto-size"].map((l) => na(l, "the table has no function columns")),
        ),
      ]),
      sub("Table", [
        { ...app("Switch to Lists & Spreadsheet", "listsTable"), hint: "Ctrl+T" },
        fn ? app("Delete Column", "listsTableDelete") : na("Delete Column", "there's no function column to take away"),
        info.fns?.length
          ? wiz("Choose...", "Choose", [{ label: "Function:", value: `f${(fn ?? info.fns[0]!).n}`, options: info.fns.map((f) => `f${f.n}`) }], "lists:tablechoose:{0}")
          : na("Choose...", "there are no functions in this problem"),
        fn ? wiz("Edit Expression", "Edit Expression", [{ label: `f${fn.n}(x)=`, value: fn.text }], `lists:tableedit:${fn.n}:{0}`) : na("Edit Expression", "select a function's column first"),
        wiz(
          "Edit Table Settings...",
          "Function Table Settings",
          [
            { label: "Table Start:", value: String(table.start) },
            { label: "Table Step:", value: String(table.step) },
          ],
          "lists:tableset:{0}:{1}",
        ),
      ]),
    ];
  }
  const lists = info.lists ?? [];
  const summaryPlot = lists.length
    ? wiz(
        "Summary Plot",
        "Summary Plot",
        [
          { label: "X List:", value: info.named ?? lists[0]!, options: lists },
          { label: "Summary List:", value: lists.find((l) => l !== (info.named ?? lists[0])) ?? lists[0]!, options: lists },
          { label: "Display On:", value: "Split Page", options: ["Split Page", "New Page"] },
        ],
        "lists:summary:{0}:{1}:{2}",
      )
    : na("Summary Plot", "name two columns first: it plots one list against another's counts");
  const quickGraph = info.named ? app("Quick Graph", "listsQuickGraph") : na("Quick Graph", "name the column first");
  // While a cell is edited, the handheld greys what would leave the edit, and Select Formula Range is the one way in.
  const ed = info.editing;
  const notEditing = (item: MenuItem): MenuItem => (ed ? na(item.label, "finish editing the cell first") : item);
  return [
    sub("Actions", [
      notEditing(app("Move Column", "listsMove")),
      sub("Resize", [...RESIZE_ITEMS(), app("Resize Row Height", "listsRowResize")].map(notEditing)),
      sub("Select", [
        notEditing(app("Select Row", "listsPickRow")),
        notEditing(app("Select Column", "listsPickCol")),
        ed ? app("Select Formula Range", "listsRange") : na("Select Formula Range", "start editing a formula first"),
      ]),
      // One field and no label, as the handheld's: a cell such as b5.
      { ...wiz("Go To", "Go To", [{ label: "" }], "lists:goto:{0}"), hint: "Ctrl+G" },
      { ...app("Recalculate", "listsRecalc"), hint: "Ctrl+R" },
      // Sort takes a picked column, as the handheld's: greyed on a single cell.
      SORT(info),
    ]),
    sub("Insert", [app("Insert Cell", "listsInsertCell"), app("Insert Row", "listsInsertRow"), app("Insert Column", "listsInsertColumn")].map(notEditing)),
    sub("Data", [
      wiz(
        "Generate Sequence",
        "Sequence",
        [
          { label: "Formula: u(n)=", value: "", hint: "n^2" },
          { label: "Initial Terms:", value: "1" },
          { label: "Max No. Terms:", value: "10" },
        ],
        "lists:seq:{0}:{1}:{2}",
      ),
      // Vernier sensors: there's nothing to capture from in a browser.
      sub("Data Capture", [off("Automatic"), off("Manual")]),
      app("Fill", "listsFill"),
      app("Clear Data", "listsClearColumn"),
      sub("Random", [cmd("Number", "rand("), cmd("Integer", "randInt("), cmd("Binomial", "randBin("), cmd("Normal", "randNorm("), cmd("Sample", "randSamp(")]),
      sub("List Math", [
        cmd("Minimum", "min("),
        cmd("Maximum", "max("),
        cmd("Mean", "mean("),
        cmd("Median", "median("),
        cmd("Sum of Elements", "sum("),
        cmd("Product of Elements", "product("),
        cmd("Sample Standard Deviation", "stDevSamp("),
        cmd("Sample Variance", "varSamp("),
        cmd("Population Standard Deviation", "stDevPop("),
        cmd("Population Variance", "varPop("),
      ]),
      sub("List Operations", [
        cmd("Cumulative Sum List", "cumulativeSum("),
        cmd("Difference List", "ΔList("),
        cmd("Augment", "augment("),
        // Greyed on the handheld in a spreadsheet: a cell can't hold the matrix it would take.
        na("Convert Matrix to List", "a cell can't hold a matrix"),
        cmd("Left", "left("),
        cmd("Mid", "mid("),
        cmd("Right", "right("),
      ]),
      summaryPlot,
      quickGraph,
    ]),
    sub("Statistics", [
      // The spreadsheet's list stops at Multiple Linear Regression: Correlation Matrix is the Calculator's alone.
      sub("Stat Calculations", stats(STAT_CALCULATIONS.filter((i) => i.label !== "Correlation Matrix"))),
      sub("Distributions", stats(DISTRIBUTIONS)),
      sub("Confidence Intervals", stats(CONFIDENCE_INTERVALS)),
      sub("Stat Tests", stats(STAT_TESTS)),
    ]),
    sub("Table", [{ ...app("Switch to Table", "listsTable"), hint: "Ctrl+T" }]),
  ];
}

/**
 * ctrl menu on a Lists & Spreadsheet page: the handheld's context menu for
 * a picked column, a picked row (Actions ▸ Select), or a cell. Delete Row
 * and Delete Column live here, as on the handheld.
 */
export function listsContextMenu(p: ListsPage, info: ListsMenuInfo = {}): Menu {
  const clip = [app("Cut", "listsCut"), app("Copy", "listsCopy"), app("Paste", "listsPaste")];
  const menu = listsMenu("", "", undefined, "=", "", info);
  const data = menu[2]!.items!;
  if (p.pick === "col")
    return [
      ...clip,
      rule(app("Insert Column", "listsInsertColumn")),
      app("Delete Column", "listsDeleteColumn"),
      app("Move Column", "listsMove"),
      sub("Resize", RESIZE_ITEMS()),
      sub("Data", [
        SORT({ ...info, picked: "col" }),
        app("Clear Data", "listsClearColumn"),
        // A column's own calculation mode for its formulas; Restore goes back to the document's.
        app("Auto", "listsColMode:auto"),
        app("Exact", "listsColMode:exact"),
        app("Approximate", "listsColMode:approx"),
        info.colMode ? app("Restore Document Setting", "listsColMode:") : na("Restore Document Setting", "the column already follows the document's setting"),
        data[7]!,
        data[8]!,
      ]),
      COLOR,
    ];
  if (p.pick === "row") return [...clip, rule(app("Resize Row", "listsRowResize")), app("Insert Row", "listsInsertRow"), app("Delete Row", "listsDeleteRow"), COLOR];
  // A column's name: its list as a variable — stored under a name, or linked to a list the problem has.
  if (p.sel.row === 0) {
    const name = p.cols[p.sel.col]?.name;
    const others = (info.lists ?? []).filter((l) => l !== name);
    return [
      na("Cut", "a column's name is cut by editing it"),
      app("Paste", "listsPaste"),
      rule(
        sub("Variables", [
          { label: "Store Var", action: { kind: "wizard", title: "Store Variable", fields: [{ label: "Variable:", value: name ?? "" }], build: "lists:name:{0}" } },
          na("Unlink", "the column isn't linked to a variable"),
          sub("Link To:", others.length ? others.map((l) => app(l, `listsLink:${l}`)) : [na("(no lists)", "the problem has no other lists")]),
        ]),
      ),
      rule(sub("Resize", RESIZE_ITEMS())),
      data[7]!,
      data[8]!,
      COLOR,
    ];
  }
  return [
    ...clip,
    rule(app("Insert Cell", "listsInsertCell")),
    app("Delete Cell", "listsDeleteCell"),
    app("Fill", "listsFill"),
    // Variables ▸ links a cell to a variable on the handheld; greyed there too until one's chosen.
    rule(off("Variables")),
    sub("Resize", [...RESIZE_ITEMS(), app("Resize Row Height", "listsRowResize")]),
    data[7]!,
    data[8]!,
    COLOR,
  ];
}
