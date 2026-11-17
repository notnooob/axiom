// SPDX-License-Identifier: GPL-3.0-or-later
/**
 * What earlier turns cost on each request. Every request resends the whole
 * chat, so turns before the latest are slimmed: the calculator state sent
 * with an old message is out of date anyway, old thinking isn't needed
 * again, long tool results are cut to their start, and old screenshots go.
 * The latest turn (the last user message and what follows) is sent whole.
 * Pure: it copies, never changes, the messages it's given.
 */
import { getToolName, isToolUIPart } from "ai";
import type { CalcMessage } from "./agent";
import type { ToolImage } from "./tools";

/** An old screenshot, as the model sees it now. */
export const SCREENSHOT_GONE = "[screenshot from an earlier turn]";
/** Old tool results longer than this are cut to KEEP characters. */
export const LONG = 300;
export const KEEP = 200;

/** look_at_screen's result as it's kept in the chat: its words and the picture. */
export type ScreenOutput = { text: string; image: ToolImage };

export const isScreenOutput = (o: unknown): o is ScreenOutput =>
  typeof o === "object" && o !== null && typeof (o as ScreenOutput).text === "string" && typeof (o as ScreenOutput).image?.data === "string";

export const cutOutput = (text: string) =>
  text.length > LONG ? `${text.slice(0, KEEP)}… (cut from ${text.length} characters; read_page shows the page as it is now)` : text;

export function trimHistory(messages: CalcMessage[]): CalcMessage[] {
  let last = -1;
  messages.forEach((m, i) => {
    if (m.role === "user") last = i;
  });
  return messages.map((m, i) => (i < last ? trimMessage(m) : m));
}

function trimMessage(m: CalcMessage): CalcMessage {
  if (m.role === "user") {
    if (!m.metadata?.context) return m;
    const { context: _dropped, ...rest } = m.metadata;
    return { ...m, metadata: rest };
  }
  if (m.role !== "assistant") return m;
  const parts = m.parts
    .filter((p) => p.type !== "reasoning")
    .map((p) => {
      if (!isToolUIPart(p) || p.state !== "output-available") return p;
      if (getToolName(p) === "look_at_screen" || isScreenOutput(p.output)) return { ...p, output: SCREENSHOT_GONE } as typeof p;
      if (typeof p.output === "string" && p.output.length > LONG) return { ...p, output: cutOutput(p.output) } as typeof p;
      return p;
    });
  return { ...m, parts };
}

/**
 * look_at_screen's result for the model: the words, then the picture (or, from an old turn, just the words).
 * inline false: the service's tool results are text only (OpenAI-compatible), so the picture goes separately (vision.ts).
 */
export function screenModelOutput(output: unknown, { inline = true }: { inline?: boolean } = {}) {
  if (isScreenOutput(output) && !inline) return { type: "text" as const, value: output.text };
  if (isScreenOutput(output))
    return {
      type: "content" as const,
      value: [
        { type: "text" as const, text: output.text },
        { type: "file" as const, mediaType: output.image.mediaType, data: { type: "data" as const, data: output.image.data } },
      ],
    };
  return { type: "text" as const, value: typeof output === "string" ? output : JSON.stringify(output) };
}
