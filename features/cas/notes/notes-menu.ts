// SPDX-License-Identifier: GPL-3.0-or-later
/**
 * The menu key on a Notes page: Templates, Insert, Format, Calculations (the
 * Calculator's commands, typed into the current maths box) and Evaluate.
 */
import { calculatorMenu } from "../menus/calculator-menu";
import { app, rule, sub, type Menu, type MenuItem } from "../menus/types";

const hinted = (item: MenuItem, hint: string): MenuItem => ({ ...item, hint });

/** Geometry shapes are typed as their symbols, followed by the points: △ABC, ∠ABC, ⊙O. */
export const SHAPES: [string, string][] = [
  ["Triangle", "△"],
  ["Angle", "∠"],
  ["Circle", "⊙"],
  ["Line", "↔"],
  ["Ray", "→"],
  ["Segment", "‾"],
  ["Vector", "⇀"],
  ["Arc", "⌒"],
];

export const NOTES_MENU: Menu = [
  sub("Templates", [app("Q&A", "notes:tpl:qa"), app("Proof", "notes:tpl:proof"), app("Default", "notes:tpl:default")]),
  sub("Insert", [
    app("Math Box", "notes:math"),
    app("Chem Box", "notes:chem"),
    sub("Comment", [app("Teacher", "notes:comment:Teacher"), app("Reviewer", "notes:comment:Reviewer")]),
    sub(
      "Shapes",
      SHAPES.map(([label, sym]) => app(`${label}  ${sym}`, `notes:shape:${sym}`)),
    ),
  ]),
  sub("Format", [
    sub("Format Text", [
      hinted(app("Bold", "notes:fmt:bold"), "Ctrl B"),
      app("Italic", "notes:fmt:italic"),
      hinted(app("Underline", "notes:fmt:underline"), "Ctrl U"),
      app("Strikethrough", "notes:fmt:strikeThrough"),
      app("Subscript", "notes:fmt:subscript"),
      app("Superscript", "notes:fmt:superscript"),
    ]),
    rule(app("Math Box Attributes...", "notes:attrs")),
    app("Convert to Math Box", "notes:toMath"),
    app("Convert to Text", "notes:toText"),
  ]),
  sub("Calculations", calculatorMenu),
  sub("Evaluate", [
    hinted(app("Evaluate", "notes:eval"), "Enter"),
    hinted(app("Approximate", "notes:approx"), "Ctrl Enter"),
    rule(app("Evaluate All Math Boxes", "notes:evalAll")),
  ]),
];
