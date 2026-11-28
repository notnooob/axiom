// SPDX-License-Identifier: GPL-3.0-or-later
/**
 * The Program Editor's menu, in the handheld's order: Actions, Check Syntax &
 * Store, Define Variables, Control, Transfers, I/O, Mode, Hub, Draw. Control,
 * I/O and Mode are the Calculator's Functions & Programs items; in the
 * editor their ":" between lines becomes a new line.
 */
import { calculatorMenu } from "../menus/calculator-menu";
import { CARET as C } from "../math/editor";
import { app, ins, na, off, rule, sub, type Menu, type MenuItem } from "../menus/types";

const hinted = (item: MenuItem, hint: string): MenuItem => ({ ...item, hint });

/** One of the Calculator's Functions & Programs submenus, by label. */
function fromCalculator(label: string, as = label): MenuItem {
  const fp = calculatorMenu.find((i) => i.label === "Functions & Programs")?.items ?? [];
  const found = fp.find((i) => i.label === label);
  return found ? { ...found, label: as } : off(as);
}

/** The handheld's drawing commands, inserted to be run in a program. */
const DRAW_SHAPES = ["DrawLine", "DrawRect", "FillRect", "DrawCircle", "FillCircle", "DrawText", "DrawArc", "FillArc", "DrawPoly", "FillPoly", "PlotXY"];
const DRAW_CONTROL = ["Clear", "SetColor", "SetPen", "SetWindow", "UseBuffer", "PaintBuffer"];

/** readOnly: opened with View, where the text can't change; back: Go Back has a place to return to. */
export function programMenu(s: { readOnly: boolean; back: boolean }): Menu {
  const edit = (item: MenuItem): MenuItem =>
    item.items ? { ...item, items: item.items.map(edit) } : s.readOnly && item.action ? { label: item.label, unavailable: "it was opened with View: Open it to change it" } : item;
  return [
    sub("Actions", [
      app("New...", "prgmNew"),
      app("Open...", "prgmOpen"),
      app("Import...", "prgmImport"),
      app("View...", "prgmView"),
      rule(app("Create Copy...", "prgCopy")),
      edit(app("Rename...", "prgRename")),
      edit(app("Change Library Access...", "prgAccess")),
      rule(edit(hinted(app("Comment/Uncomment", "prgComment"), "Ctrl+T"))),
      hinted(app("Find...", "prgFind"), "Ctrl+F"),
      edit(hinted(app("Find and Replace...", "prgReplace"), "Shift+Ctrl+H")),
      hinted(app("Go to Line...", "prgGoto"), "Ctrl+G"),
      rule(s.back ? app("Go Back", "prgBack") : na("Go Back", "Find or Go to Line hasn't moved the cursor yet")),
      rule(app("Close", "prgClose")),
    ]),
    sub(
      "Check Syntax & Store",
      [hinted(app("Check Syntax & Store", "prgStore"), "Ctrl+B"), app("Check Syntax", "prgCheck"), hinted(app("Run", "prgRun"), "Ctrl+R")].map(edit),
    ),
    sub(
      "Define Variables",
      [
        ins("Local", "Local "),
        ins("Define", "Define "),
        ins("Delete Variable", "DelVar "),
        ins("Func...EndFunc", `Func:${C}:EndFunc`),
        ins("Prgm...EndPrgm", `Prgm:${C}:EndPrgm`),
        sub("Lock", [ins("Lock Variable", "Lock "), ins("Unlock Variable", "unLock "), ins("Get Lock Info", "getLockInfo(")]),
      ].map(edit),
    ),
    edit(fromCalculator("Control")),
    edit(fromCalculator("Transfer", "Transfers")),
    edit(fromCalculator("I/O")),
    edit(fromCalculator("Mode")),
    // The TI-Innovator Hub's commands: there's no hub to talk to from a browser.
    off("Hub"),
    sub("Draw", [sub("Shapes", DRAW_SHAPES.map((c) => edit(ins(c, `${c} `)))), sub("Control", DRAW_CONTROL.map((c) => edit(ins(c, c === "Clear" ? "Clear" : `${c} `))))]),
  ];
}
