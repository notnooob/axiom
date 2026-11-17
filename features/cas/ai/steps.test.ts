import { describe, expect, it } from "vitest";
import { groups, moves, type Part } from "./steps";

let n = 0;
const tool = (name: string): Part => ({ type: `tool-${name}`, toolCallId: `${name}-${n++}`, state: "output-available", input: {}, output: "ok" }) as Part;
const think = (text = "hmm"): Part => ({ type: "reasoning", text, state: "done" }) as Part;
const say = (text: string): Part => ({ type: "text", text, state: "done" }) as Part;
const names = (parts: Part[]) => moves(groups(parts)).map((m) => m.items.map((it) => (it.kind === "part" ? (it.part.type === "reasoning" ? "think" : it.part.type.slice(5)) : it.kind)));

describe("moves", () => {
  it("starts a new move when the agent goes to another page after working", () => {
    expect(names([think(), tool("new_document"), tool("calculate"), tool("add_page"), tool("plot_function"), tool("set_window")])).toEqual([
      ["think", "new_document", "calculate"],
      ["add_page", "plot_function", "set_window"],
    ]);
  });

  it("keeps moves in a row together with the work after them", () => {
    expect(names([tool("new_document"), tool("add_page"), tool("plot_function")])).toEqual([["new_document", "add_page", "plot_function"]]);
  });

  it("is one move when the agent never goes anywhere", () => {
    expect(names([tool("get_state"), tool("calculate"), say("Next,"), tool("calculate")])).toEqual([["get_state", "calculate", "text", "calculate"]]);
  });

  it("counts what it said as work, so a page change after it starts a move", () => {
    expect(names([tool("new_document"), say("Now the graph."), tool("add_page"), tool("plot_function")])).toEqual([
      ["new_document", "text"],
      ["add_page", "plot_function"],
    ]);
  });
});
