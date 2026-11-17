// From amicro (MIT): https://github.com/Subhan-code/Amicro--Micro-transitions- registry/ui/loading/text-shimmer.tsx
// Changed: takes its text and classes instead of the fixed "Thinking".
import React from 'react';
import { motion, type TargetAndTransition } from 'framer-motion';
import { cn } from '@/shared/lib/utils';

export const TextShimmer = ({ children, className }: { children: string; className?: string }) => {
  return (
    <div className={cn('relative font-medium text-neutral-500', className)}>
      {children}
      <motion.div
        aria-hidden
        className="absolute inset-0 text-white"
        style={{ WebkitMaskImage: "linear-gradient(90deg, transparent 0%, black 50%, transparent 100%)", WebkitMaskSize: "200% 100%" }}
        // framer-motion's types don't list the prefixed mask property it animates fine.
        animate={{ WebkitMaskPosition: ["100% 0%", "-100% 0%"] } as TargetAndTransition}
        transition={{ duration: 1.5, repeat: Infinity, ease: "linear" }}
      >
        {children}
      </motion.div>
    </div>
  );
};
