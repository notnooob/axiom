// SPDX-License-Identifier: GPL-3.0-or-later
/**
 * The benchmark's commands, by menu, each typed as on the handheld with the
 * answer the handheld gives (`want`: exact text, compared without spaces, or
 * a pattern; several mean any of them). `error: true` expects an error.
 */
export type Case = {
  cat: string;
  name: string;
  input: string;
  want?: string | RegExp | (string | RegExp)[];
  approx?: boolean;
  before?: string[];
  error?: boolean;
};

const c = (cat: string) => (name: string, input: string, want?: Case["want"], more: Partial<Case> = {}): Case => ({ cat, name, input, want, ...more });

const A = c("Algebra");
const K = c("Calculus");
const N = c("Number");
const T = c("Trigonometry");
const X = c("Complex");
const L = c("Lists");
const M = c("Matrices & Vectors");
const P = c("Probability");
const S = c("Statistics");
const F = c("Finance");
const D = c("Define & variables");

export const CASES: Case[] = [
  // Algebra
  A("solve", "solve(x^2-5x+6=0,x)", "x=2 or x=3"),
  A("solve (system)", "solve(x+y=5 and x-y=1,{x,y})", "x=3 and y=2"),
  A("solve (inequality)", "solve(2x-3>5,x)", "x>4"),
  A("solve (trig, general)", "solve(sin(x)=1/2,x)", /x=/),
  A("factor", "factor(x^3-8)", "(x-2)*(x^2+2*x+4)"),
  A("factor (two variables)", "factor(x^2-y^2)", ["(x-y)*(x+y)", "(x+y)*(x-y)"]),
  A("expand", "expand((x+2)^3)", "x^3+6*x^2+12*x+8"),
  A("expand (partial fractions)", "expand(1/(x^2-1),x)", /1\/\(2\*\(x-1\)\)-1\/\(2\*\(x\+1\)\)|1\/\(2\*\(x-1\)\)-1\/\(2\*\(x\+1\)\)/),
  A("zeros", "zeros(x^2-4,x)", "{-2,2}"),
  A("completeSquare", "completeSquare(x^2+6x+5,x)", "(x+3)^2-4"),
  A("nSolve", "nSolve(x^3=2x+1,x)", /^(x=)?(-0\.618|1\.618|-1\.?)/),
  A("polyRoots", "polyRoots(x^3-6x^2+11x-6,x)", "{1,2,3}"),
  A("cPolyRoots", "cPolyRoots(x^2+1,x)", ["{-i,i}", "{i,-i}"]),
  A("polyRemainder", "polyRemainder(x^3+1,x+2,x)", "-7"),
  A("polyQuotient", "polyQuotient(x^3+1,x+2,x)", "x^2-2*x+4"),
  A("polyGcd", "polyGcd(x^2-1,x^2+2x+1)", "x+1"),
  A("polyCoeffs", "polyCoeffs(3x^2+2x-1,x)", "{3,2,-1}"),
  A("polyDegree", "polyDegree(3x^5+x,x)", "5"),
  A("propFrac", "propFrac((x^2+1)/(x+1),x)", /2\/\(x\+1\)\+x-1|x-1\+2\/\(x\+1\)/),
  A("getNum", "getNum((x+1)/(x-2))", "x+1"),
  A("getDenom", "getDenom((x+1)/(x-2))", "x-2"),
  A("comDenom", "comDenom(1/x+1/(x+1))", /\(2\*x\+1\)\/\(x\*\(x\+1\)\)|\(2\*x\+1\)\/\(x\^2\+x\)/),
  A("cSolve", "cSolve(x^2+1=0,x)", ["x=-i or x=i", "x=i or x=-i"]),
  A("cZeros", "cZeros(x^2+4,x)", ["{-2*i,2*i}", "{2*i,-2*i}"]),
  A("cFactor", "cFactor(x^2+1,x)", ["(x+i)*(x-i)", "(x-i)*(x+i)"]),
  A("left/right of an equation", "right(y=3x+2)", "3*x+2"),
  A("▶ln", "log(x)▶ln", /^ln\(x\)\/\(?ln\(10\)\)?$/),
  A("exact", "exact(0.25)", "1/4"),

  // Calculus
  K("derivative", "d(x^3,x)", "3*x^2"),
  K("derivative (function call form)", "derivative(x^3*sin(x),x)", /3\*x\^2\*sin\(x\)\+x\^3\*cos\(x\)|x\^3\*cos\(x\)\+3\*x\^2\*sin\(x\)|x\^2\*\(x\*cos\(x\)\+3\*sin\(x\)\)/),
  K("2nd derivative", "derivative(x^4,x,2)", "12*x^2"),
  K("derivative at a point", "derivative(x^3,x)|x=2", "12"),
  K("integral (indefinite)", "∫(x^2,x)", "x^3/3"),
  K("integral (definite)", "∫(x^2,x,0,3)", "9"),
  K("integral (by parts)", "∫(x*ℯ^x,x)", /\(x-1\)\*ℯ\^x|x\*ℯ\^x-ℯ\^x/),
  K("limit", "limit(sin(x)/x,x,0)", "1"),
  K("limit at infinity", "limit((2x+1)/(x-3),x,∞)", "2"),
  K("one-sided limit", "limit(1/x,x,0,1)", "∞"),
  K("sum (Σ)", "Σ(k^2,k,1,10)", "385"),
  K("product (Π)", "Π(k,k,1,5)", "120"),
  K("fMin (function minimum)", "fMin(x^2-4x,x)", "x=2"),
  K("fMax (function maximum)", "fMax(-x^2+6x,x)", "x=3"),
  K("fMin on an interval", "fMin(x^3-3x,x)|0≤x≤2", "x=1"),
  K("tangentLine", "tangentLine(x^2,x,1)", "2*x-1"),
  K("normalLine", "normalLine(x^2,x,1)", /-?x\/2\+3\/2|\(-x\+3\)\/2|3\/2-x\/2/),
  K("arcLen", "arcLen(x,x,0,1)", "√(2)"),
  K("taylor", "taylor(ℯ^x,x,3)", /x\^3\/6\+x\^2\/2\+x\+1|1\+x\+x\^2\/2\+x\^3\/6/),
  K("series", "series(sin(x),x,5)", /x\^5\/120-x\^3\/6\+x|x-x\^3\/6\+x\^5\/120/),
  K("dominantTerm", "dominantTerm(x^3+x,x,∞)", "x^3"),
  K("deSolve", "deSolve(y'=2y,x,y)", /y=c\d*\*ℯ\^\(2\*x\)|y=ℯ\^\(2\*x\)\*c\d*/),
  K("deSolve (initial condition)", "deSolve(y'=2y and y(0)=3,x,y)", "y=3*ℯ^(2*x)"),
  K("impDif", "impDif(x^2+y^2=25,x,y)", "-x/y"),
  K("nDerivative", "nDerivative(x^3,x=2)", /^12(\.0*)?$/),
  K("centralDiff", "centralDiff(x^3,x=2)", /^12\./),
  K("nInt", "nInt(ℯ^(-x^2),x,0,1)", /^0\.7468/),
  K("nfMin", "nfMin(x^2-4x,x)", /^2(\.0*)?$/),
  K("nfMax", "nfMax(-x^2+6x,x)", /^3(\.0*)?$/),

  // Number
  N("factor (integer)", "factor(360)", "2^3*3^2*5"),
  N("isPrime", "isPrime(97)", "true"),
  N("lcm", "lcm(12,18)", "36"),
  N("gcd", "gcd(12,18)", "6"),
  N("remain", "remain(17,5)", "2"),
  N("mod", "mod(-7,3)", "2"),
  N("round", "round(3.14159,2)", "3.14"),
  N("iPart", "iPart(-3.7)", "-3."),
  N("fPart", "fPart(3.7)", /^0\.7/),
  N("floor", "floor(-2.5)", "-3."),
  N("ceiling", "ceiling(2.1)", "3."),
  N("sign", "sign(-5)", "-1"),
  N("abs", "abs(-7/2)", "7/2"),
  N("factorial", "5!", "120"),
  N("nCr", "nCr(10,3)", "120"),
  N("nPr", "nPr(5,2)", "20"),
  N("approx", "approx(√(2))", /^1\.41421/),
  N("approximate with ctrl+enter", "1/3", /^0\.33333/, { approx: true }),
  N("▶Decimal", "1/8▶Decimal", "0.125"),
  N("▶approxFraction", "0.333333333333▶approxFraction()", "1/3"),
  N("exact surds", "√(8)", "2*√(2)"),
  N("powers of ℯ", "ln(ℯ^3)", "3"),
  N("log base", "log(8,2)", "3"),

  // Trigonometry
  T("sin (radians)", "sin(π/6)", "1/2"),
  T("cos", "cos(π/4)", "√(2)/2"),
  T("tan", "tan(π/3)", "√(3)"),
  T("arcsin", "sin⁻¹(1/2)", "π/6"),
  T("degrees (°)", "sin(30°)", "1/2"),
  T("tExpand", "tExpand(sin(2x))", "2*sin(x)*cos(x)"),
  T("tCollect", "tCollect(2*sin(x)*cos(x))", "sin(2*x)"),
  T("sinh", "sinh(0)", "0"),
  T("solve trig on an interval", "solve(2sin(x)=1,x)|0≤x≤2π", ["x=π/6 or x=5*π/6", "x=5*π/6 or x=π/6"]),

  // Complex
  X("arithmetic", "(2+3i)*(1-i)", "5+i"),
  X("real", "real(3+4i)", "3"),
  X("imag", "imag(3+4i)", "4"),
  X("conj", "conj(3+4i)", "3-4*i"),
  X("abs (modulus)", "abs(3+4i)", "5"),
  X("angle (argument)", "angle(1+i)", "π/4"),
  X("▶Polar", "1+i▶Polar", /√\(2\).*ℯ\^\(.*π.*\)|ℯ\^\(i\*π\/4\)\*√\(2\)|∠/),
  X("square root of a negative (real mode)", "√(-4)", /^Error: .*(real|Non-real)/, { error: true }),

  // Lists
  L("sum", "sum({1,2,3,4})", "10"),
  L("product", "product({1,2,3,4})", "24"),
  L("mean", "mean({2,4,6,8})", "5"),
  L("median", "median({3,1,4,1,5})", "3"),
  L("stDevSamp", "stDevSamp({2,4,4,4,5,5,7,9})", /^2\.13808|^\(4\*√\(14\)\)\/7|4\*√\(14\)\/7/),
  L("stDevPop", "stDevPop({2,4,4,4,5,5,7,9})", "2"),
  L("varSamp", "varSamp({1,2,3,4})", "5/3"),
  L("varPop", "varPop({1,2,3,4})", "5/4"),
  L("min", "min({3,1,2})", "1"),
  L("max", "max({3,1,2})", "3"),
  L("cumulativeSum", "cumulativeSum({1,2,3})", "{1,3,6}"),
  L("seq", "seq(n^2,n,1,5)", "{1,4,9,16,25}"),
  L("ΔList", "ΔList({1,4,9,16})", "{3,5,7}"),
  L("augment", "augment({1,2},{3,4})", "{1,2,3,4}"),
  L("dim", "dim({5,6,7})", "3"),
  L("left", "left({1,2,3,4},2)", "{1,2}"),
  L("mid", "mid({1,2,3,4},2,2)", "{2,3}"),
  L("SortA", "SortA {3,1,2}", "{1,2,3}"),
  L("list maths", "{1,2,3}*2", "{2,4,6}"),
  L("list▶mat", "list▶mat({1,2,3,4},2)", "[[1,2][3,4]]"),

  // Matrices & vectors
  M("det", "det([[1,2][3,4]])", "-2"),
  M("inverse", "[[1,2][3,4]]^-1", "[[-2,1][3/2,-1/2]]"),
  M("transpose", "[[1,2][3,4]]ᵀ", "[[1,3][2,4]]"),
  M("product", "[[1,2][3,4]]*[[5][6]]", "[[17][39]]"),
  M("identity", "identity(2)", "[[1,0][0,1]]"),
  M("ref", "ref([[1,2][3,4]])", "[[1,4/3][0,1]]"),
  M("rref", "rref([[1,2,5][3,4,6]])", "[[1,0,-4][0,1,9/2]]"),
  M("simult", "simult([[1,1][1,-1]],[[5][1]])", "[[3][2]]"),
  M("eigVl", "eigVl([[2,0][0,3]])", /^\{(2\.?,3\.?|3\.?,2\.?)\}$/),
  M("eigVc", "eigVc([[2,0][0,3]])", /^\[\[-?[01]\.?,-?[01]\.?\]\[-?[01]\.?,-?[01]\.?\]\]$/),
  M("charPoly", "charPoly([[1,2][3,4]],x)", "x^2-5*x-2"),
  M("trace", "trace([[1,2][3,4]])", "5"),
  M("norm", "norm([3,4])", "5"),
  M("dotP", "dotP([1,2,3],[4,5,6])", "32"),
  M("crossP", "crossP([1,0,0],[0,1,0])", "[0,0,1]"),
  M("unitV", "unitV([3,4])", "[3/5,4/5]"),
  M("rowSwap", "rowSwap([[1,2][3,4]],1,2)", "[[3,4][1,2]]"),
  M("dim", "dim([[1,2,3][4,5,6]])", "{2,3}"),
  M("diag", "diag([[1,2][3,4]])", /\[1,4\]|\{1,4\}/),
  // Partial pivoting, as the handheld factors: the 3 goes on top.
  M("LU Decomposition", "u", "[[3,4][0,2/3]]", { before: ["LU [[1,2][3,4]],l,u,p"] }),
  M("QR Decomposition", "r", "[[√(10),7*√(10)/5][0,√(10)/5]]", { before: ["QR [[1,2][3,4]],q,r"] }),
  M("Convert to Polar (vector)", "[1,1]▶Polar", "[√(2)∠π/4]"),
  M("Convert to Cylindrical", "[1,1,1]▶Cylind", "[√(2)∠π/4,1]"),
  M("Convert to Spherical", "[1,1,1]▶Sphere", /^\[√\(3\)∠π\/4∠/),

  // Probability
  P("normPdf", "normPdf(0,0,1)", /^0\.39894/),
  P("normCdf", "normCdf(-1,1,0,1)", /^0\.68268/),
  P("invNorm", "invNorm(0.975,0,1)", /^1\.95996/),
  P("binomPdf", "binomPdf(10,0.5,3)", /^0\.11718/),
  P("binomCdf", "binomCdf(10,0.5,0,3)", /^0\.17187/),
  P("invBinom", "invBinom(0.5,10,0.5)", "5"),
  P("poissPdf", "poissPdf(2,3)", /^0\.18044/),
  P("poissCdf", "poissCdf(2,0,3)", /^0\.85712/),
  P("geomPdf", "geomPdf(0.2,3)", /^0\.128/),
  P("geomCdf", "geomCdf(0.2,1,3)", /^0\.488/),
  P("tPdf", "tPdf(0,10)", /^0\.38910/),
  P("tCdf", "tCdf(-2,2,10)", /^0\.9266/),
  P("invt", "invt(0.975,10)", /^2\.2281/),
  P("χ²Pdf", "χ²Pdf(2,3)", /^0\.20755/),
  P("χ²Cdf", "χ²Cdf(0,2,3)", /^0\.42759/),
  P("invχ²", "invχ²(0.95,3)", /^7\.8147/),
  P("FPdf", "FPdf(1.5,2,10)", /^0\.20717/),
  P("FCdf", "FCdf(0,1.5,2,10)", /^0\.73067/),
  P("invF", "invF(0.95,2,10)", /^4\.1028/),

  // Statistics (results go to stat.*)
  S("One-Variable Statistics", "OneVar {1,2,3,4,5}", undefined, { before: [] }),
  S("mean from OneVar", "stat.x̄", /^3\.?$/, { before: ["OneVar {1,2,3,4,5}"] }),
  S("Linear Regression (mx+b)", "stat.m", /^2\.|^2$/, { before: ["LinRegMx {1,2,3,4},{3,5,7,9},1"] }),
  S("Median-Median Line", "stat.m", /^1\.?$/, { before: ["MedMed {1,2,3,4,5,6,7,8,9,10},{2,3,5,4,6,7,9,8,10,12},1"] }),
  S("t Interval", "stat.cupper", /^8\.8921/, { before: ["tInterval {2,3,5,4,6,7,9,8,10,12},1,0.95"] }),
  S("t Test", "stat.pval", /^0\.1487/, { before: ["tTest 5,{2,3,5,4,6,7,9,8,10,12},1,0"] }),
  S("1-Prop z Test", "stat.pval", /^0\.1572/, { before: ["zTest_1Prop 0.5,30,50,0"] }),
  // Data on y = x³ − 2x + 1 and y = x⁴ exactly: the fit is the polynomial itself.
  S("Cubic Regression", "stat.c", /^-2\.?$|^-1\.9999|^-2\.0000/, { before: ["CubicReg {0,1,2,3,4},{1,0,5,22,57},1"] }),
  S("Quartic Regression", "stat.a", /^1\.?$|^0\.9999|^1\.0000/, { before: ["QuartReg {0,1,2,3,4,5},{0,1,16,81,256,625},1"] }),
  S("Quadratic Regression", "stat.a", /^1\.?0*$|^1$/, { before: ["QuadReg {0,1,2,3},{0,1,4,9},1"] }),
  S("Exponential Regression", "stat.b", /^2\.0*|^2$/, { before: ["ExpReg {0,1,2,3},{1,2,4,8},1"] }),
  S("z Interval", "zInterval 1,{1,2,3,4,5},0.95", undefined),
  S("z Test", "zTest 0,1,{1,2,3},1,0", undefined),
  // The textbook formulas, checked by hand: χ² = 10 on 2 df has P = e^−5.
  S("2-Sample z Test", "stat.z", /^-3\.3410/, { before: ["zTest_2Samp 2,3,10,30,12,40"] }),
  S("2-Sample t Interval (pooled)", "stat.sp", /^2\.6206/, { before: ["tInterval_2Samp 10,2,30,12,3,40,0.95,1"] }),
  S("2-Prop z Test", "stat.z", /^-1\.1685/, { before: ["zTest_2Prop 30,100,45,120"] }),
  S("χ² GOF", "stat.pval", /^0\.006737/, { before: ["χ²GOF {10,20,30},{20,20,20},2"] }),
  S("χ² 2-way", "stat.χ²", /^0\.79365/, { before: ["χ²2way [[10,20][30,40]]"] }),
  S("Linear Reg t Test", "stat.t", /^33\.321/, { before: ["LinRegtTest {1,2,3,4,5},{2.1,3.9,6.2,7.8,10.1}"] }),
  S("One-way ANOVA", "stat.F", /^20\.846/, { before: ["ANOVA {1,2,3},{4,5,6},{7,8,10}"] }),
  S("Multiple Linear Regression", "stat.b1", /^2\.0333/, { before: ["MultReg {3,5,7,9,12},{1,2,3,4,5},{2,1,4,3,6}"] }),
  S("Correlation Matrix", "corrMat({1,2,3},{3,2,1})", /^\[\[1\.?,-1\.?\]\[-1\.?,1\.?\]\]$/),

  // Finance
  F("tvmFV", "tvmFV(10,5,-1000,0,1,1)", /^1628\.89/),
  F("tvmPmt", "tvmPmt(12,6,10000,0,12,12)", /^-860\.66/),
  F("tvmN", "tvmN(5,-1000,0,1276.28,1,1)", /^(5\.|4\.999)/),
  F("tvmI", "tvmI(10,-1000,0,2593.74,1,1)", /^(10\.|9\.999)/),
  F("tvmPV", "tvmPV(10,5,0,1628.89,1,1)", /^(-1000\.|-999\.99)/),
  F("bal (balance after 12 payments)", "bal(12,360,6,200000,-1199.1,0,12,12)", /^19754[34]\./),
  F("ΣInt (interest paid, year 1)", "ΣInt(1,12,360,6,200000,-1199.1,0,12,12)", /^-11933\./),
  F("ΣPrn (principal paid, year 1)", "ΣPrn(1,12,360,6,200000,-1199.1,0,12,12)", /^-24\d\d\./),
  F("nom", "nom(12.6825,12)", /^12\.0*$/),
  F("eff", "eff(12,12)", /^12\.68/),
  F("npv", "npv(10,-1000,{300,400,500})", /^-21\.036/),
  F("irr", "irr(-1000,{300,400,500})", /^8\.896/),
  F("mirr", "mirr(10,12,-1000,{300,400,500})", /^9\.815/),
  F("dbd (month first)", "dbd(12.3103,1.0104)", "1"),
  F("dbd (day first)", "dbd(101.07,106.07)", "151"),
  F("amortTbl", "amortTbl(2,360,6,200000,-1199.1,0,12,12)", /^\[\[0/),

  // Define, store and recall
  D("Define a function", "f(3)", "13", { before: ["Define f(x)=x^2+4"] }),
  D("store with →", "a+1", "6", { before: ["5→a"] }),
  D("store with :=", "b*2", "14", { before: ["b:=7"] }),
  D("piecewise", "g(-2)", "4", { before: ["Define g(x)=piecewise(x^2,x<0,x,x≥0)"] }),
  D("with operator |", "x^2+1|x=3", "10"),
  D("DelVar", "c", "c", { before: ["c:=4", "DelVar c"] }),
  D("Func with For", "s(100)", "5050", { before: ["Define s(n)=Func:Local k,t:t:=0:For k,1,n:t:=t+k:EndFor:Return t:EndFunc"] }),
  D("Func with If…ElseIf…Else", "f(2)+f(3)*10+f(1)*100", "12", { before: ["Define f(x)=Func:If x^2>4 Then:Return 1:ElseIf x^2=4 Then:Return 2:Else:Return 0:EndIf:EndFunc"] }),
  D("Func with While", "g(10)", "4", { before: ["Define g(n)=Func:Local k:k:=1:While 2^k<n:k:=k+1:EndWhile:k:EndFunc"] }),
  D("Prgm stores a result", "res", "6", { before: ["Define p(n)=Prgm:Local k:For k,1,n:Disp k:EndFor:n*2→res:EndPrgm", "p(3)"] }),
  D("Lock", "a:=6", undefined, { before: ["a:=5", "Lock a"], error: true }),
  D("getLockInfo", "getLockInfo(a)", "1", { before: ["a:=5", "Lock a"] }),
];
