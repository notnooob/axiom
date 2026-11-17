// SPDX-License-Identifier: GPL-3.0-or-later
import { describe, expect, it } from "vitest";
import type { CalcMessage } from "./agent";
import { cutOutput, KEEP, screenModelOutput, SCREENSHOT_GONE, trimHistory } from "./history";

const user = (id: string, text: string, context?: string): CalcMessage => ({ id, role: "user", parts: [{ type: "text", text }], ...(context ? { metadata: { context } } : {}) });

const reply = (id: string, output: unknown, tool = "read_page"): CalcMessage =>
  ({
    id,
    role: "assistant",
    parts: [
      { type: "reasoning", text: "Thinking it over", state: "done" },
      { type: `tool-${tool}`, toolCallId: `${id}-call`, state: "output-available", input: {}, output },
      { type: "text", text: "Done", state: "done" },
    ],
  }) as CalcMessage;

const shot = { text: "The calculator screen, page 1.1 Graphs.", image: { data: "iVBORw0KGgo=", mediaType: "image/png" } };

describe("trimHistory", () => {
  const long = "x".repeat(1000);
  const chat = [user("u1", "first", "<calculator_state>old</calculator_state>"), reply("a1", long), user("u2", "second", "<calculator_state>new</calculator_state>"), reply("a2", long)];

  it("sends the latest turn whole", () => {
    const out = trimHistory(chat);
    expect(out[2]).toEqual(chat[2]);
    expect(out[3]).toEqual(chat[3]);
  });

  it("drops old calculator state and old thinking", () => {
    const out = trimHistory(chat);
    expect(out[0]!.metadata?.context).toBeUndefined();
    expect(out[1]!.parts.some((p) => p.type === "reasoning")).toBe(false);
    expect(out[1]!.parts.some((p) => p.type === "text")).toBe(true);
  });

  it("cuts long old tool results", () => {
    const part = trimHistory(chat)[1]!.parts.find((p) => p.type === "tool-read_page") as { output: string };
    expect(part.output.startsWith("x".repeat(KEEP))).toBe(true);
    expect(part.output).toContain("read_page");
    expect(part.output.length).toBeLessThan(300);
    expect(cutOutput("short")).toBe("short");
  });

  it("replaces old screenshots with a line of text", () => {
    const out = trimHistory([user("u1", "look"), reply("a1", shot, "look_at_screen"), user("u2", "again"), reply("a2", shot, "look_at_screen")]);
    expect((out[1]!.parts.find((p) => p.type === "tool-look_at_screen") as { output: unknown }).output).toBe(SCREENSHOT_GONE);
    expect((out[3]!.parts.find((p) => p.type === "tool-look_at_screen") as { output: unknown }).output).toEqual(shot);
  });

  it("doesn't change what it's given", () => {
    const before = JSON.stringify(chat);
    trimHistory(chat);
    expect(JSON.stringify(chat)).toBe(before);
  });

  it("keeps an unanswered ask_user turn whole (the last message is the assistant's)", () => {
    const out = trimHistory([user("u1", "a", "ctx"), reply("a1", long)]);
    expect(out[0]!.metadata?.context).toBe("ctx");
  });
});

describe("screenModelOutput", () => {
  it("gives the model the words and the picture", () => {
    const o = screenModelOutput(shot);
    expect(o.type).toBe("content");
    expect(o.type === "content" && o.value[1]).toMatchObject({ type: "file", mediaType: "image/png", data: { type: "data", data: shot.image.data } });
  });
  it("gives only the words where tool results are text only", () => {
    expect(screenModelOutput(shot, { inline: false })).toEqual({ type: "text", value: shot.text });
  });
  it("gives an old screenshot's placeholder as text", () => {
    expect(screenModelOutput(SCREENSHOT_GONE)).toEqual({ type: "text", value: SCREENSHOT_GONE });
  });
});
