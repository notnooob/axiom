// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 VCE Hub. Part of the /cas calculator: https://github.com/vcehub/cas
import { app, off, rule, sub, wiz, type Menu } from "./types";

/**
 * The Graphs app's menu. Item positions are the contract (see types.ts):
 * the same keystrokes reach the same command.
 *
 * Some labels follow the page, as they do on the handheld: Hide Axes reads
 * Show Axes once the axes are hidden, and the current grid is greyed.
 */

/** The page state the menu's labels depend on. */
export type GraphsMenuState = { axes: boolean; entryLine: boolean; grid: "none" | "dot" | "line"; table: boolean };

/** An equation template: the relation entry opened with this form in it. */
const tpl = (label: string, form: string) => app(label, `eqtpl:${form}`);

export function graphsMenu(s: GraphsMenuState): Menu {
  const grid = (label: string, id: string, kind: GraphsMenuState["grid"]) => (s.grid === kind ? off(label) : app(label, id));
  return [
    sub("Actions", [
      off("Pointer"),
      sub("Select", [off("Region"), off("Image"), off("Grid")]),
      off("Hide/Show"),
      rule(off("Attributes")),
      off("Set Conditions"),
      app("Delete all", "deleteAll"),
      rule(off("Text")),
      off("Coordinates and Equations"),
      off("Calculate"),
      off("Redefine"),
      app("Insert Slider", "insertSlider"),
      rule(off("MathDraw")),
    ]),
    sub("View", [
      off("Graphing"),
      off("Plane Geometry"),
      off("3D Graphing"),
      rule(off("Hide Analytic Window")),
      app(s.axes ? "Hide Axes" : "Show Axes", "viewHideAxes"),
      sub("Grid", [
        grid("No Grid", "viewNoGrid", "none"),
        grid("Dot Grid", "viewDotGrid", "dot"),
        grid("Lined Grid", "viewLinedGrid", "line"),
      ]),
      { ...app(s.entryLine ? "Hide Entry Line" : "Show Entry Line", "viewEntryLine"), hint: "Ctrl+G" },
      off("Hide Axes End Values"),
      rule(off("Hide Object Selection Guides")),
    ]),
    rule(
      sub("Graph Entry/Edit", [
        app("Function", "entryFunction"),
        app("Relation", "entryRelation"),
        sub("Equation Templates", [
          // Each opens the relation entry with the form filled in; the letters left in it become sliders when it's plotted.
          sub("Line", [tpl("Line Slope Intercept", "y=m*x+b"), tpl("Vertical Line", "x=a"), tpl("Line Standard", "a*x+b*y=c")]),
          sub("Parabola", [
            tpl("Vertex form", "y=a*(x-h)^2+k"),
            tpl("Standard form", "y=a*x^2+b*x+c"),
            tpl("Vertex form", "x=a*(y-k)^2+h"),
            tpl("Standard form", "x=a*y^2+b*y+c"),
          ]),
          sub("Circle", [tpl("Center form", "(x-h)^2+(y-k)^2=r^2"), tpl("Standard form", "a*x^2+a*y^2+b*x+c*y+d=0")]),
          sub("Ellipse", [tpl("Center form", "(x-h)^2/a^2+(y-k)^2/b^2=1")]),
          sub("Hyperbola", [tpl("East-West", "(x-h)^2/a^2-(y-k)^2/b^2=1"), tpl("South-North", "(y-k)^2/b^2-(x-h)^2/a^2=1")]),
          sub("Conic", [tpl("General", "a*x^2+b*x*y+c*y^2+d*x+e*y+f=0")]),
        ]),
        app("Parametric", "entryParametric"),
        app("Polar", "entryPolar"),
        wiz("Scatter Plot...", "Scatter Plot", [{ label: "x:", value: "" }, { label: "y:", value: "" }], "scatter:{0}:{1}"),
        sub("Sequence", [app("Sequence", "entrySequence"), app("Custom", "entryCustom")]),
        app("Diff Eq", "entryDiffEq"),
      ]),
    ),
    sub("Window / Zoom", [
      app("Window Settings...", "windowSettings"),
      rule(app("Zoom – Box", "zoomBox")),
      app("Zoom – In", "zoomIn"),
      app("Zoom – Out", "zoomOut"),
      rule(app("Zoom – Standard", "zoomStandard")),
      app("Zoom – Quadrant 1", "zoomQuadrant1"),
      app("Zoom – User", "zoomUser"),
      app("Zoom – Trig", "zoomTrig"),
      app("Zoom – Data", "zoomData"),
      app("Zoom – Fit", "zoomFit"),
      rule(app("Zoom – Square", "zoomSquare")),
      app("Zoom – Decimal", "zoomDecimal"),
    ]),
    sub("Trace", [
      app("Graph Trace", "graphTrace"),
      app("Trace All", "traceAll"),
      app("Trace Step...", "traceStep"),
      sub("Path Plot", [off("Function"), off("Parametric"), off("Polar"), off("Path Setup...")]),
      off("Geometry Trace"),
      off("Erase Geometry Trace"),
    ]),
    sub("Analyze Graph", [
      app("Zero", "analyzeZero"),
      app("Minimum", "analyzeMinimum"),
      app("Maximum", "analyzeMaximum"),
      app("Intersection", "analyzeIntersection"),
      app("Inflection", "analyzeInflection"),
      app("dy/dx", "analyzeDydx"),
      app("Integral", "analyzeIntegral"),
      app("Bounded Area", "analyzeBounded"),
      sub(
        "Analyze Conics",
        ["Center", "Vertices", "Foci", "Axes of Symmetry", "Directrix", "Asymptotes", "Radius", "Eccentricity", "Latus Rectum"].map(off),
      ),
    ]),
    sub("Table", [
      { ...(s.table ? off("Split-screen Table") : app("Split-screen Table", "tableSplit")), hint: "Ctrl+T" },
      { ...(s.table ? app("Remove Table", "tableSplit") : off("Remove Table")), hint: "Ctrl+T" },
    ]),
    rule(
      sub("Geometry", [
        sub("Points & Lines", [
          off("Point"),
          off("Point On"),
          off("Point by Coordinates"),
          off("Intersection Point(s)"),
          rule(off("Line")),
          off("Segment"),
          off("Ray"),
          off("Tangent"),
          off("Vector"),
          off("Circle arc"),
        ]),
        sub(
          "Shapes",
          ["Circle", "Triangle", "Rectangle", "Polygon", "Regular Polygon", "Ellipse", "Parabola", "Hyperbola", "Conic by Five Points"].map(off),
        ),
        rule(sub("Measurement", ["Length", "Area", "Slope", "Angle", "Directed Angle"].map(off))),
        sub("Construction", [
          off("Perpendicular"),
          off("Parallel"),
          off("Perpendicular Bisector"),
          off("Angle Bisector"),
          off("Midpoint"),
          rule(off("Locus")),
          off("Compass"),
          off("Measurement transfer"),
        ]),
        sub("Transformation", ["Symmetry", "Reflection", "Translation", "Rotation", "Dilation"].map(off)),
      ]),
    ),
    rule(off("Settings...")),
  ];
}
