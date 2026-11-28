// SPDX-License-Identifier: GPL-3.0-or-later
import { app, na, off, rule, sub, type Menu, type MenuItem } from "../menus/types";
import type { GeometryPage } from "../state/document";
import { PALETTE } from "../lists/lists-menu";
import { PTT } from "../state/ptt";
import { redefinable, resolve, TOOL_NAMES, type GeoTool } from "./model";

/** What the context menus' Recent ▸ lists: the last menu items used on the page's app, newest first. */
export type RecentItem = { label: string; id: string };

const tick = (on: boolean | undefined, label: string) => `${on ? "✓ " : ""}${label}`;

/** Where the menus' wording differs from the tool's own name (TOOL_NAMES, which messages use too). */
const MENU_NAMES: Partial<Record<GeoTool, string>> = { arc: "Circle arc", transfer: "Measurement transfer" };

/**
 * The menu key on a Geometry page, item for item as the handheld's
 * (greyed: not built yet). The handheld's Geometry app is Graphs in its
 * Plane Geometry view, so View offers the other views, and Plane Geometry
 * is greyed as the one showing.
 */
export function geometryMenu(p: GeometryPage): Menu {
  const tool = (name: GeoTool) => {
    const label = MENU_NAMES[name] ?? TOOL_NAMES[name];
    const item = app(tick(p.tool?.name === name, label), `geoTool:${name}`);
    // p picks the Point tool, as the handheld's menu shows beside it.
    return name === "point" ? { ...item, hint: "p" } : item;
  };
  const mode = (label: string, kind: string) => app(tick(p.mode?.kind === kind, label), `geoMode:${kind}`);
  return [
    sub("Actions", [
      app("Pointer", "geoSelect"),
      SELECT,
      app("Hide/Show", "geoHideShow"),
      rule(app("Attributes", "geoAttrs")),
      mode("Set Conditions", "conditions"),
      app("Delete all", "geoClear"),
      rule(app("Text", "geoText")),
      mode("Calculate", "calculate"),
      mode("Redefine", "redefine"),
      app("Insert Slider", "geoSlider"),
      rule(mode("MathDraw", "mathdraw")),
    ]),
    // Graphing and 3D Graphing turn the page into a Graphs page, its construction kept, as the handheld's views do.
    sub("View", [
      app("Graphing", "geoViewGraphing"),
      na("Plane Geometry", "it's the view showing"),
      PTT?.no3d ? off("3D Graphing") : app("3D Graphing", "geoView3d"),
      rule(app(p.analytic ? "Hide Analytic Window" : "Show Analytic Window", "geoAnalytic")),
      app(p.hideScale ? "Show Scale" : "Hide Scale", "geoScale"),
      rule(app(p.hideGuides ? "Show Object Selection Guides" : "Hide Object Selection Guides", "geoGuides")),
    ]),
    rule(sub("Trace", traceItems(p))),
    rule(
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
    ),
    sub("Shapes", [
      tool("circle"),
      tool("triangle"),
      tool("rectangle"),
      tool("polygon"),
      tool("regpoly"),
      tool("ellipse"),
      tool("parabola"),
      tool("hyperbola"),
      tool("conic5"),
    ]),
    rule(sub("Measurement", [tool("length"), tool("area"), tool("slope"), tool("angle"), tool("dangle")])),
    sub("Construction", [
      tool("perpendicular"),
      tool("parallel"),
      tool("bisector"),
      tool("anglebisector"),
      tool("midpoint"),
      rule(tool("locus")),
      tool("compass"),
      tool("transfer"),
    ]),
    sub("Transformation", [tool("symmetry"), tool("reflection"), tool("translation"), tool("rotation"), tool("dilation")]),
    rule(app("Settings...", "geoSettings")),
  ];
}

/** Select ▸: Region drags a box; a Geometry page has no image, and no grid in Plane Geometry, as the handheld greys them. */
const SELECT = sub("Select", [app("Region", "geoMode:region"), na("Image", "there's no image on this page"), na("Grid", "there's no grid in Plane Geometry")]);

/** Window / Zoom ▸, as in Graphs: the view across the plane. */
const WINDOW_ZOOM = sub("Window / Zoom", [
  app("Window Settings...", "geoWindow"),
  rule(app("Zoom – Box", "geoMode:zoombox")),
  app("Zoom – In", "geoZoomIn"),
  app("Zoom – Out", "geoZoomOut"),
  rule(app("Zoom – Standard", "geoZoomReset")),
  app("Zoom – Quadrant 1", "geoZoom:quadrant1"),
  app("Zoom – User", "geoZoom:user"),
  app("Zoom – Trig", "geoZoom:trig"),
  app("Zoom – Data", "geoZoom:fit"),
  app("Zoom – Fit", "geoZoom:fit"),
  rule(app("Zoom – Square", "geoZoom:square")),
  app("Zoom – Decimal", "geoZoom:decimal"),
]);

/** Recent ▸: the last items used, to use again. */
const recentItems = (recent: RecentItem[]) => sub("Recent", recent.length ? recent.slice(0, 9).map((r) => app(r.label, r.id)) : [na("(none yet)", "no menu items used on this page yet")]);

/** Trace ▸: Path Plot follows a graph, and a Geometry page has none until it's switched to Graphing. */
function traceItems(p: GeometryPage): MenuItem[] {
  const none = "there are no graphs in Plane Geometry: View ▸ Graphing first";
  return [
    sub("Path Plot", [na("Function", none), na("Parametric", none), na("Polar", none), app("Path Setup...", "geoPathSetup")]),
    geoTraceItem(p),
    p.traced?.length ? app("Erase Geometry Trace", "geoTraceErase") : na("Erase Geometry Trace", "nothing is being traced"),
  ];
}

/** Geometry Trace for the selected object: ticked while it's traced. */
const geoTraceItem = (p: GeometryPage): MenuItem =>
  p.sel ? app(tick(p.traced?.includes(p.sel), "Geometry Trace"), "geoTraceSel") : na("Geometry Trace", "select the object to trace first");

/**
 * ctrl menu on a Geometry page, as the handheld's: one for a selected
 * object, one for a measurement or result, and one for the page.
 */
export function geometryContextMenu(p: GeometryPage, recent: RecentItem[] = [], variables: string[] = []): Menu {
  const sel = p.objects.find((o) => o.id === p.sel);
  const colour = (what: "line" | "fill") => [...PALETTE.map(([name, hex]) => app(name, `geoColour:${what}:${hex}`)), app("Auto", `geoColour:${what}:`)];
  if (sel && (sel.kind === "measure" || sel.kind === "calc")) {
    const linked = sel.store;
    return [
      recentItems(recent),
      app("Attributes", "geoAttrs"),
      app("Hide", "geoHideSel"),
      app("Delete", "geoDelete"),
      app("Store", "geoStore"),
      sub("Variables", [
        linked ? app("Unlink", "geoUnlink") : na("Unlink", "it isn't linked to a variable"),
        sub("Link To:", variables.length ? variables.map((v) => app(v, `geoLink:${v}`)) : [na("(no variables)", "the problem has no variables yet")]),
      ]),
      app(tick(p.pinned?.includes(sel.id), "Pin"), "geoPin"),
      // A measurement sits beside what it measures until Detach leaves it in place; Attach puts it back.
      sel.kind === "measure" && sel.at ? app("Attach", "geoAttach") : na("Attach", "it's attached to what it measures"),
      sel.kind === "measure" && !sel.at ? app("Detach", "geoDetach") : na("Detach", sel.kind === "calc" ? "a result stays where it was placed" : "it isn't attached"),
      app("Conditions...", "geoCondSel"),
    ];
  }
  if (sel) {
    const shape = resolve(p.objects).get(sel.id);
    const t = shape?.t;
    const lengthOk = t === "circle" || t === "poly" || (shape?.t === "line" && shape.bound === "segment");
    const areaOk = t === "circle" || t === "poly";
    return [
      recentItems(recent),
      app("Label", "geoLabelEdit"),
      app("Attributes", "geoAttrs"),
      app("Hide", "geoHideSel"),
      app("Delete", "geoDelete"),
      redefinable(sel) ? app("Redefine", "geoRedefineSel") : na("Redefine", "only a free point, or a point on an object, can be redefined"),
      // Plane Geometry has no axes for coordinates or equations, so the handheld greys this.
      p.axes ? app("Coordinates and Equations", "geoLabel") : na("Coordinates and Equations", "there are no axes in Plane Geometry: View ▸ Graphing first"),
      sub("Measurement", [
        lengthOk ? app("Length", "geoMeasure:length") : na("Length", "it has no length to measure"),
        areaOk ? app("Area", "geoMeasure:area") : na("Area", "it has no area to measure"),
      ]),
      geoTraceItem(p),
      app(tick(p.pinned?.includes(sel.id), "Pin"), "geoPin"),
      sub("Color", [
        sub("Line Color", colour("line")),
        areaOk ? sub("Fill Color", colour("fill")) : na("Fill Color", "it has no inside to fill"),
        na("Text Color", "it has no text"),
      ]),
      app("Conditions...", "geoCondSel"),
    ];
  }
  const some = p.sel || p.multi?.length;
  return [
    recentItems(recent),
    sub("Hide/Show", [
      some ? app("Hide Selection", "geoHideSel") : na("Hide Selection", "nothing is selected"),
      // Plane Geometry shows no grid; one left on from before can still be hidden.
      p.grid ? app("Hide Grid", "geoGrid") : na("Hide Grid", "there's no grid in Plane Geometry"),
      na("Show Dot Grid", "there's no grid in Plane Geometry"),
      na("Show Lined Grid", "there's no grid in Plane Geometry"),
    ]),
    SELECT,
    WINDOW_ZOOM,
    app("Text", "geoText"),
    app("Delete all", "geoClear"),
    p.traced?.length ? app("Erase Geometry Trace", "geoTraceErase") : na("Erase Geometry Trace", "nothing is being traced"),
    app(p.pinAll ? "Unpin" : "Pin", "geoPinAll"),
  ];
}

/** What a selected object's context menu can do on a Graphs page; anything else of Geometry's menu is greyed there. */
const ON_GRAPHS = /^(?:(?:geoAttrs|geoHideSel|geoDelete|geoLabel|geoLabelEdit|geoRedefineSel|geoTraceSel|geoPin|geoCondSel)$|geoColour:|geoMeasure:|geoTool:)/;

/**
 * A selected object's context menu on a Graphs page: the same menu as on a
 * Geometry page, so items keep their places, with the items that only work
 * on a Geometry page so far greyed.
 */
export function onGraphsPage(menu: Menu): Menu {
  const grey = (it: MenuItem): MenuItem => {
    if (it.items) return { ...it, items: it.items.map(grey) };
    const a = it.action;
    if (a?.kind === "app" && a.id.startsWith("geo") && !ON_GRAPHS.test(a.id)) return { label: it.label, unavailable: "not on a Graphs page yet: use a Geometry page" };
    return it;
  };
  return menu.map(grey);
}
