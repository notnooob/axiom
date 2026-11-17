// SPDX-License-Identifier: GPL-3.0-or-later
/**
 * A document to .tns, mirroring import.ts. Experimental: the XML follows the
 * structure of real documents, but only the user's own handheld can confirm
 * TI's software opens it.
 *   Calculator → TI.Scratchpad rows (typed input, shown result)
 *   Lists      → tabulator columns (name, cells as typed, values)
 *   Python     → TI.PythonEditor + the .py file; Shell → TI.PythonShell
 *   Notes → TI.Notepad (r2dtotree): the original card while unedited, else written afresh
 *   Unsupported and imported Graphs pages → their original card XML
 *   Graphs made here → not written yet (their f1… go into the problem's variables)
 */
import type { Settings } from "../engine/evaluate";
import { problemOf, type CasDocument, type Page } from "../state/document";
import { buildTns } from "./encode";
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

/** One problem's variables as TI's <sym> entries: named list columns and graphed functions. */
function symXml(pages: Page[], pending: string[]): string {
  const out: string[] = [];
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
  }
  return `<sym>${out.join("")}</sym>`;
}

export type ExportResult = { bytes: Uint8Array; dropped: number };

export function exportTns(doc: CasDocument, settings: Settings): ExportResult {
  const xml = new Map<string, string>();
  const files = new Map<string, Uint8Array>();
  const enc = new TextEncoder();
  const problems = [...new Set(doc.pages.map(problemOf))].sort((a, b) => a - b);
  let dropped = 0;
  problems.forEach((n, i) => {
    const pages = doc.pages.filter((p) => problemOf(p) === n);
    const cards: string[] = [];
    for (const p of pages) {
      if (p.kind === "calculator") cards.push(calculatorCard(p));
      else if (p.kind === "lists") cards.push(listsCard(p));
      else if (p.kind === "python") {
        files.set(p.file, enc.encode(p.source));
        cards.push(
          `${CARD}<wdgt xmlns:py="urn:TI.PythonEditor" type="TI.PythonEditor" ver="1.0"><py:data><py:name>${esc(p.file)}</py:name>` +
            `<py:dirf>0</py:dirf></py:data><py:mFlags>1024</py:mFlags><py:value>10</py:value></wdgt></card>`,
        );
      } else if (p.kind === "pyshell")
        cards.push(
          `${CARD}<wdgt xmlns:pysh="urn:TI.PythonShell" type="TI.PythonShell" ver="1.0"><pysh:data><pysh:name>Python Shell</pysh:name>` +
            `</pysh:data><pysh:mFlags>0</pysh:mFlags><pysh:value>11</pysh:value></wdgt></card>`,
        );
      else if ((p.kind === "notes" || p.kind === "unsupported" || p.kind === "graphs" || p.kind === "datastats") && p.xml) cards.push(p.xml);
      else if (p.kind === "notes")
        cards.push(
          `${CARD}<wdgt xmlns:np="urn:TI.Notepad" type="TI.Notepad" ver="2.0"><np:mFlags>0</np:mFlags><np:value>3</np:value>` +
            `<np:fmtxt>${esc(notesFmtxt(p.paras))}</np:fmtxt></wdgt></card>`,
        );
      else dropped++;
    }
    xml.set(
      `Problem${i + 1}.xml`,
      `${DECL}<prob xmlns="urn:TI.Problem" ver="1.0" pbname="">${symXml(pages, doc.pendingSym?.[String(n)] ?? [])}${cards.join("")}</prob>`,
    );
  });
  xml.set("Document.xml", documentXml(problems.length, settings));
  return { bytes: buildTns(xml, files), dropped };
}
