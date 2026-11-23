// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 VCE Hub. Part of the /cas calculator: https://github.com/vcehub/cas
import { app, na, off, rule, sub, wiz, type Menu } from "./types";
import { PTT } from "../state/ptt";

/**
 * The Graphs app's menu. Item positions are the contract (see types.ts):
 * the same keystrokes reach the same command.
 *
 * Some labels follow the page, as they do on the handheld: Hide Axes reads
 * Show Axes once the axes are hidden, and the current grid is greyed.
 */

/** The page state the menu's labels depend on. */
export type GraphsMenuState = { axes: boolean; entryLine: boolean; grid: "none" | "dot" | "line"; table: boolean; hideAnalytic?: boolean; hideEndValues?: boolean; hideGuides?: boolean };

/** A Geometry tool on the graph. */
const geo = (label: string, tool: string) => app(label, `geoTool:${tool}`);

/** An equation template: the relation entry opened with this form in it. */
const tpl = (label: string, form: string) => app(label, `eqtpl:${form}`);

export function graphsMenu(s: GraphsMenuState): Menu {
  const grid = (label: string, id: string, kind: GraphsMenuState["grid"]) => (s.grid === kind ? na(label, "it's the grid shown now") : app(label, id));
  return [
    sub("Actions", [
      app("Pointer", "pointer"),
      sub("Select", [app("Region", "selectRegion"), app("Image", "selectImage"), app("Grid", "selectGrid")]),
      app("Hide/Show", "hideShow"),
      rule(app("Attributes", "attributes")),
      app("Set Conditions", "setConditions"),
      app("Delete all", "deleteAll"),
      rule(app("Text", "graphText")),
      app("Coordinates and Equations", "coordinates"),
      app("Calculate", "graphCalculate"),
      app("Redefine", "redefine"),
      app("Insert Slider", "insertSlider"),
      rule(app("MathDraw", "mathDraw")),
    ]),
    sub("View", [
      app("Graphing", "viewGraphing"),
      app("Plane Geometry", "viewPlane"),
      PTT?.no3d ? off("3D Graphing") : app("3D Graphing", "view3d"),
      rule(app(s.hideAnalytic ? "Show Analytic Window" : "Hide Analytic Window", "viewAnalytic")),
      app(s.axes ? "Hide Axes" : "Show Axes", "viewHideAxes"),
      sub("Grid", [
        grid("No Grid", "viewNoGrid", "none"),
        grid("Dot Grid", "viewDotGrid", "dot"),
        grid("Lined Grid", "viewLinedGrid", "line"),
      ]),
      { ...app(s.entryLine ? "Hide Entry Line" : "Show Entry Line", "viewEntryLine"), hint: "Ctrl+G" },
      app(s.hideEndValues ? "Show Axes End Values" : "Hide Axes End Values", "viewEndValues"),
      rule(app(s.hideGuides ? "Show Object Selection Guides" : "Hide Object Selection Guides", "viewGuides")),
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
      sub("Path Plot", [app("Function", "pathFn"), app("Parametric", "pathPar"), app("Polar", "pathPolar"), app("Path Setup...", "pathSetup")]),
      app("Geometry Trace", "geoTrace"),
      app("Erase Geometry Trace", "geoTraceErase"),
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
        (
          [
            ["Center", "center"],
            ["Vertices", "vertices"],
            ["Foci", "foci"],
            ["Axes of Symmetry", "axes"],
            ["Directrix", "directrix"],
            ["Asymptotes", "asymptotes"],
            ["Radius", "radius"],
            ["Eccentricity", "eccentricity"],
            ["Latus Rectum", "latus"],
          ] as const
        ).map(([label, id]) => app(label, `conic:${id}`)),
      ),
    ]),
    sub("Table", [
      { ...(s.table ? na("Split-screen Table", "the table is already showing") : app("Split-screen Table", "tableSplit")), hint: "Ctrl+T" },
      { ...(s.table ? app("Remove Table", "tableSplit") : na("Remove Table", "no table is showing")), hint: "Ctrl+T" },
    ]),
    rule(
      sub("Geometry", [
        // The Geometry app's tools, drawn over the graph in its coordinates.
        sub("Points & Lines", [
          geo("Point", "point"),
          geo("Point On", "pointon"),
          app("Point by Coordinates", "geoCoords"),
          geo("Intersection Point(s)", "intersection"),
          rule(geo("Line", "line")),
          geo("Segment", "segment"),
          geo("Ray", "ray"),
          geo("Tangent", "tangent"),
          geo("Vector", "vector"),
          geo("Circle arc", "arc"),
        ]),
        sub("Shapes", [
          geo("Circle", "circle"),
          geo("Triangle", "triangle"),
          geo("Rectangle", "rectangle"),
          geo("Polygon", "polygon"),
          geo("Regular Polygon", "regpoly"),
          geo("Ellipse", "ellipse"),
          geo("Parabola", "parabola"),
          geo("Hyperbola", "hyperbola"),
          geo("Conic by Five Points", "conic5"),
        ]),
        rule(sub("Measurement", [geo("Length", "length"), geo("Area", "area"), geo("Slope", "slope"), geo("Angle", "angle"), geo("Directed Angle", "dangle")])),
        sub("Construction", [
          geo("Perpendicular", "perpendicular"),
          geo("Parallel", "parallel"),
          geo("Perpendicular Bisector", "bisector"),
          geo("Angle Bisector", "anglebisector"),
          geo("Midpoint", "midpoint"),
          rule(geo("Locus", "locus")),
          geo("Compass", "compass"),
          geo("Measurement transfer", "transfer"),
        ]),
        sub("Transformation", [geo("Symmetry", "symmetry"), geo("Reflection", "reflection"), geo("Translation", "translation"), geo("Rotation", "rotation"), geo("Dilation", "dilation")]),
      ]),
    ),
    rule(app("Settings...", "graphSettings")),
  ];
}
