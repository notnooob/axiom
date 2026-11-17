// SPDX-License-Identifier: GPL-3.0-or-later
/**
 * The assistant's eval: drives the real app in Chromium (Playwright) with
 * your own key, sends each case in scripts/ai-eval-cases.mjs to a new chat
 * in AI mode, waits for the reply, then checks the chat as the app saved it
 * (IndexedDB). A way to measure a prompt or tool change on a real model.
 *
 * Each case spends tokens on your account, so the count is printed first.
 *
 * Setup:  npx playwright install chromium; npm run dev (in another terminal)
 * Run:    AXIOM_EVAL_PROVIDER=anthropic AXIOM_EVAL_KEY=sk-… node scripts/ai-eval.mjs [--only name,name] [--list]
 *
 * AXIOM_EVAL_PROVIDER  anthropic | openai | gemini | openrouter | custom (default anthropic)
 * AXIOM_EVAL_KEY       the service's API key (custom: only if it needs one)
 * AXIOM_EVAL_MODEL     a model ID (default: the app's default for the service)
 * AXIOM_EVAL_BASE_URL  custom only: the endpoint, e.g. http://localhost:11434/v1
 * AXIOM_EVAL_EFFORT    off | low | medium | high (default low)
 * AXIOM_EVAL_URL       the running app (default http://localhost:5173)
 *
 * Writes eval-out/report.json (every case's replies and tool calls) and a
 * screenshot per case. Nothing is sent anywhere but the service you choose.
 */
import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright";
import { CASES } from "./ai-eval-cases.mjs";

const args = process.argv.slice(2);
const only = args.includes("--only") ? new Set(args[args.indexOf("--only") + 1].split(",")) : null;
const cases = CASES.filter((c) => !only || only.has(c.name));

if (args.includes("--list")) {
  for (const c of CASES) console.log(c.name);
  process.exit(0);
}

const env = process.env;
const provider = env.AXIOM_EVAL_PROVIDER || "anthropic";
const key = env.AXIOM_EVAL_KEY || "";
const url = env.AXIOM_EVAL_URL || "http://localhost:5173";
if (!key && provider !== "custom") {
  console.error("Set AXIOM_EVAL_KEY (and AXIOM_EVAL_PROVIDER if it isn't anthropic). See the top of this file.");
  process.exit(2);
}
if (provider === "custom" && !(env.AXIOM_EVAL_BASE_URL && env.AXIOM_EVAL_MODEL)) {
  console.error("A custom endpoint needs AXIOM_EVAL_BASE_URL and AXIOM_EVAL_MODEL.");
  process.exit(2);
}

const out = path.resolve("eval-out");
fs.mkdirSync(out, { recursive: true });

console.log(`${cases.length} case${cases.length === 1 ? "" : "s"} on ${provider}${env.AXIOM_EVAL_MODEL ? ` (${env.AXIOM_EVAL_MODEL})` : ""}, against ${url}. Each one spends tokens on your key.\n`);

const config = (mode) => ({
  provider,
  keys: key ? { [provider]: key } : {},
  models: env.AXIOM_EVAL_MODEL ? { [provider]: env.AXIOM_EVAL_MODEL } : {},
  baseUrl: env.AXIOM_EVAL_BASE_URL || "",
  effort: env.AXIOM_EVAL_EFFORT || "low",
  mode: mode || "solve",
});

const MODE_LABELS = { solve: "Solve", exam: "Exam", guide: "Guide", check: "Check" };

/** Choose a mode in AI mode's composer, as the student would. */
async function setMode(page, mode) {
  const ai = page.getByRole("region", { name: "AI mode" });
  await ai.getByRole("button", { name: /^Mode:/ }).click();
  await page.getByRole("menuitemradio", { name: new RegExp(`^${MODE_LABELS[mode]}`) }).click();
  await ai.getByRole("button", { name: `Mode: ${MODE_LABELS[mode]}` }).waitFor({ timeout: 5000 });
}

const toolName = (p) => (p.type === "dynamic-tool" ? p.toolName : p.type.startsWith("tool-") ? p.type.slice(5) : null);
const textOf = (m) => m.parts.filter((p) => p.type === "text").map((p) => p.text).join("\n\n");

/** The chat as the app saved it, from IndexedDB (idb-keyval's axiom-chats/threads), by the open chat's id. */
const readThread = (page) =>
  page.evaluate(async () => {
    const id = localStorage.getItem("axiom.chat.active");
    const db = await new Promise((res, rej) => {
      const r = indexedDB.open("axiom-chats");
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    });
    return new Promise((res, rej) => {
      const q = db.transaction("threads").objectStore("threads").get(id);
      q.onsuccess = () => res(q.result ?? null);
      q.onerror = () => rej(q.error);
    });
  });

/** Send one message and wait until the chat is idle again (the reply finished, or it's waiting on ask_user). */
async function send(page, text) {
  // AI mode's composer (the panel's stays mounted behind it).
  const box = page.getByRole("region", { name: "AI mode" }).getByLabel("Message the assistant");
  await box.fill(text);
  await box.press("Enter");
  const stop = page.getByRole("region", { name: "AI mode" }).getByRole("button", { name: "Stop", exact: true });
  await stop.waitFor({ state: "visible", timeout: 15000 }).catch(() => undefined);
  await stop.waitFor({ state: "detached", timeout: 6 * 60 * 1000 });
  // The chat is saved when the reply finishes; give it a moment to reach IndexedDB.
  await page.waitForTimeout(1500);
}

function check(c, thread) {
  const fails = [];
  const msgs = thread?.messages ?? [];
  const lastUser = msgs.map((m) => m.role).lastIndexOf("user");
  const turn = msgs.slice(lastUser + 1).filter((m) => m.role === "assistant");
  const parts = turn.flatMap((m) => m.parts);
  const calls = parts.map(toolName).filter(Boolean);
  const reply = turn.map(textOf).join("\n\n");
  const k = c.checks ?? {};
  if (!turn.length) fails.push("no reply");
  for (const t of k.calls ?? []) if (!calls.includes(t)) fails.push(`didn't call ${t}`);
  for (const t of k.notCalls ?? []) if (calls.includes(t)) fails.push(`called ${t}, which it shouldn't here`);
  const asked = parts.some((p) => toolName(p) === "ask_user");
  if (k.asks && !asked) fails.push("didn't ask (ask_user)");
  for (const re of [k.answer ?? []].flat()) if (!re.test(reply)) fails.push(`reply doesn't match ${re}`);
  if (k.notAnswer?.test(reply)) fails.push(`reply matches ${k.notAnswer}, which it shouldn't`);
  if (k.noProseQuestion) {
    // The text after the last step: a question to the student there belongs in ask_user.
    const last = turn.at(-1);
    const tail = last ? last.parts.slice(last.parts.findLastIndex((p) => toolName(p)) + 1).filter((p) => p.type === "text").map((p) => p.text).join("\n") : "";
    if (/\?\s*$|would you like|do you want|shall i|let me know|pick one/i.test(tail.trim())) fails.push("asked a question in the reply text");
  }
  if (k.pages) {
    const kinds = (thread?.doc?.doc?.pages ?? []).map((p) => p.kind).join(",");
    if (!k.pages.test(kinds)) fails.push(`document pages "${kinds || "none"}" don't match ${k.pages}`);
  }
  if (k.endsCleanly) {
    const last = turn.at(-1);
    if (!last || !(last.metadata?.limit || textOf(last).trim())) fails.push("ended without words (and not at the step limit)");
  }
  return { fails, calls, reply, asked, limit: Boolean(turn.at(-1)?.metadata?.limit) };
}

/** A tool output without its screenshot's base64, for the report. */
const slim = (thread) =>
  JSON.parse(JSON.stringify(thread ?? null, (k, v) => (k === "data" && typeof v === "string" && v.length > 200 ? `[${v.length} characters]` : k === "doc" ? undefined : v)));

const browser = await chromium.launch();
const results = [];
for (const c of cases) {
  const started = Date.now();
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  await context.addInitScript((cfg) => {
    localStorage.setItem("axiom.ai", JSON.stringify(cfg));
    localStorage.removeItem("axiom.chat.active");
  }, config(c.mode));
  const page = await context.newPage();
  page.on("pageerror", (e) => errors.push(e.message));
  let result;
  try {
    await page.goto(url);
    await page.waitForFunction(() => document.body.innerText.includes("Engine ready"), null, { timeout: 120000 });
    await page.getByRole("button", { name: "Assistant", exact: true }).click();
    await page.getByRole("button", { name: "AI mode", exact: true }).click();
    await page.getByRole("region", { name: "AI mode" }).getByLabel("Message the assistant").waitFor();
    // A message may switch modes first ({ text, mode }), as the student would in the composer.
    for (const m of c.messages) {
      if (typeof m === "object" && m.mode) await setMode(page, m.mode);
      await send(page, typeof m === "string" ? m : m.text);
    }
    const alert = await page.getByRole("alert").first().textContent({ timeout: 500 }).catch(() => null);
    const thread = await readThread(page);
    result = check(c, thread);
    if (alert) result.fails.push(`error shown: ${alert.trim()}`);
    result.thread = slim(thread);
    await page.screenshot({ path: path.join(out, `${c.name}.png`) });
  } catch (e) {
    result = { fails: [`run failed: ${e.message.split("\n")[0]}`], calls: [], reply: "" };
    await page.screenshot({ path: path.join(out, `${c.name}.png`) }).catch(() => undefined);
  }
  await context.close();
  const seconds = Math.round((Date.now() - started) / 1000);
  results.push({ name: c.name, pass: result.fails.length === 0, seconds, ...result, pageErrors: errors });
  const r = results.at(-1);
  console.log(`${r.pass ? "PASS" : "FAIL"}  ${c.name.padEnd(24)} ${String(seconds).padStart(4)} s  ${r.calls.join(" ") || "(no tools)"}`);
  for (const f of r.fails) console.log(`      - ${f}`);
}
await browser.close();

const passed = results.filter((r) => r.pass).length;
console.log(`\n${passed}/${results.length} passed. Report: ${path.join(out, "report.json")}`);
fs.writeFileSync(
  path.join(out, "report.json"),
  JSON.stringify({ provider, model: env.AXIOM_EVAL_MODEL || "(default)", effort: env.AXIOM_EVAL_EFFORT || "low", when: new Date().toISOString(), passed, total: results.length, results }, null, 2),
);
process.exit(passed === results.length ? 0 : 1);
