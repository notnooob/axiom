// SPDX-License-Identifier: GPL-3.0-or-later
/**
 * AI mode: the calculator steps away and the chat takes the page. While the
 * agent works, its reply shows the calculator's screen live (and hands-off);
 * the document it makes can be saved, downloaded as .tns, or opened in the
 * calculator from here.
 */
import * as React from "react";
import { motion } from "framer-motion";
import { CalculatorIcon, ChevronDownIcon, DownloadIcon, FileIcon, LoaderCircleIcon, PanelLeftIcon, SaveIcon, Settings2Icon, SquarePenIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { AssistantChat, chatBusy, type Assistant, type DocActions, type DocInfo } from "./assistant";
import { HeaderAction } from "./ai-panel";
import { ThreadSidebar } from "./thread-list";


export function AiMode({
  assistant,
  info,
  doc,
  onExit,
  onSettings,
  onLiveSlot,
  onSaveAs,
}: {
  assistant: Assistant;
  info: DocInfo;
  doc: DocActions;
  onExit: () => void;
  onSettings: () => void;
  onLiveSlot: (el: HTMLDivElement | null) => void;
  onSaveAs: (name: string) => Promise<void>;
}) {
  const [naming, setNaming] = React.useState(false);
  const [name, setName] = React.useState("");
  const [saving, setSaving] = React.useState(false);
  // The chat list starts open where there's room for it beside the chat.
  const [chats, setChats] = React.useState(() => window.matchMedia("(min-width: 768px)").matches);
  const { chat } = assistant;
  const busy = chatBusy(chat);
  const save = () => {
    if (info.saved) doc.save();
    else {
      setName(info.title === "Untitled" ? "" : info.title);
      setNaming(true);
    }
  };
  const actions: DocActions = { ...doc, save };
  return (
    <motion.div
      // The page comes forward a touch as it fades in, and steps back faster as it goes. Its content is
      // already in place: one entrance for the whole view, nothing inside it staggers.
      initial={{ opacity: 0, scale: 0.985 }}
      animate={{ opacity: 1, scale: 1, transition: { type: "spring", duration: 0.45, bounce: 0 } }}
      exit={{ opacity: 0, scale: 0.985, transition: { duration: 0.18, ease: [0.23, 1, 0.32, 1] } }}
      className="dark fixed inset-0 z-40 flex flex-col bg-background font-sans text-foreground"
      role="region"
      aria-label="AI mode"
    >
      <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-72 bg-[radial-gradient(40rem_16rem_at_50%_-4rem,rgba(90,174,230,0.10),transparent_70%)]" />
      <header className="relative flex items-center gap-1 px-3 py-3 sm:px-6">
        <HeaderAction label={chats ? "Hide chats" : "Show chats"} onClick={() => setChats((o) => !o)}>
          <PanelLeftIcon />
        </HeaderAction>
        <div className="mr-auto flex items-center gap-2">
          <span className="text-[17px] font-semibold tracking-[-0.019em]">Axiom</span>
          <span className="hidden rounded-full border px-2 py-0.5 text-[11px] font-medium whitespace-nowrap text-muted-foreground sm:inline">AI mode</span>
        </div>
        {info.open && (
          <DropdownMenu>
            <DropdownMenuTrigger render={<Button variant="ghost" size="sm" className="max-w-36 gap-1.5 sm:max-w-56" />}>
              <FileIcon />
              <span className="truncate">
                {info.dirty ? "*" : ""}
                {info.title}
              </span>
              <ChevronDownIcon />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-60">
              <DropdownMenuGroup>
                <DropdownMenuLabel className="truncate">{info.pages.join(" · ") || "No pages yet"}</DropdownMenuLabel>
                <DropdownMenuItem onClick={doc.open}>
                  <CalculatorIcon />
                  Open in the calculator
                </DropdownMenuItem>
                <DropdownMenuItem onClick={save} disabled={busy}>
                  <SaveIcon />
                  {info.saved ? "Save" : "Save to My Documents…"}
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={doc.download}>
                  <DownloadIcon />
                  Download .tns
                </DropdownMenuItem>
              </DropdownMenuGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
        <HeaderAction label="New chat" onClick={assistant.newChat}>
          <SquarePenIcon />
        </HeaderAction>
        <HeaderAction label="Keys and services" onClick={onSettings}>
          <Settings2Icon />
        </HeaderAction>
        <Button variant="outline" size="sm" className="ml-1" onClick={onExit} aria-label="Back to the calculator">
          <CalculatorIcon data-icon="inline-start" />
          <span className="hidden sm:inline">Calculator</span>
        </Button>
      </header>
      <div className="relative flex min-h-0 flex-1">
        <ThreadSidebar assistant={assistant} open={chats} onOpenChange={setChats} />
        <AssistantChat assistant={assistant} immersive onSettings={onSettings} onLiveSlot={onLiveSlot} info={info} doc={actions} className="min-w-0" />
      </div>
      <Dialog open={naming} onOpenChange={setNaming}>
        <DialogContent className="dark sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Save to My Documents</DialogTitle>
            <DialogDescription>It&apos;s kept in this browser, with your other documents.</DialogDescription>
          </DialogHeader>
          <form
            id="ai-save"
            onSubmit={async (e) => {
              e.preventDefault();
              if (!name.trim()) return;
              setSaving(true);
              await onSaveAs(name.trim());
              setSaving(false);
              setNaming(false);
            }}
          >
            <Input autoFocus aria-label="File name" placeholder="File name" value={name} onChange={(e) => setName(e.target.value)} />
          </form>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setNaming(false)}>
              Cancel
            </Button>
            <Button type="submit" form="ai-save" disabled={!name.trim() || saving}>
              {saving && <LoaderCircleIcon className="animate-spin" data-icon="inline-start" />}
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </motion.div>
  );
}
