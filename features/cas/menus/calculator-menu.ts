// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 VCE Hub. Part of the /cas calculator: https://github.com/vcehub/cas
import { CARET as C } from "../math/editor";
import { app, ins, MATRIX_WIZARD, off, rule, sub, tpl, wiz, type Menu, type MenuItem } from "./types";

/**
 * The Calculator app's menu. Item positions are the contract (see
 * types.ts): the same keystrokes reach the same command.
 */

const MU_SIGMA = [
  { label: "μ:", value: "0" },
  { label: "σ:", value: "1" },
];

/**
 * A regression's dialog: the lists, where to save its equation, and
 * frequencies. It pastes the
 * command, CopyVar to save the equation, and stat.results to show them.
 */
const regWizard = (title: string, command: string): MenuItem =>
  wiz(
    `${title}...`,
    title,
    [
      { label: "X List:" },
      { label: "Y List:" },
      { label: "Save RegEqn to:", value: "f1", options: Array.from({ length: 9 }, (_, i) => `f${i + 1}`) },
      { label: "Frequency List:", value: "1" },
    ],
    `${command} {0},{1},{3}: CopyVar stat.RegEqn,{2}: stat.results`,
  );

const F_NAMES = Array.from({ length: 9 }, (_, i) => `f${i + 1}`);
const C_LEVEL = { label: "C Level:", value: "0.95" };
// 0: ≠, −1: <, 1: >, as the commands take the alternative.
const ALT = { label: "Alternate Hyp (0 ≠, −1 <, 1 >):", value: "0", options: ["0", "-1", "1"] };
const POOLED = { label: "Pooled (0 no, 1 yes):", value: "0", options: ["0", "1"] };

/** Logistic regression's dialog: as a regression's, with the iterations the fit may take. */
const logisticWizard = (title: string, command: string): MenuItem =>
  wiz(
    `${title}...`,
    title,
    [
      { label: "X List:" },
      { label: "Y List:" },
      { label: "Save RegEqn to:", value: "f1", options: F_NAMES },
      { label: "Iterations:", value: "64" },
      { label: "Frequency List:", value: "1" },
    ],
    `${command} {0},{1},{3},{4}: CopyVar stat.RegEqn,{2}: stat.results`,
  );

/** A Mode setting's values, each pasting setMode with the handheld's numbers for it. */
const modeMenu = (label: string, mode: number, values: string[]): MenuItem => sub(label, values.map((v, i) => ins(v, `setMode(${mode},${i + 1})`)));

/** Distributions, under both Probability and Statistics. */
/** The F distribution's two degrees of freedom, as its wizards ask for them. */
const F_DF = [{ label: "Numerator df:" }, { label: "Denominator df:" }];

export const DISTRIBUTIONS: MenuItem[] = [
  wiz("Normal Pdf...", "Normal Pdf", [{ label: "X Value:" }, ...MU_SIGMA], "normPdf({0},{1},{2})"),
  wiz(
    "Normal Cdf...",
    "Normal Cdf",
    [{ label: "Lower Bound:", value: "-∞" }, { label: "Upper Bound:" }, ...MU_SIGMA],
    "normCdf({0},{1},{2},{3})",
  ),
  wiz("Inverse Normal...", "Inverse Normal", [{ label: "Area:" }, ...MU_SIGMA], "invNorm({0},{1},{2})"),
  wiz("t Pdf...", "t Pdf", [{ label: "X Value:" }, { label: "Deg of Freedom, df:" }], "tPdf({0},{1})"),
  wiz(
    "t Cdf...",
    "t Cdf",
    [{ label: "Lower Bound:", value: "-∞" }, { label: "Upper Bound:" }, { label: "Deg of Freedom, df:" }],
    "tCdf({0},{1},{2})",
  ),
  wiz("Inverse t...", "Inverse t", [{ label: "Area:" }, { label: "Deg of Freedom, df:" }], "invt({0},{1})"),
  wiz("χ² Pdf...", "χ² Pdf", [{ label: "X Value:" }, { label: "Deg of Freedom, df:" }], "χ²Pdf({0},{1})"),
  wiz(
    "χ² Cdf...",
    "χ² Cdf",
    [{ label: "Lower Bound:", value: "0" }, { label: "Upper Bound:" }, { label: "Deg of Freedom, df:" }],
    "χ²Cdf({0},{1},{2})",
  ),
  wiz("Inverse χ²...", "Inverse χ²", [{ label: "Area:" }, { label: "Deg of Freedom, df:" }], "invχ²({0},{1})"),
  wiz(
    "Binomial Pdf...",
    "Binomial Pdf",
    [{ label: "Num Trials, n:" }, { label: "Prob Success, p:" }, { label: "X Value:", hint: "(optional)" }],
    "binomPdf({0},{1},{2})",
  ),
  wiz(
    "Binomial Cdf...",
    "Binomial Cdf",
    [
      { label: "Num Trials, n:" },
      { label: "Prob Success, p:" },
      { label: "Lower Bound:", value: "0" },
      { label: "Upper Bound:" },
    ],
    "binomCdf({0},{1},{2},{3})",
  ),
  wiz(
    "Inverse Binomial...",
    "Num Successes",
    [{ label: "Cumulative Prob:" }, { label: "Num Trials, n:" }, { label: "Prob Success, p:" }],
    "invBinom({0},{1},{2})",
  ),
  wiz(
    "Inverse Binomial N...",
    "Num Trials",
    [{ label: "Cumulative Prob:" }, { label: "Prob Success, p:" }, { label: "Successes, x:" }],
    "invBinomN({0},{1},{2})",
  ),
  wiz("F Pdf...", "F Pdf", [{ label: "X Value:" }, ...F_DF], "FPdf({0},{1},{2})"),
  wiz("F Cdf...", "F Cdf", [{ label: "Lower Bound:", value: "0" }, { label: "Upper Bound:" }, ...F_DF], "FCdf({0},{1},{2},{3})"),
  wiz("Inverse F...", "Inverse F", [{ label: "Area:" }, ...F_DF], "invF({0},{1},{2})"),
  wiz("Geometric Pdf...", "Geometric Pdf", [{ label: "Prob Success, p:" }, { label: "X Value:" }], "geomPdf({0},{1})"),
  wiz(
    "Geometric Cdf...",
    "Geometric Cdf",
    [{ label: "Prob Success, p:" }, { label: "Lower Bound:", value: "1" }, { label: "Upper Bound:" }],
    "geomCdf({0},{1},{2})",
  ),
  wiz("Poisson Pdf...", "Poisson Pdf", [{ label: "λ:" }, { label: "X Value:" }], "poissPdf({0},{1})"),
  wiz(
    "Poisson Cdf...",
    "Poisson Cdf",
    [{ label: "λ:" }, { label: "Lower Bound:", value: "0" }, { label: "Upper Bound:" }],
    "poissCdf({0},{1},{2})",
  ),
];

/** Statistics ▸ Stat Calculations: the Calculator's, and Lists & Spreadsheet's (lists/lists-menu.ts). */
export const STAT_CALCULATIONS: MenuItem[] = [
  wiz(
    "One-Variable Statistics...",
    "One-Variable Statistics",
    [{ label: "X1 List:" }, { label: "Frequency List:", value: "1" }],
    "OneVar {0},{1}",
  ),
  wiz(
    "Two-Variable Statistics...",
    "Two-Variable Statistics",
    [{ label: "X List:" }, { label: "Y List:" }, { label: "Frequency List:", value: "1" }],
    "TwoVar {0},{1},{2}",
  ),
  regWizard("Linear Regression (mx+b)", "LinRegMx"),
  regWizard("Linear Regression (a+bx)", "LinRegBx"),
  regWizard("Median-Median Line", "MedMed"),
  regWizard("Quadratic Regression", "QuadReg"),
  regWizard("Cubic Regression", "CubicReg"),
  regWizard("Quartic Regression", "QuartReg"),
  regWizard("Power Regression", "PowerReg"),
  regWizard("Exponential Regression", "ExpReg"),
  regWizard("Logarithmic Regression", "LnReg"),
  wiz(
    "Sinusoidal Regression...",
    "Sinusoidal Regression",
    [
      { label: "X List:" },
      { label: "Y List:" },
      { label: "Save RegEqn to:", value: "f1", options: F_NAMES },
      { label: "Iterations:", value: "8" },
      { label: "Period:", hint: "(optional)" },
    ],
    "SinReg {0},{1},{3},{4}: CopyVar stat.RegEqn,{2}: stat.results",
  ),
  logisticWizard("Logistic Regression (d=0)", "Logistic"),
  logisticWizard("Logistic Regression (d≠0)", "LogisticD"),
  wiz(
    "Multiple Linear Regression...",
    "Multiple Linear Regression",
    [{ label: "Y List:" }, { label: "X Lists:", hint: "x1,x2,…" }],
    "MultReg {0},{1}: stat.results",
  ),
  ins("Correlation Matrix", "corrMat("),
];

/** Statistics ▸ Confidence Intervals, shared with Lists & Spreadsheet. */
export const CONFIDENCE_INTERVALS: MenuItem[] = [
  wiz(
    "z Interval...",
    "z Interval",
    [{ label: "σ:" }, { label: "x̄:" }, { label: "n:" }, { label: "C Level:", value: "0.95" }],
    "zInterval {0},{1},{2},{3}",
  ),
  wiz(
    "t Interval...",
    "t Interval",
    [{ label: "x̄:" }, { label: "sx:" }, { label: "n:" }, { label: "C Level:", value: "0.95" }],
    "tInterval {0},{1},{2},{3}",
  ),
  wiz(
    "2-Sample z Interval...",
    "2-Sample z Interval",
    [{ label: "σ1:" }, { label: "σ2:" }, { label: "x̄1:" }, { label: "n1:" }, { label: "x̄2:" }, { label: "n2:" }, C_LEVEL],
    "zInterval_2Samp {0},{1},{2},{3},{4},{5},{6}",
  ),
  wiz(
    "2-Sample t Interval...",
    "2-Sample t Interval",
    [{ label: "x̄1:" }, { label: "sx1:" }, { label: "n1:" }, { label: "x̄2:" }, { label: "sx2:" }, { label: "n2:" }, C_LEVEL, POOLED],
    "tInterval_2Samp {0},{1},{2},{3},{4},{5},{6},{7}",
  ),
  wiz(
    "1-Prop z Interval...",
    "1-Prop z Interval",
    [{ label: "Successes, x:" }, { label: "n:" }, { label: "C Level:", value: "0.95" }],
    "zInterval_1Prop {0},{1},{2}",
  ),
  wiz(
    "2-Prop z Interval...",
    "2-Prop z Interval",
    [{ label: "Successes, x1:" }, { label: "n1:" }, { label: "Successes, x2:" }, { label: "n2:" }, C_LEVEL],
    "zInterval_2Prop {0},{1},{2},{3},{4}",
  ),
  wiz(
    "Linear Reg t Intervals...",
    "Linear Reg t Intervals",
    [
      { label: "X List:" },
      { label: "Y List:" },
      { label: "Save RegEqn to:", value: "f1", options: F_NAMES },
      { label: "Frequency List:", value: "1" },
      { label: "Interval (0 slope, 1 response):", value: "0", options: ["0", "1"] },
      { label: "X Value:", value: "0" },
      C_LEVEL,
    ],
    "LinRegtIntervals {0},{1},{3},{4},{5},{6}: CopyVar stat.RegEqn,{2}: stat.results",
  ),
  wiz(
    "Multiple Reg Intervals...",
    "Multiple Reg Intervals",
    [{ label: "Y List:" }, { label: "X Lists:", hint: "x1,x2,…" }, { label: "X Values:", hint: "{x1,x2,…}" }, C_LEVEL],
    "MultRegIntervals {0},{1},{2},{3}",
  ),
];

/** Statistics ▸ Stat Tests, shared with Lists & Spreadsheet. */
export const STAT_TESTS: MenuItem[] = [
  wiz(
    "z Test...",
    "z Test",
    [
      { label: "μ0:" },
      { label: "σ:" },
      { label: "x̄:" },
      { label: "n:" },
      // 0: μ ≠ μ0, −1: μ < μ0, 1: μ > μ0, as the command takes it.
      { label: "Alternate Hyp (0 ≠, −1 <, 1 >):", value: "0", options: ["0", "-1", "1"] },
    ],
    "zTest {0},{1},{2},{3},{4}",
  ),
  wiz(
    "t Test...",
    "t Test",
    [{ label: "μ0:" }, { label: "x̄:" }, { label: "sx:" }, { label: "n:" }, { label: "Alternate Hyp (0 ≠, −1 <, 1 >):", value: "0", options: ["0", "-1", "1"] }],
    "tTest {0},{1},{2},{3},{4}",
  ),
  wiz(
    "2-Sample z Test...",
    "2-Sample z Test",
    [{ label: "σ1:" }, { label: "σ2:" }, { label: "x̄1:" }, { label: "n1:" }, { label: "x̄2:" }, { label: "n2:" }, ALT],
    "zTest_2Samp {0},{1},{2},{3},{4},{5},{6}",
  ),
  wiz(
    "2-Sample t Test...",
    "2-Sample t Test",
    [{ label: "x̄1:" }, { label: "sx1:" }, { label: "n1:" }, { label: "x̄2:" }, { label: "sx2:" }, { label: "n2:" }, ALT, POOLED],
    "tTest_2Samp {0},{1},{2},{3},{4},{5},{6},{7}",
  ),
  wiz(
    "1-Prop z Test...",
    "1-Prop z Test",
    [{ label: "p0:" }, { label: "Successes, x:" }, { label: "n:" }, { label: "Alternate Hyp (0 ≠, −1 <, 1 >):", value: "0", options: ["0", "-1", "1"] }],
    "zTest_1Prop {0},{1},{2},{3}",
  ),
  wiz(
    "2-Prop z Test...",
    "2-Prop z Test",
    [{ label: "Successes, x1:" }, { label: "n1:" }, { label: "Successes, x2:" }, { label: "n2:" }, ALT],
    "zTest_2Prop {0},{1},{2},{3},{4}",
  ),
  wiz(
    "χ² GOF...",
    "χ² GOF",
    [{ label: "Observed List:" }, { label: "Expected List:" }, { label: "Deg of Freedom, df:" }],
    "χ²GOF {0},{1},{2}",
  ),
  wiz("χ² 2-way Test...", "χ² 2-way Test", [{ label: "Observed Matrix:" }], "χ²2way {0}"),
  wiz(
    "2-Sample F Test...",
    "2-Sample F Test",
    [{ label: "sx1:" }, { label: "n1:" }, { label: "sx2:" }, { label: "n2:" }, ALT],
    "FTest_2Samp {0},{1},{2},{3},{4}",
  ),
  wiz(
    "Linear Reg t Test...",
    "Linear Reg t Test",
    [
      { label: "X List:" },
      { label: "Y List:" },
      { label: "Save RegEqn to:", value: "f1", options: F_NAMES },
      { label: "Frequency List:", value: "1" },
      ALT,
    ],
    "LinRegtTest {0},{1},{3},{4}: CopyVar stat.RegEqn,{2}: stat.results",
  ),
  wiz("Multiple Reg Tests...", "Multiple Reg Tests", [{ label: "Y List:" }, { label: "X Lists:", hint: "x1,x2,…" }], "MultRegTests {0},{1}"),
  wiz("ANOVA...", "ANOVA", [{ label: "Lists:", hint: "list1,list2,…" }], "ANOVA {0}"),
  wiz(
    "ANOVA 2-Way...",
    "ANOVA 2-Way",
    [{ label: "Lists:", hint: "list1,list2,…" }, { label: "Levels of Row Factor:", value: "1" }],
    "ANOVA2way {0},{1}",
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
    sub("Solve a System of Equations", [
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
