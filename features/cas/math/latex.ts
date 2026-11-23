// SPDX-License-Identifier: GPL-3.0-or-later
/**
 * Maths in other people's formats: a laid-out row (tree.ts) to LaTeX, for
 * homework write-ups, and to MathML, for screen readers and for pasting into
 * a word processor; and LaTeX back to the calculator's linear text, so maths
 * copied from a textbook, a website or an assistant's reply can be pasted
 * into the entry line.
 *
 * Both writers walk the same row the screen draws, so what's copied is what
 * the student sees: a stacked fraction, a root, an integral with its bounds.
 */
import { BUILTINS } from "./builtins";
import type { Node, Row } from "./tree";

// ---------------------------------------------------------------- reading a row

type Tok =
  | { k: "word"; text: string; fn: boolean }
  | { k: "num"; text: string; exp?: string }
  | { k: "op"; c: string }
  | { k: "quote"; text: string }
  | { k: "node"; n: Node };

const isLetter = (c: string) => /\p{L}/u.test(c) && c !== "ℯ" && c !== "π" && c !== "∞";
/** Names written as words, not italic variables. */
const WORDS = new Set(["and", "or", "xor", "not", "Define", "Func", "EndFunc", "Prgm", "EndPrgm", "Local", "Return", "If", "Then", "Else", "EndIf", "For", "EndFor", "While", "EndWhile"]);

/** The row as words, numbers, operators and laid-out nodes, as the renderer groups them. */
function scan(row: Row): Tok[] {
  const out: Tok[] = [];
  let i = 0;
  const ch = (k: number) => {
    const n = row[k];
    return n?.t === "ch" ? n.c : null;
  };
  while (i < row.length) {
    const n = row[i]!;
    if (n.t !== "ch") {
      out.push({ k: "node", n });
      i++;
      continue;
    }
    const c = n.c;
    if (c === '"') {
      let j = i + 1;
      let text = "";
      for (; j < row.length && ch(j) !== '"'; j++) text += ch(j) ?? "";
      out.push({ k: "quote", text });
      i = j + 1;
      continue;
    }
    if (/[0-9.]/.test(c)) {
      let j = i;
      let text = "";
      for (; j < row.length && /[0-9.]/.test(ch(j) ?? ""); j++) text += ch(j);
      // 1.2E-5: the handheld's exponent mark.
      let exp: string | undefined;
      if (ch(j) === "E" && /[-0-9]/.test(ch(j + 1) ?? "")) {
        let k = j + 1;
        exp = "";
        if (ch(k) === "-") {
          exp = "-";
          k++;
        }
        for (; /[0-9]/.test(ch(k) ?? ""); k++) exp += ch(k);
        j = k;
      }
      out.push({ k: "num", text, ...(exp ? { exp } : {}) });
      i = j;
      continue;
    }
    if (isLetter(c)) {
      let j = i;
      let text = "";
      for (; j < row.length; j++) {
        const m = ch(j);
        if (m === null || !(isLetter(m) || /[0-9_▶]/.test(m))) break;
        text += m;
      }
      // sin⁻¹ is one name.
      if (ch(j) === "⁻" && ch(j + 1) === "¹") {
        text += "⁻¹";
        j += 2;
      }
      const next = row[j];
      const fn = next?.t === "group" && next.open === "(" && BUILTINS.has(text.replace(/⁻¹$/, ""));
      out.push({ k: "word", text, fn });
      i = j;
      continue;
    }
    if (c === " ") {
      i++;
      continue;
    }
    out.push({ k: "op", c });
    i++;
  }
  return out;
}

// ---------------------------------------------------------------- LaTeX

const GREEK: Record<string, string> = {
  α: "alpha", β: "beta", γ: "gamma", δ: "delta", ε: "epsilon", ζ: "zeta", η: "eta", θ: "theta", ι: "iota", κ: "kappa",
  λ: "lambda", μ: "mu", ν: "nu", ξ: "xi", π: "pi", ρ: "rho", σ: "sigma", τ: "tau", υ: "upsilon", φ: "phi", χ: "chi",
  ψ: "psi", ω: "omega", Γ: "Gamma", Δ: "Delta", Θ: "Theta", Λ: "Lambda", Ξ: "Xi", Π: "Pi", Σ: "Sigma", Φ: "Phi", Ψ: "Psi", Ω: "Omega",
};
const GREEK_BACK = Object.fromEntries(Object.entries(GREEK).map(([g, n]) => [n, g]));

/** Function names LaTeX has its own command for. */
const LATEX_FNS = new Set(["sin", "cos", "tan", "csc", "sec", "cot", "sinh", "cosh", "tanh", "arcsin", "arccos", "arctan", "ln", "log", "exp", "det", "min", "max", "gcd", "lim"]);

const OPS_TEX: Record<string, string> = {
  "*": "\\cdot ",
  "≤": "\\le ",
  "≥": "\\ge ",
  "≠": "\\ne ",
  "→": "\\to ",
  "∠": "\\angle ",
  "∞": "\\infty ",
  "π": "\\pi ",
  "ℯ": "e",
  "°": "^{\\circ}",
  "%": "\\%",
  "#": "\\#",
  "&": "\\&",
  "_": "\\_",
  "{": "\\{",
  "}": "\\}",
  "~": "\\sim ",
  "▶": "\\blacktriangleright ",
  "|": "\\mid ",
};

const texText = (s: string) => s.replace(/[\\{}$&#%_^~]/g, (c) => (c === "\\" ? "\\textbackslash{}" : c === "^" || c === "~" ? `\\${c}{}` : `\\${c}`));

function texWord(w: string, fn: boolean): string {
  const inv = w.endsWith("⁻¹");
  const name = inv ? w.slice(0, -2) : w;
  let s: string;
  if (WORDS.has(name)) s = `\\text{ ${name} }`;
  else if (fn) s = LATEX_FNS.has(name) ? `\\${name}` : `\\operatorname{${texText(name)}}`;
  else if ([...name].length === 1) s = GREEK[name] ? `\\${GREEK[name]} ` : name;
  else s = `\\mathit{${texText(name)}}`;
  return inv ? `${s}^{-1}` : s;
}

/** A laid-out row as LaTeX. */
export function rowToLatex(row: Row): string {
  let out = "";
  for (const t of scan(row)) {
    switch (t.k) {
      case "word":
        out += texWord(t.text, t.fn);
        break;
      case "num":
        out += t.exp !== undefined ? `${t.text}\\times 10^{${t.exp}}` : t.text;
        break;
      case "quote":
        out += `\\text{\`\`${texText(t.text)}''}`;
        break;
      case "op":
        out += OPS_TEX[t.c] ?? (GREEK[t.c] ? `\\${GREEK[t.c]} ` : t.c);
        break;
      case "node":
        out += texNode(t.n);
        break;
    }
  }
  // A space only ends a command name; it can go before anything but a letter.
  return out.replace(/(\\[a-zA-Z]+) (?=[^a-zA-Z]|$)/g, "$1");
}

function texNode(n: Node): string {
  const t = rowToLatex;
  const fence = (open: string, close: string, body: string) => `\\left${open}${body}\\right${close}`;
  switch (n.t) {
    case "ch":
      return OPS_TEX[n.c] ?? n.c;
    case "frac":
      return `\\frac{${t(n.num)}}{${t(n.den)}}`;
    case "sup":
      return `^{${t(n.exp)}}`;
    case "sqrt":
      return `\\sqrt{${t(n.arg)}}`;
    case "root":
      return `\\sqrt[${t(n.idx)}]{${t(n.arg)}}`;
    case "group":
      if (n.open === "(") return fence("(", ")", t(n.arg));
      if (n.open === "[") return fence("[", "]", t(n.arg));
      if (n.open === "{") return fence("\\{", "\\}", t(n.arg));
      return fence("|", "|", t(n.arg));
    case "matrix":
      return `\\begin{bmatrix}${n.cells.map((r) => r.map(t).join(" & ")).join(" \\\\ ")}\\end{bmatrix}`;
    case "piecewise":
      return `\\begin{cases}${n.rows.map(([e, c]) => (c.length ? `${t(e)} & ${t(c)}` : `${t(e)} & \\text{otherwise}`)).join(" \\\\ ")}\\end{cases}`;
    case "system":
      return `\\begin{cases}${n.rows.map(t).join(" \\\\ ")}\\end{cases}`;
    case "integral": {
      const bounds = n.lo?.length && n.hi?.length ? `_{${t(n.lo)}}^{${t(n.hi)}}` : "";
      return `\\int${bounds} ${t(n.body)}\\,\\mathrm{d}${t(n.v)}`;
    }
    case "deriv": {
      const k = n.n?.length ? `^{${t(n.n)}}` : "";
      return `\\frac{\\mathrm{d}${k}}{\\mathrm{d}${t(n.v)}${k}}${fence("(", ")", t(n.body))}`;
    }
    case "bigop":
      return `\\${n.op === "Σ" ? "sum" : "prod"}_{${t(n.v)}=${t(n.lo)}}^{${t(n.hi)}}${fence("(", ")", t(n.body))}`;
    case "limit": {
      const dir = n.dir?.length ? (rowToLinear0(n.dir).startsWith("-") ? "^{-}" : "^{+}") : "";
      return `\\lim_{${t(n.v)}\\to ${t(n.to)}${dir}}${fence("(", ")", t(n.body))}`;
    }
    case "logbase":
      return `\\log_{${t(n.base)}}${fence("(", ")", t(n.arg))}`;
    case "exp":
      return `e^{${t(n.exp)}}`;
  }
}

/** The plain characters of a row (enough to read a limit's direction). */
const rowToLinear0 = (row: Row) => row.map((n) => (n.t === "ch" ? n.c : "")).join("");

// ---------------------------------------------------------------- MathML

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const mo = (c: string) => `<mo>${esc(c)}</mo>`;
const mrow = (s: string) => `<mrow>${s}</mrow>`;

const OPS_ML: Record<string, string> = { "*": "·", "-": "−", "ℯ": "e" };

/** A laid-out row as MathML, wrapped in its <math> element. */
export function rowToMathML(row: Row, display = false): string {
  return `<math xmlns="http://www.w3.org/1998/Math/MathML"${display ? ' display="block"' : ""}>${mlRow(row)}</math>`;
}

function mlRow(row: Row): string {
  const parts: string[] = [];
  for (const t of scan(row)) {
    switch (t.k) {
      case "word": {
        const inv = t.text.endsWith("⁻¹");
        const name = inv ? t.text.slice(0, -2) : t.text;
        const single = [...name].length === 1;
        let el = WORDS.has(name) ? `<mtext>&#xA0;${esc(name)}&#xA0;</mtext>` : t.fn || !single ? `<mi${t.fn ? "" : ' mathvariant="italic"'}>${esc(name)}</mi>` : `<mi>${esc(name)}</mi>`;
        if (inv) el = `<msup>${el}<mrow><mo>−</mo><mn>1</mn></mrow></msup>`;
        parts.push(t.fn ? `${el}<mo>&#x2061;</mo>` : el);
        break;
      }
      case "num":
        parts.push(t.exp !== undefined ? `<mn>${t.text}</mn><mo>×</mo><msup><mn>10</mn><mn>${esc(t.exp.replace("-", "−"))}</mn></msup>` : `<mn>${t.text}</mn>`);
        break;
      case "quote":
        parts.push(`<ms>${esc(t.text)}</ms>`);
        break;
      case "op":
        parts.push(t.c === "π" || t.c === "∞" || t.c === "ℯ" || GREEK[t.c] ? `<mi>${esc(OPS_ML[t.c] ?? t.c)}</mi>` : mo(OPS_ML[t.c] ?? t.c));
        break;
      case "node":
        if (t.n.t === "sup") {
          // A power takes what came before it as its base.
          const base = parts.pop() ?? "<mrow/>";
          parts.push(`<msup>${mrow(base)}${mrow(mlRow(t.n.exp))}</msup>`);
        } else parts.push(mlNode(t.n));
        break;
    }
  }
  return parts.join("");
}

function mlNode(n: Node): string {
  const r = (x: Row) => mrow(mlRow(x));
  const fenced = (open: string, close: string, body: string) => mrow(`${mo(open)}${body}${mo(close)}`);
  const table = (rows: string[][]) => `<mtable>${rows.map((cells) => `<mtr>${cells.map((c) => `<mtd>${c}</mtd>`).join("")}</mtr>`).join("")}</mtable>`;
  switch (n.t) {
    case "ch":
      return mo(n.c);
    case "frac":
      return `<mfrac>${r(n.num)}${r(n.den)}</mfrac>`;
    case "sup":
      return `<msup><mrow/>${r(n.exp)}</msup>`;
    case "sqrt":
      return `<msqrt>${mlRow(n.arg)}</msqrt>`;
    case "root":
      return `<mroot>${r(n.arg)}${r(n.idx)}</mroot>`;
    case "group": {
      const close = { "(": ")", "[": "]", "{": "}", "|": "|" }[n.open];
      return fenced(n.open, close, mlRow(n.arg));
    }
    case "matrix":
      return fenced("[", "]", table(n.cells.map((row) => row.map(mlRow))));
    case "piecewise":
      return mrow(`${mo("{")}${table(n.rows.map(([e, c]) => [mlRow(e), c.length ? mlRow(c) : "<mtext>otherwise</mtext>"]))}`);
    case "system":
      return mrow(`${mo("{")}${table(n.rows.map((row) => [mlRow(row)]))}`);
    case "integral": {
      const sign = n.lo?.length && n.hi?.length ? `<msubsup><mo>∫</mo>${r(n.lo)}${r(n.hi)}</msubsup>` : mo("∫");
      return mrow(`${sign}${mlRow(n.body)}<mo>&#x2062;</mo><mi>d</mi>${mlRow(n.v)}`);
    }
    case "deriv": {
      const k = n.n?.length ? r(n.n) : "";
      const top = k ? `<msup><mi>d</mi>${k}</msup>` : "<mi>d</mi>";
      const bottom = k ? mrow(`<mi>d</mi><msup>${r(n.v)}${k}</msup>`) : mrow(`<mi>d</mi>${mlRow(n.v)}`);
      return mrow(`<mfrac>${top}${bottom}</mfrac>${fenced("(", ")", mlRow(n.body))}`);
    }
    case "bigop":
      return mrow(`<munderover><mo>${n.op === "Σ" ? "∑" : "∏"}</mo>${mrow(`${mlRow(n.v)}<mo>=</mo>${mlRow(n.lo)}`)}${r(n.hi)}</munderover>${fenced("(", ")", mlRow(n.body))}`);
    case "limit": {
      const dir = n.dir?.length ? `<msup>${r(n.to)}<mo>${rowToLinear0(n.dir).startsWith("-") ? "−" : "+"}</mo></msup>` : mlRow(n.to);
      return mrow(`<munder><mi>lim</mi>${mrow(`${mlRow(n.v)}<mo>→</mo>${dir}`)}</munder>${fenced("(", ")", mlRow(n.body))}`);
    }
    case "logbase":
      return mrow(`<msub><mi>log</mi>${r(n.base)}</msub><mo>&#x2061;</mo>${fenced("(", ")", mlRow(n.arg))}`);
    case "exp":
      return `<msup><mi>e</mi>${r(n.exp)}</msup>`;
  }
}

// ---------------------------------------------------------------- LaTeX → linear text

/** Whether pasted text is LaTeX rather than the calculator's own syntax. */
export function looksLikeLatex(text: string): boolean {
  const s = text.trim();
  return /\\[a-zA-Z]+|\\[,;!{}]|[\^_]\{/.test(s) || /^\$.*\$$/.test(s);
}

const FN_NAMES = new Set(["sin", "cos", "tan", "csc", "sec", "cot", "sinh", "cosh", "tanh", "arcsin", "arccos", "arctan", "ln", "log", "exp", "det", "min", "max", "gcd", "lcm"]);
const SYMBOLS: Record<string, string> = {
  cdot: "*", times: "*", div: "/", ast: "*",
  le: "≤", leq: "≤", leqslant: "≤", ge: "≥", geq: "≥", geqslant: "≥", ne: "≠", neq: "≠", lt: "<", gt: ">",
  to: "→", rightarrow: "→", infty: "∞", degree: "°", circ: "°", angle: "∠", land: " and ", wedge: " and ", lor: " or ", vee: " or ", neg: "not ", lnot: "not ",
  "%": "%", "{": "{", "}": "}", "#": "#", "&": "&", _: "_", pm: "±", mp: "∓",
};
const IGNORED = new Set(["left", "right", "big", "Big", "bigg", "Bigg", "bigl", "bigr", "Bigl", "Bigr", "displaystyle", "textstyle", "limits", "nolimits", "quad", "qquad", ",", ";", ":", "!", " ", "middle"]);

/**
 * LaTeX to the calculator's linear text: \frac{a}{b} → (a)/(b), \sqrt[3]{x} →
 * root(x,3), \int_0^1 x^2\,dx → ∫(x^2,x,0,1). Letters side by side are a
 * product in LaTeX (ab = a·b), where the calculator would read one name, so
 * they're joined with *. Throws on LaTeX it can't read.
 */
export function latexToLinear(src: string): string {
  let s = src.trim();
  s = s.replace(/^\$\$([\s\S]*)\$\$$/, "$1").replace(/^\$([\s\S]*)\$$/, "$1").replace(/^\\\(([\s\S]*)\\\)$/, "$1").replace(/^\\\[([\s\S]*)\\\]$/, "$1");
  const p = new TexParser(s);
  const out = p.seq(() => false);
  if (!p.done()) throw new Error(`Couldn't read the LaTeX at "${s.slice(p.i, p.i + 12)}"`);
  return out.text;
}

/** A stretch of output and what kind of thing it ends with, to know where × goes. */
type Piece = { text: string; first: Kind; last: Kind };
type Kind = "var" | "fnvar" | "num" | "close" | "open" | "op" | "fn" | "none";

class TexParser {
  i = 0;
  constructor(readonly s: string) {}

  done() {
    this.skipSpace();
    return this.i >= this.s.length;
  }
  skipSpace() {
    for (;;) {
      while (this.i < this.s.length && /\s/.test(this.s[this.i]!)) this.i++;
      // Spacing commands: \, \; \! \quad … and \left / \right (the bracket after them is read as usual).
      const m = /^\\([,;:! ]|[a-zA-Z]+)/.exec(this.s.slice(this.i));
      if (m && IGNORED.has(m[1]!)) {
        this.i += m[0].length;
        // \left. and \right. are invisible brackets.
        if ((m[1] === "left" || m[1] === "right") && /^\s*\./.test(this.s.slice(this.i))) this.i = this.s.indexOf(".", this.i) + 1;
        continue;
      }
      if (this.s[this.i] === "~") {
        this.i++;
        continue;
      }
      return;
    }
  }
  peek() {
    this.skipSpace();
    return this.s[this.i];
  }
  /** The command at the cursor (\frac → "frac"), without moving. */
  command(): string | null {
    this.skipSpace();
    const m = /^\\([a-zA-Z]+|.)/.exec(this.s.slice(this.i));
    return m ? m[1]! : null;
  }
  take(cmd: string) {
    this.skipSpace();
    this.i += cmd.length + 1;
  }
  /** A {…} argument, or a single character or command when there are no braces (\frac12). */
  arg(): string {
    this.skipSpace();
    if (this.s[this.i] === "{") {
      this.i++;
      const out = this.seq(() => this.s[this.i] === "}").text;
      this.expect("}");
      return out;
    }
    // Without braces an argument is one token, as in LaTeX: x^12 is x^{1}2, \int_0^1 has bounds 0 and 1.
    const c = this.s[this.i];
    if (c !== undefined && /[0-9a-zA-Z]/.test(c)) {
      this.i++;
      return c === "e" ? "ℯ" : c;
    }
    const m = /^\\([a-zA-Z]+)/.exec(this.s.slice(this.i));
    if (m && (GREEK_BACK[m[1]!] || m[1] === "infty")) {
      this.i += m[0].length;
      return m[1] === "infty" ? "∞" : GREEK_BACK[m[1]!]!;
    }
    const a = this.atom();
    if (!a) throw new Error("Expected an argument");
    return a.text;
  }
  /** Raw text of a {…} argument, for names in \text{} and \operatorname{}. */
  rawArg(): string {
    this.skipSpace();
    if (this.s[this.i] !== "{") return this.s[this.i++] ?? "";
    let depth = 0;
    const start = this.i;
    for (; this.i < this.s.length; this.i++) {
      if (this.s[this.i] === "{") depth++;
      else if (this.s[this.i] === "}" && --depth === 0) break;
    }
    const raw = this.s.slice(start + 1, this.i);
    this.i++;
    return raw;
  }
  expect(c: string) {
    this.skipSpace();
    if (this.s[this.i] !== c) throw new Error(`Expected "${c}"`);
    this.i++;
  }
  /** Optional _{…} and ^{…}, in either order. */
  limits(): { lo?: string; hi?: string } {
    const out: { lo?: string; hi?: string } = {};
    for (let k = 0; k < 2; k++) {
      const c = this.peek();
      if (c === "_" && out.lo === undefined) {
        this.i++;
        out.lo = this.arg();
      } else if (c === "^" && out.hi === undefined) {
        this.i++;
        out.hi = this.arg();
      }
    }
    return out;
  }

  /** A sequence of atoms up to `stop` (or a closing bracket), with × put in where LaTeX's juxtaposition means a product. */
  seq(stop: () => boolean, term = false): Piece {
    let text = "";
    let first: Kind = "none";
    let last: Kind = "none";
    while (!this.done() && !stop()) {
      const c = this.peek()!;
      if (c === "}" || c === ")" || c === "]" || c === "&") break;
      if (this.s.startsWith("\\\\", this.i)) break;
      const cmd = this.command();
      if (cmd === "right" || cmd === "end" || cmd === "}" || cmd === "rbrace") break;
      if (term && (c === "+" || c === "-" || c === "=" || c === "<" || c === ">" || c === "," || ["le", "leq", "ge", "geq", "ne", "neq", "to"].includes(cmd ?? ""))) break;
      const a = this.atom();
      if (!a) break;
      if (needsTimes(last, a.first)) text += "*";
      text += a.text;
      if (first === "none") first = a.first;
      last = a.last;
    }
    return { text, first, last };
  }

  atom(): Piece | null {
    const c = this.peek();
    if (c === undefined) return null;
    const one = (text: string, kind: Kind): Piece => ({ text, first: kind, last: kind });
    const withPower = (p: Piece): Piece => {
      let out = p;
      for (;;) {
        const n = this.peek();
        if (n === "^") {
          this.i++;
          // ^\circ is degrees.
          if (this.command() === "circ") {
            this.take("circ");
            out = { ...out, text: `${out.text}°`, last: "close" };
            continue;
          }
          const e = this.arg();
          out = { ...out, text: `${out.text}^${simple(e) ? e : `(${e})`}`, last: "close" };
        } else if (n === "_") {
          // x_1 → x1: the calculator has no subscripts, but x1 is a name.
          this.i++;
          const sub = this.arg();
          out = { ...out, text: `${out.text}${sub.replace(/[^\p{L}\p{N}]/gu, "")}`, last: out.last };
        } else if (n === "'" ) {
          this.i++;
          out = { ...out, text: `${out.text}'` };
        } else if (n === "!") {
          this.i++;
          out = { ...out, text: `${out.text}!`, last: "close" };
        } else return out;
      }
    };
    if (/[0-9.]/.test(c)) {
      const m = /^[0-9]*\.?[0-9]+|^[0-9]+\.?/.exec(this.s.slice(this.i))!;
      this.i += m[0].length;
      return withPower(one(m[0], "num"));
    }
    if (/[a-zA-Z]/.test(c)) {
      this.i++;
      // e on its own is Euler's number in written maths; the calculator's is ℯ.
      if (c === "e") return withPower(one("ℯ", "var"));
      return withPower(one(c, /[fgh]/.test(c) ? "fnvar" : "var"));
    }
    if (c === "(" || c === "[") {
      const close = c === "(" ? ")" : "]";
      this.i++;
      const inner = this.seq(() => false);
      this.expect(close);
      return withPower({ text: `${c}${inner.text}${close}`, first: "open", last: "close" });
    }
    if (c === "|") {
      // |x| from \left| … \right|: an absolute value. A lone | is the calculator's "with".
      this.i++;
      const save = this.i;
      try {
        const inner = this.seq(() => this.peek() === "|");
        if (this.peek() === "|") {
          this.i++;
          return withPower({ text: `abs(${inner.text})`, first: "fn", last: "close" });
        }
      } catch {
        /* not a pair */
      }
      this.i = save;
      return one("|", "op");
    }
    if (c === "{") {
      this.i++;
      const inner = this.seq(() => false);
      this.expect("}");
      if (!inner.text) return one("", "none");
      return withPower(simple(inner.text) ? { ...inner } : { text: `(${inner.text})`, first: "open", last: "close" });
    }
    if (c === "\\") return this.commandAtom(withPower);
    if ("+-=<>,*/:;".includes(c)) {
      this.i++;
      return one(c === ";" ? "," : c, "op");
    }
    if (c === "'") {
      this.i++;
      return one("'", "close");
    }
    if (c === "!") {
      this.i++;
      return one("!", "close");
    }
    // Unicode maths pasted as is: π, ≤, √ …
    this.i++;
    return withPower(one(c, /\p{L}/u.test(c) ? "var" : "op"));
  }

  commandAtom(withPower: (p: Piece) => Piece): Piece | null {
    const cmd = this.command()!;
    const one = (text: string, kind: Kind): Piece => ({ text, first: kind, last: kind });
    if (this.s.startsWith("\\\\", this.i)) return null;
    this.take(cmd);
    if (cmd === "frac" || cmd === "dfrac" || cmd === "tfrac" || cmd === "cfrac") {
      const num = this.arg();
      const den = this.arg();
      // d/dx (…) and d²/dx² (…): a derivative of what follows.
      const dm = /^(?:d|\\mathrm\{d\}|\\operatorname\{d\})(?:\^\(?(\d+)\)?)?$/.exec(num.replace(/\s/g, ""));
      const vm = /^d\*?([a-zA-Z])(?:\^\(?(\d+)\)?)?$/.exec(den.replace(/\s/g, ""));
      if (dm && vm) {
        const body = this.seq(() => false, true);
        const n = dm[1] ?? vm[2];
        return one(n && n !== "1" ? `d(${body.text},${vm[1]},${n})` : `d(${body.text},${vm[1]})`, "close");
      }
      return withPower({ text: `${simple(num) ? num : `(${num})`}/${simple(den) ? den : `(${den})`}`, first: simple(num) ? "num" : "open", last: "close" });
    }
    if (cmd === "sqrt") {
      let idx: string | null = null;
      if (this.peek() === "[") {
        this.i++;
        idx = this.seq(() => this.s[this.i] === "]").text;
        this.expect("]");
      }
      const a = this.arg();
      return withPower(one(idx ? `root(${a},${idx})` : `√(${a})`, "close"));
    }
    if (cmd === "text" || cmd === "mathrm" || cmd === "operatorname" || cmd === "mathit" || cmd === "textit" || cmd === "mathbf" || cmd === "boldsymbol" || cmd === "mbox") {
      const raw = this.rawArg().trim();
      if (raw === "d") return one("d", "var");
      if (raw === "e") return withPower(one("ℯ", "var"));
      const word = raw.replace(/\\/g, "");
      if (/^(and|or|xor|not)$/.test(word)) return one(` ${word} `, "op");
      if (/^(if|otherwise|else|when|for)?$/.test(word)) return one("", "none");
      return withPower(one(word, cmd === "operatorname" ? "fnvar" : "var"));
    }
    if (cmd === "left" || cmd === "right") return one("", "none");
    if (cmd === "{" || cmd === "lbrace") {
      const inner = this.seq(() => false);
      if (this.command() === "}" || this.command() === "rbrace") this.take(this.command()!);
      return withPower({ text: `{${inner.text}}`, first: "open", last: "close" });
    }
    if (cmd === "lvert" || cmd === "vert" || cmd === "lVert" || cmd === "|") {
      const inner = this.seq(() => ["rvert", "vert", "rVert", "|"].includes(this.command() ?? "") || this.peek() === "|");
      if (this.peek() === "|") this.i++;
      else this.take(this.command()!);
      return withPower({ text: `${cmd === "lVert" || cmd === "|" ? "norm" : "abs"}(${inner.text})`, first: "fn", last: "close" });
    }
    if (cmd === "langle") return one("(", "open");
    if (cmd === "rangle") return one(")", "close");
    if (FN_NAMES.has(cmd)) {
      // \sin^{-1} → sin⁻¹; \sin^2 x → (sin(x))^2; \log_b x → log(x,b).
      let power: string | null = null;
      let base: string | null = null;
      for (let k = 0; k < 2; k++) {
        if (this.peek() === "^") {
          this.i++;
          power = this.arg();
        } else if (this.peek() === "_") {
          this.i++;
          base = this.arg();
        }
      }
      const name = power === "-1" && /^(sin|cos|tan|csc|sec|cot|sinh|cosh|tanh)$/.test(cmd) ? `${cmd}⁻¹` : cmd;
      let arg: string;
      if (this.peek() === "(") {
        this.i++;
        arg = this.seq(() => false).text;
        this.expect(")");
      } else arg = this.seq(() => this.command() !== null && FN_NAMES.has(this.command()!), true).text;
      const call = cmd === "log" && base ? `log(${arg},${base})` : `${name}(${arg})`;
      return withPower(power && name === cmd ? one(`(${call})^${simple(power) ? power : `(${power})`}`, "close") : { text: call, first: "fn", last: "close" });
    }
    if (cmd === "int" || cmd === "iint") {
      const { lo, hi } = this.limits();
      const body = this.seq(() => this.atDifferential());
      const v = this.differential();
      if (!v) throw new Error("An integral needs its dx");
      return one(lo !== undefined && hi !== undefined ? `∫(${body.text},${v},${lo},${hi})` : `∫(${body.text},${v})`, "close");
    }
    if (cmd === "sum" || cmd === "prod") {
      const { lo, hi } = this.limits();
      const m = /^([a-zA-Z]\w*)=(.+)$/.exec(lo ?? "");
      if (!m || hi === undefined) throw new Error(`\\${cmd} needs its bounds, as \\${cmd}_{k=1}^{n}`);
      const body = this.seq(() => false, true);
      return one(`${cmd === "sum" ? "Σ" : "Π"}(${body.text},${m[1]},${m[2]},${hi})`, "close");
    }
    if (cmd === "lim") {
      const { lo } = this.limits();
      const m = /^([a-zA-Z]\w*)(?:→|->)(.+?)(\^?[+-])?$/.exec((lo ?? "").replace(/\s/g, ""));
      if (!m) throw new Error("\\lim needs where the variable goes, as \\lim_{x\\to 0}");
      const body = this.seq(() => false, true);
      const to = m[2]!.replace(/\^\(?([+-])\)?$/, "");
      const dir = m[3] ? (m[3].endsWith("-") ? ",-1" : ",1") : /\^\(?[+]\)?$/.test(m[2]!) ? ",1" : /\^\(?-\)?$/.test(m[2]!) ? ",-1" : "";
      return one(`limit(${body.text},${m[1]},${to}${dir})`, "close");
    }
    if (cmd === "begin") {
      const env = this.rawArg();
      const rows: string[][] = [];
      let cells: string[] = [];
      for (;;) {
        cells.push(this.seq(() => false).text);
        if (this.peek() === "&") {
          this.i++;
          continue;
        }
        if (this.s.startsWith("\\\\", this.i)) {
          this.i += 2;
          rows.push(cells);
          cells = [];
          continue;
        }
        if (this.command() === "end") {
          this.take("end");
          this.rawArg();
          break;
        }
        throw new Error(`Couldn't read the ${env}`);
      }
      if (cells.some((c) => c)) rows.push(cells);
      if (env === "cases") {
        const args = rows.flatMap(([e, c]) => (c ? [e ?? "", c] : [e ?? ""]));
        return one(`piecewise(${args.join(",")})`, "close");
      }
      const mat = rows.length === 1 ? `[${rows[0]!.join(",")}]` : `[${rows.map((r) => `[${r.join(",")}]`).join("")}]`;
      return one(env === "vmatrix" ? `det(${mat})` : mat, "close");
    }
    if (GREEK_BACK[cmd]) return withPower(one(GREEK_BACK[cmd]!, "var"));
    if (cmd === "varepsilon") return withPower(one("ε", "var"));
    if (cmd === "vartheta") return withPower(one("θ", "var"));
    if (cmd === "varphi") return withPower(one("φ", "var"));
    if (SYMBOLS[cmd] !== undefined) {
      const sym = SYMBOLS[cmd]!;
      return withPower(one(sym, sym === "∞" ? "var" : sym === "°" ? "close" : "op"));
    }
    if (cmd === "infty") return one("∞", "var");
    throw new Error(`The calculator has no \\${cmd}`);
  }

  /** At an integral's dx: d (or \mathrm{d}) and one letter, then the end of the term. */
  atDifferential(): boolean {
    const rest = this.s.slice(this.i).replace(/^\s+/, "");
    return /^(?:d|\\mathrm\{d\}|\\operatorname\{d\}|\\text\{d\}|\\,d)\s*[a-zA-Z](?![a-zA-Z])/.test(rest);
  }
  differential(): string | null {
    this.skipSpace();
    const m = /^(?:d|\\mathrm\{d\}|\\operatorname\{d\}|\\text\{d\})\s*([a-zA-Z])/.exec(this.s.slice(this.i));
    if (!m) return null;
    this.i += m[0].length;
    return m[1]!;
  }
}

/** A name, number or call that needs no brackets as a power or a fraction's part. */
const simple = (s: string) =>
  /^[0-9.]+$/.test(s) || /^\p{L}[\p{L}\p{N}]*$/u.test(s) || s === "∞" || /^(?:\p{L}[\p{L}\p{N}⁻¹]*|√)\([^()]*\)$/u.test(s);

/** Juxtaposition in LaTeX is a product; the calculator needs * where it would read a name or a call instead. */
function needsTimes(prev: Kind, next: Kind): boolean {
  if (prev === "none" || prev === "op" || prev === "open" || next === "op" || next === "none") return false;
  // f(x): a function's name and its bracket.
  if (prev === "fnvar" && next === "open") return false;
  if (prev === "num" && (next === "var" || next === "fnvar" || next === "open" || next === "fn")) return false;
  return true;
}

/**
 * Text pasted into the calculator: on one line, and LaTeX turned into the
 * calculator's own syntax. LaTeX it can't read is pasted as it came, so the
 * student can fix it by hand.
 */
export function fromPaste(raw: string): string {
  const text = raw.replace(/\s+/g, " ").trim();
  if (!looksLikeLatex(text)) return text;
  try {
    return latexToLinear(text);
  } catch {
    return text;
  }
}
