// From amicro (MIT): https://github.com/Subhan-code/Amicro--Micro-transitions- registry/ui/entrance/scale-in.tsx
// Changed: defaults kept inside amicro's own 300ms budget and ease-out curve (was 0.5s with overshoot).
import React from 'react';
import { motion } from 'framer-motion';

interface ScaleInProps {
  children: React.ReactNode;
  duration?: number;
  delay?: number;
  initialScale?: number;
  className?: string;
}

export function ScaleIn({
  children,
  duration = 0.28,
  delay = 0,
  initialScale = 0.97,
  className = '',
}: ScaleInProps) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: initialScale }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration, delay, ease: [0.16, 1, 0.3, 1] }}
      className={className}
    >
      {children}
    </motion.div>
  );
}
