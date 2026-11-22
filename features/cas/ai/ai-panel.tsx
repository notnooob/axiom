// SPDX-License-Identifier: GPL-3.0-or-later
/**
 * The assistant beside the calculator: a drawer from the header button. The
 * calculator stays in view (it moves aside on wide windows), so there's no
 * live view here; AI mode (the expand button) has it.
 */
import { AnimatePresence, motion } from "framer-motion";
import { Maximize2Icon, Settings2Icon, SquarePenIcon, XIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { modelName, modelOf, PROVIDERS, configured } from "./agent";
import { AssistantChat, chatBusy, type Assistant, type DocActions, type DocInfo } from "./assistant";
import { ThreadMenu } from "./thread-list";

export function HeaderAction({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <Tooltip>
      <TooltipTrigger render={<Button variant="ghost" size="icon-sm" aria-label={label} onClick={onClick} />}>{children}</TooltipTrigger>
      <TooltipContent>
        <p>{label}</p>
      </TooltipContent>
    </Tooltip>
  );
}

export function AiPanel({
  open,
  onClose,
  onImmersive,
  onSettings,
  assistant,
  doc,
  info,
}: {
  open: boolean;
  onClose: () => void;
  onImmersive: () => void;
  onSettings: () => void;
  assistant: Assistant;
  doc: DocActions;
  /** The open document: page names in replies link to its pages, and a reply's changes can be undone, while it's this chat's own. */
  info: DocInfo;
}) {
  const { config, chat } = assistant;
  return (
    <AnimatePresence>
      {open && (
        <motion.aside
          aria-label="Assistant"
          // A drawer from the right edge, on a spring so a quick open-and-close reverses from where it is.
          // Opacity runs quicker beside it, and is what's left when the system asks for reduced motion.
          initial={{ opacity: 0, x: "calc(100% + 12px)" }}
          animate={{ opacity: 1, x: 0, transition: { x: { type: "spring", duration: 0.5, bounce: 0 }, opacity: { duration: 0.2, ease: "easeOut" } } }}
          exit={{ opacity: 0, x: "calc(100% + 12px)", transition: { x: { type: "spring", duration: 0.35, bounce: 0 }, opacity: { duration: 0.3, ease: "easeOut" } } }}
          onKeyDown={(e) => {
            if (e.key === "Escape" && !e.defaultPrevented && !chatBusy(chat)) onClose();
          }}
          className="dark fixed inset-y-3 right-3 z-40 flex w-[min(400px,calc(100vw-24px))] flex-col overflow-hidden rounded-3xl border border-white/[0.08] bg-[#141414]/95 font-sans text-foreground shadow-[inset_0_1px_0_0_rgba(255,255,255,0.05),0_4px_24px_-4px_rgba(0,0,0,0.5),0_40px_80px_-32px_rgba(0,0,0,0.8)] backdrop-blur-xl"
        >
          <header className="flex items-center gap-0.5 border-b border-white/[0.06] py-2.5 pr-2 pl-4">
            <div className="mr-auto min-w-0">
              <div className="text-sm font-semibold tracking-[-0.01em]">Assistant</div>
              <div className="truncate text-xs text-muted-foreground">
                {configured(config) ? `${PROVIDERS[config.provider].label} · ${modelName(modelOf(config))}` : "Not set up"}
              </div>
            </div>
            <ThreadMenu assistant={assistant} />
            <HeaderAction label="New chat" onClick={assistant.newChat}>
              <SquarePenIcon />
            </HeaderAction>
            <HeaderAction label="AI mode" onClick={onImmersive}>
              <Maximize2Icon />
            </HeaderAction>
            <HeaderAction label="Assistant settings" onClick={onSettings}>
              <Settings2Icon />
            </HeaderAction>
            <HeaderAction label="Close assistant" onClick={onClose}>
              <XIcon />
            </HeaderAction>
          </header>
          <AssistantChat assistant={assistant} onSettings={onSettings} info={info} doc={doc} />
        </motion.aside>
      )}
    </AnimatePresence>
  );
}
