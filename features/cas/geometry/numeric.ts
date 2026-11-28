// SPDX-License-Identifier: GPL-3.0-or-later
/**
 * Numbers for a Geometry page's own expressions: Calculate's text (2·a+1)
 * and Set Conditions' Show When and colour expressions (v1>0). They're
 * worked out here, as the figure moves, from the values on the page
 * (measurements, sliders) and the problem's variables the shell has read.
 * A comparison is 1 when it holds and 0 when it doesn't.
 */
import { parse, type Ast } from "../math/ast";

const FNS: Record<string, (x: number) => number> = {
  "√": Math.sqrt,
  sqrt: Math.sqrt,
  abs: Math.abs,
  ln: Math.log,
  log: Math.log10,
  exp: Math.exp,
  floor: Math.floor,
  ceiling: Math.ceil,
  round: Math.round,
  int: Math.floor,
  sign: Math.sign,
};
const TRIG: Record<string, (x: number) => number> = { sin: Math.sin, cos: Math.cos, tan: Math.tan };
const ARC: Record<string, (x: number) => number> = { "sin⁻¹": Math.asin, "cos⁻¹": Math.acos, "tan⁻¹": Math.atan, arcsin: Math.asin, arccos: Math.acos, arctan: Math.atan };

function parsed(src: string): Ast | null {
  try {
    return parse(src.replace(/·/g, "*").replace(/>=/g, "≥").replace(/<=/g, "≤").replace(/<>|\/=/g, "≠"));
  } catch {
    return null;
  }
}

/** The variable names an expression uses, in the order they first appear (Calculate asks for each in turn). */
export function freeNames(src: string): string[] {
  const a = parsed(src);
  const out: string[] = [];
  const walk = (x: Ast) => {
    switch (x.k) {
      case "sym":
        if (x.name !== "π" && x.name !== "ℯ" && x.name !== "i" && !out.includes(x.name)) out.push(x.name);
        return;
      case "call":
        x.args.forEach(walk);
        return;
      case "bin":
        walk(x.a);
        walk(x.b);
        return;
      case "neg":
      case "not":
      case "post":
        walk(x.a);
        return;
      case "list":
        x.items.forEach(walk);
        return;
      default:
        return;
    }
  };
  if (a) walk(a);
  return out;
}

/** The expression's value with these variables, NaN when it can't be worked out (an unknown name, a syntax error). deg: trig in degrees. */
export function evalNumber(src: string, vars: Record<string, number>, deg = true): number {
  const a = parsed(src);
  if (!a) return NaN;
  const toRad = deg ? Math.PI / 180 : 1;
  const ev = (x: Ast): number => {
    switch (x.k) {
      case "num":
        return Number(x.v.replace(/E/i, "e"));
      case "sym":
        if (x.name === "π") return Math.PI;
        if (x.name === "ℯ") return Math.E;
        if (x.name === "true") return 1;
        if (x.name === "false") return 0;
        return vars[x.name] ?? vars[x.name.toLowerCase()] ?? NaN;
      case "neg":
        return -ev(x.a);
      case "not":
        return ev(x.a) ? 0 : 1;
      case "post":
        if (x.op === "!") {
          const n = ev(x.a);
          let f = 1;
          for (let i = 2; i <= n; i++) f *= i;
          return Number.isInteger(n) && n >= 0 ? f : NaN;
        }
        if (x.op === "°") return ev(x.a) * (deg ? 1 : Math.PI / 180);
        if (x.op === "%") return ev(x.a) / 100;
        return NaN;
      case "bin": {
        const [p, q] = [ev(x.a), ev(x.b)];
        switch (x.op) {
          case "+":
            return p + q;
          case "-":
            return p - q;
          case "*":
            return p * q;
          case "/":
            return p / q;
          case "^":
            return p ** q;
          case "=":
            return Math.abs(p - q) < 1e-9 ? 1 : 0;
          case "≠":
            return Math.abs(p - q) >= 1e-9 ? 1 : 0;
          case "<":
            return p < q ? 1 : 0;
          case ">":
            return p > q ? 1 : 0;
          case "≤":
            return p <= q ? 1 : 0;
          case "≥":
            return p >= q ? 1 : 0;
          case "and":
            return p && q ? 1 : 0;
          case "or":
            return p || q ? 1 : 0;
          case "xor":
            return Boolean(p) !== Boolean(q) ? 1 : 0;
          default:
            return NaN;
        }
      }
      case "call": {
        const args = x.args.map(ev);
        const v = args[0] ?? NaN;
        if (FNS[x.f]) return FNS[x.f]!(v);
        if (TRIG[x.f]) return TRIG[x.f]!(v * toRad);
        if (ARC[x.f]) return ARC[x.f]!(v) / toRad;
        if (x.f === "root") return args.length > 1 ? v ** (1 / args[1]!) : Math.sqrt(v);
        if (x.f === "min") return Math.min(...args);
        if (x.f === "max") return Math.max(...args);
        if (x.f === "mod") return v - args[1]! * Math.floor(v / args[1]!);
        if (x.f === "when") return v ? (args[1] ?? NaN) : (args[2] ?? NaN);
        // A user's function or an unknown name: not worked out here.
        return NaN;
      }
      default:
        return NaN;
    }
  };
  return ev(a);
}

/** A number as the Graphs & Geometry settings show it: Float n, n significant digits (Float 3 the default), with no trailing point. */
export function geoFormat(v: number, digits = "Float 3"): string {
  if (!Number.isFinite(v)) return v > 0 ? "∞" : v < 0 ? "−∞" : "undef";
  const m = /(Float|Fix)\s*(\d+)?/.exec(digits);
  const n = m?.[2] ? Number(m[2]) : m?.[1] === "Float" ? 12 : 3;
  let s: string;
  if (m?.[1] === "Fix") s = v.toFixed(Math.min(12, n));
  else {
    const r = Number(v.toPrecision(Math.max(1, Math.min(12, n))));
    s = Math.abs(r) >= 1e12 || (r !== 0 && Math.abs(r) < 1e-6) ? r.toExponential().replace("e", "E") : String(r);
  }
  if (Math.abs(Number(s)) === 0) s = s.replace("-", "");
  return s.replace(/\.$/, "").replace("-", "−");
}
