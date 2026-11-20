// SPDX-License-Identifier: GPL-3.0-or-later
import { app, off, rule, sub, wiz, type Menu } from "../menus/types";
import type { DataStatsPage } from "../state/document";
import { CAT_PLOTS, effectivePlot } from "./plot";

const tick = (on: boolean | undefined, label: string) => `${on ? "✓ " : ""}${label}`;

/**
 * The menu key on a Data & Statistics page, laid out as the handheld's
 * (greyed: not built yet, or not for this data). A categorical x list (text)
 * offers the dot, bar and pie charts in place of the numeric plots.
 */
export function dataMenu(p: DataStatsPage, categorical = false): Menu {
  const plot = effectivePlot(p, categorical);
  // Two numeric lists: the scatter plots and everything fitted to them.
  const two = Boolean(p.y) && !categorical;
  // Residuals are measured from what's been added to a scatter: a regression, the movable line or a function.
  const against = two && Boolean(p.regression || p.movable || p.functions?.length);
  const num = (label: string, kind: DataStatsPage["plot"]) => (categorical ? off(label) : app(tick(plot === kind, label), `dsPlot:${kind}`));
  const cat = (label: string, kind: DataStatsPage["plot"]) => (categorical && !p.y ? app(tick(plot === kind, label), `dsPlot:${kind}`) : off(label));
  return [
    sub("Plot Type", [
      num("Dot Plot", "dot"),
      num("Box Plot", "box"),
      num("Histogram", "histogram"),
      num("Normal Probability Plot", "normprob"),
      rule(two ? app(tick(plot === "scatter", "Scatter Plot"), "dsPlot:scatter") : off("Scatter Plot")),
      two ? app(tick(plot === "xyline", "XY Line Plot"), "dsPlot:xyline") : off("XY Line Plot"),
      rule(cat("Dot Chart", "dotchart")),
      cat("Bar Chart", "bar"),
      cat("Pie Chart", "pie"),
    ]),
    sub("Plot Properties", [
      app(tick(p.connect, "Connect Data Points"), "dsConnect"),
      // As the handheld's: Histogram Scale first, then Bin Settings with its two kinds of bins.
      sub("Histogram Properties", [
        sub("Histogram Scale", [
          app(tick(!p.histScale || p.histScale === "count", "Count"), "dsScale:count"),
          app(tick(p.histScale === "percent", "Percent"), "dsScale:percent"),
          app(tick(p.histScale === "density", "Density"), "dsScale:density"),
        ]),
        sub("Bin Settings", [
          wiz("Equal Bin Width...", "Equal Bin Width Settings", [
            { label: "Width:", value: String(p.bins?.width ?? "") , hint: "auto" },
            { label: "Alignment:", value: String(p.bins?.start ?? ""), hint: "auto" },
          ], "ds:bins:{0}:{1}"),
          off("Variable Bin Width..."),
        ]),
      ]),
      app(tick(p.extendWhiskers, "Extend Box Plot Whiskers"), "dsWhiskers"),
      // Counts on every bar and slice.
      plot === "bar" || plot === "pie" || plot === "histogram" ? app(tick(p.labels, "Show All Labels"), "dsLabels") : off("Show All Labels"),
      rule(app("Add X Variable", "dsAxis:x")),
      off("Add X Summary List"),
      p.x ? app("Remove X Variable", "dsRemoveX") : off("Remove X Variable"),
      app("Add Y Variable", "dsAxis:y"),
      // How many of each x value: a frequency list in place of a y variable.
      p.x ? app("Add Y Summary List", "dsAxis:sum") : off("Add Y Summary List"),
      p.y || p.ySummary ? app("Remove Y Variable", "dsRemoveY") : off("Remove Y Variable"),
      rule(off("Force Numeric X")),
      off("Force Numeric Y"),
      off("Split Categories by Variable"),
      off("Remove Split Variable"),
      rule(app("Clear All", "dsClearAll")),
    ]),
    sub("Actions", [
      app("Remove", "dsRemoveAnalysis"),
      off("Hide Text"),
      rule(off("Insert Text")),
      off("Insert Slider"),
      rule(off("Select All Points")),
      off("Select Image"),
      categorical && !p.y
        ? sub("Sort", [
            app(tick(!p.sort || p.sort === "list", "List Order"), "dsSort:list"),
            app(tick(p.sort === "value", "Value Order"), "dsSort:value"),
            app(tick(p.sort === "alpha", "Alphabetical"), "dsSort:alpha"),
          ])
        : off("Sort"),
    ]),
    sub("Analyze", [
      app("Remove", "dsRemoveAnalysis"),
      rule(two ? app(tick(Boolean(p.movable), "Add Movable Line"), "dsMovable") : off("Add Movable Line")),
      p.movable ? app(tick(p.movable.lock, "Lock Intercept at Zero"), "dsLock") : off("Lock Intercept at Zero"),
      wiz("Plot Function...", "Plot Function", [{ label: "f(x)=", value: "" }], "ds:fn:{0}"),
      // Categorical plots have no numeric x to shade along.
      p.functions?.length && !CAT_PLOTS.includes(plot) ? app("Shade Under Function", "dsShade") : off("Shade Under Function"),
      rule(
        two
          ? sub("Regression", [
              app("Show Linear (mx+b)", "dsReg:LinRegMx"),
              app("Show Linear (a+bx)", "dsReg:LinRegBx"),
              app("Show Median-Median", "dsReg:MedMed"),
              app("Show Quadratic", "dsReg:QuadReg"),
              app("Show Cubic", "dsReg:CubicReg"),
              app("Show Quartic", "dsReg:QuartReg"),
              app("Show Power", "dsReg:PowerReg"),
              app("Show Exponential", "dsReg:ExpReg"),
              app("Show Logarithmic", "dsReg:LnReg"),
              app("Show Sinusoidal", "dsReg:SinReg"),
              app("Show Logistic (d=0)", "dsReg:Logistic"),
            ])
          : off("Regression"),
      ),
      rule(
        sub("Residuals", [
          against ? app(tick(p.residualSquares, "Show Residual Squares"), "dsResidSquares") : off("Show Residual Squares"),
          against ? app(tick(p.residualPlot, "Show Residual Plot"), "dsResidPlot") : off("Show Residual Plot"),
        ]),
      ),
      rule(wiz("Plot Value...", "Plot Value", [{ label: "Value:", value: p.x ? `mean(${p.x})` : "" }], "ds:value:{0}")),
      plot === "histogram" ? app(tick(p.normalPdf, "Show Normal PDF"), "dsNormal") : off("Show Normal PDF"),
      off("Graph Trace"),
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
