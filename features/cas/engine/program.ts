// SPDX-License-Identifier: GPL-3.0-or-later
/**
 * User functions and programs: Define f(x)=Func … EndFunc and Define
 * p(x)=Prgm … EndPrgm, with their lines joined by ":" as the handheld also
 * accepts them. A function compiles to Giac's own language, so it works
 * anywhere an expression does (f(3)+1, in a graph). A program runs here,
 * line by line, because it talks to the student: Disp, Request, Text.
 */
import { mapAst, parse, type Ast } from "../math/ast";
import { print } from "../math/print";

// ─── Lines and blocks ───────────────────────────────────────────────────────

/** The lines of a block: split at ":" and newlines, but not inside quotes or brackets, nor ":=". */
export function splitLines(src: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let quoted = false;
  let cur = "";
  for (let i = 0; i < src.length; i++) {
    const c = src[i]!;
    if (c === '"') quoted = !quoted;
    else if (!quoted && "([{".includes(c)) depth++;
    else if (!quoted && ")]}".includes(c)) depth--;
    if (!quoted && depth === 0 && (c === "\n" || (c === ":" && src[i + 1] !== "="))) {
      out.push(cur);
      cur = "";
      continue;
    }
    cur += c;
  }
  out.push(cur);
  return out.map((l) => l.trim()).filter((l) => l && !l.startsWith("©"));
}

/** Split at the commas that aren't inside quotes or brackets. */
export function splitArgs(s: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let quoted = false;
  let cur = "";
  for (const c of s) {
    if (c === '"') quoted = !quoted;
    else if (!quoted && "([{".includes(c)) depth++;
    else if (!quoted && ")]}".includes(c)) depth--;
    if (!quoted && depth === 0 && c === ",") {
      out.push(cur.trim());
      cur = "";
      continue;
    }
    cur += c;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

export type Stmt =
  | { k: "expr"; text: string }
  | { k: "local"; names: string[] }
  | { k: "if"; branches: { cond: string; body: Stmt[] }[]; otherwise?: Stmt[] }
  | { k: "for"; v: string; from: string; to: string; step?: string; body: Stmt[] }
  | { k: "while"; cond: string; body: Stmt[] }
  | { k: "loop"; body: Stmt[] }
  | { k: "try"; body: Stmt[]; handler: Stmt[] }
  | { k: "return"; value?: string }
  | { k: "exit" | "cycle" | "stop" | "clrErr" | "passErr" }
  | { k: "lbl" | "goto"; name: string }
  | { k: "io"; cmd: IoCmd; args: string[] };

type IoCmd = "Disp" | "DispAt" | "Request" | "RequestStr" | "Text" | "Wait" | "Hub" | "Refresh";

export class ProgramError extends Error {}

const syntax = (what: string) => new ProgramError(`Error: ${what}`);

/** The block structure of a function's or program's lines. */
export function parseBlock(lines: string[]): Stmt[] {
  let i = 0;
  const kw = (re: RegExp) => re.exec(lines[i] ?? "");
  // Read statements until one of the given closing words (returned, not consumed).
  const block = (ends: RegExp | null): { body: Stmt[]; end?: string } => {
    const body: Stmt[] = [];
    while (i < lines.length) {
      const line = lines[i]!;
      if (ends && ends.test(line)) return { body, end: line };
      body.push(statement());
    }
    if (ends) throw syntax("Missing End");
    return { body };
  };
  const statement = (): Stmt => {
    const line = lines[i]!;
    let m: RegExpExecArray | null;
    if ((m = kw(/^Local\s+(.+)$/i))) {
      i++;
      return { k: "local", names: splitArgs(m[1]!) };
    }
    if ((m = kw(/^If\s+(.+?)\s+Then$/i))) {
      i++;
      const branches = [{ cond: m[1]!, body: [] as Stmt[] }];
      let otherwise: Stmt[] | undefined;
      for (;;) {
        const r = block(/^(ElseIf\s+.+\s+Then|Else|EndIf)$/i);
        if (otherwise) otherwise = r.body;
        else branches[branches.length - 1]!.body = r.body;
        const end = r.end!;
        i++;
        if (/^EndIf$/i.test(end)) break;
        if (otherwise) throw syntax("Missing EndIf");
        const elseIf = /^ElseIf\s+(.+?)\s+Then$/i.exec(end);
        if (elseIf) branches.push({ cond: elseIf[1]!, body: [] });
        else otherwise = [];
      }
      return { k: "if", branches, otherwise };
    }
    if ((m = kw(/^If\s+(.+)$/i))) {
      // If without Then governs the one line after it.
      i++;
      if (i >= lines.length) throw syntax("Missing statement after If");
      return { k: "if", branches: [{ cond: m[1]!, body: [statement()] }] };
    }
    if ((m = kw(/^For\s+(.+)$/i))) {
      i++;
      const a = splitArgs(m[1]!);
      if (a.length < 3 || a.length > 4) throw syntax("Argument error");
      const r = block(/^EndFor$/i);
      i++;
      return { k: "for", v: a[0]!, from: a[1]!, to: a[2]!, step: a[3], body: r.body };
    }
    if ((m = kw(/^While\s+(.+)$/i))) {
      i++;
      const r = block(/^EndWhile$/i);
      i++;
      return { k: "while", cond: m[1]!, body: r.body };
    }
    if (kw(/^Loop$/i)) {
      i++;
      const r = block(/^EndLoop$/i);
      i++;
      return { k: "loop", body: r.body };
    }
    if (kw(/^Try$/i)) {
      i++;
      const r = block(/^(Else|EndTry)$/i);
      i++;
      let handler: Stmt[] = [];
      if (/^Else$/i.test(r.end!)) {
        handler = block(/^EndTry$/i).body;
        i++;
      }
      return { k: "try", body: r.body, handler };
    }
    if ((m = kw(/^Return(?:\s+(.+))?$/i))) {
      i++;
      return { k: "return", value: m[1] };
    }
    for (const [re, k] of [
      [/^Exit$/i, "exit"],
      [/^Cycle$/i, "cycle"],
      [/^Stop$/i, "stop"],
      [/^ClrErr$/i, "clrErr"],
      [/^PassErr$/i, "passErr"],
    ] as const) {
      if (re.test(line)) {
        i++;
        return { k };
      }
    }
    if ((m = kw(/^(Lbl|Goto)\s+([A-Za-z]\w*)$/i))) {
      i++;
      return { k: m[1]!.toLowerCase() === "lbl" ? "lbl" : "goto", name: m[2]!.toLowerCase() };
    }
    if ((m = kw(/^(Send|GetStr|Get)(?:\s+(.*))?$/i))) {
      // These talk to a TI-Innovator Hub or a sensor over the cable; none can be connected here.
      i++;
      return { k: "io", cmd: "Hub", args: [] };
    }
    if (kw(/^RefreshProbeVars$/i)) {
      i++;
      return { k: "io", cmd: "Refresh", args: [] };
    }
    if ((m = kw(/^(Disp|DispAt|RequestStr|Request|Text|Wait)(?:\s+(.*))?$/i))) {
      i++;
      const cmd = (["Disp", "DispAt", "RequestStr", "Request", "Text", "Wait"] as const).find((c) => c.toLowerCase() === m![1]!.toLowerCase())!;
      return { k: "io", cmd, args: m[2] ? splitArgs(m[2]) : [] };
    }
    if (/^(Else|ElseIf\b.*|EndIf|EndFor|EndWhile|EndLoop|EndTry|EndFunc|EndPrgm|Then)$/i.test(line)) throw syntax(`Unexpected ${line.split(/\s/)[0]}`);
    i++;
    return { k: "expr", text: line };
  };
  return block(null).body;
}

// ─── Define …=Func / Prgm ───────────────────────────────────────────────────

export type Definition = {
  /** "Define", "Define LibPub" or "Define LibPriv", as typed. */
  access: "" | "LibPub" | "LibPriv";
  name: string;
  params: string[];
  kind: "Func" | "Prgm";
  /** The lines between Func and EndFunc (or Prgm and EndPrgm). */
  lines: string[];
};

/** A Define of a Func or Prgm block, or null for anything else. */
export function readDefinition(text: string): Definition | null {
  const m = /^\s*Define\s+(?:(LibPub|LibPriv)\s+)?([A-Za-zÀ-￿][\w.À-￿]*)\s*\(([^)]*)\)\s*=\s*(Func|Prgm)\b([\s\S]*)$/i.exec(text);
  if (!m) return null;
  const kind = m[4]!.toLowerCase() === "func" ? "Func" : "Prgm";
  const lines = splitLines(m[5]!);
  const end = lines.pop();
  if (!end || end.toLowerCase() !== (kind === "Func" ? "endfunc" : "endprgm")) throw syntax(`Missing ${kind === "Func" ? "EndFunc" : "EndPrgm"}`);
  const access = !m[1] ? "" : m[1].toLowerCase() === "libpub" ? "LibPub" : "LibPriv";
  return { access, name: m[2]!.toLowerCase(), params: splitArgs(m[3]!).map((p) => p.toLowerCase()), kind, lines };
}

/** The definition written back out as one line, as Recall Definition and the history show it. */
export function definitionText(d: Definition): string {
  const access = d.access ? `${d.access} ` : "";
  return `Define ${access}${d.name}(${d.params.join(",")})=${d.kind}:${d.lines.map((l) => `${l}:`).join("")}End${d.kind}`;
}

/**
 * The functions and programs a problem's engine definitions hold, by name,
 * each as typed: the latest of each, and none that DelVar removed.
 */
export function definedSources(defs: string[]): Map<string, Definition & { source: string }> {
  const out = new Map<string, Definition & { source: string }>();
  for (const raw of defs) {
    const d = raw.trim();
    const src = /^src_\w+_:=("[A-Za-z0-9+/=]*")$/.exec(d);
    if (src) {
      const source = decodeSource(src[1]!);
      try {
        const def = source ? readDefinition(source) : null;
        if (def && source) out.set(def.name, { ...def, source });
      } catch {
        // A source that no longer reads is left out.
      }
      continue;
    }
    const purge = /^purge\((.*)\)$/.exec(d);
    if (purge) for (const n of purge[1]!.split(",")) for (const [name] of out) if (sourceVar(name) === n.trim()) out.delete(name);
  }
  return out;
}

/** Where a definition's source is kept in the engine, so a restart (or a reload) brings it back. */
export const sourceVar = (name: string) => `src_${name.replace(/[^A-Za-z0-9]/g, (c) => `u${c.codePointAt(0)}`)}_`;

export function encodeSource(text: string): string {
  let bytes = "";
  for (const b of new TextEncoder().encode(text)) bytes += String.fromCharCode(b);
  return btoa(bytes);
}

export function decodeSource(raw: string): string | null {
  const m = /^"([A-Za-z0-9+/=]*)"$/.exec(raw.trim());
  if (!m) return null;
  return new TextDecoder().decode(Uint8Array.from(atob(m[1]!), (c) => c.charCodeAt(0)));
}

// ─── Functions: compiled to Giac ────────────────────────────────────────────

/** How one expression's text becomes Giac (translate, with the settings in force). */
export type Translator = (a: Ast) => string;

/** A condition as Giac tests it: = between values is ==. */
function condition(text: string, tr: Translator): string {
  const go = (a: Ast): string => {
    if (a.k === "bin" && (a.op === "and" || a.op === "or" || a.op === "xor")) return `(${go(a.a)}) ${a.op} (${go(a.b)})`;
    if (a.k === "not") return `not(${go(a.a)})`;
    if (a.k === "bin" && a.op === "=") return `(${tr(a.a)})==(${tr(a.b)})`;
    return tr(a);
  };
  return go(parse(text));
}

/**
 * A Func block as the body of a Giac function. I/O isn't allowed in a
 * function (it returns a value; a program talks), as on the handheld.
 */
export function compileFunc(lines: string[], tr: Translator): string {
  const stmts = parseBlock(lines);
  const locals: string[] = [];
  const expr = (text: string) => tr(parse(text));
  const body = (list: Stmt[]): string =>
    list
      .map((s): string => {
        switch (s.k) {
          case "expr":
            return `${expr(s.text)};`;
          case "local":
            for (const n of s.names) locals.push(expr(n));
            return "";
          case "if": {
            const [first, ...rest] = s.branches;
            let out = `if (${condition(first!.cond, tr)}) {${body(first!.body)}}`;
            let tail = s.otherwise ? `{${body(s.otherwise)}}` : "";
            for (const b of rest.reverse()) tail = `{if (${condition(b.cond, tr)}) {${body(b.body)}}${tail ? ` else ${tail}` : ""}}`;
            if (tail) out += ` else ${tail}`;
            return `${out};`;
          }
          case "for":
            return `for ${expr(s.v)} from ${expr(s.from)} to ${expr(s.to)} step ${s.step ? expr(s.step) : "1"} do ${body(s.body)} od;`;
          case "while":
            return `while (${condition(s.cond, tr)}) {${body(s.body)}};`;
          case "loop":
            return `while (true) {${body(s.body)}};`;
          case "try":
            return `try {${body(s.body)}} catch(err_) {${body(s.handler)}};`;
          case "return":
            return s.value ? `return(${expr(s.value)});` : "return(0);";
          case "exit":
            return "break;";
          case "cycle":
            return "continue;";
          case "lbl":
            return `label ${s.name}_l;`;
          case "goto":
            return `goto ${s.name}_l;`;
          case "clrErr":
          case "passErr":
            return "";
          case "stop":
          case "io":
            throw new ProgramError("Error: Invalid in a Func...EndFunc block");
        }
      })
      .filter(Boolean)
      .join(" ");
  const code = body(stmts);
  return `{${locals.length ? `local ${locals.join(",")}; ` : ""}${code}}`;
}

// ─── Programs: run here ─────────────────────────────────────────────────────

type Op =
  | { op: "eval"; text: string }
  | { op: "jf"; cond: string; to: number }
  | { op: "jmp"; to: number }
  | { op: "forInit"; v: string; from: string; to: string; step?: string; id: number; exit: number }
  | { op: "forNext"; v: string; id: number; body: number }
  | { op: "tryPush"; handler: number }
  | { op: "tryPop" }
  | { op: "ret" | "stop" | "clrErr" | "passErr" | "nop" }
  | { op: "io"; cmd: IoCmd; args: string[] };

/** A program's lines as a flat list of steps with jumps, so Goto can reach any Lbl. */
export function compileProgram(lines: string[]): { ops: Op[]; locals: string[] } {
  const ops: Op[] = [];
  const locals: string[] = [];
  const labels = new Map<string, number>();
  const gotos: { at: number; name: string }[] = [];
  const loops: { breaks: number[]; cont: number[] }[] = [];
  let forId = 0;
  const emit = (o: Op) => ops.push(o) - 1;
  const gen = (list: Stmt[]) => {
    for (const s of list) {
      switch (s.k) {
        case "expr":
          emit({ op: "eval", text: s.text });
          break;
        case "local":
          locals.push(...s.names.map((n) => n.toLowerCase()));
          break;
        case "if": {
          const ends: number[] = [];
          for (const b of s.branches) {
            const jf = emit({ op: "jf", cond: b.cond, to: -1 });
            gen(b.body);
            ends.push(emit({ op: "jmp", to: -1 }));
            (ops[jf] as { to: number }).to = ops.length;
          }
          if (s.otherwise) gen(s.otherwise);
          for (const e of ends) (ops[e] as { to: number }).to = ops.length;
          break;
        }
        case "for": {
          const id = forId++;
          const init = emit({ op: "forInit", v: s.v, from: s.from, to: s.to, step: s.step, id, exit: -1 });
          loops.push({ breaks: [], cont: [] });
          gen(s.body);
          const loop = loops.pop()!;
          const next = emit({ op: "forNext", v: s.v, id, body: init + 1 });
          for (const c of loop.cont) (ops[c] as { to: number }).to = next;
          (ops[init] as { exit: number }).exit = ops.length;
          for (const b of loop.breaks) (ops[b] as { to: number }).to = ops.length;
          break;
        }
        case "while":
        case "loop": {
          const top = ops.length;
          const jf = s.k === "while" ? emit({ op: "jf", cond: s.cond, to: -1 }) : -1;
          loops.push({ breaks: [], cont: [] });
          gen(s.body);
          const loop = loops.pop()!;
          emit({ op: "jmp", to: top });
          if (jf >= 0) (ops[jf] as { to: number }).to = ops.length;
          for (const c of loop.cont) (ops[c] as { to: number }).to = top;
          for (const b of loop.breaks) (ops[b] as { to: number }).to = ops.length;
          break;
        }
        case "try": {
          const push = emit({ op: "tryPush", handler: -1 });
          gen(s.body);
          emit({ op: "tryPop" });
          const skip = emit({ op: "jmp", to: -1 });
          (ops[push] as { handler: number }).handler = ops.length;
          gen(s.handler);
          (ops[skip] as { to: number }).to = ops.length;
          break;
        }
        case "exit":
        case "cycle": {
          const loop = loops[loops.length - 1];
          if (!loop) throw syntax(`${s.k === "exit" ? "Exit" : "Cycle"} outside a loop`);
          (s.k === "exit" ? loop.breaks : loop.cont).push(emit({ op: "jmp", to: -1 }));
          break;
        }
        case "lbl":
          labels.set(s.name, emit({ op: "nop" }));
          break;
        case "goto":
          gotos.push({ at: emit({ op: "jmp", to: -1 }), name: s.name });
          break;
        case "return":
          if (s.value) emit({ op: "eval", text: s.value });
          emit({ op: "ret" });
          break;
        case "stop":
        case "clrErr":
        case "passErr":
          emit({ op: s.k });
          break;
        case "io":
          emit({ op: "io", cmd: s.cmd, args: s.args });
          break;
      }
    }
  };
  gen(parseBlock(lines));
  for (const g of gotos) {
    const at = labels.get(g.name);
    if (at === undefined) throw syntax(`Label not found: ${g.name}`);
    (ops[g.at] as { to: number }).to = at;
  }
  return { ops, locals };
}

/** What a running program needs from the calculator. */
export type ProgramHost = {
  /** Evaluate one entry as the Calculator would; throws with the handheld's message on an error. */
  run(text: string): Promise<{ output: Ast; outputText: string; definitions: string[] }>;
  /** Ask for a value (Request) or text (RequestStr); null when cancelled. */
  request?(prompt: string, text: boolean): Promise<string | null>;
  /** Show a message and wait for OK (Text). */
  message?(text: string): Promise<void>;
};

const MAX_STEPS = 200_000;
const MAX_MS = 60_000;

/**
 * Run a program's steps. Parameters and Local names are renamed for the
 * run (n becomes n_prgm_), so the problem's own variables are untouched;
 * what the program stores in other names stays, as on the handheld.
 */
export async function runProgram(
  prog: { ops: Op[]; locals: string[] },
  params: string[],
  args: string[],
  host: ProgramHost,
): Promise<{ display: string[][]; definitions: string[]; temps: string[] }> {
  const local = new Map<string, string>();
  for (const n of [...params, ...prog.locals]) local.set(n.toLowerCase(), `${n.toLowerCase()}_prgm_`);
  const rename = (text: string): string => {
    if (!local.size) return text;
    const a = mapAst(parse(text), (x) => (x.k === "sym" && local.has(x.name) ? { ...x, name: local.get(x.name)! } : x));
    return print(a);
  };
  const display: string[][] = [];
  const definitions: string[] = [];
  const temps = [...local.values()];
  const run = async (text: string) => {
    const r = await host.run(rename(text));
    for (const d of r.definitions) if (!temps.some((t) => d.startsWith(`${t}:=`) || d.startsWith(`${t}(`))) definitions.push(d);
    return r;
  };
  const truth = async (cond: string) => {
    const r = await run(cond);
    const v = r.output.k === "sym" ? r.output.name : r.outputText;
    if (v === "true") return true;
    if (v === "false") return false;
    throw new ProgramError("Error: A test did not resolve to TRUE or FALSE");
  };
  const number = async (text: string) => {
    const r = await run(text);
    const v = Number(r.outputText.replace(/ᴇ|E/, "e").replace(/−/g, "-"));
    if (!Number.isFinite(v)) throw new ProgramError("Error: Argument must be a number");
    return { v, text: r.outputText };
  };
  // A string keeps its quotes here; the history shows it as plain text.
  const shown = (r: { output: Ast; outputText: string }) => r.outputText;
  const plain = (r: { output: Ast; outputText: string }) => (r.output.k === "str" ? r.output.v : r.outputText);

  for (let i = 0; i < params.length; i++) {
    if (args[i] === undefined) throw new ProgramError("Error: Too few arguments");
    await run(`${params[i]}:=${args[i]}`);
  }
  if (args.length > params.length) throw new ProgramError("Error: Too many arguments");

  const forState = new Map<number, { to: number; step: number }>();
  const handlers: number[] = [];
  let error: string | null = null;
  let pc = 0;
  let steps = 0;
  const start = Date.now();
  while (pc < prog.ops.length) {
    if (++steps > MAX_STEPS || Date.now() - start > MAX_MS) throw new ProgramError("Error: The program ran too long and was stopped");
    const o = prog.ops[pc]!;
    try {
      switch (o.op) {
        case "eval":
          await run(o.text);
          pc++;
          break;
        case "jf":
          pc = (await truth(o.cond)) ? pc + 1 : o.to;
          break;
        case "jmp":
          pc = o.to;
          break;
        case "forInit": {
          const from = await number(o.from);
          const to = (await number(o.to)).v;
          const step = o.step ? (await number(o.step)).v : 1;
          if (step === 0) throw new ProgramError("Error: Domain error");
          await run(`${o.v}:=${from.text}`);
          forState.set(o.id, { to, step });
          pc = (step > 0 ? from.v <= to : from.v >= to) ? pc + 1 : o.exit;
          break;
        }
        case "forNext": {
          const st = forState.get(o.id)!;
          const v = await number(`${o.v}+${st.step}`);
          await run(`${o.v}:=${v.text}`);
          pc = (st.step > 0 ? v.v <= st.to + 1e-12 : v.v >= st.to - 1e-12) ? o.body : pc + 1;
          break;
        }
        case "tryPush":
          handlers.push(o.handler);
          pc++;
          break;
        case "tryPop":
          handlers.pop();
          pc++;
          break;
        case "clrErr":
          error = null;
          pc++;
          break;
        case "passErr":
          if (error) throw new ProgramError(error);
          pc++;
          break;
        case "ret":
        case "stop":
          pc = prog.ops.length;
          break;
        case "nop":
          pc++;
          break;
        case "io":
          await io(o.cmd, o.args);
          pc++;
          break;
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      const handler = handlers.pop();
      if (handler === undefined) throw e instanceof ProgramError ? e : new ProgramError(message.startsWith("Error") ? message : `Error: ${message}`);
      error = message;
      pc = handler;
    }
  }
  return { display, definitions, temps };

  async function io(cmd: Extract<Op, { op: "io" }>["cmd"], args: string[]) {
    switch (cmd) {
      case "Disp":
      case "DispAt": {
        const parts: string[] = [];
        for (const a of cmd === "DispAt" ? args.slice(1) : args) parts.push(shown(await run(a)));
        display.push(parts);
        return;
      }
      case "Text": {
        const parts: string[] = [];
        for (const a of args) parts.push(plain(await run(a)));
        if (host.message) await host.message(parts.join(" "));
        else display.push(parts.map((t) => JSON.stringify(t)));
        return;
      }
      case "Wait": {
        const s = (await number(args[0] ?? "0")).v;
        await new Promise((res) => setTimeout(res, Math.max(0, Math.min(s, 100)) * 1000));
        return;
      }
      case "Hub":
        throw new ProgramError("Error: No hub or sensor is connected");
      case "Refresh":
        return;
      case "Request":
      case "RequestStr": {
        if (args.length < 2) throw new ProgramError("Error: Argument error");
        const prompt = plain(await run(args[0]!));
        if (!host.request) throw new ProgramError("Error: The program asks for input, which isn't possible here");
        const answer = await host.request(prompt, cmd === "RequestStr");
        if (answer === null) throw new ProgramError("Error: Break");
        const value = cmd === "RequestStr" ? `"${answer.replace(/"/g, "")}"` : answer;
        await run(`${args[1]}:=${value}`);
        return;
      }
    }
  }
}
