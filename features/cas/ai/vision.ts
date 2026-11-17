// SPDX-License-Identifier: GPL-3.0-or-later
/**
 * Pictures for models that may not read them. OpenRouter and custom
 * endpoints speak OpenAI's chat format, where a tool's result can only be
 * text, so look_at_screen's picture follows the result as a message of its
 * own (injectScreens). Some of those models can't read pictures at all: a
 * request with one fails, so it's sent again without them and the model is
 * remembered as text-only (visionFetch). The screen's description in words
 * goes with every look_at_screen, so a text-only model still knows what's there.
 */
import type { ModelMessage } from "ai";
import type { ToolImage } from "./tools";

/** What a removed picture becomes, so the model knows one was there. */
export const IMAGE_REMOVED = "[An image was here, but this model can't read images.]";

/** A model's entry in AiConfig.vision. */
export const visionKey = (provider: string, model: string) => `${provider}::${model}`;

type ChatBody = { messages?: { content?: unknown }[] } & Record<string, unknown>;
type Part = { type?: string };

const isImagePart = (p: unknown) => typeof p === "object" && p !== null && (p as Part).type === "image_url";

/** An OpenAI chat request without its pictures (each replaced by a line of text). Copies; never changes body. */
export function stripImages(body: ChatBody): { body: ChatBody; removed: number } {
  let removed = 0;
  const messages = (body.messages ?? []).map((m) => {
    if (!Array.isArray(m.content) || !m.content.some(isImagePart)) return m;
    return {
      ...m,
      content: m.content.map((p) => {
        if (!isImagePart(p)) return p;
        removed++;
        return { type: "text", text: IMAGE_REMOVED };
      }),
    };
  });
  return { body: removed ? { ...body, messages } : body, removed };
}

/** A failed request that reads as "this model doesn't take images" (LM Studio, Ollama, vLLM, OpenRouter word it differently). */
export function looksTextOnly(status: number, bodyText: string): boolean {
  if (status < 400) return false;
  return /image|vision|multi-?modal|modalit/i.test(bodyText) && /\bno\b|not|n't|unsupported|invalid|only|cannot|unable/i.test(bodyText);
}

/**
 * fetch for an OpenAI-compatible service: pictures are left out for a model
 * known to be text-only; otherwise a request with pictures that fails because
 * of them is sent once more without them, and onTextOnly remembers the model.
 */
export function visionFetch(opts: { textOnly: () => boolean; onTextOnly: () => void; base?: typeof fetch }): typeof fetch {
  const base = opts.base ?? ((...a: Parameters<typeof fetch>) => globalThis.fetch(...a));
  return async (input, init) => {
    if (typeof init?.body !== "string") return base(input, init);
    let json: ChatBody;
    try {
      json = JSON.parse(init.body) as ChatBody;
    } catch {
      return base(input, init);
    }
    const bare = stripImages(json);
    if (!bare.removed) return base(input, init);
    const without = { ...init, body: JSON.stringify(bare.body) };
    if (opts.textOnly()) return base(input, without);
    const res = await base(input, init);
    if (res.ok) return res;
    const text = await res
      .clone()
      .text()
      .catch(() => "");
    if (!looksTextOnly(res.status, text)) return res;
    opts.onTextOnly();
    return base(input, without);
  };
}

/** The message that carries a look_at_screen picture, after its tool result. */
export const screenNote = (toolCallId: string) => `The screen from look_at_screen (${toolCallId}):`;

/**
 * Each look_at_screen picture in pending, as a student message right after
 * the tool message with its result. Already there (an earlier step put it
 * in), it isn't added again. Copies; never changes messages.
 */
export function injectScreens(messages: ModelMessage[], pending: ReadonlyMap<string, ToolImage>): ModelMessage[] {
  if (!pending.size) return messages;
  const has = new Set(
    messages.flatMap((m) =>
      m.role === "user" && Array.isArray(m.content)
        ? m.content.flatMap((p) => (p.type === "text" ? [...p.text.matchAll(/^The screen from look_at_screen \((.+)\):$/gm)].map((x) => x[1]!) : []))
        : [],
    ),
  );
  const out: ModelMessage[] = [];
  for (const m of messages) {
    out.push(m);
    if (m.role !== "tool") continue;
    for (const part of m.content) {
      if (part.type !== "tool-result") continue;
      const image = pending.get(part.toolCallId);
      if (!image || has.has(part.toolCallId)) continue;
      has.add(part.toolCallId);
      out.push({
        role: "user",
        content: [
          { type: "text", text: screenNote(part.toolCallId) },
          { type: "file", mediaType: image.mediaType, data: image.data },
        ],
      });
    }
  }
  return out;
}
