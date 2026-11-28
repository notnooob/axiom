// SPDX-License-Identifier: GPL-3.0-or-later
import { app, na, off, rule, sub, wiz, type Menu } from "../menus/types";
import type { DataStatsPage } from "../state/document";
import { CAT_PLOTS, effectivePlot, logicalPage, NO_INFO, POINT_PLOTS, type DataInfo } from "./plot";

const tick = (on: boolean | undefined, label: string) => `${on ? "✓ " : ""}${label}`;

/** Each regression's name as Analyze ▸ Regression shows it, without its "Show". */
const REG_LABELS: Record<string, string> = {
  LinRegMx: "Linear (mx+b)",
  LinRegBx: "Linear (a+bx)",
  MedMed: "Median-Median",
  QuadReg: "Quadratic",
  CubicReg: "Cubic",
  QuartReg: "Quartic",
  PowerReg: "Power",
  ExpReg: "Exponential",
  LnReg: "Logarithmic",
  SinReg: "Sinusoidal",
  Logistic: "Logistic (d=0)",
  LogisticD: "Logistic (d≠0)",
};

/**
 * The menu key on a Data & Statistics page, laid out as the handheld's
 * (greyed: not built yet, or not for this data). A categorical list (text)
 * offers the dot, bar and pie charts in place of the numeric plots; info
 * says what the page's lists turned out to be.
 */
export function dataMenu(p: DataStatsPage, info: DataInfo = NO_INFO): Menu {
  const { categorical } = info;
  const plot = effectivePlot(logicalPage(p, info), categorical);
  // Two numeric lists: the scatter plots and everything fitted to them.
  const two = info.two && !categorical;
  const shown = Boolean(info.main);
  // Residuals are measured from what's been added to a scatter: a regression, the movable line or a function.
  const against = two && Boolean(p.regression || p.movable || p.functions?.length);
  // The plot already shown is greyed, as the handheld greys it, rather than ticked.
  const current = (label: string, kind: DataStatsPage["plot"]) => (plot === kind && shown ? na(label, "it's the plot already") : app(label, `dsPlot:${kind}`));
  const num = (label: string, kind: DataStatsPage["plot"]) =>
    categorical ? na(label, "the list is categorical (text); it plots as a dot, bar or pie chart") : current(label, kind);
  const cat = (label: string, kind: DataStatsPage["plot"]) =>
    categorical && !info.two ? current(label, kind) : na(label, categorical ? "remove the other variable first" : "needs a categorical list (text)");
  const needY = categorical ? "needs two numeric lists" : "add a y variable first";
  // Force Numeric reads text such as "12" as numbers; on a list of numbers the item forces it categorical. Ticked while it's on.
  const force = (axis: "X" | "Y") => {
    const has = axis === "X" ? p.x : p.y;
    const forced = axis === "X" ? p.forceX : p.forceY;
    const text = axis === "X" ? info.xText : info.yText;
    if (!has) return na(`Force Numeric ${axis}`, `add a${axis === "X" ? "n x" : " y"} variable first`);
    const kind = forced ? (forced === "num" ? "Numeric" : "Categorical") : text ? "Numeric" : "Categorical";
    return app(tick(Boolean(forced), `Force ${kind} ${axis}`), `dsForce${axis}`);
  };
  // Remove is named for what it takes away, as the handheld names it ("Hide Linear (mx+b)" for a shown regression), and greyed with nothing to take.
  const remove = p.regression
    ? app(`Hide ${REG_LABELS[p.regression] ?? "Regression"}`, "dsRemoveAnalysis")
    : p.movable
      ? app("Remove Movable Line", "dsRemoveAnalysis")
      : p.functions?.length || p.values?.length || p.shade || p.normalPdf
      ? app("Remove", "dsRemoveAnalysis")
      : na("Remove", "there's nothing added to the plot");
  return [
    sub("Plot Type", [
      num("Dot Plot", "dot"),
      num("Box Plot", "box"),
      num("Histogram", "histogram"),
      num("Normal Probability Plot", "normprob"),
      rule(two ? current("Scatter Plot", "scatter") : na("Scatter Plot", needY)),
      two ? current("XY Line Plot", "xyline") : na("XY Line Plot", needY),
      rule(cat("Dot Chart", "dotchart")),
      cat("Bar Chart", "bar"),
      cat("Pie Chart", "pie"),
    ]),
    sub("Plot Properties", [
      app(tick(p.connect, "Connect Data Points"), "dsConnect"),
      // As the handheld's: Histogram Scale first, then Bin Settings with its two kinds of bins.
      sub("Histogram Properties", [
        // The scale in use is greyed, as the handheld greys it.
        sub(
          "Histogram Scale",
          (
            [
              ["Frequency", "count"],
              ["Percent", "percent"],
              ["Density", "density"],
            ] as const
          ).map(([label, kind]) => ((p.histScale ?? "count") === kind ? na(label, "it's the scale already") : app(label, `dsScale:${kind}`))),
        ),
        sub("Bin Settings", [
          wiz(
            "Equal Bin Width",
            "Equal Bin Width Settings",
            [
              { label: "Width:", value: String(p.bins?.width ?? ""), hint: "auto" },
              { label: "Alignment:", value: String(p.bins?.start ?? ""), hint: "auto" },
            ],
            "ds:bins:{0}:{1}",
          ),
          // Bins between boundaries the student gives, a list or a list's name.
          wiz("Variable Bin Width", "Variable Bin Width Settings", [{ label: "Bin Boundaries:", value: p.binEdges ?? "", hint: "{0,10,25,50}" }], "ds:vbins:{0}"),
        ]),
      ]),
      app(tick(p.extendWhiskers, "Extend Box Plot Whiskers"), "dsWhiskers"),
      // Counts on every bar and slice.
      plot === "bar" || plot === "pie" || plot === "histogram"
        ? app(tick(p.labels, "Show All Labels"), "dsLabels")
        : na("Show All Labels", "for bar charts, pie charts and histograms"),
      rule(app("Add X Variable", "dsAxis:x")),
      // How many of each y value: a frequency list in place of an x variable, for a list plotted up the y-axis.
      p.y && !p.x ? app("Add X Summary List", "dsAxis:xsum") : na("Add X Summary List", p.x ? "remove the x variable first" : "add a y variable first"),
      p.x || p.xSummary ? app("Remove X Variable", "dsRemoveX") : na("Remove X Variable", "there's no x variable"),
      app("Add Y Variable", "dsAxis:y"),
      // How many of each x value: a frequency list in place of a y variable.
      p.x && !p.y ? app("Add Y Summary List", "dsAxis:sum") : na("Add Y Summary List", p.y ? "remove the y variable first" : "add an x variable first"),
      p.y || p.ySummary ? app("Remove Y Variable", "dsRemoveY") : na("Remove Y Variable", "there's no y variable"),
      rule(force("X")),
      force("Y"),
      // A band for each category of another list, each with its own plot of the numbers in it.
      shown && !categorical && !info.two && !p.ySummary && !p.xSummary
        ? app(tick(Boolean(p.split), "Split Categories by Variable"), "dsAxis:split")
        : na("Split Categories by Variable", "for one numeric list without a summary list"),
      p.split ? app("Remove Split Variable", "dsRemoveSplit") : na("Remove Split Variable", "the plot isn't split"),
      rule(app("Clear All", "dsClearAll")),
    ]),
    sub("Actions", [
      remove,
      app(p.hideText ? "Show Text" : "Hide Text", "dsHideText"),
      rule(app("Insert Text", "dsText")),
      app("Insert Slider", "dsSlider"),
      rule(shown && POINT_PLOTS.includes(plot) ? app("Select All Points", "dsSelectAll") : na("Select All Points", "for plots drawn as points")),
      p.image ? app("Select Image", "dsSelectImage") : na("Select Image", "insert one first: doc ▸ Insert ▸ Image"),
      categorical && !info.two
        ? sub("Sort", [
            app(tick(!p.sort || p.sort === "list", "List Order"), "dsSort:list"),
            app(tick(p.sort === "value", "Value Order"), "dsSort:value"),
            app(tick(p.sort === "alpha", "Alpha Order"), "dsSort:alpha"),
          ])
        : na("Sort", "for categorical data (a list of text)"),
    ]),
    sub("Analyze", [
      remove,
      // With one list the movable line is vertical, at an x value, as on the handheld.
      rule(shown && !categorical ? app("Add Movable Line", "dsMovable") : na("Add Movable Line", categorical ? "categorical plots have no x scale" : "add a variable first")),
      p.movable && p.movable.vx === undefined ? app(tick(p.movable.lock, "Lock Intercept at Zero"), "dsLock") : na("Lock Intercept at Zero", "add a movable line to a scatter plot first"),
      // A function needs a y scale to draw against: a scatter plot, an XY line plot or a histogram.
      ["scatter", "xyline", "histogram"].includes(plot) && shown
        ? wiz("Plot Function...", "Plot Function", [{ label: "f(x)=", value: "" }], "ds:fn:{0}")
        : na("Plot Function...", "for scatter plots, XY line plots and histograms"),
      // Categorical plots have no numeric x to shade along.
      p.functions?.length && !CAT_PLOTS.includes(plot)
        ? app("Shade Under Function", "dsShade")
        : na("Shade Under Function", CAT_PLOTS.includes(plot) ? "categorical plots have no x scale" : "plot a function first"),
      rule(
        two
          ? sub(
              "Regression",
              Object.entries(REG_LABELS).map(([cmd, label]) => app(`Show ${label}`, `dsReg:${cmd}`)),
            )
          : na("Regression", needY),
      ),
      rule(
        sub("Residuals", [
          against ? app(tick(p.residualSquares, "Show Residual Squares"), "dsResidSquares") : na("Show Residual Squares", "show a regression, movable line or function first"),
          against ? app(tick(p.residualPlot, "Show Residual Plot"), "dsResidPlot") : na("Show Residual Plot", "show a regression, movable line or function first"),
        ]),
      ),
      rule(wiz("Plot Value...", "Plot Value", [{ label: "Value:", value: p.x ? `mean(${p.x})` : p.y ? `mean(${p.y})` : "" }], "ds:value:{0}")),
      plot === "histogram" ? app(tick(p.normalPdf, "Show Normal PDF"), "dsNormal") : na("Show Normal PDF", "for histograms"),
      // ◄ ► along the data (or a curve), ▲ ▼ between them.
      shown ? app(tick(Boolean(p.trace), "Graph Trace"), "dsTrace") : na("Graph Trace", "add a variable first"),
    ]),
    sub("Window/Zoom", [
      app("Window Settings...", "dsWindow"),
      app("Zoom – Data", "dsZoomData"),
      app("Zoom – In", "dsZoomIn"),
      app("Zoom – Out", "dsZoomOut"),
    ]),
    rule(app("Settings...", "dsSettings")),
  ];
}

/**
 * ctrl menu on a Data & Statistics page, as the handheld's: on a plot,
 * the other plots its data can make, Extend Box Plot Whiskers for a box
 * plot, Zoom and Color; on a page with no plot yet, the axes' items.
 */
export function dataContextMenu(p: DataStatsPage, info: DataInfo = NO_INFO, palette: [string, string][] = []): Menu {
  const full = dataMenu(p, info);
  const find = (label: string) => full.find((m) => m.label === label);
  if (!info.main) {
    const axes = (find("Plot Properties")?.items ?? []).filter((m) => /X Variable|Y Variable|Force/.test(m.label));
    return [...axes.map((m) => ({ ...m, rule: false })), { ...find("Window/Zoom")!, label: "Zoom" }];
  }
  // The plots it can switch to: the enabled ones, the one showing left out.
  const plots = (find("Plot Type")?.items ?? []).filter((m) => m.action).map((m) => ({ ...m, rule: false }));
  const plot = effectivePlot(logicalPage(p, info), info.categorical);
  const zoom = find("Window/Zoom");
  return [
    ...plots,
    ...(plot === "box" ? [app(tick(p.extendWhiskers, "Extend Box Plot Whiskers"), "dsWhiskers")] : []),
    { ...sub("Zoom", (zoom?.items ?? []).slice(0, 4)) },
    sub("Color", [
      na("Line Color", "the plot has no line"),
      sub("Fill Color", [...palette.map(([name, hex]) => app(name, `dsFill:${hex}`)), app("Auto", "dsFill:")]),
      na("Text Color", "the plot has no text"),
    ]),
  ];
}
