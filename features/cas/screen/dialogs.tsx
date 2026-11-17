// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 VCE Hub. Part of the /cas calculator: https://github.com/vcehub/cas
/**
 * The shell's smaller pieces around and over the screen: the bar under it
 * (copy, download, clear), the engine's pill, notices, the GPL line, and the
 * dialogs (messages, errors, which sliders to add). Moved out of cas-app.tsx.
 */
import { useEffect, useState, type ReactNode } from "react";
import { Copy, Download, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { GlowButton } from "@/src/components/amicro/glow-button";
import { TextShimmer } from "@/src/components/amicro/text-shimmer";
import { useWebHaptics } from "@/src/hooks/use-web-haptics";
import { cn } from "@/shared/lib/utils";
import type { EngineStatus } from "../engine/client";
import { CheckBox } from "../menus/wizard";
import { download, screenPng } from "./capture";

/** A dialog's button, in place of OK. */
export type Choice = { label: string; run: () => void };

/** This program's source, and Giac's (GPL v3 §5d: an interactive program shows where its source is). */
const CAS_SOURCE = "https://github.com/notnooob/axiom";
const GIAC_SOURCE = "https://www-fourier.univ-grenoble-alpes.fr/~parisse/giac.html";

/** The GPL's notices, kept to one quiet line. */
export function Legal() {
  const link = "underline decoration-neutral-600 underline-offset-2 transition-colors duration-150 hover:text-neutral-200 hover:decoration-neutral-300";
  return (
    <p className="m-0 text-[12px] leading-relaxed text-neutral-500">
      Free software under the{" "}
      <a href="cas/giac/COPYING" className={link}>
        GNU GPL v3
      </a>
      , with no warranty.{" "}
      <a href={CAS_SOURCE} className={link}>
        Source
      </a>
      . Maths by{" "}
      <a href={GIAC_SOURCE} className={link}>
        Giac
      </a>
      . Not affiliated with Texas Instruments. Axiom v{__APP_VERSION__}.
    </p>
  );
}

/**
 * Under the screen: copy or download a picture of it, for worked solutions,
 * and clear everything. The image is 3× the screen's size on the page, so it
 * stays sharp when printed. Copy is the one most used, so it's filled; Clear
 * all sits apart at the far edge, quiet until it asks for the second click
 * (the document is saved and undo doesn't reach it).
 */
export function ScreenBar({ screen, label, onClear }: { screen: () => HTMLElement | null; label: string; onClear: () => void }) {
  const [confirming, setConfirming] = useState(false);
  const { trigger: haptic } = useWebHaptics();
  useEffect(() => {
    if (!confirming) return;
    const t = setTimeout(() => setConfirming(false), 4000);
    return () => clearTimeout(t);
  }, [confirming]);
  const clear = () => {
    if (!confirming) {
      setConfirming(true);
      haptic("warning");
      toast("Every page and variable will go. Click again to clear.");
      return;
    }
    setConfirming(false);
    onClear();
    toast.success("Cleared");
  };
  const take = async () => {
    const el = screen();
    if (!el) throw new Error("No screen");
    return screenPng(el, 3);
  };
  const copy = async () => {
    try {
      const blob = await take();
      await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
      haptic("success");
      toast.success("Copied the screen as an image");
    } catch {
      haptic("error");
      toast.error("Couldn't copy here. Download it instead.");
    }
  };
  const save = async () => {
    try {
      const stamp = new Date().toISOString().slice(0, 19).replace(/[-:]/g, "").replace("T", "-");
      download(await take(), `cas-${label}-${stamp}.png`);
    } catch {
      haptic("error");
      toast.error("Couldn't make the image.");
    }
  };
  return (
    <div className="flex flex-wrap items-center gap-2">
      <GlowButton onClick={() => void copy()}>
        <Copy aria-hidden="true" className="size-4" />
        Copy image
      </GlowButton>
      <GlowButton onClick={() => void save()}>
        <Download aria-hidden="true" className="size-4" />
        {/* Icon only on phones, so the three tools share one row. */}
        <span className="max-sm:sr-only">Download PNG</span>
      </GlowButton>
      <GlowButton
        onClick={clear}
        glowColor={confirming ? "rgba(248, 113, 113, 0.22)" : undefined}
        className={cn("ml-auto", confirming && "border-signalRed/60 text-signalRed hover:border-signalRed hover:text-signalRed")}
      >
        <Trash2 aria-hidden="true" className="size-4" />
        {confirming ? "Clear everything" : "Clear all"}
      </GlowButton>
    </div>
  );
}

const ENGINE_TEXT: Record<EngineStatus, string> = {
  loading: "Loading engine",
  busy: "Working",
  ready: "Engine ready",
  failed: "Engine didn't load. Reload to retry",
};

/** The engine's state, as an amicro pill: Giac is 19 MB, so the first load takes a moment. */
export function EnginePill({ status }: { status: EngineStatus }) {
  const dot = status === "failed" ? "bg-signalRed" : status === "loading" ? "bg-neutral-500" : "bg-emerald-400";
  const text = ENGINE_TEXT[status];
  return (
    <span className="inline-flex h-8 items-center gap-2 rounded-full border border-white/5 bg-[#181818] px-3 text-[12px] font-medium text-neutral-400 shadow-inner">
      <span aria-hidden className={cn("size-1.5 rounded-full transition-colors duration-200", dot)} />
      {status === "loading" || status === "busy" ? <TextShimmer>{text}</TextShimmer> : text}
    </span>
  );
}

export function Notice({ children }: { children: ReactNode }) {
  return (
    <div className="pointer-events-none absolute bottom-[1.5cqw] right-[3.5cqw] text-[2.8cqw] text-casLabel">
      {children}
    </div>
  );
}

/** The handheld's error box: a centred panel with the message and OK. */
export type SliderAsk = { names: string[]; on: boolean[]; focus: number };

/**
 * Create Sliders, after graphing with variables that have no value: a box
 * for each, all ticked. Space or a click ticks and unticks, the arrows move
 * between boxes, Enter is OK.
 */
export function SliderPrompt({
  ask,
  onToggle,
  onAnswer,
}: {
  ask: SliderAsk;
  onToggle: (i: number) => void;
  onAnswer: (yes: boolean) => void;
}) {
  return (
    <div className="absolute inset-0 flex items-center justify-center font-casui text-[3.9cqw]">
      <div className="relative animate-pop">
        <div aria-hidden className="absolute inset-0 translate-x-[0.6cqw] translate-y-[0.6cqw] bg-casRule" />
        <div role="dialog" aria-label="Create Sliders" className="relative border border-casRule bg-casScreen px-[2cqw] py-[1.6cqw]">
          <div className="pb-[2.4cqw] text-[4.3cqw] font-bold">Create Sliders</div>
          <div className="pb-[1.4cqw] text-casLabel">Create a slider for:</div>
          {ask.names.map((n, i) => (
            <button
              key={n}
              type="button"
              tabIndex={-1}
              role="checkbox"
              aria-checked={ask.on[i]}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => onToggle(i)}
              className={cn(
                "mb-[1.2cqw] flex items-center gap-[1.4cqw] border-[0.4cqw] p-[0.6cqw] text-casLabel",
                i === ask.focus ? "border-casSelect" : "border-transparent",
              )}
            >
              <CheckBox on={Boolean(ask.on[i])} />
              {n}
            </button>
          ))}
          <div className="flex justify-end gap-[2cqw] pt-[1cqw]">
            <button
              type="button"
              tabIndex={-1}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => onAnswer(true)}
              className="border-[0.25cqw] border-casRule px-[4.4cqw] py-[1cqw]"
            >
              OK
            </button>
            <button
              type="button"
              tabIndex={-1}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => onAnswer(false)}
              className="px-[2cqw] py-[1cqw]"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * The handheld's Error and Warning boxes: bold title, the message in grey (a
 * blank line between paragraphs), a centred blue OK, the box sized to its
 * text.
 * A long message scrolls between two rules, one under the title and one
 * over the OK.
 */
export function MessageDialog({
  title,
  lines,
  onClose,
  onCancel,
  buttons,
}: {
  title: string;
  lines: string[];
  onClose: () => void;
  onCancel?: () => void;
  /** Choices in place of OK (and Cancel): the first is Enter's. */
  buttons?: Choice[];
}) {
  return (
    <div className="absolute inset-0 flex items-center justify-center bg-casInk/20">
      <div
        role="alertdialog"
        aria-label={title}
        className="flex max-h-[90%] min-w-[40%] max-w-[92%] animate-pop flex-col border border-casInk bg-casScreen font-casui text-[3.3cqw]"
      >
        <div className="px-[2.4cqw] pt-[1.6cqw] text-[3.8cqw] font-bold text-casInk">{title}</div>
        <div className={cn("overflow-y-auto px-[2.4cqw] py-[2cqw] text-casLabel", lines.length > 3 && "mt-[1cqw] border-y border-casRule")}>
          {lines.map((l, i) => (l ? <p key={i}>{l}</p> : <p key={i} aria-hidden className="h-lh" />))}
        </div>
        <div className="flex justify-center gap-[2cqw] py-[1.6cqw]">
          {buttons?.map((b, i) => (
            <button
              key={b.label}
              type="button"
              onClick={b.run}
              className={i === 0 ? "bg-casSelect px-[4cqw] py-[1cqw] text-casScreen" : "border-[0.25cqw] border-casRule px-[3cqw] py-[1cqw] text-casInk"}
            >
              {b.label}
            </button>
          ))}
          {!buttons && (
          <button type="button" onClick={onClose} className="bg-casSelect px-[5cqw] py-[1cqw] text-casScreen">
            OK
          </button>
          )}
          {onCancel && !buttons && (
            <button type="button" onClick={onCancel} className="border-[0.25cqw] border-casRule px-[3cqw] py-[1cqw] text-casInk">
              Cancel
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export function ErrorDialog({ message, onClose }: { message: string; onClose: () => void }) {
  const [title, ...rest] = message.split(": ");
  return <MessageDialog title={title ?? message} lines={[rest.join(": ") || message]} onClose={onClose} />;
}
