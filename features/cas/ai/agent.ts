// SPDX-License-Identifier: GPL-3.0-or-later
/**
 * The assistant's model calls, straight from the browser with the user's own
 * key, through the AI SDK: Anthropic, OpenAI, Google, or any OpenAI-compatible
 * endpoint (OpenRouter, a local server). The reply streams (text, thinking,
 * tool calls) into useChat through CalcTransport, and the tools run here, on
 * the calculator, between steps.
 */
import { createAnthropic } from "@ai-sdk/anthropic";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createOpenAI } from "@ai-sdk/openai";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import {
  APICallError,
  convertToModelMessages,
  generateText,
  jsonSchema,
  stepCountIs,
  streamText,
  tool,
  type ChatTransport,
  type JSONSchema7,
  type LanguageModel,
  type UIMessage,
  type UIMessageChunk,
} from "ai";
import { screenModelOutput, trimHistory } from "./history";
import { allowedTools, modeOf, restrictToReadOnly, type Mode } from "./modes";
import { SYSTEM_PROMPT } from "./prompt";
import { runTool, TOOLS, type AgentHost, type ToolImage } from "./tools";
import { injectScreens, visionFetch, visionKey } from "./vision";

export type ProviderId = "anthropic" | "openai" | "gemini" | "openrouter" | "custom";
export type Effort = "off" | "low" | "medium" | "high";

export const PROVIDERS: Record<ProviderId, { label: string; base: string; model: string; suggested: string[]; keyUrl?: string }> = {
  anthropic: {
    label: "Anthropic",
    base: "https://api.anthropic.com/v1",
    model: "claude-sonnet-5-5",
    suggested: ["claude-opus-5-5", "claude-sonnet-5-5", "claude-haiku-5-5"],
    keyUrl: "https://console.anthropic.com/settings/keys",
  },
  openai: { label: "OpenAI", base: "https://api.openai.com/v1", model: "gpt-5", suggested: [], keyUrl: "https://platform.openai.com/api-keys" },
  gemini: { label: "Google", base: "https://generativelanguage.googleapis.com/v1beta", model: "gemini-2.5-flash", suggested: [], keyUrl: "https://aistudio.google.com/apikey" },
  openrouter: { label: "OpenRouter", base: "https://openrouter.ai/api/v1", model: "openrouter/auto", suggested: [], keyUrl: "https://openrouter.ai/keys" },
  custom: { label: "Custom", base: "", model: "", suggested: [] },
};

export type AiConfig = {
  provider: ProviderId;
  keys: Partial<Record<ProviderId, string>>;
  /** The model chosen for each service. */
  models: Partial<Record<ProviderId, string>>;
  /** Models the key can use, as each service listed them. */
  lists?: Partial<Record<ProviderId, string[]>>;
  /** The custom endpoint's base URL, e.g. http://localhost:11434/v1. */
  baseUrl: string;
  effort?: Effort;
  /** How much the assistant does for the student (modes.ts); sent with each message, so the prompt stays cached. */
  mode?: Mode;
  /** Whether a model reads images, by visionKey: false leaves pictures out; unset tries them and learns. */
  vision?: Record<string, boolean>;
  /** Older settings: tutor mode, now Guide (modeOf). */
  tutor?: boolean;
  // Behaviour (the settings dialog's second half). Unset means the default, so older settings still load.
  /** Reply in this language; unset follows the student's own messages. */
  language?: string;
  length?: ReplyLength;
  /** Standing notes from the student about themselves and how they like answers. */
  about?: string;
  /** false: only tools that look (and highlight, ask_user), in every mode. */
  canEdit?: boolean;
  /** false: look_at_screen sends its words only, never the picture. */
  pictures?: boolean;
  steps?: StepLimit;
  /** false: the tools aren't offered to browser agents through WebMCP. */
  webmcp?: boolean;
};

export type ReplyLength = "brief" | "normal" | "detailed";
export const STEP_LIMITS = [20, 40, 80] as const;
export type StepLimit = (typeof STEP_LIMITS)[number];
/** Longest About me kept and sent. */
export const ABOUT_MAX = 500;

export const DEFAULT_CONFIG: AiConfig = { provider: "anthropic", keys: {}, models: {}, baseUrl: "", effort: "low", mode: "solve" };

/** Services whose tool results can hold a picture. OpenRouter and custom endpoints speak OpenAI's chat format, where they're text. */
export const inlineImages = (c: AiConfig) => c.provider === "anthropic" || c.provider === "openai" || c.provider === "gemini";

/** Whether to send the model pictures: not when it's known (or set) not to read them. */
export const readsImages = (c: AiConfig) => c.vision?.[visionKey(c.provider, modelOf(c))] !== false;

export const modelOf = (c: AiConfig, p: ProviderId = c.provider) => c.models[p] || PROVIDERS[p].model;
export const baseOf = (c: AiConfig, p: ProviderId = c.provider) => (p === "custom" ? c.baseUrl : PROVIDERS[p].base).replace(/\/+$/, "");
/** A service that can be used: a key (a custom endpoint may not need one), and for custom a URL and model. */
export const usable = (c: AiConfig, p: ProviderId) => (p === "custom" ? Boolean(c.baseUrl && modelOf(c, p)) : Boolean(c.keys[p]));
export const configured = (c: AiConfig) => usable(c, c.provider) && Boolean(modelOf(c));

/** "claude-sonnet-5-5" → "Claude Sonnet 5.5", "gpt-5-mini" → "GPT-5 mini", "gemini-2.5-flash" → "Gemini 2.5 Flash". */
export function modelName(id: string): string {
  const bare = id.replace(/^.*\//, "");
  if (/^gpt-/i.test(bare)) {
    const [v, ...rest] = bare.slice(4).split("-");
    return [`GPT-${v}`, ...rest].join(" ");
  }
  if (/^o\d/.test(bare)) return bare.replace(/-/g, " ");
  return bare
    .replace(/(\b\d)-(\d\b)/g, "$1.$2")
    .split("-")
    .map((w) => (/^[a-z]/.test(w) ? w[0]!.toUpperCase() + w.slice(1) : w))
    .join(" ");
}

/** The models the selector offers for a service: the suggested ones, the chosen one, and those its key listed that can chat. */
export function modelsFor(c: AiConfig, p: ProviderId): string[] {
  const listed = (c.lists?.[p] ?? []).filter((id) =>
    p === "openai" ? /^(gpt-|o\d|chatgpt)/.test(id) && !/(audio|realtime|transcribe|tts|image|search|embedding)/.test(id) : p === "gemini" ? /gemini/.test(id) && !/(embedding|image|tts|live)/.test(id) : true,
  );
  return [...new Set([...PROVIDERS[p].suggested, modelOf(c, p), ...listed])].filter(Boolean);
}

/** The models a key can use, for the selector. Empty if the service won't list them. */
export async function listModels(c: AiConfig, p: ProviderId): Promise<string[]> {
  const key = c.keys[p] ?? "";
  const headers: Record<string, string> =
    p === "anthropic"
      ? { "x-api-key": key, "anthropic-version": "2023-06-01", "anthropic-dangerous-direct-browser-access": "true" }
      : p === "gemini"
        ? { "x-goog-api-key": key }
        : key
          ? { authorization: `Bearer ${key}` }
          : {};
  try {
    const res = await fetch(`${baseOf(c, p)}/models${p === "anthropic" ? "?limit=100" : ""}`, { headers });
    if (!res.ok) return [];
    const j = (await res.json()) as { data?: { id: string }[]; models?: { name: string; supportedGenerationMethods?: string[] }[] };
    const ids =
      j.data?.map((m) => m.id) ??
      j.models?.filter((m) => !m.supportedGenerationMethods || m.supportedGenerationMethods.includes("generateContent")).map((m) => m.name.replace(/^models\//, "")) ??
      [];
    return ids.sort();
  } catch {
    return [];
  }
}

/** onTextOnly: the model turned out not to read images (a request with one failed because of it). */
function modelFor(c: AiConfig, hooks: { onTextOnly?: () => void } = {}): LanguageModel {
  const key = c.keys[c.provider] ?? "";
  const id = modelOf(c);
  switch (c.provider) {
    case "anthropic":
      return createAnthropic({ apiKey: key, headers: { "anthropic-dangerous-direct-browser-access": "true" } })(id);
    case "openai":
      return createOpenAI({ apiKey: key })(id);
    case "gemini":
      return createGoogleGenerativeAI({ apiKey: key })(id);
    default:
      return createOpenAICompatible({
        name: c.provider,
        baseURL: baseOf(c),
        ...(key ? { apiKey: key } : {}),
        // Pictures are left out for a model that can't read them, and found out the first time one is refused.
        fetch: visionFetch({ textOnly: () => !readsImages(c), onTextOnly: () => hooks.onTextOnly?.() }),
      })(id);
  }
}

/** Thinking at the chosen effort, with its summary shown where the service keeps it hidden by default. */
type ProviderOptions = NonNullable<Parameters<typeof streamText>[0]["providerOptions"]>;
function thinking(c: AiConfig): { reasoning: "none" | "low" | "medium" | "high"; providerOptions: ProviderOptions } {
  const effort = c.effort ?? "low";
  if (effort === "off") return { reasoning: "none" as const, providerOptions: {} };
  return {
    reasoning: effort,
    providerOptions: {
      anthropic: { thinking: { type: "adaptive", display: "summarized" } },
      openai: { reasoningSummary: "auto" },
      google: { thinkingConfig: { includeThoughts: true } },
    },
  };
}

/** A failed request, as one readable line: the service's own message, not a stack. */
export function errorText(e: unknown): string {
  if (typeof navigator !== "undefined" && navigator.onLine === false) return "You're offline. The assistant needs the internet; everything else still works.";
  if (APICallError.isInstance(e)) {
    let msg = e.message;
    try {
      const j = JSON.parse(e.responseBody ?? "") as { error?: { message?: string } | string; message?: string };
      msg = (typeof j.error === "string" ? j.error : j.error?.message) ?? j.message ?? msg;
    } catch {
      // Not JSON: the SDK's message says enough.
    }
    return `${e.statusCode ?? ""} ${msg}`.trim();
  }
  const m = e instanceof Error ? e.message : String(e);
  return /failed to fetch|networkerror/i.test(m)
    ? "Couldn't reach the service. Check the URL, your connection, and that it accepts requests from web pages (CORS)."
    : m;
}

/** context: the calculator's state sent with a student's message; mode: the mode it was sent in; limit: the reply stopped at the step limit (the number; true in older chats, MAX_STEPS). */
export type CalcMessage = UIMessage<{ context?: string; mode?: Mode; limit?: boolean | number }>;

export const MAX_STEPS = 40;
/** What the Behaviour settings ask of each reply, sent in the message's context (never the prompt, which stays cached); nothing when all are default. */
export function preferencesOf(c: AiConfig): { replyLanguage?: string; replyLength?: ReplyLength; aboutStudent?: string } | undefined {
  const replyLanguage = c.language?.trim();
  const aboutStudent = c.about?.trim().slice(0, ABOUT_MAX);
  const replyLength = c.length && c.length !== "normal" ? c.length : undefined;
  const out = { ...(replyLanguage ? { replyLanguage } : {}), ...(replyLength ? { replyLength } : {}), ...(aboutStudent ? { aboutStudent } : {}) };
  return Object.keys(out).length ? out : undefined;
}

/** Steps per reply, as the settings say. */
export const stepsOf = (c: AiConfig): number => (STEP_LIMITS.includes(c.steps as StepLimit) ? c.steps! : MAX_STEPS);
const MAX_RESULT = 20000;

/** Tools that only look; the rest change the calculator, which makes the open document the chat's own. */
const LOOKS = new Set(TOOLS.filter((t) => t.readOnly).map((t) => t.name));

export type AskUserInput = { question: string; options?: string[]; allowFreeText?: boolean };

/**
 * A question only the student can answer, asked in the chat (not offered
 * through WebMCP). No execute: the turn stops until they answer, and their
 * answer (addToolOutput) sends it on.
 */
const askUser = tool({
  description:
    "The only way to ask the student something and wait for their answer: it shows the question with buttons, and their choice comes back as this tool's result. Use it whenever you need their choice or information before you can go on: picking from options you offer (including when they asked you to give them options), a decision about their work (save or discard unsaved changes, overwrite a file), or a fact only they know. Up to 4 options, each short enough to read at a glance but specific (\"Turning points of x⁴ − 4x³\", not \"Option a\"); allowFreeText when they might want something else. Never put a question for the student in your reply text instead, and don't ask about things you can sensibly decide yourself.",
  inputSchema: jsonSchema<AskUserInput>({
    type: "object",
    properties: {
      question: { type: "string" },
      options: { type: "array", items: { type: "string" }, maxItems: 4 },
      allowFreeText: { type: "boolean" },
    },
    required: ["question", "options", "allowFreeText"],
  }),
});

/** A short title for a chat from its first message, by the configured model. Throws on failure. */
export async function titleFor(config: AiConfig, text: string, abortSignal?: AbortSignal): Promise<string> {
  const { text: title } = await generateText({
    model: modelFor(config),
    system: "You name chats. Reply with a title of at most 6 words for the user's message: no quotes, no full stop, nothing else.",
    prompt: text.slice(0, 2000),
    maxOutputTokens: 24,
    abortSignal,
  });
  return title;
}

/**
 * useChat's transport, without a server: each request streams from the
 * service the user picked, and the calculator's tools run in this page. The
 * calculator's state goes with each message the student sends (its metadata),
 * so the model always sees what's on screen.
 */
export class CalcTransport implements ChatTransport<CalcMessage> {
  /**
   * claim: the agent has changed the calculator, so its open document now belongs to this chat.
   * turnStart: the student sent a message (not an answer to ask_user), so a turn begins; its id.
   * onTextOnly: the model refused a picture; remember it as text-only.
   */
  constructor(
    private readonly get: () => {
      config: AiConfig;
      host: () => AgentHost;
      claim?: () => void;
      turnStart?: (userMessage: string) => void;
      onTextOnly?: () => void;
    },
  ) {}

  async sendMessages({ messages, abortSignal }: Parameters<ChatTransport<CalcMessage>["sendMessages"]>[0]): Promise<ReadableStream<UIMessageChunk>> {
    const { config, host, claim, turnStart, onTextOnly } = this.get();
    const last = messages.at(-1);
    if (last?.role === "user") turnStart?.(last.id);
    const inline = inlineImages(config);
    // Pictures for OpenAI-compatible services, by tool call: they follow the tool's text result as a message (vision.ts).
    const pending = new Map<string, ToolImage>();
    const tools = Object.fromEntries([
      ...TOOLS.map((t) => [
        t.name,
        tool({
          description: t.description,
          inputSchema: jsonSchema<Record<string, unknown>>(t.inputSchema as JSONSchema7),
          execute: async (input, options): Promise<unknown> => {
            const ran = await runTool(t.name, input ?? {}, host());
            // Send pictures of the screen off: the words only, wherever the picture would have gone.
            const r = config.pictures === false ? { ...ran, image: undefined } : ran;
            if (!LOOKS.has(t.name)) claim?.();
            if (!r.ok) throw new Error(r.text.replace(/^Error: /, ""));
            const text = r.text.length > MAX_RESULT ? `${r.text.slice(0, MAX_RESULT)}… (cut)` : r.text;
            if (r.image && !inline && readsImages(config)) pending.set(options.toolCallId, r.image);
            return r.image ? { text, image: r.image } : text;
          },
          // The picture goes in the tool's result where the service takes one; elsewhere the result is the screen in words.
          ...(t.name === "look_at_screen" ? { toModelOutput: ({ output }: { output: unknown }) => screenModelOutput(output, { inline }) } : {}),
        }),
      ]),
      ["ask_user", askUser],
    ]);
    // Only the mode's tools (modes.ts): Guide and Check never change the calculator, Exam keeps to what a student would use.
    const every = [...TOOLS, { name: "ask_user", readOnly: true }];
    // "Let the assistant change the calculator" off: looking only, whatever the mode.
    const byMode = allowedTools(modeOf(config), every);
    const allowed = config.canEdit === false ? restrictToReadOnly(byMode, every) : byMode;
    const limit = stepsOf(config);
    // Earlier turns slimmed (history.ts), then each student message led by the calculator's state sent with it.
    const withContext = trimHistory(messages).map((m) =>
      m.role === "user" && m.metadata?.context ? { ...m, parts: [{ type: "text" as const, text: m.metadata.context }, ...m.parts] } : m,
    );
    const modelMessages = await convertToModelMessages(withContext, { tools, ignoreIncompleteToolCalls: true });
    // The chat so far is the same for every step of this turn: cached after the first (Anthropic).
    const end = modelMessages.at(-1);
    if (end) end.providerOptions = { ...end.providerOptions, anthropic: { ...end.providerOptions?.anthropic, cacheControl: { type: "ephemeral" } } };
    const { reasoning, providerOptions } = thinking(config);
    let steps = 0;
    const result = streamText({
      model: modelFor(config, { onTextOnly }),
      // The prompt and tools are the same every step: cached after the first (Anthropic).
      instructions: { role: "system", content: SYSTEM_PROMPT, providerOptions: { anthropic: { cacheControl: { type: "ephemeral" } } } },
      messages: modelMessages,
      tools,
      activeTools: allowed,
      stopWhen: stepCountIs(limit),
      prepareStep: ({ stepNumber, messages: now }) => ({
        // The last step allowed has no tools, so the turn ends in words (what's done, what's left), not mid-task in silence.
        ...(stepNumber === limit - 1 ? { toolChoice: "none" as const } : {}),
        // A picture from look_at_screen, as a message after its result (injectScreens adds each once).
        ...(pending.size ? { messages: injectScreens(now, pending) } : {}),
      }),
      onStepEnd: () => {
        steps++;
      },
      abortSignal,
      reasoning,
      providerOptions,
    });
    return result.toUIMessageStream({
      sendReasoning: true,
      onError: errorText,
      // Stopped by the limit: the chat offers Continue.
      messageMetadata: ({ part }) => (part.type === "finish" && steps >= limit ? { limit } : undefined),
    });
  }

  async reconnectToStream(): Promise<ReadableStream<UIMessageChunk> | null> {
    return null;
  }
}
