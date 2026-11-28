// SPDX-License-Identifier: GPL-3.0-or-later
/**
 * The menu key on a Notes page, item for item as the handheld's: Actions,
 * Templates, Insert, Format, Math Box Options and Calculations (the
 * Calculator's commands, typed into the current maths box).
 */
import { calculatorMenu } from "../menus/calculator-menu";
import { PALETTE } from "../lists/lists-menu";
import { app, na, off, rule, sub, type Menu, type MenuItem } from "../menus/types";
import type { NotesPage } from "../state/document";

const hinted = (item: MenuItem, hint: string): MenuItem => ({ ...item, hint });

/** Insert ▸ Shape, in the handheld's order: each is typed as its symbol, followed by the points (∠ABC, △ABC, ⊙O). */
export const SHAPES: [string, string][] = [
  ["Angle", "∠"],
  ["Triangle", "△"],
  ["Circle", "⊙"],
  ["Line", "↔"],
  ["Segment", "‾"],
  ["Ray", "→"],
  ["Vector", "⇀"],
];

/**
 * Calculations ▸ Define Variables: the Calculator's Actions without the
 * entries that only make sense on a Calculator page (Recall Definition,
 * Clear a–z, Clear History, Insert Comment, Lock), as the handheld trims it.
 */
const calcActions = calculatorMenu[0]!.items ?? [];
const pick = (label: string) => calcActions.find((i) => i.label === label)!;
const DEFINE_VARIABLES = sub("Define Variables", [pick("Define"), { ...pick("Delete Variable"), rule: false }, { ...pick("Library"), rule: false }]);

/** A colour list for Text color or Fill color, and None. */
const colours = (kind: "text" | "fill") => [...PALETTE.map(([name, hex]) => app(name, `notes:colour:${kind}:${hex}`)), app("None", `notes:colour:${kind}:`)];

/** Whether the page is a Q&A one: Hide Answer works on its answers. */
const isQA = (p: NotesPage) => p.paras.some((para) => para.some((r) => typeof r === "object" && "text" in r && r.b && r.text.trim() === "Question:"));

export const notesMenu = (page: NotesPage): Menu => [
  sub("Actions", [
    hinted(app("Evaluate", "notes:eval"), "Enter"),
    hinted(app("Approximate", "notes:approx"), "Ctrl+Enter"),
    app("Evaluate & Replace", "notes:evalReplace"),
    rule(app("Deactivate", "notes:active:off")),
    app("Deactivate All", "notes:active:all-off"),
    app("Activate", "notes:active:on"),
    app("Activate All", "notes:active:all-on"),
  ]),
  sub("Templates", [
    app("Q&A", "notes:tpl:qa"),
    app("Proof", "notes:tpl:proof"),
    // A new page is the Default template already.
    na("Default", "it's the template in use"),
    isQA(page) ? app(page.hideAnswer ? "Show Answer (Q&A)" : "Hide Answer (Q&A)", "notes:hideAnswer") : na("Hide Answer (Q&A)", "for a page made from the Q&A template"),
  ]),
  sub("Insert", [
    app("Math Box", "notes:math"),
    app("Chem Box", "notes:chem"),
    sub(
      "Shape",
      SHAPES.map(([label, sym]) => app(label, `notes:shape:${sym}`)),
    ),
    sub("Comment", [app("Teacher", "notes:comment:Teacher"), app("Reviewer", "notes:comment:Reviewer")]),
    app("Slider", "notesSlider"),
  ]),
  sub("Format", [
    // The handheld's Format Text panel: font, size and the six style buttons.
    app("Format text...", "notes:formatPanel"),
    // Line color is for shapes; text has none, as the handheld greys it.
    off("Line color"),
    sub("Fill color", colours("fill")),
    sub("Text color", colours("text")),
  ]),
  sub("Math Box Options", [app("Math Box Attributes...", "notes:attrs"), rule(app("Show Warning Info...", "notes:report:warn")), app("Show Error...", "notes:report:error")]),
  // The Calculator's menu from Number to Finance; Functions & Programs is the Calculator's alone.
  sub("Calculations", [DEFINE_VARIABLES, ...calculatorMenu.slice(1, 8)]),
];

/** What the ctrl menu on a Notes page depends on: where the caret is, and what the box there holds. */
export type NotesContext = { inBox: boolean; selection: boolean; warning: boolean; inactive: boolean; variables: string[] };

/** Format text…, which opens the Format Text panel, and Color with Line color greyed. */
const formatText = (): MenuItem => app("Format text...", "notes:formatPanel");
const colour = (): MenuItem => sub("Color", [na("Line color", "text has no lines to colour"), sub("Fill color", colours("fill")), sub("Text color", colours("text"))]);

/**
 * ctrl menu on a Notes page, as the handheld's: in a maths box, its warning,
 * editing, formatting, attributes and Actions; elsewhere in the text,
 * editing, formatting, inserting boxes, Actions and the things to type.
 * Actions' box items are greyed outside a box, as the handheld greys them.
 */
export function notesContextMenu(c: NotesContext): Menu {
  const sel = (label: string, id: string) => (c.selection ? app(label, id) : na(label, "nothing is selected"));
  const actions = sub("Actions", [
    c.inBox ? app("Evaluate", "notes:eval") : na("Evaluate", "the caret isn't in a maths box"),
    c.inBox ? app("Approximate", "notes:approx") : na("Approximate", "the caret isn't in a maths box"),
    c.inBox ? app("Evaluate & Replace", "notes:evalReplace") : na("Evaluate & Replace", "the caret isn't in a maths box"),
    rule(c.inBox && !c.inactive ? app("Deactivate", "notes:active:off") : na("Deactivate", c.inBox ? "the box is deactivated already" : "the caret isn't in a maths box")),
    app("Deactivate All", "notes:active:all-off"),
    c.inBox && c.inactive ? app("Activate", "notes:active:on") : na("Activate", c.inBox ? "the box is active already" : "the caret isn't in a maths box"),
    app("Activate All", "notes:active:all-on"),
  ]);
  if (c.inBox)
    return [
      c.warning ? app("Show Warning Info", "notes:report:warn") : na("Show Warning Info", "this box's result came with no warning"),
      rule(sel("Cut", "editCut")),
      sel("Copy", "editCopy"),
      app("Paste", "editPaste"),
      // With nothing selected, Delete takes the box away.
      c.selection ? app("Delete", "editDelete") : app("Delete", "notes:deleteBox"),
      rule(formatText()),
      colour(),
      rule(app("Math Box Attributes...", "notes:attrs")),
      rule(actions),
    ];
  return [
    sel("Cut", "editCut"),
    sel("Copy", "editCopy"),
    app("Paste", "editPaste"),
    sel("Delete", "editDelete"),
    rule(formatText()),
    colour(),
    rule(app("Insert Math Box", "notes:math")),
    app("Insert Chem Box", "notes:chem"),
    rule(actions),
    sub("Select Variable", c.variables.length ? c.variables.map((v) => app(v, `varpick:${v}`)) : [na("(no variables)", "the problem has no variables yet")]),
    app("Symbols...", "openSymbols"),
    app("Math Templates...", "openTemplates"),
    sub(
      "Shapes",
      SHAPES.map(([label, sym]) => app(label, `notes:shape:${sym}`)),
    ),
  ];
}
