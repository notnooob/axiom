// SPDX-License-Identifier: GPL-3.0-or-later
/** How an assistant turn's parts are laid out: grouped into steps and answer, and the steps cut into moves. */
import { getToolName, isToolUIPart } from "ai";
import type { CalcMessage } from "./agent";

export type Part = CalcMessage["parts"][number];
export type ToolPart = Extract<Part, { toolCallId: string }>;
export type Group = { kind: "steps"; parts: Part[] } | { kind: "text"; text: string; streaming: boolean } | { kind: "ask"; part: ToolPart };

/** An assistant turn's parts in order, with runs of thinking and tool steps grouped into one Trace, and its questions on their own. */
export function groups(parts: Part[]): Group[] {
  const out: Group[] = [];
  for (const p of parts) {
    if (isToolUIPart(p) && getToolName(p) === "ask_user") out.push({ kind: "ask", part: p });
    else if (p.type === "reasoning" || isToolUIPart(p)) {
      if (p.type === "reasoning" && !p.text.trim() && p.state !== "streaming") continue;
      const last = out.at(-1);
      if (last?.kind === "steps") last.parts.push(p);
      else out.push({ kind: "steps", parts: [p] });
    } else if (p.type === "text" && p.text.trim()) out.push({ kind: "text", text: p.text, streaming: p.state === "streaming" });
  }
  return out;
}

/** Tools that move the agent somewhere new (a document, a page): each starts a new move. */
export const MOVES = new Set(["new_document", "open_document", "add_page", "select_page", "navigate", "close_document"]);

export type StepItem = { key: string } & ({ kind: "part"; part: Part } | { kind: "text"; text: string; streaming: boolean } | { kind: "ask"; part: ToolPart });
export type Move = { key: string; items: StepItem[] };

const isMove = (it: StepItem) => it.kind === "part" && isToolUIPart(it.part) && MOVES.has(getToolName(it.part));

/** A turn's steps cut into moves: a move ends where the agent goes to another document or page, once it has done something where it was. */
export function moves(steps: Group[]): Move[] {
  const items: StepItem[] = steps.flatMap((g, i): StepItem[] =>
    g.kind === "steps"
      ? g.parts.map((p, j) => ({ kind: "part" as const, part: p, key: isToolUIPart(p) ? p.toolCallId : `${i}.${j}` }))
      : g.kind === "ask"
        ? [{ kind: "ask", part: g.part, key: g.part.toolCallId }]
        : [{ kind: "text", text: g.text, streaming: g.streaming, key: `${i}` }],
  );
  const out: Move[] = [];
  for (const it of items) {
    const last = out.at(-1);
    // Thinking, and moves in a row (start a document, add a page), belong with the work that follows them.
    const worked = last?.items.some((x) => x.kind !== "part" || (isToolUIPart(x.part) && !isMove(x)));
    if (!last || (isMove(it) && worked)) out.push({ key: it.key, items: [it] });
    else last.items.push(it);
  }
  return out;
}
