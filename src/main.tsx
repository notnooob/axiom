// SPDX-License-Identifier: GPL-3.0-or-later
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { MotionConfig } from "framer-motion";
import { Toaster } from "sonner";
import "@fontsource-variable/stix-two-text";
import "@fontsource-variable/source-sans-3";
import "@fontsource-variable/outfit";
import "./index.css";
import { CasApp } from "@/features/cas";
import { TooltipProvider } from "@/components/ui/tooltip";
import { registerOffline } from "./offline";
import { listenForInstall } from "./install";

listenForInstall();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    {/* amicro: every animation follows the system's reduced-motion setting. */}
    <MotionConfig reducedMotion="user">
      <TooltipProvider>
      <main className="relative flex min-h-dvh flex-col items-center justify-center px-3 py-5 sm:px-6">
        <h1 className="sr-only">Axiom calculator</h1>
        <CasApp />
      </main>
      <Toaster
        theme="dark"
        position="bottom-center"
        duration={2500}
        toastOptions={{
          className:
            "font-sans! rounded-2xl! border-white/[0.08]! bg-[#1a1a1a]! text-[13px]! text-neutral-100! shadow-[inset_0_1px_0_0_rgba(255,255,255,0.05),0_12px_32px_-12px_rgba(0,0,0,0.7)]!",
        }}
      />
      </TooltipProvider>
    </MotionConfig>
  </StrictMode>,
);

registerOffline();
