// From amicro (MIT): https://github.com/Subhan-code/Amicro--Micro-transitions- registry/ui/hover/glow-button.tsx
// Changed: passes button props through, merges classes with cn, amicro dark pill styling, 200ms fade.
import React, { useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { cn } from '@/shared/lib/utils';

interface GlowButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  glowColor?: string;
}

export function GlowButton({
  children,
  className,
  glowColor = 'rgba(90, 174, 230, 0.18)', // the keypad's ctrl blue
  type = 'button',
  ...rest
}: GlowButtonProps) {
  const containerRef = useRef<HTMLButtonElement>(null);
  const [coords, setCoords] = useState({ x: 0, y: 0 });
  const [opacity, setOpacity] = useState(0);

  const handleMouseMove = (e: React.MouseEvent<HTMLButtonElement>) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    setCoords({ x: e.clientX - rect.left, y: e.clientY - rect.top });
  };

  return (
    <button
      ref={containerRef}
      type={type}
      onMouseMove={handleMouseMove}
      onMouseEnter={() => setOpacity(1)}
      onMouseLeave={() => setOpacity(0)}
      className={cn(
        'relative inline-flex h-10 cursor-pointer items-center justify-center gap-2 overflow-hidden rounded-full border border-white/[0.07] bg-[#181818] px-4 text-[13px] font-medium text-neutral-300 transition-colors duration-200 hover:border-white/18 hover:text-white focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-focus/70',
        className,
      )}
      {...rest}
    >
      {/* Dynamic Cursor Glow Layer */}
      <motion.div
        aria-hidden
        className="pointer-events-none absolute -inset-px rounded-full transition-opacity duration-200"
        style={{
          opacity,
          background: `radial-gradient(120px circle at ${coords.x}px ${coords.y}px, ${glowColor}, transparent 80%)`,
        }}
      />
      <span className="relative z-10 inline-flex items-center gap-2">{children}</span>
    </button>
  );
}
