// SPDX-License-Identifier: GPL-3.0-or-later
/**
 * The assistant's eval cases, for scripts/ai-eval.mjs. Each case is one new
 * chat: its messages are sent in order, and the checks apply to the last
 * turn (the last message and the reply to it).
 *
 * Checks (all optional):
 * - calls: tools the last turn must call (any order).
 * - notCalls: tools the last turn mustn't call.
 * - asks: true if the last turn must end waiting on ask_user.
 * - answer: a regex, or a list of them, the reply's text must match.
 * - notAnswer: a regex the reply's text must not match.
 * - noProseQuestion: the reply mustn't ask the student something in its text (that belongs in ask_user).
 * - pages: a regex the chat's document's page kinds ("calculator,graphs") must match.
 * - endsCleanly: the reply ends in words, or paused at the step limit (never silently mid-task).
 * mode: the mode the case starts in (solve, exam, guide, check). A message
 * can be { text, mode } to switch modes before it, as the student would.
 */
/** Tools that change the calculator: Guide and Check never call them. */
const CHANGES = ["calculate", "plot_function", "set_window", "set_list", "configure_data_stats", "python", "write_notes", "construct_geometry", "add_page", "select_page", "new_document", "save_document", "open_document", "close_document", "navigate", "run_menu", "respond_to_dialog", "type_keys", "analyze_graph"];

export const CASES = [
  {
    name: "practice-questions",
    messages: ["Give me three practice questions on the chain rule, with worked answers."],
    checks: { answer: /chain rule|\\frac\{d|d\/dx|derivative/i, noProseQuestion: true },
  },
  {
    name: "make-up-and-choose",
    messages: ["Make up a few probability questions and I'll pick one to work through."],
    checks: { asks: true, noProseQuestion: true },
  },
  {
    name: "plain-solve",
    messages: ["Solve x^2 - 5x + 6 = 0."],
    checks: { calls: ["calculate"], answer: [/x\s*=\s*2/, /x\s*=\s*3/], pages: /calculator/, noProseQuestion: true },
  },
  {
    name: "unsaved-then-close",
    messages: [
      "Start a new document, work out 2+3 on a Calculator page, and save it as evalone.",
      "Now work out 7*6 on that page too. Don't save it.",
      "Close this document.",
    ],
    checks: { asks: true },
  },
  {
    name: "geometry-triangle",
    messages: ["Triangle ABC has AB = 7 cm, BC = 5 cm and angle B = 60°. Construct it and find AC."],
    checks: { calls: ["construct_geometry"], answer: /6\.2[45]|\\sqrt\{39\}|√\s*39/, pages: /geometry/ },
  },
  {
    name: "reflect-and-store",
    messages: [
      "Draw the triangle A(1,1), B(4,1), C(2,3) on a Geometry page, reflect it in the y-axis, and store the area of the image as ar. Then work out 2*ar on a Calculator page.",
    ],
    checks: { calls: ["construct_geometry", "calculate"], answer: /\b6(\.0+)?\b/, pages: /geometry.*calculator|calculator.*geometry/ },
  },
  {
    name: "sketch-turning-points",
    messages: ["Sketch y = x^3 - 3x and find its turning points."],
    checks: { calls: ["plot_function", "analyze_graph"], answer: [/-1,\s*2\b/, /\b1,\s*-2\b/], pages: /graphs/ },
  },
  {
    name: "show-that",
    messages: ["Show that the derivative of x^2 ln(x) is x(2 ln(x) + 1)."],
    checks: { answer: /as required|hence shown|shown/i, noProseQuestion: true },
  },
  {
    name: "tech-free",
    messages: ["Tech-free question (no calculator): solve 2^(2x) - 5*2^x + 4 = 0."],
    checks: { answer: [/x\s*=\s*0/, /x\s*=\s*2/, /2\^x|2\^\{x\}|u\s*=|let/i] },
  },
  {
    name: "regression-from-table",
    messages: [
      "Here's my data.\nhours: 1, 2, 3, 4, 5, 6\nscore: 52, 55, 61, 64, 70, 73\nFit a least-squares line for score against hours.",
    ],
    checks: { calls: ["set_list"], answer: [/4\.37/, /47\.2/] },
  },
  {
    name: "guide-no-answer",
    mode: "guide",
    messages: ["How do I find the area under y = x^2 from x = 0 to x = 3?"],
    checks: { notAnswer: /=\s*9\b|\b9\s*(square\s*)?units/i },
  },
  {
    name: "study-notes",
    messages: ["Make me study notes on finding the stationary points of a cubic, using y = x^3 - 6x^2 + 9x as the example."],
    checks: { calls: ["write_notes"], pages: /notes/ },
  },
  {
    name: "degrees",
    messages: ["In degrees, find the acute angle θ with tan θ = 1/√3."],
    checks: { answer: /30\s*°|30\^\\circ|30\^\{\\circ\}|30 degrees/i, noProseQuestion: true },
  },
  {
    name: "impossible-request",
    messages: ["Draw a 3D graph of z = x^2 + y^2."],
    checks: { answer: /(isn't|is not|aren't|not yet) (available|built|supported)|can't|cannot|doesn't (have|support)|not available/i },
  },
  {
    name: "exam-binomial",
    mode: "exam",
    messages: ["X ~ Bi(12, 0.3). Find P(X ≥ 5) correct to 4 decimal places."],
    checks: { calls: ["calculate"], notCalls: ["evaluate", "python"], answer: [/0\.2763/, /menu\s*5\s*5/i, /on paper/i] },
  },
  {
    name: "check-my-work",
    messages: [
      "Start a new document and type exactly these Calculator entries for me, without correcting them: expand((x-3)^2), then x^2-6x-9→myans",
      { mode: "check", text: "Check my work: is myans the expansion of (x-3)^2?" },
    ],
    checks: { calls: ["highlight"], notCalls: CHANGES, answer: /\+\s*9|sign|constant/i },
  },
  {
    name: "guide-no-changes",
    messages: [{ mode: "guide", text: "I want to find the turning points of y = x^3 - 12x myself. Where do I start?" }],
    checks: { notCalls: CHANGES, notAnswer: /\(\s*2\s*,\s*-16\s*\)/ },
  },
  {
    name: "long-task",
    messages: [
      "Make one document with five pages: Calculator, Graphs, Lists & Spreadsheet, Notes and Geometry. On each, do something small that shows what that app is for, then sum up what's on each page.",
    ],
    checks: { endsCleanly: true },
  },
];
