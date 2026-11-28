// SPDX-License-Identifier: GPL-3.0-or-later
/**
 * The Program Editor page: a header with the name (* while it's changed
 * since it was stored) or the last Check Syntax or Store message, and the
 * body line the caret is on of how many; under it the definition, a line at
 * a time, with commands in blue and operators in red as the handheld colours
 * them. The text box types, selects and undoes natively; the keypad's keys
 * and the menu's inserts come in through the shell (`prgEdit` in cas-app).
 */
import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import type { ProgramPage } from "../state/document";
import { lineStatus, nameOf } from "./model";

/** Words the handheld shows in blue: the commands and block words inside (the Define line, Prgm…EndPrgm and the drawing commands stay black). */
const COMMANDS = new Set(
  (
    "Local Return If Then Else ElseIf EndIf For EndFor While EndWhile Loop EndLoop Try EndTry " +
    "ClrErr PassErr Cycle Exit Lbl Goto Stop Disp DispAt Request RequestStr Text Wait Get GetStr Send RefreshProbeVars DelVar Lock unLock"
  ).split(" "),
);

/** One line of the program, coloured. */
function colour(line: string, first: boolean): ReactNode[] {
  if (line.trimStart().startsWith("©")) return [<span key="c" className="text-[#2f8a3a]">{line}</span>];
  const out: ReactNode[] = [];
  const re = /("[^"]*"?)|([A-Za-zÀ-￿][\w.À-￿]*)|([+\-*/^=<>≤≥≠−·]|:=)|(\s+|.)/g;
  let m: RegExpExecArray | null;
  let i = 0;
  let named = false;
  while ((m = re.exec(line))) {
    const [t, str, word, op] = m;
    if (str) out.push(<span key={i++}>{t}</span>);
    else if (word && COMMANDS.has(word)) out.push(<span key={i++} className="text-[#2525e6]">{t}</span>);
    // The Define line's name is bold, as the handheld shows it.
    else if (word && first && !named) {
      named = true;
      out.push(<b key={i++}>{t}</b>);
    } else if (op) out.push(<span key={i++} className="text-[#d6271c]">{t}</span>);
    else out.push(<span key={i++}>{t}</span>);
  }
  return out;
}

export function ProgramEditor({
  page,
  onChange,
  editorRef,
}: {
  page: ProgramPage;
  onChange: (source: string) => void;
  editorRef: (el: HTMLTextAreaElement | null) => void;
}) {
  const [caret, setCaret] = useState(0);
  const back = useRef<HTMLPreElement>(null);
  const box = useRef<HTMLTextAreaElement | null>(null);
  const { line, total } = lineStatus(page.source, caret);
  const changed = page.stored !== undefined ? page.source !== page.stored : true;
  const name = nameOf(page.source) ?? page.name;
  // The caret moves with the shell's edits too (the keypad, the menu's inserts).
  useLayoutEffect(() => {
    if (box.current) setCaret(box.current.selectionStart);
  }, [page.source]);
  const lines = page.source.split("\n");
  const track = () => box.current && setCaret(box.current.selectionStart);
  return (
    <div className="absolute inset-0 flex flex-col bg-casScreen text-casInk">
      <div className="flex shrink-0 items-center justify-between border-b border-casRule px-[2.4cqw] py-[1cqw] font-casui text-[3.6cqw]">
        <span className="truncate">{page.status ?? `${changed && !page.readOnly ? "* " : ""}${name}${page.readOnly ? " (View)" : ""}`}</span>
        <span className="shrink-0 pl-[2cqw]">
          {line}/{total}
        </span>
      </div>
      <div className="relative min-h-0 flex-1 bg-casScreen">
        <pre
          ref={back}
          aria-hidden
          className="pointer-events-none absolute inset-0 m-0 overflow-hidden whitespace-pre px-[1.4cqw] pt-[1cqw] font-casmath text-[calc(3.8cqw*var(--axiom-text,1))] leading-[1.5]"
        >
          {lines.map((l, i) => (
            <div key={i}>{l ? colour(l, i === 0) : "​"}</div>
          ))}
        </pre>
        <textarea
          ref={(el) => {
            box.current = el;
            editorRef(el);
          }}
          data-prg-editor
          value={page.source}
          readOnly={page.readOnly}
          spellCheck={false}
          autoCapitalize="off"
          autoCorrect="off"
          aria-label={`${page.source.split("\n")[1]?.trim() === "Func" ? "Function" : "Program"} ${name}`}
          onChange={(e) => {
            onChange(e.target.value);
            setCaret(e.target.selectionStart);
          }}
          onSelect={track}
          onKeyUp={track}
          onClick={track}
          onScroll={(e) => {
            if (back.current) {
              back.current.scrollTop = e.currentTarget.scrollTop;
              back.current.scrollLeft = e.currentTarget.scrollLeft;
            }
          }}
          className="absolute inset-0 resize-none whitespace-pre bg-transparent px-[1.4cqw] pt-[1cqw] font-casmath text-[calc(3.8cqw*var(--axiom-text,1))] leading-[1.5] text-transparent caret-casInk outline-hidden selection:bg-[#2563eb33]"
        />
      </div>
    </div>
  );
}
