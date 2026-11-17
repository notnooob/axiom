// SPDX-License-Identifier: GPL-3.0-or-later
/**
 * WebMCP (W3C Web Machine Learning CG draft): the page offers its tools to
 * agents in the browser through document.modelContext.registerTool. Early
 * Chrome builds put it on navigator.modelContext. Where neither exists,
 * nothing happens; the assistant panel uses the same tools directly.
 */
import { runTool, TOOLS, type AgentHost } from "./tools";

type ModelContext = {
  registerTool(
    tool: {
      name: string;
      title?: string;
      description: string;
      inputSchema?: object;
      execute: (input: Record<string, unknown>) => Promise<unknown>;
      annotations?: { readOnlyHint?: boolean };
    },
    options?: { signal?: AbortSignal },
  ): unknown;
  unregisterTool?(name: string): void;
};

export function modelContext(): ModelContext | undefined {
  return (document as unknown as { modelContext?: ModelContext }).modelContext ?? (navigator as unknown as { modelContext?: ModelContext }).modelContext;
}

/** Register every tool; the returned function takes them back. */
export function registerWebMcp(host: () => AgentHost): () => void {
  const mc = modelContext();
  if (!mc) return () => undefined;
  const stop = new AbortController();
  for (const t of TOOLS) {
    try {
      void Promise.resolve(
        mc.registerTool(
          {
            name: t.name,
            title: t.title,
            description: t.description,
            inputSchema: t.inputSchema,
            annotations: { readOnlyHint: Boolean(t.readOnly) },
            // MCP's result shape: what the draft serialises, and what earlier builds and polyfills expect.
            // A picture (look_at_screen) follows its text as MCP image content.
            execute: async (input) => {
              const r = await runTool(t.name, input ?? {}, host());
              return {
                content: [{ type: "text", text: r.text }, ...(r.image ? [{ type: "image", data: r.image.data, mimeType: r.image.mediaType }] : [])],
                isError: !r.ok,
              };
            },
          },
          { signal: stop.signal },
        ),
      ).catch(() => undefined);
    } catch {
      // A browser that refuses one tool (a name it already has) still gets the rest.
    }
  }
  return () => {
    stop.abort();
    for (const t of TOOLS) mc.unregisterTool?.(t.name);
  };
}
