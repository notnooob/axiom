// SPDX-License-Identifier: GPL-3.0-or-later
import { app, na, off, rule, sub, type Menu } from "../menus/types";
import type { GeometryPage } from "../state/document";
import { TOOL_NAMES, type GeoTool } from "./model";

const tick = (on: boolean | undefined, label: string) => `${on ? "✓ " : ""}${label}`;

/** The menu key on a Geometry page, laid out as the handheld's (greyed: not built yet). */
export function geometryMenu(p: GeometryPage): Menu {
  const measure = p.objects.find((o) => o.id === p.sel && o.kind === "measure");
  const tool = (name: GeoTool) => app(tick(p.tool?.name === name, TOOL_NAMES[name]), `geoTool:${name}`);
  return [
    sub("Actions", [
      app("Select", "geoSelect"),
      p.sel ? app("Delete", "geoDelete") : na("Delete", "select an object first"),
      measure ? app("Store…", "geoStore") : na("Store…", "select a measurement first"),
      rule(app("Hide/Show", "geoHideShow")),
      app("Attributes", "geoAttrs"),
      app("Text", "geoText"),
      app("Coordinates and Equations", "geoLabel"),
      rule(app("Clear All", "geoClear")),
    ]),
    sub("View", [
      app(tick(p.axes, "Show Axes"), "geoAxes"),
      app(tick(p.grid, "Show Grid"), "geoGrid"),
      rule(app("Zoom In", "geoZoomIn")),
      app("Zoom Out", "geoZoomOut"),
      p.view ? app("Zoom Standard", "geoZoomReset") : na("Zoom Standard", "the view is already the standard one"),
      rule(off("Show Analytic Window")),
    ]),
    sub("Points & Lines", [
      tool("point"),
      tool("pointon"),
      tool("intersection"),
      rule(tool("line")),
      tool("segment"),
      tool("ray"),
      tool("tangent"),
      tool("vector"),
      tool("arc"),
    ]),
    sub("Measurement", [tool("length"), tool("area"), tool("slope"), tool("angle")]),
    sub("Shapes", [tool("circle"), tool("triangle"), tool("rectangle"), tool("polygon"), tool("regpoly"), tool("ellipse")]),
    sub("Construction", [
      tool("parallel"),
      tool("perpendicular"),
      tool("bisector"),
      tool("anglebisector"),
      tool("midpoint"),
      rule(tool("locus")),
      tool("compass"),
    ]),
    sub("Transformation", [tool("symmetry"), tool("reflection"), tool("translation"), tool("rotation"), tool("dilation")]),
  ];
}
