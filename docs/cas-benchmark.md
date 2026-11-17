# Calculator benchmark

210 of 210 commands give the handheld's answer (100%).

The Calculator menu has 346 items, as the handheld's: 346 are built and 0 are greyed (not built yet).

## Menu coverage

| Menu | Built | Not built yet |
|---|---|---|
| Actions | 14 | — |
| Number | 24 | — |
| Algebra | 32 | — |
| Calculus | 21 | — |
| Probability | 29 | — |
| Statistics | 80 | — |
| Matrix & Vector | 43 | — |
| Finance | 17 | — |
| Functions & Programs | 86 | — |

## Commands

Each command is typed as a student would and run through the same `evaluate()` the page uses, on the real Giac build. Regenerate with `npm run bench`.

### Algebra (28/28)

| Command | Typed | Answer | |
|---|---|---|---|
| solve | `solve(x^2-5x+6=0,x)` | `x=2 or x=3` | ✓ |
| solve (system) | `solve(x+y=5 and x-y=1,{x,y})` | `x=3 and y=2` | ✓ |
| solve (inequality) | `solve(2x-3>5,x)` | `x>4` | ✓ |
| solve (trig, general) | `solve(sin(x)=1/2,x)` | `x=2*n1*π+π/6 or x=2*n1*π+5*π/6` | ✓ |
| factor | `factor(x^3-8)` | `(x-2)*(x^2+2*x+4)` | ✓ |
| factor (two variables) | `factor(x^2-y^2)` | `(x+y)*(x-y)` | ✓ |
| expand | `expand((x+2)^3)` | `x^3+6*x^2+12*x+8` | ✓ |
| expand (partial fractions) | `expand(1/(x^2-1),x)` | `1/(2*(x-1))-1/(2*(x+1))` | ✓ |
| zeros | `zeros(x^2-4,x)` | `{-2,2}` | ✓ |
| completeSquare | `completeSquare(x^2+6x+5,x)` | `(x+3)^2-4` | ✓ |
| nSolve | `nSolve(x^3=2x+1,x)` | `-0.618034` | ✓ |
| polyRoots | `polyRoots(x^3-6x^2+11x-6,x)` | `{1,2,3}` | ✓ |
| cPolyRoots | `cPolyRoots(x^2+1,x)` | `{i,-i}` | ✓ |
| polyRemainder | `polyRemainder(x^3+1,x+2,x)` | `-7` | ✓ |
| polyQuotient | `polyQuotient(x^3+1,x+2,x)` | `x^2-2*x+4` | ✓ |
| polyGcd | `polyGcd(x^2-1,x^2+2x+1)` | `x+1` | ✓ |
| polyCoeffs | `polyCoeffs(3x^2+2x-1,x)` | `{3,2,-1}` | ✓ |
| polyDegree | `polyDegree(3x^5+x,x)` | `5` | ✓ |
| propFrac | `propFrac((x^2+1)/(x+1),x)` | `2/(x+1)+x-1` | ✓ |
| getNum | `getNum((x+1)/(x-2))` | `x+1` | ✓ |
| getDenom | `getDenom((x+1)/(x-2))` | `x-2` | ✓ |
| comDenom | `comDenom(1/x+1/(x+1))` | `(2*x+1)/(x^2+x)` | ✓ |
| cSolve | `cSolve(x^2+1=0,x)` | `x=i or x=-i` | ✓ |
| cZeros | `cZeros(x^2+4,x)` | `{2*i,-2*i}` | ✓ |
| cFactor | `cFactor(x^2+1,x)` | `(x-i)*(x+i)` | ✓ |
| left/right of an equation | `right(y=3x+2)` | `3*x+2` | ✓ |
| ▶ln | `log(x)▶ln` | `ln(x)/(ln(10))` | ✓ |
| exact | `exact(0.25)` | `1/4` | ✓ |

### Calculus (29/29)

| Command | Typed | Answer | |
|---|---|---|---|
| derivative | `d(x^3,x)` | `3*x^2` | ✓ |
| derivative (function call form) | `derivative(x^3*sin(x),x)` | `x^3*cos(x)+3*x^2*sin(x)` | ✓ |
| 2nd derivative | `derivative(x^4,x,2)` | `12*x^2` | ✓ |
| derivative at a point | `derivative(x^3,x)\|x=2` | `12` | ✓ |
| integral (indefinite) | `∫(x^2,x)` | `x^3/3` | ✓ |
| integral (definite) | `∫(x^2,x,0,3)` | `9` | ✓ |
| integral (by parts) | `∫(x*ℯ^x,x)` | `(x-1)*ℯ^x` | ✓ |
| limit | `limit(sin(x)/x,x,0)` | `1` | ✓ |
| limit at infinity | `limit((2x+1)/(x-3),x,∞)` | `2` | ✓ |
| one-sided limit | `limit(1/x,x,0,1)` | `∞` | ✓ |
| sum (Σ) | `Σ(k^2,k,1,10)` | `385` | ✓ |
| product (Π) | `Π(k,k,1,5)` | `120` | ✓ |
| fMin (function minimum) | `fMin(x^2-4x,x)` | `x=2` | ✓ |
| fMax (function maximum) | `fMax(-x^2+6x,x)` | `x=3` | ✓ |
| fMin on an interval | `fMin(x^3-3x,x)\|0≤x≤2` | `x=1` | ✓ |
| tangentLine | `tangentLine(x^2,x,1)` | `2*x-1` | ✓ |
| normalLine | `normalLine(x^2,x,1)` | `3/2-x/2` | ✓ |
| arcLen | `arcLen(x,x,0,1)` | `√(2)` | ✓ |
| taylor | `taylor(ℯ^x,x,3)` | `1+x+x^2/2+x^3/6` | ✓ |
| series | `series(sin(x),x,5)` | `x-x^3/6+x^5/120` | ✓ |
| dominantTerm | `dominantTerm(x^3+x,x,∞)` | `x^3` | ✓ |
| deSolve | `deSolve(y'=2y,x,y)` | `y=c1*ℯ^(2*x)` | ✓ |
| deSolve (initial condition) | `deSolve(y'=2y and y(0)=3,x,y)` | `y=3*ℯ^(2*x)` | ✓ |
| impDif | `impDif(x^2+y^2=25,x,y)` | `-x/y` | ✓ |
| nDerivative | `nDerivative(x^3,x=2)` | `12.` | ✓ |
| centralDiff | `centralDiff(x^3,x=2)` | `12.` | ✓ |
| nInt | `nInt(ℯ^(-x^2),x,0,1)` | `0.746824` | ✓ |
| nfMin | `nfMin(x^2-4x,x)` | `2.` | ✓ |
| nfMax | `nfMax(-x^2+6x,x)` | `3.` | ✓ |

### Number (23/23)

| Command | Typed | Answer | |
|---|---|---|---|
| factor (integer) | `factor(360)` | `2^3*3^2*5` | ✓ |
| isPrime | `isPrime(97)` | `true` | ✓ |
| lcm | `lcm(12,18)` | `36` | ✓ |
| gcd | `gcd(12,18)` | `6` | ✓ |
| remain | `remain(17,5)` | `2` | ✓ |
| mod | `mod(-7,3)` | `2` | ✓ |
| round | `round(3.14159,2)` | `3.14` | ✓ |
| iPart | `iPart(-3.7)` | `-3.` | ✓ |
| fPart | `fPart(3.7)` | `0.7` | ✓ |
| floor | `floor(-2.5)` | `-3.` | ✓ |
| ceiling | `ceiling(2.1)` | `3.` | ✓ |
| sign | `sign(-5)` | `-1` | ✓ |
| abs | `abs(-7/2)` | `7/2` | ✓ |
| factorial | `5!` | `120` | ✓ |
| nCr | `nCr(10,3)` | `120` | ✓ |
| nPr | `nPr(5,2)` | `20` | ✓ |
| approx | `approx(√(2))` | `1.41421` | ✓ |
| approximate with ctrl+enter | `1/3` | `0.333333` | ✓ |
| ▶Decimal | `1/8▶Decimal` | `0.125` | ✓ |
| ▶approxFraction | `0.333333333333▶approxFraction()` | `1/3` | ✓ |
| exact surds | `√(8)` | `2*√(2)` | ✓ |
| powers of ℯ | `ln(ℯ^3)` | `3` | ✓ |
| log base | `log(8,2)` | `3` | ✓ |

### Trigonometry (9/9)

| Command | Typed | Answer | |
|---|---|---|---|
| sin (radians) | `sin(π/6)` | `1/2` | ✓ |
| cos | `cos(π/4)` | `√(2)/2` | ✓ |
| tan | `tan(π/3)` | `√(3)` | ✓ |
| arcsin | `sin⁻¹(1/2)` | `π/6` | ✓ |
| degrees (°) | `sin(30°)` | `1/2` | ✓ |
| tExpand | `tExpand(sin(2x))` | `2*sin(x)*cos(x)` | ✓ |
| tCollect | `tCollect(2*sin(x)*cos(x))` | `sin(2*x)` | ✓ |
| sinh | `sinh(0)` | `0` | ✓ |
| solve trig on an interval | `solve(2sin(x)=1,x)\|0≤x≤2π` | `x=π/6 or x=5*π/6` | ✓ |

### Complex (8/8)

| Command | Typed | Answer | |
|---|---|---|---|
| arithmetic | `(2+3i)*(1-i)` | `5+i` | ✓ |
| real | `real(3+4i)` | `3` | ✓ |
| imag | `imag(3+4i)` | `4` | ✓ |
| conj | `conj(3+4i)` | `3-4*i` | ✓ |
| abs (modulus) | `abs(3+4i)` | `5` | ✓ |
| angle (argument) | `angle(1+i)` | `π/4` | ✓ |
| ▶Polar | `1+i▶Polar` | `ℯ^(i*π/4)*√(2)` | ✓ |
| square root of a negative (real mode) | `√(-4)` | `Error: The result isn't a real number` | ✓ |

### Lists (20/20)

| Command | Typed | Answer | |
|---|---|---|---|
| sum | `sum({1,2,3,4})` | `10` | ✓ |
| product | `product({1,2,3,4})` | `24` | ✓ |
| mean | `mean({2,4,6,8})` | `5` | ✓ |
| median | `median({3,1,4,1,5})` | `3` | ✓ |
| stDevSamp | `stDevSamp({2,4,4,4,5,5,7,9})` | `4*√(14)/7` | ✓ |
| stDevPop | `stDevPop({2,4,4,4,5,5,7,9})` | `2` | ✓ |
| varSamp | `varSamp({1,2,3,4})` | `5/3` | ✓ |
| varPop | `varPop({1,2,3,4})` | `5/4` | ✓ |
| min | `min({3,1,2})` | `1` | ✓ |
| max | `max({3,1,2})` | `3` | ✓ |
| cumulativeSum | `cumulativeSum({1,2,3})` | `{1,3,6}` | ✓ |
| seq | `seq(n^2,n,1,5)` | `{1,4,9,16,25}` | ✓ |
| ΔList | `ΔList({1,4,9,16})` | `{3,5,7}` | ✓ |
| augment | `augment({1,2},{3,4})` | `{1,2,3,4}` | ✓ |
| dim | `dim({5,6,7})` | `3` | ✓ |
| left | `left({1,2,3,4},2)` | `{1,2}` | ✓ |
| mid | `mid({1,2,3,4},2,2)` | `{2,3}` | ✓ |
| SortA | `SortA {3,1,2}` | `{1,2,3}` | ✓ |
| list maths | `{1,2,3}*2` | `{2,4,6}` | ✓ |
| list▶mat | `list▶mat({1,2,3,4},2)` | `[[1,2][3,4]]` | ✓ |

### Matrices & Vectors (24/24)

| Command | Typed | Answer | |
|---|---|---|---|
| det | `det([[1,2][3,4]])` | `-2` | ✓ |
| inverse | `[[1,2][3,4]]^-1` | `[[-2,1][3/2,-1/2]]` | ✓ |
| transpose | `[[1,2][3,4]]ᵀ` | `[[1,3][2,4]]` | ✓ |
| product | `[[1,2][3,4]]*[[5][6]]` | `[[17][39]]` | ✓ |
| identity | `identity(2)` | `[[1,0][0,1]]` | ✓ |
| ref | `ref([[1,2][3,4]])` | `[[1,4/3][0,1]]` | ✓ |
| rref | `rref([[1,2,5][3,4,6]])` | `[[1,0,-4][0,1,9/2]]` | ✓ |
| simult | `simult([[1,1][1,-1]],[[5][1]])` | `[[3][2]]` | ✓ |
| eigVl | `eigVl([[2,0][0,3]])` | `{2.,3.}` | ✓ |
| eigVc | `eigVc([[2,0][0,3]])` | `[[0,-1][1,0]]` | ✓ |
| charPoly | `charPoly([[1,2][3,4]],x)` | `x^2-5*x-2` | ✓ |
| trace | `trace([[1,2][3,4]])` | `5` | ✓ |
| norm | `norm([3,4])` | `5` | ✓ |
| dotP | `dotP([1,2,3],[4,5,6])` | `32` | ✓ |
| crossP | `crossP([1,0,0],[0,1,0])` | `[0,0,1]` | ✓ |
| unitV | `unitV([3,4])` | `[3/5,4/5]` | ✓ |
| rowSwap | `rowSwap([[1,2][3,4]],1,2)` | `[[3,4][1,2]]` | ✓ |
| dim | `dim([[1,2,3][4,5,6]])` | `{2,3}` | ✓ |
| diag | `diag([[1,2][3,4]])` | `[1,4]` | ✓ |
| LU Decomposition | `u` | `[[3,4][0,2/3]]` | ✓ |
| QR Decomposition | `r` | `[[√(10),7*√(10)/5][0,√(10)/5]]` | ✓ |
| Convert to Polar (vector) | `[1,1]▶Polar` | `[√(2)∠π/4]` | ✓ |
| Convert to Cylindrical | `[1,1,1]▶Cylind` | `[√(2)∠π/4,1]` | ✓ |
| Convert to Spherical | `[1,1,1]▶Sphere` | `[√(3)∠π/4∠cos⁻¹(√(3)/3)]` | ✓ |

### Probability (19/19)

| Command | Typed | Answer | |
|---|---|---|---|
| normPdf | `normPdf(0,0,1)` | `0.398942` | ✓ |
| normCdf | `normCdf(-1,1,0,1)` | `0.682689` | ✓ |
| invNorm | `invNorm(0.975,0,1)` | `1.95996` | ✓ |
| binomPdf | `binomPdf(10,0.5,3)` | `0.117188` | ✓ |
| binomCdf | `binomCdf(10,0.5,0,3)` | `0.171875` | ✓ |
| invBinom | `invBinom(0.5,10,0.5)` | `5` | ✓ |
| poissPdf | `poissPdf(2,3)` | `0.180447` | ✓ |
| poissCdf | `poissCdf(2,0,3)` | `0.857123` | ✓ |
| geomPdf | `geomPdf(0.2,3)` | `0.128` | ✓ |
| geomCdf | `geomCdf(0.2,1,3)` | `0.488` | ✓ |
| tPdf | `tPdf(0,10)` | `0.389108` | ✓ |
| tCdf | `tCdf(-2,2,10)` | `0.926612` | ✓ |
| invt | `invt(0.975,10)` | `2.22814` | ✓ |
| χ²Pdf | `χ²Pdf(2,3)` | `0.207554` | ✓ |
| χ²Cdf | `χ²Cdf(0,2,3)` | `0.427593` | ✓ |
| invχ² | `invχ²(0.95,3)` | `7.81473` | ✓ |
| FPdf | `FPdf(1.5,2,10)` | `0.207176` | ✓ |
| FCdf | `FCdf(0,1.5,2,10)` | `0.730671` | ✓ |
| invF | `invF(0.95,2,10)` | `4.10282` | ✓ |

### Statistics (22/22)

| Command | Typed | Answer | |
|---|---|---|---|
| One-Variable Statistics | `OneVar {1,2,3,4,5}` | `[["Title","One-Variable Statistics"]["x̄",3.]["Σx",15.]["Σx²",55.]["sx := sₙ₋₁x",1.58114]["σx := σₙx",1.41421]["n",5.]["MinX",1.]["Q₁X",1.5]["MedianX",3.]["Q₃X",4.5]["MaxX",5.]["SSX := Σ(x-x̄)²",10.]]` | ✓ |
| mean from OneVar | `stat.x̄` | `3.` | ✓ |
| Linear Regression (mx+b) | `stat.m` | `2.` | ✓ |
| Median-Median Line | `stat.m` | `1.` | ✓ |
| t Interval | `stat.cupper` | `8.89212` | ✓ |
| t Test | `stat.pval` | `0.148774` | ✓ |
| 1-Prop z Test | `stat.pval` | `0.157299` | ✓ |
| Cubic Regression | `stat.c` | `-2.` | ✓ |
| Quartic Regression | `stat.a` | `1.` | ✓ |
| Quadratic Regression | `stat.a` | `1.` | ✓ |
| Exponential Regression | `stat.b` | `2.` | ✓ |
| z Interval | `zInterval 1,{1,2,3,4,5},0.95` | `[["Title","z Interval"]["CLower",2.10071]["CUpper",3.89929]["x̄",3.]["ME",0.899293]["sx := sₙ₋₁x",1.59164]["n",4.75]["σ",1.]]` | ✓ |
| z Test | `zTest 0,1,{1,2,3},1,0` | `[["Title","z Test"]["Alternate Hyp","μ ≠ μ0"]["z",3.4641]["PVal",5.32006E-4]["x̄",2.]["sx := sₙ₋₁x",1.]["n",3.]]` | ✓ |
| 2-Sample z Test | `stat.z` | `-3.34108` | ✓ |
| 2-Sample t Interval (pooled) | `stat.sp` | `2.62062` | ✓ |
| 2-Prop z Test | `stat.z` | `-1.16855` | ✓ |
| χ² GOF | `stat.pval` | `0.00673795` | ✓ |
| χ² 2-way | `stat.χ²` | `0.793651` | ✓ |
| Linear Reg t Test | `stat.t` | `33.3213` | ✓ |
| One-way ANOVA | `stat.F` | `20.8462` | ✓ |
| Multiple Linear Regression | `stat.b1` | `2.03333` | ✓ |
| Correlation Matrix | `corrMat({1,2,3},{3,2,1})` | `[[1.,-1.][-1.,1.]]` | ✓ |

### Finance (16/16)

| Command | Typed | Answer | |
|---|---|---|---|
| tvmFV | `tvmFV(10,5,-1000,0,1,1)` | `1628.89` | ✓ |
| tvmPmt | `tvmPmt(12,6,10000,0,12,12)` | `-860.664` | ✓ |
| tvmN | `tvmN(5,-1000,0,1276.28,1,1)` | `4.99997` | ✓ |
| tvmI | `tvmI(10,-1000,0,2593.74,1,1)` | `9.99999` | ✓ |
| tvmPV | `tvmPV(10,5,0,1628.89,1,1)` | `-999.997` | ✓ |
| bal (balance after 12 payments) | `bal(12,360,6,200000,-1199.1,0,12,12)` | `197544.` | ✓ |
| ΣInt (interest paid, year 1) | `ΣInt(1,12,360,6,200000,-1199.1,0,12,12)` | `-11933.2` | ✓ |
| ΣPrn (principal paid, year 1) | `ΣPrn(1,12,360,6,200000,-1199.1,0,12,12)` | `-2456.01` | ✓ |
| nom | `nom(12.6825,12)` | `12.` | ✓ |
| eff | `eff(12,12)` | `12.6825` | ✓ |
| npv | `npv(10,-1000,{300,400,500})` | `-21.0368` | ✓ |
| irr | `irr(-1000,{300,400,500})` | `8.89634` | ✓ |
| mirr | `mirr(10,12,-1000,{300,400,500})` | `9.81567` | ✓ |
| dbd (month first) | `dbd(12.3103,1.0104)` | `1` | ✓ |
| dbd (day first) | `dbd(101.07,106.07)` | `151` | ✓ |
| amortTbl | `amortTbl(2,360,6,200000,-1199.1,0,12,12)` | `[[0,0.,0.,200000.][1,-1000.,-199.1,199801.][2,-999.,-200.1,199601.]]` | ✓ |

### Define & variables (12/12)

| Command | Typed | Answer | |
|---|---|---|---|
| Define a function | `f(3)` | `13` | ✓ |
| store with → | `a+1` | `6` | ✓ |
| store with := | `b*2` | `14` | ✓ |
| piecewise | `g(-2)` | `4` | ✓ |
| with operator \| | `x^2+1\|x=3` | `10` | ✓ |
| DelVar | `c` | `c` | ✓ |
| Func with For | `s(100)` | `5050` | ✓ |
| Func with If…ElseIf…Else | `f(2)+f(3)*10+f(1)*100` | `12` | ✓ |
| Func with While | `g(10)` | `4` | ✓ |
| Prgm stores a result | `res` | `6` | ✓ |
| Lock | `a:=6` | `Error: Variable is locked` | ✓ |
| getLockInfo | `getLockInfo(a)` | `1` | ✓ |
