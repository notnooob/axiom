// SPDX-License-Identifier: GPL-3.0-or-later
import { describe, expect, it } from "vitest";
import { DEFAULT_CONFIG, MAX_STEPS, modelName, modelsFor, preferencesOf, stepsOf } from "./agent";
import { typeKeys, type AgentHost } from "./tools";
import type { Key } from "../keys";

describe("modelName", () => {
  it("reads model ids as people say them", () => {
    expect(modelName("claude-sonnet-5-5")).toBe("Claude Sonnet 5.5");
    expect(modelName("gpt-5-mini")).toBe("GPT-5 mini");
    expect(modelName("gemini-2.5-flash")).toBe("Gemini 2.5 Flash");
    expect(modelName("anthropic/claude-haiku-5-5")).toBe("Claude Haiku 5.5");
    expect(modelName("claude-3-5-sonnet-20241022")).toBe("Claude 3.5 Sonnet 20241022");
  });
});

describe("modelsFor", () => {
  it("offers the suggested models, the chosen one, and listed chat models only", () => {
    const c = { ...DEFAULT_CONFIG, models: { openai: "gpt-5" }, lists: { openai: ["gpt-5", "gpt-5-mini", "text-embedding-3-small", "gpt-4o-realtime"] } };
    expect(modelsFor(c, "openai")).toEqual(["gpt-5", "gpt-5-mini"]);
    expect(modelsFor(DEFAULT_CONFIG, "anthropic")).toContain("claude-opus-5-5");
  });
});

describe("typeKeys", () => {
  it("pastes maths on a Calculator page and sends {keys} as keys", async () => {
    const got: Key[] = [];
    const host = {
      key: (k: Key) => got.push(k),
      snapshot: () => ({ view: "doc", dialog: null, busy: false, engine: "ready", doc: { pages: [{ kind: "calculator" }], active: 0 } }),
    } as unknown as AgentHost;
    await typeKeys(host, "x^2{enter}{approx}");
    expect(got).toEqual([{ k: "paste", text: "x^2" }, { k: "enter" }, { k: "approx" }]);
    await expect(typeKeys(host, "{nope}")).rejects.toThrow(/Unknown key/);
  });
});

describe("stepsOf", () => {
  it("is 40 unless a limit is chosen", () => {
    expect(stepsOf(DEFAULT_CONFIG)).toBe(40);
    expect(MAX_STEPS).toBe(40);
    expect(stepsOf({ ...DEFAULT_CONFIG, steps: 80 })).toBe(80);
    expect(stepsOf({ ...DEFAULT_CONFIG, steps: 7 as never })).toBe(40);
  });
});

describe("preferencesOf", () => {
  it("is nothing by default", () => {
    expect(preferencesOf(DEFAULT_CONFIG)).toBeUndefined();
    expect(preferencesOf({ ...DEFAULT_CONFIG, language: "  ", length: "normal", about: "" })).toBeUndefined();
  });

  it("sends what's set, About me cut to 500 characters", () => {
    expect(preferencesOf({ ...DEFAULT_CONFIG, language: " French ", length: "brief", about: "x".repeat(600) })).toEqual({
      replyLanguage: "French",
      replyLength: "brief",
      aboutStudent: "x".repeat(500),
    });
  });
});
