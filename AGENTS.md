# AGENTS.md

A map of Axiom for coding agents and new contributors: what the code is, where each thing lives, and the rules that aren't obvious from reading it.

Axiom is a TI-Nspire CX II CAS-style calculator that runs entirely in the browser. It's a static site built with Vite, React 19 and TypeScript. The CAS is Giac, compiled to WebAssembly and running in a worker. Python runs in Pyodide. Documents are stored in IndexedDB, and an optional AI assistant uses the student's own API key. It is GPL-3.0-or-later and derived from VCE Hub's CAS (see [Licence rules](#licence-rules)).

**Read `AGENTS.private.md` too, if it exists** in the repo root. It holds the maintainer's own setup (hosting, deploys, accounts and personal preferences), it isn't in git, and where it adds to or overrides this file, follow it.

## Commands

```bash
npm install
npm run dev       # fetches Giac and copies Pyodide (predev), then Vite on :5173
npm test          # vitest: unit tests, no browser, no Giac
npm run build     # tsc --noEmit, then vite build to dist/ (prebuild fetches Giac)
npm run bench     # every Calculator command through the real engine → docs/cas-benchmark.md
node scripts/check-cas-correctness.mjs --n 40   # random exam-style inputs, answers checked numerically
AXIOM_TNS_CORPUS=path/to/Documents.zip npm test  # .tns tests against your own files (never commit them)
npx vite-node scripts/dump-tns.ts file.tns        # a .tns file's XML, indented, to read how TI stores a page (never commit the output)
AXIOM_EVAL_KEY=… node scripts/ai-eval.mjs        # the assistant on a real model with your key (spends tokens; needs npm run dev)
node scripts/check-offline.mjs                    # the built app offline: Giac and Python from the cache (needs npm run build && npm run preview)
node scripts/make-icons.mjs                       # the install icons (public/*.png) from public/icon.svg; run after changing the icon
```

- **Before handing work back:** run `npx tsc --noEmit` and `npm test`.

## Git and releases

- **Work on `dev`.** Commit and push to `dev`, never to `main`. Create `dev` from `main` if it doesn't exist.
- **`main` is the release branch.** Merge `dev` into `main` and push only when the user says they're ready to release.
- **Releasing:**
  1. Bump `version` in `package.json` on `dev` (semver). The page shows it under the screen ("Axiom v…", `Legal` in `screen/dialogs.tsx`, through `__APP_VERSION__` in `vite.config.ts`). Commit it as `chore(release): vX.Y.Z`.
  2. Merge `dev` into `main` with `--no-ff`, tag it `vX.Y.Z`, and push `main` and the tag.
- **Commit messages follow [Conventional Commits](https://www.conventionalcommits.org/):** `type(scope): summary`, written in the imperative and in lower case, with no full stop at the end.
  - Types: `feat`, `fix`, `perf`, `refactor`, `docs`, `test`, `build`, `ci`, `chore`, `style`, `revert`.
  - Scope is optional and names the area, for example `calculator`, `graphs`, `geometry`, `engine`, `ai`, `tns` or `menus`.
  - Breaking changes get `!` after the type or scope, plus a `BREAKING CHANGE:` footer.
  - Example: `fix(engine): keep 14 digits in decimal mode`.
- **The AI eval** (`scripts/ai-eval.mjs`, cases in `ai-eval-cases.mjs`) drives the app with Playwright: run `npx playwright install chromium` once. Reports go to `eval-out/` (ignored by git).
- **Giac** (`public/cas/giac/1.9.0/`, 19 MB) and **Pyodide** (`public/pyodide/`) aren't in git. `scripts/fetch-giac.mjs` downloads Giac and checks its SHA-256, and `scripts/copy-pyodide.mjs` copies Pyodide from `node_modules`.

## Hard rules

- **No `.tns` files in the repo,** and no XML or content taken from them. These are users' documents and TI's files. Tests use `AXIOM_TNS_CORPUS` pointing at a local zip.
- **Behave like the handheld.** Menus, key sequences, answers, wording and screen layout follow the TI-Nspire CX II CAS. When the handheld does something odd, copy it and say why in a comment. Greyed menu items mark handheld features that aren't built yet, and they keep their place.
- **Menu positions are a contract.** An item's key (1–9, then A–Z) comes from its position, so students' muscle memory ("menu 3 1") depends on it. Never reorder or remove an item to make room; add a greyed placeholder instead (`off(...)` in `menus/types.ts`).
- **Write in our own words.** Help text, syntax lines and warning messages are written fresh, never copied from TI's manuals. TI is a trademark (see NOTICE).
- **Nothing leaves the browser** except calls to the AI provider the student has configured, using their key. There are no analytics and no server.
- **Accessibility.** Screen-reader output goes through `features/cas/a11y.ts` (one live region). Everything the mouse can do should also be possible from the keyboard or keypad.

## Licence rules

- **New files** start with `// SPDX-License-Identifier: GPL-3.0-or-later`.
- **Files that carry `// Copyright (C) 2026 VCE Hub…`** came from VCE Hub's CAS. Keep that line; GPL §4 requires it.
- **Big changes** need a note in `NOTICE.md` → "Axiom's modifications" (§5a): name the app or area there, not individual files.
- **Ported code** (TnsTools, amicro) keeps its own header and its entry in `NOTICE.md`.
- **Personal names** don't go in NOTICE; use "the Axiom contributors".

## Layout

```
index.html, src/main.tsx      entry: fonts, global CSS, <CasApp/>, toasts
src/index.css                 Tailwind v4 theme (cas* colours, fonts, motion)
src/components/amicro/        small motion components ported from amicro (MIT)
features/cas/                 the calculator (almost everything)
components/ui/, components/markdown.tsx, lib/, hooks/
                              shadcn/Base UI components used by the assistant's chat
shared/lib/tokens.ts          colour palette (palette.casInk, casScreen …), one source of hex values
shared/lib/utils.ts           cn() with tailwind-merge set up for our custom text sizes
public/cas/worker.js          the Giac worker; public/_headers: COOP/COEP for static hosts
public/sw.js, src/offline.ts  the service worker (offline cache + COOP/COEP) and its registration;
                              scripts/precache.mjs lists dist/ for it after each build (vite.config.ts)
public/manifest.webmanifest   the installed app: icons, and opening .tns/.py files (cas-app.tsx, launchQueue);
                              src/install.ts holds the browser's install prompt for Legal's Install app
scripts/                      fetch-giac, copy-pyodide, check-cas-correctness
docs/cas-benchmark.md         generated by npm run bench: command parity and menu coverage
assets/readme/                README images
```

The `@/` import alias is the repo root (`vite.config.ts`, `tsconfig.json`).

## `features/cas/`: the calculator

### The shell

| File | What it is |
|---|---|
| `cas-app.tsx` | **The shell** (~3,250 lines). It owns the document, settings, engine, menus, wizards, dialogs, undo, problems and file handling. Every key from the keyboard or keypad goes through `handleKey`, which sends it to the open menu or dialog, or else to the active page. Menu actions arrive in `runAction` (app ids like `geoTool:circle`) and wizard results in `wizardDone` (build strings like `saveas:…`, `geostore:…`). It also builds the `AgentHost` the AI tools use (`agentHost`). Search for those names to find your way around. |
| `keys.ts` | The `Key` union. The keyboard (`keyFromEvent`) and the on-screen keypad produce the same keys, so apps never see raw DOM events. |
| `state/document.ts` | The document model: problems → pages (1.1, 1.2 …), the `Page` union (one variant per app), and `newPage(kind)`. |
| `state/persist.ts` | The Scratchpad in `localStorage`. |
| `state/setup.ts` | Handheld Setup (text size, haptics, keypad layout, start-up, animations) and Make Default's settings for new documents, kept with `pref`. |
| `state/ptt.ts` | Press-to-Test: read once as the page loads (`PTT`); entering and ending it reload the page. While it's on, `files/store.ts` and `state/persist.ts` use their own test storage, `engine/restrict.ts` refuses the switched-off commands in every `evaluate()`, and files can't be brought in. |
| `files/store.ts` | My Documents in IndexedDB. |
| `files/home.tsx`, `files/browse.tsx` | The Home screen and the file browser. |
| `files/share.ts` | Share links: the whole document, deflated, in the URL's `#doc=` fragment (never sent to the server); opened as a new unsaved document. |
| `files/disk.ts` | Writing back to the computer's file the installed app was opened with (a record's `handle`); `public/sw.js` also takes files from the share sheet (`share_target`). |
| `screen/screen.tsx` | The 4:3 screen frame and its top bar. All sizes are in `cqw` units, so the screen scales as one piece. |
| `screen/capture.ts` | PNG screenshots. |
| `screen/dialogs.tsx` | The bar under the screen, the engine pill, notices, the GPL line and the message, error and slider dialogs. |
| `state/undo.ts` | Per-page undo stacks: `recordStep` and `undoStep` (pure, tested). |
| `graphs/definitions.ts` | A Graphs page's curves as engine definitions (`pageDefinitions`). |
| `keypad/keypad.tsx` | The on-screen keypad (our own drawing). |
| `a11y.ts` | What screen readers hear. |

### Menus and dialogs: `menus/`

| File | What it is |
|---|---|
| `types.ts` | Menu tree helpers: `ins` (insert text), `tpl` (a template), `app(label, id)`, `wiz(...)`, `sub`, `off` (greyed), `rule`. |
| `menu.tsx` | Renders and animates menus. `menuKeyPress` handles their keys. |
| `wizard.tsx` | Form dialogs. A wizard's `build` string has `{0}`, `{1}` … filled from its fields. The result either goes into the entry line or, for app-level wizards, is handled in `cas-app.tsx` → `wizardDone`. |
| `dropdown.tsx` | A dialog's dropdown list (wizards and the Finance Solver): ► or a click opens it, ▲▼ and Enter pick, and a long list scrolls or opens upward to stay on screen. |
| `calculator-menu.ts`, `graphs-menu.ts`, `doc-menus.ts` | Each app's menu, plus Ctrl+I/Ctrl+K and Settings. `doc-menus.ts` is the add-page list. |
| `palette.tsx`, `panels.ts` | The templates palette and the keypad's character panels. |

Each other app's menu lives in its own folder: `geometry-menu.ts`, `data-menu.ts`, `lists-menu.ts`, `notes-menu.ts`.

### Maths entry and display: `math/`

- `tree.ts`: the 2D expression tree the entry line edits.
- `cursor.ts`: where the caret sits in that tree.
- `editor.ts`: pure editing functions; template behaviour follows the handheld.
- `ast.ts`: the parser for linear text such as `solve(x^2=2,x)` into an AST.
- `print.ts`: AST back to linear text.
- `render.tsx`: draws the maths in a serif face with stacked fractions and growing brackets.
- `latex.ts`: a row as LaTeX or MathML (Edit ▸ Copy as LaTeX / MathML, and MathML for screen readers in history), and pasted LaTeX turned into linear text (`fromPaste`).
- `builtins.ts`: which names print upright.

### The engine: `engine/`

An entry goes through these steps:

1. `math/ast.ts` parses the typed text.
2. `engine/translate.ts` turns the AST into a Giac command, handling renames, argument order and the commands the handheld has but Giac doesn't. `giac-reserved.ts` gives users back names that Giac reserves.
3. `engine/client.ts` sends it to the worker one command at a time. If a command times out, the worker restarts and replays the definitions.
4. `engine/format.ts` turns Giac's output back into an AST.
5. `engine/canonical.ts` rewrites it into the handheld's normal form, and `decimal.ts` applies the handheld's 14-digit decimal arithmetic.

`engine/evaluate.ts` (~4,300 lines) runs those steps for one entry, including special cases like Define and `|` (with). The statistics commands are in `engine/eval-stats.ts` and the finance ones (and CopyVar) in `engine/eval-finance.ts`. `engine/stats.ts` and `engine/finance.ts` work in plain numbers (regressions, quartiles, TVM, amortisation). `engine/warnings.ts` holds the ⚠ messages.

`benchmark-cases.ts` and `benchmark.test.ts` are the parity benchmark (`npm run bench`); the test is skipped in a normal `npm test`.

**Problems and variables.** All pages in a problem share one set of variables. The engine holds only the active problem's variables. Switching problems saves the current definitions into `doc.problems`, restarts Giac and replays the other problem's definitions (`cas-app.tsx`, the effect on `activeProblem`). `e.remember(cmd)` records a definition so it can be replayed. Anything that defines a variable must call it, the way `notesEvaluate`, `recalcLists` and the stored-Geometry-measurement sync do.

### The apps

Each app has a pure key or click model plus a view, so the logic can be tested without React.

| App | Folder | Model (pure) | View | Notes |
|---|---|---|---|---|
| Calculator | `calculator/` | `calc-keys.ts` | `calculator-app.tsx`, `history.tsx` | Enter returns an effect, which `cas-app.tsx` runs. |
| Graphs | `graphs/` | `graph-keys.ts`, `model.ts` | `graphs-app.tsx`, `sliders.tsx` | `analyze.ts` covers plot samples and Analyze Graph. Functions are `f1(x)…` in the engine. |
| Lists & Spreadsheet | `lists/` | `sheet.ts` | `lists-app.tsx` | A named column becomes a list variable for the problem. |
| Data & Statistics | `data/` | `plot.ts`, `keys.ts` | `data-app.tsx` | Draws plots from the problem's lists. |
| Notes | `notes/` | `model.ts` | `notes-app.tsx` | A contenteditable page with maths boxes evaluated in the problem. |
| Geometry | `geometry/` | `model.ts` | `geometry-app.tsx` | See below. |
| Python | `python/` | n/a | `python-app.tsx` | `runner.ts` and `worker.ts` run Pyodide; `shims.ts` provides TI's `ti_draw`, `ti_system` and the other `ti_*` modules. |
| Finance Solver | `finance/` | `tvm.ts` | `finance-solver.tsx` | A dialog, not a page. |
| Catalog | `catalog/` | `commands.ts` | `catalog.tsx` | The A–Z list with syntax lines in our own words. |

**Geometry (`geometry/model.ts`).**
- **The model:** objects (`GeoObj`) are each defined from earlier objects, and `resolve()` works out every shape in order. Moving a free point therefore moves everything built on it, including transformation images and measurements. Units are cm and degrees.
- **Main functions:**
  - `addSpec()` builds an object from a description; the AI's `construct_geometry` tool uses it.
  - `click()` and `transformWith()` handle pointing with a menu tool. Rotation and Dilation end by asking for a number through a wizard (`geoamount:`).
  - `remove()` removes an object and everything built on it.
  - `describe()` gives the agent's view of the page.
- **The view:** `geometry-app.tsx` draws SVG, handles hit-testing, dragging, panning, wheel zoom and grid snap, and stores the page's view in `page.view`.
- **Stored measurements:** a measurement with a `store` name is synced into the engine as `name:=value` (the `storedGeo` effect in `cas-app.tsx`).

**Undo** (`state/undo.ts` → `recordStep`, `undoStep`; `cas-app.tsx` keeps the stacks) works per page:
- Calculator and Graphs pages undo their entry line and history.
- Geometry pages undo their objects; one drag of a point is one undo step.
- An evaluated line is a wall: undo doesn't go past it, because its definitions are already in the engine.

### `.tns` files: `tns/`

- `container.ts` (ZIP with TI's header), `method13.ts` (TI's encryption) and `tixc.ts` (TI's XML compression) are ported from TnsTools (MIT).
- `decode.ts` and `encode.ts` handle whole files.
- `import.ts` turns a decoded file into a document and `export.ts` does the reverse; export is experimental.
- `geographer.ts` reads TI's Graphs & Geometry card (TI.GeoGrapher) into a Graphs or a Geometry page; objects it can't follow are counted and the student is told. An imported page keeps its card XML (`xml`), written back on export until it's edited.
- **Not yet supported:** Graphs and Geometry pages made in Axiom aren't exported: writing a new GeoGrapher card needs checking against TI's software first.

### A connected handheld: `link/`

A TI-Nspire on a USB cable, through WebUSB (Chromium only), ported from libnspire (see NOTICE.md):
- `wire.ts`: the bytes. The CX II's NNSE messages wrap NavNet packets; the original CX sends NavNet bare. Pure and tested.
- `transport.ts`: one read loop per link (WebUSB reads can't be cancelled) that answers the CX II's handshake and acks and queues the packets.
- `navnet.ts`: a session and its services: list, read, write, move, delete, folders, device info. One request at a time.
- `handheld.ts` opens the device; `manager.ts` keeps the one connection (it reopens a handheld picked before when it's plugged in); `handheld-panel.tsx` is the Handheld dialog.
- A document opened from the handheld lives in `My Documents/Handheld/…` with its record's `calc` path, and Save writes it back (`saveToHandheld` in `cas-app.tsx`).
- `fake-calc.ts` is a simulated CX II for tests. It was written from the same reading of libnspire, so it can't stand in for a real calculator: check changes on a real one.

### The assistant: `ai/`

| File | What it is |
|---|---|
| `tools.ts` | **Every tool** an agent can call (read_page, look_at_screen, calculate, analyze_graph, construct_geometry, run_menu, type_keys …). Tools act through `AgentHost`, which `cas-app.tsx` implements, and work the calculator the way a student would. A tool that returns a picture returns a `Picture`; `look_at_screen` always describes the screen in words (`describeScreen`), and its picture reaches the model in the tool result through the AI SDK's `toModelOutput` (Anthropic, OpenAI, Google) or as a following message (`vision.ts`), and WebMCP as MCP image content. |
| `webmcp.ts` | Registers every entry in `TOOLS` with `document.modelContext`. Adding a tool to `TOOLS` exposes it both to the in-app assistant and to browser agents through WebMCP. |
| `prompt.ts` | The fixed system prompt: when to act versus ask, TI syntax, and reply format. It holds no state so providers can cache it; `contextBlock` adds the current state to each message. |
| `agent.ts` | Model calls through the AI SDK (Anthropic, OpenAI, Google, OpenAI-compatible) using the student's key. Also defines the `ask_user` tool, the 40-step limit (the last step has no tools, and the reply is marked `limit` so the chat offers Continue), and the turn start the chat takes its Undo checkpoint at. |
| `modes.ts` | Solve, Exam, Guide and Check: each mode's tools (`allowedTools`, enforced through `streamText`'s `activeTools`) and its menu text. The mode goes in each message's context, not the prompt. |
| `menu-paths.ts` | Where a command is in the Calculator menu ("menu 3 1 · Algebra ▸ Solve"), from the real menu tree; `calculate` adds it to each result. |
| `highlights.ts` | The `highlight` tool's numbered rings on the student's work (an entry, a cell, a function or point, a Geometry object). They're shell state in `cas-app.tsx`: never saved, exported or undone, cleared each turn, and dropped once what they mark changes (`liveHighlights`). Drawn with `screen/flag.tsx`. |
| `vision.ts` | Pictures for OpenAI-compatible services: `look_at_screen`'s picture follows its text result as a message (`injectScreens`), and `visionFetch` leaves pictures out for a model that can't read them, learning that the first time one is refused (`AiConfig.vision`). |
| `history.ts` | What earlier turns cost: before the latest message, old `<calculator_state>`, thinking and screenshots are dropped and long tool results cut. Pure, tested. |
| `page-links.ts` | Page names in replies ("1.2 Graphs") become links that open the page (`Markdown`'s `onPageLink`). Pure, tested. |
| `assistant.tsx` | The chat UI. Tool steps are folded into "moves" (`steps.ts`). `TOOL_ICONS`, `TOOL_VERBS` and `toolSubject` control how each tool call is shown. |
| `threads.ts`, `thread-list.tsx` | Chat threads in IndexedDB, each with its own document snapshot and, after a turn that changed the calculator, the checkpoint Undo changes goes back to (`DocBinding.checkpoint`/`rollback` in `cas-app.tsx`). |
| `ai-mode.tsx`, `ai-panel.tsx` | The full-page AI mode and the side drawer. |

## Recipes

**Add a page app.** Touch every one of these places, or the app half-works:
1. `state/document.ts`: add the page type, then add it to the `Page` union and `newPage`.
2. `cas-app.tsx`:
   - an `update(kind, fn)` setter like `setGeo`;
   - routing in `handleKey`, `pageTakesEsc`, the menu key and `runAction`;
   - the render branch;
   - the `addPage` and `newDoc` unions, the `/^add(...)$/` regex and its kinds map;
   - `PAGE_APPS`.
3. `menus/doc-menus.ts`: add the entry to the add-page list.
4. `files/home.tsx`: the app icon.
5. `ai/tools.ts`: add the app to `KIND_NAMES`, `pageContent` and `APPS`; also update `AgentHost` if the tools need to change the page.
6. `ai/assistant.tsx`: `APP_NAMES`.
7. `tns/import.ts` and `tns/export.ts`: either support the page or let it fall through as unsupported.

**Add a menu item.** Put it in the app's menu file at the handheld's position; if the handheld has an item you aren't building, add it with `off()`. Give it an `app(label, id)` and handle the id in `runAction`. If it needs input, open a wizard whose `build` string you handle in `wizardDone`.

**Add an AI tool.**
1. Add the tool to `TOOLS` in `ai/tools.ts`: name, description, JSON schema and `run(args, host)`. Errors should say what to do next, and changes should be all or nothing.
2. Mention it in `prompt.ts` if the model needs to know when to use it.
3. Give it an icon, a verb and a subject in `assistant.tsx`.

WebMCP picks it up automatically.

**Add a Calculator command.** Add the translation in `engine/translate.ts` and, if Giac's output differs, the formatting in `engine/format.ts` or `canonical.ts`. Then add the catalog entry in `catalog/commands.ts`, a menu item in `menus/calculator-menu.ts`, and a benchmark case with the handheld's answer.

## Conventions

- **Comments** explain why, in plain English, often by pointing to the handheld ("as the handheld does"). Each file opens with a short comment saying what it is.
- **Pure models and thin views.** Key and click handlers return a new page, or an effect for the shell to run, so they can be tested with vitest without a DOM.
- **React StrictMode is on.** State updaters run twice in development, so updaters must have no side effects. Side effects inside an updater are deferred (`setTimeout(() => onError(...))`), and undo recording guards against the double run.
- **Styling.** Use Tailwind v4 with the theme in `src/index.css`. On the calculator screen use the `cas*` colours and `cqw` units; take hex values from `shared/lib/tokens.ts`.
- **Line endings.** Keep each file's existing line endings; `features/cas/ai/tools.ts` uses CRLF.
- **Tests** sit beside the code (`*.test.ts`). There are no browser tests in the repo; check UI changes by running the app.
