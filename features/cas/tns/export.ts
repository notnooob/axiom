// SPDX-License-Identifier: GPL-3.0-or-later
/**
 * A document to .tns, mirroring import.ts. Experimental: the XML follows the
 * structure of real documents, but only the user's own handheld can confirm
 * TI's software opens it.
 *   Calculator → TI.Scratchpad rows (typed input, shown result)
 *   Lists      → tabulator columns (name, cells as typed, values)
 *   Python     → TI.PythonEditor + the .py file; Shell → TI.PythonShell
 *   Program Editor → TI.ProgramEditor: the name, its type, its text as last stored, and
 *     the editor's text (r2dtotree, a line a leaf) as it is, stored or not
 *   The problem's functions and programs (Define …=Func/Prgm) → its variables
 *   Two apps side by side (Page Layout 2) → one card holding both, as TI splits a page
 *   Notes → TI.Notepad (r2dtotree): the original card while unedited, else written afresh
 *   Unsupported pages, and imported Graphs and Geometry pages while unedited → their original card XML
 *   Graphs made here → not written yet (their f1… go into the problem's variables)
 */
import type { Settings } from "../engine/evaluate";
import { problemOf, type CasDocument, type Page } from "../state/document";
import { buildTns } from "./encode";
import { definedSources, readDefinition, type Definition } from "../engine/program";
import { notesFmtxt } from "../notes/model";

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const DECL = '<?xml version="1.0" encoding="UTF-8" ?>';
const CARD = '<card clay="0" h1="10000" h2="10000" w1="10000" w2="10000"><isDummyCard>0</isDummyCard><flag>0</flag>';

function documentXml(problems: number, settings: Settings): string {
  const d = new Date();
  return (
    `${DECL}<doc ver="1.0"><properties><product>28</product><platform>1</platform><swver>5.3.0.564 CAS </swver>` +
    `<date>${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}</date></properties><settings><assessmentMode>0</assessmentMode>` +
    `<lastview>1</lastview><readOnlyMode>0</readOnlyMode><lang>en</lang><dfmt>0</dfmt><tfmt>0</tfmt><curr>0</curr><expf>1</expf>` +
    `<ddig>9</ddig><angf>${settings.angle === "deg" ? 2 : 1}</angf><exapp>1</exapp><cplxf>1</cplxf><unit>1</unit><casAndExactMode>1</casAndExactMode>` +
    `<vectf>1</vectf><base>1</base></settings><cardIntendedData><cardIntendedWidth>320</cardIntendedWidth>` +
    `<cardIntendedHeight>217</cardIntendedHeight><cardIntendedDensity>125.000000</cardIntendedDensity></cardIntendedData>` +
    `<rights></rights><nps>${problems}</nps><imgsize>0</imgsize></doc>`
  );
}

function calculatorCard(p: Extract<Page, { kind: "calculator" }>): string {
  const rows = p.history
    .map(
      (h) =>
        `<sp:erow><sp:entr>${esc(h.inputText)}</sp:entr><sp:exct>${esc(h.inputText)}</sp:exct><sp:rslt><sp:warn2>{}</sp:warn2>` +
        `<sp:disp>${esc(h.error ?? h.outputText)}</sp:disp><sp:full>${esc(h.ansText ?? h.outputText)}</sp:full></sp:rslt>` +
        `<sp:ctxt ang="1" cplx="1" comp="1"/></sp:erow>`,
    )
    .join("");
  return `${CARD}<wdgt xmlns:sp="urn:TI.Scratchpad" type="TI.Scratchpad" ver="1.0"><sp:mFlags>0</sp:mFlags><sp:value>0</sp:value>${rows}</wdgt></card>`;
}

const guid = () => Array.from(crypto.getRandomValues(new Uint8Array(16)), (b) => b.toString(16).padStart(2, "0")).join("").toUpperCase();

function listsCard(p: Extract<Page, { kind: "lists" }>): string {
  const cols = p.cols
    .map((c) => {
      const n = Math.max(c.cells.length, c.values?.length ?? 0);
      const cells = Array.from({ length: n }, (_, i) => {
        const typed = c.cells[i] ?? "";
        const value = c.values?.[i] || typed;
        return typed || value ? `<tb:cell><tb:rowId>${i + 1}</tb:rowId><tb:formula>${esc(typed || value)}</tb:formula><tb:data>${esc(value)}</tb:data></tb:cell>` : "";
      }).join("");
      return (
        `<tb:column type="cell-column">${c.name ? `<tb:globalName>${esc(c.name)}</tb:globalName>` : ""}` +
        `<tb:columnWidthNative>70</tb:columnWidthNative><tb:columnWidth>68</tb:columnWidth><tb:columnCharWidth>8.000000</tb:columnCharWidth>` +
        `<tb:columnFlags>0</tb:columnFlags><tb:cells>${cells}</tb:cells></tb:column>`
      );
    })
    .join("");
  return (
    `${CARD}<wdgt xmlns:tb="urn:tabulator" type="tabulator" ver="1.0"><tb:mFlags>1024</tb:mFlags><tb:value>2</tb:value><tb:cry>0</tb:cry>` +
    `<tb:legal>none</tb:legal><tb:schk>false</tb:schk><tb:guid>${guid()}</tb:guid><tb:showingLnS>1</tb:showingLnS>` +
    `<tb:table><tb:rowHeights></tb:rowHeights><tb:columns>${cols}</tb:columns></tb:table></wdgt></card>`
  );
}

/**
 * A function or program as TI keeps its value: the block's lines joined by a
 * carriage return and ":" (written &#13; so the XML keeps it).
 */
const blockXml = (d: Pick<Definition, "kind" | "lines">) => [d.kind, ...d.lines, `End${d.kind}`].map(esc).join("&#13;:");

/**
 * The editor's text as TI's r2dtotree: the Define line (read-only, the name in
 * bold, the parameters between its brackets), then the block's body a line
 * per node. The block's first and last lines aren't text there: the block
 * node stands for them.
 */
function editorTree(source: string): string {
  const lines = source.split("\n");
  const head = /^\s*Define\s+(?:(LibPub|LibPriv)\s+)?([^\s(]+)\s*\(([^)]*)\)/i.exec(lines[0] ?? "");
  const def = `Define${head?.[1] ? ` ${head[1]}` : ""}`;
  const name = head?.[2] ?? "program";
  const kind = /^\s*Func\s*$/i.test(lines[1] ?? "") ? "func" : "prgm";
  const end = lines.map((l) => l.trim()).lastIndexOf(`End${kind === "func" ? "Func" : "Prgm"}`);
  const body = lines.slice(2, end > 1 ? end : lines.length);
  const len = (s: string) => [...s].length;
  const leaf = (s: string) => (s ? `<leaf name="0text" np="1" id0="0" pp0="${len(s)}">${esc(s)}</leaf>` : '<leaf name="0text" np="1" id0="0" pp0="0"/>');
  const hidden = '<leaf name="0text" hide="1" np="1" id0="0" pp0="0"/>';
  const entry = (i: number, style: number, refs: number) =>
    `<formatEntry entryIndex="${i}" entryID="${i}" entryRefCnt="${refs}" tc="0" fc="268435199" fs="11" fst="${style}" cc="0" fest="0" feun="0" fesub="0" fesup="0" fn0="TI-Nspire"></formatEntry>`;
  const rows = (body.length ? body : [""]).map((l) => `<node name="0el" id0="0">${leaf(l)}</node>`).join("");
  const defLine =
    `<node name="0el" id0="0"><leaf name="0text" readonly="1" np="2" id0="0" pp0="${len(def)}" id1="1" pp1="${len(def) + 1 + len(name)}">${esc(`${def} ${name}`)}</leaf>` +
    `<leaf name="0paren" id0="0" readonly="1" data="0">(</leaf>${leaf(head?.[3] ?? "")}<leaf name="0paren" id0="0" readonly="1" data="2147483648">)</leaf>` +
    `<leaf name="0text" readonly="1" np="1" id0="0" pp0="1">=</leaf></node>`;
  return (
    `<r2dtotree version="1"><formatManager tableSize="3" capacity="10">${entry(0, 0, body.length + 8)}${entry(1, 1, 1)}${entry(2, 2, 0)}</formatManager>` +
    `<node name="0el" id0="0">${hidden}<node name="0mlstatement">${defLine}\\:<node name="0el" id0="0">${hidden}<node name="0${kind}" readonly="1">${rows}</node>${hidden}</node></node>${hidden}</node></r2dtotree>`
  );
}

/** A Program Editor page as TI's TI.ProgramEditor card: its name, type, the text as last stored, and the editor's text. */
function programCard(p: Extract<Page, { kind: "program" }>): string {
  let def: Definition | null = null;
  try {
    def = readDefinition(p.stored ?? p.source);
  } catch {
    // Not a definition that reads (it was never stored): written as an empty block of its name.
  }
  const kind = def?.kind ?? (/^\s*Func\s*$/im.test(p.source) ? "Func" : "Prgm");
  const access = def?.access ? `${def.access} ` : "";
  const last = def ? `Define ${access}${esc(def.name)}(${esc(def.params.join(","))})=\n${blockXml(def)}` : "";
  return (
    `${CARD}<wdgt xmlns:pe="urn:TI.ProgramEditor" type="TI.ProgramEditor" ver="1.0"><pe:data><pe:dirty>${p.stored === p.source ? 0 : 1}</pe:dirty>` +
    `<pe:name>${esc(def?.name ?? p.name)}</pe:name><pe:type>${kind}</pe:type><pe:laststoredexpr>${last}</pe:laststoredexpr>` +
    `<pe:editor>${esc(editorTree(p.source))}</pe:editor></pe:data>` +
    `<pe:mFlags>1024</pe:mFlags><pe:value>6</pe:value></wdgt></card>`
  );
}

/** One problem's variables as TI's <sym> entries: named list columns, graphed functions, and functions and programs. */
function symXml(pages: Page[], pending: string[], definitions: string[] = []): string {
  const out: string[] = [];
  // Func…EndFunc as a function (t 6), Prgm…EndPrgm as a program (t 7).
  for (const d of definedSources(definitions).values())
    out.push(`<e t="${d.kind === "Prgm" ? 7 : 6}" f="0" c="0"><n>${esc(d.name)}</n><p>${esc(d.params.join(","))}</p><v>${blockXml(d)}</v></e>`);
  for (const p of pages) {
    if (p.kind === "lists")
      for (const c of p.cols)
        if (c.name) {
          const vals = (c.values?.length ? c.values : c.cells).filter((v) => v !== "");
          out.push(`<e t="1" f="0" c="0"><n>${esc(c.name)}</n><v>{${esc(vals.join(","))}}</v></e>`);
        }
    if (p.kind === "graphs")
      for (const f of p.functions) out.push(`<e t="6" f="0" c="0"><n>f${f.n}</n><p>x</p><v>${esc(f.text)}</v></e>`);
  }
  // Variables imported but never opened here are still TI statements: a:=… and Define f(x)=….
  for (const s of pending) {
    const a = /^([a-zA-Z]\w*):=(.*)$/s.exec(s);
    if (a) out.push(`<e t="3" f="0" c="0"><n>${esc(a[1]!)}</n><v>${esc(a[2]!)}</v></e>`);
    // An imported function or program block goes back as it came (t 6 or 7, its lines joined TI's way).
    let block: Definition | null = null;
    try {
      block = readDefinition(s);
    } catch {
      block = null;
    }
    if (block) {
      out.push(`<e t="${block.kind === "Prgm" ? 7 : 6}" f="0" c="0"><n>${esc(block.name)}</n><p>${esc(block.params.join(","))}</p><v>${blockXml(block)}</v></e>`);
      continue;
    }
    const f = /^Define\s+([a-zA-Z]\w*)\(([^)]*)\)=(.*)$/s.exec(s);
    if (f) out.push(`<e t="6" f="0" c="0"><n>${esc(f[1]!)}</n><p>${esc(f[2]!)}</p><v>${esc(f[3]!)}</v></e>`);
  }
  return `<sym>${out.join("")}</sym>`;
}

/** The apps whose pages can be dropped, as the page names them. */
const APP_LABELS: Partial<Record<Page["kind"], string>> = {
  graphs: "Graphs",
  geometry: "Geometry",
  datastats: "Data & Statistics",
  notes: "Notes",
};

/** dropped: how many pages couldn't be written; droppedKinds: their apps, once each. */
export type ExportResult = { bytes: Uint8Array; dropped: number; droppedKinds: string[] };

/** The warning for pages left out of an export, or null when nothing was. */
export function droppedMessage(r: Pick<ExportResult, "dropped" | "droppedKinds">): string | null {
  if (!r.dropped) return null;
  const kinds = r.droppedKinds.length ? ` (${r.droppedKinds.join(", ")})` : "";
  return `${r.dropped} page${r.dropped === 1 ? "" : "s"} made here can't be written to .tns yet${kinds}; the rest is in the file.`;
}

/** definitions: the engine's definitions for the problem on screen (the others' are kept in doc.problems). */
export function exportTns(doc: CasDocument, settings: Settings, definitions?: string[]): ExportResult {
  const xml = new Map<string, string>();
  const files = new Map<string, Uint8Array>();
  const enc = new TextEncoder();
  const problems = [...new Set(doc.pages.map(problemOf))].sort((a, b) => a - b);
  let dropped = 0;
  const droppedKinds = new Set<string>();
  problems.forEach((n, i) => {
    const pages = doc.pages.filter((p) => problemOf(p) === n);
    const cards: string[] = [];
    /** Which page each card holds, to put two side-by-side apps back on one card. */
    const owner: number[] = [];
    for (const p of pages) {
      const before = cards.length;
      write(p);
      if (cards.length > before) owner[before] = p.id;
    }
    // Two apps side by side (Page Layout 2) go back as one card with both, as TI keeps them.
    for (const g of doc.groups ?? []) {
      if (g.layout !== 2 || g.slots.length !== 2) continue;
      const [a, b] = g.slots.map((id) => owner.indexOf(id ?? -1));
      if (a === undefined || b === undefined || a < 0 || b < 0) continue;
      const app = (c: string) => c.slice(c.indexOf("<wdgt"), c.lastIndexOf("</wdgt>") + "</wdgt>".length);
      cards[a] = `<card clay="1" h1="10000" h2="10000" w1="5000" w2="5000"><isDummyCard>0</isDummyCard><flag>0</flag>${app(cards[a]!)}${app(cards[b]!)}</card>`;
      cards[b] = "";
    }
    function write(p: Page) {
      if (p.kind === "calculator") cards.push(calculatorCard(p));
      else if (p.kind === "lists") cards.push(listsCard(p));
      else if (p.kind === "python") {
        files.set(p.file, enc.encode(p.source));
        cards.push(
          `${CARD}<wdgt xmlns:py="urn:TI.PythonEditor" type="TI.PythonEditor" ver="1.0"><py:data><py:name>${esc(p.file)}</py:name>` +
            `<py:dirf>0</py:dirf></py:data><py:mFlags>1024</py:mFlags><py:value>10</py:value></wdgt></card>`,
        );
      } else if (p.kind === "program") cards.push(programCard(p));
      else if (p.kind === "pyshell")
        cards.push(
          `${CARD}<wdgt xmlns:pysh="urn:TI.PythonShell" type="TI.PythonShell" ver="1.0"><pysh:data><pysh:name>Python Shell</pysh:name>` +
            `</pysh:data><pysh:mFlags>0</pysh:mFlags><pysh:value>11</pysh:value></wdgt></card>`,
        );
      else if ((p.kind === "notes" || p.kind === "unsupported" || p.kind === "graphs" || p.kind === "datastats" || p.kind === "geometry") && p.xml) cards.push(p.xml);
      else if (p.kind === "notes")
        cards.push(
          `${CARD}<wdgt xmlns:np="urn:TI.Notepad" type="TI.Notepad" ver="2.0"><np:mFlags>0</np:mFlags><np:value>3</np:value>` +
            `<np:fmtxt>${esc(notesFmtxt(p.paras))}</np:fmtxt></wdgt></card>`,
        );
      else {
        dropped++;
        droppedKinds.add(APP_LABELS[p.kind] ?? p.kind);
      }
    }
    xml.set(
      `Problem${i + 1}.xml`,
      `${DECL}<prob xmlns="urn:TI.Problem" ver="1.0" pbname="">${symXml(pages, doc.pendingSym?.[String(n)] ?? [], n === problemOf(doc.pages[doc.active]) ? definitions : doc.problems?.[String(n)])}${cards.join("")}</prob>`,
    );
  });
  xml.set("Document.xml", documentXml(problems.length, settings));
  return { bytes: buildTns(xml, files), dropped, droppedKinds: [...droppedKinds] };
}
