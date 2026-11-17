// SPDX-License-Identifier: GPL-3.0-or-later
/**
 * The Calculator benchmark: every command the menus and catalog offer, typed
 * as a student would, through the same evaluate() the page uses and the real
 * Giac build. Each answer is checked against what the handheld gives.
 * Writes docs/cas-benchmark.md.
 *
 *   npm run bench        (vitest --mode bench; loads the 19 MB engine, so not part of npm test)
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS, evaluate, setupCommands, type Settings } from "./evaluate";
import { CASES, type Case } from "./benchmark-cases";
import { calculatorMenu } from "../menus/calculator-menu";
import type { MenuItem } from "../menus/types";

/** The Calculator menu's leaves, by top-level menu: built (an action) or greyed (not built yet). */
function coverage() {
  const out: { menu: string; built: string[]; greyed: string[] }[] = [];
  const walk = (items: MenuItem[], acc: { built: string[]; greyed: string[] }) => {
    for (const it of items) {
      if (it.items) walk(it.items, acc);
      else (it.action ? acc.built : acc.greyed).push(it.label);
    }
  };
  for (const top of calculatorMenu) {
    const acc = { built: [] as string[], greyed: [] as string[] };
    if (top.items) walk(top.items, acc);
    else (top.action ? acc.built : acc.greyed).push(top.label);
    out.push({ menu: top.label, ...acc });
  }
  return out;
}

const on = import.meta.env.MODE === "bench" || process.env.AXIOM_BENCH === "1";
const root = join(__dirname, "../../..");

/** Answers compare without spaces, with × and · as *, and − as -. */
const norm = (s: string) => s.replace(/\s+/g, "").replace(/[×·]/g, "*").replace(/−/g, "-").replace(/ℯ/g, "e");

function check(c: Case, out: string): boolean {
  if (c.want === undefined) return true;
  const wants = Array.isArray(c.want) ? c.want : [c.want];
  return wants.some((w) => (w instanceof RegExp ? w.test(out) : norm(w) === norm(out)));
}

describe.skipIf(!on)("calculator benchmark", () => {
  it("runs every case", async () => {
    const req = createRequire(import.meta.url);
    // giacwasm.js is CommonJS, but this package is "type": "module": run it in a CommonJS wrapper.
    const file = join(root, "public/cas/giac/1.9.0/giacwasm.js");
    const mod = { exports: {} as Record<string, unknown> };
    new Function("module", "exports", "require", "__dirname", "__filename", readFileSync(file, "utf8"))(mod, mod.exports, req, join(file, ".."), file);
    const M = mod.exports as { calledRun?: boolean; onRuntimeInitialized?: () => void; cwrap: (...a: unknown[]) => unknown };
    await new Promise<void>((res) => (M.calledRun ? res() : (M.onRuntimeInitialized = () => res())));
    const caseval = M.cwrap("caseval", "string", ["string"]) as (s: string) => string;
    const quiet = <T,>(fn: () => T): T => {
      const keep = [console.log, console.error, console.warn];
      console.log = console.error = console.warn = () => {};
      try {
        return fn();
      } finally {
        [console.log, console.error, console.warn] = keep;
      }
    };
    const giac = async (cmd: string) => quiet(() => caseval(cmd));
    const settings: Settings = { ...DEFAULT_SETTINGS };
    const fresh = async () => {
      quiet(() => caseval("restart"));
      for (const c of setupCommands(settings)) await giac(c);
    };

    const rows: { c: Case; out: string; ok: boolean }[] = [];
    for (const c of CASES) {
      await fresh();
      for (const pre of c.before ?? []) await evaluate(pre, giac, { settings });
      let out: string;
      try {
        const r = await evaluate(c.input, giac, { settings, approx: c.approx });
        out = r.ok ? r.outputText : r.error;
      } catch (e) {
        out = `Error: ${(e as Error).message}`;
      }
      rows.push({ c, out, ok: check(c, out) && !/^Error/.test(out) === !c.error });
    }

    const pass = rows.filter((r) => r.ok).length;
    const byCat = new Map<string, typeof rows>();
    for (const r of rows) byCat.set(r.c.cat, [...(byCat.get(r.c.cat) ?? []), r]);
    const cell = (s: string) => s.replace(/\|/g, "\\|").replace(/\n/g, " ");
    const cov = coverage();
    const built = cov.reduce((n, m) => n + m.built.length, 0);
    const greyed = cov.reduce((n, m) => n + m.greyed.length, 0);
    const md = [
      "# Calculator benchmark",
      "",
      `${pass} of ${rows.length} commands give the handheld's answer (${Math.round((pass / rows.length) * 100)}%).`,
      "",
      `The Calculator menu has ${built + greyed} items, as the handheld's: ${built} are built and ${greyed} are greyed (not built yet).`,
      "",
      "## Menu coverage",
      "",
      "| Menu | Built | Not built yet |",
      "|---|---|---|",
      ...cov.map((m) => `| ${m.menu} | ${m.built.length} | ${m.greyed.length ? m.greyed.join(", ") : "—"} |`),
      "",
      "## Commands",
      "",
      "Each command is typed as a student would and run through the same `evaluate()` the page uses, on the real Giac build. Regenerate with `npm run bench`.",
      "",
      ...[...byCat].flatMap(([cat, rs]) => [
        `### ${cat} (${rs.filter((r) => r.ok).length}/${rs.length})`,
        "",
        "| Command | Typed | Answer | |",
        "|---|---|---|---|",
        ...rs.map((r) => `| ${cell(r.c.name)} | \`${cell(r.c.input)}\` | \`${cell(r.out)}\` | ${r.ok ? "✓" : "✗"} |`),
        "",
      ]),
    ].join("\n");
    mkdirSync(join(root, "docs"), { recursive: true });
    writeFileSync(join(root, "docs/cas-benchmark.md"), md);
    const failed = rows.filter((r) => !r.ok).map((r) => `${r.c.name}: ${r.c.input} → ${r.out}`);
    console.info(`\n${pass}/${rows.length} pass\n${failed.join("\n")}`);
    expect(rows.length).toBeGreaterThan(100);
    // Any ✗ fails the run (and the deploy): the report above is still written first.
    expect(failed).toEqual([]);
  }, 600_000);
});
