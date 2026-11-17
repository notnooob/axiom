// SPDX-License-Identifier: GPL-3.0-or-later
import { describe, expect, it } from "vitest";
import type { ModelMessage } from "ai";
import { IMAGE_REMOVED, injectScreens, looksTextOnly, screenNote, stripImages, visionFetch, visionKey } from "./vision";

const withImage = () => ({
  model: "m",
  messages: [
    { role: "user", content: [{ type: "text", text: "what's this" }, { type: "image_url", image_url: { url: "data:image/png;base64,AAA" } }] },
    { role: "assistant", content: "ok" },
  ],
});

describe("stripImages", () => {
  it("replaces pictures with a line of text, without changing what it's given", () => {
    const body = withImage();
    const before = JSON.stringify(body);
    const r = stripImages(body);
    expect(r.removed).toBe(1);
    expect((r.body.messages![0]!.content as unknown[])[1]).toEqual({ type: "text", text: IMAGE_REMOVED });
    expect(JSON.stringify(body)).toBe(before);
  });
  it("leaves a request with no pictures as it is", () => {
    const body = { messages: [{ role: "user", content: "hi" }] };
    expect(stripImages(body)).toEqual({ body, removed: 0 });
  });
});

describe("looksTextOnly", () => {
  it("knows the ways services say a model can't take images", () => {
    expect(looksTextOnly(400, '{"error":"Model does not support images"}')).toBe(true);
    expect(looksTextOnly(400, "this model doesn't support image input")).toBe(true);
    expect(looksTextOnly(404, "No endpoints found that support image input")).toBe(true);
    expect(looksTextOnly(400, "Invalid API key")).toBe(false);
    expect(looksTextOnly(200, "image not supported")).toBe(false);
    expect(visionKey("custom", "llama3")).toBe("custom::llama3");
  });
});

describe("visionFetch", () => {
  const calls: unknown[] = [];
  const fake = (fail: boolean): typeof fetch =>
    (async (_: unknown, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body));
      calls.push(body);
      const hasImage = JSON.stringify(body).includes("image_url");
      return hasImage && fail ? new Response('{"error":"model does not support image input"}', { status: 400 }) : new Response("ok");
    }) as typeof fetch;

  it("sends again without pictures when they're refused, and remembers the model", async () => {
    calls.length = 0;
    let learnt = false;
    const f = visionFetch({ textOnly: () => false, onTextOnly: () => (learnt = true), base: fake(true) });
    const res = await f("u", { method: "POST", body: JSON.stringify(withImage()) });
    expect(await res.text()).toBe("ok");
    expect(calls).toHaveLength(2);
    expect(JSON.stringify(calls[1])).not.toContain("image_url");
    expect(learnt).toBe(true);
  });
  it("leaves pictures out up front for a model known to be text-only", async () => {
    calls.length = 0;
    const f = visionFetch({ textOnly: () => true, onTextOnly: () => undefined, base: fake(true) });
    await f("u", { method: "POST", body: JSON.stringify(withImage()) });
    expect(calls).toHaveLength(1);
    expect(JSON.stringify(calls[0])).toContain(IMAGE_REMOVED);
  });
  it("keeps pictures for a model that reads them", async () => {
    calls.length = 0;
    let learnt = false;
    const f = visionFetch({ textOnly: () => false, onTextOnly: () => (learnt = true), base: fake(false) });
    await f("u", { method: "POST", body: JSON.stringify(withImage()) });
    expect(calls).toHaveLength(1);
    expect(JSON.stringify(calls[0])).toContain("image_url");
    expect(learnt).toBe(false);
  });
});

describe("injectScreens", () => {
  const msgs: ModelMessage[] = [
    { role: "user", content: "look" },
    { role: "assistant", content: [{ type: "tool-call", toolCallId: "c1", toolName: "look_at_screen", input: {} }] },
    { role: "tool", content: [{ type: "tool-result", toolCallId: "c1", toolName: "look_at_screen", output: { type: "text", value: "The screen…" } }] },
  ];
  const pending = new Map([["c1", { data: "AAA", mediaType: "image/png" as const }]]);

  it("puts the picture right after its tool result, once", () => {
    const once = injectScreens(msgs, pending);
    expect(once).toHaveLength(4);
    expect(once[3]).toMatchObject({ role: "user", content: [{ type: "text", text: screenNote("c1") }, { type: "file", mediaType: "image/png" }] });
    expect(injectScreens(once, pending)).toHaveLength(4);
    expect(msgs).toHaveLength(3);
  });
  it("adds nothing with no pictures waiting", () => {
    expect(injectScreens(msgs, new Map())).toBe(msgs);
  });
});
