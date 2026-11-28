// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 VCE Hub. Part of the /cas calculator: https://github.com/vcehub/cas
import { CARET as C } from "../math/editor";
import { app, ins, MATRIX_WIZARD, na, off, rule, sub, tpl, wiz, type Menu, type MenuAction, type MenuItem, type WizardField } from "./types";

/**
 * The Calculator app's menu. Item positions are the contract (see
 * types.ts): the same keystrokes reach the same command.
 */

type Dialog = Extract<MenuAction, { kind: "wizard" }>;

/**
 * A statistics dialog's fields: each with no value yet is required, as the
 * handheld's Input Error says ("Required field is empty!"), except those
 * marked optional and the category fields.
 */
const OPTIONAL = new Set(["Category List:", "Include Categories:"]);
const need = (fields: WizardField[]): WizardField[] =>
  fields.map((f) => (f.value === undefined && !f.options && !f.check && !OPTIONAL.has(f.label) && f.hint !== "(optional)" ? { ...f, required: true } : f));
const dialog = (title: string, fields: WizardField[], build: string): Dialog => ({ kind: "wizard", title, fields: need(fields), build });
const item = (label: string, d: Dialog): MenuItem => ({ label, action: d });
/** A statistics dialog as a menu item: its label is its title with "...". */
const stat = (title: string, fields: WizardField[], build: string): MenuItem => item(`${title}...`, dialog(title, fields, build));

/**
 * A first step, as the handheld asks it before the dialog itself (Num of
 * Lists, Data Input Method): its own small dialog, then the one `next` picks.
 */
const step = (title: string, fields: WizardField[], next: (v: string[]) => Dialog): MenuItem =>
  item(`${title}...`, { kind: "wizard", title, fields, build: "", then: next });

/** A count typed in a first step (Num of Lists), kept within what a dialog can hold. */
const count = (v: string | undefined, min = 1) => Math.max(min, Math.min(20, Math.trunc(Number(v)) || min));
const fieldsOf = (n: number, label: (i: number) => string): WizardField[] => Array.from({ length: n }, (_, i) => ({ label: label(i + 1) }));
const refs = (from: number, n: number) => Array.from({ length: n }, (_, i) => `{${from + i}}`).join(",");

const MU_SIGMA = [
  { label: "μ:", value: "0" },
  { label: "σ:", value: "1" },
];
const F_NAMES = Array.from({ length: 9 }, (_, i) => `f${i + 1}`);
const SAVE = { label: "Save RegEqn to:", value: "f1", options: F_NAMES };
const FREQ = { label: "Frequency List:", value: "1" };
const CATEGORY = [{ label: "Category List:" }, { label: "Include Categories:" }];
const C_LEVEL = { label: "C Level:", value: "0.95" };
/** Alternate Hyp, worded as the handheld words it; the command takes 1 (>), 0 (≠) or −1 (<). */
const HYP = (a: string, b: string): WizardField => ({
  label: "Alternate Hyp:",
  value: `Ha: ${a} ≠ ${b}`,
  options: [`Ha: ${a} > ${b}`, `Ha: ${a} ≠ ${b}`, `Ha: ${a} < ${b}`],
  codes: ["1", "0", "-1"],
});
const POOLED = { label: "Pooled:", value: "No", options: ["No", "Yes"], codes: ["0", "1"] };
/** Data Input Method: the data as lists, or its summary statistics. The handheld starts on Data. */
const dataOrStats = (title: string, data: Dialog, stats: Dialog): MenuItem =>
  step(title, [{ label: "Data Input Method:", value: "Data", options: ["Data", "Stats"] }], (v) => (v[0] === "Stats" ? stats : data));

/**
 * A regression's dialog: the lists, where to save its equation, frequencies
 * and categories. It pastes the command, CopyVar to save the equation, and
 * stat.results to show them.
 */
const regWizard = (title: string, command: string): MenuItem =>
  stat(title, [{ label: "X List:" }, { label: "Y List:" }, SAVE, FREQ, ...CATEGORY], `${command} {0},{1},{3},{4},{5}: CopyVar stat.RegEqn,{2}: stat.results`);

/** Logistic regression's dialog: as a regression's, with the iterations the fit may take. */
const logisticWizard = (title: string, command: string): MenuItem =>
  stat(
    title,
    [{ label: "X List:" }, { label: "Y List:" }, SAVE, { label: "Iterations:", value: "64" }, FREQ],
    `${command} {0},{1},{3},{4}: CopyVar stat.RegEqn,{2}: stat.results`,
  );

/** A Mode setting's values, each pasting setMode with the handheld's numbers for it. */
const modeMenu = (label: string, mode: number, values: string[]): MenuItem => sub(label, values.map((v, i) => ins(v, `setMode(${mode},${i + 1})`)));

/** The F distribution's two degrees of freedom, as its wizards ask for them. */
const F_DF = [{ label: "Numerator df:" }, { label: "Denominator df:" }];

/** Distributions, under both Probability and Statistics. */
export const DISTRIBUTIONS: MenuItem[] = [
  stat("Normal Pdf", [{ label: "X Value:" }, ...MU_SIGMA], "normPdf({0},{1},{2})"),
  stat("Normal Cdf", [{ label: "Lower Bound:", value: "-∞" }, { label: "Upper Bound:" }, ...MU_SIGMA], "normCdf({0},{1},{2},{3})"),
  stat("Inverse Normal", [{ label: "Area:" }, ...MU_SIGMA], "invNorm({0},{1},{2})"),
  stat("t Pdf", [{ label: "X Value:" }, { label: "Deg of Freedom, df:" }], "tPdf({0},{1})"),
  stat("t Cdf", [{ label: "Lower Bound:", value: "-∞" }, { label: "Upper Bound:" }, { label: "Deg of Freedom, df:" }], "tCdf({0},{1},{2})"),
  stat("Inverse t", [{ label: "Area:" }, { label: "Deg of Freedom, df:" }], "invt({0},{1})"),
  stat("χ² Pdf", [{ label: "X Value:" }, { label: "Deg of Freedom, df:" }], "χ²Pdf({0},{1})"),
  stat("χ² Cdf", [{ label: "Lower Bound:", value: "0" }, { label: "Upper Bound:" }, { label: "Deg of Freedom, df:" }], "χ²Cdf({0},{1},{2})"),
  stat("Inverse χ²", [{ label: "Area:" }, { label: "Deg of Freedom, df:" }], "invχ²({0},{1})"),
  stat("Binomial Pdf", [{ label: "Num Trials, n:" }, { label: "Prob Success, p:" }, { label: "X Value:", hint: "(optional)" }], "binomPdf({0},{1},{2})"),
  stat(
    "Binomial Cdf",
    [{ label: "Num Trials, n:" }, { label: "Prob Success, p:" }, { label: "Lower Bound:", value: "0" }, { label: "Upper Bound:" }],
    "binomCdf({0},{1},{2},{3})",
  ),
  item("Inverse Binomial...", dialog("Num Successes", [{ label: "Cumulative Prob:" }, { label: "Num Trials, n:" }, { label: "Prob Success, p:" }], "invBinom({0},{1},{2})")),
  item("Inverse Binomial N...", dialog("Num Trials", [{ label: "Cumulative Prob:" }, { label: "Prob Success, p:" }, { label: "Successes, x:" }], "invBinomN({0},{1},{2})")),
  stat("F Pdf", [{ label: "X Value:" }, ...F_DF], "FPdf({0},{1},{2})"),
  stat("F Cdf", [{ label: "Lower Bound:", value: "0" }, { label: "Upper Bound:" }, ...F_DF], "FCdf({0},{1},{2},{3})"),
  stat("Inverse F", [{ label: "Area:" }, ...F_DF], "invF({0},{1},{2})"),
  stat("Geometric Pdf", [{ label: "Prob Success, p:" }, { label: "X Value:" }], "geomPdf({0},{1})"),
  stat("Geometric Cdf", [{ label: "Prob Success, p:" }, { label: "Lower Bound:", value: "1" }, { label: "Upper Bound:" }], "geomCdf({0},{1},{2})"),
  stat("Poisson Pdf", [{ label: "λ:" }, { label: "X Value:" }], "poissPdf({0},{1})"),
  stat("Poisson Cdf", [{ label: "λ:" }, { label: "Lower Bound:", value: "0" }, { label: "Upper Bound:" }], "poissCdf({0},{1},{2})"),
];

/** Multiple regression's first step, as the handheld asks it: how many independent (x) lists. */
const indVars = (title: string, next: (n: number) => Dialog): MenuItem => step(title, [{ label: "Num of Ind Vars:", value: "1" }], (v) => next(count(v[0])));

/** Statistics ▸ Stat Calculations: the Calculator's, and Lists & Spreadsheet's (lists/lists-menu.ts). */
export const STAT_CALCULATIONS: MenuItem[] = [
  // Num of Lists first; one list takes frequencies and categories, several take only the lists (OneVar n, List1, …).
  step("One-Variable Statistics", [{ label: "Num of Lists:", value: "1" }], (v) => {
    const n = count(v[0]);
    return n === 1
      ? dialog("One-Variable Statistics", [{ label: "X1 List:" }, FREQ, ...CATEGORY], "OneVar {0},{1},{2},{3}")
      : dialog("One-Variable Statistics", fieldsOf(n, (i) => `X${i} List:`), `OneVar ${n},${refs(0, n)}`);
  }),
  stat("Two-Variable Statistics", [{ label: "X List:" }, { label: "Y List:" }, FREQ, ...CATEGORY], "TwoVar {0},{1},{2},{3},{4}"),
  regWizard("Linear Regression (mx+b)", "LinRegMx"),
  regWizard("Linear Regression (a+bx)", "LinRegBx"),
  regWizard("Median-Median Line", "MedMed"),
  regWizard("Quadratic Regression", "QuadReg"),
  regWizard("Cubic Regression", "CubicReg"),
  regWizard("Quartic Regression", "QuartReg"),
  regWizard("Power Regression", "PowerReg"),
  regWizard("Exponential Regression", "ExpReg"),
  regWizard("Logarithmic Regression", "LnReg"),
  stat(
    "Sinusoidal Regression",
    [{ label: "X List:" }, { label: "Y List:" }, SAVE, { label: "Iterations:", value: "8" }, { label: "Period:", hint: "(optional)" }],
    "SinReg {0},{1},{3},{4}: CopyVar stat.RegEqn,{2}: stat.results",
  ),
  logisticWizard("Logistic Regression (d=0)", "Logistic"),
  logisticWizard("Logistic Regression (d≠0)", "LogisticD"),
  indVars("Multiple Linear Regression", (n) =>
    dialog("Multiple Linear Regression", [{ label: "Y List:" }, ...fieldsOf(n, (i) => `X${i} List:`), SAVE], `MultReg ${refs(0, n + 1)}: CopyVar stat.RegEqn,{${n + 1}}: stat.results`),
  ),
  ins("Correlation Matrix", "corrMat("),
];

/** Statistics ▸ Confidence Intervals, shared with Lists & Spreadsheet. */
export const CONFIDENCE_INTERVALS: MenuItem[] = [
  dataOrStats(
    "z Interval",
    dialog("z Interval", [{ label: "σ:" }, { label: "List:" }, FREQ, C_LEVEL], "zInterval {0},{1},{2},{3}"),
    dialog("z Interval", [{ label: "σ:" }, { label: "x̄:" }, { label: "n:" }, C_LEVEL], "zInterval {0},{1},{2},{3}"),
  ),
  dataOrStats(
    "t Interval",
    dialog("t Interval", [{ label: "List:" }, FREQ, C_LEVEL], "tInterval {0},{1},{2}"),
    dialog("t Interval", [{ label: "x̄:" }, { label: "Sx:" }, { label: "n:" }, C_LEVEL], "tInterval {0},{1},{2},{3}"),
  ),
  dataOrStats(
    "2-Sample z Interval",
    dialog(
      "2-Sample z Interval",
      [{ label: "σ1:" }, { label: "σ2:" }, { label: "List 1:" }, { label: "List 2:" }, { label: "Frequency 1:", value: "1" }, { label: "Frequency 2:", value: "1" }, C_LEVEL],
      "zInterval_2Samp {0},{1},{2},{3},{4},{5},{6}",
    ),
    dialog("2-Sample z Interval", [{ label: "σ1:" }, { label: "σ2:" }, { label: "x̄1:" }, { label: "n1:" }, { label: "x̄2:" }, { label: "n2:" }, C_LEVEL], "zInterval_2Samp {0},{1},{2},{3},{4},{5},{6}"),
  ),
  dataOrStats(
    "2-Sample t Interval",
    dialog(
      "2-Sample t Interval",
      [{ label: "List 1:" }, { label: "List 2:" }, { label: "Frequency 1:", value: "1" }, { label: "Frequency 2:", value: "1" }, C_LEVEL, POOLED],
      "tInterval_2Samp {0},{1},{2},{3},{4},{5}",
    ),
    dialog(
      "2-Sample t Interval",
      [{ label: "x̄1:" }, { label: "Sx1:" }, { label: "n1:" }, { label: "x̄2:" }, { label: "Sx2:" }, { label: "n2:" }, C_LEVEL, POOLED],
      "tInterval_2Samp {0},{1},{2},{3},{4},{5},{6},{7}",
    ),
  ),
  stat("1-Prop z Interval", [{ label: "Successes, x:" }, { label: "n:" }, C_LEVEL], "zInterval_1Prop {0},{1},{2}"),
  stat("2-Prop z Interval", [{ label: "Successes, x1:" }, { label: "n1:" }, { label: "Successes, x2:" }, { label: "n2:" }, C_LEVEL], "zInterval_2Prop {0},{1},{2},{3},{4}"),
  // Slope or Response first: a response interval is at an x value, and its C Level comes after it.
  step("Linear Reg t Intervals", [{ label: "Interval:", value: "Slope", options: ["Slope", "Response"] }], (v) =>
    v[0] === "Response"
      ? dialog(
          "Linear Reg t Intervals",
          [{ label: "X List:" }, { label: "Y List:" }, SAVE, FREQ, { label: "X Value:" }, C_LEVEL],
          "LinRegtIntervals {0},{1},{3},1,{4},{5}: CopyVar stat.RegEqn,{2}: stat.results",
        )
      : dialog("Linear Reg t Intervals", [{ label: "X List:" }, { label: "Y List:" }, SAVE, FREQ, C_LEVEL], "LinRegtIntervals {0},{1},{3},0,{4}: CopyVar stat.RegEqn,{2}: stat.results"),
  ),
  indVars("Multiple Reg Intervals", (n) =>
    dialog(
      "Multiple Reg Intervals",
      [{ label: "Y List:" }, ...fieldsOf(n, (i) => `X${i} List:`), { label: "X Values List:" }, SAVE, C_LEVEL],
      `MultRegIntervals ${refs(0, n + 2)},{${n + 3}}: CopyVar stat.RegEqn,{${n + 2}}: stat.results`,
    ),
  ),
];

/** Statistics ▸ Stat Tests, shared with Lists & Spreadsheet. */
export const STAT_TESTS: MenuItem[] = [
  dataOrStats(
    "z Test",
    dialog("z Test", [{ label: "μ0:" }, { label: "σ:" }, { label: "List:" }, FREQ, HYP("μ", "μ0")], "zTest {0},{1},{2},{3},{4}"),
    dialog("z Test", [{ label: "μ0:" }, { label: "σ:" }, { label: "x̄:" }, { label: "n:" }, HYP("μ", "μ0")], "zTest {0},{1},{2},{3},{4}"),
  ),
  dataOrStats(
    "t Test",
    dialog("t Test", [{ label: "μ0:" }, { label: "List:" }, FREQ, HYP("μ", "μ0")], "tTest {0},{1},{2},{3}"),
    dialog("t Test", [{ label: "μ0:" }, { label: "x̄:" }, { label: "Sx:" }, { label: "n:" }, HYP("μ", "μ0")], "tTest {0},{1},{2},{3},{4}"),
  ),
  dataOrStats(
    "2-Sample z Test",
    dialog(
      "2-Sample z Test",
      [{ label: "σ1:" }, { label: "σ2:" }, { label: "List 1:" }, { label: "List 2:" }, { label: "Frequency 1:", value: "1" }, { label: "Frequency 2:", value: "1" }, HYP("μ1", "μ2")],
      "zTest_2Samp {0},{1},{2},{3},{4},{5},{6}",
    ),
    dialog("2-Sample z Test", [{ label: "σ1:" }, { label: "σ2:" }, { label: "x̄1:" }, { label: "n1:" }, { label: "x̄2:" }, { label: "n2:" }, HYP("μ1", "μ2")], "zTest_2Samp {0},{1},{2},{3},{4},{5},{6}"),
  ),
  dataOrStats(
    "2-Sample t Test",
    dialog(
      "2-Sample t Test",
      [{ label: "List 1:" }, { label: "List 2:" }, { label: "Frequency 1:", value: "1" }, { label: "Frequency 2:", value: "1" }, HYP("μ1", "μ2"), POOLED],
      "tTest_2Samp {0},{1},{2},{3},{4},{5}",
    ),
    dialog(
      "2-Sample t Test",
      [{ label: "x̄1:" }, { label: "Sx1:" }, { label: "n1:" }, { label: "x̄2:" }, { label: "Sx2:" }, { label: "n2:" }, HYP("μ1", "μ2"), POOLED],
      "tTest_2Samp {0},{1},{2},{3},{4},{5},{6},{7}",
    ),
  ),
  stat("1-Prop z Test", [{ label: "P0:" }, { label: "Successes, x:" }, { label: "n:" }, HYP("prop", "p0")], "zTest_1Prop {0},{1},{2},{3}"),
  stat("2-Prop z Test", [{ label: "Successes, x1:" }, { label: "n1:" }, { label: "Successes, x2:" }, { label: "n2:" }, HYP("p1", "p2")], "zTest_2Prop {0},{1},{2},{3},{4}"),
  stat("χ² GOF", [{ label: "Observed List:" }, { label: "Expected List:" }, { label: "Deg of Freedom, df:" }], "χ²GOF {0},{1},{2}"),
  stat("χ² 2-way Test", [{ label: "Observed Matrix:" }], "χ²2way {0}"),
  dataOrStats(
    "2-Sample F Test",
    dialog("2-Sample F Test", [{ label: "List 1:" }, { label: "List 2:" }, { label: "Frequency 1:", value: "1" }, { label: "Frequency 2:", value: "1" }, HYP("σ1", "σ2")], "FTest_2Samp {0},{1},{2},{3},{4}"),
    dialog("2-Sample F Test", [{ label: "Sx1:" }, { label: "n1:" }, { label: "Sx2:" }, { label: "n2:" }, HYP("σ1", "σ2")], "FTest_2Samp {0},{1},{2},{3},{4}"),
  ),
  stat("Linear Reg t Test", [{ label: "X List:" }, { label: "Y List:" }, SAVE, FREQ, HYP("β & ρ", "0")], "LinRegtTest {0},{1},{3},{4}: CopyVar stat.RegEqn,{2}: stat.results"),
  indVars("Multiple Reg Tests", (n) =>
    dialog("Multiple Reg Tests", [{ label: "Y List:" }, ...fieldsOf(n, (i) => `X${i} List:`), SAVE], `MultRegTests ${refs(0, n + 1)}: CopyVar stat.RegEqn,{${n + 1}}: stat.results`),
  ),
  // Data Input Method and the number of groups first; Stats takes each group as {n, x̄, Sx}, flagged with a final 1.
  step(
    "ANOVA",
    [
      { label: "Data Input Method:", value: "Data", options: ["Data", "Stats"] },
      { label: "Number of Groups:", value: "2" },
    ],
    (v) => {
      const n = count(v[1], 2);
      return v[0] === "Stats"
        ? { ...dialog("ANOVA", fieldsOf(n, (i) => `Group ${i} Stats:`), `ANOVA ${refs(0, n)},1`), note: "Group Stats: {n, xbar, Sx}" }
        : dialog("ANOVA", fieldsOf(n, (i) => `List ${i}:`), `ANOVA ${refs(0, n)}`);
    },
  ),
  // Block design: a list for each level of the column factor. 2 Factor, Eq Reps: the same, and how many levels the rows have.
  step(
    "ANOVA 2-Way",
    [
      { label: "Design:", value: "Block", options: ["Block", "2 Factor, Eq Reps"] },
      { label: "Lvls of Col Factor:", value: "2" },
    ],
    (v) => {
      const n = count(v[1], 2);
      return v[0] === "Block"
        ? dialog("ANOVA 2-Way", fieldsOf(n, (i) => `List ${i}:`), `ANOVA2way ${refs(0, n)}`)
        : dialog("ANOVA 2-Way", [...fieldsOf(n, (i) => `List ${i}:`), { label: "Lvls of Row Factor:" }], `ANOVA2way ${refs(0, n + 1)}`);
    },
  ),
];

export const calculatorMenu: Menu = [
  sub("Actions", [
    ins("Define", "Define "),
    app("Recall Definition", "recallDef"),
    rule(ins("Delete Variable", "DelVar ")),
    app("Clear a-z...", "clearAZ"),
    app("Clear History", "clearHistory"),
    rule(ins("Insert Comment", "©")),
    rule(
      sub("Library", [
        app("Refresh Libraries", "refreshLibs"),
        ins('Insert "\\" character', "\\"),
        app("Create Library Shortcut", "libShortcut"),
        ins("Define LibPriv", "Define LibPriv "),
        ins("Define LibPub (Show in Catalog)", "Define LibPub "),
      ]),
    ),
    sub("Lock", [ins("Lock Variable", "Lock "), ins("Unlock Variable", "unLock "), ins("Get Lock Info", "getLockInfo(")]),
  ]),
  sub("Number", [
    ins("Convert to Decimal", "▶Decimal"),
    ins("Approximate to Fraction", "▶approxFraction()"),
    ins("Factor", "factor("),
    ins("Least Common Multiple", "lcm("),
    ins("Greatest Common Divisor", "gcd("),
    ins("Remainder", "remain("),
    sub("Fraction Tools", [
      ins("Proper Fraction", "propFrac("),
      ins("Get Numerator", "getNum("),
      ins("Get Denominator", "getDenom("),
      ins("Common Denominator", "comDenom("),
    ]),
    sub("Number Tools", [
      ins("Round", "round("),
      ins("Integer Part", "iPart("),
      ins("Fractional Part", "fPart("),
      ins("Sign", "sign("),
      ins("Mod", "mod("),
      ins("Floor", "floor("),
      ins("Ceiling", "ceiling("),
    ]),
    sub("Complex Number Tools", [
      ins("Complex Conjugate", "conj("),
      ins("Real Part", "real("),
      ins("Imaginary Part", "imag("),
      ins("Polar Angle", "angle("),
      ins("Magnitude", "abs("),
      ins("Convert to Polar", "▶Polar"),
      ins("Convert to Rectangular", "▶Rect"),
    ]),
  ]),
  sub("Algebra", [
    ins("Solve", "solve("),
    ins("Factor", "factor("),
    ins("Expand", "expand("),
    ins("Zeros", "zeros("),
    ins("Complete the Square", "completeSquare("),
    ins("Numerical Solve", "nSolve("),
    sub("Solve System of Equations", [
      wiz(
        "Solve System of Equations...",
        "Solve System of Equations",
        [
          { label: "Number of equations:", value: "2" },
          { label: "Variables:", value: "x,y" },
        ],
        "system:{0}:{1}",
      ),
      wiz(
        "Solve System of Linear Equations...",
        "Solve a System of Linear Equations",
        [
          { label: "Number of equations:", value: "2" },
          { label: "Variables:", value: "x,y" },
        ],
        "linsystem:{0}:{1}",
      ),
    ]),
    sub("Polynomial Tools", [
      wiz(
        "Find Roots of Polynomial...",
        "Find Roots of a Polynomial",
        [
          { label: "Degree:", value: "2" },
          { label: "Roots:", value: "Real", options: ["Real", "Complex"] },
        ],
        "polyroots:{0}:{1}",
      ),
      rule(ins("Real Roots of Polynomial", "polyRoots(")),
      ins("Complex Roots of Polynomial", "cPolyRoots("),
      ins("Remainder of Polynomial", "polyRemainder("),
      ins("Quotient of Polynomial", "polyQuotient("),
      ins("Greatest Common Divisor", "polyGcd("),
      ins("Coefficients of Polynomial", "polyCoeffs("),
      ins("Degree of Polynomial", "polyDegree("),
    ]),
    sub("Fraction Tools", [
      ins("Proper Fraction", "propFrac("),
      ins("Get Numerator", "getNum("),
      ins("Get Denominator", "getDenom("),
      ins("Common Denominator", "comDenom("),
    ]),
    sub("Convert Expression", [
      ins("Convert to ln", "▶ln"),
      ins("Convert to logbase", "▶logbase("),
      ins("Convert to exp", "▶exp"),
      ins("Convert to sin", "▶sin"),
      ins("Convert to cos", "▶cos"),
    ]),
    sub("Trigonometry", [ins("Expand", "tExpand("), ins("Collect", "tCollect(")]),
    sub("Complex", [ins("Solve", "cSolve("), ins("Factor", "cFactor("), ins("Zeros", "cZeros(")]),
    sub("Extract", [ins("Left", "left("), ins("Right", "right(")]),
  ]),
  sub("Calculus", [
    tpl("Derivative", "deriv"),
    wiz(
      "Derivative at a Point...",
      "Derivative at a Point",
      [
        { label: "Variable:", value: "x" },
        { label: "Value:", value: "" },
        { label: "Derivative:", value: "1st Derivative", options: ["1st Derivative", "2nd Derivative"] },
      ],
      "derivat:{0}:{1}:{2}",
    ),
    tpl("Integral", "defintegral"),
    tpl("Limit", "limit"),
    tpl("Sum", "sum"),
    tpl("Product", "product"),
    ins("Function Minimum", "fMin("),
    ins("Function Maximum", "fMax("),
    ins("Tangent Line", "tangentLine("),
    ins("Normal Line", "normalLine("),
    ins("Arc Length", "arcLen("),
    sub("Series", [
      ins("Taylor Polynomial", "taylor("),
      ins("Generalized Series", "series("),
      ins("Dominant Term", "dominantTerm("),
    ]),
    ins("Differential Equation Solver...", "deSolve("),
    ins("Implicit Differentiation", "impDif("),
    sub("Numerical Calculations", [
      ins("Numerical Derivative at a Point", "nDerivative("),
      ins("Central Difference Quotient with Step", "centralDiff("),
      ins("Numerical Integral", "nInt("),
      ins("Numerical Function Minimum", "nfMin("),
      ins("Numerical Function Maximum", "nfMax("),
    ]),
  ]),
  sub("Probability", [
    ins("Factorial (!)", "!"),
    ins("Permutations", "nPr("),
    ins("Combinations", "nCr("),
    sub("Random", [
      ins("Number", "rand("),
      ins("Integer", "randInt("),
      ins("Binomial", "randBin("),
      ins("Normal", "randNorm("),
      ins("Sample", "randSamp("),
      ins("Seed", "RandSeed "),
    ]),
    sub("Distributions", DISTRIBUTIONS),
  ]),
  sub("Statistics", [
    sub("Stat Calculations", STAT_CALCULATIONS),
    ins("Stat Results", "stat.results"),
    sub("List Math", [
      ins("Minimum", "min("),
      ins("Maximum", "max("),
      ins("Mean", "mean("),
      ins("Median", "median("),
      ins("Sum of Elements", "sum("),
      ins("Product of Elements", "product("),
      ins("Sample Standard Deviation", "stDevSamp("),
      ins("Sample Variance", "varSamp("),
      ins("Population Standard Deviation", "stDevPop("),
      ins("Population Variance", "varPop("),
    ]),
    sub("List Operations", [
      ins("Sort Ascending", "SortA "),
      ins("Sort Descending", "SortD "),
      ins("Cumulative Sum List", "cumulativeSum("),
      ins("Fill", "Fill "),
      ins("Sequence", "seq("),
      ins("Difference List", "ΔList("),
      ins("Augment", "augment("),
      ins("Convert List to Matrix", "list▶mat("),
      ins("Convert Matrix to List", "mat▶list("),
      ins("Left", "left("),
      ins("Mid", "mid("),
      ins("Right", "right("),
    ]),
    sub("Distributions", DISTRIBUTIONS),
    sub("Confidence Intervals", CONFIDENCE_INTERVALS),
    sub("Stat Tests", STAT_TESTS),
  ]),
  sub("Matrix & Vector", [
    sub("Create", [
      { label: "Matrix...", action: MATRIX_WIZARD },
      ins("Zero Matrix", "newMat("),
      ins("Identity", "identity("),
      ins("Diagonal", "diag("),
      ins("Random Matrix", "randMat("),
      ins("Fill", "Fill "),
      ins("Submatrix", "subMat("),
      ins("Augment", "augment("),
      ins("Column Augment", "colAugment("),
      ins("Construct Matrix", "constructMat("),
    ]),
    ins("Transpose", "ᵀ"),
    ins("Determinant", "det("),
    ins("Row-Echelon Form", "ref("),
    ins("Reduced Row-Echelon Form", "rref("),
    ins("Simultaneous", "simult("),
    sub("Norms", [ins("Norm", "norm("), ins("Row", "rowNorm("), ins("Column", "colNorm(")]),
    sub("Dimensions", [ins("Matrix", "dim("), ins("Row", "rowDim("), ins("Column", "colDim(")]),
    sub("Row Operations", [
      ins("Swap Rows", "rowSwap("),
      ins("Row Add", "rowAdd("),
      ins("Multiply Row", "mRow("),
      ins("Multiply Row & Add", "mRowAdd("),
    ]),
    sub("Element Operations", [
      ins("Dot Add", ".+"),
      ins("Dot Subtract", ".-"),
      ins("Dot Multiply", ".*"),
      ins("Dot Divide", "./"),
      ins("Dot Power", ".^"),
    ]),
    sub("Advanced", [
      ins("Trace", "trace("),
      ins("LU Decomposition", "LU "),
      ins("QR Decomposition", "QR "),
      ins("Eigenvalues", "eigVl("),
      ins("Eigenvectors", "eigVc("),
      ins("Characteristic Polynomial", "charPoly("),
    ]),
    sub("Vector", [
      ins("Unit Vector", "unitV("),
      ins("Cross Product", "crossP("),
      ins("Dot Product", "dotP("),
      ins("Convert to Polar", "▶Polar"),
      ins("Convert to Rectangular", "▶Rect"),
      ins("Convert to Cylindrical", "▶Cylind"),
      ins("Convert to Spherical", "▶Sphere"),
    ]),
  ]),
  sub("Finance", [
    app("Finance Solver...", "financeSolver"),
    rule(
      sub("TVM Functions", [
        ins("Number of Periods", "tvmN("),
        ins("Interest Rate per Year", "tvmI("),
        ins("Present Value", "tvmPV("),
        ins("Payment Amount", "tvmPmt("),
        ins("Future Value", "tvmFV("),
      ]),
    ),
    sub("Amortization", [ins("Amortization Table", "amortTbl("), ins("Balance", "bal("), ins("Interest Paid", "ΣInt("), ins("Principal Paid", "ΣPrn(")]),
    sub("Cash Flows", [
      ins("Net Present Value", "npv("),
      ins("Internal Rate of Return", "irr("),
      ins("Modified Internal Rate of Return", "mirr("),
    ]),
    sub("Interest Conversion", [ins("Nominal Interest Rate", "nom("), ins("Effective Interest Rate", "eff(")]),
    // Both paste dbd(: the dates' own form (MM.DDYY or DDMM.YY) tells them apart.
    sub("Days between Dates", [ins("Month Day Format", "dbd("), ins("Day Month Format", "dbd(")]),
  ]),
  sub("Functions & Programs", [
    sub("Program Editor", [app("New...", "prgmNew"), app("Open...", "prgmOpen"), app("Import...", "prgmImport"), app("View...", "prgmView")]),
    ins("Func...EndFunc", `Func:${C}:EndFunc`),
    ins("Prgm...EndPrgm", `Prgm:${C}:EndPrgm`),
    ins("Local", "Local "),
    sub("Control", [
      ins("If", "If "),
      ins("If...Then...EndIf", `If ${C} Then::EndIf`),
      ins("If...Then...Else...EndIf", `If ${C} Then::Else::EndIf`),
      ins("ElseIf...Then", `ElseIf ${C} Then:`),
      ins("For...EndFor", `For ${C}::EndFor`),
      ins("While...EndWhile", `While ${C}::EndWhile`),
      ins("Loop...EndLoop", `Loop:${C}:EndLoop`),
      ins("Try...Else...EndTry", `Try:${C}:Else::EndTry`),
      ins("ClrErr", "ClrErr"),
      ins("PassErr", "PassErr"),
      ins("errCode", "errCode"),
      ins("warnCodes", "warnCodes("),
      ins("Wait", "Wait "),
    ]),
    sub("Transfer", [ins("Return", "Return "), ins("Cycle", "Cycle"), ins("Exit", "Exit"), ins("Lbl", "Lbl "), ins("GoTo Lbl", "Goto "), ins("Stop", "Stop")]),
    sub("I/O", [
      ins("Disp", "Disp "),
      ins("DispAt", "DispAt "),
      ins("Request", "Request "),
      ins("RequestStr", "RequestStr "),
      ins("Text", "Text "),
      ins("getKey", "getKey("),
      rule(ins("Get", "Get ")),
      ins("GetStr", "GetStr "),
      ins("Send", "Send "),
      rule(ins("RefreshProbeVars", "RefreshProbeVars")),
    ]),
    sub("Mode", [
      sub("Display Digits", [
        ...["Float", ...Array.from({ length: 12 }, (_, i) => `Float${i + 1}`), ...Array.from({ length: 13 }, (_, i) => `Fix${i}`)].map((l, i) => ins(l, `setMode(1,${i + 1})`)),
      ]),
      modeMenu("Angle", 2, ["Radian", "Degree", "Gradian"]),
      modeMenu("Exponential Format", 3, ["Normal", "Scientific", "Engineering"]),
      modeMenu("Real or Complex", 4, ["Real", "Rectangular", "Polar"]),
      modeMenu("Auto or Approx", 5, ["Auto", "Approximate", "Exact"]),
      modeMenu("Vector Format", 6, ["Rectangular", "Cylindrical", "Spherical"]),
      modeMenu("Base", 7, ["Decimal", "Hex", "Binary"]),
      modeMenu("Unit System", 8, ["SI", "Eng/US"]),
      ins("Get Mode", "getMode("),
      ins("Get Language Info", "getLangInfo()"),
      ins("Get Platform Info", "getPlatform()"),
    ]),
    // The entry line is one line here: a new line in a block is ":", which the handheld also reads as one.
    ins("Add New Line", ":"),
  ]),
];

/**
 * ctrl menu on a Calculator page, as the handheld's: on the entry line,
 * editing and inserting; on a history entry (selected with ▲), its
 * warning, copying and deleting.
 */
export function calculatorContextMenu(s: { entry: boolean; selection: boolean; warning: boolean; variables: string[] }): Menu {
  if (!s.entry)
    return [
      s.warning ? app("Show Warning Info...", "calcShowWarning") : na("Show Warning Info...", "this entry has no warning"),
      app("Clear History", "clearHistory"),
      rule(app("Copy", "editCopy")),
      app("Delete", "calcDeleteEntry"),
    ];
  return [
    app("Clear History", "clearHistory"),
    rule(s.selection ? app("Cut", "editCut") : na("Cut", "nothing is selected")),
    s.selection ? app("Copy", "editCopy") : na("Copy", "nothing is selected"),
    app("Paste", "editPaste"),
    s.selection ? app("Delete", "editDelete") : na("Delete", "nothing is selected"),
    sub("Select Variable", s.variables.length ? s.variables.map((v) => app(v, `varpick:${v}`)) : [na("(no variables)", "the problem has no variables yet")]),
    app("Symbols...", "openSymbols"),
    app("Math Templates...", "openTemplates"),
  ];
}
