// SPDX-License-Identifier: GPL-3.0-or-later
import { app, off, rule, sub, wiz, type Menu } from "../menus/types";
import type { DataStatsPage } from "../state/document";

const tick = (on: boolean | undefined, label: string) => `${on ? "✓ " : ""}${label}`;

/** The menu key on a Data & Statistics page, laid out as the handheld's (greyed: not built yet). */
export function dataMenu(p: DataStatsPage): Menu {
  const two = Boolean(p.y);
  return [
    sub("Plot Type", [
      app(tick(p.plot === "dot", "Dot Plot"), "dsPlot:dot"),
      app(tick(p.plot === "box", "Box Plot"), "dsPlot:box"),
      app(tick(p.plot === "histogram", "Histogram"), "dsPlot:histogram"),
      app(tick(p.plot === "normprob", "Normal Probability Plot"), "dsPlot:normprob"),
      rule(two ? app(tick(p.plot === "scatter", "Scatter Plot"), "dsPlot:scatter") : off("Scatter Plot")),
      two ? app(tick(p.plot === "xyline", "XY Line Plot"), "dsPlot:xyline") : off("XY Line Plot"),
      rule(off("Dot Chart")),
      off("Bar Chart"),
      off("Pie Chart"),
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
      off("Show All Labels"),
      rule(app("Add X Variable", "dsAxis:x")),
      off("Add X Summary List"),
      p.x ? app("Remove X Variable", "dsRemoveX") : off("Remove X Variable"),
      app("Add Y Variable", "dsAxis:y"),
      off("Add Y Summary List"),
      p.y ? app("Remove Y Variable", "dsRemoveY") : off("Remove Y Variable"),
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
      off("Sort"),
    ]),
    sub("Analyze", [
      app("Remove", "dsRemoveAnalysis"),
      rule(two ? app(tick(Boolean(p.movable), "Add Movable Line"), "dsMovable") : off("Add Movable Line")),
      p.movable ? app(tick(p.movable.lock, "Lock Intercept at Zero"), "dsLock") : off("Lock Intercept at Zero"),
      wiz("Plot Function...", "Plot Function", [{ label: "f(x)=", value: "" }], "ds:fn:{0}"),
      off("Shade Under Function"),
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
              off("Show Sinusoidal"),
              off("Show Logistic (d=0)"),
            ])
          : off("Regression"),
      ),
      rule(sub("Residuals", [off("Show Residual Squares"), off("Show Residual Plot")])),
      rule(wiz("Plot Value...", "Plot Value", [{ label: "Value:", value: p.x ? `mean(${p.x})` : "" }], "ds:value:{0}")),
      p.plot === "histogram" ? app(tick(p.normalPdf, "Show Normal PDF"), "dsNormal") : off("Show Normal PDF"),
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
