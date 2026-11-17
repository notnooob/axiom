// SPDX-License-Identifier: GPL-3.0-or-later
/**
 * Defining and running functions and programs (program.ts) for one entry:
 * Define f(x)=Func … EndFunc, Define p()=Prgm … EndPrgm, and p(…) to run
 * a program, with what it Disps shown above "Done".
 */
import { isCommand, parse, sym, type Ast } from "../math/ast";
import { print } from "../math/print";
import type { EvalResult, Giac, Settings } from "./evaluate";
import {
  compileFunc,
  compileProgram,
  decodeSource,
  definitionText,
  encodeSource,
  ProgramError,
  readDefinition,
  runProgram,
  sourceVar,
  splitArgs,
  splitLines,
  type Definition,
} from "./program";
import { giacName, translate } from "./translate";

/** What a program can ask of the student while it runs. */
export type ProgramIO = {
  request?(prompt: string, text: boolean): Promise<string | null>;
  message?(text: string): Promise<void>;
};

type Opts = { settings: Settings; ans?: Ast; io?: ProgramIO; inner?: boolean };
type Evaluate = (text: string, giac: Giac, opts: Opts) => Promise<EvalResult>;

const fail = (e: unknown, input?: Ast): EvalResult => {
  const message = e instanceof Error ? e.message : String(e);
  return { ok: false, ...(input ? { input } : {}), error: message.startsWith("Error") ? message : "Error: Invalid input" };
};

/** A Define of a function or program, or a call to a program; null for any other entry. */
export async function programEntry(text: string, giac: Giac, opts: Opts, evaluate: Evaluate): Promise<EvalResult | null> {
  let def: Definition | null;
  try {
    def = readDefinition(text);
  } catch (e) {
    return fail(e, sym(text.trim()));
  }
  if (def) {
    const locked = await lockedNames(giac);
    if (locked.has(def.name)) return { ok: false, input: sym(text.trim()), error: "Error: Variable is locked" };
    return define(def, giac, opts.settings);
  }
  if (!opts.inner) {
    const guarded = await lockCommand(text, giac, opts, evaluate);
    if (guarded) return guarded;
  }
  const modes = await modeCommand(text, opts.settings, giac, opts, evaluate);
  if (modes) return modes;
  // Disp, Text, Request … typed on their own run as a one-line program, as the handheld allows.
  if (/^\s*(Disp|DispAt|Text|Request|RequestStr|Wait|Send|Get|GetStr|RefreshProbeVars)\b/i.test(text))
    return execute({ kind: "Prgm", params: [], lines: splitLines(text) }, [], sym(text.trim()), giac, opts, evaluate);
  const call = /^\s*([A-Za-zÀ-￿][\w.À-￿]*)\s*\(([\s\S]*)\)\s*$/.exec(text);
  if (!call || isCommand(call[1]!)) return null;
  const name = call[1]!.toLowerCase();
  const source = decodeSource(await giac(sourceVar(name)));
  if (!source) return null;
  const prog = readDefinition(source);
  if (!prog || prog.kind !== "Prgm") return null;
  const input: Ast = (() => {
    try {
      return parse(text);
    } catch {
      return sym(text.trim());
    }
  })();
  return execute(prog, splitArgs(call[2]!), input, giac, opts, evaluate);
}

async function execute(
  prog: Pick<Definition, "params" | "lines" | "kind">,
  args: string[],
  input: Ast,
  giac: Giac,
  opts: Opts,
  evaluate: Evaluate,
): Promise<EvalResult> {
  let temps: string[] = [];
  try {
    const compiled = compileProgram(prog.lines);
    let settings = opts.settings;
    const r = await runProgram(compiled, prog.params, args, {
      run: async (line) => {
        const res = await evaluate(line, giac, { settings, ans: opts.ans, io: opts.io });
        if (!res.ok) throw new ProgramError(res.error);
        if (res.settings) settings = res.settings;
        return { output: res.output, outputText: res.outputText, definitions: [...(res.definitions ?? []), ...(res.definition ? [res.definition] : [])] };
      },
      request: opts.io?.request,
      message: opts.io?.message,
    });
    temps = r.temps;
    return {
      ok: true,
      input,
      output: sym("Done"),
      outputText: "Done",
      definitions: r.definitions,
      ...(r.display.length ? { display: r.display } : {}),
    };
  } catch (e) {
    return fail(e, input);
  } finally {
    if (temps.length) await giac(`purge(${temps.join(",")})`).catch(() => "");
  }
}

/** Define …=Func compiles to a Giac function; Define …=Prgm keeps the program's lines. Both keep the source as typed. */
async function define(def: Definition, giac: Giac, settings: Settings): Promise<EvalResult> {
  const shown = definitionText(def);
  const input = sym(shown);
  if (isCommand(def.name)) return { ok: false, input, error: "Error: Reserved name" };
  const source = `${sourceVar(def.name)}:="${encodeSource(shown)}"`;
  const definitions: string[] = [];
  try {
    if (def.kind === "Func") {
      const body = compileFunc(def.lines, (a) => translate(a, settings).giac);
      const code = `${giacName(def.name)}(${def.params.map(giacName).join(",")}):=${body}`;
      const out = await giac(code);
      if (/error/i.test(out)) return { ok: false, input, error: "Error: Invalid in a Func...EndFunc block" };
      definitions.push(code);
    } else {
      compileProgram(def.lines);
      // A program isn't a value: a function of the same name goes.
      const purge = `purge(${giacName(def.name)})`;
      await giac(purge);
      definitions.push(purge);
    }
    await giac(source);
    definitions.push(source);
  } catch (e) {
    return fail(e, input);
  }
  return { ok: true, input, output: sym("Done"), outputText: "Done", definitions };
}

/** The definition of a function or program as typed (for Recall Definition and the Program Editor), or null. */
export async function recallSource(name: string, giac: Giac): Promise<string | null> {
  return decodeSource(await giac(sourceVar(name.toLowerCase())));
}

/**
 * The Mode commands' numbers, as the handheld's setMode and getMode take
 * them: each setting's number, then its values from 1. Only the values the
 * document settings here can hold are accepted.
 */
const MODES: { name: string; values: string[] }[] = [
  { name: "Display Digits", values: ["Float", ...Array.from({ length: 12 }, (_, i) => `Float${i + 1}`), ...Array.from({ length: 13 }, (_, i) => `Fix${i}`)] },
  { name: "Angle", values: ["Radian", "Degree", "Gradian"] },
  { name: "Exponential Format", values: ["Normal", "Scientific", "Engineering"] },
  { name: "Real or Complex", values: ["Real", "Rectangular", "Polar"] },
  { name: "Auto or Approx", values: ["Auto", "Approximate", "Exact"] },
  { name: "Vector Format", values: ["Rectangular", "Cylindrical", "Spherical"] },
  { name: "Base", values: ["Decimal", "Hex", "Binary"] },
  { name: "Unit System", values: ["SI", "Eng/US"] },
];

/** Each setting's current value number. */
function modeValue(mode: number, s: Settings): number {
  switch (mode) {
    case 1:
      return s.digits >= 12 ? 1 : s.digits + 1;
    case 2:
      return s.angle === "rad" ? 1 : 2;
    case 4:
      return s.complex === "real" ? 1 : s.complex === "rect" ? 2 : 3;
    case 5:
      return s.mode === "auto" ? 1 : s.mode === "approx" ? 2 : 3;
    default:
      return 1;
  }
}

/** The settings with one changed, or null when it's a value the settings here don't have yet. */
function withMode(mode: number, value: number, s: Settings): Settings | null {
  switch (mode) {
    case 1:
      return value === 1 ? { ...s, digits: 12 } : value >= 2 && value <= 13 ? { ...s, digits: value - 1 } : null;
    case 2:
      return value === 1 ? { ...s, angle: "rad" } : value === 2 ? { ...s, angle: "deg" } : null;
    case 4:
      return value >= 1 && value <= 3 ? { ...s, complex: (["real", "rect", "polar"] as const)[value - 1]! } : null;
    case 5:
      return value >= 1 && value <= 3 ? { ...s, mode: (["auto", "approx", "exact"] as const)[value - 1]! } : null;
    default:
      return value === 1 && mode >= 1 && mode <= 8 ? s : null;
  }
}

const num = (v: number): Ast => ({ k: "num", v: String(v) });
const str = (v: string): Ast => ({ k: "str", v });

/** setMode, getMode, getLangInfo, getPlatform, getKey and warnCodes; null for anything else. */
async function modeCommand(text: string, settings: Settings, giac: Giac, opts: Opts, evaluate: Evaluate): Promise<EvalResult | null> {
  // v:=setMode(…) and setMode(…)→v store the answer too.
  const assign = /^\s*([A-Za-z]\w*)\s*:=\s*(.+)$/s.exec(text);
  const arrow = /^(.+)→\s*([A-Za-z]\w*)\s*$/s.exec(text);
  const stored = assign ? { name: assign[1]!, call: assign[2]! } : arrow ? { name: arrow[2]!, call: arrow[1]! } : null;
  if (stored && /^\s*(setMode|getMode|getLangInfo|getPlatform|getKey)\s*\(/i.test(stored.call)) {
    const r = await modeCommand(stored.call, settings, giac, opts, evaluate);
    if (!r || !r.ok) return r;
    const store = await evaluate(`${stored.name}:=${r.outputText}`, giac, { settings: r.settings ?? settings });
    if (!store.ok) return store;
    return { ...r, input: sym(text.trim()), definitions: [...(store.definitions ?? []), ...(store.definition ? [store.definition] : [])] };
  }
  const m = /^\s*(setMode|getMode|getLangInfo|getPlatform|getKey|warnCodes)\s*\(([\s\S]*)\)\s*$/i.exec(text);
  if (!m) return null;
  const f = m[1]!.toLowerCase();
  const args = splitArgs(m[2]!);
  const input: Ast = (() => {
    try {
      return parse(text);
    } catch {
      return sym(text.trim());
    }
  })();
  const ok = (output: Ast, more: Partial<Extract<EvalResult, { ok: true }>> = {}): EvalResult => ({
    ok: true,
    input,
    output,
    outputText: print(output),
    ...more,
  });
  const numbers = async (): Promise<number[]> => {
    const out: number[] = [];
    for (const a of args) {
      const r = await evaluate(a, giac, { settings, ans: opts.ans });
      if (!r.ok) throw new ProgramError(r.error);
      const v = r.output.k === "list" ? r.output.items.map((x) => Number(x.k === "num" ? x.v : NaN)) : [Number(r.outputText)];
      out.push(...v);
    }
    if (out.some((v) => !Number.isInteger(v))) throw new ProgramError("Error: Argument must be an integer");
    return out;
  };
  try {
    switch (f) {
      case "getlanginfo":
        return ok(str("en"));
      case "getplatform":
        return ok(str("hh"));
      case "getkey":
        // No key is waiting while an entry runs.
        return ok(str(""));
      case "getmode": {
        const [mode] = await numbers();
        if (mode === 0) return ok({ k: "list", items: MODES.flatMap((_, i) => [num(i + 1), num(modeValue(i + 1, settings))]) });
        if (!(mode! >= 1 && mode! <= MODES.length)) throw new ProgramError("Error: Domain error");
        return ok(num(modeValue(mode!, settings)));
      }
      case "setmode": {
        const pairs = await numbers();
        if (!pairs.length || pairs.length % 2) throw new ProgramError("Error: Argument error");
        let next = settings;
        const before: number[] = [];
        for (let i = 0; i < pairs.length; i += 2) {
          const [mode, value] = [pairs[i]!, pairs[i + 1]!];
          if (!(mode >= 1 && mode <= MODES.length) || !(value >= 1 && value <= MODES[mode - 1]!.values.length)) throw new ProgramError("Error: Domain error");
          before.push(mode, modeValue(mode, next));
          const changed = withMode(mode, value, next);
          if (!changed) throw new ProgramError(`Error: ${MODES[mode - 1]!.name} ${MODES[mode - 1]!.values[value - 1]} isn't available here yet`);
          next = changed;
        }
        // One setting gives back its old value; a list gives back the old pairs.
        const output: Ast = before.length === 2 ? num(before[1]!) : { k: "list", items: before.map(num) };
        return ok(output, { settings: next });
      }
      case "warncodes": {
        // warnCodes(expr, var): the answer, with var set to the codes of the warnings it gave ({} or {1}).
        if (args.length !== 2) throw new ProgramError("Error: Argument error");
        const r = await evaluate(args[0]!, giac, { settings, ans: opts.ans });
        if (!r.ok) return { ok: false, input, error: r.error };
        const store = await evaluate(`${args[1]}:=${r.warning ? "{1}" : "{}"}`, giac, { settings });
        if (!store.ok) return { ok: false, input, error: store.error };
        return { ...r, input, definitions: [...(r.definitions ?? []), ...(store.definition ? [store.definition] : [])] };
      }
    }
  } catch (e) {
    return fail(e, input);
  }
  return null;
}

// ─── Lock, unLock, getLockInfo, and DelVar of a program ─────────────────────

/** Locked names are kept in the engine as one string, so a restart keeps them locked. */
const LOCKED = "locked_";

async function lockedNames(giac: Giac): Promise<Set<string>> {
  const raw = (await giac(LOCKED)).trim();
  const m = /^"(.*)"$/.exec(raw);
  return new Set(m ? m[1]!.split(",").filter(Boolean) : []);
}

/** The names an entry would change: what it stores to, defines or deletes. */
function targets(text: string): string[] {
  const out: string[] = [];
  const del = /^\s*DelVar\s+(.+)$/i.exec(text);
  if (del) return splitArgs(del[1]!).map((n) => n.toLowerCase());
  const define = /^\s*Define\s+(?:Lib(?:Pub|Priv)\s+)?([A-Za-z][\w.]*)/i.exec(text);
  if (define) out.push(define[1]!.toLowerCase());
  const assign = /^\s*([A-Za-z][\w.]*)\s*(?:\([^)]*\))?\s*:=/.exec(text);
  if (assign) out.push(assign[1]!.toLowerCase());
  const arrow = /→\s*([A-Za-z][\w.]*)\s*(?:\([^)]*\))?\s*$/.exec(text);
  if (arrow) out.push(arrow[1]!.toLowerCase());
  return out;
}

/**
 * Lock and unLock (as the handheld spells them), getLockInfo, a change to a
 * locked name (refused), and DelVar, which also forgets a program's source.
 */
async function lockCommand(text: string, giac: Giac, opts: Opts, evaluate: Evaluate): Promise<EvalResult | null> {
  const lock = /^\s*(Lock|unLock)\s+(.+)$/i.exec(text);
  const info = /^\s*getLockInfo\s*\(\s*([A-Za-z][\w.]*)\s*\)\s*$/i.exec(text);
  const changes = targets(text);
  if (!lock && !info && !changes.length) return null;
  const locked = await lockedNames(giac);
  const input: Ast = (() => {
    try {
      return parse(text);
    } catch {
      return sym(text.trim());
    }
  })();
  if (info) {
    const name = info[1]!.toLowerCase();
    return { ok: true, input, output: { k: "num", v: locked.has(name) ? "1" : "0" }, outputText: locked.has(name) ? "1" : "0" };
  }
  if (lock) {
    const names = splitArgs(lock[2]!).map((n) => n.toLowerCase());
    for (const n of names) if (!/^[a-z][\w.]*$/.test(n)) return { ok: false, input, error: "Error: Invalid variable name" };
    const on = lock[1]!.toLowerCase() === "lock";
    for (const n of names) {
      if (!on) locked.delete(n);
      else if ((await giac(giacName(n))).trim() === giacName(n) && !decodeSource(await giac(sourceVar(n))))
        return { ok: false, input, error: "Error: Variable is not defined" };
      else locked.add(n);
    }
    const definition = `${LOCKED}:="${[...locked].join(",")}"`;
    await giac(definition);
    return { ok: true, input, output: sym("Done"), outputText: "Done", definition };
  }
  const blocked = changes.find((n) => locked.has(n));
  if (blocked) return { ok: false, input, error: "Error: Variable is locked" };
  if (!/^\s*DelVar\b/i.test(text)) return null;
  // DelVar of a program or function made with Func also forgets its source.
  const r = await evaluate(text, giac, { ...opts, inner: true });
  if (!r.ok) return r;
  const purges: string[] = [];
  for (const n of changes) if (decodeSource(await giac(sourceVar(n)))) purges.push(sourceVar(n));
  if (!purges.length) return r;
  const purge = `purge(${purges.join(",")})`;
  await giac(purge);
  return { ...r, definition: undefined, definitions: [...(r.definitions ?? []), ...(r.definition ? [r.definition] : []), purge] };
}
